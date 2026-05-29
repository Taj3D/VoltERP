import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  validateVatMode,
  maskAccountingReportForVatAuditor,
  safeFinancialAdd,
  safeFinancialSubtract,
  safeFinancialRound,
  formatFinancialField,
} from '@/lib/api-security';
import type { UserRole } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// GET /api/reports/cash-in-hand - Stage 12: Multi-tenant, safe math, VAT auditor masking, RBAC, activity log
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'CashInHand', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    // STAGE 12: VAT Auditor mode validation
    const rawVatMode = searchParams.get('vatMode') === 'true';
    const userRole = security.user.role as UserRole;
    const vatMode = validateVatMode(rawVatMode, userRole);

    // STAGE 12: Multi-tenant companyId isolation
    const companyId = security.user.companyId;

    // Build date filters
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

    // STAGE 12: Filter banks by companyId
    const bankWhere: Record<string, unknown> = { isActive: true };
    if (companyId) bankWhere.companyId = companyId;

    const banks = await db.bank.findMany({
      where: bankWhere,
      include: {
        bankTransactions: {
          where: from || to ? { date: dateFilterBT } : undefined,
          orderBy: { date: 'asc' },
        },
        expenses: {
          where: {
            isActive: true,
            status: 'Approved',
            ...(from || to ? dateFilterExp : {}),
            ...(companyId ? { companyId } : {}),
          },
        },
        incomes: {
          where: {
            isActive: true,
            status: 'Approved',
            ...(from || to ? dateFilterInc : {}),
            ...(companyId ? { companyId } : {}),
          },
        },
        cashCollections: {
          where: {
            isActive: true,
            status: 'Approved',
            ...(from || to ? dateFilterCC : {}),
            ...(companyId ? { companyId } : {}),
          },
        },
        cashDeliveries: {
          where: {
            isActive: true,
            status: 'Approved',
            ...(from || to ? dateFilterCD : {}),
            ...(companyId ? { companyId } : {}),
          },
        },
      },
    });

    // STAGE 12: Build bank-by-bank breakdown with running balances using safe math
    const bankBreakdown = banks.map((bank) => {
      let deposits = 0;
      for (const t of bank.bankTransactions.filter((t) => t.type === 'Deposit')) {
        deposits = safeFinancialAdd(deposits, t.amount);
      }
      let withdrawals = 0;
      for (const t of bank.bankTransactions.filter((t) => t.type === 'Withdraw')) {
        withdrawals = safeFinancialAdd(withdrawals, t.amount);
      }
      let bankIncome = 0;
      for (const i of bank.incomes) {
        bankIncome = safeFinancialAdd(bankIncome, i.amount);
      }
      let bankExpense = 0;
      for (const e of bank.expenses) {
        bankExpense = safeFinancialAdd(bankExpense, e.amount);
      }
      let collections = 0;
      for (const c of bank.cashCollections) {
        collections = safeFinancialAdd(collections, c.amount);
      }
      let deliveries = 0;
      for (const d of bank.cashDeliveries) {
        deliveries = safeFinancialAdd(deliveries, d.amount);
      }

      // STAGE 12: Current balance using safe math
      const currentBalance = safeFinancialRound(
        bank.openingBalance + deposits - withdrawals + bankIncome - bankExpense + collections - deliveries
      );

      // STAGE 12: Running balance calculation from transactions in date order using safe math
      let runningBalance = bank.openingBalance;
      const runningBalances = bank.bankTransactions.map((t) => {
        if (t.type === 'Deposit') {
          runningBalance = safeFinancialAdd(runningBalance, t.amount);
        } else if (t.type === 'Withdraw') {
          runningBalance = safeFinancialSubtract(runningBalance, t.amount);
        }
        // Transfer: source bank decrements
        return {
          date: t.date,
          type: t.type,
          amount: t.amount,
          transactionCode: t.transactionCode,
          runningBalance: safeFinancialRound(runningBalance),
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
        currentBalance,
        runningBalances,
      };
    });

    // STAGE 12: Calculate totals across all banks using safe math
    let totalOpeningBalance = 0;
    let totalDeposits = 0;
    let totalWithdrawals = 0;
    let totalBankIncome = 0;
    let totalBankExpense = 0;

    for (const b of bankBreakdown) {
      totalOpeningBalance = safeFinancialAdd(totalOpeningBalance, b.openingBalance);
      totalDeposits = safeFinancialAdd(totalDeposits, b.deposits);
      totalWithdrawals = safeFinancialAdd(totalWithdrawals, b.withdrawals);
      totalBankIncome = safeFinancialAdd(totalBankIncome, b.income);
      totalBankExpense = safeFinancialAdd(totalBankExpense, b.expense);
    }

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
          ...(companyId ? { companyId } : {}),
        },
        _sum: { amount: true },
      });
      const cashExpenses = await db.expense.aggregate({
        where: {
          paymentOptionId: cashOption.id,
          isActive: true,
          ...(from || to ? dateFilterExp : {}),
          ...(companyId ? { companyId } : {}),
        },
        _sum: { amount: true },
      });
      cashIncome = cashIncomes._sum.amount || 0;
      cashExpense = cashExpenses._sum.amount || 0;
    }

    // STAGE 12: All cash collections and deliveries with companyId filter
    const ccWhere: Record<string, unknown> = { isActive: true, status: 'Approved', ...(from || to ? dateFilterCC : {}) };
    if (companyId) ccWhere.companyId = companyId;

    const cdWhere: Record<string, unknown> = { isActive: true, status: 'Approved', ...(from || to ? dateFilterCD : {}) };
    if (companyId) cdWhere.companyId = companyId;

    const allCashCollections = await db.cashCollection.aggregate({
      where: ccWhere,
      _sum: { amount: true },
    });
    const allCashDeliveries = await db.cashDelivery.aggregate({
      where: cdWhere,
      _sum: { amount: true },
    });

    // STAGE 12: Total cash in hand using safe math
    const totalCashInHand = safeFinancialRound(
      totalOpeningBalance +
      totalDeposits -
      totalWithdrawals +
      cashIncome -
      cashExpense +
      (allCashCollections._sum.amount || 0) -
      (allCashDeliveries._sum.amount || 0)
    );

    // Cash flow trend data
    const allBankTransactions = banks.flatMap((b) =>
      b.bankTransactions.map((t) => ({ ...t, bankName: b.bankName }))
    );

    // STAGE 12: Filter income/expense by companyId
    const incWhere: Record<string, unknown> = { isActive: true, status: 'Approved', ...(from || to ? dateFilterInc : {}) };
    if (companyId) incWhere.companyId = companyId;

    const expWhere: Record<string, unknown> = { isActive: true, status: 'Approved', ...(from || to ? dateFilterExp : {}) };
    if (companyId) expWhere.companyId = companyId;

    const allIncomeRecords = await db.income.findMany({
      where: incWhere,
      select: { date: true, amount: true },
    });
    const allExpenseRecords = await db.expense.findMany({
      where: expWhere,
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

      // STAGE 12: Use safe math for daily flow calculations
      let dayInflow = 0;
      for (const t of allBankTransactions) {
        const td = new Date(t.date);
        if (td.getFullYear() === year && td.getMonth() === month && td.getDate() === day && t.type === 'Deposit') {
          dayInflow = safeFinancialAdd(dayInflow, t.amount);
        }
      }
      for (const inc of allIncomeRecords) {
        const id = new Date(inc.date);
        if (id.getFullYear() === year && id.getMonth() === month && id.getDate() === day) {
          dayInflow = safeFinancialAdd(dayInflow, inc.amount);
        }
      }

      let dayOutflow = 0;
      for (const t of allBankTransactions) {
        const td = new Date(t.date);
        if (td.getFullYear() === year && td.getMonth() === month && td.getDate() === day && t.type === 'Withdraw') {
          dayOutflow = safeFinancialAdd(dayOutflow, t.amount);
        }
      }
      for (const exp of allExpenseRecords) {
        const ed = new Date(exp.date);
        if (ed.getFullYear() === year && ed.getMonth() === month && ed.getDate() === day) {
          dayOutflow = safeFinancialAdd(dayOutflow, exp.amount);
        }
      }

      dailyFlow.push({
        date: d.toLocaleDateString('en', { month: 'short', day: 'numeric' }),
        inflow: dayInflow,
        outflow: dayOutflow,
        net: safeFinancialSubtract(dayInflow, dayOutflow),
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

    // STAGE 12: Apply formatFinancialField to null/undefined fields in bankBreakdown
    const formattedBankBreakdown = bankBreakdown.map((b) => ({
      ...b,
      bankName: formatFinancialField(b.bankName),
      accountNo: formatFinancialField(b.accountNo),
    }));

    // Build response data
    const responseData: Record<string, unknown> = {
      bankBreakdown: formattedBankBreakdown,
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
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    };

    // STAGE 12: Apply VAT Auditor deep masking (replaces old partial masking)
    if (vatMode) {
      const masked = maskAccountingReportForVatAuditor(responseData, userRole);
      return NextResponse.json(masked);
    }

    // STAGE 12: Activity logging
    await logUserActivity({
      action: 'EXPORT',
      module: 'Acc-Cash-In-Hand',
      userId: security.user.id,
      userName: security.user.name,
      details: 'Cash in Hand report generated',
    });

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Error calculating cash in hand:', error);
    return NextResponse.json(
      { error: 'Failed to calculate cash in hand' },
      { status: 500 }
    );
  }
}
