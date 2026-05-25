import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/reports - Various report queries based on type parameter
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');

    switch (type) {
      case 'expense':
        return await getExpenseReport(searchParams);
      case 'income':
        return await getIncomeReport(searchParams);
      case 'transaction-summary':
        return await getTransactionSummary(searchParams);
      case 'monthly-transaction':
        return await getMonthlyTransaction(searchParams);
      default:
        return await getTransactionSummary(searchParams);
    }
  } catch (error) {
    console.error('Reports API error:', error);
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
  }
}

async function getExpenseReport(searchParams: URLSearchParams) {
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const headId = searchParams.get('headId');
  const bankId = searchParams.get('bankId');

  const where: Record<string, unknown> = { isActive: true };
  if (dateFrom || dateTo) {
    where.date = {};
    if (dateFrom) (where.date as Record<string, unknown>).gte = new Date(dateFrom);
    if (dateTo) (where.date as Record<string, unknown>).lte = new Date(dateTo);
  }
  if (headId) where.headId = headId;
  if (bankId) where.bankId = bankId;

  const expenses = await db.expense.findMany({
    where,
    include: {
      head: true,
      paymentOption: true,
      bank: true,
    },
    orderBy: { date: 'desc' },
  });

  const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);

  // Group by head
  const byHead = new Map<string, { head: string; amount: number; count: number }>();
  for (const expense of expenses) {
    const headName = expense.head?.name || 'Unknown';
    const existing = byHead.get(headName);
    if (existing) {
      existing.amount += expense.amount;
      existing.count += 1;
    } else {
      byHead.set(headName, { head: headName, amount: expense.amount, count: 1 });
    }
  }

  // Group by payment method
  const byPayment = new Map<string, { method: string; amount: number; count: number }>();
  for (const expense of expenses) {
    const methodName = expense.paymentOption?.name || 'Cash';
    const existing = byPayment.get(methodName);
    if (existing) {
      existing.amount += expense.amount;
      existing.count += 1;
    } else {
      byPayment.set(methodName, { method: methodName, amount: expense.amount, count: 1 });
    }
  }

  // Group by month
  const byMonth = new Map<string, { month: string; amount: number; count: number }>();
  for (const expense of expenses) {
    const d = new Date(expense.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('en', { month: 'short', year: 'numeric' });
    const existing = byMonth.get(key);
    if (existing) {
      existing.amount += expense.amount;
      existing.count += 1;
    } else {
      byMonth.set(key, { month: label, amount: expense.amount, count: 1 });
    }
  }

  return NextResponse.json({
    expenses,
    totalAmount,
    byHead: Array.from(byHead.values()),
    byPayment: Array.from(byPayment.values()),
    byMonth: Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month)),
  });
}

async function getIncomeReport(searchParams: URLSearchParams) {
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const headId = searchParams.get('headId');
  const bankId = searchParams.get('bankId');

  const where: Record<string, unknown> = { isActive: true };
  if (dateFrom || dateTo) {
    where.date = {};
    if (dateFrom) (where.date as Record<string, unknown>).gte = new Date(dateFrom);
    if (dateTo) (where.date as Record<string, unknown>).lte = new Date(dateTo);
  }
  if (headId) where.headId = headId;
  if (bankId) where.bankId = bankId;

  const incomes = await db.income.findMany({
    where,
    include: {
      head: true,
      paymentOption: true,
      bank: true,
    },
    orderBy: { date: 'desc' },
  });

  const totalAmount = incomes.reduce((sum, i) => sum + i.amount, 0);

  // Group by head
  const byHead = new Map<string, { head: string; amount: number; count: number }>();
  for (const income of incomes) {
    const headName = income.head?.name || 'Unknown';
    const existing = byHead.get(headName);
    if (existing) {
      existing.amount += income.amount;
      existing.count += 1;
    } else {
      byHead.set(headName, { head: headName, amount: income.amount, count: 1 });
    }
  }

  // Group by payment method
  const byPayment = new Map<string, { method: string; amount: number; count: number }>();
  for (const income of incomes) {
    const methodName = income.paymentOption?.name || 'Cash';
    const existing = byPayment.get(methodName);
    if (existing) {
      existing.amount += income.amount;
      existing.count += 1;
    } else {
      byPayment.set(methodName, { method: methodName, amount: income.amount, count: 1 });
    }
  }

  // Group by month
  const byMonth = new Map<string, { month: string; amount: number; count: number }>();
  for (const income of incomes) {
    const d = new Date(income.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('en', { month: 'short', year: 'numeric' });
    const existing = byMonth.get(key);
    if (existing) {
      existing.amount += income.amount;
      existing.count += 1;
    } else {
      byMonth.set(key, { month: label, amount: income.amount, count: 1 });
    }
  }

  return NextResponse.json({
    incomes,
    totalAmount,
    byHead: Array.from(byHead.values()),
    byPayment: Array.from(byPayment.values()),
    byMonth: Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month)),
  });
}

async function getTransactionSummary(_searchParams: URLSearchParams) {
  // Get all transaction types aggregated
  const [
    totalSalesAgg,
    totalPurchaseAgg,
    totalExpenseAgg,
    totalIncomeAgg,
    totalCashCollectionAgg,
    totalCashDeliveryAgg,
    totalBankDepositAgg,
    totalBankWithdrawalAgg,
  ] = await Promise.all([
    db.salesOrder.aggregate({ where: { status: { in: ['Confirmed', 'Delivered'] } }, _sum: { grandTotal: true }, _count: true }),
    db.purchaseOrder.aggregate({ where: { status: { in: ['Confirmed', 'Received'] } }, _sum: { grandTotal: true }, _count: true }),
    db.expense.aggregate({ where: { isActive: true }, _sum: { amount: true }, _count: true }),
    db.income.aggregate({ where: { isActive: true }, _sum: { amount: true }, _count: true }),
    db.cashCollection.aggregate({ where: { isActive: true }, _sum: { amount: true }, _count: true }),
    db.cashDelivery.aggregate({ where: { isActive: true }, _sum: { amount: true }, _count: true }),
    db.bankTransaction.aggregate({ where: { type: 'Deposit', isActive: true }, _sum: { amount: true }, _count: true }),
    db.bankTransaction.aggregate({ where: { type: 'Withdraw', isActive: true }, _sum: { amount: true }, _count: true }),
  ]);

  const totalSales = totalSalesAgg._sum.grandTotal || 0;
  const totalPurchases = totalPurchaseAgg._sum.grandTotal || 0;
  const totalExpenses = totalExpenseAgg._sum.amount || 0;
  const totalIncomes = totalIncomeAgg._sum.amount || 0;
  const totalCashCollections = totalCashCollectionAgg._sum.amount || 0;
  const totalCashDeliveries = totalCashDeliveryAgg._sum.amount || 0;
  const totalBankDeposits = totalBankDepositAgg._sum.amount || 0;
  const totalBankWithdrawals = totalBankWithdrawalAgg._sum.amount || 0;

  const totalInflow = totalSales + totalIncomes + totalCashCollections + totalBankDeposits;
  const totalOutflow = totalPurchases + totalExpenses + totalCashDeliveries + totalBankWithdrawals;
  const netCashFlow = totalInflow - totalOutflow;

  return NextResponse.json({
    summary: {
      totalSales,
      salesCount: totalSalesAgg._count,
      totalPurchases,
      purchaseCount: totalPurchaseAgg._count,
      totalExpenses,
      expenseCount: totalExpenseAgg._count,
      totalIncomes,
      incomeCount: totalIncomeAgg._count,
      totalCashCollections,
      cashCollectionCount: totalCashCollectionAgg._count,
      totalCashDeliveries,
      cashDeliveryCount: totalCashDeliveryAgg._count,
      totalBankDeposits,
      bankDepositCount: totalBankDepositAgg._count,
      totalBankWithdrawals,
      bankWithdrawalCount: totalBankWithdrawalAgg._count,
      totalInflow,
      totalOutflow,
      netCashFlow,
    },
  });
}

async function getMonthlyTransaction(searchParams: URLSearchParams) {
  const months = parseInt(searchParams.get('months') || '6', 10);
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

  // Fetch all relevant transactions within date range
  const [salesOrders, purchaseOrders, expenses, incomes] = await Promise.all([
    db.salesOrder.findMany({
      where: { date: { gte: startDate }, status: { in: ['Confirmed', 'Delivered'] } },
      select: { date: true, grandTotal: true },
    }),
    db.purchaseOrder.findMany({
      where: { date: { gte: startDate }, status: { in: ['Confirmed', 'Received'] } },
      select: { date: true, grandTotal: true },
    }),
    db.expense.findMany({
      where: { date: { gte: startDate }, isActive: true },
      select: { date: true, amount: true },
    }),
    db.income.findMany({
      where: { date: { gte: startDate }, isActive: true },
      select: { date: true, amount: true },
    }),
  ]);

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthlyMap: Record<string, { month: string; sales: number; purchases: number; expenses: number; incomes: number; net: number }> = {};

  // Initialize months
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthlyMap[key] = {
      month: `${monthNames[d.getMonth()]} ${d.getFullYear()}`,
      sales: 0,
      purchases: 0,
      expenses: 0,
      incomes: 0,
      net: 0,
    };
  }

  for (const so of salesOrders) {
    const d = new Date(so.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (monthlyMap[key]) monthlyMap[key].sales += Number(so.grandTotal);
  }

  for (const po of purchaseOrders) {
    const d = new Date(po.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (monthlyMap[key]) monthlyMap[key].purchases += Number(po.grandTotal);
  }

  for (const exp of expenses) {
    const d = new Date(exp.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (monthlyMap[key]) monthlyMap[key].expenses += Number(exp.amount);
  }

  for (const inc of incomes) {
    const d = new Date(inc.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (monthlyMap[key]) monthlyMap[key].incomes += Number(inc.amount);
  }

  // Calculate net for each month
  for (const key of Object.keys(monthlyMap)) {
    const m = monthlyMap[key];
    m.net = m.sales + m.incomes - m.purchases - m.expenses;
  }

  return NextResponse.json({
    months: Object.values(monthlyMap),
  });
}
