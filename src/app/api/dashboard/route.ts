import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const [
      totalProducts, totalCategories, totalCustomers, totalSuppliers,
      todaySales, todayPurchase, totalExpenses, totalIncome
    ] = await Promise.all([
      db.product.count({ where: { isActive: true } }),
      db.category.count({ where: { isActive: true } }),
      db.customer.count({ where: { isActive: true } }),
      db.supplier.count({ where: { isActive: true } }),
      db.salesOrder.aggregate({ where: { status: "Confirmed" }, _sum: { grandTotal: true } }),
      db.purchaseOrder.aggregate({ where: { status: "Confirmed" }, _sum: { grandTotal: true } }),
      db.expense.aggregate({ _sum: { amount: true } }),
      db.income.aggregate({ _sum: { amount: true } }),
    ]);

    const stockValue = await db.product.aggregate({ where: { isActive: true }, _sum: { costPrice: true, openingStock: true } });
    const bankBalance = await db.bank.aggregate({ _sum: { openingBalance: true } });
    const pendingPO = await db.purchaseOrder.count({ where: { status: "Draft" } });
    const pendingSO = await db.salesOrder.count({ where: { status: "Draft" } });

    // Recent Activities - derive from recent POs, SOs, stock entries
    const [recentPOs, recentSOs, recentStockEntries] = await Promise.all([
      db.purchaseOrder.findMany({
        take: 4,
        orderBy: { createdAt: 'desc' },
        include: { supplier: { select: { name: true } } },
      }),
      db.salesOrder.findMany({
        take: 4,
        orderBy: { createdAt: 'desc' },
        include: { customer: { select: { name: true } } },
      }),
      db.stockEntry.findMany({
        take: 4,
        orderBy: { createdAt: 'desc' },
        include: { product: { select: { name: true } } },
      }),
    ]);

    const recentActivities = [
      ...recentPOs.map((po) => ({
        id: po.id,
        type: 'purchase_order' as const,
        title: `PO ${po.poNumber}`,
        description: `Purchase order to ${po.supplier?.name || 'Unknown'} - ৳${Number(po.grandTotal).toLocaleString()}`,
        status: po.status,
        date: po.createdAt.toISOString(),
      })),
      ...recentSOs.map((so) => ({
        id: so.id,
        type: 'sales_order' as const,
        title: `SO ${so.invoiceNo}`,
        description: `Sales order from ${so.customer?.name || 'Unknown'} - ৳${Number(so.grandTotal).toLocaleString()}`,
        status: so.status,
        date: so.createdAt.toISOString(),
      })),
      ...recentStockEntries.map((se) => ({
        id: se.id,
        type: 'stock_entry' as const,
        title: `${se.type} Stock`,
        description: `${se.product?.name || 'Unknown'} - Qty: ${se.quantity}`,
        status: se.type,
        date: se.createdAt.toISOString(),
      })),
    ]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);

    // Top Selling Products - aggregate from SalesOrderLines
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

    // Monthly Sales Data - last 6 months from SalesOrders
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const salesOrders = await db.salesOrder.findMany({
      where: {
        date: { gte: sixMonthsAgo },
        status: { in: ['Confirmed', 'Delivered'] },
      },
      select: { date: true, grandTotal: true },
    });

    const purchaseOrders = await db.purchaseOrder.findMany({
      where: {
        date: { gte: sixMonthsAgo },
        status: { in: ['Confirmed', 'Received'] },
      },
      select: { date: true, grandTotal: true },
    });

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyMap: Record<string, { month: string; sales: number; purchase: number }> = {};

    // Initialize last 6 months
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyMap[key] = { month: `${monthNames[d.getMonth()]} ${d.getFullYear()}`, sales: 0, purchase: 0 };
    }

    for (const so of salesOrders) {
      const d = new Date(so.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyMap[key]) {
        monthlyMap[key].sales += Number(so.grandTotal);
      }
    }

    for (const po of purchaseOrders) {
      const d = new Date(po.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyMap[key]) {
        monthlyMap[key].purchase += Number(po.grandTotal);
      }
    }

    const monthlySalesData = Object.values(monthlyMap);

    return NextResponse.json({
      totalProducts,
      totalCategories,
      totalCustomers,
      totalSuppliers,
      todaySales: todaySales._sum.grandTotal || 0,
      todayPurchase: todayPurchase._sum.grandTotal || 0,
      stockValue: (stockValue._sum.costPrice || 0) * (stockValue._sum.openingStock || 1),
      cashBalance: bankBalance._sum.openingBalance || 0,
      pendingPO,
      pendingSO,
      totalExpenses: totalExpenses._sum.amount || 0,
      totalIncome: totalIncome._sum.amount || 0,
      recentActivities,
      topSellingProducts,
      monthlySalesData,
    });
  } catch (error) {
    console.error('Dashboard API error:', error);
    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 });
  }
}
