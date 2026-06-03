// ============================================================
// HIRE PURCHASE REPORT API — Installment Analysis & Collection Tracker
// Financial Audit Module: Hire Purchase installment schedules,
// payment tracking, default rates, and monthly collection charts
// ============================================================
// Multi-tenant companyId isolation, safeFinancial arithmetic,
// VAT Auditor masking, RBAC enforcement, activity logging
// with Audit-Hire-Purchase module token.
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
    const statusFilter = searchParams.get('status');
    const customerIdFilter = searchParams.get('customerId');

    // Build company-scoped where clause
    const hireWhere: Record<string, unknown> = { isActive: true };
    if (companyId) hireWhere.companyId = companyId;
    if (fromDate || toDate) {
      const dateFilter: Record<string, unknown> = {};
      if (fromDate) dateFilter.gte = new Date(fromDate);
      if (toDate) dateFilter.lte = new Date(toDate);
      hireWhere.date = dateFilter;
    }
    if (statusFilter) {
      hireWhere.currentStatus = statusFilter;
    }
    if (customerIdFilter) {
      hireWhere.customerId = customerIdFilter;
    }

    // Fetch all hire sales with installments and customer info
    const hireSales = await db.hireSales.findMany({
      where: hireWhere,
      include: {
        customer: {
          select: {
            id: true,
            customerCode: true,
            name: true,
            phone: true,
          },
        },
        installments: {
          orderBy: { installmentNo: 'asc' },
        },
      },
      orderBy: { date: 'desc' },
    });

    // Build installment analysis for each hire sale
    const hireAnalysis = hireSales.map((hs) => {
      // Installment breakdown
      const paidCount = hs.installments.filter(
        (inst) => inst.status === 'Paid'
      ).length;
      const pendingCount = hs.installments.filter(
        (inst) => inst.status === 'Pending'
      ).length;
      const overdueCount = hs.installments.filter(
        (inst) => inst.status === 'Overdue'
      ).length;
      const writtenOffCount = hs.installments.filter(
        (inst) => inst.status === 'WrittenOff'
      ).length;

      // Total paid from installments
      const installmentPaid = hs.installments.reduce(
        (sum, inst) => safeFinancialAdd(sum, inst.paidAmount),
        0
      );

      // Outstanding balance = totalHirePayable - (downPayment + installmentPaid)
      const totalPaid = safeFinancialAdd(hs.downPayment, installmentPaid);
      const outstandingBalance = safeFinancialSubtract(
        hs.totalHirePayable || hs.grandTotal,
        totalPaid
      );

      return {
        id: hs.id,
        invoiceNo: hs.invoiceNo,
        date: hs.date,
        customer: {
          id: hs.customer.id,
          code: hs.customer.customerCode,
          name: hs.customer.name,
          phone: hs.customer.phone,
        },
        totalHirePayable: safeFinancialRound(hs.totalHirePayable || hs.grandTotal),
        totalPaid: safeFinancialRound(totalPaid),
        outstandingBalance: safeFinancialRound(outstandingBalance),
        duration: hs.duration,
        hireRate: hs.hireRate,
        nextPaymentDate: hs.nextPaymentDate,
        currentStatus: hs.currentStatus,
        installments: {
          paidCount,
          pendingCount,
          overdueCount,
          writtenOffCount,
          total: hs.installments.length,
        },
      };
    });

    // Summary calculations
    let totalOutstanding = 0;
    let totalOverdue = 0;
    let totalHirePayable = 0;
    let totalCollected = 0;

    for (const ha of hireAnalysis) {
      totalOutstanding = safeFinancialAdd(totalOutstanding, ha.outstandingBalance);
      totalHirePayable = safeFinancialAdd(totalHirePayable, ha.totalHirePayable);
      totalCollected = safeFinancialAdd(totalCollected, ha.totalPaid);

      // Sum overdue installment amounts
      const hs = hireSales.find((h) => h.id === ha.id);
      if (hs) {
        const overdueAmount = hs.installments
          .filter((inst) => inst.status === 'Overdue')
          .reduce((sum, inst) => safeFinancialAdd(sum, safeFinancialSubtract(inst.amount, inst.paidAmount)), 0);
        totalOverdue = safeFinancialAdd(totalOverdue, overdueAmount);
      }
    }

    const collectionRate =
      totalHirePayable > 0
        ? safeFinancialRound((totalCollected / totalHirePayable) * 100)
        : 0;

    const defaultedCount = hireAnalysis.filter(
      (ha) => ha.currentStatus === 'Defaulted'
    ).length;
    const activeCount = hireAnalysis.filter(
      (ha) => ha.currentStatus === 'Active'
    ).length;

    const defaultRate =
      hireAnalysis.length > 0
        ? safeFinancialRound((defaultedCount / hireAnalysis.length) * 100)
        : 0;

    // Chart data: monthly installment collection
    const monthlyCollection: Record<string, { month: string; collected: number; overdue: number; expected: number }> = {};

    for (const hs of hireSales) {
      for (const inst of hs.installments) {
        const dueDate = new Date(inst.dueDate);
        const monthKey = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}`;

        if (!monthlyCollection[monthKey]) {
          monthlyCollection[monthKey] = {
            month: monthKey,
            collected: 0,
            overdue: 0,
            expected: 0,
          };
        }

        monthlyCollection[monthKey].expected = safeFinancialAdd(
          monthlyCollection[monthKey].expected,
          inst.amount
        );
        monthlyCollection[monthKey].collected = safeFinancialAdd(
          monthlyCollection[monthKey].collected,
          inst.paidAmount
        );

        if (inst.status === 'Overdue') {
          monthlyCollection[monthKey].overdue = safeFinancialAdd(
            monthlyCollection[monthKey].overdue,
            safeFinancialSubtract(inst.amount, inst.paidAmount)
          );
        }
      }
    }

    // Sort chart data by month
    const chartData = Object.values(monthlyCollection).sort((a, b) =>
      a.month.localeCompare(b.month)
    );

    // Build response
    const responseData: Record<string, unknown> = {
      hireSales: hireAnalysis,
      summary: {
        totalHireSales: hireAnalysis.length,
        activeCount,
        defaultedCount,
        totalOutstanding,
        totalOverdue,
        totalHirePayable,
        totalCollected,
        collectionRate,
        defaultRate,
      },
      chartData,
    };

    // Apply VAT Auditor masking
    const maskedData = maskDashboardForVatAuditor(responseData, userRole);

    // Activity log with Audit-Hire-Purchase module token
    await logUserActivity({
      action: 'EXPORT',
      module: 'Audit-Hire-Purchase',
      userId: security.user.id,
      userName: security.user.name,
      details: JSON.stringify({
        recordCount: hireAnalysis.length,
        filters: { fromDate, toDate, status: statusFilter, customerId: customerIdFilter },
        summary: {
          totalOutstanding,
          totalOverdue,
          collectionRate,
          defaultRate,
        },
      }),
    });

    return NextResponse.json(maskedData);
  } catch (error) {
    console.error('Hire purchase report GET error:', error);

    await logUserActivity({
      action: 'EXPORT',
      module: 'Audit-Hire-Purchase',
      userId: security.user.id,
      userName: security.user.name,
      details: JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    });

    return NextResponse.json(
      { error: 'Failed to generate hire purchase report' },
      { status: 500 }
    );
  }
}
