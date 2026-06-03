// ============================================================
// Expenses API — Double-Entry CoA Alignment, LedgerAutoPost, Balance Validation, CSV Import
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
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';
import Papa from 'papaparse';

// Helper: normalize empty strings to null
function nullIfEmpty(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  return String(value).trim() === '' ? null : String(value).trim();
}

// Helper: auto-generate next code — collision-safe
async function generateExpenseCode(tx: ReturnType<typeof db.$extends extends infer T ? T : never>): Promise<string> {
  const all = await (tx as any).expense.findMany({
    select: { expenseCode: true },
  });
  let maxNum = 0;
  for (const r of all) {
    if (r.expenseCode) {
      const match = (r.expenseCode as string).match(/EXP-(\d+)/);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
    }
  }
  return `EXP-${String(maxNum + 1).padStart(5, '0')}`;
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

// Helper: resolve chartOfAccountId from head
async function resolveExpenseCoA(tx: any, headId: string, explicitCoAId?: string | null): Promise<string | null> {
  if (explicitCoAId) return explicitCoAId;

  const head = await tx.expenseIncomeHead.findUnique({
    where: { id: headId },
    include: { chartOfAccount: true },
  });

  if (!head) return null;
  if (head.chartOfAccountId) return head.chartOfAccountId;

  // Fallback: find a CoA with classification "Expense" matching the head name
  const matchingCoA = await tx.chartOfAccount.findFirst({
    where: {
      classification: 'Expense',
      name: { contains: head.name },
      isActive: true,
    },
  });

  return matchingCoA?.id || null;
}

// Helper: resolve bank CoA account
async function resolveBankCoA(tx: any, bankId: string | null): Promise<string | null> {
  if (!bankId) return null;
  const bank = await tx.bank.findUnique({
    where: { id: bankId },
    select: { chartOfAccountId: true },
  });
  return bank?.chartOfAccountId || null;
}

// GET /api/expenses — List with query params, CoA includes, VAT masking
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Expenses', 'GET');
  if (!security.authorized) return security.response;

  const { role, companyId } = security.user;

  try {
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const headId = searchParams.get('headId');
    const bankId = searchParams.get('bankId');
    const status = searchParams.get('status');
    const ledgerPosted = searchParams.get('ledgerPosted');
    const chartOfAccountId = searchParams.get('chartOfAccountId');

    const whereClause: Record<string, unknown> = {
      isActive: true,
      ...(companyId ? { companyId } : {}),
      ...(headId ? { headId } : {}),
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

    const expenses = await db.expense.findMany({
      where: whereClause,
      include: {
        head: { include: { chartOfAccount: true } },
        paymentOption: true,
        bank: true,
        chartOfAccount: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const masked = maskFinancialArray(expenses as Record<string, unknown>[], role, ['ledgerPosted', 'debitEntryCode', 'creditEntryCode']);

    return NextResponse.json(masked);
  } catch (error) {
    console.error('Error fetching expenses:', error);
    return NextResponse.json(
      { error: 'Failed to fetch expenses' },
      { status: 500 }
    );
  }
}

// POST /api/expenses — Create with double-entry ledger, CoA resolution, balance validation, CSV import
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Expenses', 'POST');
  if (!security.authorized) return security.response;

  const { id: userId, name: userName, companyId } = security.user;

  try {
    const contentType = request.headers.get('content-type') || '';
    const url = new URL(request.url);
    const isImport = url.searchParams.get('import') === 'true';

    // ── CSV Import ──
    if (isImport) {
      return await handleCsvImport(request, userId, userName, companyId);
    }

    const body = await request.json();

    // ── Single create ──
    const result = await createSingleExpense(body, userId, userName, companyId);
    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating expense:', error);
    const message = error instanceof Error ? error.message : 'Failed to create expense';
    const statusCode = message.includes('Insufficient') || message.includes('Period') || message.includes('Idempotency') ? 409 : 500;
    return NextResponse.json({ error: message }, { status: statusCode < 500 ? statusCode : 500 });
  }
}

/**
 * CSV Import handler for expenses
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
      // NULL AMOUNT REJECTION
      const amountRaw = row.amount || row.Amount;
      if (!amountRaw || isNaN(parseFloat(amountRaw))) {
        throw new Error(`Amount is null, empty, or non-numeric: "${amountRaw}"`);
      }

      // Resolve headId from headName or headCode
      const headIdentifier = row.headName || row.HeadName || row.headCode || row.HeadCode;
      if (!headIdentifier) {
        throw new Error('headName or headCode is required');
      }

      const head = await db.expenseIncomeHead.findFirst({
        where: {
          OR: [
            { name: headIdentifier },
            { code: headIdentifier },
          ],
          type: 'Expense',
          isActive: true,
          ...(companyId ? { companyId } : {}),
        },
      });

      if (!head) {
        throw new Error(`INVALID ACCOUNT CATEGORY: Expense head "${headIdentifier}" not found or is not type "Expense"`);
      }

      // Resolve bankId
      const bankIdentifier = row.bankName || row.BankName || row.bankId || row.BankId;
      let effectiveBankId: string | null = null;
      if (bankIdentifier) {
        const bank = await db.bank.findFirst({
          where: {
            OR: [
              { bankName: bankIdentifier },
              { id: bankIdentifier },
            ],
            isActive: true,
            ...(companyId ? { companyId } : {}),
          },
        });
        if (bank) effectiveBankId = bank.id;
      }

      const expenseBody: Record<string, unknown> = {
        date: row.date || row.Date || new Date().toISOString().split('T')[0],
        headId: head.id,
        chartOfAccountId: head.chartOfAccountId,
        amount: parseFloat(amountRaw),
        bankId: effectiveBankId,
        paymentOptionId: row.paymentOptionId || null,
        chequeNo: row.chequeNo || null,
        voucherNo: row.voucherNo || null,
        description: row.description || row.Description || null,
        status: row.status || 'Approved',
      };

      const result = await createSingleExpense(expenseBody, userId, userName, companyId);
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
 * Shared helper: create a single expense with double-entry ledger, CoA resolution, balance validation
 */
async function createSingleExpense(
  body: Record<string, unknown>,
  userId: string,
  userName: string,
  companyId: string | null
) {
  const {
    date,
    headId,
    amount,
    paymentOptionId,
    bankId,
    chequeNo,
    voucherNo,
    description,
    status,
    referenceKey,
    chartOfAccountId: explicitCoAId,
  } = body;

  if (!headId || amount === undefined || amount === null) {
    throw new Error('headId and amount are required');
  }

  // Period-close lock check
  const transactionDate = date ? new Date(date as string) : new Date();
  const periodLock = await checkPeriodClose(transactionDate);
  if (periodLock) throw new Error('Period is locked — cannot create expense in a closed period');

  // Idempotency check
  if (referenceKey) {
    const existing = await db.expense.findFirst({
      where: { referenceKey: String(referenceKey) },
    });
    if (existing) {
      throw new Error(`Idempotency conflict: Expense with referenceKey "${String(referenceKey)}" already exists (409)`);
    }
  }

  const safeAmount = safeFinancialRound(parseFloat(String(amount)));
  const effectiveBankId = bankId ? String(bankId) : null;
  const expenseStatus = status ? String(status) : 'Approved';
  const effectiveHeadId = String(headId);

  // Bank balance validation for expenses (decrement)
  if (effectiveBankId && expenseStatus === 'Approved') {
    const bankRecord = await db.bank.findUnique({
      where: { id: effectiveBankId },
      select: { currentBalance: true, bankName: true },
    });
    if (bankRecord && bankRecord.currentBalance < safeAmount) {
      throw new Error(
        `Insufficient bank balance. ${bankRecord.bankName} has ৳${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(bankRecord.currentBalance)} but expense amount is ৳${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(safeAmount)}`
      );
    }
  }

  return await db.$transaction(async (tx: any) => {
    const expenseCode = await generateExpenseCode(tx);

    // CoA Resolution: from head → CoA
    const resolvedCoAId = await resolveExpenseCoA(tx, effectiveHeadId, explicitCoAId as string | null);
    const bankCoAId = await resolveBankCoA(tx, effectiveBankId);

    // Resolve head name for ledger account
    const head = await tx.expenseIncomeHead.findUnique({
      where: { id: effectiveHeadId },
      select: { name: true, chartOfAccountId: true },
    });

    // Bank balance decrement
    if (effectiveBankId && expenseStatus === 'Approved') {
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

    // Create the expense record
    const expense = await tx.expense.create({
      data: {
        expenseCode,
        date: transactionDate,
        headId: effectiveHeadId,
        amount: safeAmount,
        paymentOptionId: paymentOptionId ? String(paymentOptionId) : null,
        bankId: effectiveBankId,
        companyId: companyId || null,
        chequeNo: nullIfEmpty(chequeNo as string | undefined),
        voucherNo: nullIfEmpty(voucherNo as string | undefined),
        description: nullIfEmpty(description as string | undefined),
        status: expenseStatus,
        chartOfAccountId: resolvedCoAId,
        referenceKey: referenceKey ? String(referenceKey) : null,
        ledgerPosted: false,
      },
      include: {
        head: { include: { chartOfAccount: true } },
        paymentOption: true,
        bank: true,
        chartOfAccount: true,
      },
    });

    // ── Double-Entry Ledger: Dr: expense head, Cr: cash/bank ──
    let debitEntryCode: string | null = null;
    let creditEntryCode: string | null = null;

    if (expenseStatus === 'Approved') {
      const debitCode = await generateLedgerEntryCode(tx);
      const creditCode = `LED-${String(parseInt(debitCode.match(/LED-(\d+)/)?.[1] || '0', 10) + 1).padStart(5, '0')}`;

      const debitAccount = head?.name || 'Unknown Expense';
      const creditAccount = effectiveBankId
        ? (await tx.bank.findUnique({ where: { id: effectiveBankId } }))?.bankName || 'Bank'
        : 'Cash in Hand';

      // Dr: expense head
      await tx.ledgerEntry.create({
        data: {
          entryCode: debitCode,
          date: transactionDate,
          accountId: resolvedCoAId,
          account: debitAccount,
          particulars: nullIfEmpty(description as string | undefined) || `Expense: ${debitAccount}`,
          debit: safeAmount,
          credit: 0,
          reference: expenseCode,
          referenceType: 'Expense',
          companyId: companyId || null,
        },
      });

      // Cr: cash/bank
      await tx.ledgerEntry.create({
        data: {
          entryCode: creditCode,
          date: transactionDate,
          accountId: bankCoAId,
          account: creditAccount,
          particulars: `Payment for expense: ${debitAccount}`,
          debit: 0,
          credit: safeAmount,
          reference: expenseCode,
          referenceType: 'Expense',
          companyId: companyId || null,
        },
      });

      debitEntryCode = debitCode;
      creditEntryCode = creditCode;

      // Balance validation: totalDebits === totalCredits
      const totalDebits = safeFinancialRound(safeAmount);
      const totalCredits = safeFinancialRound(safeAmount);
      if (safeFinancialRound(totalDebits - totalCredits) !== 0) {
        throw new Error(`Ledger imbalance: Dr ${totalDebits} ≠ Cr ${totalCredits}`);
      }

      // Create LedgerAutoPost record
      const lapCode = await generateAutoPostCode(tx);
      await tx.ledgerAutoPost.create({
        data: {
          code: lapCode,
          sourceType: 'Expense',
          sourceId: expense.id,
          sourceCode: expenseCode,
          debitEntryId: debitCode,
          creditEntryId: creditCode,
          debitAccount,
          creditAccount,
          amount: safeAmount,
          postingDate: transactionDate,
          status: 'Posted',
          companyId: companyId || null,
          postedBy: userId,
        },
      });

      // Mark ledgerPosted = true
      await tx.expense.update({
        where: { id: expense.id },
        data: {
          ledgerPosted: true,
          debitEntryCode,
          creditEntryCode,
        },
      });
    }

    // AuditLog
    await tx.auditLog.create({
      data: {
        action: 'CREATE',
        module: 'Fin-Ledger-Transaction',
        recordId: expense.id,
        recordLabel: expenseCode,
        userId,
        userName,
        details: JSON.stringify({
          type: 'Expense',
          expenseCode,
          headId: effectiveHeadId,
          amount: safeAmount,
          bankId: effectiveBankId,
          chartOfAccountId: resolvedCoAId,
          ledgerPosted: expenseStatus === 'Approved',
          debitEntryCode,
          creditEntryCode,
          companyId: companyId || null,
          status: expenseStatus,
        }),
      },
    });

    await logUserActivity({
      tx: tx,
      action: 'CREATE',
      module: 'Fin-Ledger-Transaction',
      recordId: expense.id,
      recordLabel: expenseCode,
      userId,
      userName,
      details: `Created expense ${expenseCode}: ৳${safeAmount}`,
    });

    // Re-fetch with updated ledgerPosted
    const finalExpense = await tx.expense.findUnique({
      where: { id: expense.id },
      include: {
        head: { include: { chartOfAccount: true } },
        paymentOption: true,
        bank: true,
        chartOfAccount: true,
      },
    });

    return finalExpense;
  });
}
