import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity, checkPeriodClose } from '@/lib/api-security';

// GET /api/incomes - List all incomes with relations
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Incomes', 'GET');
  if (!security.authorized) return security.response;

  try {
    const incomes = await db.income.findMany({
      where: { isActive: true },
      include: {
        head: true,
        paymentOption: true,
        bank: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(incomes);
  } catch (error) {
    console.error('Error fetching incomes:', error);
    return NextResponse.json(
      { error: 'Failed to fetch incomes' },
      { status: 500 }
    );
  }
}

// POST /api/incomes - Create income with auto-code, bank balance, ledger, audit
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Incomes', 'POST');
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
        where: { id: headId },
        select: { name: true },
      });

      const incomeStatus = status || 'Approved';
      const effectiveBankId = bankId || null;

      // Create the income
      const income = await tx.income.create({
        data: {
          incomeCode,
          date: transactionDate,
          headId,
          amount: parseFloat(String(amount)),
          paymentOptionId: paymentOptionId || null,
          bankId: effectiveBankId,
          description: description || null,
          status: incomeStatus,
        },
        include: {
          head: true,
          paymentOption: true,
          bank: true,
        },
      });

      // If bankId is provided and status is "Approved", increment Bank.currentBalance
      if (effectiveBankId && incomeStatus === 'Approved') {
        await tx.bank.update({
          where: { id: effectiveBankId },
          data: {
            currentBalance: {
              increment: parseFloat(String(amount)),
            },
          },
        });
      }

      // Create LedgerEntry (credit for income head)
      await tx.ledgerEntry.create({
        data: {
          date: transactionDate,
          account: head?.name || 'Unknown',
          particulars: description || null,
          debit: 0,
          credit: parseFloat(String(amount)),
          reference: incomeCode,
          referenceType: 'Income',
        },
      });

      // Create LedgerEntry (debit for cash/bank — double-entry counterpart)
      const cashAccountName = effectiveBankId
        ? (await tx.bank.findUnique({ where: { id: effectiveBankId } }))?.bankName || 'Bank'
        : 'Cash in Hand';
      await tx.ledgerEntry.create({
        data: {
          date: transactionDate,
          account: cashAccountName,
          particulars: `Received for income: ${head?.name || 'Unknown'}`,
          debit: parseFloat(String(amount)),
          credit: 0,
          reference: incomeCode,
          referenceType: 'Income',
        },
      });

      // Create AuditLog entry
      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'Incomes',
          recordId: income.id,
          recordLabel: incomeCode,
          details: JSON.stringify({
            incomeCode,
            headId,
            amount: parseFloat(String(amount)),
            bankId: effectiveBankId,
            status: incomeStatus,
          }),
        },
      });

      return income;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating income:', error);
    const message = error instanceof Error ? error.message : 'Failed to create income';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
