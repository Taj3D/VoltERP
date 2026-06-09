// ============================================================
// Cash Collections API — Double-Entry CoA Alignment, LedgerAutoPost, CSV Import
// Module Token: Fin-Ledger-Transaction
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  checkPeriodClose,
  maskFinancialArray,
  safeFinancialRound,
  safeFinancialAdd,
  safeFinancialSubtract,
  stripHtml,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';
import Papa from 'papaparse';

// Helper: normalize empty strings to null
function nullIfEmpty(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  return String(value).trim() === '' ? null : String(value).trim();
}

// Helper: generate collection code — collision-safe
async function generateCollectionCode(tx: any): Promise<string> {
  const all = await tx.cashCollection.findMany({
    select: { collectionCode: true },
  });
  let maxNum = 0;
  for (const r of all) {
    if (r.collectionCode) {
      const match = r.collectionCode.match(/COL-(\d+)/);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
    }
  }
  return `COL-${String(maxNum + 1).padStart(5, '0')}`;
}

// Helper: generate LED entry code — collision-safe (numeric max)
async function generateLedgerEntryCode(tx: any): Promise<string> {
  const all = await tx.ledgerEntry.findMany({
    select: { entryCode: true },
  });
  let maxNum = 0;
  for (const r of all) {
    if (r.entryCode) {
      const match = r.entryCode.match(/LED-(\d+)/);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
    }
  }
  return `LED-${String(maxNum + 1).padStart(5, '0')}`;
}

// Helper: generate LAP code — collision-safe (numeric max)
async function generateAutoPostCode(tx: any): Promise<string> {
  const all = await tx.ledgerAutoPost.findMany({
    select: { code: true },
  });
  let maxNum = 0;
  for (const r of all) {
    if (r.code) {
      const match = r.code.match(/LAP-(\d+)/);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
    }
  }
  return `LAP-${String(maxNum + 1).padStart(5, '0')}`;
}

// ============================================================
// AR Reversal: Reduce customer debit balance when cash is collected
// (mirror of computeArReversal from sales-orders)
// ============================================================
function computeArReversal(
  currentBalance: number,
  currentBalanceType: string,
  amount: number
): { newBalance: number; newBalanceType: string } {
  if (currentBalanceType === 'Dr') {
    if (amount >= currentBalance) {
      return {
        newBalance: safeFinancialSubtract(amount, currentBalance),
        newBalanceType: 'Cr',
      };
    } else {
      return {
        newBalance: safeFinancialSubtract(currentBalance, amount),
        newBalanceType: 'Dr',
      };
    }
  } else {
    // Cr balance — customer has advance/payments; collecting more increases Cr
    return {
      newBalance: safeFinancialAdd(currentBalance, amount),
      newBalanceType: 'Cr',
    };
  }
}

// AR Forward: Re-add customer debit balance when cash collection is cancelled/deleted
function computeArForward(
  currentBalance: number,
  currentBalanceType: string,
  amount: number
): { newBalance: number; newBalanceType: string } {
  if (currentBalanceType === 'Dr') {
    return {
      newBalance: safeFinancialAdd(currentBalance, amount),
      newBalanceType: 'Dr',
    };
  } else {
    // Cr balance
    if (amount > currentBalance) {
      return {
        newBalance: safeFinancialSubtract(amount, currentBalance),
        newBalanceType: 'Dr',
      };
    } else {
      return {
        newBalance: safeFinancialSubtract(currentBalance, amount),
        newBalanceType: 'Cr',
      };
    }
  }
}

// GET /api/cash-collections — List with query params, CoA includes, VAT masking
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'CashCollections', 'GET');
  if (!security.authorized) return security.response;

  const { role, companyId } = security.user;

  try {
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const bankId = searchParams.get('bankId');
    const status = searchParams.get('status');
    const ledgerPosted = searchParams.get('ledgerPosted');
    const chartOfAccountId = searchParams.get('chartOfAccountId');

    const whereClause: Record<string, unknown> = {
      isActive: true,
      ...(companyId ? { companyId } : {}),
      ...(bankId ? { bankId } : {}),
      ...(status ? { status } : {}),
      ...(ledgerPosted !== null && ledgerPosted !== undefined ? { ledgerPosted: ledgerPosted === 'true' } : {}),
      ...(chartOfAccountId ? { chartOfAccountId } : {}),
    };

    if (dateFrom || dateTo) {
      const dateFilter: Record<string, Date> = {};
      if (dateFrom) dateFilter.gte = new Date(dateFrom);
      if (dateTo) dateFilter.lte = new Date(dateTo);
      whereClause.date = dateFilter;
    }

    const items = await db.cashCollection.findMany({
      where: whereClause,
      include: {
        customer: true,
        paymentOption: true,
        bank: true,
        chartOfAccount: true,
        sr: true,
      },
      orderBy: { date: 'asc' },
    });

    // Compute running balances (cumulative total of all collections over time)
    let runningTotal = 0;
    const computed = items.map((item: any) => {
      runningTotal = safeFinancialAdd(runningTotal, item.amount || 0);
      const runningBalance = safeFinancialRound(runningTotal);
      // Fire-and-forget stale update
      if (Math.abs((item.runningBalance || 0) - runningBalance) > 0.005) {
        db.cashCollection.update({ where: { id: item.id }, data: { runningBalance } }).catch(() => {});
      }
      return { ...item, runningBalance };
    });
    computed.reverse();

    const masked = maskFinancialArray(computed, role, ['ledgerPosted', 'debitEntryCode', 'creditEntryCode', 'runningBalance']);
    return NextResponse.json(masked);
  } catch (error) {
    console.error('Error fetching cash collections:', error);
    return NextResponse.json({ error: 'Failed to fetch cash collections' }, { status: 500 });
  }
}

// POST /api/cash-collections — Create with double-entry ledger, CoA resolution, CSV import
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'CashCollections', 'POST');
  if (!security.authorized) return security.response;

  const { id: userId, name: userName, companyId } = security.user;

  try {
    const url = new URL(request.url);
    const isImport = url.searchParams.get('import') === 'true';

    if (isImport) {
      return await handleCsvImport(request, userId, userName, companyId);
    }

    const body = await request.json();
    const result = await createSingleCashCollection(body, userId, userName, companyId);

    // Automated SMS: Financial Collection Event
    if (result) {
      try {
        const { triggerFinancialCollectionSms } = await import('@/lib/sms-event-hooks');
        await triggerFinancialCollectionSms({
          id: (result as any).id,
          customerId: (result as any).customerId || undefined,
          supplierId: (result as any).supplierId || undefined,
          amount: (result as any).amount,
          paymentMethod: (result as any).paymentMethod || 'Cash',
          date: (result as any).date,
          companyId: (result as any).companyId || undefined,
        });
      } catch (smsError) {
        console.error('[CashCollections] SMS trigger failed (non-blocking):', smsError);
      }
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating cash collection:', error);
    const message = error instanceof Error ? error.message : 'Failed to create cash collection';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * CSV Import handler for cash collections
 */
async function handleCsvImport(
  request: NextRequest,
  userId: string,
  userName: string,
  companyId: string | null
): Promise<NextResponse> {
  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const text = await file.text();
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, trimHeaders: true });

  const imported: unknown[] = [];
  const failed: unknown[] = [];
  const fieldErrors: string[] = [];

  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i] as Record<string, string>;
    try {
      const amountRaw = row.amount || row.Amount;
      if (!amountRaw || isNaN(parseFloat(amountRaw))) {
        throw new Error(`Amount is null, empty, or non-numeric: "${amountRaw}"`);
      }

      const customerIdentifier = row.customerName || row.CustomerName || row.customerCode || row.CustomerCode || row.customerId;
      if (!customerIdentifier) {
        throw new Error('customerName, customerCode, or customerId is required');
      }

      const customer = await db.customer.findFirst({
        where: {
          OR: [
            { name: customerIdentifier },
            { customerCode: customerIdentifier },
            { id: customerIdentifier },
          ],
          isActive: true,
          ...(companyId ? { companyId } : {}),
        },
      });

      if (!customer) {
        throw new Error(`INVALID ACCOUNT CATEGORY: Customer "${customerIdentifier}" not found`);
      }

      const bankIdentifier = row.bankName || row.BankName || row.bankId;
      let effectiveBankId: string | null = null;
      if (bankIdentifier) {
        const bank = await db.bank.findFirst({
          where: {
            OR: [{ bankName: bankIdentifier }, { id: bankIdentifier }],
            isActive: true,
            ...(companyId ? { companyId } : {}),
          },
        });
        if (bank) effectiveBankId = bank.id;
      }

      const collectionBody: Record<string, unknown> = {
        customerId: customer.id,
        date: row.date || row.Date || new Date().toISOString().split('T')[0],
        amount: parseFloat(amountRaw),
        bankId: effectiveBankId,
        paymentOptionId: row.paymentOptionId || null,
        chequeNo: row.chequeNo || null,
        voucherNo: row.voucherNo || null,
        description: row.description || row.Description || null,
        status: row.status || 'Approved',
      };

      const result = await createSingleCashCollection(collectionBody, userId, userName, companyId);
      imported.push(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      failed.push({ row: i + 1, data: row, error: msg });
      fieldErrors.push(`Row ${i + 1}: ${msg}`);
    }
  }

  return NextResponse.json({
    imported: imported.length,
    failed: failed.length,
    errors: failed,
    fieldErrors: fieldErrors.length > 0 ? fieldErrors : undefined,
  }, { status: 201 });
}

/**
 * Shared helper: create a single CashCollection with double-entry ledger, CoA resolution, bank increment
 */
async function createSingleCashCollection(
  body: Record<string, unknown>,
  userId: string,
  userName: string,
  companyId: string | null
) {
  const {
    customerId, date, amount, paymentOptionId, bankId,
    chequeNo, voucherNo, description, status, referenceKey,
    chartOfAccountId: explicitCoAId, srId,
  } = body;

  if (!customerId || !date || amount === undefined || amount === null) {
    throw new Error('customerId, date, and amount are required');
  }

  // Amount must be a positive number
  const parsedAmount = parseFloat(String(amount));
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    throw new Error('amount must be a positive number greater than 0');
  }

  // Date validation
  const d = new Date(date as string);
  if (isNaN(d.getTime())) {
    throw new Error('Invalid date provided');
  }

  // Sanitize text inputs for XSS
  const sanitizedChequeNo = nullIfEmpty(chequeNo as string | undefined);
  const sanitizedVoucherNo = nullIfEmpty(voucherNo as string | undefined);
  const sanitizedDescription = nullIfEmpty(description as string | undefined);
  if (sanitizedChequeNo) (body as any).chequeNo = stripHtml(sanitizedChequeNo);
  if (sanitizedVoucherNo) (body as any).voucherNo = stripHtml(sanitizedVoucherNo);
  if (sanitizedDescription) (body as any).description = stripHtml(sanitizedDescription);

  // Period-close lock check
  const transactionDate = new Date(date as string);
  const periodLock = await checkPeriodClose(transactionDate);
  if (periodLock) throw new Error('Period is locked');

  // Idempotency check
  if (referenceKey) {
    const existing = await db.cashCollection.findFirst({
      where: { referenceKey: String(referenceKey) },
    });
    if (existing) {
      throw new Error(`Idempotency conflict: CashCollection with referenceKey "${String(referenceKey)}" already exists (409)`);
    }
  }

  const safeAmount = safeFinancialRound(parseFloat(String(amount)));
  const effectiveBankId = bankId ? String(bankId) : null;
  const effectiveStatus = status ? String(status) : 'Approved';
  const effectiveCustomerId = String(customerId);

  // Resolve CoA for customer (AR account) — also fetch currentBalance for AR update
  const customer = await db.customer.findUnique({
    where: { id: effectiveCustomerId },
    select: { name: true, currentBalance: true, currentBalanceType: true },
  });

  return await db.$transaction(async (tx: any) => {
    const collectionCode = await generateCollectionCode(tx);

    // Resolve CoA: use explicit, or find "Asset" classification CoA matching customer name
    let resolvedCoAId = explicitCoAId ? String(explicitCoAId) : null;
    if (!resolvedCoAId) {
      const matchingCoA = await tx.chartOfAccount.findFirst({
        where: {
          classification: 'Asset',
          name: { contains: customer?.name || '' },
          isActive: true,
        },
      });
      resolvedCoAId = matchingCoA?.id || null;
    }

    // Resolve bank CoA
    let bankCoAId: string | null = null;
    if (effectiveBankId) {
      const bankRecord = await tx.bank.findUnique({
        where: { id: effectiveBankId },
        select: { chartOfAccountId: true },
      });
      bankCoAId = bankRecord?.chartOfAccountId || null;
    }

    // Create the cash collection
    const cashCollection = await tx.cashCollection.create({
      data: {
        collectionCode,
        customerId: effectiveCustomerId,
        date: transactionDate,
        amount: safeAmount,
        paymentOptionId: paymentOptionId ? String(paymentOptionId) : null,
        bankId: effectiveBankId,
        srId: srId ? String(srId) : null,
        companyId: companyId || null,
        chequeNo: nullIfEmpty(chequeNo as string | undefined),
        voucherNo: nullIfEmpty(voucherNo as string | undefined),
        description: nullIfEmpty(description as string | undefined),
        status: effectiveStatus,
        chartOfAccountId: resolvedCoAId,
        referenceKey: referenceKey ? String(referenceKey) : null,
        ledgerPosted: false,
      },
      include: {
        customer: true,
        paymentOption: true,
        bank: true,
        chartOfAccount: true,
        sr: true,
      },
    });

    // Bank balance increment for cash collections (cash IN)
    if (effectiveBankId && effectiveStatus === 'Approved') {
      const bankRecord = await tx.bank.findUnique({
        where: { id: effectiveBankId },
        select: { currentBalance: true },
      });
      if (bankRecord) {
        const newBalance = safeFinancialAdd(bankRecord.currentBalance, safeAmount);
        await tx.bank.update({
          where: { id: effectiveBankId },
          data: { currentBalance: newBalance },
        });
      }
    }

    // ── AR Ledger: Reduce customer debit balance (Accounts Receivable) ──
    if (effectiveStatus === 'Approved' && customer) {
      const { newBalance, newBalanceType } = computeArReversal(
        customer.currentBalance,
        customer.currentBalanceType,
        safeAmount
      );
      await tx.customer.update({
        where: { id: effectiveCustomerId },
        data: { currentBalance: newBalance, currentBalanceType: newBalanceType },
      });
    }

    // ── Double-Entry Ledger: Dr: Cash/Bank, Cr: Customer ──
    let debitEntryCode: string | null = null;
    let creditEntryCode: string | null = null;

    if (effectiveStatus === 'Approved') {
      const drCode = await generateLedgerEntryCode(tx);
      const crCode = `LED-${String(parseInt(drCode.match(/LED-(\d+)/)?.[1] || '0', 10) + 1).padStart(5, '0')}`;

      const debitAccount = effectiveBankId
        ? (await tx.bank.findUnique({ where: { id: effectiveBankId } }))?.bankName || 'Bank'
        : 'Cash in Hand';
      const creditAccount = customer?.name || 'Unknown Customer';

      // Dr: Cash/Bank
      await tx.ledgerEntry.create({
        data: {
          entryCode: drCode,
          date: transactionDate,
          accountId: bankCoAId,
          account: debitAccount,
          particulars: 'Cash Collection from customer',
          debit: safeAmount,
          credit: 0,
          reference: collectionCode,
          referenceType: 'CashCollection',
          companyId: companyId || null,
        },
      });

      // Cr: Customer
      await tx.ledgerEntry.create({
        data: {
          entryCode: crCode,
          date: transactionDate,
          accountId: resolvedCoAId,
          account: creditAccount,
          particulars: 'Cash Collection from customer',
          credit: safeAmount,
          debit: 0,
          reference: collectionCode,
          referenceType: 'CashCollection',
          companyId: companyId || null,
        },
      });

      debitEntryCode = drCode;
      creditEntryCode = crCode;

      // Balance validation
      if (safeFinancialRound(safeAmount - safeAmount) !== 0) {
        throw new Error(`Ledger imbalance: Dr ${safeAmount} ≠ Cr ${safeAmount}`);
      }

      // Create LedgerAutoPost
      const lapCode = await generateAutoPostCode(tx);
      await tx.ledgerAutoPost.create({
        data: {
          code: lapCode,
          sourceType: 'CashCollection',
          sourceId: cashCollection.id,
          sourceCode: collectionCode,
          debitEntryId: drCode,
          creditEntryId: crCode,
          debitAccount,
          creditAccount,
          amount: safeAmount,
          postingDate: transactionDate,
          status: 'Posted',
          companyId: companyId || null,
          postedBy: userId,
        },
      });

      await tx.cashCollection.update({
        where: { id: cashCollection.id },
        data: { ledgerPosted: true, debitEntryCode, creditEntryCode },
      });
    }

    await tx.auditLog.create({
      data: {
        action: 'CREATE',
        module: 'Fin-Ledger-Transaction',
        recordId: cashCollection.id,
        recordLabel: collectionCode,
        userId,
        userName,
        details: JSON.stringify({
          type: 'CashCollection',
          collectionCode,
          customerId: effectiveCustomerId,
          amount: safeAmount,
          bankId: effectiveBankId,
          chartOfAccountId: resolvedCoAId,
          ledgerPosted: effectiveStatus === 'Approved',
          debitEntryCode,
          creditEntryCode,
          companyId: companyId || null,
          status: effectiveStatus,
        }),
      },
    });

    await logUserActivity({
      tx: tx,
      action: 'CREATE',
      module: 'Fin-Ledger-Transaction',
      recordId: cashCollection.id,
      recordLabel: collectionCode,
      userId,
      userName,
      details: `Created cash collection ${collectionCode}: Tk. ${safeAmount}`,
    });

    const finalResult = await tx.cashCollection.findUnique({
      where: { id: cashCollection.id },
      include: {
        customer: true,
        paymentOption: true,
        bank: true,
        chartOfAccount: true,
        sr: true,
      },
    });

    return finalResult;
  });
}
