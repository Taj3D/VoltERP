import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Core counts - batch together
    const [
      totalProducts, activeProducts,
      totalCustomers, activeCustomers,
      totalSuppliers, activeSuppliers,
    ] = await Promise.all([
      db.product.count(),
      db.product.count({ where: { isActive: true } }),
      db.customer.count(),
      db.customer.count({ where: { isActive: true } }),
      db.supplier.count(),
      db.supplier.count({ where: { isActive: true } }),
    ]);

    // Financials - batch together
    const [
      confirmedSalesAgg,
      totalExpensesAgg,
      totalIncomeAgg,
      confirmedPurchasesAgg,
    ] = await Promise.all([
      db.salesOrder.aggregate({ where: { status: { in: ['Confirmed', 'Delivered'] } }, _sum: { grandTotal: true } }),
      db.expense.aggregate({ _sum: { amount: true } }),
      db.income.aggregate({ _sum: { amount: true } }),
      db.purchaseOrder.aggregate({ where: { status: { in: ['Confirmed', 'Received'] } }, _sum: { grandTotal: true } }),
    ]);

    const totalRevenue = confirmedSalesAgg._sum.grandTotal || 0;
    const totalExpenses = totalExpensesAgg._sum.amount || 0;
    const totalIncome = totalIncomeAgg._sum.amount || 0;
    const totalPurchases = confirmedPurchasesAgg._sum.grandTotal || 0;
    const netProfit = totalRevenue + totalIncome - totalPurchases - totalExpenses;

    // Stock value
    const stockValue = await db.product.aggregate({
      where: { isActive: true },
      _sum: { costPrice: true, openingStock: true },
    });

    // Bank balance
    const bankBalance = await db.bank.aggregate({ _sum: { openingBalance: true } });

    // Recent Activities - limit to 8
    const auditLogs = await db.auditLog.findMany({
      take: 8,
      orderBy: { createdAt: 'desc' },
    });

    const recentActivities = auditLogs.map((log) => ({
      id: log.id,
      type: log.action.toLowerCase(),
      title: `${log.action} ${log.module}`,
      description: log.recordLabel || log.details || `${log.action} on ${log.module}`,
      status: log.action,
      date: log.createdAt.toISOString(),
      userName: log.userName,
    }));

    // Top Selling Products - simple aggregation
    const salesLines = await db.salesOrderLine.findMany({
      include: {
        product: { select: { id: true, name: true, productCode: true } },
      },
    });

    const productSalesMap: Record<string, { productId: string; name: string; productCode: string; totalQuantity: number; totalRevenue: number }> = {};
    for (const line of salesLines) {
      const pid = line.productId;
      if (!productSalesMap[pid]) {
        productSalesMap[pid] = {
          productId: pid,
          name: line.product?.name || 'Unknown',
          productCode: line.product?.productCode || '',
          totalQuantity: 0,
          totalRevenue: 0,
        };
      }
      productSalesMap[pid].totalQuantity += Number(line.quantity);
      productSalesMap[pid].totalRevenue += Number(line.total);
    }

    const topSellingProducts = Object.values(productSalesMap)
      .sort((a, b) => b.totalQuantity - a.totalQuantity)
      .slice(0, 5);

    // Monthly Data - last 6 months
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const [salesOrders, purchaseOrders] = await Promise.all([
      db.salesOrder.findMany({
        where: { date: { gte: sixMonthsAgo }, status: { in: ['Confirmed', 'Delivered'] } },
        select: { date: true, grandTotal: true },
      }),
      db.purchaseOrder.findMany({
        where: { date: { gte: sixMonthsAgo }, status: { in: ['Confirmed', 'Received'] } },
        select: { date: true, grandTotal: true },
      }),
    ]);

    const monthlyMap: Record<string, { month: string; sales: number; purchase: number; expenses: number }> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyMap[key] = { month: `${monthNames[d.getMonth()]} ${d.getFullYear()}`, sales: 0, purchase: 0, expenses: 0 };
    }

    for (const so of salesOrders) {
      const d = new Date(so.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyMap[key]) monthlyMap[key].sales += Number(so.grandTotal);
    }

    for (const po of purchaseOrders) {
      const d = new Date(po.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyMap[key]) monthlyMap[key].purchase += Number(po.grandTotal);
    }

    const monthlySalesData = Object.values(monthlyMap);

    // Low Stock Products - lightweight query
    const lowStockProducts = await db.product.findMany({
      where: { isActive: true, openingStock: { lte: db.product.fields.reorderLevel } },
      take: 10,
      select: { id: true, name: true, productCode: true, openingStock: true, reorderLevel: true, category: { select: { name: true } } },
    }).catch(() => []);

    // Category Distribution
    const categoryDistribution = await db.category.findMany({
      where: { isActive: true },
      include: { _count: { select: { products: { where: { isActive: true } } } } },
      orderBy: { name: 'asc' },
    });

    // Pending Orders
    const [pendingPOCount, pendingSOCount] = await Promise.all([
      db.purchaseOrder.count({ where: { status: { in: ['Draft', 'Pending'] } } }),
      db.salesOrder.count({ where: { status: { in: ['Draft', 'Pending'] } } }),
    ]);

    return NextResponse.json({
      totalProducts,
      activeProducts,
      totalCustomers,
      activeCustomers,
      totalSuppliers,
      activeSuppliers,
      totalRevenue,
      totalExpenses,
      totalIncome,
      totalPurchases,
      netProfit,
      stockValue: (stockValue._sum.costPrice || 0) * (stockValue._sum.openingStock || 1),
      cashBalance: bankBalance._sum.openingBalance || 0,
      recentActivities,
      topSellingProducts,
      monthlySalesData,
      monthlyPurchaseData: monthlySalesData.map(m => ({ month: m.month, purchase: m.purchase })),
      lowStockProducts: lowStockProducts.map(p => ({
        id: p.id,
        name: p.name,
        productCode: p.productCode,
        currentStock: Number(p.openingStock),
        reorderLevel: Number(p.reorderLevel),
        category: p.category?.name || 'Unknown',
      })),
      pendingOrders: { pendingPOCount, pendingSOCount },
      categoryDistribution: categoryDistribution.filter(c => c._count.products > 0).map(c => ({
        id: c.id,
        name: c.name,
        count: c._count.products,
      })),
    });
  } catch (error) {
    console.error('Dashboard API error:', error);
    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 });
  }
}
