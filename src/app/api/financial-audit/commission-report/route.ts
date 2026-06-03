// ============================================================
// COMMISSION REPORT API — SR Commission Analysis & Performance Tracker
// Financial Audit Module: SR commission calculation, target
// achievement tracking, non-SR productivity metrics
// ============================================================
// Multi-tenant companyId isolation, safeFinancial arithmetic,
// VAT Auditor masking, RBAC enforcement, activity logging
// with Audit-Commission module token.
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
    const employeeIdFilter = searchParams.get('employeeId');

    // Build company-scoped where clauses
    const salesOrderWhere: Record<string, unknown> = { isActive: true, status: { notIn: ['Cancelled', 'Draft'] } };
    const employeeWhere: Record<string, unknown> = { isActive: true };
    const srTargetWhere: Record<string, unknown> = { isActive: true };

    if (companyId) {
      salesOrderWhere.companyId = companyId;
      employeeWhere.companyId = companyId;
      srTargetWhere.companyId = companyId;
    }

    if (fromDate || toDate) {
      const dateFilter: Record<string, unknown> = {};
      if (fromDate) dateFilter.gte = new Date(fromDate);
      if (toDate) dateFilter.lte = new Date(toDate);
      salesOrderWhere.date = dateFilter;
    }

    if (employeeIdFilter) {
      salesOrderWhere.srId = employeeIdFilter;
    }

    // ============================================================
    // Fetch all employees with SR designation (those who have srTargets)
    // and also fetch non-SR employees for productivity metrics
    // ============================================================
    const srTargets = await db.sRTargetSetup.findMany({
      where: srTargetWhere,
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            name: true,
            designationId: true,
            departmentId: true,
            designation: { select: { id: true, name: true } },
            department: { select: { id: true, name: true } },
          },
        },
      },
    });

    // Get unique SR employees
    const srEmployeeMap = new Map<string, {
      id: string;
      employeeCode: string;
      name: string;
      designation: { id: string; name: string };
      department: { id: string; name: string };
      commissionPercentage: number;
      targetAmount: number;
    }>();

    for (const target of srTargets) {
      const existing = srEmployeeMap.get(target.employeeId);
      if (!existing || target.month === new Date().getMonth() + 1) {
        // Use the most recent/current month target
        srEmployeeMap.set(target.employeeId, {
          id: target.employee.id,
          employeeCode: target.employee.employeeCode,
          name: target.employee.name,
          designation: target.employee.designation,
          department: target.employee.department,
          commissionPercentage: target.commissionPercentage,
          targetAmount: target.targetAmount,
        });
      }
    }

    // Fetch sales orders for the period to compute SR revenue
    const salesOrders = await db.salesOrder.findMany({
      where: salesOrderWhere,
      select: {
        id: true,
        srId: true,
        grandTotal: true,
        date: true,
      },
    });

    // Also fetch cash collections by SR for additional context
    const cashCollectionWhere: Record<string, unknown> = { isActive: true };
    if (companyId) cashCollectionWhere.companyId = companyId;
    if (fromDate || toDate) {
      const dateFilter: Record<string, unknown> = {};
      if (fromDate) dateFilter.gte = new Date(fromDate);
      if (toDate) dateFilter.lte = new Date(toDate);
      cashCollectionWhere.date = dateFilter;
    }
    if (employeeIdFilter) cashCollectionWhere.srId = employeeIdFilter;

    const cashCollections = await db.cashCollection.findMany({
      where: cashCollectionWhere,
      select: {
        id: true,
        srId: true,
        amount: true,
        date: true,
      },
    });

    // Aggregate sales revenue per SR
    const srRevenueMap = new Map<string, { totalSales: number; totalRevenue: number; totalCollected: number }>();
    for (const so of salesOrders) {
      if (so.srId) {
        const current = srRevenueMap.get(so.srId) || { totalSales: 0, totalRevenue: 0, totalCollected: 0 };
        current.totalSales = safeFinancialAdd(current.totalSales, 1);
        current.totalRevenue = safeFinancialAdd(current.totalRevenue, so.grandTotal);
        srRevenueMap.set(so.srId, current);
      }
    }

    // Aggregate collections per SR
    for (const cc of cashCollections) {
      if (cc.srId) {
        const current = srRevenueMap.get(cc.srId) || { totalSales: 0, totalRevenue: 0, totalCollected: 0 };
        current.totalCollected = safeFinancialAdd(current.totalCollected, cc.amount);
        srRevenueMap.set(cc.srId, current);
      }
    }

    // Build SR commission analysis
    const srCommissionData: {
      employeeId: string;
      employeeCode: string;
      name: string;
      designation: string;
      department: string;
      totalSales: number;
      totalRevenue: number;
      totalCollected: number;
      commissionRate: number;
      earnedCommission: number;
      targetAmount: number;
      targetAchievement: number;
    }[] = [];

    let totalCommissions = 0;
    let totalTargetAchievement = 0;
    let topPerformerName = '';
    let topPerformerRevenue = 0;

    for (const [employeeId, srInfo] of srEmployeeMap) {
      const revenueData = srRevenueMap.get(employeeId) || { totalSales: 0, totalRevenue: 0, totalCollected: 0 };

      // Commission = commissionPercentage * totalRevenue / 100
      const earnedCommission = safeFinancialRound(
        (srInfo.commissionPercentage * revenueData.totalRevenue) / 100
      );

      // Target achievement %
      const targetAchievement =
        srInfo.targetAmount > 0
          ? safeFinancialRound((revenueData.totalRevenue / srInfo.targetAmount) * 100)
          : 0;

      totalCommissions = safeFinancialAdd(totalCommissions, earnedCommission);
      totalTargetAchievement = safeFinancialAdd(totalTargetAchievement, targetAchievement);

      // Track top performer by revenue
      if (revenueData.totalRevenue > topPerformerRevenue) {
        topPerformerRevenue = revenueData.totalRevenue;
        topPerformerName = srInfo.name;
      }

      srCommissionData.push({
        employeeId,
        employeeCode: srInfo.employeeCode,
        name: srInfo.name,
        designation: srInfo.designation.name,
        department: srInfo.department.name,
        totalSales: revenueData.totalSales,
        totalRevenue: safeFinancialRound(revenueData.totalRevenue),
        totalCollected: safeFinancialRound(revenueData.totalCollected),
        commissionRate: srInfo.commissionPercentage,
        earnedCommission,
        targetAmount: srInfo.targetAmount,
        targetAchievement,
      });
    }

    // Also include non-SR employees with sales orders but no target setup
    const srEmployeeIds = new Set(srEmployeeMap.keys());
    const nonSrSales = salesOrders.filter((so) => so.srId && !srEmployeeIds.has(so.srId));

    // Get non-SR employee details
    const nonSrEmployeeIds = [...new Set(nonSrSales.map((so) => so.srId!))];
    const nonSrEmployees = nonSrEmployeeIds.length > 0
      ? await db.employee.findMany({
          where: {
            id: { in: nonSrEmployeeIds },
            ...employeeWhere,
          },
          select: {
            id: true,
            employeeCode: true,
            name: true,
            designation: { select: { name: true } },
            department: { select: { name: true } },
          },
        })
      : [];

    const nonSrProductivity = nonSrEmployees.map((emp) => {
      const empSales = nonSrSales.filter((so) => so.srId === emp.id);
      const totalRevenue = empSales.reduce(
        (sum, so) => safeFinancialAdd(sum, so.grandTotal),
        0
      );
      const empCollections = cashCollections.filter((cc) => cc.srId === emp.id);
      const totalCollected = empCollections.reduce(
        (sum, cc) => safeFinancialAdd(sum, cc.amount),
        0
      );

      return {
        employeeId: emp.id,
        employeeCode: emp.employeeCode,
        name: emp.name,
        designation: emp.designation.name,
        department: emp.department.name,
        totalSales: empSales.length,
        totalRevenue: safeFinancialRound(totalRevenue),
        totalCollected: safeFinancialRound(totalCollected),
        commissionRate: 0,
        earnedCommission: 0,
        targetAmount: 0,
        targetAchievement: 0,
        note: 'No SR target setup configured',
      };
    });

    // Summary
    const avgTargetAchievement =
      srCommissionData.length > 0
        ? safeFinancialRound(totalTargetAchievement / srCommissionData.length)
        : 0;

    // Chart data: SR performance comparison
    const chartData = srCommissionData
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .map((sr) => ({
        name: sr.name,
        totalRevenue: sr.totalRevenue,
        earnedCommission: sr.earnedCommission,
        targetAchievement: sr.targetAchievement,
        totalCollected: sr.totalCollected,
      }));

    // Build response
    const responseData: Record<string, unknown> = {
      srCommissionData,
      nonSrProductivity,
      summary: {
        totalSREmployees: srCommissionData.length,
        totalNonSREmployees: nonSrProductivity.length,
        totalCommissions,
        avgTargetAchievement,
        topPerformer: topPerformerName || 'N/A',
        totalRevenue: safeFinancialRound(
          srCommissionData.reduce((sum, sr) => safeFinancialAdd(sum, sr.totalRevenue), 0)
        ),
        totalCollected: safeFinancialRound(
          srCommissionData.reduce((sum, sr) => safeFinancialAdd(sum, sr.totalCollected), 0)
        ),
      },
      chartData,
    };

    // Apply VAT Auditor masking
    const maskedData = maskDashboardForVatAuditor(responseData, userRole);

    // Activity log with Audit-Commission module token
    await logUserActivity({
      action: 'EXPORT',
      module: 'Audit-Commission',
      userId: security.user.id,
      userName: security.user.name,
      details: JSON.stringify({
        srCount: srCommissionData.length,
        nonSrCount: nonSrProductivity.length,
        filters: { fromDate, toDate, employeeId: employeeIdFilter },
        summary: {
          totalCommissions,
          avgTargetAchievement,
          topPerformer: topPerformerName || 'N/A',
        },
      }),
    });

    return NextResponse.json(maskedData);
  } catch (error) {
    console.error('Commission report GET error:', error);

    await logUserActivity({
      action: 'EXPORT',
      module: 'Audit-Commission',
      userId: security.user.id,
      userName: security.user.name,
      details: JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    });

    return NextResponse.json(
      { error: 'Failed to generate commission report' },
      { status: 500 }
    );
  }
}
