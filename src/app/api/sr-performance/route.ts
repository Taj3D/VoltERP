// ============================================================
// SR PERFORMANCE METRICS — Maps SR Target Setup entries
// to actual sales achievement data for performance tracking.
// Module: SRPerformance | Module token: "Sys-Ops-Channels"
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity, safeFinancialRound } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// ── Type definitions ──

interface SRPerformancePeriod {
  employeeId: string;
  employeeName: string;
  employeeCode: string | null;
  month: number;
  year: number;
  targetAmount: number;
  minimumSalesQuota: number;
  commissionPercentage: number;
  actualSales: number;
  cashCollected: number;
  achievementPercentage: number;
  remainingAmount: number;
  commissionProjection: number;
  status: string;
  targetId: string;
}

interface SRPerformanceSummary {
  totalTargets: number;
  totalTargetAmount: number;
  totalActualSales: number;
  avgAchievementPercentage: number;
  totalCommissionProjection: number;
  achievedCount: number;
  belowQuotaCount: number;
}

interface SRPerformanceResponse {
  periods: SRPerformancePeriod[];
  summary: SRPerformanceSummary;
}

// ── Helper: Build date range for month/year filtering ──

function getMonthDateRange(month: number, year: number): { gte: Date; lt: Date } {
  // Start of the month (inclusive)
  const gte = new Date(year, month - 1, 1);
  // Start of the next month (exclusive) — covers all dates within the target month
  const lt = new Date(year, month, 1);
  return { gte, lt };
}

// ============================================================
// GET /api/sr-performance
// Returns SR performance metrics mapping targets to achievements
// ============================================================

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'SRPerformance', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const employeeIdParam = searchParams.get('employeeId');
    const monthParam = searchParams.get('month');
    const yearParam = searchParams.get('year');
    const companyId = security.user.companyId;

    // ── Validate optional query parameters ──
    const monthNum = monthParam ? parseInt(monthParam, 10) : undefined;
    const yearNum = yearParam ? parseInt(yearParam, 10) : undefined;

    if (monthParam && (isNaN(monthNum!) || monthNum! < 1 || monthNum! > 12)) {
      return NextResponse.json(
        { error: 'Invalid month parameter. Must be an integer between 1 and 12.' },
        { status: 400 }
      );
    }

    if (yearParam && (isNaN(yearNum!) || yearNum! < 2000 || yearNum! > 2100)) {
      return NextResponse.json(
        { error: 'Invalid year parameter. Must be an integer between 2000 and 2100.' },
        { status: 400 }
      );
    }

    // ── Step 1: Fetch all active SR targets (multi-tenant filtered) ──
    const targetWhere: Record<string, unknown> = {
      isActive: true,
      ...(companyId ? { companyId } : {}),
      ...(employeeIdParam ? { employeeId: employeeIdParam } : {}),
      ...(monthNum ? { month: monthNum } : {}),
      ...(yearNum ? { year: yearNum } : {}),
    };

    const targets = await db.sRTargetSetup.findMany({
      where: targetWhere,
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            employeeCode: true,
          },
        },
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });

    // ── Step 2: Calculate metrics for each target ──
    const periods: SRPerformancePeriod[] = await Promise.all(
      targets.map(async (target) => {
        const dateRange = getMonthDateRange(target.month, target.year);

        // Calculate actualSales: Sum of grandTotal from SalesOrder
        // where srId = target.employeeId AND date within target month/year
        const salesAggregate = await db.salesOrder.aggregate({
          where: {
            srId: target.employeeId,
            date: {
              gte: dateRange.gte,
              lt: dateRange.lt,
            },
            isActive: true,
            ...(companyId ? { companyId } : {}),
          },
          _sum: {
            grandTotal: true,
          },
        });

        // Calculate cashCollected: Sum of amount from CashCollection
        // where srId = target.employeeId AND date within target month/year
        const cashAggregate = await db.cashCollection.aggregate({
          where: {
            srId: target.employeeId,
            date: {
              gte: dateRange.gte,
              lt: dateRange.lt,
            },
            isActive: true,
            ...(companyId ? { companyId } : {}),
          },
          _sum: {
            amount: true,
          },
        });

        const actualSales = safeFinancialRound(salesAggregate._sum.grandTotal ?? 0);
        const cashCollected = safeFinancialRound(cashAggregate._sum.amount ?? 0);

        // achievementPercentage: safeFinancialRound(actualSales / targetAmount * 100), capped at 999.99
        const rawAchievement = target.targetAmount > 0
          ? (actualSales / target.targetAmount) * 100
          : 0;
        const achievementPercentage = Math.min(
          safeFinancialRound(rawAchievement),
          999.99
        );

        // remainingAmount: targetAmount - actualSales (can be negative if over-achieved)
        const remainingAmount = safeFinancialRound(target.targetAmount - actualSales);

        // commissionProjection: safeFinancialRound(
        //   achievementPercentage / 100 * targetAmount * commissionPercentage / 100
        // )
        const commissionProjection = safeFinancialRound(
          (achievementPercentage / 100) * target.targetAmount * (target.commissionPercentage / 100)
        );

        return {
          employeeId: target.employeeId,
          employeeName: target.employee.name,
          employeeCode: target.employee.employeeCode,
          month: target.month,
          year: target.year,
          targetAmount: safeFinancialRound(target.targetAmount),
          minimumSalesQuota: safeFinancialRound(target.minimumSalesQuota),
          commissionPercentage: safeFinancialRound(target.commissionPercentage),
          actualSales,
          cashCollected,
          achievementPercentage,
          remainingAmount,
          commissionProjection,
          status: target.status,
          targetId: target.id,
        };
      })
    );

    // ── Step 3: Build summary aggregations ──
    const totalTargets = periods.length;
    const totalTargetAmount = safeFinancialRound(
      periods.reduce((sum, p) => sum + p.targetAmount, 0)
    );
    const totalActualSales = safeFinancialRound(
      periods.reduce((sum, p) => sum + p.actualSales, 0)
    );
    const avgAchievementPercentage = totalTargets > 0
      ? safeFinancialRound(periods.reduce((sum, p) => sum + p.achievementPercentage, 0) / totalTargets)
      : 0;
    const totalCommissionProjection = safeFinancialRound(
      periods.reduce((sum, p) => sum + p.commissionProjection, 0)
    );

    // "Achieved" = actualSales >= minimumSalesQuota (met minimum quota threshold)
    const achievedCount = periods.filter(
      (p) => p.actualSales >= p.minimumSalesQuota
    ).length;
    const belowQuotaCount = totalTargets - achievedCount;

    const summary: SRPerformanceSummary = {
      totalTargets,
      totalTargetAmount,
      totalActualSales,
      avgAchievementPercentage,
      totalCommissionProjection,
      achievedCount,
      belowQuotaCount,
    };

    // ── Step 4: Log activity ──
    await logUserActivity({
      action: 'EXPORT',
      module: 'Sys-Ops-Channels',
      recordLabel: `SR Performance Report — ${totalTargets} targets, ${achievedCount} achieved`,
      userId: security.user.id,
      userName: security.user.name,
      details: JSON.stringify({
        employeeId: employeeIdParam || 'ALL',
        month: monthNum || 'ALL',
        year: yearNum || 'ALL',
        totalTargets,
        achievedCount,
        belowQuotaCount,
        avgAchievementPercentage,
      }),
    });

    const response: SRPerformanceResponse = {
      periods,
      summary,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[SRPerformance] Error fetching SR performance metrics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch SR performance metrics' },
      { status: 500 }
    );
  }
}
