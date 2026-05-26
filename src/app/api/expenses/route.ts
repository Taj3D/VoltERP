import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity, checkPeriodClose } from '@/lib/api-security';

// GET /api/expenses - List all expenses with relations
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Expenses', 'GET');
  if (!security.authorized) return security.response;

  try {
    const expenses = await db.expense.findMany({
      where: { isActive: true },
      include: {
        head: true,
        paymentOption: true,
        bank: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(expenses);
  } catch (error) {
    console.error('Error fetching expenses:', error);
    return NextResponse.json(
      { error: 'Failed to fetch expenses' },
      { status: 500 }
    );
  }
}

// POST /api/expenses - Create expense with auto-code, bank balance, ledger, audit
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Expenses', 'POST');
  if (!security.authorized) return security.response;

  try {
    const body = await request.json();
    const { date, headId, amount, paymentOptionId, bankId, description, status } = body;

    if (!headId || amount === undefined || amount === null) {
      return NextResponse.json(
        { error: 'headId and amount are required' },
        { status: 400 }
      );
    }

    // Period-close lock check
    const transactionDate = date ? new Date(date) : new Date();
    const periodLock = await checkPeriodClose(transactionDate);
    if (periodLock) return periodLock;

    const result = await db.$transaction(async (tx) => {
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
        where: { id: headId },
        select: { name: true },
      });

      const expenseStatus = status || 'Approved';
      const effectiveBankId = bankId || null;

      // Create the expense
      const expense = await tx.expense.create({
        data: {
          expenseCode,
          date: transactionDate,
          headId,
          amount: parseFloat(String(amount)),
          paymentOptionId: paymentOptionId || null,
          bankId: effectiveBankId,
          description: description || null,
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
        await tx.bank.update({
          where: { id: effectiveBankId },
          data: {
            currentBalance: {
              decrement: parseFloat(String(amount)),
            },
          },
        });
      }

      // Create LedgerEntry (debit for expense)
      await tx.ledgerEntry.create({
        data: {
          date: transactionDate,
          account: head?.name || 'Unknown',
          particulars: description || null,
          debit: parseFloat(String(amount)),
          credit: 0,
          reference: expenseCode,
        },
      });

      // Create AuditLog entry
      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'Expenses',
          recordId: expense.id,
          recordLabel: expenseCode,
          details: JSON.stringify({
            expenseCode,
            headId,
            amount: parseFloat(String(amount)),
            bankId: effectiveBankId,
            status: expenseStatus,
          }),
        },
      });

      return expense;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating expense:', error);
    const message = error instanceof Error ? error.message : 'Failed to create expense';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
