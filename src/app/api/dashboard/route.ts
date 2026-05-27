import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, maskForVatAuditor } from '@/lib/api-security';

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Dashboard', 'GET');
  if (!security.authorized) return security.response;
  try {
    // FIX 4: Consistent revenue status filter - exclude Draft and Cancelled
    const revenueStatusFilter = { notIn: ['Draft', 'Cancelled'] };

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
      db.salesOrder.aggregate({ where: { status: revenueStatusFilter, isActive: true }, _sum: { grandTotal: true } }),
      db.expense.aggregate({ where: { isActive: true }, _sum: { amount: true } }),
      db.income.aggregate({ where: { isActive: true }, _sum: { amount: true } }),
      db.purchaseOrder.aggregate({ where: { status: revenueStatusFilter, isActive: true }, _sum: { grandTotal: true } }),
    ]);

    const totalRevenue = confirmedSalesAgg._sum.grandTotal || 0;
    const totalExpenses = totalExpensesAgg._sum.amount || 0;
    const totalIncome = totalIncomeAgg._sum.amount || 0;
    const totalPurchases = confirmedPurchasesAgg._sum.grandTotal || 0;

    // FIX: COGS = sum of (quantity × costPrice) from sales order lines for confirmed sales
    // NOT total purchase order amounts (which includes unsold inventory)
    const salesLinesForCOGS = await db.salesOrderLine.findMany({
      where: {
        salesOrder: { status: revenueStatusFilter, isActive: true },
      },
      include: {
        product: { select: { costPrice: true } },
      },
    });
    const cogs = salesLinesForCOGS.reduce((sum, line) => {
      const costPrice = line.product?.costPrice || 0;
      return sum + (Number(line.quantity) * Number(costPrice));
    }, 0);

    const grossProfit = totalRevenue - cogs;
    const netProfit = totalRevenue + totalIncome - cogs - totalExpenses;

    // FIX: Compute totalReceivables and totalPayables for KPI accuracy
    const [salesAgg, collectionsAgg, returnsAgg, purchasesAgg, deliveriesAgg, purchaseReturnsAgg, custOpenDrAgg, custOpenCrAgg, suppOpenCrAgg, suppOpenDrAgg] = await Promise.all([
      db.salesOrder.aggregate({ where: { status: revenueStatusFilter, isActive: true }, _sum: { grandTotal: true } }),
      db.cashCollection.aggregate({ where: { isActive: true }, _sum: { amount: true } }),
      db.salesReturn.aggregate({ where: { isActive: true }, _sum: { grandTotal: true } }),
      db.purchaseOrder.aggregate({ where: { status: revenueStatusFilter, isActive: true }, _sum: { grandTotal: true } }),
      db.cashDelivery.aggregate({ where: { isActive: true }, _sum: { amount: true } }),
      db.purchaseReturn.aggregate({ where: { isActive: true }, _sum: { grandTotal: true } }),
      db.customer.aggregate({ where: { openingBalanceType: 'Dr', isActive: true }, _sum: { openingBalance: true } }),
      db.customer.aggregate({ where: { openingBalanceType: 'Cr', isActive: true }, _sum: { openingBalance: true } }),
      db.supplier.aggregate({ where: { openingBalanceType: 'Cr', isActive: true }, _sum: { openingBalance: true } }),
      db.supplier.aggregate({ where: { openingBalanceType: 'Dr', isActive: true }, _sum: { openingBalance: true } }),
    ]);

    const totalReceivables = Math.max(0,
      Number(custOpenDrAgg._sum.openingBalance || 0) +
      Number(salesAgg._sum.grandTotal || 0) -
      Number(collectionsAgg._sum.amount || 0) -
      Number(returnsAgg._sum.grandTotal || 0) -
      Number(custOpenCrAgg._sum.openingBalance || 0)
    );
    const totalPayables = Math.max(0,
      Number(suppOpenCrAgg._sum.openingBalance || 0) +
      Number(purchasesAgg._sum.grandTotal || 0) -
      Number(deliveriesAgg._sum.amount || 0) -
      Number(purchaseReturnsAgg._sum.grandTotal || 0) -
      Number(suppOpenDrAgg._sum.openingBalance || 0)
    );

    // FIX 1: Compute stock value as SUM(costPrice * openingStock) per product
    // If total stock is 0, inventory value should be 0
    const activeProductsForStock = await db.product.findMany({
      where: { isActive: true },
      select: { costPrice: true, openingStock: true },
    });
    const stockValue = activeProductsForStock.reduce(
      (sum, p) => sum + Number(p.costPrice) * Number(p.openingStock),
      0
    );

    // FIX 3: Bank balance - use currentBalance not openingBalance
    const bankBalance = await db.bank.aggregate({ _sum: { currentBalance: true } });

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
      where: {
        salesOrder: { status: revenueStatusFilter, isActive: true },
      },
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
        where: { date: { gte: sixMonthsAgo }, status: revenueStatusFilter, isActive: true },
        select: { date: true, grandTotal: true },
      }),
      db.purchaseOrder.findMany({
        where: { date: { gte: sixMonthsAgo }, status: revenueStatusFilter, isActive: true },
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

    // FIX 2: Low Stock Products - filter where openingStock <= reorderLevel
    // Since Prisma SQLite doesn't support field-to-field comparison in where,
    // fetch all active products and filter in JS
    const allActiveProducts = await db.product.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        productCode: true,
        openingStock: true,
        reorderLevel: true,
        category: { select: { name: true } },
      },
    });

    const lowStockProducts = allActiveProducts
      .filter((p) => Number(p.openingStock) <= Number(p.reorderLevel))
      .sort((a, b) => {
        // Sort by deficit (highest first)
        const deficitA = Number(a.reorderLevel) - Number(a.openingStock);
        const deficitB = Number(b.reorderLevel) - Number(b.openingStock);
        return deficitB - deficitA;
      })
      .slice(0, 10)
      .map((p) => ({
        id: p.id,
        name: p.name,
        productCode: p.productCode,
        currentStock: Number(p.openingStock),
        reorderLevel: Number(p.reorderLevel),
        category: p.category?.name || 'Unknown',
      }));

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

    // Hire Sales Installments - recent hire sales with customer info and installment details
    const hireSalesRecords = await db.hireSales.findMany({
      where: { isActive: true },
      take: 10,
      orderBy: { date: 'desc' },
      include: {
        customer: { select: { id: true, name: true, customerCode: true, phone: true } },
        lines: {
          include: {
            product: { select: { id: true, name: true, productCode: true } },
          },
        },
      },
    });

    const hireInstallments = hireSalesRecords.map((hs) => ({
      id: hs.id,
      invoiceNo: hs.invoiceNo,
      date: hs.date.toISOString(),
      customer: hs.customer
        ? {
            id: hs.customer.id,
            name: hs.customer.name,
            customerCode: hs.customer.customerCode,
            phone: hs.customer.phone,
          }
        : null,
      hireRate: hs.hireRate,
      duration: hs.duration,
      installmentAmount: hs.installmentAmount,
      totalPaid: hs.totalPaid,
      grandTotal: hs.grandTotal,
      balanceAmount: hs.grandTotal - hs.totalPaid,
      currentStatus: hs.currentStatus,
      nextPaymentDate: hs.nextPaymentDate ? hs.nextPaymentDate.toISOString() : null,
      returnDate: hs.returnDate ? hs.returnDate.toISOString() : null,
      products: hs.lines.map((l) => ({
        id: l.product?.id,
        name: l.product?.name,
        productCode: l.product?.productCode,
        quantity: l.quantity,
        rate: l.rate,
        total: l.total,
      })),
    }));

    // VAT Auditor masking for dashboard
    const isVatAuditor = security.user.role === 'vat_auditor';
    const responseData = {
      totalProducts,
      activeProducts,
      totalCustomers,
      activeCustomers,
      totalSuppliers,
      activeSuppliers,
      totalRevenue: isVatAuditor ? 'N/A (Audit Mode)' : totalRevenue,
      totalExpenses: isVatAuditor ? 'N/A (Audit Mode)' : totalExpenses,
      totalIncome: isVatAuditor ? 'N/A (Audit Mode)' : totalIncome,
      totalPurchases: isVatAuditor ? 'N/A (Audit Mode)' : totalPurchases,
      netProfit: isVatAuditor ? 'N/A (Audit Mode)' : netProfit,
      cogs: isVatAuditor ? 'N/A (Audit Mode)' : cogs,
      grossProfit: isVatAuditor ? 'N/A (Audit Mode)' : grossProfit,
      totalReceivables: isVatAuditor ? 'N/A (Audit Mode)' : totalReceivables,
      totalPayables: isVatAuditor ? 'N/A (Audit Mode)' : totalPayables,
      stockValue: isVatAuditor ? 'N/A (Audit Mode)' : stockValue,
      cashBalance: isVatAuditor ? 'N/A (Audit Mode)' : (bankBalance._sum.currentBalance || 0),
      recentActivities,
      topSellingProducts: isVatAuditor
        ? topSellingProducts.map(p => ({ ...p, totalRevenue: 'N/A (Audit Mode)' }))
        : topSellingProducts,
      monthlySalesData: isVatAuditor
        ? monthlySalesData.map(m => ({ ...m, sales: 'N/A (Audit Mode)', purchase: 'N/A (Audit Mode)' }))
        : monthlySalesData,
      monthlyPurchaseData: isVatAuditor
        ? monthlySalesData.map(m => ({ month: m.month, purchase: 'N/A (Audit Mode)' }))
        : monthlySalesData.map(m => ({ month: m.month, purchase: m.purchase })),
      lowStockProducts,
      pendingOrders: { pendingPOCount, pendingSOCount },
      categoryDistribution: categoryDistribution.filter(c => c._count.products > 0).map(c => ({
        id: c.id,
        name: c.name,
        count: c._count.products,
      })),
      hireInstallments: isVatAuditor
        ? hireInstallments.map(hi => ({
            ...hi,
            hireRate: 'N/A (Audit Mode)',
            installmentAmount: 'N/A (Audit Mode)',
            totalPaid: 'N/A (Audit Mode)',
            grandTotal: 'N/A (Audit Mode)',
            balanceAmount: 'N/A (Audit Mode)',
            products: hi.products?.map((p: any) => ({ ...p, rate: 'N/A (Audit Mode)', total: 'N/A (Audit Mode)' })),
          }))
        : hireInstallments,
    };
    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Dashboard API error:', error);
    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 });
  }
}
