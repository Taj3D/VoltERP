import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // === ASSETS ===

    // Total stock value: sum of (costPrice * openingStock) for all active products
    const products = await db.product.findMany({
      where: { isActive: true },
      select: { costPrice: true, openingStock: true },
    });
    const stockValue = products.reduce(
      (sum, p) => sum + p.costPrice * p.openingStock,
      0
    );

    // Bank balances: sum of all bank balances (opening + deposits - withdrawals + incomes - expenses + collections - deliveries)
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

    const bankBalance = banks.reduce((sum, bank) => {
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

      const balance =
        bank.openingBalance +
        deposits -
        withdrawals +
        bankIncome -
        bankExpense +
        collections -
        deliveries;
      return sum + balance;
    }, 0);

    // Customer receivables: sum of all confirmed sales orders - cash collections per customer
    const customers = await db.customer.findMany({
      where: { isActive: true },
      include: {
        salesOrders: { where: { status: 'Confirmed' } },
        cashCollections: true,
        salesReturns: true,
      },
    });

    const receivables = customers.reduce((sum, customer) => {
      const totalSales = customer.salesOrders.reduce((s, so) => s + so.grandTotal, 0);
      const totalCollections = customer.cashCollections.reduce((s, c) => s + c.amount, 0);
      const totalReturns = customer.salesReturns.reduce((s, r) => s + r.grandTotal, 0);
      const balance = customer.openingBalance + totalSales - totalCollections - totalReturns;
      return sum + Math.max(balance, 0);
    }, 0);

    const totalAssets = stockValue + bankBalance + receivables;

    // === LIABILITIES ===

    // Supplier payables: sum of all confirmed purchase orders - cash deliveries per supplier
    const suppliers = await db.supplier.findMany({
      where: { isActive: true },
      include: {
        purchaseOrders: { where: { status: 'Confirmed' } },
        cashDeliveries: true,
        purchaseReturns: true,
      },
    });

    const payables = suppliers.reduce((sum, supplier) => {
      const totalPurchases = supplier.purchaseOrders.reduce((s, po) => s + po.grandTotal, 0);
      const totalDeliveries = supplier.cashDeliveries.reduce((s, d) => s + d.amount, 0);
      const totalReturns = supplier.purchaseReturns.reduce((s, r) => s + r.grandTotal, 0);
      const balance = supplier.openingBalance + totalPurchases - totalDeliveries - totalReturns;
      return sum + Math.max(balance, 0);
    }, 0);

    // Equity: Net profit from P&L (revenue - COGS - expenses)
    const [confirmedSales, allIncomes, confirmedPurchases, allExpenses] = await Promise.all([
      db.salesOrder.aggregate({
        where: { status: 'Confirmed' },
        _sum: { grandTotal: true },
      }),
      db.income.aggregate({ _sum: { amount: true } }),
      db.purchaseOrder.aggregate({
        where: { status: 'Confirmed' },
        _sum: { grandTotal: true },
      }),
      db.expense.aggregate({ _sum: { amount: true } }),
    ]);

    const revenue = (confirmedSales._sum.grandTotal || 0) + (allIncomes._sum.amount || 0);
    const costOfGoods = confirmedPurchases._sum.grandTotal || 0;
    const operatingExpenses = allExpenses._sum.amount || 0;
    const equity = revenue - costOfGoods - operatingExpenses;

    const totalLiabilities = payables + equity;

    // Asset composition for PieChart
    const assetComposition = [
      { name: 'Stock Value', value: stockValue, color: '#3b82f6' },
      { name: 'Bank Balance', value: bankBalance, color: '#10b981' },
      { name: 'Receivables', value: receivables, color: '#f59e0b' },
    ].filter(a => a.value > 0);

    // Liability composition for PieChart
    const liabilityComposition = [
      { name: 'Payables', value: payables, color: '#ef4444' },
      { name: 'Equity', value: Math.max(equity, 0), color: '#8b5cf6' },
    ].filter(l => l.value > 0);

    // Comparison data for BarChart
    const comparisonData = [
      { category: 'Assets', value: totalAssets },
      { category: 'Liabilities', value: totalLiabilities },
      { category: 'Equity', value: Math.max(equity, 0) },
    ];

    return NextResponse.json({
      assets: {
        stock: stockValue,
        bankBalance,
        receivables,
        totalAssets,
      },
      liabilities: {
        payables,
        equity,
        totalLiabilities,
      },
      balanced: Math.abs(totalAssets - totalLiabilities) < 0.01,
      assetComposition,
      liabilityComposition,
      comparisonData,
    });
  } catch (error) {
    console.error('Error calculating balance sheet:', error);
    return NextResponse.json(
      { error: 'Failed to calculate balance sheet' },
      { status: 500 }
    );
  }
}
