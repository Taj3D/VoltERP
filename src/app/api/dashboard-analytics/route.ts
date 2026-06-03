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
  const security = await withApiSecurity(request, 'DashboardAnalytics', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'kpi';
    const vatMode = searchParams.get('vatMode') === 'true';
    const startDateStr = searchParams.get('startDate');
    const endDateStr = searchParams.get('endDate');
    const startDate = startDateStr ? new Date(startDateStr) : undefined;
    const endDate = endDateStr ? new Date(endDateStr) : undefined;

    // Multi-tenant isolation
    const companyId = security.user.companyId;
    const companyFilter = companyId ? { companyId } : {};

    // Build date filter helper
    const dateFilter = (baseWhere: Record<string, unknown>) => {
      if (startDate || endDate) {
        const dateConstraint: Record<string, unknown> = {};
        if (startDate) dateConstraint.gte = startDate;
        if (endDate) dateConstraint.lte = endDate;
        baseWhere.date = dateConstraint;
      }
      return baseWhere;
    };

    switch (type) {
      case 'kpi':
        return await handleKPI(vatMode, dateFilter, companyFilter, security.user.role, security.user.id, security.user.name);
      case 'monthly-trend':
        return await handleMonthlyTrend(searchParams, vatMode, dateFilter, companyFilter, security.user.role, security.user.id, security.user.name);
      case 'category-turnover':
        return await handleCategoryTurnover(vatMode, dateFilter, companyFilter, security.user.role, security.user.id, security.user.name);
      case 'stock-alerts':
        return await handleStockAlerts(companyFilter);
      case 'financial-ratios':
        return await handleFinancialRatios(vatMode, dateFilter, companyFilter, security.user.role, security.user.id, security.user.name);
      case 'top-performers':
        return await handleTopPerformers(searchParams, vatMode, dateFilter, companyFilter, security.user.role, security.user.id, security.user.name);
      case 'payment-mix':
        return await handlePaymentMix(vatMode, dateFilter, companyFilter);
      case 'receivables-aging':
        return await handleReceivablesAging(vatMode, dateFilter, companyFilter, security.user.role, security.user.id, security.user.name);
      default:
        return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 });
    }
  } catch (error) {
    console.error('Dashboard Analytics API error:', error);
    return NextResponse.json({ error: 'Failed to generate analytics' }, { status: 500 });
  }
}

// ─── KPI ─────────────────────────────────────────────────────────────────────
async function handleKPI(
  vatMode: boolean,
  dateFilter: (base: Record<string, unknown>) => Record<string, unknown>,
  companyFilter: Record<string, unknown>,
  role: UserRole,
  userId: string,
  userName: string,
) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // FIX 4: Exclude Cancelled in addition to Draft
  const revenueStatusFilter = { notIn: ['Draft', 'Cancelled'] };

  // Performance: Run all independent DB queries in parallel with Promise.all
  const [
    salesAgg, purchasesAgg, expensesAgg, incomeAgg,
    totalCustomers, totalSuppliers, totalProducts,
    bankBalanceAgg,
    todaysSalesAgg, todaysPurchasesAgg, todaysCollectionsAgg,
    mtdSalesAgg, mtdPurchasesAgg,
    allProductsForStock,
    salesLinesForCOGS,
    activeProducts,
    totalReceivables,
    totalPayables,
  ] = await Promise.all([
    // Core revenue aggregates
    db.salesOrder.aggregate({
      where: { ...dateFilter({ status: revenueStatusFilter, isActive: true, ...companyFilter }) },
      _sum: { grandTotal: true },
    }),
    db.purchaseOrder.aggregate({
      where: { ...dateFilter({ status: revenueStatusFilter, isActive: true, ...companyFilter }) },
      _sum: { grandTotal: true },
    }),
    db.expense.aggregate({
      where: { ...dateFilter({ isActive: true, ...companyFilter }) },
      _sum: { amount: true },
    }),
    db.income.aggregate({
      where: { ...dateFilter({ isActive: true, ...companyFilter }) },
      _sum: { amount: true },
    }),
    // Counts
    db.customer.count({ where: { isActive: true, ...companyFilter } }),
    db.supplier.count({ where: { isActive: true, ...companyFilter } }),
    db.product.count({ where: { isActive: true, ...companyFilter } }),
    // Bank balance
    db.bank.aggregate({
      where: { ...companyFilter },
      _sum: { currentBalance: true },
    }),
    // Today's aggregates
    db.salesOrder.aggregate({
      where: { date: { gte: todayStart }, status: revenueStatusFilter, isActive: true, ...companyFilter },
      _sum: { grandTotal: true },
    }),
    db.purchaseOrder.aggregate({
      where: { date: { gte: todayStart }, status: revenueStatusFilter, isActive: true, ...companyFilter },
      _sum: { grandTotal: true },
    }),
    db.cashCollection.aggregate({
      where: { date: { gte: todayStart }, isActive: true, ...companyFilter }, _sum: { amount: true },
    }),
    // Month-to-date aggregates
    db.salesOrder.aggregate({
      where: { date: { gte: monthStart }, status: revenueStatusFilter, isActive: true, ...companyFilter },
      _sum: { grandTotal: true },
    }),
    db.purchaseOrder.aggregate({
      where: { date: { gte: monthStart }, status: revenueStatusFilter, isActive: true, ...companyFilter },
      _sum: { grandTotal: true },
    }),
    // Low stock products
    db.product.findMany({
      where: { isActive: true, ...companyFilter },
      select: { openingStock: true, reorderLevel: true },
    }),
    // COGS: sales order lines with product cost price
    db.salesOrderLine.findMany({
      where: {
        salesOrder: { status: { notIn: ['Draft', 'Cancelled'] }, isActive: true, ...companyFilter },
      },
      include: {
        product: { select: { costPrice: true } },
      },
    }),
    // Inventory value
    db.product.findMany({
      where: { isActive: true, ...companyFilter },
      select: { costPrice: true, openingStock: true },
    }),
    // Receivables and Payables
    calculateTotalReceivables(companyFilter),
    calculateTotalPayables(companyFilter),
  ]);

  // Compute derived values from parallel results
  const lowStockProducts = allProductsForStock.filter(
    (p) => Number(p.openingStock) <= Number(p.reorderLevel)
  ).length;

  const totalRevenue = Number(salesAgg._sum.grandTotal || 0);
  const totalPurchases = Number(purchasesAgg._sum.grandTotal || 0);
  const totalExpenses = Number(expensesAgg._sum.amount || 0);
  const totalIncomes = Number(incomeAgg._sum.amount || 0);

  const cogs = salesLinesForCOGS.reduce((sum, line) => {
    const costPrice = Number(line.product?.costPrice || 0);
    return safeFinancialAdd(sum, safeFinancialRound(Number(line.quantity) * costPrice));
  }, 0);

  const grossProfit = safeFinancialSubtract(totalRevenue, cogs);
  const netProfit = safeFinancialSubtract(safeFinancialAdd(grossProfit, totalIncomes), totalExpenses);

  const totalBankBalance = Number(bankBalanceAgg._sum.currentBalance || 0);

  const totalInventoryValue = activeProducts.reduce(
    (sum, p) => safeFinancialAdd(sum, safeFinancialRound(Number(p.costPrice) * Number(p.openingStock))),
    0
  );
  const totalAssets = safeFinancialAdd(safeFinancialAdd(totalBankBalance, totalInventoryValue), totalReceivables);

  const assetTurnoverRatio = totalAssets > 0 ? totalRevenue / totalAssets : 0;
  const returnOnSales = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  const result: Record<string, unknown> = {
    totalRevenue,
    totalPurchases,
    totalExpenses,
    totalIncomes,
    grossProfit,
    netProfit,
    totalCustomers,
    totalSuppliers,
    totalProducts,
    totalBankBalance,
    totalReceivables,
    totalPayables,
    lowStockCount: lowStockProducts,
    todaysSales: Number(todaysSalesAgg._sum.grandTotal || 0),
    todaysPurchases: Number(todaysPurchasesAgg._sum.grandTotal || 0),
    todaysCollections: Number(todaysCollectionsAgg._sum.amount || 0),
    monthToDateSales: Number(mtdSalesAgg._sum.grandTotal || 0),
    monthToDatePurchases: Number(mtdPurchasesAgg._sum.grandTotal || 0),
    assetTurnoverRatio: safeFinancialRound(Math.round(assetTurnoverRatio * 100) / 100),
    returnOnSales: safeFinancialRound(Math.round(returnOnSales * 100) / 100),
  };

  if (vatMode) {
    result.vatMode = true;
  }

  // Stage 13: Apply deep recursive VAT Auditor masking
  const maskedResult = maskDashboardForVatAuditor(result, role);

  // Stage 13: Log user activity
  await logUserActivity({
    action: 'EXPORT',
    module: 'Audit-Dashboard-KPI',
    userId,
    userName,
    details: 'Dashboard analytics report generated',
  });

  return NextResponse.json(maskedResult);
}

// ─── Monthly Trend ───────────────────────────────────────────────────────────
async function handleMonthlyTrend(
  searchParams: URLSearchParams,
  vatMode: boolean,
  dateFilter: (base: Record<string, unknown>) => Record<string, unknown>,
  companyFilter: Record<string, unknown>,
  role: UserRole,
  userId: string,
  userName: string,
) {
  const months = parseInt(searchParams.get('months') || '12', 10);
  const now = new Date();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);

  // FIX 4: Exclude Cancelled in addition to Draft
  const revenueStatusFilter = { notIn: ['Draft', 'Cancelled'] };

  // All with companyId filter
  const [salesOrders, purchaseOrders, expenses, incomes] = await Promise.all([
    db.salesOrder.findMany({
      where: { date: { gte: startDate }, status: revenueStatusFilter, isActive: true, ...companyFilter },
      select: { date: true, grandTotal: true },
    }),
    db.purchaseOrder.findMany({
      where: { date: { gte: startDate }, status: revenueStatusFilter, isActive: true, ...companyFilter },
      select: { date: true, grandTotal: true },
    }),
    db.expense.findMany({
      where: { date: { gte: startDate }, isActive: true, ...companyFilter },
      select: { date: true, amount: true },
    }),
    db.income.findMany({
      where: { date: { gte: startDate }, isActive: true, ...companyFilter },
      select: { date: true, amount: true },
    }),
  ]);

  // Initialize monthly map
  const monthlyMap: Record<string, { month: string; sales: number; purchases: number; expenses: number; income: number; net: number }> = {};
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthlyMap[key] = {
      month: `${monthNames[d.getMonth()]} ${d.getFullYear()}`,
      sales: 0,
      purchases: 0,
      expenses: 0,
      income: 0,
      net: 0,
    };
  }

  // Aggregate sales
  for (const so of salesOrders) {
    const d = new Date(so.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (monthlyMap[key]) monthlyMap[key].sales = safeFinancialAdd(monthlyMap[key].sales, Number(so.grandTotal));
  }

  // Aggregate purchases
  for (const po of purchaseOrders) {
    const d = new Date(po.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (monthlyMap[key]) monthlyMap[key].purchases = safeFinancialAdd(monthlyMap[key].purchases, Number(po.grandTotal));
  }

  // Aggregate expenses
  for (const exp of expenses) {
    const d = new Date(exp.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (monthlyMap[key]) monthlyMap[key].expenses = safeFinancialAdd(monthlyMap[key].expenses, Number(exp.amount));
  }

  // Aggregate incomes
  for (const inc of incomes) {
    const d = new Date(inc.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (monthlyMap[key]) monthlyMap[key].income = safeFinancialAdd(monthlyMap[key].income, Number(inc.amount));
  }

  // Calculate net cash flow
  for (const key of Object.keys(monthlyMap)) {
    const m = monthlyMap[key];
    m.net = safeFinancialSubtract(safeFinancialAdd(m.sales, m.income), safeFinancialAdd(m.purchases, m.expenses));
  }

  let data = Object.values(monthlyMap) as Record<string, unknown>[];

  // Stage 13: Apply VAT Auditor masking for monthly trend
  if (role === 'vat_auditor') {
    data = data.map(d => maskDashboardForVatAuditor(d as Record<string, unknown>, role)) as Record<string, unknown>[];
  }

  // Stage 13: Log user activity
  await logUserActivity({
    action: 'EXPORT',
    module: 'Audit-Dashboard-KPI',
    userId,
    userName,
    details: 'Dashboard analytics report generated',
  });

  return NextResponse.json({ type: 'monthly-trend', data });
}

// ─── Category Turnover ───────────────────────────────────────────────────────
async function handleCategoryTurnover(
  vatMode: boolean,
  dateFilter: (base: Record<string, unknown>) => Record<string, unknown>,
  companyFilter: Record<string, unknown>,
  role: UserRole,
  userId: string,
  userName: string,
) {
  // FIX 4: Exclude Cancelled in addition to Draft
  const revenueStatusFilter = { notIn: ['Draft', 'Cancelled'] };

  // Performance: Batch query all sales and purchase lines with product categories
  // instead of N+1 per-category queries
  const [categories, allSalesLines, allPurchaseLines] = await Promise.all([
    db.category.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    }),
    db.salesOrderLine.findMany({
      where: {
        product: { isActive: true, ...companyFilter },
        salesOrder: { status: revenueStatusFilter, isActive: true, ...companyFilter },
      },
      select: { quantity: true, total: true, product: { select: { categoryId: true } } },
    }),
    db.purchaseOrderLine.findMany({
      where: {
        product: { isActive: true, ...companyFilter },
        purchaseOrder: { status: revenueStatusFilter, isActive: true, ...companyFilter },
      },
      select: { quantity: true, total: true, product: { select: { categoryId: true } } },
    }),
  ]);

  // Aggregate by category in JavaScript (avoids N+1 queries)
  const salesByCategory: Record<string, { qty: number; value: number }> = {};
  const purchaseByCategory: Record<string, { qty: number; value: number }> = {};

  for (const line of allSalesLines) {
    const catId = line.product?.categoryId || 'uncategorized';
    if (!salesByCategory[catId]) salesByCategory[catId] = { qty: 0, value: 0 };
    salesByCategory[catId].qty += Number(line.quantity);
    salesByCategory[catId].value = safeFinancialAdd(salesByCategory[catId].value, Number(line.total));
  }

  for (const line of allPurchaseLines) {
    const catId = line.product?.categoryId || 'uncategorized';
    if (!purchaseByCategory[catId]) purchaseByCategory[catId] = { qty: 0, value: 0 };
    purchaseByCategory[catId].qty += Number(line.quantity);
    purchaseByCategory[catId].value = safeFinancialAdd(purchaseByCategory[catId].value, Number(line.total));
  }

  const data = categories.map((cat) => {
    const sales = salesByCategory[cat.id] || { qty: 0, value: 0 };
    const purchases = purchaseByCategory[cat.id] || { qty: 0, value: 0 };
    const turnoverRatio = purchases.value > 0 ? sales.value / purchases.value : 0;

    return {
      name: cat.name,
      totalSalesQty: sales.qty,
      totalSalesValue: sales.value,
      totalPurchaseQty: purchases.qty,
      totalPurchaseValue: purchases.value,
      turnoverRatio: safeFinancialRound(Math.round(turnoverRatio * 100) / 100),
      value: sales.value,
    };
  });

  // Sort by sales value descending, filter out zero
  const filtered = data.filter((d) => typeof d.value === 'number' && d.value > 0);
  filtered.sort((a, b) => (b.value as number) - (a.value as number));

  // Stage 13: Apply VAT Auditor masking for category turnover
  let resultData: Record<string, unknown>[] = filtered as Record<string, unknown>[];
  if (role === 'vat_auditor') {
    resultData = resultData.map(d => maskDashboardForVatAuditor(d, role));
  }

  // Stage 13: Log user activity
  await logUserActivity({
    action: 'EXPORT',
    module: 'Audit-Dashboard-KPI',
    userId,
    userName,
    details: 'Dashboard analytics report generated',
  });

  return NextResponse.json({ type: 'category-turnover', data: resultData });
}

// ─── Stock Alerts ────────────────────────────────────────────────────────────
async function handleStockAlerts(companyFilter: Record<string, unknown>) {
  // Get all products with their current stock info (companyId filtered)
  const products = await db.product.findMany({
    where: { isActive: true, ...companyFilter },
    include: {
      category: { select: { name: true } },
      godown: { select: { name: true } },
    },
  });

  const alerts: Array<{
    productId: string;
    productCode: string;
    productName: string;
    currentStock: number;
    reorderLevel: number;
    deficit: number;
    category: string;
    godown: string;
  }> = [];

  for (const p of products) {
    const currentStock = Number(p.openingStock);
    const reorderLevel = Number(p.reorderLevel);
    if (currentStock <= reorderLevel) {
      alerts.push({
        productId: p.id,
        productCode: p.productCode,
        productName: p.name,
        currentStock,
        reorderLevel,
        deficit: reorderLevel - currentStock,
        category: p.category?.name || 'Uncategorized',
        godown: p.godown?.name || 'N/A',
      });
    }
  }

  // Sort by deficit (highest first)
  alerts.sort((a, b) => b.deficit - a.deficit);

  const criticalCount = alerts.filter((a) => a.currentStock === 0).length;

  return NextResponse.json({
    type: 'stock-alerts',
    alertCount: alerts.length,
    criticalCount,
    data: alerts,
  });
}

// ─── Financial Ratios ────────────────────────────────────────────────────────
async function handleFinancialRatios(
  vatMode: boolean,
  dateFilter: (base: Record<string, unknown>) => Record<string, unknown>,
  companyFilter: Record<string, unknown>,
  role: UserRole,
  userId: string,
  userName: string,
) {
  // FIX 4: Exclude Cancelled in addition to Draft
  const revenueStatusFilter = { notIn: ['Draft', 'Cancelled'] };

  // Performance: Run all independent DB queries in parallel
  const [
    salesAgg, purchasesAgg, expensesAgg, incomeAgg,
    bankBalanceAgg, activeProducts, salesLinesForCOGS,
    totalReceivables, totalPayables,
  ] = await Promise.all([
    db.salesOrder.aggregate({
      where: { ...dateFilter({ status: revenueStatusFilter, isActive: true, ...companyFilter }) },
      _sum: { grandTotal: true },
    }),
    db.purchaseOrder.aggregate({
      where: { ...dateFilter({ status: revenueStatusFilter, isActive: true, ...companyFilter }) },
      _sum: { grandTotal: true },
    }),
    db.expense.aggregate({
      where: { ...dateFilter({ isActive: true, ...companyFilter }) },
      _sum: { amount: true },
    }),
    db.income.aggregate({
      where: { ...dateFilter({ isActive: true, ...companyFilter }) },
      _sum: { amount: true },
    }),
    db.bank.aggregate({
      where: { ...companyFilter },
      _sum: { currentBalance: true },
    }),
    // Inventory value
    db.product.findMany({
      where: { isActive: true, ...companyFilter },
      select: { costPrice: true, openingStock: true },
    }),
    // COGS
    db.salesOrderLine.findMany({
      where: {
        salesOrder: { status: { notIn: ['Draft', 'Cancelled'] }, isActive: true, ...companyFilter },
      },
      include: {
        product: { select: { costPrice: true } },
      },
    }),
    calculateTotalReceivables(companyFilter),
    calculateTotalPayables(companyFilter),
  ]);

  const totalInventoryValue = activeProducts.reduce(
    (sum, p) => safeFinancialAdd(sum, safeFinancialRound(Number(p.costPrice) * Number(p.openingStock))),
    0
  );

  const totalRevenue = Number(salesAgg._sum.grandTotal || 0);
  const totalPurchases = Number(purchasesAgg._sum.grandTotal || 0);
  const totalExpenses = Number(expensesAgg._sum.amount || 0);
  const totalIncomes = Number(incomeAgg._sum.amount || 0);

  const cogs = salesLinesForCOGS.reduce((sum, line) => {
    const costPrice = Number(line.product?.costPrice || 0);
    return safeFinancialAdd(sum, safeFinancialRound(Number(line.quantity) * costPrice));
  }, 0);

  const grossProfit = safeFinancialSubtract(totalRevenue, cogs);
  const netProfit = safeFinancialSubtract(safeFinancialAdd(grossProfit, totalIncomes), totalExpenses);

  const totalBankBalance = Number(bankBalanceAgg._sum.currentBalance || 0);

  // Current assets = bank + inventory + receivables
  const currentAssets = safeFinancialAdd(safeFinancialAdd(totalBankBalance, totalInventoryValue), totalReceivables);
  // Current liabilities = payables
  const currentLiabilities = totalPayables;

  // Total assets (simplified: current assets)
  const totalAssets = currentAssets;

  // Total liabilities (simplified: payables)
  const totalLiab = totalPayables;
  // Total equity = assets - liabilities
  const totalEquity = safeFinancialSubtract(totalAssets, totalLiab);

  // Ratios
  const currentRatio = currentLiabilities > 0 ? currentAssets / currentLiabilities : 0;
  const debtToEquityRatio = totalEquity > 0 ? totalLiab / totalEquity : 0;
  const grossProfitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
  const netProfitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
  const receivablesTurnover = totalReceivables > 0 ? totalRevenue / totalReceivables : 0;
  const payablesTurnover = totalPayables > 0 ? totalPurchases / totalPayables : 0;
  const inventoryTurnover = totalInventoryValue > 0 ? cogs / totalInventoryValue : 0;
  const assetTurnover = totalAssets > 0 ? totalRevenue / totalAssets : 0;
  const workingCapital = safeFinancialSubtract(currentAssets, currentLiabilities);
  const quickRatio = currentLiabilities > 0 ? safeFinancialSubtract(currentAssets, totalInventoryValue) / currentLiabilities : 0;

  const result: Record<string, unknown> = {
    type: 'financial-ratios',
    currentRatio: safeFinancialRound(Math.round(currentRatio * 100) / 100),
    debtToEquityRatio: safeFinancialRound(Math.round(debtToEquityRatio * 100) / 100),
    grossProfitMargin: safeFinancialRound(Math.round(grossProfitMargin * 100) / 100),
    netProfitMargin: safeFinancialRound(Math.round(netProfitMargin * 100) / 100),
    receivablesTurnover: safeFinancialRound(Math.round(receivablesTurnover * 100) / 100),
    payablesTurnover: safeFinancialRound(Math.round(payablesTurnover * 100) / 100),
    inventoryTurnover: safeFinancialRound(Math.round(inventoryTurnover * 100) / 100),
    assetTurnover: safeFinancialRound(Math.round(assetTurnover * 100) / 100),
    workingCapital: safeFinancialRound(Math.round(workingCapital * 100) / 100),
    quickRatio: safeFinancialRound(Math.round(quickRatio * 100) / 100),
  };

  // Stage 13: Apply deep recursive VAT Auditor masking
  const maskedResult = maskDashboardForVatAuditor(result, role);

  // Stage 13: Log user activity
  await logUserActivity({
    action: 'EXPORT',
    module: 'Audit-Dashboard-KPI',
    userId,
    userName,
    details: 'Dashboard analytics report generated',
  });

  return NextResponse.json(maskedResult);
}

// ─── Top Performers ──────────────────────────────────────────────────────────
async function handleTopPerformers(
  searchParams: URLSearchParams,
  vatMode: boolean,
  dateFilter: (base: Record<string, unknown>) => Record<string, unknown>,
  companyFilter: Record<string, unknown>,
  role: UserRole,
  userId: string,
  userName: string,
) {
  const limit = parseInt(searchParams.get('limit') || '10', 10);

  // FIX 4: Exclude Cancelled in addition to Draft
  const revenueStatusFilter = { notIn: ['Draft', 'Cancelled'] };

  // Top selling products by revenue (companyId filtered via salesOrder)
  const salesLines = await db.salesOrderLine.findMany({
    where: { salesOrder: { status: revenueStatusFilter, isActive: true, ...companyFilter } },
    include: { product: { select: { id: true, name: true, productCode: true, category: { select: { name: true } } } } },
  });

  const productMap: Record<string, { productId: string; name: string; productCode: string; category: string; totalQty: number; totalRevenue: number }> = {};
  for (const line of salesLines) {
    const pid = line.productId;
    if (!productMap[pid]) {
      productMap[pid] = {
        productId: pid,
        name: line.product?.name || 'Unknown',
        productCode: line.product?.productCode || '',
        category: line.product?.category?.name || '',
        totalQty: 0,
        totalRevenue: 0,
      };
    }
    productMap[pid].totalQty = safeFinancialAdd(productMap[pid].totalQty, Number(line.quantity));
    productMap[pid].totalRevenue = safeFinancialAdd(productMap[pid].totalRevenue, Number(line.total));
  }
  const topProducts = Object.values(productMap)
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, limit);

  // Top customers by purchase volume (companyId filtered)
  const customerSales = await db.salesOrder.groupBy({
    by: ['customerId'],
    where: { status: revenueStatusFilter, isActive: true, ...companyFilter },
    _sum: { grandTotal: true },
    orderBy: { _sum: { grandTotal: 'desc' } },
    take: limit,
  });

  const customerIds = customerSales.map((cs) => cs.customerId);
  const customers = await db.customer.findMany({
    where: { id: { in: customerIds }, ...companyFilter },
    select: { id: true, customerCode: true, name: true, phone: true },
  });

  const topCustomers = customerSales.map((cs) => {
    const cust = customers.find((c) => c.id === cs.customerId);
    return {
      customerId: cs.customerId,
      customerCode: cust?.customerCode || '',
      customerName: cust?.name || 'Unknown',
      phone: cust?.phone || '',
      totalPurchase: Number(cs._sum.grandTotal || 0),
    };
  });

  // Top suppliers by purchase value (companyId filtered)
  const supplierPurchases = await db.purchaseOrder.groupBy({
    by: ['supplierId'],
    where: { status: revenueStatusFilter, isActive: true, ...companyFilter },
    _sum: { grandTotal: true },
    orderBy: { _sum: { grandTotal: 'desc' } },
    take: limit,
  });

  const supplierIds = supplierPurchases.map((sp) => sp.supplierId);
  const suppliers = await db.supplier.findMany({
    where: { id: { in: supplierIds }, ...companyFilter },
    select: { id: true, supplierCode: true, name: true, phone: true },
  });

  const topSuppliers = supplierPurchases.map((sp) => {
    const sup = suppliers.find((s) => s.id === sp.supplierId);
    return {
      supplierId: sp.supplierId,
      supplierCode: sup?.supplierCode || '',
      supplierName: sup?.name || 'Unknown',
      phone: sup?.phone || '',
      totalPurchaseValue: Number(sp._sum.grandTotal || 0),
    };
  });

  // Top SRs (employees) by sales value (companyId filtered)
  const srTargets = await db.sRTargetSetup.findMany({
    where: { isActive: true, ...companyFilter },
    include: { employee: { select: { id: true, employeeCode: true, name: true } } },
    orderBy: { targetAmount: 'desc' },
    take: limit,
  });

  const topSRs = srTargets.map((st) => ({
    employeeId: st.employeeId,
    employeeCode: st.employee?.employeeCode || '',
    employeeName: st.employee?.name || 'Unknown',
    targetAmount: Number(st.targetAmount),
    month: st.month,
    year: st.year,
  }));

  const result: Record<string, unknown> = {
    type: 'top-performers',
    topProducts,
    topCustomers,
    topSuppliers,
    topSRs,
  };

  if (vatMode) {
    result.vatMode = true;
  }

  // Stage 13: Apply deep recursive VAT Auditor masking
  const maskedResult = maskDashboardForVatAuditor(result, role);

  // Stage 13: Log user activity
  await logUserActivity({
    action: 'EXPORT',
    module: 'Audit-Dashboard-KPI',
    userId,
    userName,
    details: 'Dashboard analytics report generated',
  });

  return NextResponse.json(maskedResult);
}

// ─── Payment Mix ─────────────────────────────────────────────────────────────
async function handlePaymentMix(
  vatMode: boolean,
  dateFilter: (base: Record<string, unknown>) => Record<string, unknown>,
  companyFilter: Record<string, unknown>,
) {
  // FIX 4: Exclude Cancelled in addition to Draft
  const revenueStatusFilter = { notIn: ['Draft', 'Cancelled'] };

  // Performance: Use groupBy instead of N+1 per-payment-option queries
  const [paymentOptions, salesByPayment] = await Promise.all([
    db.paymentOption.findMany({
      where: { isActive: true, ...companyFilter },
      select: { id: true, name: true },
    }),
    db.salesOrder.groupBy({
      by: ['paymentOptionId'],
      where: { status: revenueStatusFilter, isActive: true, ...companyFilter },
      _sum: { grandTotal: true },
    }),
  ]);

  // Build a lookup map for payment option aggregates
  const paymentAggMap: Record<string, number> = {};
  for (const row of salesByPayment) {
    paymentAggMap[row.paymentOptionId || ''] = Number(row._sum.grandTotal || 0);
  }

  const data = paymentOptions.map((po) => ({
    name: po.name,
    value: paymentAggMap[po.id] || 0,
    paymentOptionId: po.id,
  }));

  // Filter out zero values
  const filtered = data.filter((d) => d.value > 0);
  filtered.sort((a, b) => b.value - a.value);

  return NextResponse.json({
    type: 'payment-mix',
    data: filtered,
    vatMode: vatMode || undefined,
  });
}

// ─── Receivables Aging ───────────────────────────────────────────────────────
async function handleReceivablesAging(
  vatMode: boolean,
  dateFilter: (base: Record<string, unknown>) => Record<string, unknown>,
  companyFilter: Record<string, unknown>,
  role: UserRole,
  userId: string,
  userName: string,
) {
  const today = new Date();

  // FIX 4: Exclude Cancelled in addition to Draft
  const revenueStatusFilter = { notIn: ['Draft', 'Cancelled'] };

  // FIX 6: Sort by date ascending (oldest first) for FIFO allocation
  // With companyId filter
  const salesOrders = await db.salesOrder.findMany({
    where: { status: revenueStatusFilter, isActive: true, ...companyFilter },
    select: {
      id: true,
      customerId: true,
      date: true,
      grandTotal: true,
    },
    orderBy: { date: 'asc' },
  });

  // Get all cash collections and sales returns for balance calculation (companyId filtered)
  const [cashCollections, salesReturns] = await Promise.all([
    db.cashCollection.findMany({
      where: { isActive: true, status: { not: 'Draft' }, ...companyFilter },
      select: { customerId: true, amount: true },
    }),
    db.salesReturn.findMany({
      where: { isActive: true, status: { not: 'Draft' }, ...companyFilter },
      select: { salesOrderId: true, grandTotal: true },
    }),
  ]);

  // Build a map of collections per customer
  const collectionsByCustomer: Record<string, number> = {};
  for (const cc of cashCollections) {
    collectionsByCustomer[cc.customerId] = safeFinancialAdd(collectionsByCustomer[cc.customerId] || 0, Number(cc.amount));
  }

  // Build a map of returns per SO
  const returnsBySO: Record<string, number> = {};
  for (const sr of salesReturns) {
    returnsBySO[sr.salesOrderId] = safeFinancialAdd(returnsBySO[sr.salesOrderId] || 0, Number(sr.grandTotal));
  }

  let current = 0;
  let days31to60 = 0;
  let days61to90 = 0;
  let days90plus = 0;

  // Track per-customer collection allocation
  const customerCollectionUsed: Record<string, number> = {};

  for (const so of salesOrders) {
    const soTotal = Number(so.grandTotal);
    const returned = returnsBySO[so.id] || 0;

    // Allocate collections to this SO (FIFO by customer)
    const custAvailable = collectionsByCustomer[so.customerId] || 0;
    const custUsed = customerCollectionUsed[so.customerId] || 0;
    const custRemaining = safeFinancialSubtract(custAvailable, custUsed);

    const collectedForThis = Math.min(safeFinancialSubtract(soTotal, returned), custRemaining);
    customerCollectionUsed[so.customerId] = safeFinancialAdd(custUsed, Math.max(0, collectedForThis));

    const balance = safeFinancialSubtract(soTotal, safeFinancialAdd(returned, Math.max(0, collectedForThis)));

    if (balance > 0) {
      const daysOutstanding = Math.floor(
        (today.getTime() - new Date(so.date).getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysOutstanding <= 30) {
        current = safeFinancialAdd(current, balance);
      } else if (daysOutstanding <= 60) {
        days31to60 = safeFinancialAdd(days31to60, balance);
      } else if (daysOutstanding <= 90) {
        days61to90 = safeFinancialAdd(days61to90, balance);
      } else {
        days90plus = safeFinancialAdd(days90plus, balance);
      }
    }
  }

  // FIX: Include customer opening Dr/Cr balances in aging
  // Opening Dr balances are outstanding receivables, Opening Cr balances reduce them
  const customerOpeningDr = await db.customer.aggregate({
    where: { openingBalanceType: 'Dr', isActive: true, ...companyFilter },
    _sum: { openingBalance: true },
  });
  const customerOpeningCr = await db.customer.aggregate({
    where: { openingBalanceType: 'Cr', isActive: true, ...companyFilter },
    _sum: { openingBalance: true },
  });
  const openingDrTotal = Number(customerOpeningDr._sum.openingBalance || 0);
  const openingCrTotal = Number(customerOpeningCr._sum.openingBalance || 0);
  const openingBalanceNet = safeFinancialSubtract(openingDrTotal, openingCrTotal);

  // Opening balance receivables are typically aged (assume 90+ days as they're historical)
  if (openingBalanceNet > 0) {
    days90plus = safeFinancialAdd(days90plus, openingBalanceNet);
  }

  const totalOutstanding = safeFinancialAdd(safeFinancialAdd(safeFinancialAdd(current, days31to60), days61to90), days90plus);

  const result: Record<string, unknown> = {
    type: 'receivables-aging',
    totalOutstanding,
    current,
    days31to60,
    days61to90,
    days90plus,
    openingBalance: openingBalanceNet,
    vatMode: vatMode || undefined,
  };

  // Stage 13: Apply deep recursive VAT Auditor masking
  const maskedResult = maskDashboardForVatAuditor(result, role);

  // Stage 13: Log user activity
  await logUserActivity({
    action: 'EXPORT',
    module: 'Audit-Dashboard-KPI',
    userId,
    userName,
    details: 'Dashboard analytics report generated',
  });

  return NextResponse.json(maskedResult);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function calculateTotalReceivables(companyFilter: Record<string, unknown>): Promise<number> {
  // Performance: Run all independent queries in parallel
  const [salesAgg, collectionsAgg, returnsAgg, customerOpeningDr, customerOpeningCr] = await Promise.all([
    db.salesOrder.aggregate({
      where: { status: { notIn: ['Draft', 'Cancelled'] }, isActive: true, ...companyFilter },
      _sum: { grandTotal: true },
    }),
    db.cashCollection.aggregate({
      where: { isActive: true, ...companyFilter },
      _sum: { amount: true },
    }),
    db.salesReturn.aggregate({
      where: { isActive: true, ...companyFilter },
      _sum: { grandTotal: true },
    }),
    db.customer.aggregate({
      where: { openingBalanceType: 'Dr', isActive: true, ...companyFilter },
      _sum: { openingBalance: true },
    }),
    db.customer.aggregate({
      where: { openingBalanceType: 'Cr', isActive: true, ...companyFilter },
      _sum: { openingBalance: true },
    }),
  ]);

  const totalSales = Number(salesAgg._sum.grandTotal || 0);
  const totalCollections = Number(collectionsAgg._sum.amount || 0);
  const totalReturns = Number(returnsAgg._sum.grandTotal || 0);
  const openingDr = Number(customerOpeningDr._sum.openingBalance || 0);
  const openingCr = Number(customerOpeningCr._sum.openingBalance || 0);

  const receivablesBase = safeFinancialSubtract(
    safeFinancialAdd(openingDr, totalSales),
    safeFinancialAdd(totalCollections, safeFinancialAdd(totalReturns, openingCr))
  );
  return Math.max(0, receivablesBase);
}

async function calculateTotalPayables(companyFilter: Record<string, unknown>): Promise<number> {
  // Performance: Run all independent queries in parallel
  const [purchasesAgg, deliveriesAgg, returnsAgg, supplierOpeningCr, supplierOpeningDr] = await Promise.all([
    db.purchaseOrder.aggregate({
      where: { status: { notIn: ['Draft', 'Cancelled'] }, isActive: true, ...companyFilter },
      _sum: { grandTotal: true },
    }),
    db.cashDelivery.aggregate({
      where: { isActive: true, ...companyFilter },
      _sum: { amount: true },
    }),
    db.purchaseReturn.aggregate({
      where: { isActive: true, ...companyFilter },
      _sum: { grandTotal: true },
    }),
    db.supplier.aggregate({
      where: { openingBalanceType: 'Cr', isActive: true, ...companyFilter },
      _sum: { openingBalance: true },
    }),
    db.supplier.aggregate({
      where: { openingBalanceType: 'Dr', isActive: true, ...companyFilter },
      _sum: { openingBalance: true },
    }),
  ]);

  const totalPurchases = Number(purchasesAgg._sum.grandTotal || 0);
  const totalDeliveries = Number(deliveriesAgg._sum.amount || 0);
  const totalReturns = Number(returnsAgg._sum.grandTotal || 0);
  const openingCr = Number(supplierOpeningCr._sum.openingBalance || 0);
  const openingDr = Number(supplierOpeningDr._sum.openingBalance || 0);

  const payablesBase = safeFinancialSubtract(
    safeFinancialAdd(openingCr, totalPurchases),
    safeFinancialAdd(totalDeliveries, safeFinancialAdd(totalReturns, openingDr))
  );
  return Math.max(0, payablesBase);
}
