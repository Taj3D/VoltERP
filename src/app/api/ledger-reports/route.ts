import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  validateVatMode,
  maskAccountingReportForVatAuditor,
  safeFinancialAdd,
  safeFinancialSubtract,
  safeFinancialRound,
  formatFinancialField,
} from '@/lib/api-security';
import type { UserRole } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// GET /api/ledger-reports - Stage 12: Multi-tenant, safe math, VAT auditor masking, RBAC, activity log
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'LedgerReports', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'customer';
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const customerId = searchParams.get('customerId');
    const supplierId = searchParams.get('supplierId');

    // STAGE 12: VAT Auditor mode validation
    const rawVatMode = searchParams.get('vatMode') === 'true';
    const userRole = security.user.role as UserRole;
    const vatMode = validateVatMode(rawVatMode, userRole);

    // STAGE 12: Multi-tenant companyId isolation
    const companyId = security.user.companyId;

    const dateFilter: Record<string, Date> = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);
    const hasDateFilter = from || to;

    // STAGE 12: Activity logging
    await logUserActivity({
      action: 'EXPORT',
      module: 'Acc-Ledger-Report',
      userId: security.user.id,
      userName: security.user.name,
      details: `Ledger report generated (type: ${type})`,
    });

    switch (type) {
      case 'customer':
        return await handleCustomerLedger(customerId, dateFilter, hasDateFilter, vatMode, userRole, companyId);
      case 'supplier':
        return await handleSupplierLedger(supplierId, dateFilter, hasDateFilter, vatMode, userRole, companyId);
      case 'customer-summary':
        return await handleCustomerSummary(dateFilter, hasDateFilter, vatMode, userRole, companyId);
      case 'supplier-summary':
        return await handleSupplierSummary(dateFilter, hasDateFilter, vatMode, userRole, companyId);
      case 'customer-aging':
        return await handleCustomerAging(vatMode, userRole, companyId);
      case 'supplier-aging':
        return await handleSupplierAging(vatMode, userRole, companyId);
      default:
        return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 });
    }
  } catch (error) {
    console.error('Ledger Reports API error:', error);
    return NextResponse.json({ error: 'Failed to generate ledger report' }, { status: 500 });
  }
}

// ─── Individual Customer Ledger ──────────────────────────────────────────────
async function handleCustomerLedger(
  customerId: string | null,
  dateFilter: Record<string, Date>,
  hasDateFilter: boolean,
  vatMode: boolean,
  userRole: UserRole,
  _companyId: string | null
) {
  if (!customerId) {
    return NextResponse.json({ error: 'customerId is required for type=customer' }, { status: 400 });
  }

  // NOTE: Customer does NOT have companyId — known limitation for Stage 12
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true, customerCode: true, name: true, phone: true, email: true,
      address: true, openingBalance: true, openingBalanceType: true,
      creditLimit: true, customerType: true,
    },
  });

  if (!customer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
  }

  // Build date filter for queries
  const whereDate = hasDateFilter ? { date: dateFilter } : {};

  // STAGE 12: Fetch all transactions in parallel with companyId filters where applicable
  const [salesOrders, salesReturns, cashCollections, hireSales] = await Promise.all([
    db.salesOrder.findMany({
      where: { customerId, isActive: true, ...whereDate },
      select: { id: true, invoiceNo: true, date: true, grandTotal: true, status: true },
      orderBy: { date: 'asc' },
    }),
    db.salesReturn.findMany({
      where: { customerId, isActive: true, ...whereDate },
      select: { id: true, returnNo: true, date: true, grandTotal: true, status: true },
      orderBy: { date: 'asc' },
    }),
    db.cashCollection.findMany({
      where: {
        customerId,
        isActive: true,
        ...whereDate,
        // STAGE 12: Filter by companyId
        ...(_companyId ? { companyId: _companyId } : {}),
      },
      select: { id: true, collectionCode: true, date: true, amount: true, status: true },
      orderBy: { date: 'asc' },
    }),
    db.hireSales.findMany({
      where: { customerId, isActive: true, ...whereDate },
      select: { id: true, invoiceNo: true, date: true, grandTotal: true, status: true, downPayment: true },
      orderBy: { date: 'asc' },
    }),
  ]);

  // Build transaction rows
  const rows: Array<{
    date: string;
    referenceNo: string;
    referenceType: string;
    debit: number;
    credit: number;
    runningBalance: number;
    status?: string;
  }> = [];

  // STAGE 12: Use safe math for opening balance
  const openingBalance = safeFinancialRound(Number(customer.openingBalance));
  let runningBalance = customer.openingBalanceType === 'Cr' ? safeFinancialSubtract(0, openingBalance) : openingBalance;

  // Sales Orders -> Debit (customer owes more)
  for (const so of salesOrders) {
    if (so.status !== 'Draft') {
      const amount = safeFinancialRound(Number(so.grandTotal));
      runningBalance = safeFinancialAdd(runningBalance, amount);
      rows.push({
        date: so.date.toISOString(),
        referenceNo: formatFinancialField(so.invoiceNo),
        referenceType: 'Sales Order',
        debit: amount,
        credit: 0,
        runningBalance: safeFinancialRound(runningBalance),
        status: so.status,
      });
    }
  }

  // Hire Sales -> Debit (customer owes more)
  for (const hs of hireSales) {
    if (hs.status !== 'Draft') {
      const amount = safeFinancialRound(Number(hs.grandTotal));
      runningBalance = safeFinancialAdd(runningBalance, amount);
      rows.push({
        date: hs.date.toISOString(),
        referenceNo: formatFinancialField(hs.invoiceNo),
        referenceType: 'Hire Sales',
        debit: amount,
        credit: 0,
        runningBalance: safeFinancialRound(runningBalance),
        status: hs.status,
      });
    }
  }

  // Cash Collections -> Credit (customer pays, reduces what they owe)
  for (const cc of cashCollections) {
    if (cc.status !== 'Draft') {
      const amount = safeFinancialRound(Number(cc.amount));
      runningBalance = safeFinancialSubtract(runningBalance, amount);
      rows.push({
        date: cc.date.toISOString(),
        referenceNo: formatFinancialField(cc.collectionCode),
        referenceType: 'Cash Collection',
        debit: 0,
        credit: amount,
        runningBalance: safeFinancialRound(runningBalance),
        status: cc.status,
      });
    }
  }

  // Sales Returns -> Credit (reduces what customer owes)
  for (const sr of salesReturns) {
    if (sr.status !== 'Draft') {
      const amount = safeFinancialRound(Number(sr.grandTotal));
      runningBalance = safeFinancialSubtract(runningBalance, amount);
      rows.push({
        date: sr.date.toISOString(),
        referenceNo: formatFinancialField(sr.returnNo),
        referenceType: 'Sales Return',
        debit: 0,
        credit: amount,
        runningBalance: safeFinancialRound(runningBalance),
        status: sr.status,
      });
    }
  }

  // Sort all rows by date
  rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // STAGE 12: Recalculate running balance in order with safe math
  let rb = customer.openingBalanceType === 'Cr' ? safeFinancialSubtract(0, openingBalance) : openingBalance;
  for (const row of rows) {
    rb = safeFinancialAdd(rb, safeFinancialSubtract(row.debit, row.credit));
    row.runningBalance = safeFinancialRound(rb);
  }

  const closingBalance = safeFinancialRound(rb);

  // Calculate aging buckets for this customer
  const aging = await calculateCustomerAging(customerId, _companyId);

  // STAGE 12: Total debit/credit with safe math
  let totalDebit = 0;
  let totalCredit = 0;
  for (const row of rows) {
    totalDebit = safeFinancialAdd(totalDebit, row.debit);
    totalCredit = safeFinancialAdd(totalCredit, row.credit);
  }

  const result: Record<string, unknown> = {
    customer: {
      id: customer.id,
      customerCode: formatFinancialField(customer.customerCode),
      name: customer.name,
      phone: formatFinancialField(customer.phone),
      email: formatFinancialField(customer.email),
      address: formatFinancialField(customer.address),
      creditLimit: Number(customer.creditLimit),
      customerType: customer.customerType,
    },
    openingBalance,
    openingBalanceType: customer.openingBalanceType,
    closingBalance,
    closingBalanceType: closingBalance >= 0 ? 'Dr' : 'Cr',
    totalDebit,
    totalCredit,
    transactions: rows,
    aging,
  };

  // STAGE 12: Apply deep VAT Auditor masking via maskAccountingReportForVatAuditor
  if (vatMode) {
    const masked = maskAccountingReportForVatAuditor(result, userRole);
    return NextResponse.json(masked);
  }

  return NextResponse.json(result);
}

// ─── Individual Supplier Ledger ──────────────────────────────────────────────
async function handleSupplierLedger(
  supplierId: string | null,
  dateFilter: Record<string, Date>,
  hasDateFilter: boolean,
  vatMode: boolean,
  userRole: UserRole,
  _companyId: string | null
) {
  if (!supplierId) {
    return NextResponse.json({ error: 'supplierId is required for type=supplier' }, { status: 400 });
  }

  // NOTE: Supplier does NOT have companyId — known limitation for Stage 12
  const supplier = await db.supplier.findUnique({
    where: { id: supplierId },
    select: {
      id: true, supplierCode: true, name: true, phone: true, email: true,
      address: true, openingBalance: true, openingBalanceType: true,
      creditLimit: true,
    },
  });

  if (!supplier) {
    return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
  }

  const whereDate = hasDateFilter ? { date: dateFilter } : {};

  // STAGE 12: Fetch with companyId filters where applicable
  const [purchaseOrders, purchaseReturns, cashDeliveries] = await Promise.all([
    db.purchaseOrder.findMany({
      where: { supplierId, isActive: true, ...whereDate },
      select: { id: true, poNumber: true, date: true, grandTotal: true, status: true },
      orderBy: { date: 'asc' },
    }),
    db.purchaseReturn.findMany({
      where: { supplierId, isActive: true, ...whereDate },
      select: { id: true, returnNo: true, date: true, grandTotal: true, status: true },
      orderBy: { date: 'asc' },
    }),
    db.cashDelivery.findMany({
      where: {
        supplierId,
        isActive: true,
        ...whereDate,
        // STAGE 12: Filter by companyId
        ...(_companyId ? { companyId: _companyId } : {}),
      },
      select: { id: true, deliveryCode: true, date: true, amount: true, status: true },
      orderBy: { date: 'asc' },
    }),
  ]);

  const rows: Array<{
    date: string;
    referenceNo: string;
    referenceType: string;
    debit: number;
    credit: number;
    runningBalance: number;
    status?: string;
  }> = [];

  // STAGE 12: Use safe math for opening balance
  const openingBalance = safeFinancialRound(Number(supplier.openingBalance));
  // Supplier: Cr means we owe them, Dr means they owe us
  let runningBalance = supplier.openingBalanceType === 'Dr' ? safeFinancialSubtract(0, openingBalance) : openingBalance;

  // Purchase Orders -> Credit (we owe supplier more)
  for (const po of purchaseOrders) {
    if (po.status !== 'Draft') {
      const amount = safeFinancialRound(Number(po.grandTotal));
      runningBalance = safeFinancialAdd(runningBalance, amount);
      rows.push({
        date: po.date.toISOString(),
        referenceNo: formatFinancialField(po.poNumber),
        referenceType: 'Purchase Order',
        debit: 0,
        credit: amount,
        runningBalance: safeFinancialRound(runningBalance),
        status: po.status,
      });
    }
  }

  // Cash Deliveries -> Debit (we pay supplier, reduces what we owe)
  for (const cd of cashDeliveries) {
    if (cd.status !== 'Draft') {
      const amount = safeFinancialRound(Number(cd.amount));
      runningBalance = safeFinancialSubtract(runningBalance, amount);
      rows.push({
        date: cd.date.toISOString(),
        referenceNo: formatFinancialField(cd.deliveryCode),
        referenceType: 'Cash Delivery',
        debit: amount,
        credit: 0,
        runningBalance: safeFinancialRound(runningBalance),
        status: cd.status,
      });
    }
  }

  // Purchase Returns -> Debit (reduces what we owe)
  for (const pr of purchaseReturns) {
    if (pr.status !== 'Draft') {
      const amount = safeFinancialRound(Number(pr.grandTotal));
      runningBalance = safeFinancialSubtract(runningBalance, amount);
      rows.push({
        date: pr.date.toISOString(),
        referenceNo: formatFinancialField(pr.returnNo),
        referenceType: 'Purchase Return',
        debit: amount,
        credit: 0,
        runningBalance: safeFinancialRound(runningBalance),
        status: pr.status,
      });
    }
  }

  // Sort all rows by date
  rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // STAGE 12: Recalculate running balance in order with safe math
  let rb = supplier.openingBalanceType === 'Dr' ? safeFinancialSubtract(0, openingBalance) : openingBalance;
  for (const row of rows) {
    rb = safeFinancialAdd(rb, safeFinancialSubtract(row.credit, row.debit));
    row.runningBalance = safeFinancialRound(rb);
  }

  const closingBalance = safeFinancialRound(rb);

  // Calculate aging buckets for this supplier
  const aging = await calculateSupplierAging(supplierId, _companyId);

  // STAGE 12: Total debit/credit with safe math
  let totalDebit = 0;
  let totalCredit = 0;
  for (const row of rows) {
    totalDebit = safeFinancialAdd(totalDebit, row.debit);
    totalCredit = safeFinancialAdd(totalCredit, row.credit);
  }

  const result: Record<string, unknown> = {
    supplier: {
      id: supplier.id,
      supplierCode: formatFinancialField(supplier.supplierCode),
      name: supplier.name,
      phone: formatFinancialField(supplier.phone),
      email: formatFinancialField(supplier.email),
      address: formatFinancialField(supplier.address),
      creditLimit: Number(supplier.creditLimit),
    },
    openingBalance,
    openingBalanceType: supplier.openingBalanceType,
    closingBalance,
    closingBalanceType: closingBalance >= 0 ? 'Cr' : 'Dr',
    totalDebit,
    totalCredit,
    transactions: rows,
    aging,
  };

  // STAGE 12: Apply deep VAT Auditor masking via maskAccountingReportForVatAuditor
  if (vatMode) {
    const masked = maskAccountingReportForVatAuditor(result, userRole);
    return NextResponse.json(masked);
  }

  return NextResponse.json(result);
}

// ─── Customer Summary ────────────────────────────────────────────────────────
async function handleCustomerSummary(
  dateFilter: Record<string, Date>,
  hasDateFilter: boolean,
  vatMode: boolean,
  userRole: UserRole,
  _companyId: string | null
) {
  const whereDate = hasDateFilter ? { date: dateFilter } : {};

  // NOTE: Customer does NOT have companyId — known limitation for Stage 12
  const customers = await db.customer.findMany({
    where: { isActive: true },
    select: {
      id: true,
      customerCode: true,
      name: true,
      phone: true,
      creditLimit: true,
      openingBalance: true,
      openingBalanceType: true,
    },
  });

  const summaries = await Promise.all(
    customers.map(async (cust) => {
      const [salesAgg, returnsAgg, collectionsAgg, hireAgg] = await Promise.all([
        db.salesOrder.aggregate({
          where: { customerId: cust.id, status: { not: 'Draft' }, isActive: true, ...whereDate },
          _sum: { grandTotal: true },
        }),
        db.salesReturn.aggregate({
          where: { customerId: cust.id, status: { not: 'Draft' }, isActive: true, ...whereDate },
          _sum: { grandTotal: true },
        }),
        db.cashCollection.aggregate({
          where: {
            customerId: cust.id,
            status: { not: 'Draft' },
            isActive: true,
            ...whereDate,
            // STAGE 12: Filter by companyId
            ...(_companyId ? { companyId: _companyId } : {}),
          },
          _sum: { amount: true },
        }),
        db.hireSales.aggregate({
          where: { customerId: cust.id, status: { not: 'Draft' }, isActive: true, ...whereDate },
          _sum: { grandTotal: true },
        }),
      ]);

      // STAGE 12: Use safe math for all summary calculations
      const totalSales = safeFinancialAdd(
        safeFinancialRound(Number(salesAgg._sum.grandTotal || 0)),
        safeFinancialRound(Number(hireAgg._sum.grandTotal || 0))
      );
      const totalCollections = safeFinancialRound(Number(collectionsAgg._sum.amount || 0));
      const totalReturns = safeFinancialRound(Number(returnsAgg._sum.grandTotal || 0));
      const openingBal = safeFinancialRound(Number(cust.openingBalance));
      const openingAdj = cust.openingBalanceType === 'Cr' ? safeFinancialSubtract(0, openingBal) : openingBal;
      const balance = safeFinancialSubtract(
        safeFinancialAdd(openingAdj, totalSales),
        safeFinancialAdd(totalCollections, totalReturns)
      );
      const creditLimit = safeFinancialRound(Number(cust.creditLimit));
      const creditUtilization = creditLimit > 0 ? safeFinancialRound((Math.abs(balance) / creditLimit) * 100) : 0;

      return {
        customerId: cust.id,
        customerCode: formatFinancialField(cust.customerCode),
        customerName: cust.name,
        phone: formatFinancialField(cust.phone),
        totalSales,
        totalCollections,
        totalReturns,
        balance,
        creditLimit,
        creditUtilization,
      };
    })
  );

  // Sort by balance descending
  summaries.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

  const result: Record<string, unknown> = {
    type: 'customer-summary',
    count: summaries.length,
    data: summaries,
  };

  // STAGE 12: Apply deep VAT Auditor masking
  if (vatMode) {
    const masked = maskAccountingReportForVatAuditor(result, userRole);
    return NextResponse.json(masked);
  }

  return NextResponse.json(result);
}

// ─── Supplier Summary ────────────────────────────────────────────────────────
async function handleSupplierSummary(
  dateFilter: Record<string, Date>,
  hasDateFilter: boolean,
  vatMode: boolean,
  userRole: UserRole,
  _companyId: string | null
) {
  const whereDate = hasDateFilter ? { date: dateFilter } : {};

  // NOTE: Supplier does NOT have companyId — known limitation for Stage 12
  const suppliers = await db.supplier.findMany({
    where: { isActive: true },
    select: {
      id: true,
      supplierCode: true,
      name: true,
      phone: true,
      creditLimit: true,
      openingBalance: true,
      openingBalanceType: true,
    },
  });

  const summaries = await Promise.all(
    suppliers.map(async (sup) => {
      const [purchasesAgg, returnsAgg, deliveriesAgg] = await Promise.all([
        db.purchaseOrder.aggregate({
          where: { supplierId: sup.id, status: { not: 'Draft' }, isActive: true, ...whereDate },
          _sum: { grandTotal: true },
        }),
        db.purchaseReturn.aggregate({
          where: { supplierId: sup.id, status: { not: 'Draft' }, isActive: true, ...whereDate },
          _sum: { grandTotal: true },
        }),
        db.cashDelivery.aggregate({
          where: {
            supplierId: sup.id,
            status: { not: 'Draft' },
            isActive: true,
            ...whereDate,
            // STAGE 12: Filter by companyId
            ...(_companyId ? { companyId: _companyId } : {}),
          },
          _sum: { amount: true },
        }),
      ]);

      // STAGE 12: Use safe math for all summary calculations
      const totalPurchases = safeFinancialRound(Number(purchasesAgg._sum.grandTotal || 0));
      const totalDeliveries = safeFinancialRound(Number(deliveriesAgg._sum.amount || 0));
      const totalReturns = safeFinancialRound(Number(returnsAgg._sum.grandTotal || 0));
      const openingBal = safeFinancialRound(Number(sup.openingBalance));
      const openingAdj = sup.openingBalanceType === 'Dr' ? safeFinancialSubtract(0, openingBal) : openingBal;
      const balance = safeFinancialSubtract(
        safeFinancialAdd(openingAdj, totalPurchases),
        safeFinancialAdd(totalDeliveries, totalReturns)
      );
      const creditLimit = safeFinancialRound(Number(sup.creditLimit));

      return {
        supplierId: sup.id,
        supplierCode: formatFinancialField(sup.supplierCode),
        supplierName: sup.name,
        phone: formatFinancialField(sup.phone),
        totalPurchases,
        totalDeliveries,
        totalReturns,
        balance,
        creditLimit,
      };
    })
  );

  summaries.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

  const result: Record<string, unknown> = {
    type: 'supplier-summary',
    count: summaries.length,
    data: summaries,
  };

  // STAGE 12: Apply deep VAT Auditor masking
  if (vatMode) {
    const masked = maskAccountingReportForVatAuditor(result, userRole);
    return NextResponse.json(masked);
  }

  return NextResponse.json(result);
}

// ─── Customer Aging ──────────────────────────────────────────────────────────
async function handleCustomerAging(
  vatMode: boolean,
  userRole: UserRole,
  _companyId: string | null
) {
  // NOTE: Customer does NOT have companyId — known limitation for Stage 12
  const customers = await db.customer.findMany({
    where: { isActive: true },
    select: {
      id: true,
      customerCode: true,
      name: true,
    },
  });

  const agingData = await Promise.all(
    customers.map(async (cust) => {
      const aging = await calculateCustomerAging(cust.id, _companyId);
      if (aging.totalOutstanding <= 0) return null;
      return {
        customerId: cust.id,
        customerCode: formatFinancialField(cust.customerCode),
        customerName: cust.name,
        ...aging,
      };
    })
  );

  const filtered = agingData.filter((a): a is NonNullable<typeof a> => a !== null);
  filtered.sort((a, b) => b.totalOutstanding - a.totalOutstanding);

  // STAGE 12: Use safe math for aging totals
  let totalOutstanding = 0;
  let current = 0;
  let days31to60 = 0;
  let days61to90 = 0;
  let days90plus = 0;
  for (const a of filtered) {
    totalOutstanding = safeFinancialAdd(totalOutstanding, a.totalOutstanding);
    current = safeFinancialAdd(current, a.current);
    days31to60 = safeFinancialAdd(days31to60, a.days31to60);
    days61to90 = safeFinancialAdd(days61to90, a.days61to90);
    days90plus = safeFinancialAdd(days90plus, a.days90plus);
  }

  const result: Record<string, unknown> = {
    type: 'customer-aging',
    count: filtered.length,
    totals: {
      totalOutstanding,
      current,
      days31to60,
      days61to90,
      days90plus,
    },
    data: filtered,
  };

  // STAGE 12: Apply deep VAT Auditor masking
  if (vatMode) {
    const masked = maskAccountingReportForVatAuditor(result, userRole);
    return NextResponse.json(masked);
  }

  return NextResponse.json(result);
}

// ─── Supplier Aging ──────────────────────────────────────────────────────────
async function handleSupplierAging(
  vatMode: boolean,
  userRole: UserRole,
  _companyId: string | null
) {
  // NOTE: Supplier does NOT have companyId — known limitation for Stage 12
  const suppliers = await db.supplier.findMany({
    where: { isActive: true },
    select: {
      id: true,
      supplierCode: true,
      name: true,
    },
  });

  const agingData = await Promise.all(
    suppliers.map(async (sup) => {
      const aging = await calculateSupplierAging(sup.id, _companyId);
      if (aging.totalOutstanding <= 0) return null;
      return {
        supplierId: sup.id,
        supplierCode: formatFinancialField(sup.supplierCode),
        supplierName: sup.name,
        ...aging,
      };
    })
  );

  const filtered = agingData.filter((a): a is NonNullable<typeof a> => a !== null);
  filtered.sort((a, b) => b.totalOutstanding - a.totalOutstanding);

  // STAGE 12: Use safe math for aging totals
  let totalOutstanding = 0;
  let current = 0;
  let days31to60 = 0;
  let days61to90 = 0;
  let days90plus = 0;
  for (const a of filtered) {
    totalOutstanding = safeFinancialAdd(totalOutstanding, a.totalOutstanding);
    current = safeFinancialAdd(current, a.current);
    days31to60 = safeFinancialAdd(days31to60, a.days31to60);
    days61to90 = safeFinancialAdd(days61to90, a.days61to90);
    days90plus = safeFinancialAdd(days90plus, a.days90plus);
  }

  const result: Record<string, unknown> = {
    type: 'supplier-aging',
    count: filtered.length,
    totals: {
      totalOutstanding,
      current,
      days31to60,
      days61to90,
      days90plus,
    },
    data: filtered,
  };

  // STAGE 12: Apply deep VAT Auditor masking
  if (vatMode) {
    const masked = maskAccountingReportForVatAuditor(result, userRole);
    return NextResponse.json(masked);
  }

  return NextResponse.json(result);
}

// ─── Aging Calculation Helpers ───────────────────────────────────────────────

// AGING-001 FIX: FIFO Aging Bucket Allocation
// Instead of assigning FULL invoice balance to one bucket, we use FIFO:
// 1. Sort all outstanding invoices by date (oldest first)
// 2. Apply total payments against oldest invoices first
// 3. Split remaining balance across buckets based on invoice age

interface OutstandingInvoice {
  id: string;
  date: Date;
  totalAmount: number;
  type: string;
  reference: string;
}

function allocateAgingBuckets(
  invoices: OutstandingInvoice[],
  totalPayments: number,
  today: Date
): {
  totalOutstanding: number;
  current: number;
  days31to60: number;
  days61to90: number;
  days90plus: number;
  invoiceBreakdown: Array<{
    id: string;
    type: string;
    reference: string;
    date: Date;
    originalAmount: number;
    outstandingAmount: number;
    daysOutstanding: number;
    bucket: string;
  }>;
} {
  // Sort invoices by date (oldest first) for FIFO allocation
  const sorted = [...invoices].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let remainingPayments = totalPayments;
  let current = 0;
  let days31to60 = 0;
  let days61to90 = 0;
  let days90plus = 0;
  const invoiceBreakdown: Array<{
    id: string;
    type: string;
    reference: string;
    date: Date;
    originalAmount: number;
    outstandingAmount: number;
    daysOutstanding: number;
    bucket: string;
  }> = [];

  for (const inv of sorted) {
    // FIFO: Apply payments to oldest invoices first
    const paidAgainstThis = Math.min(remainingPayments, inv.totalAmount);
    remainingPayments = safeFinancialSubtract(remainingPayments, paidAgainstThis);
    const outstanding = safeFinancialSubtract(inv.totalAmount, paidAgainstThis);

    const daysOutstanding = Math.floor(
      (today.getTime() - new Date(inv.date).getTime()) / (1000 * 60 * 60 * 24)
    );

    let bucket = 'current';
    if (outstanding > 0) {
      if (daysOutstanding <= 30) {
        current = safeFinancialAdd(current, outstanding);
        bucket = 'current';
      } else if (daysOutstanding <= 60) {
        days31to60 = safeFinancialAdd(days31to60, outstanding);
        bucket = '31-60';
      } else if (daysOutstanding <= 90) {
        days61to90 = safeFinancialAdd(days61to90, outstanding);
        bucket = '61-90';
      } else {
        days90plus = safeFinancialAdd(days90plus, outstanding);
        bucket = '90+';
      }
    }

    invoiceBreakdown.push({
      id: inv.id,
      type: inv.type,
      reference: formatFinancialField(inv.reference),
      date: inv.date,
      originalAmount: inv.totalAmount,
      outstandingAmount: outstanding,
      daysOutstanding,
      bucket,
    });
  }

  // STAGE 12: Total outstanding using safe math
  const totalOutstanding = safeFinancialAdd(
    safeFinancialAdd(current, days31to60),
    safeFinancialAdd(days61to90, days90plus)
  );
  return { totalOutstanding, current, days31to60, days61to90, days90plus, invoiceBreakdown };
}

async function calculateCustomerAging(customerId: string, _companyId: string | null): Promise<{
  totalOutstanding: number;
  current: number;
  days31to60: number;
  days61to90: number;
  days90plus: number;
  invoiceBreakdown: Array<{
    id: string;
    type: string;
    reference: string;
    date: Date;
    originalAmount: number;
    outstandingAmount: number;
    daysOutstanding: number;
    bucket: string;
  }>;
}> {
  const today = new Date();

  // Get all non-Draft sales orders for this customer
  // NOTE: SalesOrder does NOT have companyId — known limitation for Stage 12
  const salesOrders = await db.salesOrder.findMany({
    where: { customerId, status: { not: 'Draft' }, isActive: true },
    select: { id: true, date: true, grandTotal: true },
  });

  // AGING-002 FIX: Include HireSales installments that are overdue
  const overdueInstallments = await db.hireInstallment.findMany({
    where: {
      status: { in: ['Pending', 'Overdue'] },
      dueDate: { lt: today },
      hireSales: { customerId, isActive: true, status: { not: 'Draft' } },
    },
    include: { hireSales: { select: { invoiceNo: true } } },
  });

  // Build outstanding invoices list
  const invoices: OutstandingInvoice[] = [
    ...salesOrders.map((so) => ({
      id: so.id,
      date: so.date,
      totalAmount: safeFinancialRound(Number(so.grandTotal)),
      type: 'SalesOrder',
      reference: so.id,
    })),
    ...overdueInstallments.map((hi) => ({
      id: hi.id,
      date: hi.dueDate,
      totalAmount: safeFinancialRound(Number(hi.amount)),
      type: 'HireInstallment',
      reference: hi.hireSales?.invoiceNo || hi.id,
    })),
  ];

  // STAGE 12: Get total collections for this customer with companyId filter
  const collectionsAgg = await db.cashCollection.aggregate({
    where: {
      customerId,
      isActive: true,
      status: { not: 'Draft' },
      ...(_companyId ? { companyId: _companyId } : {}),
    },
    _sum: { amount: true },
  });

  // Get total returns for this customer
  const returnsAgg = await db.salesReturn.aggregate({
    where: {
      customerId,
      isActive: true,
      status: { not: 'Draft' },
    },
    _sum: { grandTotal: true },
  });

  // STAGE 12: Use safe math for total payments
  const totalPayments = safeFinancialAdd(
    safeFinancialRound(Number(collectionsAgg._sum.amount || 0)),
    safeFinancialRound(Number(returnsAgg._sum.grandTotal || 0))
  );

  return allocateAgingBuckets(invoices, totalPayments, today);
}

async function calculateSupplierAging(supplierId: string, _companyId: string | null): Promise<{
  totalOutstanding: number;
  current: number;
  days31to60: number;
  days61to90: number;
  days90plus: number;
  invoiceBreakdown: Array<{
    id: string;
    type: string;
    reference: string;
    date: Date;
    originalAmount: number;
    outstandingAmount: number;
    daysOutstanding: number;
    bucket: string;
  }>;
}> {
  const today = new Date();

  // NOTE: PurchaseOrder does NOT have companyId — known limitation for Stage 12
  const purchaseOrders = await db.purchaseOrder.findMany({
    where: { supplierId, status: { not: 'Draft' }, isActive: true },
    select: { id: true, date: true, grandTotal: true, poNumber: true },
  });

  // Build outstanding invoices list
  const invoices: OutstandingInvoice[] = purchaseOrders.map((po) => ({
    id: po.id,
    date: po.date,
    totalAmount: safeFinancialRound(Number(po.grandTotal)),
    type: 'PurchaseOrder',
    reference: po.poNumber,
  }));

  // STAGE 12: Get total payments for this supplier with companyId filter
  const deliveriesAgg = await db.cashDelivery.aggregate({
    where: {
      supplierId,
      isActive: true,
      status: { not: 'Draft' },
      ...(_companyId ? { companyId: _companyId } : {}),
    },
    _sum: { amount: true },
  });

  // Get total returns for this supplier
  const returnsAgg = await db.purchaseReturn.aggregate({
    where: {
      supplierId,
      isActive: true,
      status: { not: 'Draft' },
    },
    _sum: { grandTotal: true },
  });

  // STAGE 12: Use safe math for total payments
  const totalPayments = safeFinancialAdd(
    safeFinancialRound(Number(deliveriesAgg._sum.amount || 0)),
    safeFinancialRound(Number(returnsAgg._sum.grandTotal || 0))
  );

  return allocateAgingBuckets(invoices, totalPayments, today);
}
