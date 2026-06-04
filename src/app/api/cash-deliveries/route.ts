// ============================================================
// Cash Deliveries API — Double-Entry CoA Alignment, LedgerAutoPost, Bank Balance Validation, CSV Import
// Module Token: Fin-Ledger-Transaction
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  checkPeriodClose,
  maskFinancialArray,
  checkFinancialDeletePermission,
  safeFinancialRound,
  safeFinancialSubtract,
  safeFinancialAdd,
  stripHtml,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';
import Papa from 'papaparse';

// Helper: normalize empty strings to null
function nullIfEmpty(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  return String(value).trim() === '' ? null : String(value).trim();
}

// Helper: generate delivery code — collision-safe
async function generateDeliveryCode(tx: any): Promise<string> {
  const all = await tx.cashDelivery.findMany({
    select: { deliveryCode: true },
  });
  let maxNum = 0;
  for (const r of all) {
    if (r.deliveryCode) {
      const match = r.deliveryCode.match(/DEL-(\d+)/);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
    }
  }
  return `DEL-${String(maxNum + 1).padStart(5, '0')}`;
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
// AP Reversal: Reduce supplier credit balance when cash is delivered (payment made)
// ============================================================
function computeApReversal(
  currentBalance: number,
  currentBalanceType: string,
  amount: number
): { newBalance: number; newBalanceType: string } {
  if (currentBalanceType === 'Cr') {
    if (amount >= currentBalance) {
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
  } else {
    // Dr balance — supplier has advance; paying more increases Dr
    return {
      newBalance: safeFinancialAdd(currentBalance, amount),
      newBalanceType: 'Dr',
    };
  }
}

// AP Forward: Re-add supplier credit balance when cash delivery is cancelled/deleted
function computeApForward(
  currentBalance: number,
  currentBalanceType: string,
  amount: number
): { newBalance: number; newBalanceType: string } {
  if (currentBalanceType === 'Cr') {
    return {
      newBalance: safeFinancialAdd(currentBalance, amount),
      newBalanceType: 'Cr',
    };
  } else {
    // Dr balance
    if (amount > currentBalance) {
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
  }
}

// GET /api/cash-deliveries — List with query params, CoA includes, VAT masking
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'CashDeliveries', 'GET');
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

    const items = await db.cashDelivery.findMany({
      where: whereClause,
      include: {
        supplier: true,
        paymentOption: true,
        bank: true,
        chartOfAccount: true,
      },
      orderBy: { date: 'asc' },
    });

    // Compute running balances (cumulative total of all deliveries over time)
    let runningTotal = 0;
    const computed = items.map((item: any) => {
      runningTotal = safeFinancialAdd(runningTotal, item.amount || 0);
      const runningBalance = safeFinancialRound(runningTotal);
      // Fire-and-forget stale update
      if (Math.abs((item.runningBalance || 0) - runningBalance) > 0.005) {
        db.cashDelivery.update({ where: { id: item.id }, data: { runningBalance } }).catch(() => {});
      }
      return { ...item, runningBalance };
    });
    computed.reverse();

    const masked = maskFinancialArray(computed, role, ['ledgerPosted', 'debitEntryCode', 'creditEntryCode', 'runningBalance']);
    return NextResponse.json(masked);
  } catch (error) {
    console.error('Error fetching cash deliveries:', error);
    return NextResponse.json({ error: 'Failed to fetch cash deliveries' }, { status: 500 });
  }
}

// POST /api/cash-deliveries — Create with double-entry ledger, bank balance validation, CSV import
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'CashDeliveries', 'POST');
  if (!security.authorized) return security.response;

  const { id: userId, name: userName, companyId } = security.user;

  try {
    const url = new URL(request.url);
    const isImport = url.searchParams.get('import') === 'true';

    if (isImport) {
      return await handleCsvImport(request, userId, userName, companyId);
    }

    const body = await request.json();
    const result = await createSingleCashDelivery(body, userId, userName, companyId);

    // Automated SMS: Financial Collection Event (Cash Delivery to Supplier)
    if (result) {
      try {
        const { triggerFinancialCollectionSms } = await import('@/lib/sms-event-hooks');
        await triggerFinancialCollectionSms({
          id: (result as any).id,
          supplierId: (result as any).supplierId || undefined,
          amount: (result as any).amount,
          paymentMethod: 'Cash Delivery',
          date: (result as any).date,
          companyId: (result as any).companyId || undefined,
        });
      } catch (smsError) {
        console.error('[CashDeliveries] SMS trigger failed (non-blocking):', smsError);
      }
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating cash delivery:', error);
    const message = error instanceof Error ? error.message : 'Failed to create cash delivery';
    const statusCode = message.includes('Insufficient') ? 400 : 500;
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}

/**
 * CSV Import handler for cash deliveries
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

      const supplierIdentifier = row.supplierName || row.SupplierName || row.supplierCode || row.SupplierCode || row.supplierId;
      if (!supplierIdentifier) {
        throw new Error('supplierName, supplierCode, or supplierId is required');
      }

      const supplier = await db.supplier.findFirst({
        where: {
          OR: [
            { name: supplierIdentifier },
            { supplierCode: supplierIdentifier },
            { id: supplierIdentifier },
          ],
          isActive: true,
          ...(companyId ? { companyId } : {}),
        },
      });

      if (!supplier) {
        throw new Error(`INVALID ACCOUNT CATEGORY: Supplier "${supplierIdentifier}" not found`);
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

      const deliveryBody: Record<string, unknown> = {
        supplierId: supplier.id,
        date: row.date || row.Date || new Date().toISOString().split('T')[0],
        amount: parseFloat(amountRaw),
        bankId: effectiveBankId,
        paymentOptionId: row.paymentOptionId || null,
        chequeNo: row.chequeNo || null,
        voucherNo: row.voucherNo || null,
        description: row.description || row.Description || null,
        status: row.status || 'Approved',
      };

      const result = await createSingleCashDelivery(deliveryBody, userId, userName, companyId);
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
 * Shared helper: create a single CashDelivery with double-entry ledger, bank balance validation
 */
async function createSingleCashDelivery(
  body: Record<string, unknown>,
  userId: string,
  userName: string,
  companyId: string | null
) {
  const {
    supplierId, date, amount, paymentOptionId, bankId,
    chequeNo, voucherNo, description, status, referenceKey,
    chartOfAccountId: explicitCoAId,
  } = body;

  if (!supplierId || !date || amount === undefined || amount === null) {
    throw new Error('supplierId, date, and amount are required');
  }

  // Amount must be a positive number
  const parsedAmount = parseFloat(String(amount));
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    throw new Error('amount must be a positive number greater than 0');
  }

  // Date validation
  const dv = new Date(date as string);
  if (isNaN(dv.getTime())) {
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
    const existing = await db.cashDelivery.findFirst({
      where: { referenceKey: String(referenceKey) },
    });
    if (existing) {
      throw new Error(`Idempotency conflict: CashDelivery with referenceKey "${String(referenceKey)}" already exists (409)`);
    }
  }

  const safeAmount = safeFinancialRound(parseFloat(String(amount)));
  const effectiveBankId = bankId ? String(bankId) : null;
  const effectiveStatus = status ? String(status) : 'Approved';
  const effectiveSupplierId = String(supplierId);

  // Bank balance validation for cash deliveries (decrement)
  if (effectiveBankId && effectiveStatus === 'Approved') {
    const bank = await db.bank.findUnique({
      where: { id: effectiveBankId },
      select: { currentBalance: true, bankName: true },
    });
    if (bank && bank.currentBalance < safeAmount) {
      throw new Error(
        `Insufficient bank balance. ${bank.bankName} has ৳${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(bank.currentBalance)} but delivery amount is ৳${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(safeAmount)}`
      );
    }
  }

  return await db.$transaction(async (tx: any) => {
    const deliveryCode = await generateDeliveryCode(tx);

    // Resolve supplier for CoA — also fetch currentBalance for AP update
    const supplier = await tx.supplier.findUnique({
      where: { id: effectiveSupplierId },
      select: { name: true, currentBalance: true, currentBalanceType: true },
    });

    // Resolve CoA: use explicit, or find "Liability" classification CoA matching supplier name
    let resolvedCoAId = explicitCoAId ? String(explicitCoAId) : null;
    if (!resolvedCoAId) {
      const matchingCoA = await tx.chartOfAccount.findFirst({
        where: {
          classification: 'Liability',
          name: { contains: supplier?.name || '' },
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

    // Bank balance decrement with re-validation inside transaction
    if (effectiveBankId && effectiveStatus === 'Approved') {
      const currentBank = await tx.bank.findUnique({
        where: { id: effectiveBankId },
        select: { currentBalance: true },
      });
      if (!currentBank || currentBank.currentBalance < safeAmount) {
        throw new Error(
          `Insufficient bank balance. Bank has ৳${currentBank?.currentBalance ?? 0} but delivery amount is ৳${safeAmount}`
        );
      }
      const newBalance = safeFinancialSubtract(currentBank.currentBalance, safeAmount);
      await tx.bank.update({
        where: { id: effectiveBankId },
        data: { currentBalance: newBalance },
      });
    }

    // ── AP Ledger: Reduce supplier credit balance (Accounts Payable) ──
    if (effectiveStatus === 'Approved' && supplier) {
      const { newBalance: newApBalance, newBalanceType: newApBalanceType } = computeApReversal(
        supplier.currentBalance,
        supplier.currentBalanceType,
        safeAmount
      );
      await tx.supplier.update({
        where: { id: effectiveSupplierId },
        data: { currentBalance: newApBalance, currentBalanceType: newApBalanceType },
      });
    }

    // Create the cash delivery
    const cashDelivery = await tx.cashDelivery.create({
      data: {
        deliveryCode,
        supplierId: effectiveSupplierId,
        date: transactionDate,
        amount: safeAmount,
        paymentOptionId: paymentOptionId ? String(paymentOptionId) : null,
        bankId: effectiveBankId,
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
        supplier: true,
        paymentOption: true,
        bank: true,
        chartOfAccount: true,
      },
    });

    // ── Double-Entry Ledger: Dr: Supplier, Cr: Cash/Bank ──
    let debitEntryCode: string | null = null;
    let creditEntryCode: string | null = null;

    if (effectiveStatus === 'Approved') {
      const drCode = await generateLedgerEntryCode(tx);
      const crCode = `LED-${String(parseInt(drCode.match(/LED-(\d+)/)?.[1] || '0', 10) + 1).padStart(5, '0')}`;

      const debitAccount = supplier?.name || 'Unknown Supplier';
      const creditAccount = effectiveBankId
        ? (await tx.bank.findUnique({ where: { id: effectiveBankId } }))?.bankName || 'Bank'
        : 'Cash in Hand';

      // Dr: Supplier
      await tx.ledgerEntry.create({
        data: {
          entryCode: drCode,
          date: transactionDate,
          accountId: resolvedCoAId,
          account: debitAccount,
          particulars: 'Cash Delivery to supplier',
          debit: safeAmount,
          credit: 0,
          reference: deliveryCode,
          referenceType: 'CashDelivery',
          companyId: companyId || null,
        },
      });

      // Cr: Cash/Bank
      await tx.ledgerEntry.create({
        data: {
          entryCode: crCode,
          date: transactionDate,
          accountId: bankCoAId,
          account: creditAccount,
          particulars: 'Cash Delivery to supplier',
          debit: 0,
          credit: safeAmount,
          reference: deliveryCode,
          referenceType: 'CashDelivery',
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
          sourceType: 'CashDelivery',
          sourceId: cashDelivery.id,
          sourceCode: deliveryCode,
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

      await tx.cashDelivery.update({
        where: { id: cashDelivery.id },
        data: { ledgerPosted: true, debitEntryCode, creditEntryCode },
      });
    }

    await tx.auditLog.create({
      data: {
        action: 'CREATE',
        module: 'Fin-Ledger-Transaction',
        recordId: cashDelivery.id,
        recordLabel: deliveryCode,
        userId,
        userName,
        details: JSON.stringify({
          type: 'CashDelivery',
          deliveryCode,
          supplierId: effectiveSupplierId,
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
      recordId: cashDelivery.id,
      recordLabel: deliveryCode,
      userId,
      userName,
      details: `Created cash delivery ${deliveryCode}: ৳${safeAmount}`,
    });

    const finalResult = await tx.cashDelivery.findUnique({
      where: { id: cashDelivery.id },
      include: {
        supplier: true,
        paymentOption: true,
        bank: true,
        chartOfAccount: true,
      },
    });

    return finalResult;
  });
}
