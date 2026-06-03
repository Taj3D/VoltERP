// ============================================================
// FRAUD DETECTION ANALYTICS API — Live Analytical Tracker
// Financial Audit Module: Asset Valuation, Age Distribution,
// Ledger Integrity, and Anomaly Detection
// ============================================================
// Multi-tenant companyId isolation, safeFinancial arithmetic,
// VAT Auditor masking, RBAC enforcement, activity logging
// with Audit-Fraud-Detection module token.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  safeFinancialAdd,
  safeFinancialSubtract,
  safeFinancialRound,
  maskDashboardForVatAuditor,
  type UserRole,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';
import { db } from '@/lib/db';

// Age bracket definitions (days)
const AGE_BRACKETS = [
  { label: '0-30 days', min: 0, max: 30 },
  { label: '31-60 days', min: 31, max: 60 },
  { label: '61-90 days', min: 61, max: 90 },
  { label: '91-180 days', min: 91, max: 180 },
  { label: '181-365 days', min: 181, max: 365 },
  { label: '365+ days', min: 366, max: Infinity },
];

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'AuditDashboard', 'GET');
  if (!security.authorized) return security.response;

  try {
    const userRole = security.user.role as UserRole;
    const companyId = security.user.companyId;

    // Build company-scoped where clauses
    const productWhere: Record<string, unknown> = { isActive: true };
    const stockEntryWhere: Record<string, unknown> = { isActive: true };
    const ledgerEntryWhere: Record<string, unknown> = { isActive: true };
    const coaWhere: Record<string, unknown> = { isActive: true };
    const customerWhere: Record<string, unknown> = { isActive: true };
    const supplierWhere: Record<string, unknown> = { isActive: true };
    const ledgerAutoPostWhere: Record<string, unknown> = {};
    const salesOrderWhere: Record<string, unknown> = { isActive: true };
    const purchaseOrderWhere: Record<string, unknown> = { isActive: true };

    if (companyId) {
      productWhere.companyId = companyId;
      stockEntryWhere.companyId = companyId;
      ledgerEntryWhere.companyId = companyId;
      coaWhere.companyId = companyId;
      customerWhere.companyId = companyId;
      supplierWhere.companyId = companyId;
      ledgerAutoPostWhere.companyId = companyId;
      salesOrderWhere.companyId = companyId;
      purchaseOrderWhere.companyId = companyId;
    }

    // ============================================================
    // A) ASSET VALUATION METRICS
    // Compare book value (costPrice * stock) vs market value (salePrice * stock)
    // Flag discrepancies > 20% as "Valuation Risk"
    // ============================================================
    const products = await db.product.findMany({
      where: productWhere,
      select: {
        id: true,
        productCode: true,
        name: true,
        costPrice: true,
        salePrice: true,
        openingStock: true,
      },
    });

    let totalBookValue = 0;
    let totalMarketValue = 0;
    const valuationRisk: {
      productId: string;
      productCode: string;
      name: string;
      bookValue: number;
      marketValue: number;
      discrepancyPercent: number;
    }[] = [];

    for (const product of products) {
      // Compute current stock from stock entries
      const [inAgg, outAgg] = await Promise.all([
        db.stockEntry.aggregate({
          where: { ...stockEntryWhere, productId: product.id, type: 'IN' },
          _sum: { quantity: true },
        }),
        db.stockEntry.aggregate({
          where: { ...stockEntryWhere, productId: product.id, type: 'OUT' },
          _sum: { quantity: true },
        }),
      ]);

      const totalIn = inAgg._sum.quantity || 0;
      const totalOut = outAgg._sum.quantity || 0;
      const stock = safeFinancialSubtract(totalIn, totalOut);

      const bookValue = safeFinancialRound(product.costPrice * stock);
      const marketValue = safeFinancialRound(product.salePrice * stock);

      totalBookValue = safeFinancialAdd(totalBookValue, bookValue);
      totalMarketValue = safeFinancialAdd(totalMarketValue, marketValue);

      // Flag discrepancies > 20%
      if (bookValue > 0) {
        const discrepancyPercent = safeFinancialRound(
          (Math.abs(safeFinancialSubtract(marketValue, bookValue)) / bookValue) * 100
        );
        if (discrepancyPercent > 20) {
          valuationRisk.push({
            productId: product.id,
            productCode: product.productCode,
            name: product.name,
            bookValue,
            marketValue,
            discrepancyPercent,
          });
        }
      }
    }

    const valuationGap = safeFinancialSubtract(totalMarketValue, totalBookValue);

    // ============================================================
    // B) AGE DISTRIBUTION LOGS
    // Analyze inventory age distribution using StockEntry dates
    // Flag brackets with > 30% of total value as "Aging Risk"
    // ============================================================
    const stockEntries = await db.stockEntry.findMany({
      where: { ...stockEntryWhere, type: 'IN' },
      select: {
        id: true,
        productId: true,
        quantity: true,
        costPrice: true,
        date: true,
        product: { select: { costPrice: true, salePrice: true } },
      },
    });

    const now = new Date();
    const brackets = AGE_BRACKETS.map((bracket) => ({
      label: bracket.label,
      count: 0,
      totalValue: 0,
      isAgingRisk: false,
    }));

    let totalInventoryValue = 0;

    for (const entry of stockEntries) {
      const ageMs = now.getTime() - new Date(entry.date).getTime();
      const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

      // Find matching bracket
      const bracketIdx = AGE_BRACKETS.findIndex(
        (b) => ageDays >= b.min && ageDays <= b.max
      );

      if (bracketIdx >= 0) {
        const value = safeFinancialRound(
          entry.costPrice > 0
            ? entry.costPrice * entry.quantity
            : (entry.product?.costPrice || 0) * entry.quantity
        );
        brackets[bracketIdx].count++;
        brackets[bracketIdx].totalValue = safeFinancialAdd(
          brackets[bracketIdx].totalValue,
          value
        );
        totalInventoryValue = safeFinancialAdd(totalInventoryValue, value);
      }
    }

    // Flag brackets with > 30% of total value
    let agingRiskCount = 0;
    for (const bracket of brackets) {
      if (
        totalInventoryValue > 0 &&
        (bracket.totalValue / totalInventoryValue) * 100 > 30
      ) {
        bracket.isAgingRisk = true;
        agingRiskCount++;
      }
    }

    // ============================================================
    // C) LEDGER INTEGRITY STATUS
    // Check for unbalanced entries, orphan entries, duplicate refs,
    // and missing auto-post records
    // ============================================================
    const ledgerEntries = await db.ledgerEntry.findMany({
      where: ledgerEntryWhere,
      select: {
        id: true,
        entryCode: true,
        date: true,
        accountId: true,
        account: true,
        debit: true,
        credit: true,
        reference: true,
      },
    });

    // C1: Unbalanced entries (debit != credit per date group)
    const dateGroups: Record<string, { debit: number; credit: number }> = {};
    for (const entry of ledgerEntries) {
      const dateKey = new Date(entry.date).toISOString().split('T')[0];
      if (!dateGroups[dateKey]) {
        dateGroups[dateKey] = { debit: 0, credit: 0 };
      }
      dateGroups[dateKey].debit = safeFinancialAdd(
        dateGroups[dateKey].debit,
        entry.debit
      );
      dateGroups[dateKey].credit = safeFinancialAdd(
        dateGroups[dateKey].credit,
        entry.credit
      );
    }

    const unbalancedDates: {
      date: string;
      totalDebit: number;
      totalCredit: number;
      difference: number;
    }[] = [];

    for (const [dateKey, totals] of Object.entries(dateGroups)) {
      const diff = safeFinancialRound(
        Math.abs(safeFinancialSubtract(totals.debit, totals.credit))
      );
      if (diff > 0.01) {
        unbalancedDates.push({
          date: dateKey,
          totalDebit: totals.debit,
          totalCredit: totals.credit,
          difference: diff,
        });
      }
    }

    const isBalanced = unbalancedDates.length === 0;

    // C2: Orphan entries (accountId pointing to non-existent COA)
    let orphanEntries = 0;
    if (ledgerEntries.length > 0) {
      const coaIds = await db.chartOfAccount.findMany({
        where: coaWhere,
        select: { id: true },
      });
      const validCoaIds = new Set(coaIds.map((c) => c.id));

      for (const entry of ledgerEntries) {
        if (entry.accountId && !validCoaIds.has(entry.accountId)) {
          orphanEntries++;
        }
      }
    }

    // C3: Duplicate posting references
    const referenceCounts: Record<string, number> = {};
    for (const entry of ledgerEntries) {
      if (entry.reference) {
        referenceCounts[entry.reference] =
          (referenceCounts[entry.reference] || 0) + 1;
      }
    }
    const duplicateReferences = Object.values(referenceCounts).filter(
      (count) => count > 1
    ).length;

    // C4: Missing auto-post records for confirmed sales/purchases
    const confirmedSales = await db.salesOrder.findMany({
      where: { ...salesOrderWhere, status: { in: ['Confirmed', 'Delivered', 'Completed'] } },
      select: { id: true, invoiceNo: true },
    });

    const confirmedPurchases = await db.purchaseOrder.findMany({
      where: { ...purchaseOrderWhere, status: { in: ['Confirmed', 'Partially Received', 'Received'] } },
      select: { id: true, poNumber: true },
    });

    const autoPosts = await db.ledgerAutoPost.findMany({
      where: ledgerAutoPostWhere,
      select: { sourceId: true, sourceType: true },
    });

    const postedSourceIds = new Set(autoPosts.map((ap) => ap.sourceId));

    let missingAutoPosts = 0;
    for (const so of confirmedSales) {
      if (!postedSourceIds.has(so.id)) {
        missingAutoPosts++;
      }
    }
    for (const po of confirmedPurchases) {
      if (!postedSourceIds.has(po.id)) {
        missingAutoPosts++;
      }
    }

    // ============================================================
    // D) ANOMALY DETECTION
    // Negative margins, concentration risk, credit limit breaches,
    // overdue suppliers
    // ============================================================

    // D1: Products with sale price below cost price (negative margin)
    const negativeMargins: {
      productId: string;
      productCode: string;
      name: string;
      costPrice: number;
      salePrice: number;
      marginPercent: number;
    }[] = [];

    for (const product of products) {
      if (product.costPrice > 0 && product.salePrice < product.costPrice) {
        const marginPercent = safeFinancialRound(
          ((product.salePrice - product.costPrice) / product.costPrice) * 100
        );
        negativeMargins.push({
          productId: product.id,
          productCode: product.productCode,
          name: product.name,
          costPrice: product.costPrice,
          salePrice: product.salePrice,
          marginPercent,
        });
      }
    }

    // D2: Stock value exceeding 50% of total inventory value (concentration risk)
    const concentrationRisks: {
      productId: string;
      productCode: string;
      name: string;
      stockValue: number;
      concentrationPercent: number;
    }[] = [];

    if (totalBookValue > 0) {
      for (const product of products) {
        // Recompute stock value for each product
        const [inAgg2, outAgg2] = await Promise.all([
          db.stockEntry.aggregate({
            where: { ...stockEntryWhere, productId: product.id, type: 'IN' },
            _sum: { quantity: true },
          }),
          db.stockEntry.aggregate({
            where: { ...stockEntryWhere, productId: product.id, type: 'OUT' },
            _sum: { quantity: true },
          }),
        ]);

        const stock = safeFinancialSubtract(
          inAgg2._sum.quantity || 0,
          outAgg2._sum.quantity || 0
        );
        const stockValue = safeFinancialRound(product.costPrice * stock);

        if (stockValue > 0 && totalBookValue > 0) {
          const concentrationPercent = safeFinancialRound(
            (stockValue / totalBookValue) * 100
          );
          if (concentrationPercent > 50) {
            concentrationRisks.push({
              productId: product.id,
              productCode: product.productCode,
              name: product.name,
              stockValue,
              concentrationPercent,
            });
          }
        }
      }
    }

    // D3: Customers exceeding credit limit
    const customers = await db.customer.findMany({
      where: customerWhere,
      select: {
        id: true,
        customerCode: true,
        name: true,
        creditLimit: true,
        currentBalance: true,
        currentBalanceType: true,
      },
    });

    const creditLimitBreaches: {
      customerId: string;
      customerCode: string;
      name: string;
      creditLimit: number;
      currentBalance: number;
      excessAmount: number;
    }[] = [];

    for (const customer of customers) {
      if (customer.creditLimit > 0) {
        const effectiveBalance =
          customer.currentBalanceType === 'Dr' ? customer.currentBalance : 0;
        if (effectiveBalance > customer.creditLimit) {
          creditLimitBreaches.push({
            customerId: customer.id,
            customerCode: customer.customerCode,
            name: customer.name,
            creditLimit: customer.creditLimit,
            currentBalance: effectiveBalance,
            excessAmount: safeFinancialSubtract(
              effectiveBalance,
              customer.creditLimit
            ),
          });
        }
      }
    }

    // D4: Suppliers with payment overdue > 90 days
    const suppliers = await db.supplier.findMany({
      where: supplierWhere,
      include: {
        purchaseOrders: {
          where: { status: { in: ['Confirmed', 'Partially Received', 'Received'] } },
          select: { id: true, date: true, grandTotal: true },
        },
        cashDeliveries: {
          select: { id: true, amount: true, date: true },
        },
      },
    });

    const overdueSuppliers: {
      supplierId: string;
      supplierCode: string;
      name: string;
      totalPayable: number;
      totalPaid: number;
      overdueAmount: number;
      oldestOverdueDays: number;
    }[] = [];

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    for (const supplier of suppliers) {
      const totalPayable = supplier.purchaseOrders.reduce(
        (sum, po) => safeFinancialAdd(sum, po.grandTotal),
        0
      );
      const totalPaid = supplier.cashDeliveries.reduce(
        (sum, cd) => safeFinancialAdd(sum, cd.amount),
        0
      );
      const outstanding = safeFinancialSubtract(totalPayable, totalPaid);

      if (outstanding > 0) {
        // Find oldest unpaid PO
        const oldestPO = supplier.purchaseOrders
          .filter((po) => new Date(po.date) < ninetyDaysAgo)
          .sort(
            (a, b) =>
              new Date(a.date).getTime() - new Date(b.date).getTime()
          )[0];

        if (oldestPO) {
          const oldestDays = Math.floor(
            (now.getTime() - new Date(oldestPO.date).getTime()) /
              (1000 * 60 * 60 * 24)
          );
          overdueSuppliers.push({
            supplierId: supplier.id,
            supplierCode: supplier.supplierCode,
            name: supplier.name,
            totalPayable,
            totalPaid,
            overdueAmount: outstanding,
            oldestOverdueDays: oldestDays,
          });
        }
      }
    }

    // ============================================================
    // OVERALL HEALTH SCORE (0-100)
    // Weighted scoring:
    //   Ledger balanced: 25 points (deduct per unbalanced date)
    //   No orphan entries: 15 points
    //   No duplicate references: 10 points
    //   No missing auto-posts: 15 points
    //   No valuation risks: 15 points
    //   No aging risks: 10 points
    //   No anomalies: 10 points
    // ============================================================
    let healthScore = 100;

    // Deduct for unbalanced dates (up to 25 points)
    healthScore -= Math.min(25, unbalancedDates.length * 5);

    // Deduct for orphan entries (up to 15 points)
    healthScore -= Math.min(15, orphanEntries * 3);

    // Deduct for duplicate references (up to 10 points)
    healthScore -= Math.min(10, duplicateReferences * 2);

    // Deduct for missing auto-posts (up to 15 points)
    healthScore -= Math.min(15, missingAutoPosts * 3);

    // Deduct for valuation risks (up to 15 points)
    healthScore -= Math.min(15, valuationRisk.length * 3);

    // Deduct for aging risks (up to 10 points)
    healthScore -= Math.min(10, agingRiskCount * 5);

    // Deduct for anomalies (up to 10 points)
    const anomalyCount =
      negativeMargins.length +
      concentrationRisks.length +
      creditLimitBreaches.length +
      overdueSuppliers.length;
    healthScore -= Math.min(10, anomalyCount * 2);

    healthScore = Math.max(0, healthScore);

    // ============================================================
    // BUILD RESPONSE
    // ============================================================
    const responseData: Record<string, unknown> = {
      assetValuation: {
        totalBookValue,
        totalMarketValue,
        valuationRisk,
        valuationGap,
      },
      ageDistribution: {
        brackets: brackets.map((b) => ({
          label: b.label,
          count: b.count,
          totalValue: safeFinancialRound(b.totalValue),
          isAgingRisk: b.isAgingRisk,
        })),
        agingRiskCount,
      },
      ledgerIntegrity: {
        balanced: isBalanced,
        unbalancedDates,
        orphanEntries,
        duplicateReferences,
        missingAutoPosts,
      },
      anomalies: {
        negativeMargins,
        concentrationRisks,
        creditLimitBreaches,
        overdueSuppliers,
      },
      overallHealthScore: healthScore,
    };

    // Apply VAT Auditor masking
    const maskedData = maskDashboardForVatAuditor(responseData, userRole);

    // Activity log with Audit-Fraud-Detection module token
    await logUserActivity({
      action: 'EXPORT',
      module: 'Audit-Fraud-Detection',
      userId: security.user.id,
      userName: security.user.name,
      details: JSON.stringify({
        healthScore,
        valuationRisks: valuationRisk.length,
        agingRiskCount,
        unbalancedDates: unbalancedDates.length,
        orphanEntries,
        duplicateReferences,
        missingAutoPosts,
        negativeMargins: negativeMargins.length,
        concentrationRisks: concentrationRisks.length,
        creditLimitBreaches: creditLimitBreaches.length,
        overdueSuppliers: overdueSuppliers.length,
      }),
    });

    return NextResponse.json(maskedData);
  } catch (error) {
    console.error('Fraud detection GET error:', error);

    await logUserActivity({
      action: 'EXPORT',
      module: 'Audit-Fraud-Detection',
      userId: security.user.id,
      userName: security.user.name,
      details: JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    });

    return NextResponse.json(
      { error: 'Failed to generate fraud detection analytics' },
      { status: 500 }
    );
  }
}
