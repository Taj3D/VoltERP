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

// GET /api/reports/profit-loss - Phase 14: COA-based income statement, fiscal year context, retained earnings
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'ProfitLoss', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    // STAGE 12: VAT Auditor mode validation (replaces old hideMargins)
    const rawVatMode = searchParams.get('vatMode') === 'true';
    const userRole = security.user.role as UserRole;
    const vatMode = validateVatMode(rawVatMode, userRole);

    // STAGE 12: Multi-tenant companyId isolation
    const companyId = security.user.companyId;

    // Build date filters
    const dateFilterSO: Record<string, Date> = {};
    const dateFilterIncome: Record<string, unknown> = {};
    const dateFilterExpense: Record<string, unknown> = {};

    if (from) {
      dateFilterSO.gte = new Date(from);
      dateFilterIncome.date = { gte: new Date(from) };
      dateFilterExpense.date = { gte: new Date(from) };
    }
    if (to) {
      dateFilterSO.lte = new Date(to);
      if (dateFilterIncome.date) {
        (dateFilterIncome.date as Record<string, Date>).lte = new Date(to);
      } else {
        dateFilterIncome.date = { lte: new Date(to) };
      }
      if (dateFilterExpense.date) {
        (dateFilterExpense.date as Record<string, Date>).lte = new Date(to);
      } else {
        dateFilterExpense.date = { lte: new Date(to) };
      }
    }

    // FIX PL-001: Include multiple non-Draft/non-Cancelled statuses
    // NOTE: SalesOrder does NOT have companyId — known limitation for Stage 12
    const salesWhere: Record<string, unknown> = { status: { notIn: ['Draft', 'Cancelled'] }, isActive: true };
    if (from || to) salesWhere.date = dateFilterSO;

    // STAGE 12: Add companyId filter to Income and Expense (models WITH companyId)
    const incomeWhere: Record<string, unknown> = {
      isActive: true,
      status: { notIn: ['Draft', 'Cancelled'] },
      ...dateFilterIncome,
      ...(companyId ? { companyId } : {}),
    };
    const expenseWhere: Record<string, unknown> = {
      isActive: true,
      status: { notIn: ['Draft', 'Cancelled'] },
      ...dateFilterExpense,
      ...(companyId ? { companyId } : {}),
    };

    // ─────────────────────────────────────────────────────────
    // PHASE 14: Fetch COA records for COA-based income statement
    // ─────────────────────────────────────────────────────────
    const coaWhere: Record<string, unknown> = { isActive: true };
    if (companyId) coaWhere.companyId = companyId;

    const coaRecords = await db.chartOfAccount.findMany({
      where: coaWhere,
    });

    // PHASE 14: COA-based Income Statement
    // Revenue accounts: classification is 'Income' or 'Revenue'
    const revenueAccounts = coaRecords.filter(c => ['Income', 'Revenue'].includes(c.classification));
    let coaRevenue = 0;
    for (const acc of revenueAccounts) coaRevenue = safeFinancialAdd(coaRevenue, acc.currentBalance);

    // Expense accounts: classification is 'Expense' or 'Expenses'
    const expenseAccounts = coaRecords.filter(c => ['Expense', 'Expenses'].includes(c.classification));
    let coaExpenses = 0;
    for (const acc of expenseAccounts) coaExpenses = safeFinancialAdd(coaExpenses, acc.currentBalance);

    const coaNetProfit = safeFinancialSubtract(coaRevenue, coaExpenses);

    // Detailed COA-based breakdown for income and expense accounts
    const coaRevenueBreakdown = revenueAccounts.map(acc => ({
      code: acc.code,
      name: acc.name,
      classification: acc.classification,
      currentBalance: acc.currentBalance,
    }));

    const coaExpenseBreakdown = expenseAccounts.map(acc => ({
      code: acc.code,
      name: acc.name,
      classification: acc.classification,
      currentBalance: acc.currentBalance,
    }));

    // ─────────────────────────────────────────────────────────
    // PHASE 14: Fiscal Year Context
    // Check for closed fiscal years overlapping the query date range
    // ─────────────────────────────────────────────────────────
    const fiscalYearWhere: Record<string, unknown> = { isActive: true, status: 'CLOSED' };
    if (companyId) fiscalYearWhere.companyId = companyId;

    const closedFiscalYears = await db.fiscalYear.findMany({
      where: fiscalYearWhere,
      orderBy: { startDate: 'asc' },
    });

    const queryStartDate = from ? new Date(from) : null;
    const queryEndDate = to ? new Date(to) : null;

    const fiscalYearContext: Array<{
      id: string;
      name: string;
      startDate: string;
      endDate: string;
      status: string;
      closedAt: string | null;
      netProfitClosed: number;
    }> = [];

    for (const fy of closedFiscalYears) {
      const fyStart = new Date(fy.startDate);
      const fyEnd = new Date(fy.endDate);
      let overlaps = false;

      if (queryStartDate && queryEndDate) {
        overlaps = queryStartDate <= fyEnd && queryEndDate >= fyStart;
      } else if (queryStartDate) {
        overlaps = queryStartDate >= fyStart && queryStartDate <= fyEnd;
      } else if (queryEndDate) {
        overlaps = queryEndDate >= fyStart && queryEndDate <= fyEnd;
      } else {
        overlaps = true;
      }

      if (overlaps) {
        fiscalYearContext.push({
          id: fy.id,
          name: fy.name,
          startDate: fy.startDate.toISOString(),
          endDate: fy.endDate.toISOString(),
          status: fy.status,
          closedAt: fy.closedAt ? fy.closedAt.toISOString() : null,
          netProfitClosed: fy.netProfitClosed,
        });
      }
    }

    // ─────────────────────────────────────────────────────────
    // PHASE 14: Retained Earnings Account
    // Look up the "Retained Earnings" COA node under Equity
    // ─────────────────────────────────────────────────────────
    const retainedEarningsAccount = coaRecords.find(
      c => c.classification === 'Equity' &&
           c.name.toLowerCase().includes('retained earnings')
    );

    const retainedEarningsAccountData = retainedEarningsAccount
      ? {
          id: retainedEarningsAccount.id,
          code: retainedEarningsAccount.code,
          name: retainedEarningsAccount.name,
          classification: retainedEarningsAccount.classification,
          currentBalance: retainedEarningsAccount.currentBalance,
        }
      : null;

    // ─────────────────────────────────────────────────────────
    // Existing transaction-based P&L calculation (preserved)
    // ─────────────────────────────────────────────────────────

    const [confirmedSales, allIncomes, allExpenses] = await Promise.all([
      db.salesOrder.findMany({
        where: salesWhere,
        include: { lines: { include: { product: { select: { costPrice: true } } } } },
      }),
      db.income.findMany({
        where: incomeWhere,
        include: { head: true, paymentOption: true },
      }),
      db.expense.findMany({
        where: expenseWhere,
        include: { head: true, paymentOption: true },
      }),
    ]);

    // STAGE 12: Net Revenue = Sales Revenue + Other Income (using safeFinancialAdd)
    let salesRevenue = 0;
    for (const s of confirmedSales) {
      salesRevenue = safeFinancialAdd(salesRevenue, s.grandTotal);
    }
    let totalIncome = 0;
    for (const i of allIncomes) {
      totalIncome = safeFinancialAdd(totalIncome, i.amount);
    }
    const revenue = safeFinancialAdd(salesRevenue, totalIncome);

    // STAGE 12: COGS = Sum of (quantity × costPrice) for all sold items (using safeFinancialAdd)
    let costOfGoods = 0;
    for (const so of confirmedSales) {
      for (const line of so.lines) {
        const costPrice = line.product?.costPrice || 0;
        costOfGoods = safeFinancialAdd(costOfGoods, line.quantity * costPrice);
      }
    }

    // STAGE 12: Gross Profit = Net Revenue - COGS (using safeFinancialSubtract)
    const grossProfit = safeFinancialSubtract(revenue, costOfGoods);
    const grossProfitMargin = revenue > 0 ? safeFinancialRound((grossProfit / revenue) * 100) : 0;

    // STAGE 12: Operating Expenses (using safeFinancialAdd)
    let operatingExpenses = 0;
    for (const e of allExpenses) {
      operatingExpenses = safeFinancialAdd(operatingExpenses, e.amount);
    }

    // STAGE 12: Net Margin = Gross Profit - Operating Expenses
    const netProfit = safeFinancialSubtract(grossProfit, operatingExpenses);
    const netProfitMargin = revenue > 0 ? safeFinancialRound((netProfit / revenue) * 100) : 0;

    // STAGE 12: Income details grouped by head (using safeFinancialAdd)
    const incomeByHead = new Map<string, { head: string; amount: number; count: number }>();
    for (const income of allIncomes) {
      const headName = formatFinancialField(income.head?.name);
      const existing = incomeByHead.get(headName);
      if (existing) {
        existing.amount = safeFinancialAdd(existing.amount, income.amount);
        existing.count += 1;
      } else {
        incomeByHead.set(headName, { head: headName, amount: income.amount, count: 1 });
      }
    }

    // STAGE 12: Expense details grouped by head (using safeFinancialAdd)
    const expenseByHead = new Map<string, { head: string; amount: number; count: number }>();
    for (const expense of allExpenses) {
      const headName = formatFinancialField(expense.head?.name);
      const existing = expenseByHead.get(headName);
      if (existing) {
        existing.amount = safeFinancialAdd(existing.amount, expense.amount);
        existing.count += 1;
      } else {
        expenseByHead.set(headName, { head: headName, amount: expense.amount, count: 1 });
      }
    }

    // STAGE 12: Monthly breakdown with safe math
    const now = new Date();
    const monthsToGenerate = 12;
    const monthlyData: {
      month: string;
      revenue: number;
      cogs: number;
      grossProfit: number;
      expenses: number;
      netMargin: number;
      profit: number;
      profitMargin: number;
    }[] = [];

    for (let i = monthsToGenerate - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStr = d.toLocaleString('en', { month: 'short', year: '2-digit' });
      const year = d.getFullYear();
      const month = d.getMonth();

      let monthSales = 0;
      for (const s of confirmedSales) {
        const sd = new Date(s.date);
        if (sd.getFullYear() === year && sd.getMonth() === month) {
          monthSales = safeFinancialAdd(monthSales, s.grandTotal);
        }
      }

      let monthIncome = 0;
      for (const inc of allIncomes) {
        const id = new Date(inc.date);
        if (id.getFullYear() === year && id.getMonth() === month) {
          monthIncome = safeFinancialAdd(monthIncome, inc.amount);
        }
      }

      let monthCOGS = 0;
      for (const s of confirmedSales) {
        const sd = new Date(s.date);
        if (sd.getFullYear() === year && sd.getMonth() === month) {
          for (const line of s.lines) {
            const costPrice = line.product?.costPrice || 0;
            monthCOGS = safeFinancialAdd(monthCOGS, line.quantity * costPrice);
          }
        }
      }

      let monthExpenses = 0;
      for (const e of allExpenses) {
        const ed = new Date(e.date);
        if (ed.getFullYear() === year && ed.getMonth() === month) {
          monthExpenses = safeFinancialAdd(monthExpenses, e.amount);
        }
      }

      const monthRevenue = safeFinancialAdd(monthSales, monthIncome);
      const monthGrossProfit = safeFinancialSubtract(monthRevenue, monthCOGS);
      const monthNet = safeFinancialSubtract(monthGrossProfit, monthExpenses);

      monthlyData.push({
        month: monthStr,
        revenue: monthRevenue,
        cogs: monthCOGS,
        grossProfit: monthGrossProfit,
        expenses: monthExpenses,
        profit: monthNet,
        profitMargin: monthRevenue > 0 ? safeFinancialRound((monthNet / monthRevenue) * 100) : 0,
        netMargin: monthRevenue > 0 ? safeFinancialRound((monthNet / monthRevenue) * 100) : 0,
      });
    }

    // Build response data
    const responseData: Record<string, unknown> = {
      // Existing transaction-based P&L fields
      revenue,
      salesRevenue,
      otherIncome: totalIncome,
      costOfGoods,
      grossProfit,
      grossProfitMargin,
      operatingExpenses,
      netProfit,
      netProfitMargin,
      incomeDetails: Array.from(incomeByHead.values()),
      expenseDetails: Array.from(expenseByHead.values()),
      monthlyData,
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      // PHASE 14 additions
      coaBasedPL: {
        revenue: coaRevenue,
        expenses: coaExpenses,
        netProfit: coaNetProfit,
        revenueBreakdown: coaRevenueBreakdown,
        expenseBreakdown: coaExpenseBreakdown,
      },
      fiscalYearContext,
      retainedEarningsAccount: retainedEarningsAccountData,
    };

    // STAGE 12: Apply VAT Auditor deep masking (replaces old hideMargins approach)
    if (vatMode) {
      const masked = maskAccountingReportForVatAuditor(responseData, userRole);
      return NextResponse.json(masked);
    }

    // PHASE 14: Activity logging with updated module token
    await logUserActivity({
      action: 'EXPORT',
      module: 'Fin-Statements-Core',
      userId: security.user.id,
      userName: security.user.name,
      details: 'Profit & Loss report generated',
    });

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Error calculating profit & loss:', error);
    return NextResponse.json(
      { error: 'Failed to calculate profit & loss' },
      { status: 500 }
    );
  }
}
