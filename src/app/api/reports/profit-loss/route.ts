import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Revenue: Sum of all confirmed SalesOrder grandTotals + all Incomes
    const [confirmedSales, allIncomes, confirmedPurchases, allExpenses] = await Promise.all([
      db.salesOrder.findMany({
        where: { status: 'Confirmed' },
        select: { grandTotal: true, date: true },
      }),
      db.income.findMany({
        where: { isActive: true },
        include: { head: true, paymentOption: true },
      }),
      db.purchaseOrder.findMany({
        where: { status: 'Confirmed' },
        select: { grandTotal: true, date: true },
      }),
      db.expense.findMany({
        where: { isActive: true },
        include: { head: true, paymentOption: true },
      }),
    ]);

    const salesRevenue = confirmedSales.reduce((sum, s) => sum + s.grandTotal, 0);
    const totalIncome = allIncomes.reduce((sum, i) => sum + i.amount, 0);
    const revenue = salesRevenue + totalIncome;

    // Cost of Goods: Sum of all confirmed PurchaseOrder grandTotals
    const costOfGoods = confirmedPurchases.reduce((sum, p) => sum + p.grandTotal, 0);

    // Gross Profit
    const grossProfit = revenue - costOfGoods;

    // Operating Expenses: Sum of all Expenses
    const operatingExpenses = allExpenses.reduce((sum, e) => sum + e.amount, 0);

    // Net Profit
    const netProfit = grossProfit - operatingExpenses;

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

    // Monthly breakdown for charts (last 12 months)
    const now = new Date();
    const monthlyData: { month: string; revenue: number; expenses: number; profit: number; profitMargin: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStr = d.toLocaleString('en', { month: 'short', year: '2-digit' });
      const year = d.getFullYear();
      const month = d.getMonth();

      const monthSales = confirmedSales
        .filter(s => { const sd = new Date(s.date); return sd.getFullYear() === year && sd.getMonth() === month; })
        .reduce((sum, s) => sum + s.grandTotal, 0);
      const monthIncome = allIncomes
        .filter(i => { const id = new Date(i.date); return id.getFullYear() === year && id.getMonth() === month; })
        .reduce((sum, i) => sum + i.amount, 0);
      const monthPurchases = confirmedPurchases
        .filter(p => { const pd = new Date(p.date); return pd.getFullYear() === year && pd.getMonth() === month; })
        .reduce((sum, p) => sum + p.grandTotal, 0);
      const monthExpenses = allExpenses
        .filter(e => { const ed = new Date(e.date); return ed.getFullYear() === year && ed.getMonth() === month; })
        .reduce((sum, e) => sum + e.amount, 0);

      const monthRevenue = monthSales + monthIncome;
      const monthProfit = monthRevenue - monthPurchases - monthExpenses;

      monthlyData.push({
        month: monthStr,
        revenue: monthRevenue,
        expenses: monthPurchases + monthExpenses,
        profit: monthProfit,
        profitMargin: monthRevenue > 0 ? parseFloat(((monthProfit / monthRevenue) * 100).toFixed(1)) : 0,
      });
    }

    return NextResponse.json({
      revenue,
      salesRevenue,
      otherIncome: totalIncome,
      costOfGoods,
      grossProfit,
      grossProfitMargin: revenue > 0 ? ((grossProfit / revenue) * 100).toFixed(2) : '0.00',
      operatingExpenses,
      netProfit,
      netProfitMargin: revenue > 0 ? ((netProfit / revenue) * 100).toFixed(2) : '0.00',
      incomeDetails: Array.from(incomeByHead.values()),
      expenseDetails: Array.from(expenseByHead.values()),
      monthlyData,
    });
  } catch (error) {
    console.error('Error calculating profit & loss:', error);
    return NextResponse.json(
      { error: 'Failed to calculate profit & loss' },
      { status: 500 }
    );
  }
}
