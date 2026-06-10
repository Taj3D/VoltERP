import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, validateVatMode, stripHtml } from '@/lib/api-security';
import { safeFinancialAdd, safeFinancialSubtract, safeFinancialRound } from '@/lib/api-security';
import type { UserRole } from '@/lib/api-security';

// ============================================================
// TYPES
// ============================================================

interface ColumnDef {
  key: string;
  label: string;
}

interface ReportResult {
  title: string;
  columns: ColumnDef[];
  rows: Record<string, unknown>[];
  summary: Record<string, unknown>;
  chartData: Record<string, unknown>[];
}

interface QueryParams {
  type: string;
  subtype: string;
  from: string | null;
  to: string | null;
  sortField: string | null;
  sortOrder: 'asc' | 'desc';
  groupBy: string | null;
  supplierId: string | null;
  customerId: string | null;
  employeeId: string | null;
  bankId: string | null;
  categoryId: string | null;
  companyId: string | null;
  productId: string | null;
  godownId: string | null;
  vatMode: boolean;
  keyword: string | null;
}

// ============================================================
// HELPERS
// ============================================================

function buildDateFilter(from: string | null, to: string | null): Record<string, Date> | undefined {
  const filter: Record<string, Date> = {};
  if (from) filter.gte = new Date(from + 'T00:00:00.000Z');
  // MIS-003 FIX: Use start of next day as exclusive upper bound for inclusive end-of-day filtering
  // This avoids T23:59:59.999Z precision issues with SQLite date comparisons
  if (to) {
    const endOfDay = new Date(to + 'T23:59:59.999Z');
    filter.lte = endOfDay;
  }
  if (Object.keys(filter).length === 0) return undefined;
  return filter;
}

function sortRows(rows: Record<string, unknown>[], sortField: string | null, sortOrder: 'asc' | 'desc'): Record<string, unknown>[] {
  if (!sortField) return rows;
  return [...rows].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return sortOrder === 'asc' ? -1 : 1;
    if (bVal == null) return sortOrder === 'asc' ? 1 : -1;
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    }
    const aStr = String(aVal);
    const bStr = String(bVal);
    return sortOrder === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
  });
}

function groupRows(rows: Record<string, unknown>[], groupBy: string | null): Record<string, unknown>[] {
  if (!groupBy) return rows;
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const key = String(row[groupBy] ?? 'N/A');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }
  const result: Record<string, unknown>[] = [];
  for (const [key, items] of groups) {
    result.push({
      group: key,
      count: items.length,
      items,
    });
  }
  return result;
}

function maskVat(val: unknown, vatMode: boolean): unknown {
  if (vatMode) return 'N/A (Audit Mode)';
  return val;
}

const misApiCurrencyFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmt(num: number): string {
  return misApiCurrencyFmt.format(num);
}

// MIS-004 FIX: Safe date formatter — prevents Bengali digit output from toLocaleDateString()
// Uses explicit 'en-GB' locale with day/month/year format (e.g., "05 Mar 2026")
const misApiDateFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

function fmtDate(d: Date | string): string {
  try {
    const date = typeof d === 'string' ? new Date(d) : d;
    if (isNaN(date.getTime())) return '—';
    return misApiDateFmt.format(date);
  } catch {
    return '—';
  }
}

function emptyReport(title: string, columns: ColumnDef[]): ReportResult {
  return { title, columns, rows: [], summary: {}, chartData: [] };
}

// ============================================================
// BASIC REPORTS
// ============================================================

async function employeeInformation(params: QueryParams): Promise<ReportResult> {
  const where: Record<string, unknown> = { isActive: true };
  if (params.employeeId) where.id = params.employeeId;

  const employees = await db.employee.findMany({
    where,
    include: { designation: true, department: true },
  });

  const columns: ColumnDef[] = [
    { key: 'employeeCode', label: 'Code' },
    { key: 'name', label: 'Name' },
    { key: 'designation', label: 'Designation' },
    { key: 'department', label: 'Department' },
    { key: 'joiningDate', label: 'Joining Date' },
    { key: 'phone', label: 'Phone' },
    { key: 'status', label: 'Status' },
  ];

  let rows = employees.map((e) => ({
    employeeCode: e.employeeCode,
    name: e.name,
    designation: e.designation?.name || '',
    department: e.department?.name || '',
    joiningDate: e.joiningDate ? fmtDate(e.joiningDate) : '',
    phone: e.phone || '',
    status: e.isActive ? 'Active' : 'Inactive',
  }));

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  const deptCounts: Record<string, number> = {};
  for (const e of employees) {
    const dept = e.department?.name || 'Unknown';
    deptCounts[dept] = (deptCounts[dept] || 0) + 1;
  }

  return {
    title: 'Employee Information Report',
    columns,
    rows,
    summary: {
      totalEmployees: employees.length,
      activeCount: employees.filter((e) => e.isActive).length,
      departments: Object.keys(deptCounts).length,
    },
    chartData: Object.entries(deptCounts).map(([name, count]) => ({ name, count })),
  };
}

async function productInformation(params: QueryParams): Promise<ReportResult> {
  const where: Record<string, unknown> = { isActive: true };
  if (params.categoryId) where.categoryId = params.categoryId;
  if (params.companyId) where.companyId = params.companyId;
  if (params.productId) where.id = params.productId;

  const products = await db.product.findMany({
    where,
    include: { category: true, company: true, godown: true },
  });

  const columns: ColumnDef[] = [
    { key: 'productCode', label: 'Code' },
    { key: 'name', label: 'Name' },
    { key: 'category', label: 'Category' },
    { key: 'company', label: 'Company' },
    { key: 'costPrice', label: 'Cost Price' },
    { key: 'salePrice', label: 'Sale Price' },
    { key: 'wholesalePrice', label: 'Wholesale Price' },
    { key: 'dealerPrice', label: 'Dealer Price' },
    { key: 'openingStock', label: 'Stock' },
    { key: 'reorderLevel', label: 'Reorder Level' },
  ];

  let rows = products.map((p) => ({
    productCode: p.productCode,
    name: p.name,
    category: p.category?.name || '',
    company: p.company?.name || '',
    costPrice: maskVat(p.costPrice, params.vatMode),
    salePrice: maskVat(p.salePrice, params.vatMode),
    wholesalePrice: maskVat(p.wholesalePrice, params.vatMode),
    dealerPrice: maskVat(p.dealerPrice, params.vatMode),
    openingStock: p.openingStock,
    reorderLevel: p.reorderLevel,
  }));

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  const catCounts: Record<string, number> = {};
  for (const p of products) {
    const cat = p.category?.name || 'Unknown';
    catCounts[cat] = (catCounts[cat] || 0) + 1;
  }

  return {
    title: 'Product Information Report',
    columns,
    rows,
    summary: {
      totalProducts: products.length,
      totalStockValue: params.vatMode ? 'N/A (Audit Mode)' : fmt(products.reduce((s, p) => s + p.costPrice * p.openingStock, 0)),
      categories: Object.keys(catCounts).length,
      belowReorder: products.filter((p) => p.openingStock <= p.reorderLevel).length,
    },
    chartData: Object.entries(catCounts).map(([name, count]) => ({ name, count })),
  };
}

async function stockDetails(params: QueryParams): Promise<ReportResult> {
  const where: Record<string, unknown> = { isActive: true };
  if (params.productId) where.id = params.productId;
  if (params.godownId) where.godownId = params.godownId;
  // MIS-002 FIX: Add missing categoryId filter
  if (params.categoryId) where.categoryId = params.categoryId;
  if (params.companyId) where.companyId = params.companyId;

  const products = await db.product.findMany({
    where,
    include: { category: true, godown: true, stockEntries: {} },
  });

  const columns: ColumnDef[] = [
    { key: 'productCode', label: 'Code' },
    { key: 'name', label: 'Product' },
    { key: 'category', label: 'Category' },
    { key: 'godown', label: 'Godown' },
    { key: 'stockIn', label: 'IN' },
    { key: 'stockOut', label: 'OUT' },
    { key: 'balance', label: 'Balance' },
  ];

  let rows = products.map((p) => {
    const stockIn = p.stockEntries.filter((se) => se.type === 'IN').reduce((s, se) => s + se.quantity, 0);
    const stockOut = p.stockEntries.filter((se) => se.type === 'OUT').reduce((s, se) => s + se.quantity, 0);
    return {
      productCode: p.productCode,
      name: p.name,
      category: p.category?.name || '',
      godown: p.godown?.name || '',
      stockIn,
      stockOut,
      balance: p.openingStock + stockIn - stockOut,
    };
  });

  // H11 FIX: Calculate summary BEFORE groupRows() to avoid broken totals when groupBy is active
  const totalIn = rows.reduce((s, r) => s + (Number(r.stockIn) || 0), 0);
  const totalOut = rows.reduce((s, r) => s + (Number(r.stockOut) || 0), 0);
  const totalBal = rows.reduce((s, r) => s + (Number(r.balance) || 0), 0);

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  return {
    title: 'Stock Details Report',
    columns,
    rows,
    summary: { totalProducts: products.length, totalIn, totalOut, totalBalance: totalBal },
    chartData: rows.slice(0, 20).map((r) => ({ name: String(r.name), in: r.stockIn, out: r.stockOut, balance: r.balance })),
  };
}

async function stockSummary(params: QueryParams): Promise<ReportResult> {
  const where: Record<string, unknown> = { isActive: true };
  if (params.categoryId) where.categoryId = params.categoryId;
  // MIS-002 FIX: Add missing companyId filter
  if (params.companyId) where.companyId = params.companyId;
  if (params.godownId) where.godownId = params.godownId;

  const products = await db.product.findMany({
    where,
    include: { category: true, stockEntries: {} },
  });

  const catMap = new Map<string, { category: string; totalQty: number; totalValue: number; count: number }>();
  for (const p of products) {
    const cat = p.category?.name || 'Unknown';
    const stockIn = p.stockEntries.filter((se) => se.type === 'IN').reduce((s, se) => s + se.quantity, 0);
    const stockOut = p.stockEntries.filter((se) => se.type === 'OUT').reduce((s, se) => s + se.quantity, 0);
    const qty = p.openingStock + stockIn - stockOut;
    // MIS-001 FIX: Stock value calculations should show "N/A (Audit Mode)" not 0
    const val = params.vatMode ? 0 : qty * p.costPrice;
    const existing = catMap.get(cat);
    if (existing) {
      existing.totalQty += qty;
      existing.totalValue += val;
      existing.count += 1;
    } else {
      catMap.set(cat, { category: cat, totalQty: qty, totalValue: val, count: 1 });
    }
  }

  const columns: ColumnDef[] = [
    { key: 'category', label: 'Category' },
    { key: 'productCount', label: 'Products' },
    { key: 'totalQty', label: 'Total Qty' },
    { key: 'totalValue', label: 'Total Value' },
  ];

  let rows = Array.from(catMap.values()).map((v) => ({
    category: v.category,
    productCount: v.count,
    totalQty: v.totalQty,
    totalValue: params.vatMode ? 'N/A (Audit Mode)' : v.totalValue,
  }));

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  const totalQty = Array.from(catMap.values()).reduce((s, v) => s + v.totalQty, 0);
  const totalVal = Array.from(catMap.values()).reduce((s, v) => s + v.totalValue, 0);

  return {
    title: 'Stock Summary Report',
    columns,
    rows,
    summary: {
      totalCategories: catMap.size,
      totalProducts: products.length,
      totalQty,
      totalValue: params.vatMode ? 'N/A (Audit Mode)' : fmt(totalVal),
    },
    chartData: Array.from(catMap.values()).map((v) => ({
      name: v.category,
      qty: v.totalQty,
      value: params.vatMode ? 0 : v.totalValue,
    })),
  };
}

async function stockLedger(params: QueryParams): Promise<ReportResult> {
  const where: Record<string, unknown> = {};
  if (params.productId) where.productId = params.productId;
  if (params.godownId) where.godownId = params.godownId;
  const dateFilter = buildDateFilter(params.from, params.to);
  if (dateFilter) where.date = dateFilter;

  const entries = await db.stockEntry.findMany({
    where,
    include: { product: true },
    orderBy: { date: 'asc' },
  });

  const columns: ColumnDef[] = [
    { key: 'date', label: 'Date' },
    { key: 'product', label: 'Product' },
    { key: 'type', label: 'Type' },
    { key: 'quantity', label: 'Quantity' },
    { key: 'reference', label: 'Reference' },
    { key: 'referenceType', label: 'Ref Type' },
    { key: 'notes', label: 'Notes' },
  ];

  let rows = entries.map((e) => ({
    date: fmtDate(e.date),
    product: e.product?.name || '',
    type: e.type,
    quantity: e.quantity,
    reference: e.reference || '',
    referenceType: e.referenceType || '',
    notes: e.notes || '',
  }));

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  const totalIn = entries.filter((e) => e.type === 'IN').reduce((s, e) => s + e.quantity, 0);
  const totalOut = entries.filter((e) => e.type === 'OUT').reduce((s, e) => s + e.quantity, 0);

  return {
    title: 'Stock Ledger Report',
    columns,
    rows,
    summary: { totalEntries: entries.length, totalIn, totalOut, net: totalIn - totalOut },
    chartData: entries.slice(0, 50).map((e) => ({
      date: fmtDate(e.date),
      in: e.type === 'IN' ? e.quantity : 0,
      out: e.type === 'OUT' ? e.quantity : 0,
    })),
  };
}

async function stockQty(params: QueryParams): Promise<ReportResult> {
  const where: Record<string, unknown> = { isActive: true };
  if (params.categoryId) where.categoryId = params.categoryId;
  if (params.godownId) where.godownId = params.godownId;

  const products = await db.product.findMany({
    where,
    include: { category: true, stockEntries: {} },
  });

  const columns: ColumnDef[] = [
    { key: 'productCode', label: 'Code' },
    { key: 'name', label: 'Product' },
    { key: 'category', label: 'Category' },
    { key: 'currentQty', label: 'Current Qty' },
    { key: 'reorderLevel', label: 'Reorder Level' },
    { key: 'alert', label: 'Alert' },
  ];

  let rows = products.map((p) => {
    const stockIn = p.stockEntries.filter((se) => se.type === 'IN').reduce((s, se) => s + se.quantity, 0);
    const stockOut = p.stockEntries.filter((se) => se.type === 'OUT').reduce((s, se) => s + se.quantity, 0);
    const currentQty = p.openingStock + stockIn - stockOut;
    return {
      productCode: p.productCode,
      name: p.name,
      category: p.category?.name || '',
      currentQty,
      reorderLevel: p.reorderLevel,
      alert: currentQty <= p.reorderLevel ? 'LOW STOCK' : 'OK',
    };
  });

  // H11 FIX: Calculate summary BEFORE groupRows() to avoid broken totals when groupBy is active
  const lowStock = rows.filter((r) => r.alert === 'LOW STOCK').length;

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  return {
    title: 'Stock Quantity Report',
    columns,
    rows,
    summary: { totalProducts: products.length, lowStock, okStock: products.length - lowStock },
    chartData: [
      { name: 'OK', count: products.length - lowStock },
      { name: 'Low Stock', count: lowStock },
    ],
  };
}

async function stockForecastProduct(params: QueryParams): Promise<ReportResult> {
  // MIS-002 FIX: Add missing filters
  const where: Record<string, unknown> = { isActive: true };
  if (params.categoryId) where.categoryId = params.categoryId;
  if (params.companyId) where.companyId = params.companyId;
  if (params.productId) where.id = params.productId;
  if (params.godownId) where.godownId = params.godownId;

  const products = await db.product.findMany({
    where,
    include: { category: true, stockEntries: {} },
  });

  const columns: ColumnDef[] = [
    { key: 'productCode', label: 'Code' },
    { key: 'name', label: 'Product' },
    { key: 'category', label: 'Category' },
    { key: 'currentQty', label: 'Current Qty' },
    { key: 'reorderLevel', label: 'Reorder Level' },
    { key: 'shortfall', label: 'Shortfall' },
    { key: 'forecastNeed', label: 'Forecast Need' },
  ];

  const belowReorder = products.filter((p) => {
    const stockIn = p.stockEntries.filter((se) => se.type === 'IN').reduce((s, se) => s + se.quantity, 0);
    const stockOut = p.stockEntries.filter((se) => se.type === 'OUT').reduce((s, se) => s + se.quantity, 0);
    return p.openingStock + stockIn - stockOut <= p.reorderLevel;
  });

  let rows = belowReorder.map((p) => {
    const stockIn = p.stockEntries.filter((se) => se.type === 'IN').reduce((s, se) => s + se.quantity, 0);
    const stockOut = p.stockEntries.filter((se) => se.type === 'OUT').reduce((s, se) => s + se.quantity, 0);
    const currentQty = p.openingStock + stockIn - stockOut;
    const shortfall = p.reorderLevel - currentQty;
    return {
      productCode: p.productCode,
      name: p.name,
      category: p.category?.name || '',
      currentQty,
      reorderLevel: p.reorderLevel,
      shortfall: Math.max(shortfall, 0),
      forecastNeed: Math.max(shortfall, 0) * 1.5,
    };
  });

  // H11 FIX: Calculate summary BEFORE groupRows
  const totalShortfall = rows.reduce((s, r) => s + (Number(r.shortfall) || 0), 0);

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  return {
    title: 'Stock Forecast - Product',
    columns,
    rows,
    summary: { productsBelowReorder: belowReorder.length, totalShortfall, totalForecast: totalShortfall * 1.5 },
    chartData: rows.slice(0, 20).map((r) => ({ name: String(r.name), shortfall: r.shortfall, forecast: r.forecastNeed })),
  };
}

async function stockForecastConcern(params: QueryParams): Promise<ReportResult> {
  // MIS-002 FIX: Add missing categoryId filter
  const where: Record<string, unknown> = { isActive: true };
  if (params.companyId) where.companyId = params.companyId;
  if (params.categoryId) where.categoryId = params.categoryId;

  const products = await db.product.findMany({
    where,
    include: { company: true, category: true, stockEntries: {} },
  });

  const columns: ColumnDef[] = [
    { key: 'company', label: 'Company' },
    { key: 'totalProducts', label: 'Products' },
    { key: 'belowReorder', label: 'Below Reorder' },
    { key: 'totalStock', label: 'Total Stock' },
    { key: 'reorderIndicator', label: 'Reorder Indicator' },
  ];

  const companyMap = new Map<string, { company: string; totalProducts: number; belowReorder: number; totalStock: number }>();
  for (const p of products) {
    const comp = p.company?.name || 'Unknown';
    const stockIn = p.stockEntries.filter((se) => se.type === 'IN').reduce((s, se) => s + se.quantity, 0);
    const stockOut = p.stockEntries.filter((se) => se.type === 'OUT').reduce((s, se) => s + se.quantity, 0);
    const qty = p.openingStock + stockIn - stockOut;
    const isBelow = qty <= p.reorderLevel;
    const existing = companyMap.get(comp);
    if (existing) {
      existing.totalProducts += 1;
      existing.totalStock += qty;
      if (isBelow) existing.belowReorder += 1;
    } else {
      companyMap.set(comp, { company: comp, totalProducts: 1, belowReorder: isBelow ? 1 : 0, totalStock: qty });
    }
  }

  let rows = Array.from(companyMap.values()).map((v) => ({
    company: v.company,
    totalProducts: v.totalProducts,
    belowReorder: v.belowReorder,
    totalStock: v.totalStock,
    reorderIndicator: v.belowReorder > 0 ? `${v.belowReorder} items need reorder` : 'All OK',
  }));

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  return {
    title: 'Stock Forecast - Company',
    columns,
    rows,
    summary: {
      totalCompanies: companyMap.size,
      totalBelowReorder: Array.from(companyMap.values()).reduce((s, v) => s + v.belowReorder, 0),
    },
    chartData: Array.from(companyMap.values()).map((v) => ({ name: v.company, products: v.totalProducts, belowReorder: v.belowReorder })),
  };
}

// ============================================================
// BASIC REPORTS — EXTENDED SUB-REPORTS
// ============================================================

async function stockTrends(params: QueryParams): Promise<ReportResult> {
  const where: Record<string, unknown> = { isActive: true };
  if (params.categoryId) where.categoryId = params.categoryId;
  if (params.companyId) where.companyId = params.companyId;
  if (params.productId) where.id = params.productId;
  if (params.godownId) where.godownId = params.godownId;

  const products = await db.product.findMany({
    where,
    include: { category: true, stockEntries: {} },
  });

  const columns: ColumnDef[] = [
    { key: 'product', label: 'Product' },
    { key: 'category', label: 'Category' },
    { key: 'currentQty', label: 'Current Qty' },
    { key: 'avgDailyOut', label: 'Avg Daily Out' },
    { key: 'daysUntilStockout', label: 'Days Until Stockout' },
    { key: 'trendDirection', label: 'Trend Direction' },
  ];

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  let rows = products.map((p) => {
    const stockIn = p.stockEntries.filter((se) => se.type === 'IN').reduce((s, se) => s + se.quantity, 0);
    const stockOut = p.stockEntries.filter((se) => se.type === 'OUT').reduce((s, se) => s + se.quantity, 0);
    const currentQty = p.openingStock + stockIn - stockOut;

    // Calculate 30-day out rate
    const recentOut = p.stockEntries
      .filter((se) => se.type === 'OUT' && new Date(se.date) >= thirtyDaysAgo)
      .reduce((s, se) => s + se.quantity, 0);
    const recentIn = p.stockEntries
      .filter((se) => se.type === 'IN' && new Date(se.date) >= thirtyDaysAgo)
      .reduce((s, se) => s + se.quantity, 0);
    const avgDailyOut = safeFinancialRound(recentOut / 30);
    const daysUntilStockout = avgDailyOut > 0 ? Math.floor(currentQty / avgDailyOut) : Infinity;

    // Trend direction: compare recent IN vs OUT
    let trendDirection = '→';
    if (recentOut > recentIn * 1.2) trendDirection = '↓';
    else if (recentIn > recentOut * 1.2) trendDirection = '↑';

    return {
      product: p.name,
      category: p.category?.name || '',
      currentQty,
      avgDailyOut: safeFinancialRound(avgDailyOut),
      daysUntilStockout: daysUntilStockout === Infinity ? '∞' : daysUntilStockout,
      trendDirection,
    };
  });

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  const trendingUp = rows.filter((r) => r.trendDirection === '↑').length;
  const trendingDown = rows.filter((r) => r.trendDirection === '↓').length;
  const criticalStockout = rows.filter(
    (r) => typeof r.daysUntilStockout === 'number' && (r.daysUntilStockout as number) <= 7
  ).length;

  return {
    title: 'Stock Trend Analysis Report',
    columns,
    rows,
    summary: {
      totalProducts: products.length,
      trendingUp,
      trendingDown,
      criticalStockout,
    },
    chartData: rows.slice(0, 20).map((r) => ({
      name: String(r.product),
      currentQty: r.currentQty,
      avgDailyOut: r.avgDailyOut,
    })),
  };
}

async function supplierStatus(params: QueryParams): Promise<ReportResult> {
  const supplierWhere: Record<string, unknown> = { isActive: true };
  if (params.supplierId) supplierWhere.id = params.supplierId;

  const suppliers = await db.supplier.findMany({
    where: supplierWhere,
    include: {
      purchaseOrders: { where: { isActive: true } },
      purchaseReturns: { where: { isActive: true } },
      cashDeliveries: { where: { isActive: true } },
    },
  });

  const columns: ColumnDef[] = [
    { key: 'supplierCode', label: 'Supplier Code' },
    { key: 'supplierName', label: 'Supplier Name' },
    { key: 'totalPurchase', label: 'Total Purchase' },
    { key: 'totalPaid', label: 'Total Paid' },
    { key: 'outstandingBalance', label: 'Outstanding Balance' },
    { key: 'paymentStatus', label: 'Payment Status' },
    { key: 'lastTransactionDate', label: 'Last Transaction Date' },
  ];

  let rows = suppliers.map((s) => {
    const totalPurchase = safeFinancialRound(s.purchaseOrders.reduce((sum, po) => safeFinancialAdd(sum, po.grandTotal), 0));
    const totalReturns = safeFinancialRound(s.purchaseReturns.reduce((sum, r) => safeFinancialAdd(sum, r.grandTotal), 0));
    const totalPaid = safeFinancialRound(s.cashDeliveries.reduce((sum, d) => safeFinancialAdd(sum, d.amount), 0));
    const outstandingBalance = safeFinancialRound(
      Math.max(safeFinancialAdd(s.openingBalance, safeFinancialSubtract(totalPurchase, safeFinancialAdd(totalPaid, totalReturns))), 0)
    );

    // Payment status
    let paymentStatus = 'Clear';
    if (outstandingBalance > 0) {
      // Check if overdue — if supplier has outstanding and last PO is older than 30 days
      const lastPODate = s.purchaseOrders.length > 0
        ? new Date(Math.max(...s.purchaseOrders.map((po) => new Date(po.date).getTime())))
        : null;
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      if (lastPODate && lastPODate < thirtyDaysAgo) {
        paymentStatus = 'Overdue';
      } else {
        paymentStatus = 'Current';
      }
    }

    // Last transaction date — latest of PO, return, or delivery
    const allDates = [
      ...s.purchaseOrders.map((po) => new Date(po.date).getTime()),
      ...s.purchaseReturns.map((r) => new Date(r.date).getTime()),
      ...s.cashDeliveries.map((d) => new Date(d.date).getTime()),
    ];
    const lastTransactionDate = allDates.length > 0
      ? fmtDate(new Date(Math.max(...allDates)))
      : '—';

    return {
      supplierCode: s.supplierCode,
      supplierName: s.name,
      totalPurchase: maskVat(totalPurchase, params.vatMode),
      totalPaid: maskVat(totalPaid, params.vatMode),
      outstandingBalance: maskVat(outstandingBalance, params.vatMode),
      paymentStatus,
      lastTransactionDate,
    };
  });

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  const totalOutstanding = suppliers.reduce((sum, s) => {
    const totalPurchase = s.purchaseOrders.reduce((a, po) => safeFinancialAdd(a, po.grandTotal), 0);
    const totalReturns = s.purchaseReturns.reduce((a, r) => safeFinancialAdd(a, r.grandTotal), 0);
    const totalPaid = s.cashDeliveries.reduce((a, d) => safeFinancialAdd(a, d.amount), 0);
    return safeFinancialAdd(sum, Math.max(safeFinancialAdd(s.openingBalance, safeFinancialSubtract(totalPurchase, safeFinancialAdd(totalPaid, totalReturns))), 0));
  }, 0);

  const overdueCount = rows.filter((r) => r.paymentStatus === 'Overdue').length;
  const clearCount = rows.filter((r) => r.paymentStatus === 'Clear').length;

  return {
    title: 'Supplier Status Grid',
    columns,
    rows,
    summary: {
      totalSuppliers: suppliers.length,
      totalOutstanding: params.vatMode ? 'N/A (Audit Mode)' : fmt(safeFinancialRound(totalOutstanding)),
      overdueCount,
      clearCount,
    },
    chartData: [
      { name: 'Clear', count: clearCount },
      { name: 'Current', count: rows.filter((r) => r.paymentStatus === 'Current').length },
      { name: 'Overdue', count: overdueCount },
    ],
  };
}

async function salesPerformance(params: QueryParams): Promise<ReportResult> {
  const where: Record<string, unknown> = { isActive: true, status: { notIn: ['Draft', 'Cancelled'] } };
  if (params.customerId) where.customerId = params.customerId;
  if (params.employeeId) where.srId = params.employeeId;
  const dateFilter = buildDateFilter(params.from, params.to);
  if (dateFilter) where.date = dateFilter;

  const salesOrders = await db.salesOrder.findMany({
    where,
    include: {
      sr: { include: { designation: true } },
      lines: { include: { product: true } },
    },
  });

  // Fetch SR targets for commission lookup
  const srTargets = await db.sRTargetSetup.findMany({
    where: { isActive: true, status: 'ACTIVE' },
  });

  const columns: ColumnDef[] = [
    { key: 'srName', label: 'SR Name' },
    { key: 'month', label: 'Month' },
    { key: 'totalOrders', label: 'Total Orders' },
    { key: 'totalRevenue', label: 'Total Revenue' },
    { key: 'avgOrderValue', label: 'Avg Order Value' },
    { key: 'topProduct', label: 'Top Product' },
    { key: 'commission', label: 'Commission' },
  ];

  // Group by SR and month
  const srMonthMap = new Map<string, {
    srName: string;
    month: string;
    totalOrders: number;
    totalRevenue: number;
    productCounts: Record<string, number>;
    srId: string;
  }>();

  for (const so of salesOrders) {
    if (!so.sr) continue;
    const monthKey = fmtDate(so.date).replace(/\d{2} (\w{3}) (\d{4})/, '$1 $2');
    const mapKey = `${so.srId}:${monthKey}`;
    const existing = srMonthMap.get(mapKey);
    const revenue = so.grandTotal;

    if (existing) {
      existing.totalOrders += 1;
      existing.totalRevenue = safeFinancialAdd(existing.totalRevenue, revenue);
      for (const line of so.lines) {
        const pName = line.product?.name || 'Unknown';
        existing.productCounts[pName] = (existing.productCounts[pName] || 0) + line.quantity;
      }
    } else {
      const productCounts: Record<string, number> = {};
      for (const line of so.lines) {
        const pName = line.product?.name || 'Unknown';
        productCounts[pName] = (productCounts[pName] || 0) + line.quantity;
      }
      srMonthMap.set(mapKey, {
        srName: so.sr.name,
        month: monthKey,
        totalOrders: 1,
        totalRevenue: revenue,
        productCounts,
        srId: so.srId || '',
      });
    }
  }

  let rows = Array.from(srMonthMap.values()).map((v) => {
    const avgOrderValue = v.totalOrders > 0 ? safeFinancialRound(v.totalRevenue / v.totalOrders) : 0;
    const topProduct = Object.entries(v.productCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

    // Lookup commission from srTargets
    const target = srTargets.find((t) => t.employeeId === v.srId);
    const commission = target ? safeFinancialRound(v.totalRevenue * target.commissionPercentage / 100) : 0;

    return {
      srName: v.srName,
      month: v.month,
      totalOrders: v.totalOrders,
      totalRevenue: maskVat(v.totalRevenue, params.vatMode),
      avgOrderValue: maskVat(avgOrderValue, params.vatMode),
      topProduct,
      commission: maskVat(commission, params.vatMode),
    };
  });

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  // Summary
  const totalRevenue = salesOrders.reduce((s, so) => safeFinancialAdd(s, so.grandTotal), 0);
  const totalOrders = salesOrders.length;
  const avgOrderValue = totalOrders > 0 ? safeFinancialRound(totalRevenue / totalOrders) : 0;

  // Top SR by revenue
  const srRevenueMap = new Map<string, number>();
  for (const so of salesOrders) {
    if (!so.sr) continue;
    const current = srRevenueMap.get(so.sr.name) || 0;
    srRevenueMap.set(so.sr.name, safeFinancialAdd(current, so.grandTotal));
  }
  const topSR = Array.from(srRevenueMap.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

  return {
    title: 'Sales Performance Indicators',
    columns,
    rows,
    summary: {
      totalRevenue: params.vatMode ? 'N/A (Audit Mode)' : fmt(safeFinancialRound(totalRevenue)),
      avgOrderValue: params.vatMode ? 'N/A (Audit Mode)' : fmt(avgOrderValue),
      topSR,
      totalOrders,
    },
    chartData: Array.from(srRevenueMap.entries()).slice(0, 10).map(([name, revenue]) => ({
      name,
      revenue: params.vatMode ? 0 : revenue,
    })),
  };
}

async function employeeRecords(params: QueryParams): Promise<ReportResult> {
  const where: Record<string, unknown> = { isActive: true };
  if (params.employeeId) where.id = params.employeeId;
  if (params.companyId) where.companyId = params.companyId;

  const employees = await db.employee.findMany({
    where,
    include: {
      designation: true,
      department: true,
      leaveAllocations: { where: { isActive: true } },
    },
  });

  const columns: ColumnDef[] = [
    { key: 'employeeCode', label: 'Code' },
    { key: 'name', label: 'Name' },
    { key: 'designation', label: 'Designation' },
    { key: 'department', label: 'Department' },
    { key: 'joiningDate', label: 'Joining Date' },
    { key: 'baseSalary', label: 'Base Salary' },
    { key: 'casualLeave', label: 'Casual Leave' },
    { key: 'sickLeave', label: 'Sick Leave' },
    { key: 'annualLeave', label: 'Annual Leave' },
    { key: 'status', label: 'Status' },
    { key: 'serviceYears', label: 'Service Years' },
  ];

  const currentYear = new Date().getFullYear();

  let rows = employees.map((e) => {
    // Compute leave balances from LeaveAllocation
    const casualAlloc = e.leaveAllocations.find((la) => la.leaveType === 'Casual' && la.year === currentYear);
    const sickAlloc = e.leaveAllocations.find((la) => la.leaveType === 'Sick' && la.year === currentYear);
    const annualAlloc = e.leaveAllocations.find((la) => la.leaveType === 'Annual' && la.year === currentYear);

    const casualLeave = casualAlloc ? `${casualAlloc.remainingDays}/${casualAlloc.allocatedDays}` : '0/0';
    const sickLeave = sickAlloc ? `${sickAlloc.remainingDays}/${sickAlloc.allocatedDays}` : '0/0';
    const annualLeave = annualAlloc ? `${annualAlloc.remainingDays}/${annualAlloc.allocatedDays}` : '0/0';

    // Service years
    const joinDate = e.joiningDate ? new Date(e.joiningDate) : null;
    const serviceYears = joinDate
      ? safeFinancialRound((Date.now() - joinDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : 0;

    return {
      employeeCode: e.employeeCode,
      name: e.name,
      designation: e.designation?.name || '',
      department: e.department?.name || '',
      joiningDate: e.joiningDate ? fmtDate(e.joiningDate) : '',
      baseSalary: maskVat(e.baseSalary, params.vatMode),
      casualLeave,
      sickLeave,
      annualLeave,
      status: e.isActive ? 'Active' : 'Inactive',
      serviceYears,
    };
  });

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  // Summary
  const totalEmployees = employees.length;
  const avgSalary = totalEmployees > 0
    ? safeFinancialRound(employees.reduce((s, e) => safeFinancialAdd(s, e.baseSalary), 0) / totalEmployees)
    : 0;
  const avgServiceYears = totalEmployees > 0
    ? safeFinancialRound(employees.reduce((s, e) => {
        const joinDate = e.joiningDate ? new Date(e.joiningDate) : null;
        const years = joinDate ? (Date.now() - joinDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000) : 0;
        return s + years;
      }, 0) / totalEmployees)
    : 0;

  // Department breakdown
  const deptBreakdown: Record<string, number> = {};
  for (const e of employees) {
    const dept = e.department?.name || 'Unknown';
    deptBreakdown[dept] = (deptBreakdown[dept] || 0) + 1;
  }

  return {
    title: 'Enhanced Employee Records',
    columns,
    rows,
    summary: {
      totalEmployees,
      avgSalary: params.vatMode ? 'N/A (Audit Mode)' : fmt(avgSalary),
      avgServiceYears: safeFinancialRound(avgServiceYears),
      departmentBreakdown: deptBreakdown,
    },
    chartData: Object.entries(deptBreakdown).map(([name, count]) => ({ name, count })),
  };
}

// ============================================================
// PURCHASE REPORTS
// ============================================================

async function supplierLedger(params: QueryParams): Promise<ReportResult> {
  const supplierWhere: Record<string, unknown> = { isActive: true };
  if (params.supplierId) supplierWhere.id = params.supplierId;

  const suppliers = await db.supplier.findMany({
    where: supplierWhere,
    include: {
      purchaseOrders: { where: { isActive: true }, orderBy: { date: 'asc' } },
      purchaseReturns: { where: { isActive: true }, orderBy: { date: 'asc' } },
      cashDeliveries: { where: { isActive: true }, orderBy: { date: 'asc' } },
    },
  });

  const columns: ColumnDef[] = [
    { key: 'date', label: 'Date' },
    { key: 'supplier', label: 'Supplier' },
    { key: 'type', label: 'Type' },
    { key: 'reference', label: 'Reference' },
    { key: 'debit', label: 'Debit (Purchase)' },
    { key: 'credit', label: 'Credit (Payment/Return)' },
    { key: 'balance', label: 'Running Balance' },
  ];

  const allRows: Record<string, unknown>[] = [];
  // misc1 FIX: buildDateFilter called once before the loop, not 3× per supplier
  const dateFilter = buildDateFilter(params.from, params.to);

  for (const supplier of suppliers) {
    const entries: { date: Date; type: string; ref: string; debit: number; credit: number }[] = [];

    // misc1 FIX: buildDateFilter called once before the loop, not 3× per supplier
    for (const po of supplier.purchaseOrders) {
      if (dateFilter && po.date < dateFilter.gte!) continue;
      if (dateFilter && po.date > dateFilter.lte!) continue;
      entries.push({ date: po.date, type: 'Purchase', ref: po.poNumber, debit: po.grandTotal, credit: 0 });
    }
    for (const pr of supplier.purchaseReturns) {
      if (dateFilter && pr.date < dateFilter.gte!) continue;
      if (dateFilter && pr.date > dateFilter.lte!) continue;
      entries.push({ date: pr.date, type: 'Return', ref: pr.returnNo, debit: 0, credit: pr.grandTotal });
    }
    for (const cd of supplier.cashDeliveries) {
      if (dateFilter && cd.date < dateFilter.gte!) continue;
      if (dateFilter && cd.date > dateFilter.lte!) continue;
      entries.push({ date: cd.date, type: 'Cash Delivery', ref: cd.deliveryCode, debit: 0, credit: cd.amount });
    }

    entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    // LEDGER-001 FIX: Respect openingBalanceType for supplier ledger sign convention
    // For suppliers: positive balance = we owe them, negative = they owe us
    let running = supplier.openingBalanceType === 'Dr' ? -supplier.openingBalance : supplier.openingBalance;
    for (const e of entries) {
      // C6 FIX: In supplier ledger, purchases (debit) increase what we owe (positive balance),
      // and payments/returns (credit) decrease what we owe
      running += e.debit - e.credit;
      allRows.push({
        date: fmtDate(e.date),
        supplier: supplier.name,
        type: e.type,
        reference: e.ref,
        debit: maskVat(e.debit, params.vatMode),
        credit: maskVat(e.credit, params.vatMode),
        balance: maskVat(running, params.vatMode),
      });
    }
  }

  const sortedRows = sortRows(allRows, params.sortField, params.sortOrder);
  const totalDebit = allRows.reduce((s, r) => s + (Number(r.debit) || 0), 0);
  const totalCredit = allRows.reduce((s, r) => s + (Number(r.credit) || 0), 0);

  return {
    title: 'Supplier Ledger Report',
    columns,
    rows: sortedRows,
    summary: { totalEntries: allRows.length, totalDebit: maskVat(totalDebit, params.vatMode), totalCredit: maskVat(totalCredit, params.vatMode), netBalance: maskVat(safeFinancialRound(totalDebit - totalCredit), params.vatMode) },
    chartData: allRows.slice(0, 30).map((r) => ({ date: r.date, debit: r.debit, credit: r.credit })),
  };
}

async function dailyPurchase(params: QueryParams): Promise<ReportResult> {
  const where: Record<string, unknown> = { isActive: true };
  if (params.supplierId) where.supplierId = params.supplierId;
  // MIS-002 FIX: Add missing filters for purchase reports
  if (params.productId) where.lines = { some: { productId: params.productId } };
  const dateFilter = buildDateFilter(params.from, params.to);
  if (dateFilter) where.date = dateFilter;

  const purchaseOrders = await db.purchaseOrder.findMany({
    where,
    include: { supplier: true },
    orderBy: { date: 'desc' },
  });

  const dayMap = new Map<string, { date: string; totalPOs: number; totalValue: number; suppliers: string[] }>();
  for (const po of purchaseOrders) {
    const day = fmtDate(po.date);
    const existing = dayMap.get(day);
    if (existing) {
      existing.totalPOs += 1;
      existing.totalValue += po.grandTotal;
      if (po.supplier && !existing.suppliers.includes(po.supplier.name)) existing.suppliers.push(po.supplier.name);
    } else {
      dayMap.set(day, { date: day, totalPOs: 1, totalValue: po.grandTotal, suppliers: po.supplier ? [po.supplier.name] : [] });
    }
  }

  const columns: ColumnDef[] = [
    { key: 'date', label: 'Date' },
    { key: 'totalPOs', label: 'Total POs' },
    { key: 'totalValue', label: 'Total Value' },
    { key: 'supplierBreakdown', label: 'Supplier Breakdown' },
  ];

  let rows = Array.from(dayMap.values()).map((v) => ({
    date: v.date,
    totalPOs: v.totalPOs,
    totalValue: maskVat(v.totalValue, params.vatMode),
    supplierBreakdown: v.suppliers.join(', '),
  }));

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  const totalPOs = purchaseOrders.length;
  const totalValue = purchaseOrders.reduce((s, po) => s + po.grandTotal, 0);

  return {
    title: 'Daily Purchase Report',
    columns,
    rows,
    summary: { totalDays: dayMap.size, totalPOs, totalValue: params.vatMode ? 'N/A (Audit Mode)' : fmt(totalValue), avgDaily: params.vatMode ? 'N/A (Audit Mode)' : (dayMap.size > 0 ? fmt(totalValue / dayMap.size) : '0.00') },
    chartData: Array.from(dayMap.values()).map((v) => ({ date: v.date, value: params.vatMode ? 0 : v.totalValue, pos: v.totalPOs })),
  };
}

async function supplierWisePurchase(params: QueryParams): Promise<ReportResult> {
  const where: Record<string, unknown> = { isActive: true };
  if (params.supplierId) where.supplierId = params.supplierId;
  const dateFilter = buildDateFilter(params.from, params.to);
  if (dateFilter) where.date = dateFilter;

  const purchaseOrders = await db.purchaseOrder.findMany({
    where,
    include: { supplier: true },
  });

  const supplierMap = new Map<string, { supplier: string; totalPOs: number; totalValue: number }>();
  for (const po of purchaseOrders) {
    const name = po.supplier?.name || 'Unknown';
    const existing = supplierMap.get(name);
    if (existing) {
      existing.totalPOs += 1;
      existing.totalValue += po.grandTotal;
    } else {
      supplierMap.set(name, { supplier: name, totalPOs: 1, totalValue: po.grandTotal });
    }
  }

  const columns: ColumnDef[] = [
    { key: 'supplier', label: 'Supplier' },
    { key: 'totalPOs', label: 'Total POs' },
    { key: 'totalValue', label: 'Total Value' },
  ];

  let rows = Array.from(supplierMap.values()).map((v) => ({ ...v, totalValue: maskVat(v.totalValue, params.vatMode) }));
  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  const totalValue = Array.from(supplierMap.values()).reduce((s, v) => s + v.totalValue, 0);

  return {
    title: 'Supplier-wise Purchase Report',
    columns,
    rows,
    summary: { totalSuppliers: supplierMap.size, totalPOs: purchaseOrders.length, totalValue: params.vatMode ? 'N/A (Audit Mode)' : fmt(totalValue) },
    chartData: Array.from(supplierMap.values()).map((v) => ({ name: v.supplier, value: params.vatMode ? 0 : v.totalValue })),
  };
}

async function supplierCashDelivery(params: QueryParams): Promise<ReportResult> {
  const where: Record<string, unknown> = { isActive: true };
  if (params.supplierId) where.supplierId = params.supplierId;
  if (params.bankId) where.bankId = params.bankId;
  const dateFilter = buildDateFilter(params.from, params.to);
  if (dateFilter) where.date = dateFilter;

  const deliveries = await db.cashDelivery.findMany({
    where,
    include: { supplier: true, paymentOption: true, bank: true },
    orderBy: { date: 'desc' },
  });

  const columns: ColumnDef[] = [
    { key: 'date', label: 'Date' },
    { key: 'deliveryCode', label: 'Code' },
    { key: 'supplier', label: 'Supplier' },
    { key: 'amount', label: 'Amount' },
    { key: 'paymentOption', label: 'Payment Option' },
    { key: 'bank', label: 'Bank' },
  ];

  let rows = deliveries.map((d) => ({
    date: fmtDate(d.date),
    deliveryCode: d.deliveryCode,
    supplier: d.supplier?.name || '',
    amount: maskVat(d.amount, params.vatMode),
    paymentOption: d.paymentOption?.name || '',
    bank: d.bank?.bankName || '',
  }));

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  const totalAmount = deliveries.reduce((s, d) => s + d.amount, 0);

  return {
    title: 'Supplier Cash Delivery Report',
    columns,
    rows,
    summary: { totalDeliveries: deliveries.length, totalAmount: params.vatMode ? 'N/A (Audit Mode)' : fmt(totalAmount) },
    chartData: deliveries.slice(0, 30).map((d) => ({ date: fmtDate(d.date), amount: params.vatMode ? 0 : d.amount })),
  };
}

async function supplierDue(params: QueryParams): Promise<ReportResult> {
  const suppliers = await db.supplier.findMany({
    where: { isActive: true },
    include: {
      purchaseOrders: { where: { isActive: true } },
      purchaseReturns: { where: { isActive: true } },
      cashDeliveries: { where: { isActive: true } },
    },
  });

  const columns: ColumnDef[] = [
    { key: 'supplierCode', label: 'Code' },
    { key: 'supplier', label: 'Supplier' },
    { key: 'openingBalance', label: 'Opening Balance' },
    { key: 'totalPurchase', label: 'Total Purchase' },
    { key: 'totalDeliveries', label: 'Total Payments' },
    { key: 'totalReturns', label: 'Total Returns' },
    { key: 'outstanding', label: 'Outstanding' },
  ];

  let rows = suppliers.map((s) => {
    const totalPurchase = s.purchaseOrders.reduce((sum, po) => sum + po.grandTotal, 0);
    const totalDeliveries = s.cashDeliveries.reduce((sum, d) => sum + d.amount, 0);
    const totalReturns = s.purchaseReturns.reduce((sum, r) => sum + r.grandTotal, 0);
    const outstanding = s.openingBalance + totalPurchase - totalDeliveries - totalReturns;
    return {
      _supplierId: s.id, // H1 FIX: Keep supplier UUID for filtering
      supplierCode: s.supplierCode,
      supplier: s.name,
      openingBalance: maskVat(s.openingBalance, params.vatMode),
      totalPurchase: maskVat(totalPurchase, params.vatMode),
      totalDeliveries: maskVat(totalDeliveries, params.vatMode),
      totalReturns: maskVat(totalReturns, params.vatMode),
      outstanding: maskVat(Math.max(outstanding, 0), params.vatMode),
    };
  });

  // H1 FIX: Filter by supplier UUID instead of code
  if (params.supplierId) rows = rows.filter((r) => r._supplierId === params.supplierId);

  // H11 FIX: Calculate summary BEFORE groupRows
  const totalOutstanding = rows.reduce((s, r) => s + (Number(r.outstanding) || 0), 0);

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  return {
    title: 'Supplier Due Report',
    columns,
    rows,
    summary: { totalSuppliers: rows.length, totalOutstanding: params.vatMode ? 'N/A (Audit Mode)' : fmt(totalOutstanding) },
    chartData: rows.slice(0, 20).map((r) => ({ name: String(r.supplier), outstanding: params.vatMode ? 0 : r.outstanding })),
  };
}

async function modelWisePurchase(params: QueryParams): Promise<ReportResult> {
  const where: Record<string, unknown> = { isActive: true };
  if (params.supplierId) where.supplierId = params.supplierId;
  // MIS-002 FIX: Add missing categoryId filter
  if (params.categoryId) where.lines = { some: { product: { categoryId: params.categoryId } } };
  const dateFilter = buildDateFilter(params.from, params.to);
  if (dateFilter) where.date = dateFilter;

  const purchaseOrders = await db.purchaseOrder.findMany({
    where,
    include: { lines: { include: { product: { include: { category: true } } } } },
  });

  const productMap = new Map<string, { product: string; category: string; quantity: number; totalValue: number }>();
  for (const po of purchaseOrders) {
    for (const line of po.lines) {
      const name = line.product?.name || 'Unknown';
      const cat = line.product?.category?.name || 'Unknown';
      const existing = productMap.get(name);
      if (existing) {
        existing.quantity += line.quantity;
        existing.totalValue += line.total;
      } else {
        productMap.set(name, { product: name, category: cat, quantity: line.quantity, totalValue: line.total });
      }
    }
  }

  const columns: ColumnDef[] = [
    { key: 'product', label: 'Product/Model' },
    { key: 'category', label: 'Category' },
    { key: 'quantity', label: 'Quantity' },
    { key: 'totalValue', label: 'Total Value' },
  ];

  let rows = Array.from(productMap.values()).map((v) => ({ ...v, totalValue: maskVat(v.totalValue, params.vatMode) }));
  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  return {
    title: 'Model-wise Purchase Report',
    columns,
    rows,
    summary: {
      totalModels: productMap.size,
      totalQuantity: Array.from(productMap.values()).reduce((s, v) => s + v.quantity, 0),
      totalValue: params.vatMode ? 'N/A (Audit Mode)' : fmt(Array.from(productMap.values()).reduce((s, v) => s + v.totalValue, 0)),
    },
    chartData: Array.from(productMap.values()).slice(0, 20).map((v) => ({ name: v.product, quantity: v.quantity, value: params.vatMode ? 0 : v.totalValue })),
  };
}

async function vatReport(params: QueryParams): Promise<ReportResult> {
  const where: Record<string, unknown> = { isActive: true };
  const dateFilter = buildDateFilter(params.from, params.to);
  if (dateFilter) where.date = dateFilter;
  // MIS-002 FIX: Add missing supplierId/customerId filters
  if (params.supplierId) where.supplierId = params.supplierId;

  const poWhere = { ...where };
  const soWhere: Record<string, unknown> = { isActive: true };
  if (dateFilter) soWhere.date = dateFilter;
  if (params.customerId) soWhere.customerId = params.customerId;

  const [purchaseOrders, salesOrders] = await Promise.all([
    db.purchaseOrder.findMany({
      where: poWhere,
      include: { supplier: true, lines: { include: { product: true } } },
    }),
    db.salesOrder.findMany({
      where: soWhere,
      include: { customer: true, lines: { include: { product: true } } },
    }),
  ]);

  const columns: ColumnDef[] = [
    { key: 'type', label: 'Type' },
    { key: 'reference', label: 'Reference' },
    { key: 'date', label: 'Date' },
    { key: 'vatPercentage', label: 'VAT %' },
    { key: 'vatAmount', label: 'VAT Amount' },
    { key: 'grandTotal', label: 'Grand Total' },
  ];

  const rows: Record<string, unknown>[] = [];

  for (const po of purchaseOrders) {
    rows.push({
      type: 'Purchase',
      reference: po.poNumber,
      date: fmtDate(po.date),
      vatPercentage: po.vatPercentage,
      vatAmount: maskVat(po.vatAmount, params.vatMode),
      grandTotal: maskVat(po.grandTotal, params.vatMode),
    });
  }
  for (const so of salesOrders) {
    rows.push({
      type: 'Sales',
      reference: so.invoiceNo,
      date: fmtDate(so.date),
      vatPercentage: so.vatPercentage,
      vatAmount: maskVat(so.vatAmount, params.vatMode),
      grandTotal: maskVat(so.grandTotal, params.vatMode),
    });
  }

  const sortedRows = sortRows(rows, params.sortField, params.sortOrder);

  const purchaseVAT = purchaseOrders.reduce((s, po) => s + po.vatAmount, 0);
  const salesVAT = salesOrders.reduce((s, so) => s + so.vatAmount, 0);

  return {
    title: 'VAT Report',
    columns,
    rows: sortedRows,
    summary: {
      purchaseVAT: params.vatMode ? 'N/A (Audit Mode)' : fmt(purchaseVAT),
      salesVAT: params.vatMode ? 'N/A (Audit Mode)' : fmt(salesVAT),
      netVAT: params.vatMode ? 'N/A (Audit Mode)' : fmt(salesVAT - purchaseVAT),
      totalPurchaseOrders: purchaseOrders.length,
      totalSalesOrders: salesOrders.length,
    },
    chartData: [
      { name: 'Purchase VAT', amount: params.vatMode ? 0 : purchaseVAT },
      { name: 'Sales VAT', amount: params.vatMode ? 0 : salesVAT },
      { name: 'Net VAT Payable', amount: params.vatMode ? 0 : (salesVAT - purchaseVAT) },
    ],
  };
}

// ============================================================
// SALES REPORTS
// ============================================================

async function dailySales(params: QueryParams): Promise<ReportResult> {
  const where: Record<string, unknown> = { isActive: true };
  if (params.customerId) where.customerId = params.customerId;
  // MIS-002 FIX: Add missing filters for sales reports
  if (params.employeeId) where.srId = params.employeeId;
  if (params.productId) where.lines = { some: { productId: params.productId } };
  const dateFilter = buildDateFilter(params.from, params.to);
  if (dateFilter) where.date = dateFilter;

  const salesOrders = await db.salesOrder.findMany({
    where,
    include: { customer: true, sr: true },
    orderBy: { date: 'desc' },
  });

  const dayMap = new Map<string, { date: string; totalOrders: number; totalValue: number; customers: string[] }>();
  for (const so of salesOrders) {
    const day = fmtDate(so.date);
    const existing = dayMap.get(day);
    if (existing) {
      existing.totalOrders += 1;
      existing.totalValue += so.grandTotal;
      if (so.customer && !existing.customers.includes(so.customer.name)) existing.customers.push(so.customer.name);
    } else {
      dayMap.set(day, { date: day, totalOrders: 1, totalValue: so.grandTotal, customers: so.customer ? [so.customer.name] : [] });
    }
  }

  const columns: ColumnDef[] = [
    { key: 'date', label: 'Date' },
    { key: 'totalOrders', label: 'Total Orders' },
    { key: 'totalValue', label: 'Total Value' },
    { key: 'customerBreakdown', label: 'Customer Breakdown' },
  ];

  let rows = Array.from(dayMap.values()).map((v) => ({
    date: v.date,
    totalOrders: v.totalOrders,
    totalValue: maskVat(v.totalValue, params.vatMode),
    customerBreakdown: v.customers.join(', '),
  }));

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  const totalValue = salesOrders.reduce((s, so) => s + so.grandTotal, 0);

  return {
    title: 'Daily Sales Report',
    columns,
    rows,
    summary: { totalDays: dayMap.size, totalOrders: salesOrders.length, totalValue: params.vatMode ? 'N/A (Audit Mode)' : fmt(totalValue), avgDaily: params.vatMode ? 'N/A (Audit Mode)' : (dayMap.size > 0 ? fmt(totalValue / dayMap.size) : '0.00') },
    chartData: Array.from(dayMap.values()).map((v) => ({ date: v.date, value: params.vatMode ? 0 : v.totalValue, orders: v.totalOrders })),
  };
}

async function replacementReport(params: QueryParams): Promise<ReportResult> {
  const where: Record<string, unknown> = { isActive: true };
  if (params.customerId) where.customerId = params.customerId;
  if (params.employeeId) where.salesOrder = { srId: params.employeeId };
  const dateFilter = buildDateFilter(params.from, params.to);
  if (dateFilter) where.date = dateFilter;

  const replacements = await db.replacementOrder.findMany({
    where,
    include: { salesOrder: { include: { customer: true } }, lines: { include: { product: true } } },
    orderBy: { date: 'desc' },
  });

  const columns: ColumnDef[] = [
    { key: 'replacementNo', label: 'Replacement No' },
    { key: 'date', label: 'Date' },
    { key: 'customer', label: 'Customer' },
    { key: 'product', label: 'Product' },
    { key: 'quantity', label: 'Quantity' },
    { key: 'reason', label: 'Reason' },
    { key: 'status', label: 'Status' },
  ];

  let rows: Record<string, unknown>[] = [];
  for (const r of replacements) {
    for (const line of r.lines) {
      rows.push({
        replacementNo: r.replacementNo,
        date: fmtDate(r.date),
        customer: r.salesOrder?.customer?.name || '',
        product: line.product?.name || '',
        quantity: line.quantity,
        reason: r.reason || '',
        status: r.status,
      });
    }
  }

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  return {
    title: 'Replacement Report',
    columns,
    rows,
    summary: { totalReplacements: replacements.length, pending: replacements.filter((r) => r.status === 'Pending').length, completed: replacements.filter((r) => r.status === 'Completed').length },
    chartData: [
      { name: 'Pending', count: replacements.filter((r) => r.status === 'Pending').length },
      { name: 'Completed', count: replacements.filter((r) => r.status === 'Completed').length },
    ],
  };
}

async function modelWiseSales(params: QueryParams): Promise<ReportResult> {
  const where: Record<string, unknown> = { isActive: true };
  if (params.customerId) where.customerId = params.customerId;
  if (params.employeeId) where.srId = params.employeeId;
  // MIS-002 FIX: Add missing categoryId filter
  if (params.categoryId) where.lines = { some: { product: { categoryId: params.categoryId } } };
  const dateFilter = buildDateFilter(params.from, params.to);
  if (dateFilter) where.date = dateFilter;

  const salesOrders = await db.salesOrder.findMany({
    where,
    include: { lines: { include: { product: { include: { category: true } } } } },
  });

  const productMap = new Map<string, { product: string; category: string; quantity: number; totalValue: number }>();
  for (const so of salesOrders) {
    for (const line of so.lines) {
      const name = line.product?.name || 'Unknown';
      const cat = line.product?.category?.name || 'Unknown';
      const existing = productMap.get(name);
      if (existing) {
        existing.quantity += line.quantity;
        existing.totalValue += line.total;
      } else {
        productMap.set(name, { product: name, category: cat, quantity: line.quantity, totalValue: line.total });
      }
    }
  }

  const columns: ColumnDef[] = [
    { key: 'product', label: 'Product/Model' },
    { key: 'category', label: 'Category' },
    { key: 'quantity', label: 'Quantity' },
    { key: 'totalValue', label: 'Total Value' },
  ];

  let rows = Array.from(productMap.values()).map((v) => ({ ...v, totalValue: maskVat(v.totalValue, params.vatMode) }));
  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  return {
    title: 'Model-wise Sales Report',
    columns,
    rows,
    summary: {
      totalModels: productMap.size,
      totalQuantity: Array.from(productMap.values()).reduce((s, v) => s + v.quantity, 0),
      totalValue: params.vatMode ? 'N/A (Audit Mode)' : fmt(Array.from(productMap.values()).reduce((s, v) => s + v.totalValue, 0)),
    },
    chartData: Array.from(productMap.values()).slice(0, 20).map((v) => ({ name: v.product, quantity: v.quantity, value: params.vatMode ? 0 : v.totalValue })),
  };
}

// ============================================================
// HIRE SALES REPORTS
// ============================================================

async function installmentCollection(params: QueryParams): Promise<ReportResult> {
  const dateFilter = buildDateFilter(params.from, params.to);
  const where: Record<string, unknown> = { status: 'Paid' };
  if (dateFilter) where.paidDate = dateFilter;
  if (params.customerId) where.hireSales = { customerId: params.customerId };

  const installments = await db.hireInstallment.findMany({
    where,
    include: { hireSales: { include: { customer: true, lines: { include: { product: true } } } } },
    orderBy: { paidDate: 'desc' },
  });

  const columns: ColumnDef[] = [
    { key: 'installmentNo', label: 'Installment #' },
    { key: 'invoiceNo', label: 'Invoice No' },
    { key: 'customer', label: 'Customer' },
    { key: 'product', label: 'Product' },
    { key: 'dueDate', label: 'Due Date' },
    { key: 'paidDate', label: 'Paid Date' },
    { key: 'amount', label: 'Amount' },
    { key: 'paidAmount', label: 'Paid Amount' },
  ];

  let rows = installments.map((i) => ({
    installmentNo: i.installmentNo,
    invoiceNo: i.hireSales?.invoiceNo || '',
    customer: i.hireSales?.customer?.name || '',
    product: i.hireSales?.lines?.[0]?.product?.name || '',
    dueDate: fmtDate(i.dueDate),
    paidDate: i.paidDate ? fmtDate(i.paidDate) : '',
    amount: maskVat(i.amount, params.vatMode),
    paidAmount: maskVat(i.paidAmount, params.vatMode),
  }));

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  const totalCollected = installments.reduce((s, i) => s + i.paidAmount, 0);

  return {
    title: 'Installment Collection Report',
    columns,
    rows,
    summary: { totalInstallments: installments.length, totalCollected: params.vatMode ? 'N/A (Audit Mode)' : fmt(totalCollected) },
    chartData: installments.slice(0, 30).map((i) => ({ date: i.paidDate ? fmtDate(i.paidDate) : '', amount: params.vatMode ? 0 : i.paidAmount })),
  };
}

async function upcomingInstallment(params: QueryParams): Promise<ReportResult> {
  const where: Record<string, unknown> = { status: 'Pending' };
  if (params.customerId) where.hireSales = { customerId: params.customerId };
  const dateFilter = buildDateFilter(params.from, params.to);
  if (dateFilter) where.dueDate = dateFilter;

  const installments = await db.hireInstallment.findMany({
    where,
    include: { hireSales: { include: { customer: true, lines: { include: { product: true } } } } },
    orderBy: { dueDate: 'asc' },
  });

  const columns: ColumnDef[] = [
    { key: 'installmentNo', label: 'Installment #' },
    { key: 'invoiceNo', label: 'Invoice No' },
    { key: 'customer', label: 'Customer' },
    { key: 'product', label: 'Product' },
    { key: 'dueDate', label: 'Due Date' },
    { key: 'amount', label: 'Amount' },
    { key: 'status', label: 'Status' },
  ];

  let rows = installments.map((i) => ({
    installmentNo: i.installmentNo,
    invoiceNo: i.hireSales?.invoiceNo || '',
    customer: i.hireSales?.customer?.name || '',
    product: i.hireSales?.lines?.[0]?.product?.name || '',
    dueDate: fmtDate(i.dueDate),
    amount: maskVat(i.amount, params.vatMode),
    status: i.status,
  }));

  // H11 FIX: Calculate summary BEFORE groupRows
  const totalDue = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  return {
    title: 'Upcoming Installment Report',
    columns,
    rows,
    summary: { totalUpcoming: rows.length, totalDue: params.vatMode ? 'N/A (Audit Mode)' : fmt(totalDue) },
    chartData: rows.slice(0, 30).map((r) => ({ date: r.dueDate, amount: params.vatMode ? 0 : r.amount })),
  };
}

async function defaultingCustomer(params: QueryParams): Promise<ReportResult> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // BUG 12 FIX: Remove hireWhere from include to avoid null hireSales
  const overdue = await db.hireInstallment.findMany({
    where: {
      status: { in: ['Pending', 'Overdue'] },
      dueDate: { lt: thirtyDaysAgo },
    },
    include: { hireSales: { include: { customer: true, lines: { include: { product: true } } } } },
  });

  const dateFilter = buildDateFilter(params.from, params.to);

  const columns: ColumnDef[] = [
    { key: 'customer', label: 'Customer' },
    { key: 'invoiceNo', label: 'Invoice No' },
    { key: 'product', label: 'Product' },
    { key: 'dueDate', label: 'Due Date' },
    { key: 'amount', label: 'Amount Due' },
    { key: 'daysOverdue', label: 'Days Overdue' },
    { key: 'phone', label: 'Phone' },
  ];

  let rows = overdue.map((i) => {
    const daysOverdue = Math.floor((now.getTime() - new Date(i.dueDate).getTime()) / (1000 * 60 * 60 * 24));
    return {
      customer: i.hireSales?.customer?.name || '',
      invoiceNo: i.hireSales?.invoiceNo || '',
      product: i.hireSales?.lines?.[0]?.product?.name || '',
      dueDate: fmtDate(i.dueDate),
      amount: maskVat(i.amount, params.vatMode),
      daysOverdue,
      phone: i.hireSales?.customer?.phone || '',
      _hireSalesDate: i.hireSales?.date,
    };
  });

  // BUG 12 FIX: Apply date filter on hireSales date after fetching if needed
  if (dateFilter) {
    const fromTime = dateFilter.gte ? dateFilter.gte.getTime() : 0;
    const toTime = dateFilter.lte ? dateFilter.lte.getTime() : Infinity;
    rows = rows.filter((r) => {
      if (!r._hireSalesDate) return false;
      const d = new Date(r._hireSalesDate as Date).getTime();
      return d >= fromTime && d <= toTime;
    });
  }

  // Remove internal field before returning
  rows = rows.map(({ _hireSalesDate, ...rest }) => rest);

  if (params.customerId) {
    rows = rows.filter((r) => {
      const cust = overdue.find((i) => i.hireSales?.invoiceNo === r.invoiceNo);
      return cust?.hireSales?.customerId === params.customerId;
    });
  }

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  return {
    title: 'Defaulting Customer Report',
    columns,
    rows,
    summary: { totalDefaulters: new Set(rows.map((r) => r.customer)).size, totalOverdue: params.vatMode ? 'N/A (Audit Mode)' : fmt(rows.reduce((s, r) => s + (Number(r.amount) || 0), 0)), avgDaysOverdue: rows.length > 0 ? Math.round(rows.reduce((s, r) => s + (Number(r.daysOverdue) || 0), 0) / rows.length) : 0 },
    chartData: rows.slice(0, 20).map((r) => ({ name: String(r.customer), amount: params.vatMode ? 0 : r.amount, days: r.daysOverdue })),
  };
}

async function defaultCustomerSummary(params: QueryParams): Promise<ReportResult> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // BUG 13 FIX: Remove hireWhere from include to avoid null hireSales
  const dateFilter = buildDateFilter(params.from, params.to);

  const overdue = await db.hireInstallment.findMany({
    where: { status: { in: ['Pending', 'Overdue'] }, dueDate: { lt: thirtyDaysAgo } },
    include: { hireSales: { include: { customer: true } } },
  });

  // BUG 13 FIX: Filter by hireSales date after fetching if needed
  const filteredOverdue = dateFilter
    ? overdue.filter((i) => {
        if (!i.hireSales) return false;
        const d = new Date(i.hireSales.date).getTime();
        const fromTime = dateFilter.gte ? dateFilter.gte.getTime() : 0;
        const toTime = dateFilter.lte ? dateFilter.lte.getTime() : Infinity;
        return d >= fromTime && d <= toTime;
      })
    : overdue;

  const customerMap = new Map<string, { customer: string; phone: string; totalOverdue: number; installmentCount: number }>();
  for (const i of filteredOverdue) {
    const name = i.hireSales?.customer?.name || 'Unknown';
    const phone = i.hireSales?.customer?.phone || '';
    const existing = customerMap.get(name);
    if (existing) {
      existing.totalOverdue += i.amount;
      existing.installmentCount += 1;
    } else {
      customerMap.set(name, { customer: name, phone, totalOverdue: i.amount, installmentCount: 1 });
    }
  }

  const columns: ColumnDef[] = [
    { key: 'customer', label: 'Customer' },
    { key: 'phone', label: 'Phone' },
    { key: 'installmentCount', label: 'Overdue Installments' },
    { key: 'totalOverdue', label: 'Total Overdue' },
  ];

  let rows = Array.from(customerMap.values()).map((v) => ({ ...v, totalOverdue: maskVat(v.totalOverdue, params.vatMode) }));
  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  return {
    title: 'Default Customer Summary',
    columns,
    rows,
    summary: { totalDefaulters: customerMap.size, totalOverdue: params.vatMode ? 'N/A (Audit Mode)' : fmt(Array.from(customerMap.values()).reduce((s, r) => s + r.totalOverdue, 0)) },
    chartData: Array.from(customerMap.values()).slice(0, 20).map((v) => ({ name: v.customer, amount: params.vatMode ? 0 : v.totalOverdue })),
  };
}

async function hireAccountDetails(params: QueryParams): Promise<ReportResult> {
  const where: Record<string, unknown> = { isActive: true };
  if (params.customerId) where.customerId = params.customerId;
  const dateFilter = buildDateFilter(params.from, params.to);
  if (dateFilter) where.date = dateFilter;

  const hireSales = await db.hireSales.findMany({
    where,
    include: { customer: true, lines: { include: { product: true } }, installments: true },
  });

  const columns: ColumnDef[] = [
    { key: 'invoiceNo', label: 'Invoice No' },
    { key: 'date', label: 'Date' },
    { key: 'customer', label: 'Customer' },
    { key: 'grandTotal', label: 'Grand Total' },
    { key: 'totalPaid', label: 'Total Paid' },
    { key: 'balanceAmount', label: 'Balance' },
    { key: 'duration', label: 'Duration' },
    { key: 'status', label: 'Status' },
  ];

  let rows = hireSales.map((hs) => ({
    invoiceNo: hs.invoiceNo,
    date: fmtDate(hs.date),
    customer: hs.customer?.name || '',
    grandTotal: maskVat(hs.grandTotal, params.vatMode),
    totalPaid: maskVat(hs.totalPaid, params.vatMode),
    balanceAmount: maskVat(hs.balanceAmount, params.vatMode),
    duration: hs.duration,
    status: hs.currentStatus || hs.status,
  }));

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  const totalGrand = hireSales.reduce((s, h) => s + h.grandTotal, 0);
  const totalPaid = hireSales.reduce((s, h) => s + h.totalPaid, 0);

  return {
    title: 'Hire Account Details',
    columns,
    rows,
    summary: { totalAccounts: hireSales.length, totalGrand: params.vatMode ? 'N/A (Audit Mode)' : fmt(totalGrand), totalPaid: params.vatMode ? 'N/A (Audit Mode)' : fmt(totalPaid), totalBalance: params.vatMode ? 'N/A (Audit Mode)' : fmt(totalGrand - totalPaid) },
    chartData: [
      { name: 'Total', amount: params.vatMode ? 0 : totalGrand },
      { name: 'Paid', amount: params.vatMode ? 0 : totalPaid },
      { name: 'Balance', amount: params.vatMode ? 0 : (totalGrand - totalPaid) },
    ],
  };
}

// ============================================================
// SR REPORTS
// ============================================================

async function srWiseSales(params: QueryParams): Promise<ReportResult> {
  // BUG 15 FIX: Use SRTargetSetup to find SR employees instead of fragile designation name contains
  const srTargets = await db.sRTargetSetup.findMany({
    where: { isActive: true, status: 'ACTIVE' },
    select: { employeeId: true },
    distinct: ['employeeId'],
  });
  const srEmployeeIds = srTargets.map((t) => t.employeeId);
  const where: Record<string, unknown> = { isActive: true };
  if (params.employeeId) {
    where.id = params.employeeId;
  } else if (srEmployeeIds.length > 0) {
    where.id = { in: srEmployeeIds };
  } else {
    // Fallback to exact designation match if no SRTargetSetup records exist
    where.designation = { name: { in: ['SR', 'Sales Representative', 'Sales Rep'] } };
  }

  const srs = await db.employee.findMany({
    where,
    include: { designation: true, department: true },
  });

  const salesWhere: Record<string, unknown> = { isActive: true };
  const dateFilter = buildDateFilter(params.from, params.to);
  if (dateFilter) salesWhere.date = dateFilter;

  const salesOrders = await db.salesOrder.findMany({
    where: salesWhere,
    include: { sr: true },
  });

  const srMap = new Map<string, { srName: string; srCode: string; totalOrders: number; totalValue: number }>();
  for (const sr of srs) {
    srMap.set(sr.id, { srName: sr.name, srCode: sr.employeeCode, totalOrders: 0, totalValue: 0 });
  }

  // C2 FIX: Attribute each SO to its actual SR via so.srId instead of even distribution
  for (const so of salesOrders) {
    if (so.srId && srMap.has(so.srId)) {
      const srData = srMap.get(so.srId)!;
      srData.totalOrders += 1;
      srData.totalValue = safeFinancialAdd(srData.totalValue, so.grandTotal);
    }
  }

  const columns: ColumnDef[] = [
    { key: 'srCode', label: 'SR Code' },
    { key: 'srName', label: 'SR Name' },
    { key: 'totalOrders', label: 'Total Orders' },
    { key: 'totalValue', label: 'Total Value' },
  ];

  let rows = Array.from(srMap.values()).map((v) => ({
    srCode: v.srCode,
    srName: v.srName,
    totalOrders: v.totalOrders,
    totalValue: maskVat(safeFinancialRound(v.totalValue), params.vatMode),
  }));

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  return {
    title: 'SR-wise Sales Report',
    columns,
    rows,
    summary: { totalSRs: srs.length, totalValue: params.vatMode ? 'N/A (Audit Mode)' : fmt(rows.reduce((s, r) => s + (Number(r.totalValue) || 0), 0)) },
    chartData: Array.from(srMap.values()).map((v) => ({ name: String(v.srName), value: params.vatMode ? 0 : safeFinancialRound(v.totalValue) })),
  };
}

async function srWiseSalesDetails(params: QueryParams): Promise<ReportResult> {
  const dateFilter = buildDateFilter(params.from, params.to);
  const salesWhere: Record<string, unknown> = { isActive: true };
  if (params.employeeId) salesWhere.srId = params.employeeId;
  if (dateFilter) salesWhere.date = dateFilter;

  const salesOrders = await db.salesOrder.findMany({
    where: salesWhere,
    include: { customer: true, sr: true, lines: { include: { product: true } } },
    orderBy: { date: 'desc' },
  });

  const columns: ColumnDef[] = [
    { key: 'invoiceNo', label: 'Invoice No' },
    { key: 'date', label: 'Date' },
    { key: 'srName', label: 'SR Name' },
    { key: 'customer', label: 'Customer' },
    { key: 'product', label: 'Product' },
    { key: 'quantity', label: 'Quantity' },
    { key: 'rate', label: 'Rate' },
    { key: 'total', label: 'Total' },
  ];

  let rows: Record<string, unknown>[] = [];
  for (const so of salesOrders) {
    for (const line of so.lines) {
      rows.push({
        invoiceNo: so.invoiceNo,
        date: fmtDate(so.date),
        srName: so.sr?.name || 'N/A',
        customer: so.customer?.name || '',
        product: line.product?.name || '',
        quantity: line.quantity,
        rate: maskVat(line.rate, params.vatMode),
        total: maskVat(line.total, params.vatMode),
      });
    }
  }

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  return {
    title: 'SR-wise Sales Details',
    columns,
    rows,
    summary: { totalOrders: salesOrders.length, totalValue: params.vatMode ? 'N/A (Audit Mode)' : fmt(salesOrders.reduce((s, so) => s + so.grandTotal, 0)) },
    chartData: salesOrders.slice(0, 20).map((so) => ({ name: so.invoiceNo, value: params.vatMode ? 0 : so.grandTotal })),
  };
}

async function srWiseCustomerDue(params: QueryParams): Promise<ReportResult> {
  const customers = await db.customer.findMany({
    where: { isActive: true },
    include: {
      salesOrders: { where: { isActive: true } },
      salesReturns: { where: { isActive: true } },
      // H4 FIX: Include cashCollections with srId for SR filtering
      cashCollections: { where: { isActive: true }, include: { sr: true } },
    },
  });

  const columns: ColumnDef[] = [
    { key: 'customer', label: 'Customer' },
    { key: 'customerCode', label: 'Code' },
    { key: 'totalSales', label: 'Total Sales' },
    { key: 'totalPaid', label: 'Total Paid' },
    { key: 'totalReturns', label: 'Returns' },
    { key: 'outstanding', label: 'Outstanding' },
  ];

  // BUG 14 FIX: Calculate raw outstanding before masking, filter on raw value
  let rows = customers.map((c) => {
    const totalSales = c.salesOrders.reduce((s, so) => s + so.grandTotal, 0);
    // H4 FIX: If employeeId param provided, only count cash collections from that SR
    const totalPaid = c.cashCollections
      .filter((cc) => !params.employeeId || cc.srId === params.employeeId)
      .reduce((s, cc) => s + cc.amount, 0);
    const totalReturns = c.salesReturns.reduce((s, r) => s + r.grandTotal, 0);
    const rawOutstanding = c.openingBalance + totalSales - totalPaid - totalReturns;
    return {
      customer: c.name,
      customerCode: c.customerCode,
      totalSales: maskVat(totalSales, params.vatMode),
      totalPaid: maskVat(totalPaid, params.vatMode),
      totalReturns: maskVat(totalReturns, params.vatMode),
      outstanding: maskVat(Math.max(rawOutstanding, 0), params.vatMode),
      _rawOutstanding: rawOutstanding,
    };
  }).filter((r) => r._rawOutstanding > 0);

  // H4 FIX: Filter customers to only those with cashCollections attributed to this SR
  if (params.employeeId) {
    rows = rows.filter((r) => {
      const cust = customers.find((c) => c.name === r.customer);
      return cust?.cashCollections.some((cc) => cc.srId === params.employeeId);
    });
  }

  // BUG 14 FIX: Remove _rawOutstanding from output rows before sort/group
  rows = rows.map(({ _rawOutstanding, ...rest }) => rest);

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  return {
    title: 'SR-wise Customer Due Report',
    columns,
    rows,
    summary: { totalCustomers: rows.length, totalOutstanding: params.vatMode ? 'N/A (Audit Mode)' : fmt(rows.reduce((s, r) => s + (Number(r.outstanding) || 0), 0)) },
    chartData: rows.slice(0, 20).map((r) => ({ name: String(r.customer), outstanding: params.vatMode ? 0 : r.outstanding })),
  };
}

async function srWiseCustomerSummary(params: QueryParams): Promise<ReportResult> {
  const customers = await db.customer.findMany({
    where: { isActive: true },
    include: {
      salesOrders: { where: { isActive: true } },
      // H5 FIX: Include cashCollections with srId for SR filtering
      cashCollections: { where: { isActive: true } },
      hireSales: { where: { isActive: true } },
    },
  });

  const columns: ColumnDef[] = [
    { key: 'customer', label: 'Customer' },
    { key: 'totalOrders', label: 'Total Orders' },
    { key: 'totalRevenue', label: 'Total Revenue' },
    { key: 'totalCollections', label: 'Total Collections' },
    { key: 'balance', label: 'Balance' },
    { key: 'status', label: 'Status' },
  ];

  // H5 FIX: Filter customers by SR if employeeId provided
  const filteredCustomers = params.employeeId
    ? customers.filter((c) => c.cashCollections.some((cc) => cc.srId === params.employeeId))
    : customers;

  let rows = filteredCustomers.map((c) => {
    const totalSales = c.salesOrders.reduce((s, so) => s + so.grandTotal, 0);
    const totalHire = c.hireSales.reduce((s, h) => s + h.grandTotal, 0);
    const totalCollections = c.cashCollections
      .filter((cc) => !params.employeeId || cc.srId === params.employeeId)
      .reduce((s, cc) => s + cc.amount, 0);
    const balance = c.openingBalance + totalSales + totalHire - totalCollections;
    return {
      customer: c.name,
      totalOrders: c.salesOrders.length + c.hireSales.length,
      totalRevenue: maskVat(totalSales + totalHire, params.vatMode),
      totalCollections: maskVat(totalCollections, params.vatMode),
      balance: maskVat(balance, params.vatMode),
      status: balance > 0 ? 'Has Due' : 'Clear',
    };
  });

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  return {
    title: 'SR-wise Customer Summary',
    columns,
    rows,
    summary: { totalCustomers: rows.length, withDue: rows.filter((r) => r.status === 'Has Due').length, clear: rows.filter((r) => r.status === 'Clear').length },
    chartData: [
      { name: 'Has Due', count: rows.filter((r) => r.status === 'Has Due').length },
      { name: 'Clear', count: rows.filter((r) => r.status === 'Clear').length },
    ],
  };
}

async function srVisitReport(params: QueryParams): Promise<ReportResult> {
  const where: Record<string, unknown> = { module: 'Customer' };
  if (params.employeeId) {
    const emp = await db.employee.findUnique({ where: { id: params.employeeId } });
    if (emp) where.userName = emp.name;
  }
  const dateFilter = buildDateFilter(params.from, params.to);
  if (dateFilter) where.createdAt = dateFilter;

  const auditLogs = await db.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  const columns: ColumnDef[] = [
    { key: 'date', label: 'Date' },
    { key: 'action', label: 'Action' },
    { key: 'userName', label: 'User' },
    { key: 'recordLabel', label: 'Customer' },
    { key: 'details', label: 'Details' },
  ];

  let rows = auditLogs.map((a) => ({
    date: fmtDate(a.createdAt),
    action: a.action,
    userName: a.userName || '',
    recordLabel: a.recordLabel || '',
    details: a.details || '',
  }));

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  return {
    title: 'SR Visit Report',
    columns,
    rows,
    summary: { totalVisits: auditLogs.length, uniqueCustomers: new Set(auditLogs.map((a) => a.recordLabel)).size },
    chartData: rows.slice(0, 30).map((r) => ({ date: r.date, visits: 1 })),
  };
}

async function srWiseCustomerStatus(params: QueryParams): Promise<ReportResult> {
  const customers = await db.customer.findMany({
    where: { isActive: true },
    include: {
      salesOrders: { where: { isActive: true } },
      // H6 FIX: Include cashCollections for SR filtering
      cashCollections: { where: { isActive: true } },
    },
  });

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const columns: ColumnDef[] = [
    { key: 'customer', label: 'Customer' },
    { key: 'totalOrders', label: 'Total Orders' },
    { key: 'lastOrderDate', label: 'Last Order Date' },
    { key: 'status', label: 'Status' },
  ];

  // H6 FIX: Filter customers by SR if employeeId provided
  const filteredCustomers = params.employeeId
    ? customers.filter((c) => c.cashCollections.some((cc) => cc.srId === params.employeeId))
    : customers;

  let rows = filteredCustomers.map((c) => {
    const lastOrder = c.salesOrders.length > 0
      ? c.salesOrders.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
      : null;
    const lastOrderDate = lastOrder ? new Date(lastOrder.date) : null;
    const isActiveCustomer = lastOrderDate ? lastOrderDate > thirtyDaysAgo : false;
    return {
      customer: c.name,
      totalOrders: c.salesOrders.length,
      lastOrderDate: lastOrderDate ? fmtDate(lastOrderDate) : 'Never',
      status: isActiveCustomer ? 'Active' : 'Inactive',
    };
  });

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  return {
    title: 'SR-wise Customer Status',
    columns,
    rows,
    summary: { totalCustomers: rows.length, active: rows.filter((r) => r.status === 'Active').length, inactive: rows.filter((r) => r.status === 'Inactive').length },
    chartData: [
      { name: 'Active', count: rows.filter((r) => r.status === 'Active').length },
      { name: 'Inactive', count: rows.filter((r) => r.status === 'Inactive').length },
    ],
  };
}

async function srWiseCashCollection(params: QueryParams): Promise<ReportResult> {
  const where: Record<string, unknown> = { isActive: true };
  if (params.customerId) where.customerId = params.customerId;
  // H7 FIX: Filter cashCollections by SR if employeeId provided
  if (params.employeeId) where.srId = params.employeeId;
  const dateFilter = buildDateFilter(params.from, params.to);
  if (dateFilter) where.date = dateFilter;

  const collections = await db.cashCollection.findMany({
    where,
    include: { customer: true, paymentOption: true, bank: true },
    orderBy: { date: 'desc' },
  });

  const columns: ColumnDef[] = [
    { key: 'date', label: 'Date' },
    { key: 'collectionCode', label: 'Code' },
    { key: 'customer', label: 'Customer' },
    { key: 'amount', label: 'Amount' },
    { key: 'paymentOption', label: 'Payment Option' },
    { key: 'bank', label: 'Bank' },
  ];

  let rows = collections.map((c) => ({
    date: fmtDate(c.date),
    collectionCode: c.collectionCode,
    customer: c.customer?.name || '',
    amount: maskVat(c.amount, params.vatMode),
    paymentOption: c.paymentOption?.name || '',
    bank: c.bank?.bankName || '',
  }));

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  const totalCollected = collections.reduce((s, c) => s + c.amount, 0);

  return {
    title: 'SR-wise Cash Collection',
    columns,
    rows,
    summary: { totalCollections: collections.length, totalAmount: params.vatMode ? 'N/A (Audit Mode)' : fmt(totalCollected) },
    chartData: collections.slice(0, 30).map((c) => ({ date: fmtDate(c.date), amount: params.vatMode ? 0 : c.amount })),
  };
}

async function srCommissionReport(params: QueryParams): Promise<ReportResult> {
  const dateFilter = buildDateFilter(params.from, params.to);
  const salesWhere: Record<string, unknown> = { isActive: true, status: 'Confirmed' };
  if (params.employeeId) salesWhere.srId = params.employeeId;
  if (dateFilter) salesWhere.date = dateFilter;

  const salesOrders = await db.salesOrder.findMany({
    where: salesWhere,
    include: { sr: true },
  });

  // BUG 16 FIX: Use SRTargetSetup to find SR employees and commission rates
  const srTargetSetups = await db.sRTargetSetup.findMany({
    where: { isActive: true, status: 'ACTIVE' },
  });
  const srEmployeeIds = [...new Set(srTargetSetups.map((t) => t.employeeId))];
  const srWhere: Record<string, unknown> = { isActive: true };
  if (params.employeeId) {
    srWhere.id = params.employeeId;
  } else if (srEmployeeIds.length > 0) {
    srWhere.id = { in: srEmployeeIds };
  } else {
    // Fallback to exact designation match if no SRTargetSetup records exist
    srWhere.designation = { name: { in: ['SR', 'Sales Representative', 'Sales Rep'] } };
  }

  const srs = await db.employee.findMany({
    where: srWhere,
    include: { designation: true },
  });

  const columns: ColumnDef[] = [
    { key: 'srCode', label: 'SR Code' },
    { key: 'srName', label: 'SR Name' },
    { key: 'totalSales', label: 'Total Sales' },
    { key: 'totalOrders', label: 'Total Orders' },
    { key: 'commissionRate', label: 'Commission Rate' },
    { key: 'commission', label: 'Commission' },
  ];

  // C3 FIX: Attribute each SO to its actual SR via so.srId instead of even distribution
  const srSalesMap = new Map<string, { srCode: string; srName: string; totalSales: number; totalOrders: number }>();
  for (const sr of srs) {
    srSalesMap.set(sr.id, { srCode: sr.employeeCode, srName: sr.name, totalSales: 0, totalOrders: 0 });
  }

  for (const so of salesOrders) {
    if (so.srId && srSalesMap.has(so.srId)) {
      const srData = srSalesMap.get(so.srId)!;
      srData.totalOrders += 1;
      srData.totalSales = safeFinancialAdd(srData.totalSales, so.grandTotal);
    }
  }

  let rows = Array.from(srSalesMap.values()).map((v) => {
    // C3 FIX: Use commissionPercentage from SRTargetSetup instead of hardcoded 2%
    const target = srTargetSetups.find((t) => t.employeeId === [...srSalesMap.entries()].find(([, d]) => d.srCode === v.srCode)?.[0]);
    const commissionRate = target ? target.commissionPercentage / 100 : 0;
    const commission = safeFinancialRound(v.totalSales * commissionRate);
    return {
      srCode: v.srCode,
      srName: v.srName,
      totalSales: maskVat(safeFinancialRound(v.totalSales), params.vatMode),
      totalOrders: v.totalOrders,
      commissionRate: `${(commissionRate * 100).toFixed(1)}%`,
      commission: maskVat(commission, params.vatMode),
    };
  });

  if (params.employeeId) rows = rows.filter((r) => {
    const srEntry = [...srSalesMap.entries()].find(([, d]) => d.srCode === r.srCode);
    return srEntry ? srEntry[0] === params.employeeId : false;
  });

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  const totalSalesValue = salesOrders.reduce((s, so) => s + so.grandTotal, 0);

  return {
    title: 'SR Commission Report',
    columns,
    rows,
    summary: { totalSRs: srs.length, totalSales: params.vatMode ? 'N/A (Audit Mode)' : fmt(totalSalesValue), totalCommission: params.vatMode ? 'N/A (Audit Mode)' : fmt(rows.reduce((s, r) => s + (Number(r.commission) || 0), 0)) },
    chartData: Array.from(srSalesMap.values()).map((v) => {
      const target = srTargetSetups.find((t) => t.employeeId === [...srSalesMap.entries()].find(([, d]) => d.srCode === v.srCode)?.[0]);
      const commissionRate = target ? target.commissionPercentage / 100 : 0;
      return { name: String(v.srName), sales: params.vatMode ? 0 : safeFinancialRound(v.totalSales), commission: params.vatMode ? 0 : safeFinancialRound(v.totalSales * commissionRate) };
    }),
  };
}

// ============================================================
// CUSTOMER WISE REPORTS
// ============================================================

async function customerWiseSales(params: QueryParams): Promise<ReportResult> {
  const where: Record<string, unknown> = { isActive: true };
  if (params.customerId) where.customerId = params.customerId;
  const dateFilter = buildDateFilter(params.from, params.to);
  if (dateFilter) where.date = dateFilter;

  const salesOrders = await db.salesOrder.findMany({
    where,
    include: { customer: true },
    orderBy: { date: 'desc' },
  });

  const customerMap = new Map<string, { customer: string; totalOrders: number; totalValue: number }>();
  for (const so of salesOrders) {
    const name = so.customer?.name || 'Unknown';
    const existing = customerMap.get(name);
    if (existing) {
      existing.totalOrders += 1;
      existing.totalValue += so.grandTotal;
    } else {
      customerMap.set(name, { customer: name, totalOrders: 1, totalValue: so.grandTotal });
    }
  }

  const columns: ColumnDef[] = [
    { key: 'customer', label: 'Customer' },
    { key: 'totalOrders', label: 'Total Orders' },
    { key: 'totalValue', label: 'Total Value' },
  ];

  let rows = Array.from(customerMap.values()).map((v) => ({ ...v, totalValue: maskVat(v.totalValue, params.vatMode) }));
  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  return {
    title: 'Customer-wise Sales Report',
    columns,
    rows,
    summary: { totalCustomers: customerMap.size, totalOrders: salesOrders.length, totalValue: params.vatMode ? 'N/A (Audit Mode)' : fmt(salesOrders.reduce((s, so) => s + so.grandTotal, 0)) },
    chartData: Array.from(customerMap.values()).slice(0, 20).map((v) => ({ name: v.customer, value: params.vatMode ? 0 : v.totalValue })),
  };
}

async function categoryWiseCustomerDue(params: QueryParams): Promise<ReportResult> {
  const customers = await db.customer.findMany({
    where: { isActive: true },
    include: {
      salesOrders: { where: { isActive: true }, include: { lines: { include: { product: { include: { category: true } } } } } },
      salesReturns: { where: { isActive: true } },
      cashCollections: { where: { isActive: true } },
    },
  });

  const catDueMap = new Map<string, { category: string; totalDue: number; customerCount: number }>();
  for (const c of customers) {
    const totalSales = c.salesOrders.reduce((s, so) => s + so.grandTotal, 0);
    const totalReturns = c.salesReturns.reduce((s, r) => s + r.grandTotal, 0);
    const totalCollections = c.cashCollections.reduce((s, cc) => s + cc.amount, 0);
    const due = Math.max(c.openingBalance + totalSales - totalReturns - totalCollections, 0);

    if (due <= 0) continue;

    const categories = new Set<string>();
    for (const so of c.salesOrders) {
      for (const line of so.lines) {
        const cat = line.product?.category?.name || 'Unknown';
        categories.add(cat);
      }
    }

    for (const cat of categories) {
      const existing = catDueMap.get(cat);
      if (existing) {
        // H12 FIX: Use full outstanding amount instead of even split across categories
        existing.totalDue += due;
        existing.customerCount += 1;
      } else {
        catDueMap.set(cat, { category: cat, totalDue: due, customerCount: 1 });
      }
    }
  }

  const columns: ColumnDef[] = [
    { key: 'category', label: 'Category' },
    { key: 'customerCount', label: 'Customers' },
    { key: 'totalDue', label: 'Total Due' },
  ];

  let rows = Array.from(catDueMap.values()).map((v) => ({ ...v, totalDue: maskVat(v.totalDue, params.vatMode) }));
  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  return {
    title: 'Category-wise Customer Due',
    columns,
    rows,
    summary: { totalCategories: catDueMap.size, totalDue: params.vatMode ? 'N/A (Audit Mode)' : fmt(Array.from(catDueMap.values()).reduce((s, r) => s + r.totalDue, 0)) },
    chartData: Array.from(catDueMap.values()).map((v) => ({ name: v.category, due: params.vatMode ? 0 : v.totalDue })),
  };
}

async function customerLedger(params: QueryParams): Promise<ReportResult> {
  if (!params.customerId) {
    return emptyReport('Customer Ledger — Select a Customer', [
      { key: 'hint', label: 'Please select a customer from the filter above to view their ledger' },
    ]);
  }

  const customer = await db.customer.findUnique({ where: { id: params.customerId } });
  if (!customer) return emptyReport('Customer Ledger', []);

  const dateFilter = buildDateFilter(params.from, params.to);
  const soWhere: Record<string, unknown> = { isActive: true };
  if (dateFilter) soWhere.date = dateFilter;
  const srWhere: Record<string, unknown> = { isActive: true };
  if (dateFilter) srWhere.date = dateFilter;
  const ccWhere: Record<string, unknown> = { isActive: true };
  if (dateFilter) ccWhere.date = dateFilter;

  const [salesOrders, salesReturns, cashCollections] = await Promise.all([
    db.salesOrder.findMany({ where: { customerId: params.customerId, ...soWhere }, orderBy: { date: 'asc' } }),
    db.salesReturn.findMany({ where: { customerId: params.customerId, ...srWhere }, orderBy: { date: 'asc' } }),
    db.cashCollection.findMany({ where: { customerId: params.customerId, ...ccWhere }, orderBy: { date: 'asc' } }),
  ]);

  const columns: ColumnDef[] = [
    { key: 'date', label: 'Date' },
    { key: 'type', label: 'Type' },
    { key: 'reference', label: 'Reference' },
    { key: 'debit', label: 'Debit' },
    { key: 'credit', label: 'Credit' },
    { key: 'balance', label: 'Balance' },
  ];

  const entries: { date: Date; type: string; reference: string; debit: number; credit: number }[] = [];
  for (const so of salesOrders) entries.push({ date: so.date, type: 'Sale', reference: so.invoiceNo, debit: so.grandTotal, credit: 0 });
  for (const sr of salesReturns) entries.push({ date: sr.date, type: 'Return', reference: sr.returnNo, debit: 0, credit: sr.grandTotal });
  for (const cc of cashCollections) entries.push({ date: cc.date, type: 'Collection', reference: cc.collectionCode, debit: 0, credit: cc.amount });

  entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let runningBalance = customer.openingBalance;
  const rows: Record<string, unknown>[] = [
    { date: 'Opening', type: 'Opening Balance', reference: '-', debit: maskVat(customer.openingBalance, params.vatMode), credit: 0, balance: maskVat(customer.openingBalance, params.vatMode) },
  ];
  for (const e of entries) {
    runningBalance += e.debit - e.credit;
    rows.push({
      date: fmtDate(e.date),
      type: e.type,
      reference: e.reference,
      debit: maskVat(e.debit, params.vatMode),
      credit: maskVat(e.credit, params.vatMode),
      balance: maskVat(runningBalance, params.vatMode),
    });
  }

  const totalDebit = customer.openingBalance + salesOrders.reduce((s, so) => s + so.grandTotal, 0);
  const totalCredit = salesReturns.reduce((s, r) => s + r.grandTotal, 0) + cashCollections.reduce((s, c) => s + c.amount, 0);

  return {
    title: `Customer Ledger - ${customer.name}`,
    columns,
    rows,
    summary: { openingBalance: maskVat(customer.openingBalance, params.vatMode), totalDebit: maskVat(totalDebit, params.vatMode), totalCredit: maskVat(totalCredit, params.vatMode), closingBalance: maskVat(runningBalance, params.vatMode) },
    chartData: rows.slice(1).map((r) => ({ date: r.date, balance: r.balance })),
  };
}

async function customerDueReport(params: QueryParams): Promise<ReportResult> {
  const customers = await db.customer.findMany({
    where: { isActive: true },
    include: {
      salesOrders: { where: { isActive: true } },
      salesReturns: { where: { isActive: true } },
      cashCollections: { where: { isActive: true } },
      hireSales: { where: { isActive: true } },
    },
  });

  const columns: ColumnDef[] = [
    { key: 'customerCode', label: 'Code' },
    { key: 'customer', label: 'Customer' },
    { key: 'phone', label: 'Phone' },
    { key: 'openingBalance', label: 'Opening' },
    { key: 'totalSales', label: 'Total Sales' },
    { key: 'totalPaid', label: 'Total Paid' },
    { key: 'outstanding', label: 'Outstanding' },
  ];

  let rows = customers.map((c) => {
    const totalSales = c.salesOrders.reduce((s, so) => s + so.grandTotal, 0) + c.hireSales.reduce((s, h) => s + h.grandTotal, 0);
    const totalPaid = c.cashCollections.reduce((s, cc) => s + cc.amount, 0);
    const totalReturns = c.salesReturns.reduce((s, r) => s + r.grandTotal, 0);
    const outstanding = c.openingBalance + totalSales - totalPaid - totalReturns;
    return {
      _customerId: c.id, // H2 FIX: Keep customer UUID for filtering
      customerCode: c.customerCode,
      customer: c.name,
      phone: c.phone || '',
      openingBalance: maskVat(c.openingBalance, params.vatMode),
      totalSales: maskVat(totalSales, params.vatMode),
      totalPaid: maskVat(totalPaid, params.vatMode),
      outstanding: maskVat(Math.max(outstanding, 0), params.vatMode),
    };
  }).filter((r) => r.outstanding > 0 || params.vatMode);

  // H2 FIX: Filter by customer UUID instead of code
  if (params.customerId) rows = rows.filter((r) => r._customerId === params.customerId);

  // BUG 8 FIX: Remove _customerId from output rows before sort/group
  rows = rows.map(({ _customerId, ...rest }) => rest);

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  return {
    title: 'Customer Due Report',
    columns,
    rows,
    summary: { totalCustomers: rows.length, totalOutstanding: params.vatMode ? 'N/A (Audit Mode)' : fmt(rows.reduce((s, r) => s + (Number(r.outstanding) || 0), 0)) },
    chartData: rows.slice(0, 20).map((r) => ({ name: String(r.customer), outstanding: params.vatMode ? 0 : r.outstanding })),
  };
}

async function customerCashCollection(params: QueryParams): Promise<ReportResult> {
  const where: Record<string, unknown> = { isActive: true };
  if (params.customerId) where.customerId = params.customerId;
  const dateFilter = buildDateFilter(params.from, params.to);
  if (dateFilter) where.date = dateFilter;

  const collections = await db.cashCollection.findMany({
    where,
    include: { customer: true, paymentOption: true, bank: true },
    orderBy: { date: 'desc' },
  });

  const columns: ColumnDef[] = [
    { key: 'date', label: 'Date' },
    { key: 'collectionCode', label: 'Code' },
    { key: 'customer', label: 'Customer' },
    { key: 'amount', label: 'Amount' },
    { key: 'paymentOption', label: 'Payment Option' },
    { key: 'bank', label: 'Bank' },
    { key: 'description', label: 'Description' },
  ];

  let rows = collections.map((c) => ({
    date: fmtDate(c.date),
    collectionCode: c.collectionCode,
    customer: c.customer?.name || '',
    amount: maskVat(c.amount, params.vatMode),
    paymentOption: c.paymentOption?.name || '',
    bank: c.bank?.bankName || '',
    description: c.description || '',
  }));

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  return {
    title: 'Customer Cash Collection Report',
    columns,
    rows,
    summary: { totalCollections: collections.length, totalAmount: params.vatMode ? 'N/A (Audit Mode)' : fmt(collections.reduce((s, c) => s + c.amount, 0)) },
    chartData: collections.slice(0, 30).map((c) => ({ date: fmtDate(c.date), amount: params.vatMode ? 0 : c.amount })),
  };
}

async function customerLedgerSummary(params: QueryParams): Promise<ReportResult> {
  const customers = await db.customer.findMany({
    where: { isActive: true },
    include: {
      salesOrders: { where: { isActive: true } },
      salesReturns: { where: { isActive: true } },
      cashCollections: { where: { isActive: true } },
      hireSales: { where: { isActive: true } },
    },
  });

  const columns: ColumnDef[] = [
    { key: 'customerCode', label: 'Code' },
    { key: 'customer', label: 'Customer' },
    { key: 'openingBalance', label: 'Opening' },
    { key: 'totalSales', label: 'Total Sales' },
    { key: 'totalReturns', label: 'Returns' },
    { key: 'totalCollections', label: 'Collections' },
    { key: 'balance', label: 'Balance' },
  ];

  let rows = customers.map((c) => {
    const totalSales = c.salesOrders.reduce((s, so) => s + so.grandTotal, 0) + c.hireSales.reduce((s, h) => s + h.grandTotal, 0);
    const totalReturns = c.salesReturns.reduce((s, r) => s + r.grandTotal, 0);
    const totalCollections = c.cashCollections.reduce((s, cc) => s + cc.amount, 0);
    const balance = c.openingBalance + totalSales - totalReturns - totalCollections;
    return {
      _customerId: c.id, // H3 FIX: Keep customer UUID for filtering
      customerCode: c.customerCode,
      customer: c.name,
      openingBalance: maskVat(c.openingBalance, params.vatMode),
      totalSales: maskVat(totalSales, params.vatMode),
      totalReturns: maskVat(totalReturns, params.vatMode),
      totalCollections: maskVat(totalCollections, params.vatMode),
      balance: maskVat(balance, params.vatMode),
    };
  });

  // H3 FIX: Filter by customer UUID instead of code
  if (params.customerId) rows = rows.filter((r) => r._customerId === params.customerId);

  // BUG 9 FIX: Remove _customerId from output rows before sort/group
  rows = rows.map(({ _customerId, ...rest }) => rest);

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  return {
    title: 'Customer Ledger Summary',
    columns,
    rows,
    summary: {
      totalCustomers: rows.length,
      totalOpening: params.vatMode ? 'N/A (Audit Mode)' : fmt(rows.reduce((s, r) => s + (Number(r.openingBalance) || 0), 0)),
      totalSales: params.vatMode ? 'N/A (Audit Mode)' : fmt(rows.reduce((s, r) => s + (Number(r.totalSales) || 0), 0)),
      totalCollections: params.vatMode ? 'N/A (Audit Mode)' : fmt(rows.reduce((s, r) => s + (Number(r.totalCollections) || 0), 0)),
      totalBalance: params.vatMode ? 'N/A (Audit Mode)' : fmt(rows.reduce((s, r) => s + (Number(r.balance) || 0), 0)),
    },
    chartData: rows.slice(0, 20).map((r) => ({ name: String(r.customer), sales: params.vatMode ? 0 : r.totalSales, collections: params.vatMode ? 0 : r.totalCollections, balance: params.vatMode ? 0 : r.balance })),
  };
}

// ============================================================
// MANAGEMENT REPORTS
// ============================================================

async function expenseReport(params: QueryParams): Promise<ReportResult> {
  const where: Record<string, unknown> = { isActive: true };
  const dateFilter = buildDateFilter(params.from, params.to);
  if (dateFilter) where.date = dateFilter;

  const expenses = await db.expense.findMany({
    where,
    include: { head: true, paymentOption: true, bank: true },
    orderBy: { date: 'desc' },
  });

  const headMap = new Map<string, { head: string; count: number; totalAmount: number }>();
  for (const e of expenses) {
    const name = e.head?.name || 'Unknown';
    const existing = headMap.get(name);
    if (existing) {
      existing.count += 1;
      existing.totalAmount += e.amount;
    } else {
      headMap.set(name, { head: name, count: 1, totalAmount: e.amount });
    }
  }

  const columns: ColumnDef[] = [
    { key: 'head', label: 'Expense Head' },
    { key: 'count', label: 'Count' },
    { key: 'totalAmount', label: 'Total Amount' },
  ];

  let rows = Array.from(headMap.values()).map((v) => ({ ...v, totalAmount: maskVat(v.totalAmount, params.vatMode) }));
  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  const totalAmount = expenses.reduce((s, e) => s + e.amount, 0);

  return {
    title: 'Expense Report',
    columns,
    rows,
    summary: { totalExpenses: expenses.length, totalAmount: params.vatMode ? 'N/A (Audit Mode)' : fmt(totalAmount), avgExpense: params.vatMode ? 'N/A (Audit Mode)' : (expenses.length > 0 ? fmt(totalAmount / expenses.length) : '0.00') },
    chartData: Array.from(headMap.values()).map((v) => ({ name: v.head, amount: params.vatMode ? 0 : v.totalAmount })),
  };
}

// ============================================================
// MANAGEMENT REPORTS — INDIVIDUAL SUBTYPES
// ============================================================

async function productWiseBenefit(params: QueryParams): Promise<ReportResult> {
  const dateFilter = buildDateFilter(params.from, params.to);
  const soWhere: Record<string, unknown> = { isActive: true, status: { notIn: ['Draft', 'Cancelled'] } };
  if (params.customerId) soWhere.customerId = params.customerId;
  if (dateFilter) soWhere.date = dateFilter;

  const salesOrders = await db.salesOrder.findMany({
    where: soWhere,
    include: { lines: { include: { product: { include: { category: true } } } } },
  });

  // Aggregate by product
  const prodMap = new Map<string, { product: string; category: string; qtySold: number; totalRevenue: number; totalCost: number }>();
  for (const so of salesOrders) {
    for (const line of so.lines) {
      const pName = line.product?.name || 'Unknown';
      const existing = prodMap.get(pName);
      const revenue = line.total || (line.quantity * line.rate) || 0;
      const cost = line.costPrice ? line.costPrice * line.quantity : 0;
      if (existing) {
        existing.qtySold += line.quantity;
        existing.totalRevenue = safeFinancialAdd(existing.totalRevenue, revenue);
        existing.totalCost = safeFinancialAdd(existing.totalCost, cost);
      } else {
        prodMap.set(pName, {
          product: pName,
          category: line.product?.category?.name || 'Unknown',
          qtySold: line.quantity,
          totalRevenue: revenue,
          totalCost: cost,
        });
      }
    }
  }

  const columns: ColumnDef[] = [
    { key: 'product', label: 'Product' },
    { key: 'category', label: 'Category' },
    { key: 'qtySold', label: 'Qty Sold' },
    { key: 'totalRevenue', label: 'Total Revenue' },
    { key: 'totalCost', label: 'Total Cost' },
    { key: 'profit', label: 'Profit' },
    { key: 'margin', label: 'Margin %' },
  ];

  let rows = Array.from(prodMap.values()).map((v) => {
    const profit = safeFinancialSubtract(v.totalRevenue, v.totalCost);
    const margin = v.totalRevenue > 0 ? safeFinancialRound((profit / v.totalRevenue) * 100) : 0;
    return {
      product: v.product,
      category: v.category,
      qtySold: v.qtySold,
      totalRevenue: maskVat(v.totalRevenue, params.vatMode),
      totalCost: maskVat(v.totalCost, params.vatMode),
      profit: maskVat(profit, params.vatMode),
      margin: maskVat(`${margin}%`, params.vatMode),
    };
  });

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  const totalRevenue = Array.from(prodMap.values()).reduce((s, v) => safeFinancialAdd(s, v.totalRevenue), 0);
  const totalCost = Array.from(prodMap.values()).reduce((s, v) => safeFinancialAdd(s, v.totalCost), 0);
  const totalProfit = safeFinancialSubtract(totalRevenue, totalCost);

  return {
    title: 'Product Wise Benefit Report',
    columns,
    rows,
    summary: {
      totalProducts: prodMap.size,
      totalRevenue: params.vatMode ? 'N/A (Audit Mode)' : fmt(safeFinancialRound(totalRevenue)),
      totalCost: params.vatMode ? 'N/A (Audit Mode)' : fmt(safeFinancialRound(totalCost)),
      totalProfit: params.vatMode ? 'N/A (Audit Mode)' : fmt(safeFinancialRound(totalProfit)),
    },
    chartData: Array.from(prodMap.values()).slice(0, 20).map((v) => ({
      name: v.product,
      revenue: params.vatMode ? 0 : v.totalRevenue,
      cost: params.vatMode ? 0 : v.totalCost,
    })),
  };
}

async function incomeReport(params: QueryParams): Promise<ReportResult> {
  const where: Record<string, unknown> = { isActive: true };
  const dateFilter = buildDateFilter(params.from, params.to);
  if (dateFilter) where.date = dateFilter;
  if (params.bankId) where.bankId = params.bankId;

  const incomes = await db.income.findMany({
    where,
    include: { head: true, paymentOption: true, bank: true },
    orderBy: { date: 'desc' },
  });

  const headMap = new Map<string, { head: string; count: number; totalAmount: number }>();
  for (const inc of incomes) {
    const name = inc.head?.name || 'Unknown';
    const existing = headMap.get(name);
    if (existing) {
      existing.count += 1;
      existing.totalAmount = safeFinancialAdd(existing.totalAmount, inc.amount);
    } else {
      headMap.set(name, { head: name, count: 1, totalAmount: inc.amount });
    }
  }

  const columns: ColumnDef[] = [
    { key: 'head', label: 'Income Head' },
    { key: 'count', label: 'Count' },
    { key: 'totalAmount', label: 'Total Amount' },
  ];

  let rows = Array.from(headMap.values()).map((v) => ({ ...v, totalAmount: maskVat(v.totalAmount, params.vatMode) }));
  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  const totalAmount = incomes.reduce((s, i) => safeFinancialAdd(s, i.amount), 0);

  return {
    title: 'Income Report',
    columns,
    rows,
    summary: {
      totalIncomes: incomes.length,
      totalAmount: params.vatMode ? 'N/A (Audit Mode)' : fmt(safeFinancialRound(totalAmount)),
      avgIncome: params.vatMode ? 'N/A (Audit Mode)' : (incomes.length > 0 ? fmt(safeFinancialRound(totalAmount / incomes.length)) : '0.00'),
    },
    chartData: Array.from(headMap.values()).map((v) => ({ name: v.head, amount: params.vatMode ? 0 : v.totalAmount })),
  };
}

async function adjustmentReport(params: QueryParams): Promise<ReportResult> {
  // Adjustment report covers ledger adjustments and period-close adjustments
  const dateFilter = buildDateFilter(params.from, params.to);

  const ledgerWhere: Record<string, unknown> = {};
  if (dateFilter) ledgerWhere.date = dateFilter;

  const ledgerEntries = await db.ledgerEntry.findMany({
    where: ledgerWhere,
    include: { chartOfAccount: true },
    orderBy: { date: 'desc' },
    take: 500,
  });

  // Filter for adjustment-type entries (journalVoucher exists or narration includes 'adjust')
  const adjustments = ledgerEntries.filter(
    (le) => le.journalVoucher || (le.narration && le.narration.toLowerCase().includes('adjust'))
  );

  const columns: ColumnDef[] = [
    { key: 'date', label: 'Date' },
    { key: 'account', label: 'Account' },
    { key: 'debit', label: 'Debit' },
    { key: 'credit', label: 'Credit' },
    { key: 'narration', label: 'Narration' },
    { key: 'voucherNo', label: 'Voucher No' },
  ];

  let rows = adjustments.map((le) => ({
    date: fmtDate(le.date),
    account: le.chartOfAccount?.name || '',
    debit: maskVat(le.debit, params.vatMode),
    credit: maskVat(le.credit, params.vatMode),
    narration: le.narration || '',
    voucherNo: le.journalVoucher || '',
  }));

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  const totalDebit = adjustments.reduce((s, a) => safeFinancialAdd(s, a.debit), 0);
  const totalCredit = adjustments.reduce((s, a) => safeFinancialAdd(s, a.credit), 0);

  return {
    title: 'Adjustment Report',
    columns,
    rows,
    summary: {
      totalAdjustments: adjustments.length,
      totalDebit: params.vatMode ? 'N/A (Audit Mode)' : fmt(safeFinancialRound(totalDebit)),
      totalCredit: params.vatMode ? 'N/A (Audit Mode)' : fmt(safeFinancialRound(totalCredit)),
    },
    chartData: [],
  };
}

async function transactionSummary(params: QueryParams): Promise<ReportResult> {
  const dateFilter = buildDateFilter(params.from, params.to);

  // Count transactions by type
  const soWhere: Record<string, unknown> = { isActive: true };
  const poWhere: Record<string, unknown> = { isActive: true };
  const expWhere: Record<string, unknown> = { isActive: true };
  const incWhere: Record<string, unknown> = { isActive: true };
  const ccWhere: Record<string, unknown> = { isActive: true };
  const cdWhere: Record<string, unknown> = { isActive: true };
  const btWhere: Record<string, unknown> = { isActive: true };

  if (dateFilter) {
    soWhere.date = dateFilter;
    poWhere.date = dateFilter;
    expWhere.date = dateFilter;
    incWhere.date = dateFilter;
    ccWhere.date = dateFilter;
    cdWhere.date = dateFilter;
    btWhere.date = dateFilter;
  }

  const [salesCount, purchaseCount, expenseCount, incomeCount, collectionCount, deliveryCount, bankTxCount] = await Promise.all([
    db.salesOrder.count({ where: soWhere }),
    db.purchaseOrder.count({ where: poWhere }),
    db.expense.count({ where: expWhere }),
    db.income.count({ where: incWhere }),
    db.cashCollection.count({ where: ccWhere }),
    db.cashDelivery.count({ where: cdWhere }),
    db.bankTransaction.count({ where: btWhere }),
  ]);

  const [salesTotal, purchaseTotal, expenseTotal, incomeTotal, collectionTotal, deliveryTotal, bankTxTotal] = await Promise.all([
    db.salesOrder.aggregate({ where: soWhere, _sum: { grandTotal: true } }),
    db.purchaseOrder.aggregate({ where: poWhere, _sum: { grandTotal: true } }),
    db.expense.aggregate({ where: expWhere, _sum: { amount: true } }),
    db.income.aggregate({ where: incWhere, _sum: { amount: true } }),
    db.cashCollection.aggregate({ where: ccWhere, _sum: { amount: true } }),
    db.cashDelivery.aggregate({ where: cdWhere, _sum: { amount: true } }),
    db.bankTransaction.aggregate({ where: btWhere, _sum: { amount: true } }),
  ]);

  const columns: ColumnDef[] = [
    { key: 'transactionType', label: 'Transaction Type' },
    { key: 'count', label: 'Count' },
    { key: 'totalAmount', label: 'Total Amount' },
  ];

  const rows: Record<string, unknown>[] = [
    { transactionType: 'Sales Orders', count: salesCount, totalAmount: maskVat(salesTotal._sum.grandTotal || 0, params.vatMode) },
    { transactionType: 'Purchase Orders', count: purchaseCount, totalAmount: maskVat(purchaseTotal._sum.grandTotal || 0, params.vatMode) },
    { transactionType: 'Expenses', count: expenseCount, totalAmount: maskVat(expenseTotal._sum.amount || 0, params.vatMode) },
    { transactionType: 'Incomes', count: incomeCount, totalAmount: maskVat(incomeTotal._sum.amount || 0, params.vatMode) },
    { transactionType: 'Cash Collections', count: collectionCount, totalAmount: maskVat(collectionTotal._sum.amount || 0, params.vatMode) },
    { transactionType: 'Cash Deliveries', count: deliveryCount, totalAmount: maskVat(deliveryTotal._sum.amount || 0, params.vatMode) },
    { transactionType: 'Bank Transactions', count: bankTxCount, totalAmount: maskVat(bankTxTotal._sum.amount || 0, params.vatMode) },
  ];

  const totalTransactions = salesCount + purchaseCount + expenseCount + incomeCount + collectionCount + deliveryCount + bankTxCount;

  return {
    title: 'Transaction Summary Report',
    columns,
    rows,
    summary: {
      totalTransactions,
      transactionTypes: 7,
    },
    chartData: rows.map((r) => ({ name: String(r.transactionType), count: r.count, amount: params.vatMode ? 0 : r.totalAmount })),
  };
}

async function monthlyTransaction(params: QueryParams): Promise<ReportResult> {
  const dateFilter = buildDateFilter(params.from, params.to);

  const soWhere: Record<string, unknown> = { isActive: true, status: { notIn: ['Draft', 'Cancelled'] } };
  const poWhere: Record<string, unknown> = { isActive: true };
  const expWhere: Record<string, unknown> = { isActive: true };
  if (dateFilter) { soWhere.date = dateFilter; poWhere.date = dateFilter; expWhere.date = dateFilter; }

  const [salesOrders, purchaseOrders, expenses] = await Promise.all([
    db.salesOrder.findMany({ where: soWhere, select: { grandTotal: true, date: true } }),
    db.purchaseOrder.findMany({ where: poWhere, select: { grandTotal: true, date: true } }),
    db.expense.findMany({ where: expWhere, select: { amount: true, date: true } }),
  ]);

  // Group by month
  const monthMap = new Map<string, { month: string; sales: number; purchases: number; expenses: number }>();
  for (const so of salesOrders) {
    const key = fmtDate(so.date).replace(/\d{2} (\w{3}) (\d{4})/, '$1 $2');
    const existing = monthMap.get(key) || { month: key, sales: 0, purchases: 0, expenses: 0 };
    existing.sales = safeFinancialAdd(existing.sales, so.grandTotal);
    monthMap.set(key, existing);
  }
  for (const po of purchaseOrders) {
    const key = fmtDate(po.date).replace(/\d{2} (\w{3}) (\d{4})/, '$1 $2');
    const existing = monthMap.get(key) || { month: key, sales: 0, purchases: 0, expenses: 0 };
    existing.purchases = safeFinancialAdd(existing.purchases, po.grandTotal);
    monthMap.set(key, existing);
  }
  for (const exp of expenses) {
    const key = fmtDate(exp.date).replace(/\d{2} (\w{3}) (\d{4})/, '$1 $2');
    const existing = monthMap.get(key) || { month: key, sales: 0, purchases: 0, expenses: 0 };
    existing.expenses = safeFinancialAdd(existing.expenses, exp.amount);
    monthMap.set(key, existing);
  }

  const columns: ColumnDef[] = [
    { key: 'month', label: 'Month' },
    { key: 'sales', label: 'Sales' },
    { key: 'purchases', label: 'Purchases' },
    { key: 'expenses', label: 'Expenses' },
    { key: 'net', label: 'Net (Sales - Purchases - Expenses)' },
  ];

  let rows = Array.from(monthMap.values()).map((v) => ({
    month: v.month,
    sales: maskVat(v.sales, params.vatMode),
    purchases: maskVat(v.purchases, params.vatMode),
    expenses: maskVat(v.expenses, params.vatMode),
    net: maskVat(safeFinancialSubtract(v.sales, safeFinancialAdd(v.purchases, v.expenses)), params.vatMode),
  }));

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  const totalSales = Array.from(monthMap.values()).reduce((s, v) => safeFinancialAdd(s, v.sales), 0);
  const totalPurchases = Array.from(monthMap.values()).reduce((s, v) => safeFinancialAdd(s, v.purchases), 0);
  const totalExpenses = Array.from(monthMap.values()).reduce((s, v) => safeFinancialAdd(s, v.expenses), 0);

  return {
    title: 'Monthly Transaction Report',
    columns,
    rows,
    summary: {
      totalMonths: monthMap.size,
      totalSales: params.vatMode ? 'N/A (Audit Mode)' : fmt(safeFinancialRound(totalSales)),
      totalPurchases: params.vatMode ? 'N/A (Audit Mode)' : fmt(safeFinancialRound(totalPurchases)),
      totalExpenses: params.vatMode ? 'N/A (Audit Mode)' : fmt(safeFinancialRound(totalExpenses)),
    },
    chartData: Array.from(monthMap.values()).map((v) => ({
      month: v.month,
      sales: params.vatMode ? 0 : v.sales,
      purchases: params.vatMode ? 0 : v.purchases,
      expenses: params.vatMode ? 0 : v.expenses,
    })),
  };
}

async function showroomAnalysis(params: QueryParams): Promise<ReportResult> {
  const dateFilter = buildDateFilter(params.from, params.to);

  // Analyze by godown/showroom
  const soWhere: Record<string, unknown> = { isActive: true, status: { notIn: ['Draft', 'Cancelled'] } };
  if (dateFilter) soWhere.date = dateFilter;

  const salesOrders = await db.salesOrder.findMany({
    where: soWhere,
    include: { lines: { include: { product: { include: { godown: true } } } } },
  });

  const godownMap = new Map<string, { showroom: string; totalOrders: number; totalRevenue: number; totalQty: number }>();
  for (const so of salesOrders) {
    for (const line of so.lines) {
      const godown = line.product?.godown?.name || 'Unassigned';
      const existing = godownMap.get(godown) || { showroom: godown, totalOrders: 0, totalRevenue: 0, totalQty: 0 };
      existing.totalOrders += 1;
      existing.totalQty += line.quantity;
      existing.totalRevenue = safeFinancialAdd(existing.totalRevenue, line.total || safeFinancialRound(line.quantity * line.rate));
      godownMap.set(godown, existing);
    }
  }

  const columns: ColumnDef[] = [
    { key: 'showroom', label: 'Showroom / Godown' },
    { key: 'totalOrders', label: 'Total Orders' },
    { key: 'totalQty', label: 'Qty Sold' },
    { key: 'totalRevenue', label: 'Total Revenue' },
    { key: 'avgOrderValue', label: 'Avg Order Value' },
  ];

  let rows = Array.from(godownMap.values()).map((v) => ({
    showroom: v.showroom,
    totalOrders: v.totalOrders,
    totalQty: v.totalQty,
    totalRevenue: maskVat(v.totalRevenue, params.vatMode),
    avgOrderValue: maskVat(v.totalOrders > 0 ? safeFinancialRound(v.totalRevenue / v.totalOrders) : 0, params.vatMode),
  }));

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  const totalRevenue = Array.from(godownMap.values()).reduce((s, v) => safeFinancialAdd(s, v.totalRevenue), 0);
  const totalOrders = Array.from(godownMap.values()).reduce((s, v) => s + v.totalOrders, 0);

  return {
    title: 'Showroom Analysis Report',
    columns,
    rows,
    summary: {
      totalShowrooms: godownMap.size,
      totalOrders,
      totalRevenue: params.vatMode ? 'N/A (Audit Mode)' : fmt(safeFinancialRound(totalRevenue)),
    },
    chartData: Array.from(godownMap.values()).map((v) => ({
      name: v.showroom,
      revenue: params.vatMode ? 0 : v.totalRevenue,
      orders: v.totalOrders,
    })),
  };
}

async function transferReport(params: QueryParams): Promise<ReportResult> {
  const where: Record<string, unknown> = { isActive: true, type: 'Transfer' };
  if (params.bankId) where.bankId = params.bankId;
  const dateFilter = buildDateFilter(params.from, params.to);
  if (dateFilter) where.date = dateFilter;

  const transfers = await db.bankTransaction.findMany({
    where,
    include: { bank: true, toBank: true },
    orderBy: { date: 'desc' },
  });

  const columns: ColumnDef[] = [
    { key: 'date', label: 'Date' },
    { key: 'transactionCode', label: 'Code' },
    { key: 'fromBank', label: 'From Bank' },
    { key: 'toBank', label: 'To Bank' },
    { key: 'amount', label: 'Amount' },
    { key: 'description', label: 'Description' },
  ];

  let rows = transfers.map((t) => ({
    date: fmtDate(t.date),
    transactionCode: t.transactionCode,
    fromBank: t.bank?.bankName || '',
    toBank: t.toBank?.bankName || '',
    amount: maskVat(t.amount, params.vatMode),
    description: t.description || '',
  }));

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  const totalAmount = transfers.reduce((s, t) => safeFinancialAdd(s, t.amount), 0);

  // Group by from-bank
  const fromBankMap = new Map<string, number>();
  for (const t of transfers) {
    const name = t.bank?.bankName || 'Unknown';
    fromBankMap.set(name, safeFinancialAdd(fromBankMap.get(name) || 0, t.amount));
  }

  return {
    title: 'Transfer Report',
    columns,
    rows,
    summary: {
      totalTransfers: transfers.length,
      totalAmount: params.vatMode ? 'N/A (Audit Mode)' : fmt(safeFinancialRound(totalAmount)),
    },
    chartData: Array.from(fromBankMap.entries()).map(([name, amount]) => ({ name, amount: params.vatMode ? 0 : amount })),
  };
}

async function managementReport(params: QueryParams): Promise<ReportResult> {
  const dateFilter = buildDateFilter(params.from, params.to);

  const soWhere: Record<string, unknown> = { isActive: true, status: 'Confirmed' };
  const poWhere: Record<string, unknown> = { isActive: true, status: 'Confirmed' };
  const expWhere: Record<string, unknown> = { isActive: true };
  const incWhere: Record<string, unknown> = { isActive: true };

  // MIS-002 FIX: Add missing entity filters
  if (params.customerId) soWhere.customerId = params.customerId;
  if (params.supplierId) poWhere.supplierId = params.supplierId;
  if (params.bankId) {
    expWhere.bankId = params.bankId;
    incWhere.bankId = params.bankId;
  }

  if (dateFilter) {
    soWhere.date = dateFilter;
    poWhere.date = dateFilter;
    expWhere.date = dateFilter;
    incWhere.date = dateFilter;
  }

  const [salesOrders, purchaseOrders, expenses, incomes] = await Promise.all([
    db.salesOrder.findMany({ where: soWhere, select: { grandTotal: true, date: true } }),
    db.purchaseOrder.findMany({ where: poWhere, select: { grandTotal: true, date: true } }),
    db.expense.findMany({ where: expWhere, include: { head: true } }),
    db.income.findMany({ where: incWhere, include: { head: true } }),
  ]);

  const revenue = salesOrders.reduce((s, so) => s + so.grandTotal, 0);
  const otherIncome = incomes.reduce((s, i) => s + i.amount, 0);
  const totalRevenue = revenue + otherIncome;
  const cogs = purchaseOrders.reduce((s, po) => s + po.grandTotal, 0);
  const grossProfit = totalRevenue - cogs;
  const operatingExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const netProfit = grossProfit - operatingExpenses;
  const profitMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(2) : '0.00';

  const columns: ColumnDef[] = [
    { key: 'metric', label: 'Metric' },
    { key: 'value', label: 'Value' },
  ];

  const rows: Record<string, unknown>[] = [
    { metric: 'Sales Revenue', value: maskVat(fmt(revenue), params.vatMode) },
    { metric: 'Other Income', value: maskVat(fmt(otherIncome), params.vatMode) },
    { metric: 'Total Revenue', value: maskVat(fmt(totalRevenue), params.vatMode) },
    { metric: 'Cost of Goods Sold', value: maskVat(fmt(cogs), params.vatMode) },
    { metric: 'Gross Profit', value: maskVat(fmt(grossProfit), params.vatMode) },
    { metric: 'Operating Expenses', value: maskVat(fmt(operatingExpenses), params.vatMode) },
    { metric: 'Net Profit', value: maskVat(fmt(netProfit), params.vatMode) },
    { metric: 'Profit Margin', value: maskVat(`${profitMargin}%`, params.vatMode) },
    { metric: 'Total Sales Orders', value: salesOrders.length },
    { metric: 'Total Purchase Orders', value: purchaseOrders.length },
    { metric: 'Total Expenses', value: expenses.length },
    { metric: 'Total Incomes', value: incomes.length },
  ];

  // Monthly breakdown chart
  const monthlyMap = new Map<string, { revenue: number; expenses: number; profit: number }>();
  for (const so of salesOrders) {
    const key = fmtDate(so.date).replace(/\d{2} (\w{3}) (\d{4})/, '$1 $2');
    const existing = monthlyMap.get(key) || { revenue: 0, expenses: 0, profit: 0 };
    existing.revenue += so.grandTotal;
    monthlyMap.set(key, existing);
  }
  for (const e of expenses) {
    const key = fmtDate(e.date).replace(/\d{2} (\w{3}) (\d{4})/, '$1 $2');
    const existing = monthlyMap.get(key) || { revenue: 0, expenses: 0, profit: 0 };
    existing.expenses += e.amount;
    monthlyMap.set(key, existing);
  }
  for (const [key, val] of monthlyMap) {
    val.profit = val.revenue - val.expenses;
  }

  return {
    title: 'Management Report',
    columns,
    rows,
    summary: {
      revenue: maskVat(fmt(totalRevenue), params.vatMode),
      cogs: maskVat(fmt(cogs), params.vatMode),
      grossProfit: maskVat(fmt(grossProfit), params.vatMode),
      operatingExpenses: maskVat(fmt(operatingExpenses), params.vatMode),
      netProfit: maskVat(fmt(netProfit), params.vatMode),
      profitMargin: maskVat(profitMargin, params.vatMode),
    },
    chartData: Array.from(monthlyMap.entries()).map(([month, v]) => ({
      month,
      revenue: params.vatMode ? 0 : v.revenue,
      expenses: params.vatMode ? 0 : v.expenses,
      profit: params.vatMode ? 0 : v.profit,
    })),
  };
}

// ============================================================
// BANK REPORTS
// ============================================================

async function bankTransactionReport(params: QueryParams): Promise<ReportResult> {
  const where: Record<string, unknown> = { isActive: true };
  if (params.bankId) where.bankId = params.bankId;
  const dateFilter = buildDateFilter(params.from, params.to);
  if (dateFilter) where.date = dateFilter;

  const transactions = await db.bankTransaction.findMany({
    where,
    include: { bank: true, toBank: true },
    orderBy: { date: 'asc' },
  });

  const columns: ColumnDef[] = [
    { key: 'date', label: 'Date' },
    { key: 'transactionCode', label: 'Code' },
    { key: 'bank', label: 'Bank' },
    { key: 'type', label: 'Type' },
    { key: 'amount', label: 'Amount' },
    { key: 'runningBalance', label: 'Running Balance' },
    { key: 'toBank', label: 'To Bank' },
    { key: 'description', label: 'Description' },
  ];

  let rows = transactions.map((t) => ({
    date: fmtDate(t.date),
    transactionCode: t.transactionCode,
    bank: t.bank?.bankName || '',
    type: t.type,
    amount: maskVat(t.amount, params.vatMode),
    runningBalance: maskVat(t.runningBalance, params.vatMode),
    toBank: t.toBank?.bankName || '',
    description: t.description || '',
  }));

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  const totalDeposits = transactions.filter((t) => t.type === 'Deposit').reduce((s, t) => s + t.amount, 0);
  const totalWithdrawals = transactions.filter((t) => t.type === 'Withdraw').reduce((s, t) => s + t.amount, 0);
  const totalTransfers = transactions.filter((t) => t.type === 'Transfer').reduce((s, t) => s + t.amount, 0);

  return {
    title: 'Bank Transaction Report',
    columns,
    rows,
    summary: { totalTransactions: transactions.length, totalDeposits: params.vatMode ? 'N/A (Audit Mode)' : fmt(totalDeposits), totalWithdrawals: params.vatMode ? 'N/A (Audit Mode)' : fmt(totalWithdrawals), totalTransfers: params.vatMode ? 'N/A (Audit Mode)' : fmt(totalTransfers) },
    chartData: [
      { name: 'Deposits', amount: params.vatMode ? 0 : totalDeposits },
      { name: 'Withdrawals', amount: params.vatMode ? 0 : totalWithdrawals },
      { name: 'Transfers', amount: params.vatMode ? 0 : totalTransfers },
    ],
  };
}

// C7 FIX: New bankLedgerReport function — previously bank-ledger-report fell through to bankBalanceReport
async function bankLedgerReport(params: QueryParams): Promise<ReportResult> {
  if (!params.bankId) {
    return emptyReport('Bank Ledger', [
      { key: 'date', label: 'Date' },
      { key: 'code', label: 'Code' },
      { key: 'bank', label: 'Bank' },
      { key: 'type', label: 'Type' },
      { key: 'debit', label: 'Debit' },
      { key: 'credit', label: 'Credit' },
      { key: 'runningBalance', label: 'Running Balance' },
      { key: 'toBank', label: 'To Bank' },
      { key: 'description', label: 'Description' },
    ]);
  }

  const bank = await db.bank.findUnique({ where: { id: params.bankId } });
  if (!bank) return emptyReport('Bank Ledger', []);

  const where: Record<string, unknown> = { isActive: true, bankId: params.bankId };
  const dateFilter = buildDateFilter(params.from, params.to);
  if (dateFilter) where.date = dateFilter;

  const transactions = await db.bankTransaction.findMany({
    where,
    include: { bank: true, toBank: true },
    orderBy: { date: 'asc' },
  });

  const columns: ColumnDef[] = [
    { key: 'date', label: 'Date' },
    { key: 'code', label: 'Code' },
    { key: 'bank', label: 'Bank' },
    { key: 'type', label: 'Type' },
    { key: 'debit', label: 'Debit' },
    { key: 'credit', label: 'Credit' },
    { key: 'runningBalance', label: 'Running Balance' },
    { key: 'toBank', label: 'To Bank' },
    { key: 'description', label: 'Description' },
  ];

  // Compute running balance: Deposits = credit, Withdrawals/Transfers = debit
  let running = bank.openingBalance;
  let rows = transactions.map((t) => {
    const isCredit = t.type === 'Deposit';
    const credit = isCredit ? t.amount : 0;
    const debit = !isCredit ? t.amount : 0;
    running = safeFinancialAdd(running, safeFinancialSubtract(credit, debit));
    return {
      date: fmtDate(t.date),
      code: t.transactionCode,
      bank: t.bank?.bankName || bank.bankName,
      type: t.type,
      debit: maskVat(debit, params.vatMode),
      credit: maskVat(credit, params.vatMode),
      runningBalance: maskVat(safeFinancialRound(running), params.vatMode),
      toBank: t.toBank?.bankName || '',
      description: t.description || '',
    };
  });

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  const totalDebit = transactions.filter((t) => t.type !== 'Deposit').reduce((s, t) => s + t.amount, 0);
  const totalCredit = transactions.filter((t) => t.type === 'Deposit').reduce((s, t) => s + t.amount, 0);

  return {
    title: `Bank Ledger — ${bank.bankName}`,
    columns,
    rows,
    summary: {
      bankName: bank.bankName,
      accountNo: bank.accountNo,
      openingBalance: maskVat(bank.openingBalance, params.vatMode),
      totalDebit: maskVat(safeFinancialRound(totalDebit), params.vatMode),
      totalCredit: maskVat(safeFinancialRound(totalCredit), params.vatMode),
      closingBalance: maskVat(safeFinancialRound(bank.openingBalance + totalCredit - totalDebit), params.vatMode),
    },
    chartData: transactions.slice(0, 50).map((t) => ({
      date: fmtDate(t.date),
      credit: t.type === 'Deposit' ? t.amount : 0,
      debit: t.type !== 'Deposit' ? t.amount : 0,
    })),
  };
}

async function bankBalanceReport(params: QueryParams): Promise<ReportResult> {
  const where: Record<string, unknown> = { isActive: true };
  if (params.bankId) where.id = params.bankId;
  const dateFilter = buildDateFilter(params.from, params.to);

  // H10 FIX: Build bank transaction where clause with date filter
  const btWhere: Record<string, unknown> = { isActive: true };
  if (dateFilter) btWhere.date = dateFilter;

  const banks = await db.bank.findMany({
    where,
    include: {
      bankTransactions: { where: btWhere },
      expenses: { where: { isActive: true } },
      incomes: { where: { isActive: true } },
      cashCollections: { where: { isActive: true } },
      cashDeliveries: { where: { isActive: true } },
    },
  });

  const columns: ColumnDef[] = [
    { key: 'bankName', label: 'Bank' },
    { key: 'accountNo', label: 'Account No' },
    { key: 'openingBalance', label: 'Opening Balance' },
    { key: 'deposits', label: 'Deposits' },
    { key: 'withdrawals', label: 'Withdrawals' },
    { key: 'currentBalance', label: 'Current Balance' },
  ];

  let rows = banks.map((b) => {
    const deposits = b.bankTransactions.filter((t) => t.type === 'Deposit').reduce((s, t) => s + t.amount, 0);
    const withdrawals = b.bankTransactions.filter((t) => t.type === 'Withdraw').reduce((s, t) => s + t.amount, 0);
    return {
      bankName: b.bankName,
      accountNo: b.accountNo,
      openingBalance: maskVat(b.openingBalance, params.vatMode),
      deposits: maskVat(deposits, params.vatMode),
      withdrawals: maskVat(withdrawals, params.vatMode),
      currentBalance: maskVat(b.currentBalance, params.vatMode),
    };
  });

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  return {
    title: 'Bank Balance Report',
    columns,
    rows,
    summary: {
      totalBanks: banks.length,
      totalOpening: params.vatMode ? 'N/A (Audit Mode)' : fmt(banks.reduce((s, b) => s + b.openingBalance, 0)),
      totalCurrent: params.vatMode ? 'N/A (Audit Mode)' : fmt(banks.reduce((s, b) => s + b.currentBalance, 0)),
    },
    chartData: banks.map((b) => ({ name: String(b.bankName), opening: params.vatMode ? 0 : b.openingBalance, current: params.vatMode ? 0 : b.currentBalance })),
  };
}

// ============================================================
// ADVANCE SEARCH
// ============================================================

async function advanceSearch(params: QueryParams): Promise<ReportResult> {
  const keyword = params.keyword || '';
  if (!keyword.trim()) {
    return emptyReport('Advance Search', [
      { key: 'type', label: 'Type' },
      { key: 'code', label: 'Code' },
      { key: 'name', label: 'Name' },
      { key: 'details', label: 'Details' },
    ]);
  }

  // SQLite is case-insensitive by default for ASCII; mode:'insensitive' crashes SQLite
  const containsFilter = { contains: keyword };
  const dateFilter = buildDateFilter(params.from, params.to);

  const [products, customers, suppliers, salesOrders, purchaseOrders] = await Promise.all([
    db.product.findMany({
      where: { isActive: true, OR: [{ name: containsFilter }, { productCode: containsFilter }] },
      include: { category: true, company: true },
      take: 20,
    }),
    db.customer.findMany({
      where: { isActive: true, OR: [{ name: containsFilter }, { customerCode: containsFilter }, { phone: containsFilter }] },
      take: 20,
    }),
    db.supplier.findMany({
      where: { isActive: true, OR: [{ name: containsFilter }, { supplierCode: containsFilter }, { phone: containsFilter }] },
      take: 20,
    }),
    db.salesOrder.findMany({
      where: {
        isActive: true,
        OR: [{ invoiceNo: containsFilter }],
        ...(dateFilter ? { date: dateFilter } : {}),
      },
      include: { customer: true },
      take: 20,
    }),
    db.purchaseOrder.findMany({
      where: {
        isActive: true,
        OR: [{ poNumber: containsFilter }],
        ...(dateFilter ? { date: dateFilter } : {}),
      },
      include: { supplier: true },
      take: 20,
    }),
  ]);

  const columns: ColumnDef[] = [
    { key: 'type', label: 'Type' },
    { key: 'code', label: 'Code' },
    { key: 'name', label: 'Name' },
    { key: 'details', label: 'Details' },
  ];

  const rows: Record<string, unknown>[] = [];

  for (const p of products) {
    rows.push({
      type: 'Product',
      code: p.productCode,
      name: p.name,
      details: `Category: ${p.category?.name || 'N/A'}, Company: ${p.company?.name || 'N/A'}`,
      // MIS-001 FIX: Mask cost prices in VAT mode
      costPrice: maskVat(p.costPrice, params.vatMode),
    });
  }
  for (const c of customers) {
    rows.push({ type: 'Customer', code: c.customerCode, name: c.name, details: `Phone: ${c.phone || 'N/A'}, Address: ${c.address || 'N/A'}` });
  }
  for (const s of suppliers) {
    rows.push({ type: 'Supplier', code: s.supplierCode, name: s.name, details: `Phone: ${s.phone || 'N/A'}, Address: ${s.address || 'N/A'}` });
  }
  for (const so of salesOrders) {
    rows.push({ type: 'Sales Order', code: so.invoiceNo, name: so.customer?.name || '', details: `Total: ${so.grandTotal}, Status: ${so.status}` });
  }
  for (const po of purchaseOrders) {
    rows.push({ type: 'Purchase Order', code: po.poNumber, name: po.supplier?.name || '', details: `Total: ${po.grandTotal}, Status: ${po.status}` });
  }

  return {
    title: `Advance Search: "${keyword}"`,
    columns,
    rows,
    summary: { totalResults: rows.length, products: products.length, customers: customers.length, suppliers: suppliers.length, salesOrders: salesOrders.length, purchaseOrders: purchaseOrders.length },
    chartData: [
      { name: 'Products', count: products.length },
      { name: 'Customers', count: customers.length },
      { name: 'Suppliers', count: suppliers.length },
      { name: 'Sales Orders', count: salesOrders.length },
      { name: 'Purchase Orders', count: purchaseOrders.length },
    ],
  };
}

// ============================================================
// MAIN ROUTE HANDLER
// ============================================================

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'MISReports', 'GET');
  if (!security.authorized) return security.response;

  // MIS-005 FIX: RBAC — SR and Dealer roles cannot access MIS Reports
  const userRole = security.user.role as UserRole;
  if (userRole === 'sr' || userRole === 'dealer') {
    return NextResponse.json(
      { error: 'Access denied. MIS Reports are not available for your role.' },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);

  // MIS-006 FIX: XSS prevention — strip HTML from all user-provided text params
  const reportType = stripHtml(searchParams.get('type') || '');
  const rawSubtype = stripHtml(searchParams.get('subtype') || '');
  const rawKeyword = searchParams.get('keyword');
  const keyword = rawKeyword ? stripHtml(rawKeyword) : null;
  const rawSortField = searchParams.get('sortField');
  const sortField = rawSortField ? stripHtml(rawSortField) : null;
  const rawGroupBy = searchParams.get('groupBy');
  const groupBy = rawGroupBy ? stripHtml(rawGroupBy) : null;

  // VAT-001: Validate vatMode — only vat_auditor role can activate masking
  const rawVatMode = searchParams.get('vatMode') === 'true';
  const effectiveVatMode = validateVatMode(rawVatMode, userRole);

  // MIS-002: Map entityId to the correct filter based on report type/category
  const entityId = searchParams.get('entityId');
  let mappedSupplierId = searchParams.get('supplierId');
  let mappedCustomerId = searchParams.get('customerId');
  let mappedEmployeeId = searchParams.get('employeeId');
  let mappedBankId = searchParams.get('bankId');
  let mappedCategoryId = searchParams.get('categoryId');
  let mappedCompanyId = searchParams.get('companyId');
  let mappedProductId = searchParams.get('productId');
  let mappedGodownId = searchParams.get('godownId');

  // If entityId is provided, map it to the appropriate filter based on report category
  if (entityId && entityId !== 'all') {
    switch (reportType) {
      case 'purchase':
        if (!mappedSupplierId) mappedSupplierId = entityId;
        break;
      case 'sales':
      case 'hire-sales':
      case 'customer-wise':
        if (!mappedCustomerId) mappedCustomerId = entityId;
        break;
      case 'sr':
        if (!mappedEmployeeId) mappedEmployeeId = entityId;
        break;
      case 'bank':
        if (!mappedBankId) mappedBankId = entityId;
        break;
      case 'basic':
        // For basic, entityId could be categoryId, companyId, or godownId
        // Default to categoryId as that's most common for basic reports
        if (!mappedCategoryId) mappedCategoryId = entityId;
        break;
    }
  }

  try {
    const params: QueryParams = {
      type: reportType,
      subtype: rawSubtype,
      from: searchParams.get('from'),
      to: searchParams.get('to'),
      sortField,
      sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || 'asc',
      groupBy,
      supplierId: mappedSupplierId,
      customerId: mappedCustomerId,
      employeeId: mappedEmployeeId,
      bankId: mappedBankId,
      categoryId: mappedCategoryId,
      companyId: mappedCompanyId,
      productId: mappedProductId,
      godownId: mappedGodownId,
      vatMode: effectiveVatMode,
      keyword,
    };

    let result: ReportResult;

    switch (`${params.type}:${params.subtype}`) {
      // Basic Reports
      case 'basic:employee-information':
        result = await employeeInformation(params);
        break;
      case 'basic:product-information':
        result = await productInformation(params);
        break;
      case 'basic:stock-details':
        result = await stockDetails(params);
        break;
      case 'basic:stock-summary':
        result = await stockSummary(params);
        break;
      case 'basic:stock-ledger':
        result = await stockLedger(params);
        break;
      case 'basic:stock-qty':
        result = await stockQty(params);
        break;
      case 'basic:stock-forecast-product':
        result = await stockForecastProduct(params);
        break;
      case 'basic:stock-forecast-concern':
        result = await stockForecastConcern(params);
        break;
      case 'basic:stock-trends':
        result = await stockTrends(params);
        break;
      case 'basic:supplier-status':
        result = await supplierStatus(params);
        break;
      case 'basic:sales-performance':
        result = await salesPerformance(params);
        break;
      case 'basic:employee-records':
        result = await employeeRecords(params);
        break;

      // Purchase Reports
      case 'purchase:supplier-ledger':
        result = await supplierLedger(params);
        break;
      case 'purchase:daily-purchase':
        result = await dailyPurchase(params);
        break;
      case 'purchase:supplier-wise-purchase':
        result = await supplierWisePurchase(params);
        break;
      case 'purchase:supplier-cash-delivery':
        result = await supplierCashDelivery(params);
        break;
      case 'purchase:supplier-due':
        result = await supplierDue(params);
        break;
      case 'purchase:model-wise-purchase':
        result = await modelWisePurchase(params);
        break;
      case 'purchase:vat-report':
        result = await vatReport(params);
        break;

      // Sales Reports
      case 'sales:daily-sales':
        result = await dailySales(params);
        break;
      case 'sales:replacement-report':
        result = await replacementReport(params);
        break;
      case 'sales:model-wise-sales':
        result = await modelWiseSales(params);
        break;

      // Hire Sales Reports
      case 'hire-sales:installment-collection':
        result = await installmentCollection(params);
        break;
      case 'hire-sales:upcoming-installment':
        result = await upcomingInstallment(params);
        break;
      case 'hire-sales:defaulting-customer':
        result = await defaultingCustomer(params);
        break;
      case 'hire-sales:default-customer-summary':
        result = await defaultCustomerSummary(params);
        break;
      case 'hire-sales:hire-account-details':
        result = await hireAccountDetails(params);
        break;

      // SR Reports
      case 'sr:sr-wise-sales':
        result = await srWiseSales(params);
        break;
      case 'sr:sr-wise-sales-details':
        result = await srWiseSalesDetails(params);
        break;
      case 'sr:sr-wise-customer-due':
        result = await srWiseCustomerDue(params);
        break;
      case 'sr:sr-wise-customer-summary':
        result = await srWiseCustomerSummary(params);
        break;
      case 'sr:sr-visit-report':
        result = await srVisitReport(params);
        break;
      case 'sr:sr-wise-customer-status':
        result = await srWiseCustomerStatus(params);
        break;
      case 'sr:sr-wise-cash-collection':
        result = await srWiseCashCollection(params);
        break;
      case 'sr:sr-commission-report':
        result = await srCommissionReport(params);
        break;

      // Customer Wise Reports
      case 'customer-wise:customer-wise-sales':
        result = await customerWiseSales(params);
        break;
      case 'customer-wise:category-wise-customer-due':
        result = await categoryWiseCustomerDue(params);
        break;
      case 'customer-wise:customer-ledger':
        result = await customerLedger(params);
        break;
      case 'customer-wise:customer-due-report':
        result = await customerDueReport(params);
        break;
      case 'customer-wise:customer-cash-collection':
        result = await customerCashCollection(params);
        break;
      case 'customer-wise:customer-ledger-summary':
        result = await customerLedgerSummary(params);
        break;

      // Management Reports
      case 'management:expense-report':
        result = await expenseReport(params);
        break;
      case 'management:product-wise-benefit':
        result = await productWiseBenefit(params);
        break;
      case 'management:income-report':
        result = await incomeReport(params);
        break;
      case 'management:adjustment-report':
        result = await adjustmentReport(params);
        break;
      case 'management:transaction-summary':
        result = await transactionSummary(params);
        break;
      case 'management:monthly-transaction':
        result = await monthlyTransaction(params);
        break;
      case 'management:showroom-analysis':
        result = await showroomAnalysis(params);
        break;
      case 'management:management-report':
        result = await managementReport(params);
        break;

      // Bank Reports
      case 'bank:bank-transaction-report':
        result = await bankTransactionReport(params);
        break;
      case 'bank:bank-ledger-report':
        result = await bankLedgerReport(params);
        break;
      case 'bank:bank-balance-report':
        result = await bankBalanceReport(params);
        break;
      case 'bank:transfer-report':
        result = await transferReport(params);
        break;

      // Advance Search
      case 'advance-search:':
      case 'advance-search:advance-search':
        result = await advanceSearch(params);
        break;

      default:
        return NextResponse.json(
          {
            error: `Unknown report type/subtype: ${params.type}/${params.subtype}`,
            availableTypes: [
              'basic:employee-information', 'basic:product-information', 'basic:stock-details', 'basic:stock-summary',
              'basic:stock-ledger', 'basic:stock-qty', 'basic:stock-forecast-product', 'basic:stock-forecast-concern',
              'basic:stock-trends', 'basic:supplier-status', 'basic:sales-performance', 'basic:employee-records',
              'purchase:supplier-ledger', 'purchase:daily-purchase', 'purchase:supplier-wise-purchase',
              'purchase:supplier-cash-delivery', 'purchase:supplier-due', 'purchase:model-wise-purchase', 'purchase:vat-report',
              'sales:daily-sales', 'sales:replacement-report', 'sales:model-wise-sales',
              'hire-sales:installment-collection', 'hire-sales:upcoming-installment',
              'hire-sales:defaulting-customer', 'hire-sales:default-customer-summary', 'hire-sales:hire-account-details',
              'sr:sr-wise-sales', 'sr:sr-wise-sales-details', 'sr:sr-wise-customer-due',
              'sr:sr-wise-customer-summary', 'sr:sr-visit-report', 'sr:sr-wise-customer-status',
              'sr:sr-wise-cash-collection', 'sr:sr-commission-report',
              'customer-wise:customer-wise-sales', 'customer-wise:category-wise-customer-due',
              'customer-wise:customer-ledger', 'customer-wise:customer-due-report',
              'customer-wise:customer-cash-collection', 'customer-wise:customer-ledger-summary',
              'management:expense-report', 'management:product-wise-benefit', 'management:income-report',
              'management:adjustment-report', 'management:transaction-summary', 'management:monthly-transaction',
              'management:showroom-analysis', 'management:management-report',
              'bank:bank-transaction-report', 'bank:bank-ledger-report', 'bank:bank-balance-report', 'bank:transfer-report',
              'advance-search',
            ],
          },
          { status: 400 }
        );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error generating MIS report:', error);
    return NextResponse.json(
      { error: 'Failed to generate MIS report', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
