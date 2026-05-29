import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  checkPeriodClose,
  maskFinancialArray,
  checkFinancialDeletePermission,
  safeFinancialRound,
  safeFinancialSubtract,
} from '@/lib/api-security';

// GET /api/expenses - List all expenses with multi-tenant isolation + VAT Auditor masking
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Expenses', 'GET');
  if (!security.authorized) return security.response;

  const { role, companyId } = security.user;

  try {
    const expenses = await db.expense.findMany({
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
    const masked = maskFinancialArray(expenses as Record<string, unknown>[], role);

    return NextResponse.json(masked);
  } catch (error) {
    console.error('Error fetching expenses:', error);
    return NextResponse.json(
      { error: 'Failed to fetch expenses' },
      { status: 500 }
    );
  }
}

// POST /api/expenses - Create expense with auto-code, bank balance, ledger, audit
// Supports batchMode for CSV import
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Expenses', 'POST');
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
          const result = await createSingleExpense(item, userId, userName, companyId);
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
    const result = await createSingleExpense(body, userId, userName, companyId);
    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating expense:', error);
    const message = error instanceof Error ? error.message : 'Failed to create expense';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Shared helper: create a single expense record inside a transaction.
 * Handles auto-code, safe arithmetic, bank balance decrement,
 * double-entry ledger, and AuditLog.
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
  } = body;

  if (!headId || amount === undefined || amount === null) {
    throw new Error('headId and amount are required');
  }

  // Period-close lock check
  const transactionDate = date ? new Date(date as string) : new Date();
  const periodLock = await checkPeriodClose(transactionDate);
  if (periodLock) throw new Error('Period is locked');

  // Clean empty optional string fields → null
  const cleanChequeNo = chequeNo && String(chequeNo).trim() !== '' ? String(chequeNo) : null;
  const cleanVoucherNo = voucherNo && String(voucherNo).trim() !== '' ? String(voucherNo) : null;
  const cleanDescription = description && String(description).trim() !== '' ? String(description) : null;

  const safeAmount = safeFinancialRound(parseFloat(String(amount)));
  const effectiveBankId = bankId ? String(bankId) : null;
  const expenseStatus = status ? String(status) : 'Approved';

  return await db.$transaction(async (tx) => {
    // Auto-generate expenseCode as EXP-XXXXX (5-digit zero-padded)
    const lastExpense = await tx.expense.findFirst({
      orderBy: { expenseCode: 'desc' },
      select: { expenseCode: true },
    });

    let nextNum = 1;
    if (lastExpense?.expenseCode) {
      const match = lastExpense.expenseCode.match(/EXP-(\d+)/);
      if (match) {
        nextNum = parseInt(match[1], 10) + 1;
      }
    }
    const expenseCode = `EXP-${String(nextNum).padStart(5, '0')}`;

    // Resolve head name for ledger account
    const head = await tx.expenseIncomeHead.findUnique({
      where: { id: String(headId) },
      select: { name: true },
    });

    // Create the expense record
    const expense = await tx.expense.create({
      data: {
        expenseCode,
        date: transactionDate,
        headId: String(headId),
        amount: safeAmount,
        paymentOptionId: paymentOptionId ? String(paymentOptionId) : null,
        bankId: effectiveBankId,
        companyId: companyId || null,
        chequeNo: cleanChequeNo,
        voucherNo: cleanVoucherNo,
        description: cleanDescription,
        status: expenseStatus,
      },
      include: {
        head: true,
        paymentOption: true,
        bank: true,
      },
    });

    // If bankId is provided and status is "Approved", decrement Bank.currentBalance
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

    // ────────────────────────────────────────────────────────────
    // Double-entry ledger: Dr: expense head, Cr: cash/bank
    // ────────────────────────────────────────────────────────────
    if (expenseStatus === 'Approved') {
      // Debit entry: expense head
      await tx.ledgerEntry.create({
        data: {
          date: transactionDate,
          account: head?.name || 'Unknown',
          particulars: cleanDescription || null,
          debit: safeAmount,
          credit: 0,
          reference: expenseCode,
          referenceType: 'Expense',
        },
      });

      // Credit entry: cash/bank counterpart
      const cashAccountName = effectiveBankId
        ? (await tx.bank.findUnique({ where: { id: effectiveBankId } }))?.bankName || 'Bank'
        : 'Cash in Hand';
      await tx.ledgerEntry.create({
        data: {
          date: transactionDate,
          account: cashAccountName,
          particulars: `Payment for expense: ${head?.name || 'Unknown'}`,
          debit: 0,
          credit: safeAmount,
          reference: expenseCode,
          referenceType: 'Expense',
        },
      });
    }

    // AuditLog entry — module token: Fin-Ledger-Transaction
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
          headId: String(headId),
          amount: safeAmount,
          bankId: effectiveBankId,
          chequeNo: cleanChequeNo,
          voucherNo: cleanVoucherNo,
          companyId: companyId || null,
          status: expenseStatus,
        }),
      },
    });

    return expense;
  });
}
