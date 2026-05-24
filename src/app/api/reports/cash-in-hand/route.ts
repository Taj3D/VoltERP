import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Fetch all banks with their related transactions
    const banks = await db.bank.findMany({
      where: { isActive: true },
      include: {
        bankTransactions: true,
        expenses: true,
        incomes: true,
        cashCollections: true,
        cashDeliveries: true,
      },
    });

    // Calculate totals across all banks
    const totalOpeningBalance = banks.reduce((sum, b) => sum + b.openingBalance, 0);

    const totalDeposits = banks.reduce(
      (sum, b) =>
        sum + b.bankTransactions.filter((t) => t.type === 'Deposit').reduce((s, t) => s + t.amount, 0),
      0
    );

    const totalWithdrawals = banks.reduce(
      (sum, b) =>
        sum + b.bankTransactions.filter((t) => t.type === 'Withdraw').reduce((s, t) => s + t.amount, 0),
      0
    );

    // Bank-specific income/expense
    const totalBankIncome = banks.reduce(
      (sum, b) => sum + b.incomes.reduce((s, i) => s + i.amount, 0),
      0
    );

    const totalBankExpense = banks.reduce(
      (sum, b) => sum + b.expenses.reduce((s, e) => s + e.amount, 0),
      0
    );

    // Cash collections and deliveries linked to banks
    const totalCashCollections = banks.reduce(
      (sum, b) => sum + b.cashCollections.reduce((s, c) => s + c.amount, 0),
      0
    );

    const totalCashDeliveries = banks.reduce(
      (sum, b) => sum + b.cashDeliveries.reduce((s, d) => s + d.amount, 0),
      0
    );

    // Also get cash income/expense not linked to any bank (paymentOption = Cash)
    const cashOption = await db.paymentOption.findFirst({
      where: { name: 'Cash', isActive: true },
    });

    let cashIncome = 0;
    let cashExpense = 0;

    if (cashOption) {
      const cashIncomes = await db.income.aggregate({
        where: { paymentOptionId: cashOption.id },
        _sum: { amount: true },
      });
      const cashExpenses = await db.expense.aggregate({
        where: { paymentOptionId: cashOption.id },
        _sum: { amount: true },
      });
      cashIncome = cashIncomes._sum.amount || 0;
      cashExpense = cashExpenses._sum.amount || 0;
    }

    // All cash collections (from customers) and deliveries (to suppliers)
    const allCashCollections = await db.cashCollection.aggregate({
      _sum: { amount: true },
    });
    const allCashDeliveries = await db.cashDelivery.aggregate({
      _sum: { amount: true },
    });

    // Build breakdown per bank
    const bankBreakdown = banks.map((bank) => {
      const deposits = bank.bankTransactions
        .filter((t) => t.type === 'Deposit')
        .reduce((s, t) => s + t.amount, 0);
      const withdrawals = bank.bankTransactions
        .filter((t) => t.type === 'Withdraw')
        .reduce((s, t) => s + t.amount, 0);
      const bankIncome = bank.incomes.reduce((s, i) => s + i.amount, 0);
      const bankExpense = bank.expenses.reduce((s, e) => s + e.amount, 0);
      const collections = bank.cashCollections.reduce((s, c) => s + c.amount, 0);
      const deliveries = bank.cashDeliveries.reduce((s, d) => s + d.amount, 0);

      const currentBalance =
        bank.openingBalance + deposits - withdrawals + bankIncome - bankExpense + collections - deliveries;

      return {
        bankId: bank.id,
        bankName: bank.bankName,
        accountNo: bank.accountNo,
        openingBalance: bank.openingBalance,
        deposits,
        withdrawals,
        income: bankIncome,
        expense: bankExpense,
        collections,
        deliveries,
        currentBalance,
      };
    });

    const totalCashInHand =
      totalOpeningBalance +
      totalDeposits -
      totalWithdrawals +
      cashIncome -
      cashExpense +
      (allCashCollections._sum.amount || 0) -
      (allCashDeliveries._sum.amount || 0);

    // Cash flow trend: aggregate transactions by date (last 30 days)
    const allBankTransactions = banks.flatMap(b =>
      b.bankTransactions.map(t => ({ ...t, bankName: b.bankName }))
    );
    const allIncomeRecords = await db.income.findMany({ where: { isActive: true }, select: { date: true, amount: true } });
    const allExpenseRecords = await db.expense.findMany({ where: { isActive: true }, select: { date: true, amount: true } });

    // Build daily cash flow for last 30 days
    const now = new Date();
    const dailyFlow: { date: string; inflow: number; outflow: number; net: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const year = d.getFullYear();
      const month = d.getMonth();
      const day = d.getDate();

      const dayInflow = allBankTransactions
        .filter(t => { const td = new Date(t.date); return td.getFullYear() === year && td.getMonth() === month && td.getDate() === day && t.type === 'Deposit'; })
        .reduce((s, t) => s + t.amount, 0)
        + allIncomeRecords
          .filter(i => { const id = new Date(i.date); return id.getFullYear() === year && id.getMonth() === month && id.getDate() === day; })
          .reduce((s, i) => s + i.amount, 0);

      const dayOutflow = allBankTransactions
        .filter(t => { const td = new Date(t.date); return td.getFullYear() === year && td.getMonth() === month && td.getDate() === day && t.type === 'Withdraw'; })
        .reduce((s, t) => s + t.amount, 0)
        + allExpenseRecords
          .filter(e => { const ed = new Date(e.date); return ed.getFullYear() === year && ed.getMonth() === month && ed.getDate() === day; })
          .reduce((s, e) => s + e.amount, 0);

      dailyFlow.push({
        date: d.toLocaleDateString('en', { month: 'short', day: 'numeric' }),
        inflow: dayInflow,
        outflow: dayOutflow,
        net: dayInflow - dayOutflow,
      });
    }

    // Income vs Expense comparison data
    const incomeVsExpense = [
      { name: 'Deposits', amount: totalDeposits, type: 'Income' },
      { name: 'Cash Income', amount: cashIncome, type: 'Income' },
      { name: 'Collections', amount: allCashCollections._sum.amount || 0, type: 'Income' },
      { name: 'Withdrawals', amount: totalWithdrawals, type: 'Expense' },
      { name: 'Cash Expense', amount: cashExpense, type: 'Expense' },
      { name: 'Deliveries', amount: allCashDeliveries._sum.amount || 0, type: 'Expense' },
    ];

    // Recent transactions (combined from all sources)
    const recentTransactions = [
      ...allBankTransactions.slice(-20).map(t => ({
        date: t.date,
        description: `${t.type} - ${t.bankName}`,
        type: t.type === 'Deposit' ? 'Inflow' : 'Outflow',
        amount: t.amount,
      })),
      ...allIncomeRecords.slice(-10).map(i => ({
        date: i.date,
        description: 'Income',
        type: 'Inflow',
        amount: i.amount,
      })),
      ...allExpenseRecords.slice(-10).map(e => ({
        date: e.date,
        description: 'Expense',
        type: 'Outflow',
        amount: e.amount,
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 15);

    return NextResponse.json({
      bankBreakdown,
      totals: {
        openingBalance: totalOpeningBalance,
        deposits: totalDeposits,
        withdrawals: totalWithdrawals,
        cashIncome,
        cashExpense,
        cashCollections: allCashCollections._sum.amount || 0,
        cashDeliveries: allCashDeliveries._sum.amount || 0,
        totalCashInHand,
      },
      dailyFlow,
      incomeVsExpense,
      recentTransactions,
    });
  } catch (error) {
    console.error('Error calculating cash in hand:', error);
    return NextResponse.json(
      { error: 'Failed to calculate cash in hand' },
      { status: 500 }
    );
  }
}
