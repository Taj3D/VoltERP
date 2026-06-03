// ============================================================
// COLLECTION MATRIX API — Customer Collection & Receivables Tracker
// Financial Audit Module: Customer-wise collection rates,
// aging of receivables, collection trends chart data
// ============================================================
// Multi-tenant companyId isolation, safeFinancial arithmetic,
// VAT Auditor masking, RBAC enforcement, activity logging
// with Audit-Collection module token.
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

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'AuditDashboard', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const userRole = security.user.role as UserRole;
    const companyId = security.user.companyId;

    const fromDate = searchParams.get('from');
    const toDate = searchParams.get('to');
    const customerIdFilter = searchParams.get('customerId');

    // Build company-scoped where clauses
    const customerWhere: Record<string, unknown> = { isActive: true };
    const salesOrderWhere: Record<string, unknown> = { isActive: true, status: { notIn: ['Cancelled', 'Draft'] } };
    const cashCollectionWhere: Record<string, unknown> = { isActive: true };
    const salesReturnWhere: Record<string, unknown> = { isActive: true };

    if (companyId) {
      customerWhere.companyId = companyId;
      salesOrderWhere.companyId = companyId;
      cashCollectionWhere.companyId = companyId;
      salesReturnWhere.companyId = companyId;
    }

    if (fromDate || toDate) {
      const dateFilter: Record<string, unknown> = {};
      if (fromDate) dateFilter.gte = new Date(fromDate);
      if (toDate) dateFilter.lte = new Date(toDate);
      salesOrderWhere.date = dateFilter;
      cashCollectionWhere.date = dateFilter;
      salesReturnWhere.date = dateFilter;
    }

    if (customerIdFilter) {
      salesOrderWhere.customerId = customerIdFilter;
      cashCollectionWhere.customerId = customerIdFilter;
      salesReturnWhere.customerId = customerIdFilter;
      customerWhere.id = customerIdFilter;
    }

    // Fetch customers
    const customers = await db.customer.findMany({
      where: customerWhere,
      select: {
        id: true,
        customerCode: true,
        name: true,
        phone: true,
        openingBalance: true,
        openingBalanceType: true,
        currentBalance: true,
        currentBalanceType: true,
      },
      orderBy: { name: 'asc' },
    });

    // Fetch sales orders (invoiced amounts)
    const salesOrders = await db.salesOrder.findMany({
      where: salesOrderWhere,
      select: {
        id: true,
        customerId: true,
        grandTotal: true,
        date: true,
      },
    });

    // Fetch cash collections (collected amounts)
    const cashCollections = await db.cashCollection.findMany({
      where: cashCollectionWhere,
      select: {
        id: true,
        customerId: true,
        amount: true,
        date: true,
      },
    });

    // Fetch sales returns (returned amounts)
    const salesReturns = await db.salesReturn.findMany({
      where: salesReturnWhere,
      select: {
        id: true,
        customerId: true,
        grandTotal: true,
        date: true,
      },
    });

    // Aggregate per customer
    const invoicedByCustomer = new Map<string, number>();
    const collectedByCustomer = new Map<string, number>();
    const returnedByCustomer = new Map<string, number>();

    // Also track invoice dates for aging analysis
    const invoicesByCustomer = new Map<string, { date: Date; amount: number }[]>();

    for (const so of salesOrders) {
      invoicedByCustomer.set(
        so.customerId,
        safeFinancialAdd(invoicedByCustomer.get(so.customerId) || 0, so.grandTotal)
      );

      const invoices = invoicesByCustomer.get(so.customerId) || [];
      invoices.push({ date: new Date(so.date), amount: so.grandTotal });
      invoicesByCustomer.set(so.customerId, invoices);
    }

    for (const cc of cashCollections) {
      collectedByCustomer.set(
        cc.customerId,
        safeFinancialAdd(collectedByCustomer.get(cc.customerId) || 0, cc.amount)
      );
    }

    for (const sr of salesReturns) {
      returnedByCustomer.set(
        sr.customerId,
        safeFinancialAdd(returnedByCustomer.get(sr.customerId) || 0, sr.grandTotal)
      );
    }

    const now = new Date();

    // Build customer collection matrix
    const collectionMatrix = customers.map((customer) => {
      const totalInvoiced = invoicedByCustomer.get(customer.id) || 0;
      const totalCollected = collectedByCustomer.get(customer.id) || 0;
      const totalReturned = returnedByCustomer.get(customer.id) || 0;

      // Opening balance (if Dr type, add to receivables)
      const openingBalance =
        customer.openingBalanceType === 'Dr' ? customer.openingBalance : 0;

      // Current balance = opening + invoiced - collected - returned
      const currentBalance = safeFinancialSubtract(
        safeFinancialAdd(openingBalance, totalInvoiced),
        safeFinancialAdd(totalCollected, totalReturned)
      );

      // Collection rate = totalCollected / totalInvoiced * 100
      const collectionRate =
        totalInvoiced > 0
          ? safeFinancialRound((totalCollected / totalInvoiced) * 100)
          : 0;

      // Aging of receivables: bucket invoices by age
      const invoices = invoicesByCustomer.get(customer.id) || [];
      const aging = {
        current: 0,
        days1to30: 0,
        days31to60: 0,
        days61to90: 0,
        days90plus: 0,
      };

      // Distribute outstanding amount across aging buckets
      // Using pro-rata distribution of remaining balance across invoice dates
      const totalOutstandingInvoices = invoices.reduce(
        (sum, inv) => safeFinancialAdd(sum, inv.amount),
        0
      );

      // Collection ratio for this customer to compute uncollected per invoice
      const collectionRatio =
        totalOutstandingInvoices > 0
          ? Math.min(totalCollected / totalOutstandingInvoices, 1)
          : 0;

      for (const inv of invoices) {
        const uncollectedAmount = safeFinancialRound(inv.amount * (1 - collectionRatio));
        if (uncollectedAmount <= 0) continue;

        const ageDays = Math.floor(
          (now.getTime() - inv.date.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (ageDays <= 0) {
          aging.current = safeFinancialAdd(aging.current, uncollectedAmount);
        } else if (ageDays <= 30) {
          aging.days1to30 = safeFinancialAdd(aging.days1to30, uncollectedAmount);
        } else if (ageDays <= 60) {
          aging.days31to60 = safeFinancialAdd(aging.days31to60, uncollectedAmount);
        } else if (ageDays <= 90) {
          aging.days61to90 = safeFinancialAdd(aging.days61to90, uncollectedAmount);
        } else {
          aging.days90plus = safeFinancialAdd(aging.days90plus, uncollectedAmount);
        }
      }

      // Add opening balance to current aging if positive
      if (openingBalance > 0) {
        aging.current = safeFinancialAdd(aging.current, openingBalance);
      }

      return {
        customerId: customer.id,
        name: customer.name,
        code: customer.customerCode,
        phone: customer.phone,
        openingBalance: safeFinancialRound(openingBalance),
        totalInvoiced: safeFinancialRound(totalInvoiced),
        totalCollected: safeFinancialRound(totalCollected),
        totalReturned: safeFinancialRound(totalReturned),
        currentBalance: safeFinancialRound(currentBalance),
        collectionRate,
        aging: {
          current: safeFinancialRound(aging.current),
          days1to30: safeFinancialRound(aging.days1to30),
          days31to60: safeFinancialRound(aging.days31to60),
          days61to90: safeFinancialRound(aging.days61to90),
          days90plus: safeFinancialRound(aging.days90plus),
        },
      };
    });

    // Summary calculations
    let totalReceivables = 0;
    let totalCollectedAll = 0;
    let totalInvoicedAll = 0;
    let totalReturnedAll = 0;
    let totalDaysToCollect = 0;
    let collectibleCustomerCount = 0;

    // Aging summary
    const agingSummary = {
      current: 0,
      days1to30: 0,
      days31to60: 0,
      days61to90: 0,
      days90plus: 0,
    };

    for (const cm of collectionMatrix) {
      totalReceivables = safeFinancialAdd(totalReceivables, cm.currentBalance);
      totalCollectedAll = safeFinancialAdd(totalCollectedAll, cm.totalCollected);
      totalInvoicedAll = safeFinancialAdd(totalInvoicedAll, cm.totalInvoiced);
      totalReturnedAll = safeFinancialAdd(totalReturnedAll, cm.totalReturned);

      agingSummary.current = safeFinancialAdd(agingSummary.current, cm.aging.current);
      agingSummary.days1to30 = safeFinancialAdd(agingSummary.days1to30, cm.aging.days1to30);
      agingSummary.days31to60 = safeFinancialAdd(agingSummary.days31to60, cm.aging.days31to60);
      agingSummary.days61to90 = safeFinancialAdd(agingSummary.days61to90, cm.aging.days61to90);
      agingSummary.days90plus = safeFinancialAdd(agingSummary.days90plus, cm.aging.days90plus);

      // Average days to collect (weighted estimate based on aging distribution)
      if (cm.totalCollected > 0 && cm.totalInvoiced > 0) {
        // Estimate: weighted average days based on aging buckets
        const totalAging = safeFinancialAdd(
          safeFinancialAdd(cm.aging.current, cm.aging.days1to30),
          safeFinancialAdd(
            safeFinancialAdd(cm.aging.days31to60, cm.aging.days61to90),
            cm.aging.days90plus
          )
        );

        if (totalAging > 0) {
          const estimatedDays =
            (cm.aging.current * 0 +
              cm.aging.days1to30 * 15 +
              cm.aging.days31to60 * 45 +
              cm.aging.days61to90 * 75 +
              cm.aging.days90plus * 120) /
            totalAging;
          totalDaysToCollect += estimatedDays;
          collectibleCustomerCount++;
        }
      }
    }

    const overallCollectionRate =
      totalInvoicedAll > 0
        ? safeFinancialRound((totalCollectedAll / totalInvoicedAll) * 100)
        : 0;

    const averageDaysToCollect =
      collectibleCustomerCount > 0
        ? safeFinancialRound(totalDaysToCollect / collectibleCustomerCount)
        : 0;

    // Chart data: collection trends by month
    const monthlyTrends: Record<string, { month: string; invoiced: number; collected: number; returned: number }> = {};

    for (const so of salesOrders) {
      const d = new Date(so.date);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyTrends[monthKey]) {
        monthlyTrends[monthKey] = { month: monthKey, invoiced: 0, collected: 0, returned: 0 };
      }
      monthlyTrends[monthKey].invoiced = safeFinancialAdd(monthlyTrends[monthKey].invoiced, so.grandTotal);
    }

    for (const cc of cashCollections) {
      const d = new Date(cc.date);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyTrends[monthKey]) {
        monthlyTrends[monthKey] = { month: monthKey, invoiced: 0, collected: 0, returned: 0 };
      }
      monthlyTrends[monthKey].collected = safeFinancialAdd(monthlyTrends[monthKey].collected, cc.amount);
    }

    for (const sr of salesReturns) {
      const d = new Date(sr.date);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyTrends[monthKey]) {
        monthlyTrends[monthKey] = { month: monthKey, invoiced: 0, collected: 0, returned: 0 };
      }
      monthlyTrends[monthKey].returned = safeFinancialAdd(monthlyTrends[monthKey].returned, sr.grandTotal);
    }

    // Sort chart data by month
    const chartData = Object.values(monthlyTrends)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((t) => ({
        ...t,
        invoiced: safeFinancialRound(t.invoiced),
        collected: safeFinancialRound(t.collected),
        returned: safeFinancialRound(t.returned),
      }));

    // Build response
    const responseData: Record<string, unknown> = {
      customers: collectionMatrix,
      agingSummary: {
        current: safeFinancialRound(agingSummary.current),
        days1to30: safeFinancialRound(agingSummary.days1to30),
        days31to60: safeFinancialRound(agingSummary.days31to60),
        days61to90: safeFinancialRound(agingSummary.days61to90),
        days90plus: safeFinancialRound(agingSummary.days90plus),
      },
      summary: {
        totalCustomers: collectionMatrix.length,
        totalReceivables: safeFinancialRound(totalReceivables),
        totalInvoiced: safeFinancialRound(totalInvoicedAll),
        totalCollected: safeFinancialRound(totalCollectedAll),
        totalReturned: safeFinancialRound(totalReturnedAll),
        overallCollectionRate,
        averageDaysToCollect,
      },
      chartData,
    };

    // Apply VAT Auditor masking
    const maskedData = maskDashboardForVatAuditor(responseData, userRole);

    // Activity log with Audit-Collection module token
    await logUserActivity({
      action: 'EXPORT',
      module: 'Audit-Collection',
      userId: security.user.id,
      userName: security.user.name,
      details: JSON.stringify({
        customerCount: collectionMatrix.length,
        filters: { fromDate, toDate, customerId: customerIdFilter },
        summary: {
          totalReceivables: safeFinancialRound(totalReceivables),
          totalCollected: safeFinancialRound(totalCollectedAll),
          overallCollectionRate,
          averageDaysToCollect,
        },
      }),
    });

    return NextResponse.json(maskedData);
  } catch (error) {
    console.error('Collection matrix GET error:', error);

    await logUserActivity({
      action: 'EXPORT',
      module: 'Audit-Collection',
      userId: security.user.id,
      userName: security.user.name,
      details: JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    });

    return NextResponse.json(
      { error: 'Failed to generate collection matrix' },
      { status: 500 }
    );
  }
}
