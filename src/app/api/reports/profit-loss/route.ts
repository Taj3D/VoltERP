import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

// GET /api/reports/profit-loss - Enhanced with date range, COGS formula, VAT Auditor mode
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Reports', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const hideMargins = searchParams.get('hideMargins'); // VAT Auditor mode

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

    // FIX PL-001: Include multiple non-Draft/non-Cancelled statuses instead of only 'Confirmed'
    const salesWhere: Record<string, unknown> = { status: { notIn: ['Draft', 'Cancelled'] }, isActive: true };
    if (from || to) salesWhere.date = dateFilterSO;

    // Income and expenses: include Approved status (already filtered by isActive)
    const incomeWhere: Record<string, unknown> = { isActive: true, status: { notIn: ['Draft', 'Cancelled'] }, ...dateFilterIncome };
    const expenseWhere: Record<string, unknown> = { isActive: true, status: { notIn: ['Draft', 'Cancelled'] }, ...dateFilterExpense };

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

    // Net Revenue = Sales Revenue + Other Income
    const salesRevenue = confirmedSales.reduce((sum, s) => sum + s.grandTotal, 0);
    const totalIncome = allIncomes.reduce((sum, i) => sum + i.amount, 0);
    const revenue = salesRevenue + totalIncome;

    // COGS = Sum of (quantity × costPrice) for all sold items, not total purchase order amounts
    // This uses the actual cost price from the product at time of sale
    const costOfGoods = confirmedSales.reduce((sum, so) => {
      return sum + so.lines.reduce((lineSum, line) => {
        const costPrice = line.product?.costPrice || 0;
        return lineSum + (line.quantity * costPrice);
      }, 0);
    }, 0);

    // Gross Profit = Net Revenue - COGS
    const grossProfit = revenue - costOfGoods;
    const grossProfitMargin = revenue > 0 ? ((grossProfit / revenue) * 100).toFixed(2) : '0.00';

    // Operating Expenses
    const operatingExpenses = allExpenses.reduce((sum, e) => sum + e.amount, 0);

    // Net Margin = Gross Profit - Operating Expenses
    const netProfit = grossProfit - operatingExpenses;
    const netProfitMargin = revenue > 0 ? ((netProfit / revenue) * 100).toFixed(2) : '0.00';

    // Income details grouped by head
    const incomeByHead = new Map<string, { head: string; amount: number; count: number }>();
    for (const income of allIncomes) {
      const headName = income.head?.name || 'Unknown';
      const existing = incomeByHead.get(headName);
      if (existing) {
        existing.amount += income.amount;
        existing.count += 1;
      } else {
        incomeByHead.set(headName, { head: headName, amount: income.amount, count: 1 });
      }
    }

    // Expense details grouped by head
    const expenseByHead = new Map<string, { head: string; amount: number; count: number }>();
    for (const expense of allExpenses) {
      const headName = expense.head?.name || 'Unknown';
      const existing = expenseByHead.get(headName);
      if (existing) {
        existing.amount += expense.amount;
        existing.count += 1;
      } else {
        expenseByHead.set(headName, { head: headName, amount: expense.amount, count: 1 });
      }
    }

    // Monthly breakdown
    const now = new Date();
    const monthsToGenerate = 12;
    const monthlyData: {
      month: string;
      revenue: number;
      cogs: number;
      grossProfit: number;
      expenses: number;
      netMargin: number | string;
      profit: number;
      profitMargin: number | string;
    }[] = [];

    for (let i = monthsToGenerate - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStr = d.toLocaleString('en', { month: 'short', year: '2-digit' });
      const year = d.getFullYear();
      const month = d.getMonth();

      const monthSales = confirmedSales
        .filter((s) => {
          const sd = new Date(s.date);
          return sd.getFullYear() === year && sd.getMonth() === month;
        })
        .reduce((sum, s) => sum + s.grandTotal, 0);
      const monthIncome = allIncomes
        .filter((inc) => {
          const id = new Date(inc.date);
          return id.getFullYear() === year && id.getMonth() === month;
        })
        .reduce((sum, inc) => sum + inc.amount, 0);
      const monthCOGS = confirmedSales
        .filter((s) => {
          const sd = new Date(s.date);
          return sd.getFullYear() === year && sd.getMonth() === month;
        })
        .reduce((sum, so) => {
          return sum + so.lines.reduce((lineSum, line) => {
            const costPrice = line.product?.costPrice || 0;
            return lineSum + (line.quantity * costPrice);
          }, 0);
        }, 0);
      const monthExpenses = allExpenses
        .filter((e) => {
          const ed = new Date(e.date);
          return ed.getFullYear() === year && ed.getMonth() === month;
        })
        .reduce((sum, e) => sum + e.amount, 0);

      const monthRevenue = monthSales + monthIncome;
      const monthGrossProfit = monthRevenue - monthCOGS;
      const monthNet = monthGrossProfit - monthExpenses;

      monthlyData.push({
        month: monthStr,
        revenue: monthRevenue,
        cogs: monthCOGS,
        grossProfit: monthGrossProfit,
        expenses: monthExpenses,
        profit: monthNet,
        profitMargin: hideMargins
          ? 'N/A (Audit Mode)'
          : monthRevenue > 0
            ? parseFloat(((monthNet / monthRevenue) * 100).toFixed(1))
            : 0,
        netMargin: hideMargins
          ? 'N/A (Audit Mode)'
          : monthRevenue > 0
            ? parseFloat(((monthNet / monthRevenue) * 100).toFixed(1))
            : 0,
      });
    }

    // VAT Auditor mode: replace netProfit/netMargin with "N/A (Audit Mode)"
    const auditMode = hideMargins === 'true';

    return NextResponse.json({
      revenue,
      salesRevenue,
      otherIncome: totalIncome,
      costOfGoods,
      grossProfit,
      grossProfitMargin,
      operatingExpenses,
      netProfit: auditMode ? 'N/A (Audit Mode)' : netProfit,
      netProfitMargin: auditMode ? 'N/A (Audit Mode)' : netProfitMargin,
      incomeDetails: Array.from(incomeByHead.values()),
      expenseDetails: Array.from(expenseByHead.values()),
      monthlyData,
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      auditMode,
    });
  } catch (error) {
    console.error('Error calculating profit & loss:', error);
    return NextResponse.json(
      { error: 'Failed to calculate profit & loss' },
      { status: 500 }
    );
  }
}
