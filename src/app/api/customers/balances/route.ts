// ============================================================
// CUSTOMER BALANCE ENGINE — Real-time AR (Accounts Receivable) Computation
// Computes outstanding balances by aggregating all transaction types
// and optionally writes computed balances back to Customer records.
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, safeFinancialRound, safeFinancialAdd, safeFinancialSubtract, maskFinancialArray, maskForVatAuditor, UserRole } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

interface CustomerBalanceResult {
  customerId: string;
  customerCode: string;
  name: string;
  openingBalance: number;
  openingBalanceType: string;
  totalSalesOrders: number;
  totalHireSales: number;
  totalCashCollections: number;
  totalSalesReturns: number;
  currentBalance: number;
  currentBalanceType: 'Dr' | 'Cr';
  creditLimit: number;
  creditUtilization: number;
  creditStatus: 'Active' | 'OverLimit' | 'Frozen';
}

/**
 * computeCustomerBalance - Computes real-time AR balance for a single customer.
 *
 * AR Logic (from the business's perspective):
 * - Opening Balance Dr → customer owes us (Debit, increases receivable)
 * - Opening Balance Cr → we owe customer (Credit, decreases receivable)
 * - Sales Order grandTotal (non-Cancelled) → Debit (increases receivable)
 * - Hire Sales grandTotal (non-Cancelled) → Debit (increases receivable)
 * - Cash Collection amount → Credit (decreases receivable)
 * - Sales Return grandTotal (non-Cancelled) → Credit (decreases receivable)
 *
 * Net = Opening(Dr) + Sales + Hire - Collections - Returns - Opening(Cr)
 * If net > 0 → Dr (customer owes us)
 * If net < 0 → Cr (we owe customer)
 */
export async function computeCustomerBalance(
  customerId: string,
  companyId?: string | null
): Promise<CustomerBalanceResult | null> {
  // Fetch the customer
  const companyFilter = companyId ? { companyId, isActive: true } : { isActive: true };
  const customer = await db.customer.findFirst({
    where: { id: customerId, ...companyFilter },
    select: {
      id: true,
      customerCode: true,
      name: true,
      openingBalance: true,
      openingBalanceType: true,
      creditLimit: true,
      creditStatus: true,
    },
  });

  if (!customer) return null;

  // Aggregate Sales Orders (grandTotal where status != 'Cancelled')
  const salesOrdersAgg = await db.salesOrder.aggregate({
    where: {
      customerId,
      status: { not: 'Cancelled' },
      isActive: true,
      ...(companyId ? { companyId } : {}),
    },
    _sum: { grandTotal: true },
  });

  // Aggregate Hire Sales (grandTotal where status != 'Cancelled')
  const hireSalesAgg = await db.hireSales.aggregate({
    where: {
      customerId,
      status: { not: 'Cancelled' },
      isActive: true,
      ...(companyId ? { companyId } : {}),
    },
    _sum: { grandTotal: true },
  });

  // Aggregate Cash Collections (amount)
  const cashCollectionsAgg = await db.cashCollection.aggregate({
    where: {
      customerId,
      isActive: true,
      ...(companyId ? { companyId } : {}),
    },
    _sum: { amount: true },
  });

  // Aggregate Sales Returns (grandTotal where status != 'Cancelled')
  const salesReturnsAgg = await db.salesReturn.aggregate({
    where: {
      customerId,
      status: { not: 'Cancelled' },
      isActive: true,
      ...(companyId ? { companyId } : {}),
    },
    _sum: { grandTotal: true },
  });

  const totalSalesOrders = safeFinancialRound(salesOrdersAgg._sum.grandTotal || 0);
  const totalHireSales = safeFinancialRound(hireSalesAgg._sum.grandTotal || 0);
  const totalCashCollections = safeFinancialRound(cashCollectionsAgg._sum.amount || 0);
  const totalSalesReturns = safeFinancialRound(salesReturnsAgg._sum.grandTotal || 0);

  // Opening balance logic: Dr increases receivable, Cr decreases receivable
  const openingDr = customer.openingBalanceType === 'Dr' ? customer.openingBalance : 0;
  const openingCr = customer.openingBalanceType === 'Cr' ? customer.openingBalance : 0;

  // Net AR balance = Debits - Credits
  // Debits: opening Dr + sales + hire sales
  // Credits: opening Cr + cash collections + sales returns
  const totalDebits = safeFinancialAdd(safeFinancialAdd(openingDr, totalSalesOrders), totalHireSales);
  const totalCredits = safeFinancialAdd(safeFinancialAdd(openingCr, totalCashCollections), totalSalesReturns);

  const netBalance = safeFinancialSubtract(totalDebits, totalCredits);

  // Determine balance type: positive = Dr (customer owes us), negative = Cr (we owe customer)
  const currentBalance = Math.abs(netBalance);
  const currentBalanceType: 'Dr' | 'Cr' = netBalance >= 0 ? 'Dr' : 'Cr';

  // Credit utilization: (abs(currentBalance) / creditLimit * 100) if creditLimit > 0
  const creditLimit = safeFinancialRound(customer.creditLimit || 0);
  const creditUtilization = creditLimit > 0
    ? safeFinancialRound((currentBalance / creditLimit) * 100)
    : 0;

  // Determine credit status
  // Preserve "Frozen" if manually set; otherwise compute Active/OverLimit
  let creditStatus: 'Active' | 'OverLimit' | 'Frozen';
  if (customer.creditStatus === 'Frozen') {
    creditStatus = 'Frozen';
  } else if (creditLimit > 0 && currentBalance > creditLimit) {
    creditStatus = 'OverLimit';
  } else {
    creditStatus = 'Active';
  }

  return {
    customerId: customer.id,
    customerCode: customer.customerCode,
    name: customer.name,
    openingBalance: customer.openingBalance,
    openingBalanceType: customer.openingBalanceType,
    totalSalesOrders,
    totalHireSales,
    totalCashCollections,
    totalSalesReturns,
    currentBalance,
    currentBalanceType,
    creditLimit,
    creditUtilization,
    creditStatus,
  };
}

/**
 * computeAllCustomerBalances - Computes AR balances for all customers (optionally filtered by companyId).
 */
export async function computeAllCustomerBalances(
  companyId?: string | null
): Promise<CustomerBalanceResult[]> {
  const where = {
    isActive: true,
    ...(companyId ? { companyId } : {}),
  };

  const customers = await db.customer.findMany({
    where,
    select: {
      id: true,
      customerCode: true,
      name: true,
      openingBalance: true,
      openingBalanceType: true,
      creditLimit: true,
      creditStatus: true,
    },
  });

  const results: CustomerBalanceResult[] = [];

  // Batch aggregate for efficiency
  for (const customer of customers) {
    const balance = await computeCustomerBalance(customer.id, companyId);
    if (balance) {
      results.push(balance);
    }
  }

  return results;
}

// Balance fields that must be masked for non-admin/manager roles
const CUSTOMER_BALANCE_SENSITIVE_FIELDS = [
  'openingBalance', 'openingBalanceType',
  'totalSalesOrders', 'totalHireSales', 'totalCashCollections', 'totalSalesReturns',
  'currentBalance', 'currentBalanceType',
  'creditLimit', 'creditUtilization', 'creditStatus',
];

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Customers', 'GET');
  if (!security.authorized) return security.response;

  // Dealer: 403 — customer balances are restricted entirely
  if (security.user.role === 'dealer') {
    return NextResponse.json(
      { error: 'Access denied. Dealer role cannot access customer balance information.' },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId');
    const recalculate = searchParams.get('recalculate') === 'true';
    const companyId = security.user.companyId;

    let balances: CustomerBalanceResult[];

    if (customerId) {
      // Compute balance for a single customer
      const balance = await computeCustomerBalance(customerId, companyId);
      if (!balance) {
        return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
      }
      balances = [balance];
    } else {
      // Compute balances for all customers
      balances = await computeAllCustomerBalances(companyId);
    }

    // Recalculate mode: write computed balances back to Customer records
    if (recalculate) {
      await db.$transaction(
        balances.map((b) =>
          db.customer.update({
            where: { id: b.customerId },
            data: {
              currentBalance: b.currentBalance,
              currentBalanceType: b.currentBalanceType,
              creditStatus: b.creditStatus,
            },
          })
        )
      );

      // Log the recalculation activity
      await logUserActivity({
        action: 'UPDATE',
        module: 'Fin-AR-Balance',
        recordId: customerId || 'ALL',
        recordLabel: customerId ? `Customer balance recalculation: ${balances[0]?.customerCode}` : 'Bulk customer balance recalculation',
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          mode: 'recalculate',
          count: balances.length,
          customerId: customerId || 'ALL',
        }),
      });
    }

    // Apply role-based masking
    let maskedBalances: CustomerBalanceResult[];
    const role = security.user.role as UserRole;

    if (role === 'sr') {
      // SR: mask all financial/balance fields — only see customerId, customerCode, name
      maskedBalances = balances.map(b =>
        maskForVatAuditor(b as unknown as Record<string, unknown>, role, CUSTOMER_BALANCE_SENSITIVE_FIELDS) as unknown as CustomerBalanceResult
      );
    } else {
      // VAT Auditor + admin/manager: use financial masking with balance-specific extra fields
      maskedBalances = maskFinancialArray(balances as unknown as Record<string, unknown>[], role, CUSTOMER_BALANCE_SENSITIVE_FIELDS) as unknown as CustomerBalanceResult[];
    }

    return NextResponse.json({
      data: maskedBalances,
      recalculated: recalculate,
      count: balances.length,
    });
  } catch (error) {
    console.error('[CustomerBalances] Error computing balances:', error);
    return NextResponse.json({ error: 'Failed to compute customer balances' }, { status: 500 });
  }
}
