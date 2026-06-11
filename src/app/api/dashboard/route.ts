import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  safeFinancialAdd,
  safeFinancialSubtract,
  safeFinancialRound,
  type UserRole,
  maskDashboardForVatAuditor,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Dashboard', 'GET');
  if (!security.authorized) return security.response;

  try {
    // Multi-tenant isolation: filter by companyId
    const companyId = security.user.companyId;
    const companyFilter = companyId ? { companyId } : {};

    // FIX 4: Consistent revenue status filter - exclude Draft and Cancelled
    const revenueStatusFilter = { notIn: ['Draft', 'Cancelled'] };

    // Core counts - batch together (all with companyId filter)
    const [
      totalProducts, activeProducts,
      totalCustomers, activeCustomers,
      totalSuppliers, activeSuppliers,
    ] = await Promise.all([
      db.product.count({ where: { ...companyFilter } }),
      db.product.count({ where: { isActive: true, ...companyFilter } }),
      db.customer.count({ where: { ...companyFilter } }),
      db.customer.count({ where: { isActive: true, ...companyFilter } }),
      db.supplier.count({ where: { ...companyFilter } }),
      db.supplier.count({ where: { isActive: true, ...companyFilter } }),
    ]);

    // Financials - batch together (all with companyId filter)
    const [
      confirmedSalesAgg,
      totalExpensesAgg,
      totalIncomeAgg,
      confirmedPurchasesAgg,
    ] = await Promise.all([
      db.salesOrder.aggregate({ where: { status: revenueStatusFilter, isActive: true, ...companyFilter }, _sum: { grandTotal: true } }),
      db.expense.aggregate({ where: { isActive: true, ...companyFilter }, _sum: { amount: true } }),
      db.income.aggregate({ where: { isActive: true, ...companyFilter }, _sum: { amount: true } }),
      db.purchaseOrder.aggregate({ where: { status: revenueStatusFilter, isActive: true, ...companyFilter }, _sum: { grandTotal: true } }),
    ]);

    const totalRevenue = Number(confirmedSalesAgg._sum.grandTotal || 0);
    const totalExpenses = Number(totalExpensesAgg._sum.amount || 0);
    const totalIncome = Number(totalIncomeAgg._sum.amount || 0);
    const totalPurchases = Number(confirmedPurchasesAgg._sum.grandTotal || 0);

    // FIX: COGS = sum of (quantity × costPrice) from sales order lines for confirmed sales
    // Filter by salesOrder with companyId
    const salesLinesForCOGS = await db.salesOrderLine.findMany({
      where: {
        salesOrder: { status: revenueStatusFilter, isActive: true, ...companyFilter },
      },
      include: {
        product: { select: { costPrice: true } },
      },
    });
    const cogs = salesLinesForCOGS.reduce((sum, line) => {
      const costPrice = Number(line.product?.costPrice || 0);
      return safeFinancialAdd(sum, safeFinancialRound(Number(line.quantity) * costPrice));
    }, 0);

    const grossProfit = safeFinancialSubtract(totalRevenue, cogs);
    const netProfit = safeFinancialSubtract(safeFinancialAdd(totalRevenue, totalIncome), safeFinancialAdd(cogs, totalExpenses));

    // FIX: Compute totalReceivables and totalPayables for KPI accuracy
    // All with companyId filtering
    const [salesAgg, collectionsAgg, returnsAgg, purchasesAgg, deliveriesAgg, purchaseReturnsAgg, custOpenDrAgg, custOpenCrAgg, suppOpenCrAgg, suppOpenDrAgg] = await Promise.all([
      db.salesOrder.aggregate({ where: { status: revenueStatusFilter, isActive: true, ...companyFilter }, _sum: { grandTotal: true } }),
      db.cashCollection.aggregate({ where: { isActive: true, ...companyFilter }, _sum: { amount: true } }),
      db.salesReturn.aggregate({ where: { isActive: true, ...companyFilter }, _sum: { grandTotal: true } }),
      db.purchaseOrder.aggregate({ where: { status: revenueStatusFilter, isActive: true, ...companyFilter }, _sum: { grandTotal: true } }),
      db.cashDelivery.aggregate({ where: { isActive: true, ...companyFilter }, _sum: { amount: true } }),
      db.purchaseReturn.aggregate({ where: { isActive: true, ...companyFilter }, _sum: { grandTotal: true } }),
      db.customer.aggregate({ where: { openingBalanceType: 'Dr', isActive: true, ...companyFilter }, _sum: { openingBalance: true } }),
      db.customer.aggregate({ where: { openingBalanceType: 'Cr', isActive: true, ...companyFilter }, _sum: { openingBalance: true } }),
      db.supplier.aggregate({ where: { openingBalanceType: 'Cr', isActive: true, ...companyFilter }, _sum: { openingBalance: true } }),
      db.supplier.aggregate({ where: { openingBalanceType: 'Dr', isActive: true, ...companyFilter }, _sum: { openingBalance: true } }),
    ]);

    // Receivables: openingDr + sales - collections - returns - openingCr
    const receivablesBase = safeFinancialAdd(
      Number(custOpenDrAgg._sum.openingBalance || 0),
      safeFinancialSubtract(
        Number(salesAgg._sum.grandTotal || 0),
        safeFinancialAdd(
          Number(collectionsAgg._sum.amount || 0),
          safeFinancialAdd(
            Number(returnsAgg._sum.grandTotal || 0),
            Number(custOpenCrAgg._sum.openingBalance || 0)
          )
        )
      )
    );
    const totalReceivables = Math.max(0, receivablesBase);

    // Payables: openingCr + purchases - deliveries - purchaseReturns - openingDr
    const payablesBase = safeFinancialAdd(
      Number(suppOpenCrAgg._sum.openingBalance || 0),
      safeFinancialSubtract(
        Number(purchasesAgg._sum.grandTotal || 0),
        safeFinancialAdd(
          Number(deliveriesAgg._sum.amount || 0),
          safeFinancialAdd(
            Number(purchaseReturnsAgg._sum.grandTotal || 0),
            Number(suppOpenDrAgg._sum.openingBalance || 0)
          )
        )
      )
    );
    const totalPayables = Math.max(0, payablesBase);

    // FIX 1: Compute stock value as SUM(costPrice * openingStock) per product
    // With companyId filter
    const activeProductsForStock = await db.product.findMany({
      where: { isActive: true, ...companyFilter },
      select: { costPrice: true, openingStock: true },
    });
    const stockValue = activeProductsForStock.reduce(
      (sum, p) => safeFinancialAdd(sum, safeFinancialRound(Number(p.costPrice) * Number(p.openingStock))),
      0
    );

    // FIX 3: Bank balance - use currentBalance with companyId filter
    const bankBalance = await db.bank.aggregate({
      where: { ...companyFilter },
      _sum: { currentBalance: true },
    });

    // Recent Activities - limit to 8 (AuditLog is global, no companyId needed)
    const auditLogs = await db.auditLog.findMany({
      where: companyId ? { userId: { not: null } } : {},
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

    // Top Selling Products - with companyId filter via salesOrder
    const salesLines = await db.salesOrderLine.findMany({
      where: {
        salesOrder: { status: revenueStatusFilter, isActive: true, ...companyFilter },
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
      productSalesMap[pid].totalQuantity = safeFinancialAdd(productSalesMap[pid].totalQuantity, Number(line.quantity));
      productSalesMap[pid].totalRevenue = safeFinancialAdd(productSalesMap[pid].totalRevenue, Number(line.total));
    }

    const topSellingProducts = Object.values(productSalesMap)
      .sort((a, b) => b.totalQuantity - a.totalQuantity)
      .slice(0, 5);

    // Monthly Data - last 6 months, with companyId filter
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const [salesOrders, purchaseOrders] = await Promise.all([
      db.salesOrder.findMany({
        where: { date: { gte: sixMonthsAgo }, status: revenueStatusFilter, isActive: true, ...companyFilter },
        select: { date: true, grandTotal: true },
      }),
      db.purchaseOrder.findMany({
        where: { date: { gte: sixMonthsAgo }, status: revenueStatusFilter, isActive: true, ...companyFilter },
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
      if (monthlyMap[key]) monthlyMap[key].sales = safeFinancialAdd(monthlyMap[key].sales, Number(so.grandTotal));
    }

    for (const po of purchaseOrders) {
      const d = new Date(po.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyMap[key]) monthlyMap[key].purchase = safeFinancialAdd(monthlyMap[key].purchase, Number(po.grandTotal));
    }

    const monthlySalesData = Object.values(monthlyMap);

    // FIX 2: Low Stock Products - with companyId filter
    const allActiveProducts = await db.product.findMany({
      where: { isActive: true, ...companyFilter },
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

    // Category Distribution (global per task spec)
    const categoryDistribution = await db.category.findMany({
      where: { isActive: true },
      include: { _count: { select: { products: { where: { isActive: true, ...companyFilter } } } } },
      orderBy: { name: 'asc' },
    });

    // Pending Orders - with companyId filter
    const [pendingPOCount, pendingSOCount] = await Promise.all([
      db.purchaseOrder.count({ where: { status: { in: ['Draft', 'Pending'] }, ...companyFilter } }),
      db.salesOrder.count({ where: { status: { in: ['Draft', 'Pending'] }, ...companyFilter } }),
    ]);

    // Hire Sales Installments - with companyId filter
    const hireSalesRecords = await db.hireSales.findMany({
      where: { isActive: true, ...companyFilter },
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

    // Today's Installments - hire sales with nextPaymentDate = today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const todaysInstallmentRecords = await db.hireSales.findMany({
      where: {
        isActive: true,
        ...companyFilter,
        nextPaymentDate: { gte: todayStart, lte: todayEnd },
      },
      orderBy: { nextPaymentDate: 'asc' },
      include: {
        customer: { select: { id: true, name: true, customerCode: true, phone: true, address: true } },
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
      balanceAmount: safeFinancialSubtract(hs.grandTotal, hs.totalPaid),
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

    // Build response data (no manual VAT masking - maskDashboardForVatAuditor handles it)
    const responseData: Record<string, unknown> = {
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
      cogs,
      grossProfit,
      totalReceivables,
      totalPayables,
      stockValue,
      cashBalance: Number(bankBalance._sum.currentBalance || 0),
      recentActivities,
      topSellingProducts,
      monthlySalesData,
      monthlyPurchaseData: monthlySalesData.map(m => ({ month: m.month, purchase: m.purchase })),
      lowStockProducts,
      pendingOrders: { pendingPOCount, pendingSOCount },
      categoryDistribution: categoryDistribution.filter(c => c._count.products > 0).map(c => ({
        id: c.id,
        name: c.name,
        count: c._count.products,
      })),
      hireInstallments,
      todaysInstallments: todaysInstallmentRecords.map((hs) => ({
        id: hs.id,
        invoiceNo: hs.invoiceNo,
        date: hs.date.toISOString(),
        customer: hs.customer
          ? {
              id: hs.customer.id,
              name: hs.customer.name,
              customerCode: hs.customer.customerCode,
              phone: hs.customer.phone,
              address: hs.customer.address,
            }
          : null,
        hireRate: hs.hireRate,
        duration: hs.duration,
        installmentAmount: hs.installmentAmount,
        totalPaid: hs.totalPaid,
        grandTotal: hs.grandTotal,
        balanceAmount: safeFinancialSubtract(hs.grandTotal, hs.totalPaid),
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
      })),
    };

    // Stage 13: Apply deep recursive VAT Auditor masking
    const maskedData = maskDashboardForVatAuditor(responseData, security.user.role);

    // Stage 13: Log user activity with precise audit token
    await logUserActivity({
      action: 'EXPORT',
      module: 'Audit-Dashboard-KPI',
      userId: security.user.id,
      userName: security.user.name,
      details: 'Dashboard KPI data loaded',
    });

    return NextResponse.json(maskedData);
  } catch (error) {
    console.error('Dashboard API error:', error);
    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 });
  }
}
