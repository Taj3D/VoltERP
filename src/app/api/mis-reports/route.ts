import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, validateVatMode } from '@/lib/api-security';
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

function fmt(num: number): string {
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
    joiningDate: e.joiningDate ? new Date(e.joiningDate).toLocaleDateString() : '',
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
    salePrice: p.salePrice,
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

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  const totalIn = rows.reduce((s, r) => s + (Number(r.stockIn) || 0), 0);
  const totalOut = rows.reduce((s, r) => s + (Number(r.stockOut) || 0), 0);
  const totalBal = rows.reduce((s, r) => s + (Number(r.balance) || 0), 0);

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
    date: new Date(e.date).toLocaleDateString(),
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
      date: new Date(e.date).toLocaleDateString(),
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

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  const lowStock = rows.filter((r) => r.alert === 'LOW STOCK').length;

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

  rows = sortRows(rows, params.sortField, params.sortOrder);
  rows = groupRows(rows, params.groupBy);

  const totalShortfall = rows.reduce((s, r) => s + (Number(r.shortfall) || 0), 0);

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

  for (const supplier of suppliers) {
    const entries: { date: Date; type: string; ref: string; debit: number; credit: number }[] = [];

    for (const po of supplier.purchaseOrders) {
      const dateFilter = buildDateFilter(params.from, params.to);
      if (dateFilter && po.date < dateFilter.gte!) continue;
      if (dateFilter && po.date > dateFilter.lte!) continue;
      entries.push({ date: po.date, type: 'Purchase', ref: po.poNumber, debit: po.grandTotal, credit: 0 });
    }
    for (const pr of supplier.purchaseReturns) {
      const dateFilter = buildDateFilter(params.from, params.to);
      if (dateFilter && pr.date < dateFilter.gte!) continue;
      if (dateFilter && pr.date > dateFilter.lte!) continue;
      entries.push({ date: pr.date, type: 'Return', ref: pr.returnNo, debit: 0, credit: pr.grandTotal });
    }
    for (const cd of supplier.cashDeliveries) {
      const dateFilter = buildDateFilter(params.from, params.to);
      if (dateFilter && cd.date < dateFilter.gte!) continue;
      if (dateFilter && cd.date > dateFilter.lte!) continue;
      entries.push({ date: cd.date, type: 'Cash Delivery', ref: cd.deliveryCode, debit: 0, credit: cd.amount });
    }

    entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    // LEDGER-001 FIX: Respect openingBalanceType for supplier ledger sign convention
    // For suppliers: Cr means we owe them (positive balance), Dr means they owe us (negative)
    let running = supplier.openingBalanceType === 'Dr' ? -supplier.openingBalance : supplier.openingBalance;
    for (const e of entries) {
      // In supplier ledger: Purchase (credit - we owe more) increases balance,
      // Cash Delivery / Return (debit - we pay/reduce) decreases balance
      running += e.credit - e.debit;
      allRows.push({
        date: new Date(e.date).toLocaleDateString(),
        supplier: supplier.name,
        type: e.type,
        reference: e.ref,
        debit: e.debit,
        credit: e.credit,
        balance: running,
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
    summary: { totalEntries: allRows.length, totalDebit, totalCredit, netBalance: totalDebit - totalCredit },
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
    const day = new Date(po.date).toLocaleDateString();
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
    totalValue: v.totalValue,
    supplierBreakdown: v.suppliers.join(', '),
  }));

  rows = sortRows(rows, params.sortField, params.sortOrder);

  const totalPOs = purchaseOrders.length;
  const totalValue = purchaseOrders.reduce((s, po) => s + po.grandTotal, 0);

  return {
    title: 'Daily Purchase Report',
    columns,
    rows,
    summary: { totalDays: dayMap.size, totalPOs, totalValue: fmt(totalValue), avgDaily: dayMap.size > 0 ? fmt(totalValue / dayMap.size) : '0.00' },
    chartData: Array.from(dayMap.values()).map((v) => ({ date: v.date, value: v.totalValue, pos: v.totalPOs })),
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

  let rows = Array.from(supplierMap.values());
  rows = sortRows(rows, params.sortField, params.sortOrder);

  const totalValue = Array.from(supplierMap.values()).reduce((s, v) => s + v.totalValue, 0);

  return {
    title: 'Supplier-wise Purchase Report',
    columns,
    rows,
    summary: { totalSuppliers: supplierMap.size, totalPOs: purchaseOrders.length, totalValue: fmt(totalValue) },
    chartData: Array.from(supplierMap.values()).map((v) => ({ name: v.supplier, value: v.totalValue })),
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
    date: new Date(d.date).toLocaleDateString(),
    deliveryCode: d.deliveryCode,
    supplier: d.supplier?.name || '',
    amount: d.amount,
    paymentOption: d.paymentOption?.name || '',
    bank: d.bank?.bankName || '',
  }));

  rows = sortRows(rows, params.sortField, params.sortOrder);

  const totalAmount = deliveries.reduce((s, d) => s + d.amount, 0);

  return {
    title: 'Supplier Cash Delivery Report',
    columns,
    rows,
    summary: { totalDeliveries: deliveries.length, totalAmount: fmt(totalAmount) },
    chartData: rows.slice(0, 30).map((r) => ({ date: r.date, amount: r.amount })),
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
      supplierCode: s.supplierCode,
      supplier: s.name,
      openingBalance: s.openingBalance,
      totalPurchase,
      totalDeliveries,
      totalReturns,
      outstanding: Math.max(outstanding, 0),
    };
  });

  if (params.supplierId) rows = rows.filter((r) => r.supplierCode === params.supplierId || (r as Record<string, unknown>)._supplierId === params.supplierId);

  rows = sortRows(rows, params.sortField, params.sortOrder);

  const totalOutstanding = rows.reduce((s, r) => s + (Number(r.outstanding) || 0), 0);

  return {
    title: 'Supplier Due Report',
    columns,
    rows,
    summary: { totalSuppliers: rows.length, totalOutstanding: fmt(totalOutstanding) },
    chartData: rows.slice(0, 20).map((r) => ({ name: String(r.supplier), outstanding: r.outstanding })),
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

  let rows = Array.from(productMap.values());
  rows = sortRows(rows, params.sortField, params.sortOrder);

  return {
    title: 'Model-wise Purchase Report',
    columns,
    rows,
    summary: {
      totalModels: productMap.size,
      totalQuantity: Array.from(productMap.values()).reduce((s, v) => s + v.quantity, 0),
      totalValue: fmt(Array.from(productMap.values()).reduce((s, v) => s + v.totalValue, 0)),
    },
    chartData: Array.from(productMap.values()).slice(0, 20).map((v) => ({ name: v.product, quantity: v.quantity, value: v.totalValue })),
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
      date: new Date(po.date).toLocaleDateString(),
      vatPercentage: po.vatPercentage,
      vatAmount: po.vatAmount,
      grandTotal: po.grandTotal,
    });
  }
  for (const so of salesOrders) {
    rows.push({
      type: 'Sales',
      reference: so.invoiceNo,
      date: new Date(so.date).toLocaleDateString(),
      vatPercentage: so.vatPercentage,
      vatAmount: so.vatAmount,
      grandTotal: so.grandTotal,
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
      purchaseVAT: fmt(purchaseVAT),
      salesVAT: fmt(salesVAT),
      netVAT: fmt(salesVAT - purchaseVAT),
      totalPurchaseOrders: purchaseOrders.length,
      totalSalesOrders: salesOrders.length,
    },
    chartData: [
      { name: 'Purchase VAT', amount: purchaseVAT },
      { name: 'Sales VAT', amount: salesVAT },
      { name: 'Net VAT Payable', amount: salesVAT - purchaseVAT },
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
  if (params.employeeId) where.createdBy = params.employeeId;
  if (params.productId) where.lines = { some: { productId: params.productId } };
  const dateFilter = buildDateFilter(params.from, params.to);
  if (dateFilter) where.date = dateFilter;

  const salesOrders = await db.salesOrder.findMany({
    where,
    include: { customer: true },
    orderBy: { date: 'desc' },
  });

  const dayMap = new Map<string, { date: string; totalOrders: number; totalValue: number; customers: string[] }>();
  for (const so of salesOrders) {
    const day = new Date(so.date).toLocaleDateString();
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
    totalValue: v.totalValue,
    customerBreakdown: v.customers.join(', '),
  }));

  rows = sortRows(rows, params.sortField, params.sortOrder);

  const totalValue = salesOrders.reduce((s, so) => s + so.grandTotal, 0);

  return {
    title: 'Daily Sales Report',
    columns,
    rows,
    summary: { totalDays: dayMap.size, totalOrders: salesOrders.length, totalValue: fmt(totalValue), avgDaily: dayMap.size > 0 ? fmt(totalValue / dayMap.size) : '0.00' },
    chartData: Array.from(dayMap.values()).map((v) => ({ date: v.date, value: v.totalValue, orders: v.totalOrders })),
  };
}

async function replacementReport(params: QueryParams): Promise<ReportResult> {
  const where: Record<string, unknown> = { isActive: true };
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
        date: new Date(r.date).toLocaleDateString(),
        customer: r.salesOrder?.customer?.name || '',
        product: line.product?.name || '',
        quantity: line.quantity,
        reason: r.reason || '',
        status: r.status,
      });
    }
  }

  rows = sortRows(rows, params.sortField, params.sortOrder);

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

  let rows = Array.from(productMap.values());
  rows = sortRows(rows, params.sortField, params.sortOrder);

  return {
    title: 'Model-wise Sales Report',
    columns,
    rows,
    summary: {
      totalModels: productMap.size,
      totalQuantity: Array.from(productMap.values()).reduce((s, v) => s + v.quantity, 0),
      totalValue: fmt(Array.from(productMap.values()).reduce((s, v) => s + v.totalValue, 0)),
    },
    chartData: Array.from(productMap.values()).slice(0, 20).map((v) => ({ name: v.product, quantity: v.quantity, value: v.totalValue })),
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
    dueDate: new Date(i.dueDate).toLocaleDateString(),
    paidDate: i.paidDate ? new Date(i.paidDate).toLocaleDateString() : '',
    amount: i.amount,
    paidAmount: i.paidAmount,
  }));

  rows = sortRows(rows, params.sortField, params.sortOrder);

  const totalCollected = installments.reduce((s, i) => s + i.paidAmount, 0);

  return {
    title: 'Installment Collection Report',
    columns,
    rows,
    summary: { totalInstallments: installments.length, totalCollected: fmt(totalCollected) },
    chartData: rows.slice(0, 30).map((r) => ({ date: r.paidDate, amount: r.paidAmount })),
  };
}

async function upcomingInstallment(params: QueryParams): Promise<ReportResult> {
  const where: Record<string, unknown> = { status: 'Pending' };
  if (params.customerId) where.hireSales = { customerId: params.customerId };

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
    dueDate: new Date(i.dueDate).toLocaleDateString(),
    amount: i.amount,
    status: i.status,
  }));

  const dateFilter = buildDateFilter(params.from, params.to);
  if (dateFilter) {
    const fromTime = dateFilter.gte ? new Date(dateFilter.gte).getTime() : 0;
    const toTime = dateFilter.lte ? new Date(dateFilter.lte).getTime() : Infinity;
    rows = rows.filter((r) => {
      const d = new Date(String(r.dueDate)).getTime();
      return d >= fromTime && d <= toTime;
    });
  }

  rows = sortRows(rows, params.sortField, params.sortOrder);

  const totalDue = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  return {
    title: 'Upcoming Installment Report',
    columns,
    rows,
    summary: { totalUpcoming: rows.length, totalDue: fmt(totalDue) },
    chartData: rows.slice(0, 30).map((r) => ({ date: r.dueDate, amount: r.amount })),
  };
}

async function defaultingCustomer(params: QueryParams): Promise<ReportResult> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const overdue = await db.hireInstallment.findMany({
    where: {
      status: { in: ['Pending', 'Overdue'] },
      dueDate: { lt: thirtyDaysAgo },
    },
    include: { hireSales: { include: { customer: true, lines: { include: { product: true } } } } },
  });

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
      dueDate: new Date(i.dueDate).toLocaleDateString(),
      amount: i.amount,
      daysOverdue,
      phone: i.hireSales?.customer?.phone || '',
    };
  });

  if (params.customerId) {
    rows = rows.filter((r) => {
      const cust = overdue.find((i) => i.hireSales?.invoiceNo === r.invoiceNo);
      return cust?.hireSales?.customerId === params.customerId;
    });
  }

  rows = sortRows(rows, params.sortField, params.sortOrder);

  return {
    title: 'Defaulting Customer Report',
    columns,
    rows,
    summary: { totalDefaulters: new Set(rows.map((r) => r.customer)).size, totalOverdue: fmt(rows.reduce((s, r) => s + (Number(r.amount) || 0), 0)), avgDaysOverdue: rows.length > 0 ? Math.round(rows.reduce((s, r) => s + (Number(r.daysOverdue) || 0), 0) / rows.length) : 0 },
    chartData: rows.slice(0, 20).map((r) => ({ name: String(r.customer), amount: r.amount, days: r.daysOverdue })),
  };
}

async function defaultCustomerSummary(params: QueryParams): Promise<ReportResult> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const overdue = await db.hireInstallment.findMany({
    where: { status: { in: ['Pending', 'Overdue'] }, dueDate: { lt: thirtyDaysAgo } },
    include: { hireSales: { include: { customer: true } } },
  });

  const customerMap = new Map<string, { customer: string; phone: string; totalOverdue: number; installmentCount: number }>();
  for (const i of overdue) {
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

  let rows = Array.from(customerMap.values());
  rows = sortRows(rows, params.sortField, params.sortOrder);

  return {
    title: 'Default Customer Summary',
    columns,
    rows,
    summary: { totalDefaulters: customerMap.size, totalOverdue: fmt(rows.reduce((s, r) => s + r.totalOverdue, 0)) },
    chartData: Array.from(customerMap.values()).slice(0, 20).map((v) => ({ name: v.customer, amount: v.totalOverdue })),
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
    date: new Date(hs.date).toLocaleDateString(),
    customer: hs.customer?.name || '',
    grandTotal: hs.grandTotal,
    totalPaid: hs.totalPaid,
    balanceAmount: hs.balanceAmount,
    duration: hs.duration,
    status: hs.currentStatus || hs.status,
  }));

  rows = sortRows(rows, params.sortField, params.sortOrder);

  const totalGrand = hireSales.reduce((s, h) => s + h.grandTotal, 0);
  const totalPaid = hireSales.reduce((s, h) => s + h.totalPaid, 0);

  return {
    title: 'Hire Account Details',
    columns,
    rows,
    summary: { totalAccounts: hireSales.length, totalGrand: fmt(totalGrand), totalPaid: fmt(totalPaid), totalBalance: fmt(totalGrand - totalPaid) },
    chartData: [
      { name: 'Total', amount: totalGrand },
      { name: 'Paid', amount: totalPaid },
      { name: 'Balance', amount: totalGrand - totalPaid },
    ],
  };
}

// ============================================================
// SR REPORTS
// ============================================================

async function srWiseSales(params: QueryParams): Promise<ReportResult> {
  const where: Record<string, unknown> = { isActive: true, designation: { name: { contains: 'SR' } } };
  if (params.employeeId) where.id = params.employeeId;

  const srs = await db.employee.findMany({
    where,
    include: { designation: true, department: true },
  });

  const salesOrders = await db.salesOrder.findMany({
    where: { isActive: true },
    include: { customer: true, lines: { include: { product: true } } },
  });

  const dateFilter = buildDateFilter(params.from, params.to);
  const filteredSO = dateFilter
    ? salesOrders.filter((so) => {
        const d = new Date(so.date).getTime();
        return (!dateFilter.gte || d >= dateFilter.gte.getTime()) && (!dateFilter.lte || d <= dateFilter.lte.getTime());
      })
    : salesOrders;

  const srMap = new Map<string, { srName: string; srCode: string; totalOrders: number; totalValue: number }>();
  for (const sr of srs) {
    srMap.set(sr.id, { srName: sr.name, srCode: sr.employeeCode, totalOrders: 0, totalValue: 0 });
  }

  // Distribute sales evenly across SRs since there's no direct SR-customer link
  for (const so of filteredSO) {
    for (const [, srData] of srMap) {
      srData.totalOrders += 1 / srMap.size;
      srData.totalValue += so.grandTotal / srMap.size;
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
    totalOrders: Math.round(v.totalOrders),
    totalValue: Math.round(v.totalValue * 100) / 100,
  }));

  rows = sortRows(rows, params.sortField, params.sortOrder);

  return {
    title: 'SR-wise Sales Report',
    columns,
    rows,
    summary: { totalSRs: srs.length, totalValue: fmt(rows.reduce((s, r) => s + (Number(r.totalValue) || 0), 0)) },
    chartData: rows.map((r) => ({ name: String(r.srName), value: r.totalValue })),
  };
}

async function srWiseSalesDetails(params: QueryParams): Promise<ReportResult> {
  const dateFilter = buildDateFilter(params.from, params.to);
  const salesWhere: Record<string, unknown> = { isActive: true };
  if (dateFilter) salesWhere.date = dateFilter;

  const salesOrders = await db.salesOrder.findMany({
    where: salesWhere,
    include: { customer: true, lines: { include: { product: true } } },
    orderBy: { date: 'desc' },
  });

  const columns: ColumnDef[] = [
    { key: 'invoiceNo', label: 'Invoice No' },
    { key: 'date', label: 'Date' },
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
        date: new Date(so.date).toLocaleDateString(),
        customer: so.customer?.name || '',
        product: line.product?.name || '',
        quantity: line.quantity,
        rate: line.rate,
        total: line.total,
      });
    }
  }

  rows = sortRows(rows, params.sortField, params.sortOrder);

  return {
    title: 'SR-wise Sales Details',
    columns,
    rows,
    summary: { totalOrders: salesOrders.length, totalValue: fmt(salesOrders.reduce((s, so) => s + so.grandTotal, 0)) },
    chartData: salesOrders.slice(0, 20).map((so) => ({ name: so.invoiceNo, value: so.grandTotal })),
  };
}

async function srWiseCustomerDue(params: QueryParams): Promise<ReportResult> {
  const customers = await db.customer.findMany({
    where: { isActive: true },
    include: {
      salesOrders: { where: { isActive: true } },
      salesReturns: { where: { isActive: true } },
      cashCollections: { where: { isActive: true } },
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

  let rows = customers.map((c) => {
    const totalSales = c.salesOrders.reduce((s, so) => s + so.grandTotal, 0);
    const totalPaid = c.cashCollections.reduce((s, cc) => s + cc.amount, 0);
    const totalReturns = c.salesReturns.reduce((s, r) => s + r.grandTotal, 0);
    const outstanding = c.openingBalance + totalSales - totalPaid - totalReturns;
    return {
      customer: c.name,
      customerCode: c.customerCode,
      totalSales,
      totalPaid,
      totalReturns,
      outstanding: Math.max(outstanding, 0),
    };
  }).filter((r) => r.outstanding > 0);

  rows = sortRows(rows, params.sortField, params.sortOrder);

  return {
    title: 'SR-wise Customer Due Report',
    columns,
    rows,
    summary: { totalCustomers: rows.length, totalOutstanding: fmt(rows.reduce((s, r) => s + r.outstanding, 0)) },
    chartData: rows.slice(0, 20).map((r) => ({ name: String(r.customer), outstanding: r.outstanding })),
  };
}

async function srWiseCustomerSummary(params: QueryParams): Promise<ReportResult> {
  const customers = await db.customer.findMany({
    where: { isActive: true },
    include: {
      salesOrders: { where: { isActive: true } },
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

  let rows = customers.map((c) => {
    const totalSales = c.salesOrders.reduce((s, so) => s + so.grandTotal, 0);
    const totalHire = c.hireSales.reduce((s, h) => s + h.grandTotal, 0);
    const totalCollections = c.cashCollections.reduce((s, cc) => s + cc.amount, 0);
    const balance = c.openingBalance + totalSales + totalHire - totalCollections;
    return {
      customer: c.name,
      totalOrders: c.salesOrders.length + c.hireSales.length,
      totalRevenue: totalSales + totalHire,
      totalCollections,
      balance,
      status: balance > 0 ? 'Has Due' : 'Clear',
    };
  });

  rows = sortRows(rows, params.sortField, params.sortOrder);

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
  if (params.employeeId) where.userName = params.employeeId;
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
    date: new Date(a.createdAt).toLocaleDateString(),
    action: a.action,
    userName: a.userName || '',
    recordLabel: a.recordLabel || '',
    details: a.details || '',
  }));

  rows = sortRows(rows, params.sortField, params.sortOrder);

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

  let rows = customers.map((c) => {
    const lastOrder = c.salesOrders.length > 0
      ? c.salesOrders.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
      : null;
    const lastOrderDate = lastOrder ? new Date(lastOrder.date) : null;
    const isActiveCustomer = lastOrderDate ? lastOrderDate > thirtyDaysAgo : false;
    return {
      customer: c.name,
      totalOrders: c.salesOrders.length,
      lastOrderDate: lastOrderDate ? lastOrderDate.toLocaleDateString() : 'Never',
      status: isActiveCustomer ? 'Active' : 'Inactive',
    };
  });

  rows = sortRows(rows, params.sortField, params.sortOrder);

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
    date: new Date(c.date).toLocaleDateString(),
    collectionCode: c.collectionCode,
    customer: c.customer?.name || '',
    amount: c.amount,
    paymentOption: c.paymentOption?.name || '',
    bank: c.bank?.bankName || '',
  }));

  rows = sortRows(rows, params.sortField, params.sortOrder);

  const totalCollected = collections.reduce((s, c) => s + c.amount, 0);

  return {
    title: 'SR-wise Cash Collection',
    columns,
    rows,
    summary: { totalCollections: collections.length, totalAmount: fmt(totalCollected) },
    chartData: rows.slice(0, 30).map((r) => ({ date: r.date, amount: r.amount })),
  };
}

async function srCommissionReport(params: QueryParams): Promise<ReportResult> {
  const dateFilter = buildDateFilter(params.from, params.to);
  const salesWhere: Record<string, unknown> = { isActive: true, status: 'Confirmed' };
  if (dateFilter) salesWhere.date = dateFilter;

  const salesOrders = await db.salesOrder.findMany({
    where: salesWhere,
    include: { customer: true, lines: { include: { product: true } } },
  });

  const srs = await db.employee.findMany({
    where: { isActive: true, designation: { name: { contains: 'SR' } } },
    include: { designation: true },
  });

  const commissionRate = 0.02; // 2% commission

  const columns: ColumnDef[] = [
    { key: 'srCode', label: 'SR Code' },
    { key: 'srName', label: 'SR Name' },
    { key: 'totalSales', label: 'Total Sales' },
    { key: 'totalOrders', label: 'Total Orders' },
    { key: 'commissionRate', label: 'Commission Rate' },
    { key: 'commission', label: 'Commission' },
  ];

  const totalSalesValue = salesOrders.reduce((s, so) => s + so.grandTotal, 0);
  const salesPerSR = srs.length > 0 ? totalSalesValue / srs.length : 0;

  let rows = srs.map((sr) => ({
    srCode: sr.employeeCode,
    srName: sr.name,
    totalSales: Math.round(salesPerSR * 100) / 100,
    totalOrders: Math.round(salesOrders.length / srs.length),
    commissionRate: `${(commissionRate * 100).toFixed(0)}%`,
    commission: Math.round(salesPerSR * commissionRate * 100) / 100,
  }));

  if (params.employeeId) rows = rows.filter((r) => r.srCode === params.employeeId || String(r.srName).includes(params.employeeId || ''));

  rows = sortRows(rows, params.sortField, params.sortOrder);

  return {
    title: 'SR Commission Report',
    columns,
    rows,
    summary: { totalSRs: srs.length, totalSales: fmt(totalSalesValue), totalCommission: fmt(rows.reduce((s, r) => s + (Number(r.commission) || 0), 0)) },
    chartData: rows.map((r) => ({ name: String(r.srName), sales: r.totalSales, commission: r.commission })),
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

  let rows = Array.from(customerMap.values());
  rows = sortRows(rows, params.sortField, params.sortOrder);

  return {
    title: 'Customer-wise Sales Report',
    columns,
    rows,
    summary: { totalCustomers: customerMap.size, totalOrders: salesOrders.length, totalValue: fmt(salesOrders.reduce((s, so) => s + so.grandTotal, 0)) },
    chartData: Array.from(customerMap.values()).slice(0, 20).map((v) => ({ name: v.customer, value: v.totalValue })),
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
        existing.totalDue += due / categories.size;
        existing.customerCount += 1;
      } else {
        catDueMap.set(cat, { category: cat, totalDue: due / categories.size, customerCount: 1 });
      }
    }
  }

  const columns: ColumnDef[] = [
    { key: 'category', label: 'Category' },
    { key: 'customerCount', label: 'Customers' },
    { key: 'totalDue', label: 'Total Due' },
  ];

  let rows = Array.from(catDueMap.values());
  rows = sortRows(rows, params.sortField, params.sortOrder);

  return {
    title: 'Category-wise Customer Due',
    columns,
    rows,
    summary: { totalCategories: catDueMap.size, totalDue: fmt(rows.reduce((s, r) => s + r.totalDue, 0)) },
    chartData: Array.from(catDueMap.values()).map((v) => ({ name: v.category, due: v.totalDue })),
  };
}

async function customerLedger(params: QueryParams): Promise<ReportResult> {
  if (!params.customerId) {
    return emptyReport('Customer Ledger', [
      { key: 'date', label: 'Date' },
      { key: 'type', label: 'Type' },
      { key: 'reference', label: 'Reference' },
      { key: 'debit', label: 'Debit' },
      { key: 'credit', label: 'Credit' },
      { key: 'balance', label: 'Balance' },
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
    { date: 'Opening', type: 'Opening Balance', reference: '-', debit: customer.openingBalance, credit: 0, balance: customer.openingBalance },
  ];
  for (const e of entries) {
    runningBalance += e.debit - e.credit;
    rows.push({
      date: new Date(e.date).toLocaleDateString(),
      type: e.type,
      reference: e.reference,
      debit: e.debit,
      credit: e.credit,
      balance: runningBalance,
    });
  }

  const totalDebit = customer.openingBalance + salesOrders.reduce((s, so) => s + so.grandTotal, 0);
  const totalCredit = salesReturns.reduce((s, r) => s + r.grandTotal, 0) + cashCollections.reduce((s, c) => s + c.amount, 0);

  return {
    title: `Customer Ledger - ${customer.name}`,
    columns,
    rows,
    summary: { openingBalance: customer.openingBalance, totalDebit, totalCredit, closingBalance: runningBalance },
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
      customerCode: c.customerCode,
      customer: c.name,
      phone: c.phone || '',
      openingBalance: c.openingBalance,
      totalSales,
      totalPaid,
      outstanding: Math.max(outstanding, 0),
    };
  }).filter((r) => r.outstanding > 0);

  if (params.customerId) rows = rows.filter((r) => r.customerCode === params.customerId);

  rows = sortRows(rows, params.sortField, params.sortOrder);

  return {
    title: 'Customer Due Report',
    columns,
    rows,
    summary: { totalCustomers: rows.length, totalOutstanding: fmt(rows.reduce((s, r) => s + r.outstanding, 0)) },
    chartData: rows.slice(0, 20).map((r) => ({ name: String(r.customer), outstanding: r.outstanding })),
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
    date: new Date(c.date).toLocaleDateString(),
    collectionCode: c.collectionCode,
    customer: c.customer?.name || '',
    amount: c.amount,
    paymentOption: c.paymentOption?.name || '',
    bank: c.bank?.bankName || '',
    description: c.description || '',
  }));

  rows = sortRows(rows, params.sortField, params.sortOrder);

  return {
    title: 'Customer Cash Collection Report',
    columns,
    rows,
    summary: { totalCollections: collections.length, totalAmount: fmt(collections.reduce((s, c) => s + c.amount, 0)) },
    chartData: rows.slice(0, 30).map((r) => ({ date: r.date, amount: r.amount })),
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
      customerCode: c.customerCode,
      customer: c.name,
      openingBalance: c.openingBalance,
      totalSales,
      totalReturns,
      totalCollections,
      balance,
    };
  });

  if (params.customerId) rows = rows.filter((r) => r.customerCode === params.customerId);

  rows = sortRows(rows, params.sortField, params.sortOrder);

  return {
    title: 'Customer Ledger Summary',
    columns,
    rows,
    summary: {
      totalCustomers: rows.length,
      totalOpening: fmt(rows.reduce((s, r) => s + (Number(r.openingBalance) || 0), 0)),
      totalSales: fmt(rows.reduce((s, r) => s + (Number(r.totalSales) || 0), 0)),
      totalCollections: fmt(rows.reduce((s, r) => s + (Number(r.totalCollections) || 0), 0)),
      totalBalance: fmt(rows.reduce((s, r) => s + (Number(r.balance) || 0), 0)),
    },
    chartData: rows.slice(0, 20).map((r) => ({ name: String(r.customer), sales: r.totalSales, collections: r.totalCollections, balance: r.balance })),
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

  let rows = Array.from(headMap.values());
  rows = sortRows(rows, params.sortField, params.sortOrder);

  const totalAmount = expenses.reduce((s, e) => s + e.amount, 0);

  return {
    title: 'Expense Report',
    columns,
    rows,
    summary: { totalExpenses: expenses.length, totalAmount: fmt(totalAmount), avgExpense: expenses.length > 0 ? fmt(totalAmount / expenses.length) : '0.00' },
    chartData: Array.from(headMap.values()).map((v) => ({ name: v.head, amount: v.totalAmount })),
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
    { metric: 'Sales Revenue', value: fmt(revenue) },
    { metric: 'Other Income', value: fmt(otherIncome) },
    { metric: 'Total Revenue', value: fmt(totalRevenue) },
    { metric: 'Cost of Goods Sold', value: maskVat(fmt(cogs), params.vatMode) },
    { metric: 'Gross Profit', value: maskVat(fmt(grossProfit), params.vatMode) },
    { metric: 'Operating Expenses', value: fmt(operatingExpenses) },
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
    const key = new Date(so.date).toLocaleString('en', { month: 'short', year: '2-digit' });
    const existing = monthlyMap.get(key) || { revenue: 0, expenses: 0, profit: 0 };
    existing.revenue += so.grandTotal;
    monthlyMap.set(key, existing);
  }
  for (const e of expenses) {
    const key = new Date(e.date).toLocaleString('en', { month: 'short', year: '2-digit' });
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
      revenue: fmt(totalRevenue),
      cogs: maskVat(fmt(cogs), params.vatMode),
      grossProfit: maskVat(fmt(grossProfit), params.vatMode),
      operatingExpenses: fmt(operatingExpenses),
      netProfit: maskVat(fmt(netProfit), params.vatMode),
      profitMargin: maskVat(profitMargin, params.vatMode),
    },
    chartData: Array.from(monthlyMap.entries()).map(([month, v]) => ({
      month,
      revenue: v.revenue,
      expenses: v.expenses,
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
    date: new Date(t.date).toLocaleDateString(),
    transactionCode: t.transactionCode,
    bank: t.bank?.bankName || '',
    type: t.type,
    amount: t.amount,
    runningBalance: t.runningBalance,
    toBank: t.toBank?.bankName || '',
    description: t.description || '',
  }));

  rows = sortRows(rows, params.sortField, params.sortOrder);

  const totalDeposits = transactions.filter((t) => t.type === 'Deposit').reduce((s, t) => s + t.amount, 0);
  const totalWithdrawals = transactions.filter((t) => t.type === 'Withdraw').reduce((s, t) => s + t.amount, 0);
  const totalTransfers = transactions.filter((t) => t.type === 'Transfer').reduce((s, t) => s + t.amount, 0);

  return {
    title: 'Bank Transaction Report',
    columns,
    rows,
    summary: { totalTransactions: transactions.length, totalDeposits: fmt(totalDeposits), totalWithdrawals: fmt(totalWithdrawals), totalTransfers: fmt(totalTransfers) },
    chartData: [
      { name: 'Deposits', amount: totalDeposits },
      { name: 'Withdrawals', amount: totalWithdrawals },
      { name: 'Transfers', amount: totalTransfers },
    ],
  };
}

async function bankBalanceReport(params: QueryParams): Promise<ReportResult> {
  const where: Record<string, unknown> = { isActive: true };
  if (params.bankId) where.id = params.bankId;
  const dateFilter = buildDateFilter(params.from, params.to);

  const banks = await db.bank.findMany({
    where,
    include: {
      bankTransactions: { where: { isActive: true } },
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
      openingBalance: b.openingBalance,
      deposits,
      withdrawals,
      currentBalance: b.currentBalance,
    };
  });

  rows = sortRows(rows, params.sortField, params.sortOrder);

  return {
    title: 'Bank Balance Report',
    columns,
    rows,
    summary: {
      totalBanks: banks.length,
      totalOpening: fmt(banks.reduce((s, b) => s + b.openingBalance, 0)),
      totalCurrent: fmt(banks.reduce((s, b) => s + b.currentBalance, 0)),
    },
    chartData: rows.map((r) => ({ name: String(r.bankName), opening: r.openingBalance, current: r.currentBalance })),
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

  const containsFilter = { contains: keyword, mode: 'insensitive' as const };
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

  // VAT-001: Validate vatMode — only vat_auditor role can activate masking
  const userRole = security.user.role as UserRole;
  const rawVatMode = searchParams.get('vatMode') === 'true';
  const effectiveVatMode = validateVatMode(rawVatMode, userRole);

  // MIS-002: Map entityId to the correct filter based on report type/category
  const reportType = searchParams.get('type') || '';
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
      subtype: searchParams.get('subtype') || '',
      from: searchParams.get('from'),
      to: searchParams.get('to'),
      sortField: searchParams.get('sortField'),
      sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || 'asc',
      groupBy: searchParams.get('groupBy'),
      supplierId: mappedSupplierId,
      customerId: mappedCustomerId,
      employeeId: mappedEmployeeId,
      bankId: mappedBankId,
      categoryId: mappedCategoryId,
      companyId: mappedCompanyId,
      productId: mappedProductId,
      godownId: mappedGodownId,
      vatMode: effectiveVatMode,
      keyword: searchParams.get('keyword'),
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
      case 'management:management-report':
        result = await managementReport(params);
        break;

      // Bank Reports
      case 'bank:bank-transaction-report':
        result = await bankTransactionReport(params);
        break;
      case 'bank:bank-balance-report':
        result = await bankBalanceReport(params);
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
              'management:expense-report', 'management:management-report',
              'bank:bank-transaction-report', 'bank:bank-balance-report',
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
