import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  safeFinancialAdd,
  safeFinancialSubtract,
  safeFinancialRound,
  maskDashboardForVatAuditor,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';
import { getCached, setCached } from '@/lib/server-cache';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Dashboard', 'GET');
  if (!security.authorized) return security.response;

  try {
    // Multi-tenant isolation: filter by companyId
    const companyId = security.user.companyId;
    const companyFilter = companyId ? { companyId } : {};

    // ── SERVER-SIDE CACHE (45s TTL) ──────────────────────────────────────
    // Dashboard aggregates rarely change second-to-second. Caching avoids
    // 5-9s of Turso round-trips on every dashboard refresh.
    // Key includes companyId + role because VAT auditors see masked data.
    const cacheKey = `dashboard:${companyId || 'default'}:${security.user.role}`;
    const cached = getCached<unknown>(cacheKey);
    if (cached) {
      // Fire-and-forget activity log
      logUserActivity({
        action: 'EXPORT',
        module: 'Audit-Dashboard-KPI',
        userId: security.user.id,
        userName: security.user.name,
        details: 'Dashboard KPI data loaded (cached)',
      }).catch(console.error);

      return NextResponse.json(cached, {
        headers: { 'Cache-Control': 'private, max-age=15, stale-while-revalidate=45' },
      });
    }


    // FIX 4: Consistent revenue status filter - exclude Draft and Cancelled
    const revenueStatusFilter = { notIn: ['Draft', 'Cancelled'] };

    // ── SINGLE PARALLEL BATCH: All queries in one Promise.all ──────────────
    // Previously 5 sequential rounds → now 1 round
    // Deduplicated: salesOrderLine (was 2→1), product (was 2→1), hireSales (was 2→1)

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const [
      // Core counts (6)
      totalProducts, activeProductsCount,
      totalCustomers, activeCustomers,
      totalSuppliers, activeSuppliers,

      // Financial aggregates (4)
      confirmedSalesAgg,
      totalExpensesAgg,
      totalIncomeAgg,
      confirmedPurchasesAgg,

      // Bank balance (1)
      bankBalance,

      // Category distribution (1)
      categoryDistribution,

      // Receivables/Payables raw data (10)
      collectionsAgg, returnsAgg, deliveriesAgg, purchaseReturnsAgg,
      custOpenDrAgg, custOpenCrAgg, suppOpenCrAgg, suppOpenDrAgg,

      // Single salesOrderLine query for BOTH COGS and top-selling products (1)
      allSalesLines,

      // Single product query for BOTH stock value AND low stock detection (1)
      allActiveProducts,

      // Recent activities / audit logs (1)
      auditLogs,

      // Monthly data (2)
      salesOrders, purchaseOrders,

      // Pending orders (2)
      pendingPOCount, pendingSOCount,

      // Single hireSales query for BOTH recent installments AND today's installments (1)
      allHireSales,
    ] = await Promise.all([
      // ── Core counts ──
      db.product.count({ where: { ...companyFilter } }),
      db.product.count({ where: { isActive: true, ...companyFilter } }),
      db.customer.count({ where: { ...companyFilter } }),
      db.customer.count({ where: { isActive: true, ...companyFilter } }),
      db.supplier.count({ where: { ...companyFilter } }),
      db.supplier.count({ where: { isActive: true, ...companyFilter } }),

      // ── Financial aggregates ──
      db.salesOrder.aggregate({ where: { status: revenueStatusFilter, isActive: true, ...companyFilter }, _sum: { grandTotal: true } }),
      db.expense.aggregate({ where: { isActive: true, ...companyFilter }, _sum: { amount: true } }),
      db.income.aggregate({ where: { isActive: true, ...companyFilter }, _sum: { amount: true } }),
      db.purchaseOrder.aggregate({ where: { status: revenueStatusFilter, isActive: true, ...companyFilter }, _sum: { grandTotal: true } }),

      // ── Bank balance ──
      db.bank.aggregate({
        where: { ...companyFilter },
        _sum: { currentBalance: true },
      }),

      // ── Category distribution ──
      db.category.findMany({
        where: { isActive: true },
        include: { _count: { select: { products: { where: { isActive: true, ...companyFilter } } } } },
        orderBy: { name: 'asc' },
      }),

      // ── Receivables/Payables raw data ──
      // salesAgg already fetched as confirmedSalesAgg above, purchasesAgg as confirmedPurchasesAgg
      db.cashCollection.aggregate({ where: { isActive: true, ...companyFilter }, _sum: { amount: true } }),
      db.salesReturn.aggregate({ where: { isActive: true, ...companyFilter }, _sum: { grandTotal: true } }),
      db.cashDelivery.aggregate({ where: { isActive: true, ...companyFilter }, _sum: { amount: true } }),
      db.purchaseReturn.aggregate({ where: { isActive: true, ...companyFilter }, _sum: { grandTotal: true } }),
      db.customer.aggregate({ where: { openingBalanceType: 'Dr', isActive: true, ...companyFilter }, _sum: { openingBalance: true } }),
      db.customer.aggregate({ where: { openingBalanceType: 'Cr', isActive: true, ...companyFilter }, _sum: { openingBalance: true } }),
      db.supplier.aggregate({ where: { openingBalanceType: 'Cr', isActive: true, ...companyFilter }, _sum: { openingBalance: true } }),
      db.supplier.aggregate({ where: { openingBalanceType: 'Dr', isActive: true, ...companyFilter }, _sum: { openingBalance: true } }),

      // ── Single salesOrderLine query (deduplicated: was 2 queries) ──
      // Used for BOTH COGS calculation AND top-selling products
      db.salesOrderLine.findMany({
        where: {
          salesOrder: { status: revenueStatusFilter, isActive: true, ...companyFilter },
        },
        include: {
          product: { select: { id: true, name: true, productCode: true, costPrice: true } },
        },
      }),

      // ── Single product query (deduplicated: was 2 queries) ──
      // Used for BOTH stock value AND low stock detection
      db.product.findMany({
        where: { isActive: true, ...companyFilter },
        select: {
          id: true,
          name: true,
          productCode: true,
          costPrice: true,
          openingStock: true,
          reorderLevel: true,
          category: { select: { name: true } },
        },
      }),

      // ── Recent Activities ──
      db.auditLog.findMany({
        where: companyId ? { userId: { not: null } } : {},
        take: 8,
        orderBy: { createdAt: 'desc' },
      }),

      // ── Monthly data ──
      db.salesOrder.findMany({
        where: { date: { gte: sixMonthsAgo }, status: revenueStatusFilter, isActive: true, ...companyFilter },
        select: { date: true, grandTotal: true },
      }),
      db.purchaseOrder.findMany({
        where: { date: { gte: sixMonthsAgo }, status: revenueStatusFilter, isActive: true, ...companyFilter },
        select: { date: true, grandTotal: true },
      }),

      // ── Pending Orders ──
      db.purchaseOrder.count({ where: { status: { in: ['Draft', 'Pending'] }, ...companyFilter } }),
      db.salesOrder.count({ where: { status: { in: ['Draft', 'Pending'] }, ...companyFilter } }),

      // ── Single hireSales query (deduplicated: was 2 queries) ──
      // Fetch recent records; filter today's in JS
      db.hireSales.findMany({
        where: { isActive: true, ...companyFilter },
        take: 50,
        orderBy: { date: 'desc' },
        include: {
          customer: { select: { id: true, name: true, customerCode: true, phone: true, address: true } },
          lines: {
            include: {
              product: { select: { id: true, name: true, productCode: true } },
            },
          },
        },
      }),
    ]);

    // ── Compute derived values ─────────────────────────────────────────────

    const totalRevenue = Number(confirmedSalesAgg._sum.grandTotal || 0);
    const totalExpenses = Number(totalExpensesAgg._sum.amount || 0);
    const totalIncome = Number(totalIncomeAgg._sum.amount || 0);
    const totalPurchases = Number(confirmedPurchasesAgg._sum.grandTotal || 0);

    // COGS from single salesOrderLine query (was a separate query before)
    const cogs = allSalesLines.reduce((sum, line) => {
      const costPrice = Number(line.product?.costPrice || 0);
      return safeFinancialAdd(sum, safeFinancialRound(Number(line.quantity) * costPrice));
    }, 0);

    const grossProfit = safeFinancialSubtract(totalRevenue, cogs);
    const netProfit = safeFinancialSubtract(safeFinancialAdd(totalRevenue, totalIncome), safeFinancialAdd(cogs, totalExpenses));

    // Receivables: openingDr + sales - collections - returns - openingCr
    const receivablesBase = safeFinancialAdd(
      Number(custOpenDrAgg._sum.openingBalance || 0),
      safeFinancialSubtract(
        totalRevenue,
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
        totalPurchases,
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

    // Stock value from single product query (was a separate query before)
    const stockValue = allActiveProducts.reduce(
      (sum, p) => safeFinancialAdd(sum, safeFinancialRound(Number(p.costPrice) * Number(p.openingStock))),
      0
    );

    // Recent Activities
    const recentActivities = auditLogs.map((log) => ({
      id: log.id,
      type: log.action.toLowerCase(),
      title: `${log.action} ${log.module}`,
      description: log.recordLabel || log.details || `${log.action} on ${log.module}`,
      status: log.action,
      date: log.createdAt.toISOString(),
      userName: log.userName,
    }));

    // Top Selling Products from single salesOrderLine query (was a separate query before)
    const productSalesMap: Record<string, { productId: string; name: string; productCode: string; totalQuantity: number; totalRevenue: number }> = {};
    for (const line of allSalesLines) {
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

    // Monthly Data
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

    // Low Stock Products from single product query (was a separate query before)
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

    // Hire Sales Installments - split from single query (was 2 queries before)
    const hireInstallments = allHireSales.slice(0, 10).map((hs) => ({
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

    // Today's Installments - filtered in JS from the same query
    const todaysInstallmentRecords = allHireSales.filter((hs) => {
      if (!hs.nextPaymentDate) return false;
      const npd = new Date(hs.nextPaymentDate);
      return npd >= todayStart && npd <= todayEnd;
    });

    // Build response data (no manual VAT masking - maskDashboardForVatAuditor handles it)
    const responseData: Record<string, unknown> = {
      totalProducts,
      activeProducts: activeProductsCount,
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

    // Store in server-side cache for 45 seconds (avoids 5-9s Turso round-trips)
    setCached(cacheKey, maskedData, 45);

    // Stage 13: Log user activity - fire-and-forget (don't await)
    logUserActivity({
      action: 'EXPORT',
      module: 'Audit-Dashboard-KPI',
      userId: security.user.id,
      userName: security.user.name,
      details: 'Dashboard KPI data loaded',
    }).catch(console.error);

    return NextResponse.json(maskedData, {
      headers: {
        'Cache-Control': 'private, max-age=10, stale-while-revalidate=30',
      },
    });
  } catch (error) {
    console.error('Dashboard API error:', error);
    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 });
  }
}
