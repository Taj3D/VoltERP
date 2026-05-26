import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, validateVatMode } from '@/lib/api-security';
import type { UserRole } from '@/lib/api-security';

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
    // VAT-001: Validate vatMode — only vat_auditor role can activate masking
    const rawVatMode = searchParams.get('vatMode') === 'true';
    const userRole = security.user.role as UserRole;
    const vatMode = validateVatMode(rawVatMode, userRole);

    const dateFilter: Record<string, Date> = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);
    const hasDateFilter = from || to;

    switch (type) {
      case 'customer':
        return await handleCustomerLedger(customerId, dateFilter, hasDateFilter, vatMode);
      case 'supplier':
        return await handleSupplierLedger(supplierId, dateFilter, hasDateFilter, vatMode);
      case 'customer-summary':
        return await handleCustomerSummary(dateFilter, hasDateFilter, vatMode);
      case 'supplier-summary':
        return await handleSupplierSummary(dateFilter, hasDateFilter, vatMode);
      case 'customer-aging':
        return await handleCustomerAging(vatMode);
      case 'supplier-aging':
        return await handleSupplierAging(vatMode);
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
  vatMode: boolean
) {
  if (!customerId) {
    return NextResponse.json({ error: 'customerId is required for type=customer' }, { status: 400 });
  }

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

  // Fetch all transactions in parallel
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
      where: { customerId, isActive: true, ...whereDate },
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

  // Opening balance
  const openingBalance = Number(customer.openingBalance);
  let runningBalance = customer.openingBalanceType === 'Cr' ? -openingBalance : openingBalance;

  // Sales Orders -> Debit (customer owes more)
  for (const so of salesOrders) {
    if (so.status !== 'Draft') {
      const amount = Number(so.grandTotal);
      runningBalance += amount;
      rows.push({
        date: so.date.toISOString(),
        referenceNo: so.invoiceNo,
        referenceType: 'Sales Order',
        debit: amount,
        credit: 0,
        runningBalance,
        status: so.status,
      });
    }
  }

  // Hire Sales -> Debit (customer owes more)
  for (const hs of hireSales) {
    if (hs.status !== 'Draft') {
      const amount = Number(hs.grandTotal);
      runningBalance += amount;
      rows.push({
        date: hs.date.toISOString(),
        referenceNo: hs.invoiceNo,
        referenceType: 'Hire Sales',
        debit: amount,
        credit: 0,
        runningBalance,
        status: hs.status,
      });
    }
  }

  // Cash Collections -> Credit (customer pays, reduces what they owe)
  for (const cc of cashCollections) {
    if (cc.status !== 'Draft') {
      const amount = Number(cc.amount);
      runningBalance -= amount;
      rows.push({
        date: cc.date.toISOString(),
        referenceNo: cc.collectionCode,
        referenceType: 'Cash Collection',
        debit: 0,
        credit: amount,
        runningBalance,
        status: cc.status,
      });
    }
  }

  // Sales Returns -> Credit (reduces what customer owes)
  for (const sr of salesReturns) {
    if (sr.status !== 'Draft') {
      const amount = Number(sr.grandTotal);
      runningBalance -= amount;
      rows.push({
        date: sr.date.toISOString(),
        referenceNo: sr.returnNo,
        referenceType: 'Sales Return',
        debit: 0,
        credit: amount,
        runningBalance,
        status: sr.status,
      });
    }
  }

  // Sort all rows by date
  rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Recalculate running balance in order
  let rb = customer.openingBalanceType === 'Cr' ? -openingBalance : openingBalance;
  for (const row of rows) {
    rb += row.debit - row.credit;
    row.runningBalance = rb;
  }

  const closingBalance = rb;

  // Calculate aging buckets for this customer
  const aging = await calculateCustomerAging(customerId);

  const result: Record<string, unknown> = {
    customer: {
      id: customer.id,
      customerCode: customer.customerCode,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
      creditLimit: Number(customer.creditLimit),
      customerType: customer.customerType,
    },
    openingBalance,
    openingBalanceType: customer.openingBalanceType,
    closingBalance,
    closingBalanceType: closingBalance >= 0 ? 'Dr' : 'Cr',
    totalDebit: rows.reduce((sum, r) => sum + r.debit, 0),
    totalCredit: rows.reduce((sum, r) => sum + r.credit, 0),
    transactions: rows,
    aging,
  };

  // VAT Auditor mode: mask cost/profit info
  if (vatMode) {
    result.vatMode = true;
    result.note = 'Internal margins masked in audit mode';
    // MIS-001 FIX: Mask creditUtilization and balance in VAT audit mode
    (result as Record<string, unknown>).creditUtilization = 'N/A (Audit Mode)';
    if (result.customer) {
      (result.customer as Record<string, unknown>).creditLimit = 'N/A (Audit Mode)';
    }
  }

  return NextResponse.json(result);
}

// ─── Individual Supplier Ledger ──────────────────────────────────────────────
async function handleSupplierLedger(
  supplierId: string | null,
  dateFilter: Record<string, Date>,
  hasDateFilter: boolean,
  vatMode: boolean
) {
  if (!supplierId) {
    return NextResponse.json({ error: 'supplierId is required for type=supplier' }, { status: 400 });
  }

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
      where: { supplierId, isActive: true, ...whereDate },
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

  const openingBalance = Number(supplier.openingBalance);
  // Supplier: Cr means we owe them, Dr means they owe us
  let runningBalance = supplier.openingBalanceType === 'Dr' ? -openingBalance : openingBalance;

  // Purchase Orders -> Credit (we owe supplier more)
  for (const po of purchaseOrders) {
    if (po.status !== 'Draft') {
      const amount = Number(po.grandTotal);
      runningBalance += amount;
      rows.push({
        date: po.date.toISOString(),
        referenceNo: po.poNumber,
        referenceType: 'Purchase Order',
        debit: 0,
        credit: amount,
        runningBalance,
        status: po.status,
      });
    }
  }

  // Cash Deliveries -> Debit (we pay supplier, reduces what we owe)
  for (const cd of cashDeliveries) {
    if (cd.status !== 'Draft') {
      const amount = Number(cd.amount);
      runningBalance -= amount;
      rows.push({
        date: cd.date.toISOString(),
        referenceNo: cd.deliveryCode,
        referenceType: 'Cash Delivery',
        debit: amount,
        credit: 0,
        runningBalance,
        status: cd.status,
      });
    }
  }

  // Purchase Returns -> Debit (reduces what we owe)
  for (const pr of purchaseReturns) {
    if (pr.status !== 'Draft') {
      const amount = Number(pr.grandTotal);
      runningBalance -= amount;
      rows.push({
        date: pr.date.toISOString(),
        referenceNo: pr.returnNo,
        referenceType: 'Purchase Return',
        debit: amount,
        credit: 0,
        runningBalance,
        status: pr.status,
      });
    }
  }

  // Sort all rows by date
  rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Recalculate running balance in order
  let rb = supplier.openingBalanceType === 'Dr' ? -openingBalance : openingBalance;
  for (const row of rows) {
    rb += row.credit - row.debit;
    row.runningBalance = rb;
  }

  const closingBalance = rb;

  // Calculate aging buckets for this supplier
  const aging = await calculateSupplierAging(supplierId);

  const result: Record<string, unknown> = {
    supplier: {
      id: supplier.id,
      supplierCode: supplier.supplierCode,
      name: supplier.name,
      phone: supplier.phone,
      email: supplier.email,
      address: supplier.address,
      creditLimit: Number(supplier.creditLimit),
    },
    openingBalance,
    openingBalanceType: supplier.openingBalanceType,
    closingBalance,
    closingBalanceType: closingBalance >= 0 ? 'Cr' : 'Dr',
    totalDebit: rows.reduce((sum, r) => sum + r.debit, 0),
    totalCredit: rows.reduce((sum, r) => sum + r.credit, 0),
    transactions: rows,
    aging,
  };

  if (vatMode) {
    result.vatMode = true;
    result.note = 'Internal margins masked in audit mode';
    // MIS-001 FIX: Mask creditUtilization for supplier in VAT audit mode
    if (result.supplier) {
      (result.supplier as Record<string, unknown>).creditLimit = 'N/A (Audit Mode)';
    }
  }

  return NextResponse.json(result);
}

// ─── Customer Summary ────────────────────────────────────────────────────────
async function handleCustomerSummary(
  dateFilter: Record<string, Date>,
  hasDateFilter: boolean,
  vatMode: boolean
) {
  const whereDate = hasDateFilter ? { date: dateFilter } : {};

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
          where: { customerId: cust.id, status: { not: 'Draft' }, isActive: true, ...whereDate },
          _sum: { amount: true },
        }),
        db.hireSales.aggregate({
          where: { customerId: cust.id, status: { not: 'Draft' }, isActive: true, ...whereDate },
          _sum: { grandTotal: true },
        }),
      ]);

      const totalSales = Number(salesAgg._sum.grandTotal || 0) + Number(hireAgg._sum.grandTotal || 0);
      const totalCollections = Number(collectionsAgg._sum.amount || 0);
      const totalReturns = Number(returnsAgg._sum.grandTotal || 0);
      const openingBal = Number(cust.openingBalance);
      const openingAdj = cust.openingBalanceType === 'Cr' ? -openingBal : openingBal;
      const balance = openingAdj + totalSales - totalCollections - totalReturns;
      const creditLimit = Number(cust.creditLimit);
      const creditUtilization = creditLimit > 0 ? Math.round((Math.abs(balance) / creditLimit) * 100) : 0;

      return {
        customerId: cust.id,
        customerCode: cust.customerCode,
        customerName: cust.name,
        phone: cust.phone,
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

  if (vatMode) {
    result.vatMode = true;
    // Mask cost/profit fields for VAT auditor
    for (const s of summaries) {
      (s as Record<string, unknown>).creditUtilization = 'N/A (Audit Mode)';
    }
  }

  return NextResponse.json(result);
}

// ─── Supplier Summary ────────────────────────────────────────────────────────
async function handleSupplierSummary(
  dateFilter: Record<string, Date>,
  hasDateFilter: boolean,
  vatMode: boolean
) {
  const whereDate = hasDateFilter ? { date: dateFilter } : {};

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
          where: { supplierId: sup.id, status: { not: 'Draft' }, isActive: true, ...whereDate },
          _sum: { amount: true },
        }),
      ]);

      const totalPurchases = Number(purchasesAgg._sum.grandTotal || 0);
      const totalDeliveries = Number(deliveriesAgg._sum.amount || 0);
      const totalReturns = Number(returnsAgg._sum.grandTotal || 0);
      const openingBal = Number(sup.openingBalance);
      const openingAdj = sup.openingBalanceType === 'Dr' ? -openingBal : openingBal;
      const balance = openingAdj + totalPurchases - totalDeliveries - totalReturns;
      const creditLimit = Number(sup.creditLimit);

      return {
        supplierId: sup.id,
        supplierCode: sup.supplierCode,
        supplierName: sup.name,
        phone: sup.phone,
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

  if (vatMode) {
    result.vatMode = true;
  }

  return NextResponse.json(result);
}

// ─── Customer Aging ──────────────────────────────────────────────────────────
async function handleCustomerAging(vatMode: boolean) {
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
      const aging = await calculateCustomerAging(cust.id);
      if (aging.totalOutstanding <= 0) return null;
      return {
        customerId: cust.id,
        customerCode: cust.customerCode,
        customerName: cust.name,
        ...aging,
      };
    })
  );

  const filtered = agingData.filter((a): a is NonNullable<typeof a> => a !== null);
  filtered.sort((a, b) => b.totalOutstanding - a.totalOutstanding);

  const result: Record<string, unknown> = {
    type: 'customer-aging',
    count: filtered.length,
    totals: {
      totalOutstanding: filtered.reduce((s, a) => s + a.totalOutstanding, 0),
      current: filtered.reduce((s, a) => s + a.current, 0),
      days31to60: filtered.reduce((s, a) => s + a.days31to60, 0),
      days61to90: filtered.reduce((s, a) => s + a.days61to90, 0),
      days90plus: filtered.reduce((s, a) => s + a.days90plus, 0),
    },
    data: filtered,
  };

  if (vatMode) {
    result.vatMode = true;
  }

  return NextResponse.json(result);
}

// ─── Supplier Aging ──────────────────────────────────────────────────────────
async function handleSupplierAging(vatMode: boolean) {
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
      const aging = await calculateSupplierAging(sup.id);
      if (aging.totalOutstanding <= 0) return null;
      return {
        supplierId: sup.id,
        supplierCode: sup.supplierCode,
        supplierName: sup.name,
        ...aging,
      };
    })
  );

  const filtered = agingData.filter((a): a is NonNullable<typeof a> => a !== null);
  filtered.sort((a, b) => b.totalOutstanding - a.totalOutstanding);

  const result: Record<string, unknown> = {
    type: 'supplier-aging',
    count: filtered.length,
    totals: {
      totalOutstanding: filtered.reduce((s, a) => s + a.totalOutstanding, 0),
      current: filtered.reduce((s, a) => s + a.current, 0),
      days31to60: filtered.reduce((s, a) => s + a.days31to60, 0),
      days61to90: filtered.reduce((s, a) => s + a.days61to90, 0),
      days90plus: filtered.reduce((s, a) => s + a.days90plus, 0),
    },
    data: filtered,
  };

  if (vatMode) {
    result.vatMode = true;
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
    remainingPayments -= paidAgainstThis;
    const outstanding = inv.totalAmount - paidAgainstThis;

    const daysOutstanding = Math.floor(
      (today.getTime() - new Date(inv.date).getTime()) / (1000 * 60 * 60 * 24)
    );

    let bucket = 'current';
    if (outstanding > 0) {
      if (daysOutstanding <= 30) {
        current += outstanding;
        bucket = 'current';
      } else if (daysOutstanding <= 60) {
        days31to60 += outstanding;
        bucket = '31-60';
      } else if (daysOutstanding <= 90) {
        days61to90 += outstanding;
        bucket = '61-90';
      } else {
        days90plus += outstanding;
        bucket = '90+';
      }
    }

    invoiceBreakdown.push({
      id: inv.id,
      type: inv.type,
      reference: inv.reference,
      date: inv.date,
      originalAmount: inv.totalAmount,
      outstandingAmount: outstanding,
      daysOutstanding,
      bucket,
    });
  }

  const totalOutstanding = current + days31to60 + days61to90 + days90plus;
  return { totalOutstanding, current, days31to60, days61to90, days90plus, invoiceBreakdown };
}

async function calculateCustomerAging(customerId: string): Promise<{
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
      totalAmount: Number(so.grandTotal),
      type: 'SalesOrder',
      reference: so.id,
    })),
    ...overdueInstallments.map((hi) => ({
      id: hi.id,
      date: hi.dueDate,
      totalAmount: Number(hi.amount),
      type: 'HireInstallment',
      reference: hi.hireSales?.invoiceNo || hi.id,
    })),
  ];

  // Get total collections for this customer
  const collectionsAgg = await db.cashCollection.aggregate({
    where: {
      customerId,
      isActive: true,
      status: { not: 'Draft' },
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

  const totalPayments = Number(collectionsAgg._sum.amount || 0) + Number(returnsAgg._sum.grandTotal || 0);

  return allocateAgingBuckets(invoices, totalPayments, today);
}

async function calculateSupplierAging(supplierId: string): Promise<{
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

  const purchaseOrders = await db.purchaseOrder.findMany({
    where: { supplierId, status: { not: 'Draft' }, isActive: true },
    select: { id: true, date: true, grandTotal: true, poNumber: true },
  });

  // Build outstanding invoices list
  const invoices: OutstandingInvoice[] = purchaseOrders.map((po) => ({
    id: po.id,
    date: po.date,
    totalAmount: Number(po.grandTotal),
    type: 'PurchaseOrder',
    reference: po.poNumber,
  }));

  // Get total payments for this supplier
  const deliveriesAgg = await db.cashDelivery.aggregate({
    where: {
      supplierId,
      isActive: true,
      status: { not: 'Draft' },
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

  const totalPayments = Number(deliveriesAgg._sum.amount || 0) + Number(returnsAgg._sum.grandTotal || 0);

  return allocateAgingBuckets(invoices, totalPayments, today);
}
