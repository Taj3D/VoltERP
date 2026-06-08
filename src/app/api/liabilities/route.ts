// ============================================================
// LIABILITY MODULE API ROUTES - Phase 4 Rewrite
// GET: Multi-tenant list with dynamic outstandingBalance computation
// POST: Liability Receive (type="received") and Liability Pay (type="pay")
//       with atomic double-entry ledger, bank balance, ChartOfAccount, LedgerAutoPost
// Supports batchMode for CSV import
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
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function nullIfEmpty(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  return str === '' ? null : str;
}

/**
 * Auto-generate the next code in the pattern PREFIX-XXXXX
 */
async function generateCode(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  prefix: string
): Promise<string> {
  // Collision-safe code generation (findMany + Math.max)
  // Note: Liability model has no `code` field, but this function is retained for potential future use
  const count = await tx.liability.count();
  // Start from count + 1, but verify uniqueness
  let nextNum = count + 1;
  let code = `${prefix}-${String(nextNum).padStart(5, '0')}`;
  // Verify uniqueness by checking if a liability with matching referenceKey exists
  let exists = await tx.liability.findFirst({ where: { referenceKey: code } });
  while (exists) {
    nextNum++;
    code = `${prefix}-${String(nextNum).padStart(5, '0')}`;
    exists = await tx.liability.findFirst({ where: { referenceKey: code } });
  }
  return code;
}

/**
 * Auto-generate an entry code for LedgerEntry in pattern LED-XXXXX
 */
async function generateLedgerEntryCode(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]
): Promise<string> {
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

/**
 * Auto-generate a LedgerAutoPost code in pattern LAP-XXXXX
 */
async function generateAutoPostCode(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]
): Promise<string> {
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

/**
 * Find or create a ChartOfAccount under "Liability" classification for a given head name.
 * Returns the ChartOfAccount record.
 */
async function findOrCreateLiabilityAccount(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  headName: string,
  companyId: string | null
): Promise<{ id: string; code: string }> {
  // Try to find existing account under Liability classification
  const existing = await tx.chartOfAccount.findFirst({
    where: {
      name: headName,
      classification: 'Liability',
      isActive: true,
      ...(companyId ? { companyId } : {}),
    },
  });

  if (existing) {
    return { id: existing.id, code: existing.code };
  }

  // Find a parent "Liability" classification account to link under
  const parentLiability = await tx.chartOfAccount.findFirst({
    where: {
      classification: 'Liability',
      name: 'Liability',
      isActive: true,
      ...(companyId ? { companyId } : {}),
    },
  });

  // Generate COA code
  const coaCount = await tx.chartOfAccount.count();
  const coaCode = `COA-${String(coaCount + 1).padStart(5, '0')}`;

  const newAccount = await tx.chartOfAccount.create({
    data: {
      code: coaCode,
      name: headName,
      classification: 'Liability',
      parentAccountId: parentLiability?.id || null,
      openingBalance: 0,
      openingBalanceType: 'Cr',
      companyId: companyId || null,
    },
  });

  return { id: newAccount.id, code: newAccount.code };
}

// ────────────────────────────────────────────────────────────
// GET /api/liabilities - List with multi-tenant, filters, dynamic outstanding
// ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Liabilities', 'GET');
  if (!security.authorized) return security.response;

  const { role, companyId } = security.user;

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const headId = searchParams.get('headId');
    const liabilityType = searchParams.get('liabilityType');

    const where: Record<string, unknown> = {
      isActive: true,
      ...(companyId ? { companyId } : {}),
    };
    if (type) where.type = type;
    if (headId) where.investmentHeadId = headId;
    if (liabilityType) where.liabilityType = liabilityType;

    const items = await db.liability.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { investmentHead: true },
    });

    // Compute outstandingBalance dynamically per head:
    // Opening Balance + SUM of received amounts minus SUM of pay amounts for that head
    const headIds = [...new Set(items.map((i) => i.investmentHeadId))];
    const outstandingMap = new Map<string, number>();

    // Fetch opening balances for all relevant heads
    const heads = await db.investmentHead.findMany({
      where: { id: { in: headIds } },
      select: { id: true, openingBalance: true, type: true },
    });
    const openingBalanceMap = new Map<string, number>();
    for (const h of heads) {
      if (h.type === 'Liability') {
        openingBalanceMap.set(h.id, h.openingBalance || 0);
      }
    }

    for (const hid of headIds) {
      const receivedSum = await db.liability.aggregate({
        _sum: { amount: true },
        where: {
          investmentHeadId: hid,
          type: 'received',
          isActive: true,
          ...(companyId ? { companyId } : {}),
        },
      });
      const paySum = await db.liability.aggregate({
        _sum: { amount: true },
        where: {
          investmentHeadId: hid,
          type: 'pay',
          isActive: true,
          ...(companyId ? { companyId } : {}),
        },
      });

      const received = receivedSum._sum.amount || 0;
      const paid = paySum._sum.amount || 0;
      const openingBal = openingBalanceMap.get(hid) || 0;
      outstandingMap.set(hid, safeFinancialSubtract(safeFinancialAdd(openingBal, received), paid));
    }

    // Attach computed outstandingBalance to each item
    const enriched = items.map((item) => ({
      ...item,
      outstandingBalance: outstandingMap.get(item.investmentHeadId) ?? item.outstandingBalance,
    }));

    // Apply VAT Auditor financial masking
    const masked = maskFinancialArray(
      enriched as Record<string, unknown>[],
      role,
      ['amount', 'principalAmount', 'interestRate', 'outstandingBalance']
    );

    return NextResponse.json(masked);
  } catch (error) {
    console.error('[Liabilities GET] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch liabilities' },
      { status: 500 }
    );
  }
}

// ────────────────────────────────────────────────────────────
// POST /api/liabilities - Create liability (receive or pay)
// Supports batchMode for CSV import
// ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Liabilities', 'POST');
  if (!security.authorized) return security.response;

  const { id: userId, name: userName, role, companyId } = security.user;

  try {
    const body = await request.json();

    // ──────────────────────────────────────────────────────────
    // Batch mode support (CSV import)
    // ──────────────────────────────────────────────────────────
    if (body.batchMode === true && Array.isArray(body.data)) {
      const results: unknown[] = [];
      const errors: string[] = [];

      await db.$transaction(async (tx) => {
        for (let i = 0; i < body.data.length; i++) {
          try {
            const item = body.data[i];
            const result = await createSingleLiability(tx, item, userId, userName, companyId);
            results.push(result);
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            errors.push(`Row ${i + 1}: ${msg}`);
          }
        }

        // Single AuditLog entry for batch
        await tx.auditLog.create({
          data: {
            action: 'CREATE',
            module: 'Fin-Liability-Core',
            recordId: 'BATCH',
            recordLabel: 'BATCH',
            userId,
            userName,
            details: JSON.stringify({
              type: 'LiabilityBatch',
              count: results.length,
              errors: errors.length > 0 ? errors : undefined,
            }),
          },
        });
      });

      return NextResponse.json(
        {
          created: results.length,
          errors: errors.length > 0 ? errors : undefined,
          data: results,
        },
        { status: 201 }
      );
    }

    // ──────────────────────────────────────────────────────────
    // Pre-transaction validation for single create
    // ──────────────────────────────────────────────────────────
    const VALID_LIABILITY_TYPES = ['received', 'pay'] as const;
    if (body.type !== undefined && !VALID_LIABILITY_TYPES.includes(body.type as any)) {
      return NextResponse.json(
        { error: `Invalid type "${body.type}". Must be one of: ${VALID_LIABILITY_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // ──────────────────────────────────────────────────────────
    // Single create — wrapped in transaction
    // ──────────────────────────────────────────────────────────
    const result = await db.$transaction(async (tx) => {
      const record = await createSingleLiability(tx, body, userId, userName, companyId);

      // AuditLog — single record
      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'Fin-Liability-Core',
          recordId: record.id,
          recordLabel: `${record.investmentHead?.name || record.id} - ৳${record.amount}`,
          userId,
          userName,
          details: JSON.stringify({
            type: record.type,
            investmentHeadId: record.investmentHeadId,
            amount: record.amount,
            liabilityType: record.liabilityType,
            principalAmount: record.principalAmount,
            bankId: record.bankId,
          }),
        },
      });

      return record;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    console.error('[Liabilities POST] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create liability';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ────────────────────────────────────────────────────────────
// Core helper: create a single liability inside a transaction context
// ────────────────────────────────────────────────────────────

async function createSingleLiability(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  body: Record<string, unknown>,
  userId: string,
  userName: string,
  companyId: string | null
) {
  const {
    investmentHeadId,
    date,
    amount,
    type,
    liabilityType,
    principalAmount,
    interestRate,
    loanDurationMonths,
    paymentMethod,
    bankId,
    voucherNo,
    chequeNo,
    referenceKey,
    description,
  } = body;

  const VALID_LIABILITY_TYPES = ['received', 'pay'] as const;
  const liabilityTypeValue = (type as string) || 'received';

  // ──────────────────────────────────────────────────────────
  // Validations
  // ──────────────────────────────────────────────────────────

  // Validate type field — must be "received" or "pay"
  if (type !== undefined && !VALID_LIABILITY_TYPES.includes(type as any)) {
    throw new Error(`Invalid type "${type}". Must be one of: ${VALID_LIABILITY_TYPES.join(', ')}`);
  }

  if (!investmentHeadId) {
    throw new Error('Investment Head is required');
  }

  const safeAmount = safeFinancialRound(parseFloat(String(amount ?? 0)));

  // Period-close lock check
  const transactionDate = date ? new Date(date as string) : new Date();
  const periodLock = await checkPeriodClose(transactionDate);
  if (periodLock) throw new Error('Period is locked');

  if (liabilityTypeValue === 'received') {
    // ────────────────────────────────────────────────────────
    // LIABILITY RECEIVE validations
    // ────────────────────────────────────────────────────────
    if (!amount || safeAmount <= 0) {
      throw new Error('Principal Amount must be greater than zero');
    }

    const safePrincipal = safeFinancialRound(parseFloat(String(principalAmount ?? 0)));
    if (!principalAmount || safePrincipal <= 0) {
      throw new Error('Principal Amount must be greater than zero');
    }

    const safeInterestRate = parseFloat(String(interestRate ?? 0));
    if (safeInterestRate < 0) {
      throw new Error('Interest Rate cannot be negative');
    }

    const safeLoanDuration = parseInt(String(loanDurationMonths ?? 0), 10);
    if (safeLoanDuration < 0) {
      throw new Error('Loan Duration cannot be negative');
    }
  } else {
    // ────────────────────────────────────────────────────────
    // LIABILITY PAY validations
    // ────────────────────────────────────────────────────────
    if (!amount || safeAmount <= 0) {
      throw new Error('Repayment amount must be greater than zero');
    }
  }

  // ──────────────────────────────────────────────────────────
  // Deactivated Head Shield
  // ──────────────────────────────────────────────────────────
  const head = await tx.investmentHead.findUnique({
    where: { id: String(investmentHeadId) },
  });

  if (!head) {
    throw new Error('Investment Head not found');
  }
  if (head.isActive === false) {
    throw new Error('Cannot create liability against a deactivated/archived Liability Head');
  }

  // ──────────────────────────────────────────────────────────
  // Idempotent Double-Click Guard
  // ──────────────────────────────────────────────────────────
  const cleanReferenceKey = nullIfEmpty(referenceKey);
  if (cleanReferenceKey) {
    const existing = await tx.liability.findFirst({
      where: { referenceKey: cleanReferenceKey, isActive: true },
      include: { investmentHead: true },
    });
    if (existing) {
      return existing; // Return existing record, no duplicate
    }
  }

  // Clean optional string fields
  const effectiveBankId = nullIfEmpty(bankId);
  const cleanPaymentMethod = nullIfEmpty(paymentMethod);
  const cleanVoucherNo = nullIfEmpty(voucherNo);
  const cleanChequeNo = nullIfEmpty(chequeNo);
  const cleanDescription = nullIfEmpty(description);

  // ──────────────────────────────────────────────────────────
  // LIABILITY RECEIVE — type="received"
  // ──────────────────────────────────────────────────────────
  if (liabilityTypeValue === 'received') {
    const safePrincipal = safeFinancialRound(parseFloat(String(principalAmount ?? 0)));
    const safeInterestRate = parseFloat(String(interestRate ?? 0));
    const safeLoanDuration = parseInt(String(loanDurationMonths ?? 0), 10);
    const safeOutstanding = safeFinancialRound(safePrincipal);

    // Pre-validate bank balance if bankId provided
    if (effectiveBankId) {
      // For receive, we INCREMENT bank balance — no need to check sufficiency
    }

    // Create the Liability record
    const record = await tx.liability.create({
      data: {
        investmentHeadId: String(investmentHeadId),
        date: transactionDate,
        amount: safeAmount,
        type: 'received',
        liabilityType: (liabilityType as string) || 'SHORT_TERM',
        principalAmount: safePrincipal,
        interestRate: safeInterestRate,
        loanDurationMonths: safeLoanDuration,
        outstandingBalance: safeOutstanding,
        paymentMethod: cleanPaymentMethod,
        bankId: effectiveBankId,
        voucherNo: cleanVoucherNo,
        chequeNo: cleanChequeNo,
        referenceKey: cleanReferenceKey,
        description: cleanDescription,
        companyId: companyId || null,
      },
      include: { investmentHead: true },
    });

    // If bankId provided, increment bank.currentBalance
    if (effectiveBankId) {
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

    // Find or create ChartOfAccount under Liability classification
    const liabilityAccount = await findOrCreateLiabilityAccount(tx, head.name, companyId);

    // CREDIT_IN LedgerEntry: credit = amount, account = "Cash/Bank"
    const creditEntryCode = await generateLedgerEntryCode(tx);
    const creditEntry = await tx.ledgerEntry.create({
      data: {
        entryCode: creditEntryCode,
        date: transactionDate,
        accountId: null, // Cash/Bank is not always a COA account
        account: effectiveBankId ? 'Cash/Bank' : 'Cash in Hand',
        particulars: cleanDescription || `Liability received: ${head.name}`,
        debit: 0,
        credit: safeAmount,
        reference: cleanVoucherNo || record.id,
        referenceType: 'LiabilityReceive',
        companyId: companyId || null,
      },
    });

    // DEBIT LedgerEntry: debit = amount, account = head.name (Liabilities)
    const debitEntryCode = await generateLedgerEntryCode(tx);
    const debitEntry = await tx.ledgerEntry.create({
      data: {
        entryCode: debitEntryCode,
        date: transactionDate,
        accountId: liabilityAccount.id,
        account: head.name,
        particulars: cleanDescription || `Liability received: ${head.name}`,
        debit: safeAmount,
        credit: 0,
        reference: cleanVoucherNo || record.id,
        referenceType: 'LiabilityReceive',
        companyId: companyId || null,
      },
    });

    // Create LedgerAutoPost record
    const autoPostCode = await generateAutoPostCode(tx);
    await tx.ledgerAutoPost.create({
      data: {
        code: autoPostCode,
        sourceType: 'LiabilityReceive',
        sourceId: record.id,
        sourceCode: cleanVoucherNo || record.id,
        debitEntryId: debitEntry.entryCode,
        creditEntryId: creditEntry.entryCode,
        debitAccount: head.name,
        creditAccount: effectiveBankId ? 'Cash/Bank' : 'Cash in Hand',
        amount: safeAmount,
        postingDate: transactionDate,
        status: 'Posted',
        companyId: companyId || null,
      },
    });

    return record;
  }

  // ──────────────────────────────────────────────────────────
  // LIABILITY PAY — type="pay"
  // ──────────────────────────────────────────────────────────

  // Pre-validate: bank balance must be >= payment amount
  if (effectiveBankId) {
    const bankRecord = await tx.bank.findUnique({
      where: { id: effectiveBankId },
      select: { currentBalance: true },
    });
    if (bankRecord && bankRecord.currentBalance < safeAmount) {
      throw new Error('Insufficient bank balance for liability repayment');
    }
  }

  // Zero Balance Protection: compute current outstanding for the head (includes opening balance)
  const headForOutstanding = await tx.investmentHead.findUnique({
    where: { id: String(investmentHeadId) },
    select: { openingBalance: true, type: true },
  });
  const openingBal = (headForOutstanding?.type === 'Liability' ? (headForOutstanding?.openingBalance || 0) : 0);

  const receivedAggregate = await tx.liability.aggregate({
    _sum: { amount: true },
    where: {
      investmentHeadId: String(investmentHeadId),
      type: 'received',
      isActive: true,
      ...(companyId ? { companyId } : {}),
    },
  });
  const payAggregate = await tx.liability.aggregate({
    _sum: { amount: true },
    where: {
      investmentHeadId: String(investmentHeadId),
      type: 'pay',
      isActive: true,
      ...(companyId ? { companyId } : {}),
    },
  });

  const totalReceived = receivedAggregate._sum.amount || 0;
  const totalPaid = payAggregate._sum.amount || 0;
  const currentOutstanding = safeFinancialSubtract(safeFinancialAdd(openingBal, totalReceived), totalPaid);

  if (safeAmount > currentOutstanding) {
    throw new Error('Action Blocked: Repayment value exceeds total outstanding liability balance.');
  }

  // Create the Liability record with type="pay", outstandingBalance = 0
  const record = await tx.liability.create({
    data: {
      investmentHeadId: String(investmentHeadId),
      date: transactionDate,
      amount: safeAmount,
      type: 'pay',
      liabilityType: (liabilityType as string) || 'SHORT_TERM',
      principalAmount: 0,
      interestRate: 0,
      loanDurationMonths: 0,
      outstandingBalance: 0,
      paymentMethod: cleanPaymentMethod,
      bankId: effectiveBankId,
      voucherNo: cleanVoucherNo,
      chequeNo: cleanChequeNo,
      referenceKey: cleanReferenceKey,
      description: cleanDescription,
      companyId: companyId || null,
    },
    include: { investmentHead: true },
  });

  // If bankId provided, decrement bank.currentBalance
  if (effectiveBankId) {
    const bankRecord = await tx.bank.findUnique({
      where: { id: effectiveBankId },
      select: { currentBalance: true },
    });
    if (bankRecord) {
      const newBalance = safeFinancialSubtract(bankRecord.currentBalance, safeAmount);
      await tx.bank.update({
        where: { id: effectiveBankId },
        data: { currentBalance: newBalance },
      });
    }
  }

  // Find or create ChartOfAccount under Liability classification
  const liabilityAccount = await findOrCreateLiabilityAccount(tx, head.name, companyId);

  // DEBIT_OUT LedgerEntry: debit = amount, account = head.name (Liabilities)
  const debitEntryCode = await generateLedgerEntryCode(tx);
  const debitEntry = await tx.ledgerEntry.create({
    data: {
      entryCode: debitEntryCode,
      date: transactionDate,
      accountId: liabilityAccount.id,
      account: head.name,
      particulars: cleanDescription || `Liability payment: ${head.name}`,
      debit: safeAmount,
      credit: 0,
      reference: cleanVoucherNo || record.id,
      referenceType: 'LiabilityPay',
      companyId: companyId || null,
    },
  });

  // CREDIT LedgerEntry: credit = amount, account = "Cash/Bank"
  const creditEntryCode = await generateLedgerEntryCode(tx);
  const creditEntry = await tx.ledgerEntry.create({
    data: {
      entryCode: creditEntryCode,
      date: transactionDate,
      accountId: null,
      account: effectiveBankId ? 'Cash/Bank' : 'Cash in Hand',
      particulars: cleanDescription || `Liability payment: ${head.name}`,
      debit: 0,
      credit: safeAmount,
      reference: cleanVoucherNo || record.id,
      referenceType: 'LiabilityPay',
      companyId: companyId || null,
    },
  });

  // Create LedgerAutoPost record
  const autoPostCode = await generateAutoPostCode(tx);
  await tx.ledgerAutoPost.create({
    data: {
      code: autoPostCode,
      sourceType: 'LiabilityPay',
      sourceId: record.id,
      sourceCode: cleanVoucherNo || record.id,
      debitEntryId: debitEntry.entryCode,
      creditEntryId: creditEntry.entryCode,
      debitAccount: head.name,
      creditAccount: effectiveBankId ? 'Cash/Bank' : 'Cash in Hand',
      amount: safeAmount,
      postingDate: transactionDate,
      status: 'Posted',
      companyId: companyId || null,
    },
  });

  return record;
}
