import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, validateVatMode } from '@/lib/api-security';
import type { UserRole } from '@/lib/api-security';

// GET /api/reports/cash-in-hand - Enhanced with date range, bank-by-bank running balances, cash flow trend
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Reports', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    // VAT-001: Validate vatMode
    const rawVatMode = searchParams.get('vatMode') === 'true';
    const userRole = security.user.role as UserRole;
    const vatMode = validateVatMode(rawVatMode, userRole);

    // Fetch all banks with related transactions
    const dateFilterBT: Record<string, Date> = {};
    const dateFilterExp: Record<string, unknown> = {};
    const dateFilterInc: Record<string, unknown> = {};
    const dateFilterCC: Record<string, unknown> = {};
    const dateFilterCD: Record<string, unknown> = {};

    if (from) {
      dateFilterBT.gte = new Date(from);
      dateFilterExp.date = { gte: new Date(from) };
      dateFilterInc.date = { gte: new Date(from) };
      dateFilterCC.date = { gte: new Date(from) };
      dateFilterCD.date = { gte: new Date(from) };
    }
    if (to) {
      dateFilterBT.lte = new Date(to);
      const existingExp = dateFilterExp.date as Record<string, Date> || {};
      dateFilterExp.date = { ...existingExp, lte: new Date(to) };
      const existingInc = dateFilterInc.date as Record<string, Date> || {};
      dateFilterInc.date = { ...existingInc, lte: new Date(to) };
      const existingCC = dateFilterCC.date as Record<string, Date> || {};
      dateFilterCC.date = { ...existingCC, lte: new Date(to) };
      const existingCD = dateFilterCD.date as Record<string, Date> || {};
      dateFilterCD.date = { ...existingCD, lte: new Date(to) };
    }

    const banks = await db.bank.findMany({
      where: { isActive: true },
      include: {
        bankTransactions: {
          where: from || to ? { date: dateFilterBT } : undefined,
          orderBy: { date: 'asc' },
        },
        expenses: {
          where: { isActive: true, status: 'Approved', ...(from || to ? dateFilterExp : {}) },
        },
        incomes: {
          where: { isActive: true, status: 'Approved', ...(from || to ? dateFilterInc : {}) },
        },
        cashCollections: {
          where: { isActive: true, status: 'Approved', ...(from || to ? dateFilterCC : {}) },
        },
        cashDeliveries: {
          where: { isActive: true, status: 'Approved', ...(from || to ? dateFilterCD : {}) },
        },
      },
    });

    // Build bank-by-bank breakdown with running balances
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

      // Running balance calculation from transactions in date order
      let runningBalance = bank.openingBalance;
      const runningBalances = bank.bankTransactions.map((t) => {
        if (t.type === 'Deposit') runningBalance += t.amount;
        else if (t.type === 'Withdraw') runningBalance -= t.amount;
        // Transfer: source bank decrements
        return {
          date: t.date,
          type: t.type,
          amount: t.amount,
          transactionCode: t.transactionCode,
          runningBalance: parseFloat(runningBalance.toFixed(2)),
        };
      });

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
        currentBalance: parseFloat(currentBalance.toFixed(2)),
        runningBalances,
      };
    });

    // Calculate totals across all banks
    const totalOpeningBalance = banks.reduce((sum, b) => sum + b.openingBalance, 0);
    const totalDeposits = bankBreakdown.reduce((sum, b) => sum + b.deposits, 0);
    const totalWithdrawals = bankBreakdown.reduce((sum, b) => sum + b.withdrawals, 0);
    const totalBankIncome = bankBreakdown.reduce((sum, b) => sum + b.income, 0);
    const totalBankExpense = bankBreakdown.reduce((sum, b) => sum + b.expense, 0);

    // Cash income/expense not linked to any bank (Cash payment option)
    const cashOption = await db.paymentOption.findFirst({
      where: { name: 'Cash', isActive: true },
    });

    let cashIncome = 0;
    let cashExpense = 0;

    if (cashOption) {
      const cashIncomes = await db.income.aggregate({
        where: {
          paymentOptionId: cashOption.id,
          isActive: true,
          ...(from || to ? dateFilterInc : {}),
        },
        _sum: { amount: true },
      });
      const cashExpenses = await db.expense.aggregate({
        where: {
          paymentOptionId: cashOption.id,
          isActive: true,
          ...(from || to ? dateFilterExp : {}),
        },
        _sum: { amount: true },
      });
      cashIncome = cashIncomes._sum.amount || 0;
      cashExpense = cashExpenses._sum.amount || 0;
    }

    // All cash collections and deliveries
    const allCashCollections = await db.cashCollection.aggregate({
      where: { isActive: true, status: 'Approved', ...(from || to ? dateFilterCC : {}) },
      _sum: { amount: true },
    });
    const allCashDeliveries = await db.cashDelivery.aggregate({
      where: { isActive: true, status: 'Approved', ...(from || to ? dateFilterCD : {}) },
      _sum: { amount: true },
    });

    const totalCashInHand =
      totalOpeningBalance +
      totalDeposits -
      totalWithdrawals +
      cashIncome -
      cashExpense +
      (allCashCollections._sum.amount || 0) -
      (allCashDeliveries._sum.amount || 0);

    // Cash flow trend data
    const allBankTransactions = banks.flatMap((b) =>
      b.bankTransactions.map((t) => ({ ...t, bankName: b.bankName }))
    );
    const allIncomeRecords = await db.income.findMany({
      where: { isActive: true, status: 'Approved', ...(from || to ? dateFilterInc : {}) },
      select: { date: true, amount: true },
    });
    const allExpenseRecords = await db.expense.findMany({
      where: { isActive: true, status: 'Approved', ...(from || to ? dateFilterExp : {}) },
      select: { date: true, amount: true },
    });

    // Determine trend period: use from/to if provided, otherwise last 30 days
    let trendDays = 30;
    if (from && to) {
      const fromDate = new Date(from);
      const toDate = new Date(to);
      trendDays = Math.min(Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1, 90);
    }

    const now = to ? new Date(to) : new Date();
    const dailyFlow: { date: string; inflow: number; outflow: number; net: number }[] = [];
    for (let i = trendDays - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const year = d.getFullYear();
      const month = d.getMonth();
      const day = d.getDate();

      const dayInflow =
        allBankTransactions
          .filter((t) => {
            const td = new Date(t.date);
            return td.getFullYear() === year && td.getMonth() === month && td.getDate() === day && t.type === 'Deposit';
          })
          .reduce((s, t) => s + t.amount, 0) +
        allIncomeRecords
          .filter((i) => {
            const id = new Date(i.date);
            return id.getFullYear() === year && id.getMonth() === month && id.getDate() === day;
          })
          .reduce((s, i) => s + i.amount, 0);

      const dayOutflow =
        allBankTransactions
          .filter((t) => {
            const td = new Date(t.date);
            return td.getFullYear() === year && td.getMonth() === month && td.getDate() === day && t.type === 'Withdraw';
          })
          .reduce((s, t) => s + t.amount, 0) +
        allExpenseRecords
          .filter((e) => {
            const ed = new Date(e.date);
            return ed.getFullYear() === year && ed.getMonth() === month && ed.getDate() === day;
          })
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

    // Recent transactions
    const recentTransactions = [
      ...allBankTransactions.slice(-20).map((t) => ({
        date: t.date,
        description: `${t.type} - ${t.bankName}`,
        type: t.type === 'Deposit' ? 'Inflow' : 'Outflow',
        amount: t.amount,
      })),
      ...allIncomeRecords.slice(-10).map((i) => ({
        date: i.date,
        description: 'Income',
        type: 'Inflow',
        amount: i.amount,
      })),
      ...allExpenseRecords.slice(-10).map((e) => ({
        date: e.date,
        description: 'Expense',
        type: 'Outflow',
        amount: e.amount,
      })),
    ]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 15);

    return NextResponse.json({
      bankBreakdown,
      totals: {
        openingBalance: vatMode ? 'N/A (Audit Mode)' : totalOpeningBalance,
        deposits: totalDeposits,
        withdrawals: totalWithdrawals,
        cashIncome,
        cashExpense,
        cashCollections: allCashCollections._sum.amount || 0,
        cashDeliveries: allCashDeliveries._sum.amount || 0,
        totalCashInHand: vatMode ? 'N/A (Audit Mode)' : parseFloat(totalCashInHand.toFixed(2)),
      },
      dailyFlow,
      incomeVsExpense,
      recentTransactions,
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    });
  } catch (error) {
    console.error('Error calculating cash in hand:', error);
    return NextResponse.json(
      { error: 'Failed to calculate cash in hand' },
      { status: 500 }
    );
  }
}
