import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

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
        return await handleKPI(vatMode, dateFilter);
      case 'monthly-trend':
        return await handleMonthlyTrend(searchParams, vatMode, dateFilter);
      case 'category-turnover':
        return await handleCategoryTurnover(vatMode, dateFilter);
      case 'stock-alerts':
        return await handleStockAlerts();
      case 'financial-ratios':
        return await handleFinancialRatios(vatMode, dateFilter);
      case 'top-performers':
        return await handleTopPerformers(searchParams, vatMode, dateFilter);
      case 'payment-mix':
        return await handlePaymentMix(vatMode, dateFilter);
      case 'receivables-aging':
        return await handleReceivablesAging(vatMode, dateFilter);
      default:
        return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 });
    }
  } catch (error) {
    console.error('Dashboard Analytics API error:', error);
    return NextResponse.json({ error: 'Failed to generate analytics' }, { status: 500 });
  }
}

// ─── KPI ─────────────────────────────────────────────────────────────────────
async function handleKPI(vatMode: boolean, dateFilter: (base: Record<string, unknown>) => Record<string, unknown>) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // FIX 4: Exclude Cancelled in addition to Draft
  const revenueStatusFilter = { notIn: ['Draft', 'Cancelled'] };

  // Batch 1: Core aggregates (sequential to avoid SQLite locking)
  const salesAgg = await db.salesOrder.aggregate({
    where: { ...dateFilter({ status: revenueStatusFilter, isActive: true }) },
    _sum: { grandTotal: true },
  });
  const purchasesAgg = await db.purchaseOrder.aggregate({
    where: { ...dateFilter({ status: revenueStatusFilter, isActive: true }) },
    _sum: { grandTotal: true },
  });
  const expensesAgg = await db.expense.aggregate({
    where: { ...dateFilter({ isActive: true }) },
    _sum: { amount: true },
  });
  const incomeAgg = await db.income.aggregate({
    where: { ...dateFilter({ isActive: true }) },
    _sum: { amount: true },
  });
  const totalCustomers = await db.customer.count({ where: { isActive: true } });
  const totalSuppliers = await db.supplier.count({ where: { isActive: true } });
  const totalProducts = await db.product.count({ where: { isActive: true } });
  const bankBalanceAgg = await db.bank.aggregate({ _sum: { currentBalance: true } });
  const todaysSalesAgg = await db.salesOrder.aggregate({
    where: { date: { gte: todayStart }, status: revenueStatusFilter, isActive: true },
    _sum: { grandTotal: true },
  });
  const todaysPurchasesAgg = await db.purchaseOrder.aggregate({
    where: { date: { gte: todayStart }, status: revenueStatusFilter, isActive: true },
    _sum: { grandTotal: true },
  });
  const todaysCollectionsAgg = await db.cashCollection.aggregate({
    where: { date: { gte: todayStart }, isActive: true }, _sum: { amount: true },
  });
  const mtdSalesAgg = await db.salesOrder.aggregate({
    where: { date: { gte: monthStart }, status: revenueStatusFilter, isActive: true },
    _sum: { grandTotal: true },
  });
  const mtdPurchasesAgg = await db.purchaseOrder.aggregate({
    where: { date: { gte: monthStart }, status: revenueStatusFilter, isActive: true },
    _sum: { grandTotal: true },
  });

  // FIX 2: Count low stock products where openingStock <= reorderLevel
  // Since Prisma SQLite doesn't support field-to-field comparison in where,
  // fetch all active products with their reorderLevel and count in JS
  const allProductsForStock = await db.product.findMany({
    where: { isActive: true },
    select: { openingStock: true, reorderLevel: true },
  });
  const lowStockProducts = allProductsForStock.filter(
    (p) => Number(p.openingStock) <= Number(p.reorderLevel)
  ).length;

  const totalRevenue = Number(salesAgg._sum.grandTotal || 0);
  const totalPurchases = Number(purchasesAgg._sum.grandTotal || 0);
  const totalExpenses = Number(expensesAgg._sum.amount || 0);
  const totalIncomes = Number(incomeAgg._sum.amount || 0);

  // FIX: COGS = sum of (quantity × costPrice) from sales order lines for confirmed sales
  // NOT total purchase order amounts (which includes unsold inventory)
  const salesLinesForCOGS = await db.salesOrderLine.findMany({
    where: {
      salesOrder: { status: { notIn: ['Draft', 'Cancelled'] }, isActive: true },
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
  const netProfit = grossProfit + totalIncomes - totalExpenses;

  const totalReceivables = await calculateTotalReceivables();
  const totalPayables = await calculateTotalPayables();
  const totalBankBalance = Number(bankBalanceAgg._sum.currentBalance || 0);

  // FIX 1: Compute inventory value as SUM(costPrice * openingStock) per product
  // If total stock is 0, inventory value should be 0
  const activeProducts = await db.product.findMany({
    where: { isActive: true },
    select: { costPrice: true, openingStock: true },
  });
  const totalInventoryValue = activeProducts.reduce(
    (sum, p) => sum + Number(p.costPrice) * Number(p.openingStock),
    0
  );
  const totalAssets = totalBankBalance + totalInventoryValue + totalReceivables;

  const assetTurnoverRatio = totalAssets > 0 ? totalRevenue / totalAssets : 0;
  const returnOnSales = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  const result: Record<string, unknown> = {
    totalRevenue,
    totalPurchases,
    totalExpenses,
    totalIncomes,
    grossProfit: vatMode ? 'N/A (Audit Mode)' : grossProfit,
    netProfit: vatMode ? 'N/A (Audit Mode)' : netProfit,
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
    assetTurnoverRatio: vatMode ? 'N/A (Audit Mode)' : Math.round(assetTurnoverRatio * 100) / 100,
    returnOnSales: vatMode ? 'N/A (Audit Mode)' : Math.round(returnOnSales * 100) / 100,
  };

  if (vatMode) {
    result.vatMode = true;
  }

  return NextResponse.json(result);
}

// ─── Monthly Trend ───────────────────────────────────────────────────────────
async function handleMonthlyTrend(searchParams: URLSearchParams, vatMode: boolean, dateFilter: (base: Record<string, unknown>) => Record<string, unknown>) {
  const months = parseInt(searchParams.get('months') || '12', 10);
  const now = new Date();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);

  // FIX 4: Exclude Cancelled in addition to Draft
  const revenueStatusFilter = { notIn: ['Draft', 'Cancelled'] };

  const [salesOrders, purchaseOrders, expenses, incomes] = await Promise.all([
    db.salesOrder.findMany({
      where: { date: { gte: startDate }, status: revenueStatusFilter, isActive: true },
      select: { date: true, grandTotal: true },
    }),
    db.purchaseOrder.findMany({
      where: { date: { gte: startDate }, status: revenueStatusFilter, isActive: true },
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
    if (monthlyMap[key]) monthlyMap[key].sales += Number(so.grandTotal);
  }

  // Aggregate purchases
  for (const po of purchaseOrders) {
    const d = new Date(po.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (monthlyMap[key]) monthlyMap[key].purchases += Number(po.grandTotal);
  }

  // Aggregate expenses
  for (const exp of expenses) {
    const d = new Date(exp.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (monthlyMap[key]) monthlyMap[key].expenses += Number(exp.amount);
  }

  // Aggregate incomes
  for (const inc of incomes) {
    const d = new Date(inc.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (monthlyMap[key]) monthlyMap[key].income += Number(inc.amount);
  }

  // Calculate net cash flow
  for (const key of Object.keys(monthlyMap)) {
    const m = monthlyMap[key];
    m.net = m.sales + m.income - m.purchases - m.expenses;
  }

  const data = Object.values(monthlyMap);

  if (vatMode) {
    for (const d of data) {
      (d as Record<string, unknown>).net = 'N/A (Audit Mode)';
    }
  }

  return NextResponse.json({ type: 'monthly-trend', data });
}

// ─── Category Turnover ───────────────────────────────────────────────────────
async function handleCategoryTurnover(vatMode: boolean, dateFilter: (base: Record<string, unknown>) => Record<string, unknown>) {
  const categories = await db.category.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  // FIX 4: Exclude Cancelled in addition to Draft
  const revenueStatusFilter = { notIn: ['Draft', 'Cancelled'] };

  const data = await Promise.all(
    categories.map(async (cat) => {
      const salesWhere: Record<string, unknown> = {
        product: { categoryId: cat.id, isActive: true },
        salesOrder: { status: revenueStatusFilter, isActive: true },
      };
      dateFilter(salesWhere.product as Record<string, unknown>);

      const purchaseWhere: Record<string, unknown> = {
        product: { categoryId: cat.id, isActive: true },
        purchaseOrder: { status: revenueStatusFilter, isActive: true },
      };
      dateFilter(purchaseWhere.product as Record<string, unknown>);

      const [salesLines, purchaseLines] = await Promise.all([
        db.salesOrderLine.findMany({
          where: salesWhere as never,
          select: { quantity: true, total: true },
        }),
        db.purchaseOrderLine.findMany({
          where: purchaseWhere as never,
          select: { quantity: true, total: true },
        }),
      ]);

      const totalSalesQty = salesLines.reduce((s, l) => s + Number(l.quantity), 0);
      const totalSalesValue = salesLines.reduce((s, l) => s + Number(l.total), 0);
      const totalPurchaseQty = purchaseLines.reduce((s, l) => s + Number(l.quantity), 0);
      const totalPurchaseValue = purchaseLines.reduce((s, l) => s + Number(l.total), 0);
      const turnoverRatio = totalPurchaseValue > 0 ? totalSalesValue / totalPurchaseValue : 0;

      return {
        name: cat.name,
        totalSalesQty,
        totalSalesValue: vatMode ? 'N/A (Audit Mode)' : totalSalesValue,
        totalPurchaseQty,
        totalPurchaseValue: vatMode ? 'N/A (Audit Mode)' : totalPurchaseValue,
        turnoverRatio: vatMode ? 'N/A (Audit Mode)' : Math.round(turnoverRatio * 100) / 100,
        // PieChart format
        value: totalSalesValue,
      };
    })
  );

  // Sort by sales value descending, filter out zero
  const filtered = data.filter((d) => typeof d.value === 'number' && d.value > 0);
  filtered.sort((a, b) => (b.value as number) - (a.value as number));

  return NextResponse.json({ type: 'category-turnover', data: filtered });
}

// ─── Stock Alerts ────────────────────────────────────────────────────────────
async function handleStockAlerts() {
  // Get all products with their current stock info
  const products = await db.product.findMany({
    where: { isActive: true },
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
async function handleFinancialRatios(vatMode: boolean, dateFilter: (base: Record<string, unknown>) => Record<string, unknown>) {
  // FIX 4: Exclude Cancelled in addition to Draft
  const revenueStatusFilter = { notIn: ['Draft', 'Cancelled'] };

  const salesAgg = await db.salesOrder.aggregate({
    where: { ...dateFilter({ status: revenueStatusFilter, isActive: true }) },
    _sum: { grandTotal: true },
  });
  const purchasesAgg = await db.purchaseOrder.aggregate({
    where: { ...dateFilter({ status: revenueStatusFilter, isActive: true }) },
    _sum: { grandTotal: true },
  });
  const expensesAgg = await db.expense.aggregate({
    where: { ...dateFilter({ isActive: true }) },
    _sum: { amount: true },
  });
  const incomeAgg = await db.income.aggregate({
    where: { ...dateFilter({ isActive: true }) },
    _sum: { amount: true },
  });
  const bankBalanceAgg = await db.bank.aggregate({ _sum: { currentBalance: true } });

  // FIX 1: Compute inventory value as SUM(costPrice * openingStock) per product
  const activeProducts = await db.product.findMany({
    where: { isActive: true },
    select: { costPrice: true, openingStock: true },
  });
  const totalInventoryValue = activeProducts.reduce(
    (sum, p) => sum + Number(p.costPrice) * Number(p.openingStock),
    0
  );

  const totalRevenue = Number(salesAgg._sum.grandTotal || 0);
  const totalPurchases = Number(purchasesAgg._sum.grandTotal || 0);
  const totalExpenses = Number(expensesAgg._sum.amount || 0);
  const totalIncomes = Number(incomeAgg._sum.amount || 0);

  // FIX: COGS = sum of (quantity × costPrice) from sales order lines for confirmed sales
  // NOT total purchase order amounts (which includes unsold inventory)
  const salesLinesForCOGS = await db.salesOrderLine.findMany({
    where: {
      salesOrder: { status: { notIn: ['Draft', 'Cancelled'] }, isActive: true },
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
  const netProfit = grossProfit + totalIncomes - totalExpenses;

  const totalBankBalance = Number(bankBalanceAgg._sum.currentBalance || 0);

  const totalReceivables = await calculateTotalReceivables();
  const totalPayables = await calculateTotalPayables();

  // Current assets = bank + inventory + receivables
  const currentAssets = totalBankBalance + totalInventoryValue + totalReceivables;
  // Current liabilities = payables
  const currentLiabilities = totalPayables;

  // Total assets (simplified: current assets)
  const totalAssets = currentAssets;

  // Total liabilities (simplified: payables)
  const totalLiab = totalPayables;
  // Total equity = assets - liabilities
  const totalEquity = totalAssets - totalLiab;

  // Ratios
  const currentRatio = currentLiabilities > 0 ? currentAssets / currentLiabilities : 0;
  const debtToEquityRatio = totalEquity > 0 ? totalLiab / totalEquity : 0;
  const grossProfitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
  const netProfitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
  const receivablesTurnover = totalReceivables > 0 ? totalRevenue / totalReceivables : 0;
  const payablesTurnover = totalPayables > 0 ? totalPurchases / totalPayables : 0;
  const inventoryTurnover = totalInventoryValue > 0 ? cogs / totalInventoryValue : 0;
  const assetTurnover = totalAssets > 0 ? totalRevenue / totalAssets : 0;
  const workingCapital = currentAssets - currentLiabilities;
  const quickRatio = currentLiabilities > 0 ? (currentAssets - totalInventoryValue) / currentLiabilities : 0;

  if (vatMode) {
    return NextResponse.json({
      type: 'financial-ratios',
      vatMode: true,
      currentRatio: Math.round(currentRatio * 100) / 100,
      debtToEquityRatio: 'N/A (Audit Mode)',
      grossProfitMargin: 'N/A (Audit Mode)',
      netProfitMargin: 'N/A (Audit Mode)',
      receivablesTurnover: Math.round(receivablesTurnover * 100) / 100,
      payablesTurnover: Math.round(payablesTurnover * 100) / 100,
      inventoryTurnover: 'N/A (Audit Mode)',
      assetTurnover: 'N/A (Audit Mode)',
      workingCapital: 'N/A (Audit Mode)',
      quickRatio: Math.round(quickRatio * 100) / 100,
    });
  }

  return NextResponse.json({
    type: 'financial-ratios',
    currentRatio: Math.round(currentRatio * 100) / 100,
    debtToEquityRatio: Math.round(debtToEquityRatio * 100) / 100,
    grossProfitMargin: Math.round(grossProfitMargin * 100) / 100,
    netProfitMargin: Math.round(netProfitMargin * 100) / 100,
    receivablesTurnover: Math.round(receivablesTurnover * 100) / 100,
    payablesTurnover: Math.round(payablesTurnover * 100) / 100,
    inventoryTurnover: Math.round(inventoryTurnover * 100) / 100,
    assetTurnover: Math.round(assetTurnover * 100) / 100,
    workingCapital: Math.round(workingCapital * 100) / 100,
    quickRatio: Math.round(quickRatio * 100) / 100,
  });
}

// ─── Top Performers ──────────────────────────────────────────────────────────
async function handleTopPerformers(searchParams: URLSearchParams, vatMode: boolean, dateFilter: (base: Record<string, unknown>) => Record<string, unknown>) {
  const limit = parseInt(searchParams.get('limit') || '10', 10);

  // FIX 4: Exclude Cancelled in addition to Draft
  const revenueStatusFilter = { notIn: ['Draft', 'Cancelled'] };

  // Top selling products by revenue
  const salesLines = await db.salesOrderLine.findMany({
    where: { salesOrder: { status: revenueStatusFilter, isActive: true } },
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
    productMap[pid].totalQty += Number(line.quantity);
    productMap[pid].totalRevenue += Number(line.total);
  }
  const topProducts = Object.values(productMap)
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, limit);

  // Top customers by purchase volume
  const customerSales = await db.salesOrder.groupBy({
    by: ['customerId'],
    where: { status: revenueStatusFilter, isActive: true },
    _sum: { grandTotal: true },
    orderBy: { _sum: { grandTotal: 'desc' } },
    take: limit,
  });

  const customerIds = customerSales.map((cs) => cs.customerId);
  const customers = await db.customer.findMany({
    where: { id: { in: customerIds } },
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

  // Top suppliers by purchase value
  const supplierPurchases = await db.purchaseOrder.groupBy({
    by: ['supplierId'],
    where: { status: revenueStatusFilter, isActive: true },
    _sum: { grandTotal: true },
    orderBy: { _sum: { grandTotal: 'desc' } },
    take: limit,
  });

  const supplierIds = supplierPurchases.map((sp) => sp.supplierId);
  const suppliers = await db.supplier.findMany({
    where: { id: { in: supplierIds } },
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

  // Top SRs (employees) by sales value
  // We don't have direct SR linkage on SalesOrder in current schema,
  // so we use employees with SR targets as proxy
  const srTargets = await db.sRTargetSetup.findMany({
    where: { isActive: true },
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
    topProducts: vatMode ? topProducts.map((p) => ({ ...p, totalRevenue: 'N/A (Audit Mode)' as const })) : topProducts,
    topCustomers,
    topSuppliers: vatMode ? topSuppliers.map((s) => ({ ...s, totalPurchaseValue: 'N/A (Audit Mode)' as const })) : topSuppliers,
    topSRs,
  };

  if (vatMode) {
    result.vatMode = true;
  }

  return NextResponse.json(result);
}

// ─── Payment Mix ─────────────────────────────────────────────────────────────
async function handlePaymentMix(vatMode: boolean, dateFilter: (base: Record<string, unknown>) => Record<string, unknown>) {
  // FIX 4: Exclude Cancelled in addition to Draft
  const revenueStatusFilter = { notIn: ['Draft', 'Cancelled'] };

  const paymentOptions = await db.paymentOption.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  const data = await Promise.all(
    paymentOptions.map(async (po) => {
      const agg = await db.salesOrder.aggregate({
        where: { paymentOptionId: po.id, status: revenueStatusFilter, isActive: true },
        _sum: { grandTotal: true },
      });

      const value = Number(agg._sum.grandTotal || 0);
      return {
        name: po.name,
        value,
        paymentOptionId: po.id,
      };
    })
  );

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
async function handleReceivablesAging(vatMode: boolean, dateFilter: (base: Record<string, unknown>) => Record<string, unknown>) {
  const today = new Date();

  // FIX 4: Exclude Cancelled in addition to Draft
  const revenueStatusFilter = { notIn: ['Draft', 'Cancelled'] };

  // FIX 6: Sort by date ascending (oldest first) for FIFO allocation
  const salesOrders = await db.salesOrder.findMany({
    where: { status: revenueStatusFilter, isActive: true },
    select: {
      id: true,
      customerId: true,
      date: true,
      grandTotal: true,
    },
    orderBy: { date: 'asc' },
  });

  // Get all cash collections and sales returns for balance calculation
  const [cashCollections, salesReturns] = await Promise.all([
    db.cashCollection.findMany({
      where: { isActive: true, status: { not: 'Draft' } },
      select: { customerId: true, amount: true },
    }),
    db.salesReturn.findMany({
      where: { isActive: true, status: { not: 'Draft' } },
      select: { salesOrderId: true, grandTotal: true },
    }),
  ]);

  // Build a map of collections per customer
  const collectionsByCustomer: Record<string, number> = {};
  for (const cc of cashCollections) {
    collectionsByCustomer[cc.customerId] = (collectionsByCustomer[cc.customerId] || 0) + Number(cc.amount);
  }

  // Build a map of returns per SO
  const returnsBySO: Record<string, number> = {};
  for (const sr of salesReturns) {
    returnsBySO[sr.salesOrderId] = (returnsBySO[sr.salesOrderId] || 0) + Number(sr.grandTotal);
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
    const custRemaining = custAvailable - custUsed;

    const collectedForThis = Math.min(soTotal - returned, custRemaining);
    customerCollectionUsed[so.customerId] = custUsed + Math.max(0, collectedForThis);

    const balance = soTotal - returned - Math.max(0, collectedForThis);

    if (balance > 0) {
      const daysOutstanding = Math.floor(
        (today.getTime() - new Date(so.date).getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysOutstanding <= 30) {
        current += balance;
      } else if (daysOutstanding <= 60) {
        days31to60 += balance;
      } else if (daysOutstanding <= 90) {
        days61to90 += balance;
      } else {
        days90plus += balance;
      }
    }
  }

  const totalOutstanding = current + days31to60 + days61to90 + days90plus;

  return NextResponse.json({
    type: 'receivables-aging',
    totalOutstanding: vatMode ? 'N/A (Audit Mode)' : totalOutstanding,
    current: vatMode ? 'N/A (Audit Mode)' : current,
    days31to60: vatMode ? 'N/A (Audit Mode)' : days31to60,
    days61to90: vatMode ? 'N/A (Audit Mode)' : days61to90,
    days90plus: vatMode ? 'N/A (Audit Mode)' : days90plus,
    vatMode: vatMode || undefined,
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function calculateTotalReceivables(): Promise<number> {
  const salesAgg = await db.salesOrder.aggregate({
    where: { status: { notIn: ['Draft', 'Cancelled'] }, isActive: true },
    _sum: { grandTotal: true },
  });
  const collectionsAgg = await db.cashCollection.aggregate({
    where: { isActive: true },
    _sum: { amount: true },
  });
  const returnsAgg = await db.salesReturn.aggregate({
    where: { isActive: true },
    _sum: { grandTotal: true },
  });
  const customerOpeningDr = await db.customer.aggregate({
    where: { openingBalanceType: 'Dr', isActive: true },
    _sum: { openingBalance: true },
  });
  const customerOpeningCr = await db.customer.aggregate({
    where: { openingBalanceType: 'Cr', isActive: true },
    _sum: { openingBalance: true },
  });

  const totalSales = Number(salesAgg._sum.grandTotal || 0);
  const totalCollections = Number(collectionsAgg._sum.amount || 0);
  const totalReturns = Number(returnsAgg._sum.grandTotal || 0);
  const openingDr = Number(customerOpeningDr._sum.openingBalance || 0);
  const openingCr = Number(customerOpeningCr._sum.openingBalance || 0);

  return Math.max(0, openingDr + totalSales - totalCollections - totalReturns - openingCr);
}

async function calculateTotalPayables(): Promise<number> {
  const purchasesAgg = await db.purchaseOrder.aggregate({
    where: { status: { notIn: ['Draft', 'Cancelled'] }, isActive: true },
    _sum: { grandTotal: true },
  });
  const deliveriesAgg = await db.cashDelivery.aggregate({
    where: { isActive: true },
    _sum: { amount: true },
  });
  const returnsAgg = await db.purchaseReturn.aggregate({
    where: { isActive: true },
    _sum: { grandTotal: true },
  });
  const supplierOpeningCr = await db.supplier.aggregate({
    where: { openingBalanceType: 'Cr', isActive: true },
    _sum: { openingBalance: true },
  });
  const supplierOpeningDr = await db.supplier.aggregate({
    where: { openingBalanceType: 'Dr', isActive: true },
    _sum: { openingBalance: true },
  });

  const totalPurchases = Number(purchasesAgg._sum.grandTotal || 0);
  const totalDeliveries = Number(deliveriesAgg._sum.amount || 0);
  const totalReturns = Number(returnsAgg._sum.grandTotal || 0);
  const openingCr = Number(supplierOpeningCr._sum.openingBalance || 0);
  const openingDr = Number(supplierOpeningDr._sum.openingBalance || 0);

  return Math.max(0, openingCr + totalPurchases - totalDeliveries - totalReturns - openingDr);
}
