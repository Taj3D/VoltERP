import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  checkPeriodClose,
  maskFinancialArray,
  checkFinancialDeletePermission,
  safeFinancialRound,
  safeFinancialAdd,
} from '@/lib/api-security';
import { checkFiscalYearInterlock } from '@/lib/accounting-utils';

// GET /api/incomes - List all incomes with multi-tenant isolation + VAT Auditor masking
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Incomes', 'GET');
  if (!security.authorized) return security.response;

  const { role, companyId } = security.user;

  try {
    const incomes = await db.income.findMany({
      where: {
        isActive: true,
        ...(companyId ? { companyId } : {}),
      },
      include: {
        head: true,
        paymentOption: true,
        bank: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Apply VAT Auditor financial masking to array
    const masked = maskFinancialArray(incomes as Record<string, unknown>[], role);

    return NextResponse.json(masked);
  } catch (error) {
    console.error('Error fetching incomes:', error);
    return NextResponse.json(
      { error: 'Failed to fetch incomes' },
      { status: 500 }
    );
  }
}

// POST /api/incomes - Create income with auto-code, bank balance INCREMENT, ledger, audit
// Supports batchMode for CSV import
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Incomes', 'POST');
  if (!security.authorized) return security.response;

  const { id: userId, name: userName, companyId } = security.user;

  try {
    const body = await request.json();

    // ────────────────────────────────────────────────────────────
    // Batch mode support (CSV import)
    // ────────────────────────────────────────────────────────────
    if (body.batchMode === true && Array.isArray(body.data)) {
      const results: unknown[] = [];
      const errors: string[] = [];

      for (let i = 0; i < body.data.length; i++) {
        try {
          const item = body.data[i];
          const result = await createSingleIncome(item, userId, userName, companyId);
          results.push(result);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          errors.push(`Row ${i + 1}: ${msg}`);
        }
      }

      return NextResponse.json(
        {
          created: results.length,
          errors: errors.length > 0 ? errors : undefined,
          data: results,
        },
        { status: 201 }
      );
    }

    // ────────────────────────────────────────────────────────────
    // Single create
    // ────────────────────────────────────────────────────────────
    const result = await createSingleIncome(body, userId, userName, companyId);
    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating income:', error);
    const message = error instanceof Error ? error.message : 'Failed to create income';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Shared helper: create a single income record inside a transaction.
 * Handles auto-code (INC-XXXXX), safe arithmetic, bank balance INCREMENT,
 * double-entry ledger (Cr: income head, Dr: cash/bank), and AuditLog.
 */
async function createSingleIncome(
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
  } = body;

  if (!headId || amount === undefined || amount === null) {
    throw new Error('headId and amount are required');
  }

  // Period-close lock check
  const transactionDate = date ? new Date(date as string) : new Date();
  const periodLock = await checkPeriodClose(transactionDate);
  if (periodLock) throw new Error('Period is locked');

  // Phase 14: Fiscal Year Immutable Period Interlock
  const fyInterlock = await checkFiscalYearInterlock(transactionDate, companyId);
  if (fyInterlock) throw new Error(fyInterlock);

  // Clean empty optional string fields → null
  const cleanChequeNo = chequeNo && String(chequeNo).trim() !== '' ? String(chequeNo) : null;
  const cleanVoucherNo = voucherNo && String(voucherNo).trim() !== '' ? String(voucherNo) : null;
  const cleanDescription = description && String(description).trim() !== '' ? String(description) : null;

  const safeAmount = safeFinancialRound(parseFloat(String(amount)));
  const effectiveBankId = bankId ? String(bankId) : null;
  const incomeStatus = status ? String(status) : 'Approved';

  return await db.$transaction(async (tx) => {
    // Auto-generate incomeCode as INC-XXXXX (5-digit zero-padded)
    const lastIncome = await tx.income.findFirst({
      orderBy: { incomeCode: 'desc' },
      select: { incomeCode: true },
    });

    let nextNum = 1;
    if (lastIncome?.incomeCode) {
      const match = lastIncome.incomeCode.match(/INC-(\d+)/);
      if (match) {
        nextNum = parseInt(match[1], 10) + 1;
      }
    }
    const incomeCode = `INC-${String(nextNum).padStart(5, '0')}`;

    // Resolve head name for ledger account
    const head = await tx.expenseIncomeHead.findUnique({
      where: { id: String(headId) },
      select: { name: true },
    });

    // Create the income record
    const income = await tx.income.create({
      data: {
        incomeCode,
        date: transactionDate,
        headId: String(headId),
        amount: safeAmount,
        paymentOptionId: paymentOptionId ? String(paymentOptionId) : null,
        bankId: effectiveBankId,
        companyId: companyId || null,
        chequeNo: cleanChequeNo,
        voucherNo: cleanVoucherNo,
        description: cleanDescription,
        status: incomeStatus,
      },
      include: {
        head: true,
        paymentOption: true,
        bank: true,
      },
    });

    // If bankId is provided and status is "Approved", INCREMENT Bank.currentBalance
    if (effectiveBankId && incomeStatus === 'Approved') {
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

    // ────────────────────────────────────────────────────────────
    // Double-entry ledger: Cr: income head, Dr: cash/bank
    // ────────────────────────────────────────────────────────────
    if (incomeStatus === 'Approved') {
      // Credit entry: income head
      await tx.ledgerEntry.create({
        data: {
          date: transactionDate,
          account: head?.name || 'Unknown',
          particulars: cleanDescription || null,
          debit: 0,
          credit: safeAmount,
          reference: incomeCode,
          referenceType: 'Income',
        },
      });

      // Debit entry: cash/bank counterpart
      const cashAccountName = effectiveBankId
        ? (await tx.bank.findUnique({ where: { id: effectiveBankId } }))?.bankName || 'Bank'
        : 'Cash in Hand';
      await tx.ledgerEntry.create({
        data: {
          date: transactionDate,
          account: cashAccountName,
          particulars: `Received for income: ${head?.name || 'Unknown'}`,
          debit: safeAmount,
          credit: 0,
          reference: incomeCode,
          referenceType: 'Income',
        },
      });
    }

    // AuditLog entry — module token: Fin-Ledger-Transaction
    await tx.auditLog.create({
      data: {
        action: 'CREATE',
        module: 'Fin-Ledger-Transaction',
        recordId: income.id,
        recordLabel: incomeCode,
        userId,
        userName,
        details: JSON.stringify({
          type: 'Income',
          incomeCode,
          headId: String(headId),
          amount: safeAmount,
          bankId: effectiveBankId,
          chequeNo: cleanChequeNo,
          voucherNo: cleanVoucherNo,
          companyId: companyId || null,
          status: incomeStatus,
        }),
      },
    });

    return income;
  });
}
