// ============================================================
// SUPPLIER BALANCE ENGINE — Real-time AP (Accounts Payable) Computation
// Computes outstanding balances by aggregating all transaction types
// and optionally writes computed balances back to Supplier records.
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, safeFinancialRound, safeFinancialAdd, safeFinancialSubtract, maskFinancialArray } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// Balance fields that must be masked for VAT Auditor on supplier balances
const SUPPLIER_BALANCE_SENSITIVE_FIELDS = [
  'openingBalance', 'openingBalanceType',
  'totalPurchaseOrders', 'totalCashDeliveries', 'totalPurchaseReturns',
  'currentBalance', 'currentBalanceType',
  'creditLimit', 'creditUtilization', 'creditStatus',
];

interface SupplierBalanceResult {
  supplierId: string;
  supplierCode: string;
  name: string;
  openingBalance: number;
  openingBalanceType: string;
  totalPurchaseOrders: number;
  totalCashDeliveries: number;
  totalPurchaseReturns: number;
  currentBalance: number;
  currentBalanceType: 'Dr' | 'Cr';
  creditLimit: number;
  creditUtilization: number;
  creditStatus: 'Active' | 'OverLimit' | 'Frozen';
}

/**
 * computeSupplierBalance - Computes real-time AP balance for a single supplier.
 *
 * AP Logic (from the business's perspective):
 * - Opening Balance Cr → we owe supplier (Credit, increases payable)
 * - Opening Balance Dr → supplier owes us / advance (Debit, decreases payable)
 * - Purchase Order grandTotal (non-Cancelled) → Credit (increases payable)
 * - Cash Delivery amount → Debit (decreases payable — we paid them)
 * - Purchase Return grandTotal (non-Cancelled) → Debit (decreases payable — returned goods)
 *
 * Net = Credits - Debits
 * If net > 0 → Cr (we owe supplier)
 * If net < 0 → Dr (supplier owes us / advance payment)
 */
export async function computeSupplierBalance(
  supplierId: string,
  companyId?: string | null
): Promise<SupplierBalanceResult | null> {
  // Fetch the supplier
  const companyFilter = companyId ? { companyId, isActive: true } : { isActive: true };
  const supplier = await db.supplier.findFirst({
    where: { id: supplierId, ...companyFilter },
    select: {
      id: true,
      supplierCode: true,
      name: true,
      openingBalance: true,
      openingBalanceType: true,
      creditLimit: true,
      creditStatus: true,
    },
  });

  if (!supplier) return null;

  // Aggregate Purchase Orders (grandTotal where status != 'Cancelled')
  const purchaseOrdersAgg = await db.purchaseOrder.aggregate({
    where: {
      supplierId,
      status: { not: 'Cancelled' },
      isActive: true,
      ...(companyId ? { companyId } : {}),
    },
    _sum: { grandTotal: true },
  });

  // Aggregate Cash Deliveries (amount)
  const cashDeliveriesAgg = await db.cashDelivery.aggregate({
    where: {
      supplierId,
      isActive: true,
      ...(companyId ? { companyId } : {}),
    },
    _sum: { amount: true },
  });

  // Aggregate Purchase Returns (grandTotal where status != 'Cancelled')
  const purchaseReturnsAgg = await db.purchaseReturn.aggregate({
    where: {
      supplierId,
      status: { not: 'Cancelled' },
      isActive: true,
      ...(companyId ? { companyId } : {}),
    },
    _sum: { grandTotal: true },
  });

  const totalPurchaseOrders = safeFinancialRound(purchaseOrdersAgg._sum.grandTotal || 0);
  const totalCashDeliveries = safeFinancialRound(cashDeliveriesAgg._sum.amount || 0);
  const totalPurchaseReturns = safeFinancialRound(purchaseReturnsAgg._sum.grandTotal || 0);

  // Opening balance logic for suppliers: Cr increases payable, Dr decreases payable
  const openingCr = supplier.openingBalanceType === 'Cr' ? supplier.openingBalance : 0;
  const openingDr = supplier.openingBalanceType === 'Dr' ? supplier.openingBalance : 0;

  // Net AP balance = Credits - Debits
  // Credits: opening Cr + purchase orders
  // Debits: opening Dr + cash deliveries + purchase returns
  const totalCredits = safeFinancialAdd(openingCr, totalPurchaseOrders);
  const totalDebits = safeFinancialAdd(safeFinancialAdd(openingDr, totalCashDeliveries), totalPurchaseReturns);

  const netBalance = safeFinancialSubtract(totalCredits, totalDebits);

  // Determine balance type: positive = Cr (we owe supplier), negative = Dr (supplier owes us)
  const currentBalance = Math.abs(netBalance);
  const currentBalanceType: 'Dr' | 'Cr' = netBalance >= 0 ? 'Cr' : 'Dr';

  // Credit utilization: (abs(currentBalance) / creditLimit * 100) if creditLimit > 0
  const creditLimit = safeFinancialRound(supplier.creditLimit || 0);
  const creditUtilization = creditLimit > 0
    ? safeFinancialRound((currentBalance / creditLimit) * 100)
    : 0;

  // Determine credit status
  // Preserve "Frozen" if manually set; otherwise compute Active/OverLimit
  let creditStatus: 'Active' | 'OverLimit' | 'Frozen';
  if (supplier.creditStatus === 'Frozen') {
    creditStatus = 'Frozen';
  } else if (creditLimit > 0 && currentBalance > creditLimit) {
    creditStatus = 'OverLimit';
  } else {
    creditStatus = 'Active';
  }

  return {
    supplierId: supplier.id,
    supplierCode: supplier.supplierCode,
    name: supplier.name,
    openingBalance: supplier.openingBalance,
    openingBalanceType: supplier.openingBalanceType,
    totalPurchaseOrders,
    totalCashDeliveries,
    totalPurchaseReturns,
    currentBalance,
    currentBalanceType,
    creditLimit,
    creditUtilization,
    creditStatus,
  };
}

/**
 * computeAllSupplierBalances - Computes AP balances for all suppliers (optionally filtered by companyId).
 */
export async function computeAllSupplierBalances(
  companyId?: string | null
): Promise<SupplierBalanceResult[]> {
  const where = {
    isActive: true,
    ...(companyId ? { companyId } : {}),
  };

  const suppliers = await db.supplier.findMany({
    where,
    select: {
      id: true,
      supplierCode: true,
      name: true,
      openingBalance: true,
      openingBalanceType: true,
      creditLimit: true,
      creditStatus: true,
    },
  });

  const results: SupplierBalanceResult[] = [];

  for (const supplier of suppliers) {
    const balance = await computeSupplierBalance(supplier.id, companyId);
    if (balance) {
      results.push(balance);
    }
  }

  return results;
}

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Suppliers', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const supplierId = searchParams.get('supplierId');
    const recalculate = searchParams.get('recalculate') === 'true';
    const companyId = security.user.companyId;

    let balances: SupplierBalanceResult[];

    if (supplierId) {
      // Compute balance for a single supplier
      const balance = await computeSupplierBalance(supplierId, companyId);
      if (!balance) {
        return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
      }
      balances = [balance];
    } else {
      // Compute balances for all suppliers
      balances = await computeAllSupplierBalances(companyId);
    }

    // Recalculate mode: write computed balances back to Supplier records
    if (recalculate) {
      await db.$transaction(
        balances.map((b) =>
          db.supplier.update({
            where: { id: b.supplierId },
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
        module: 'Fin-AP-Balance',
        recordId: supplierId || 'ALL',
        recordLabel: supplierId ? `Supplier balance recalculation: ${balances[0]?.supplierCode}` : 'Bulk supplier balance recalculation',
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          mode: 'recalculate',
          count: balances.length,
          supplierId: supplierId || 'ALL',
        }),
      });
    }

    // Apply VAT Auditor masking with balance-specific fields
    const maskedBalances = maskFinancialArray(balances as unknown as Record<string, unknown>[], security.user.role, SUPPLIER_BALANCE_SENSITIVE_FIELDS) as unknown as SupplierBalanceResult[];

    return NextResponse.json({
      data: maskedBalances,
      recalculated: recalculate,
      count: balances.length,
    });
  } catch (error) {
    console.error('[SupplierBalances] Error computing balances:', error);
    return NextResponse.json({ error: 'Failed to compute supplier balances' }, { status: 500 });
  }
}
