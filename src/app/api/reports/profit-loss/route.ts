import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Revenue: Sum of all confirmed SalesOrder grandTotals + all Incomes
    const [confirmedSales, allIncomes, confirmedPurchases, allExpenses] = await Promise.all([
      db.salesOrder.aggregate({
        where: { status: 'Confirmed' },
        _sum: { grandTotal: true },
      }),
      db.income.findMany({
        where: { isActive: true },
        include: { head: true, paymentOption: true },
      }),
      db.purchaseOrder.aggregate({
        where: { status: 'Confirmed' },
        _sum: { grandTotal: true },
      }),
      db.expense.findMany({
        where: { isActive: true },
        include: { head: true, paymentOption: true },
      }),
    ]);

    const salesRevenue = confirmedSales._sum.grandTotal || 0;
    const totalIncome = allIncomes.reduce((sum, i) => sum + i.amount, 0);
    const revenue = salesRevenue + totalIncome;

    // Cost of Goods: Sum of all confirmed PurchaseOrder grandTotals
    const costOfGoods = confirmedPurchases._sum.grandTotal || 0;

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
    });
  } catch (error) {
    console.error('Error calculating profit & loss:', error);
    return NextResponse.json(
      { error: 'Failed to calculate profit & loss' },
      { status: 500 }
    );
  }
}
