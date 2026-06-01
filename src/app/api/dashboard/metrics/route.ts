// ============================================================
// VoltERP — Phase 16: Operational Dashboard Metrics Engine
// High-Performance Backend Query Router for Executive KPIs
// Multi-Tenant Isolation: Every query anchored by companyId
// Safe Numeric Fallback: Division-by-zero returns 0.00
// ============================================================

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
  const security = await withApiSecurity(request, 'DashboardMetrics', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'core-metrics';
    const startDateStr = searchParams.get('startDate');
    const endDateStr = searchParams.get('endDate');
    const startDate = startDateStr ? new Date(startDateStr) : undefined;
    const endDate = endDateStr ? new Date(endDateStr) : undefined;

    // Multi-tenant isolation: every query anchored by companyId
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
      case 'core-metrics':
        return await handleCoreMetrics(companyFilter, dateFilter, security.user.role, security.user.id, security.user.name);
      case 'financial-chart':
        return await handleFinancialChart(searchParams, companyFilter, dateFilter, security.user.role, security.user.id, security.user.name);
      case 'pos-revenue':
        return await handlePosRevenue(companyFilter, dateFilter, security.user.role, security.user.id, security.user.name);
      default:
        return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 });
    }
  } catch (error) {
    console.error('[DashboardMetrics] Error:', error);
    return NextResponse.json({ error: 'Failed to compute dashboard metrics' }, { status: 500 });
  }
}

// ─── CORE METRICS: 4 Vital Operational Counters ──────────────────────────────
// 1. Total Net Revenue (post-discount Sales Orders + POS Sales)
// 2. Perpetual Inventory Asset Cost Valuation (ProductStock totalValue)
// 3. AR vs AP Live Debt Ratio
// 4. Real-Time Gross Profit Margin %
// ─────────────────────────────────────────────────────────────────────────────

async function handleCoreMetrics(
  companyFilter: Record<string, unknown>,
  dateFilter: (base: Record<string, unknown>) => Record<string, unknown>,
  role: UserRole,
  userId: string,
  userName: string,
) {
  const revenueStatusFilter = { notIn: ['Draft', 'Cancelled'] };

  // ── 1. Total Net Revenue: Sales Orders + POS Sales ──
  // All with companyId anchor — Anti-Leak Aggregator Shield
  const [salesAgg, posSalesAgg] = await Promise.all([
    db.salesOrder.aggregate({
      where: { ...dateFilter({ status: revenueStatusFilter, isActive: true, ...companyFilter }) },
      _sum: { grandTotal: true },
    }),
    db.posSale.aggregate({
      where: { ...dateFilter({ status: 'Completed', isActive: true, ...companyFilter }) },
      _sum: { grandTotal: true },
    }),
  ]);

  const salesRevenue = Number(salesAgg._sum.grandTotal || 0);
  const posRevenue = Number(posSalesAgg._sum.grandTotal || 0);
  const totalNetRevenue = safeFinancialAdd(salesRevenue, posRevenue);

  // ── 2. Perpetual Inventory Asset Cost Valuation ──
  // Sum of all dynamic location stock layers * Cost Price from ProductStock
  // With companyId anchor — Anti-Leak Aggregator Shield
  const inventoryStockLayers = await db.productStock.findMany({
    where: { isActive: true, ...companyFilter },
    select: { totalValue: true, quantity: true, costPrice: true },
  });
  const perpetualInventoryValuation = inventoryStockLayers.reduce(
    (sum, ps) => safeFinancialAdd(sum, Number(ps.totalValue || safeFinancialRound(Number(ps.quantity) * Number(ps.costPrice)))),
    0
  );

  // ── 3. AR vs AP Live Debt Ratio ──
  // All aggregates with companyId anchor — Anti-Leak Aggregator Shield
  const [receivables, payables] = await Promise.all([
    calculateTotalReceivables(companyFilter),
    calculateTotalPayables(companyFilter),
  ]);

  // AR/AP Debt Ratio: safe division — if AP === 0, return 0.00
  const arApDebtRatio = payables > 0 ? safeFinancialRound(receivables / payables) : 0;

  // ── 4. Real-Time Gross Profit Margin % ──
  // COGS from Sales Order lines + POS Sale lines (with costPrice)
  const [salesLinesForCOGS, posLinesForCOGS] = await Promise.all([
    db.salesOrderLine.findMany({
      where: {
        salesOrder: { status: revenueStatusFilter, isActive: true, ...companyFilter },
      },
      include: { product: { select: { costPrice: true } } },
    }),
    db.posSaleLine.findMany({
      where: {
        posSale: { status: 'Completed', isActive: true, ...companyFilter },
      },
      select: { quantity: true, costPrice: true },
    }),
  ]);

  const salesCOGS = salesLinesForCOGS.reduce((sum, line) => {
    const costPrice = Number(line.product?.costPrice || 0);
    return safeFinancialAdd(sum, safeFinancialRound(Number(line.quantity) * costPrice));
  }, 0);

  const posCOGS = posLinesForCOGS.reduce((sum, line) => {
    return safeFinancialAdd(sum, safeFinancialRound(Number(line.quantity) * Number(line.costPrice || 0)));
  }, 0);

  const totalCOGS = safeFinancialAdd(salesCOGS, posCOGS);
  const grossProfit = safeFinancialSubtract(totalNetRevenue, totalCOGS);

  // Safe Gross Profit Margin %: if Total Revenue === 0, short-circuit to 0.00
  const grossProfitMargin = totalNetRevenue > 0
    ? safeFinancialRound(((totalNetRevenue - totalCOGS) / totalNetRevenue) * 100)
    : 0;

  // Additional operational counters
  const [totalExpensesAgg, totalIncomeAgg, bankBalanceAgg, totalProducts, totalCustomers, totalSuppliers] = await Promise.all([
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
    db.product.count({ where: { isActive: true, ...companyFilter } }),
    db.customer.count({ where: { isActive: true, ...companyFilter } }),
    db.supplier.count({ where: { isActive: true, ...companyFilter } }),
  ]);

  const totalExpenses = Number(totalExpensesAgg._sum.amount || 0);
  const totalIncomes = Number(totalIncomeAgg._sum.amount || 0);
  const netProfit = safeFinancialSubtract(safeFinancialAdd(grossProfit, totalIncomes), totalExpenses);
  const netProfitMargin = totalNetRevenue > 0 ? safeFinancialRound((netProfit / totalNetRevenue) * 100) : 0;
  const totalBankBalance = Number(bankBalanceAgg._sum.currentBalance || 0);

  // Today's counters
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [todaysSalesAgg, todaysPosAgg] = await Promise.all([
    db.salesOrder.aggregate({
      where: { date: { gte: todayStart }, status: revenueStatusFilter, isActive: true, ...companyFilter },
      _sum: { grandTotal: true },
    }),
    db.posSale.aggregate({
      where: { date: { gte: todayStart }, status: 'Completed', isActive: true, ...companyFilter },
      _sum: { grandTotal: true },
    }),
  ]);
  const todaysSales = safeFinancialAdd(
    Number(todaysSalesAgg._sum.grandTotal || 0),
    Number(todaysPosAgg._sum.grandTotal || 0)
  );

  // Low stock count
  const allProductsForStock = await db.product.findMany({
    where: { isActive: true, ...companyFilter },
    select: { openingStock: true, reorderLevel: true },
  });
  const lowStockCount = allProductsForStock.filter(
    (p) => Number(p.openingStock) <= Number(p.reorderLevel)
  ).length;

  const result: Record<string, unknown> = {
    // Core Metric Matrix (Phase 16 D1)
    totalNetRevenue,
    perpetualInventoryValuation,
    accountsReceivable: receivables,
    accountsPayable: payables,
    arApDebtRatio,
    grossProfit,
    totalCOGS,
    grossProfitMargin,
    // Additional operational counters
    netProfit,
    netProfitMargin,
    totalExpenses,
    totalIncomes,
    totalBankBalance,
    totalProducts,
    totalCustomers,
    totalSuppliers,
    todaysSales,
    lowStockCount,
    // Revenue breakdown
    salesRevenue,
    posRevenue,
  };

  // Stage 13: Apply deep recursive VAT Auditor masking
  const maskedResult = maskDashboardForVatAuditor(result, role);

  // Phase 16 D4: Activity log with "BI-Analytics-Core" compliance token
  await logUserActivity({
    action: 'EXPORT',
    module: 'BI-Analytics-Core',
    userId,
    userName,
    details: 'Core operational metrics computed — Net Revenue, Inventory Valuation, AR/AP Ratio, Gross Profit Margin',
  });

  return NextResponse.json(maskedResult);
}

// ─── FINANCIAL CHART: 12-Month Multi-Axis Data ──────────────────────────────
// Renders synchronized multi-axis feeds:
// - Monthly Sales Trend (Sales Orders + POS Sales)
// - Cost of Goods Sold (COGS)
// - Net Profit Margin %
// All with companyId anchor — Anti-Leak Aggregator Shield
// ─────────────────────────────────────────────────────────────────────────────

async function handleFinancialChart(
  searchParams: URLSearchParams,
  companyFilter: Record<string, unknown>,
  dateFilter: (base: Record<string, unknown>) => Record<string, unknown>,
  role: UserRole,
  userId: string,
  userName: string,
) {
  const months = parseInt(searchParams.get('months') || '12', 10);
  const now = new Date();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const chartStartDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);

  const revenueStatusFilter = { notIn: ['Draft', 'Cancelled'] };

  // All queries with companyId anchor — Anti-Leak Aggregator Shield
  const [salesOrders, posSales, salesLinesForCOGS, posLinesForCOGS, expenses] = await Promise.all([
    // Sales Orders for the period
    db.salesOrder.findMany({
      where: { date: { gte: chartStartDate }, status: revenueStatusFilter, isActive: true, ...companyFilter },
      select: { date: true, grandTotal: true },
    }),
    // POS Sales for the period
    db.posSale.findMany({
      where: { date: { gte: chartStartDate }, status: 'Completed', isActive: true, ...companyFilter },
      select: { date: true, grandTotal: true },
    }),
    // Sales Order lines for COGS
    db.salesOrderLine.findMany({
      where: {
        salesOrder: { date: { gte: chartStartDate }, status: revenueStatusFilter, isActive: true, ...companyFilter },
      },
      include: { product: { select: { costPrice: true } } },
    }),
    // POS Sale lines for COGS
    db.posSaleLine.findMany({
      where: {
        posSale: { date: { gte: chartStartDate }, status: 'Completed', isActive: true, ...companyFilter },
      },
      select: { quantity: true, costPrice: true, posSale: { select: { date: true } } },
    }),
    // Expenses for the period
    db.expense.findMany({
      where: { date: { gte: chartStartDate }, isActive: true, ...companyFilter },
      select: { date: true, amount: true },
    }),
  ]);

  // Initialize monthly map
  const monthlyMap: Record<string, {
    month: string;
    sales: number;
    cogs: number;
    grossProfit: number;
    grossProfitMargin: number;
    expenses: number;
    netProfitMargin: number;
  }> = {};

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthlyMap[key] = {
      month: `${monthNames[d.getMonth()]} ${d.getFullYear()}`,
      sales: 0,
      cogs: 0,
      grossProfit: 0,
      grossProfitMargin: 0,
      expenses: 0,
      netProfitMargin: 0,
    };
  }

  // Aggregate sales
  for (const so of salesOrders) {
    const d = new Date(so.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (monthlyMap[key]) {
      monthlyMap[key].sales = safeFinancialAdd(monthlyMap[key].sales, Number(so.grandTotal));
    }
  }

  // Aggregate POS sales into the same 'sales' field
  for (const ps of posSales) {
    const d = new Date(ps.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (monthlyMap[key]) {
      monthlyMap[key].sales = safeFinancialAdd(monthlyMap[key].sales, Number(ps.grandTotal));
    }
  }

  // Aggregate COGS from Sales Order lines
  for (const line of salesLinesForCOGS) {
    const d = new Date((line as any).salesOrder?.date || line.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (monthlyMap[key]) {
      const costPrice = Number((line as any).product?.costPrice || 0);
      monthlyMap[key].cogs = safeFinancialAdd(monthlyMap[key].cogs, safeFinancialRound(Number(line.quantity) * costPrice));
    }
  }

  // Aggregate COGS from POS Sale lines
  for (const line of posLinesForCOGS) {
    const d = new Date(line.posSale?.date || new Date());
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (monthlyMap[key]) {
      monthlyMap[key].cogs = safeFinancialAdd(monthlyMap[key].cogs, safeFinancialRound(Number(line.quantity) * Number(line.costPrice || 0)));
    }
  }

  // Aggregate expenses
  for (const exp of expenses) {
    const d = new Date(exp.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (monthlyMap[key]) {
      monthlyMap[key].expenses = safeFinancialAdd(monthlyMap[key].expenses, Number(exp.amount));
    }
  }

  // Calculate derived metrics per month
  for (const key of Object.keys(monthlyMap)) {
    const m = monthlyMap[key];
    m.grossProfit = safeFinancialSubtract(m.sales, m.cogs);
    // Safe Gross Profit Margin: if sales === 0, short-circuit to 0.00
    m.grossProfitMargin = m.sales > 0 ? safeFinancialRound((m.grossProfit / m.sales) * 100) : 0;
    // Net Profit = Gross Profit - Expenses
    const netProfit = safeFinancialSubtract(m.grossProfit, m.expenses);
    // Safe Net Profit Margin: if sales === 0, short-circuit to 0.00
    m.netProfitMargin = m.sales > 0 ? safeFinancialRound((netProfit / m.sales) * 100) : 0;
  }

  let data = Object.values(monthlyMap) as Record<string, unknown>[];

  // Apply VAT Auditor masking
  if (role === 'vat_auditor') {
    data = data.map(d => maskDashboardForVatAuditor(d as Record<string, unknown>, role)) as Record<string, unknown>[];
  }

  // Phase 16 D4: Activity log with "BI-Analytics-Core" compliance token
  await logUserActivity({
    action: 'EXPORT',
    module: 'BI-Analytics-Core',
    userId,
    userName,
    details: `Financial chart data generated — ${months}-month Sales vs COGS vs Gross Profit Margin`,
  });

  return NextResponse.json({ type: 'financial-chart', data });
}

// ─── POS Revenue Breakdown ───────────────────────────────────────────────────
async function handlePosRevenue(
  companyFilter: Record<string, unknown>,
  dateFilter: (base: Record<string, unknown>) => Record<string, unknown>,
  role: UserRole,
  userId: string,
  userName: string,
) {
  const posAgg = await db.posSale.aggregate({
    where: { ...dateFilter({ status: 'Completed', isActive: true, ...companyFilter }) },
    _sum: { grandTotal: true, cashAmount: true, cardAmount: true, mfsAmount: true },
  });

  const result: Record<string, unknown> = {
    totalPosRevenue: Number(posAgg._sum.grandTotal || 0),
    cashPortion: Number(posAgg._sum.cashAmount || 0),
    cardPortion: Number(posAgg._sum.cardAmount || 0),
    mfsPortion: Number(posAgg._sum.mfsAmount || 0),
  };

  const maskedResult = maskDashboardForVatAuditor(result, role);

  await logUserActivity({
    action: 'EXPORT',
    module: 'BI-Analytics-Core',
    userId,
    userName,
    details: 'POS revenue breakdown queried',
  });

  return NextResponse.json(maskedResult);
}

// ─── Helpers: Receivables & Payables with companyId anchor ───────────────────

async function calculateTotalReceivables(companyFilter: Record<string, unknown>): Promise<number> {
  const revenueStatusFilter = { notIn: ['Draft', 'Cancelled'] };

  const [salesAgg, posSalesAgg, collectionsAgg, returnsAgg, custOpenDrAgg, custOpenCrAgg] = await Promise.all([
    db.salesOrder.aggregate({
      where: { status: revenueStatusFilter, isActive: true, ...companyFilter },
      _sum: { grandTotal: true },
    }),
    db.posSale.aggregate({
      where: { status: 'Completed', isActive: true, ...companyFilter },
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

  const totalSales = safeFinancialAdd(
    Number(salesAgg._sum.grandTotal || 0),
    Number(posSalesAgg._sum.grandTotal || 0)
  );
  const totalCollections = Number(collectionsAgg._sum.amount || 0);
  const totalReturns = Number(returnsAgg._sum.grandTotal || 0);
  const openingDr = Number(custOpenDrAgg._sum.openingBalance || 0);
  const openingCr = Number(custOpenCrAgg._sum.openingBalance || 0);

  const receivablesBase = safeFinancialSubtract(
    safeFinancialAdd(openingDr, totalSales),
    safeFinancialAdd(totalCollections, safeFinancialAdd(totalReturns, openingCr))
  );
  return Math.max(0, receivablesBase);
}

async function calculateTotalPayables(companyFilter: Record<string, unknown>): Promise<number> {
  const revenueStatusFilter = { notIn: ['Draft', 'Cancelled'] };

  const [purchasesAgg, deliveriesAgg, returnsAgg, suppOpenCrAgg, suppOpenDrAgg] = await Promise.all([
    db.purchaseOrder.aggregate({
      where: { status: revenueStatusFilter, isActive: true, ...companyFilter },
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
  const openingCr = Number(suppOpenCrAgg._sum.openingBalance || 0);
  const openingDr = Number(suppOpenDrAgg._sum.openingBalance || 0);

  const payablesBase = safeFinancialSubtract(
    safeFinancialAdd(openingCr, totalPurchases),
    safeFinancialAdd(totalDeliveries, safeFinancialAdd(totalReturns, openingDr))
  );
  return Math.max(0, payablesBase);
}
