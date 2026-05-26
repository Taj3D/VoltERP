import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, validateVatMode } from '@/lib/api-security';
import type { UserRole } from '@/lib/api-security';

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Reports', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { searchParams } = new URL(request.url);
    // VAT-001: Validate vatMode
    const rawVatMode = searchParams.get('vatMode') === 'true';
    const userRole = security.user.role as UserRole;
    const vatMode = validateVatMode(rawVatMode, userRole);

    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    // Sales today
    const salesToday = await db.salesOrder.aggregate({
      where: {
        status: 'Confirmed',
        date: { gte: startOfDay, lt: endOfDay },
      },
      _sum: { grandTotal: true },
    });

    // Purchase today
    const purchaseToday = await db.purchaseOrder.aggregate({
      where: {
        status: 'Confirmed',
        date: { gte: startOfDay, lt: endOfDay },
      },
      _sum: { grandTotal: true },
    });

    // Total stock value
    const products = await db.product.findMany({
      where: { isActive: true },
      select: { costPrice: true, openingStock: true, name: true },
    });
    const stockValue = products.reduce(
      (sum, p) => sum + p.costPrice * p.openingStock,
      0
    );

    // MIS-001 FIX: Mask stock value for VAT auditor

    // Cash balance (bank balances)
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
    const cashBalance = banks.reduce((sum, bank) => {
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
      return (
        sum +
        bank.openingBalance +
        deposits -
        withdrawals +
        bankIncome -
        bankExpense +
        collections -
        deliveries
      );
    }, 0);

    // Customer receivables
    const customers = await db.customer.findMany({
      where: { isActive: true },
      include: {
        salesOrders: { where: { status: 'Confirmed' } },
        cashCollections: true,
        salesReturns: true,
      },
    });
    const receivables = customers.reduce((sum, c) => {
      const totalSales = c.salesOrders.reduce((s, so) => s + so.grandTotal, 0);
      const totalCollections = c.cashCollections.reduce((s, cc) => s + cc.amount, 0);
      const totalReturns = c.salesReturns.reduce((s, r) => s + r.grandTotal, 0);
      const balance = c.openingBalance + totalSales - totalCollections - totalReturns;
      return sum + Math.max(balance, 0);
    }, 0);

    // Supplier payables
    const suppliers = await db.supplier.findMany({
      where: { isActive: true },
      include: {
        purchaseOrders: { where: { status: 'Confirmed' } },
        cashDeliveries: true,
        purchaseReturns: true,
      },
    });
    const payables = suppliers.reduce((sum, s) => {
      const totalPurchases = s.purchaseOrders.reduce((ps, po) => ps + po.grandTotal, 0);
      const totalDeliveries = s.cashDeliveries.reduce((ds, d) => ds + d.amount, 0);
      const totalReturns = s.purchaseReturns.reduce((rs, r) => rs + r.grandTotal, 0);
      const balance = s.openingBalance + totalPurchases - totalDeliveries - totalReturns;
      return sum + Math.max(balance, 0);
    }, 0);

    // Top products by sales quantity
    const salesLines = await db.salesOrderLine.findMany({
      where: { salesOrder: { status: 'Confirmed' } },
      include: { product: true },
    });

    const productSalesMap = new Map<string, { name: string; totalQuantity: number; totalRevenue: number }>();
    for (const line of salesLines) {
      const existing = productSalesMap.get(line.productId);
      if (existing) {
        existing.totalQuantity += line.quantity;
        existing.totalRevenue += line.total;
      } else {
        productSalesMap.set(line.productId, {
          name: line.product?.name || 'Unknown',
          totalQuantity: line.quantity,
          totalRevenue: line.total,
        });
      }
    }

    const topProducts = Array.from(productSalesMap.values())
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 10);

    // Monthly sales for the last 12 months
    const twelveMonthsAgo = new Date(today);
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const monthlySalesOrders = await db.salesOrder.findMany({
      where: {
        status: 'Confirmed',
        date: { gte: twelveMonthsAgo },
      },
      select: { date: true, grandTotal: true },
    });

    const monthlySalesMap = new Map<string, number>();
    for (const so of monthlySalesOrders) {
      const monthKey = `${so.date.getFullYear()}-${String(so.date.getMonth() + 1).padStart(2, '0')}`;
      monthlySalesMap.set(monthKey, (monthlySalesMap.get(monthKey) || 0) + so.grandTotal);
    }

    const monthlySales = Array.from(monthlySalesMap.entries())
      .map(([month, total]) => ({ month, total }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return NextResponse.json({
      salesToday: salesToday._sum.grandTotal || 0,
      purchaseToday: purchaseToday._sum.grandTotal || 0,
      stockValue: vatMode ? 'N/A (Audit Mode)' : stockValue,
      cashBalance: vatMode ? 'N/A (Audit Mode)' : cashBalance,
      receivables,
      payables,
      topProducts,
      monthlySales,
    });
  } catch (error) {
    console.error('Error fetching basic report:', error);
    return NextResponse.json(
      { error: 'Failed to fetch basic report' },
      { status: 500 }
    );
  }
}
