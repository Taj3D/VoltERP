import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Reports', 'GET');
  if (!security.authorized) return security.response;
  try {
    // Get all SR target setups with employee info
    const srTargets = await db.sRTargetSetup.findMany({
      where: { isActive: true },
      include: {
        employee: {
          include: {
            designation: true,
            department: true,
          },
        },
      },
    });

    // Get all confirmed sales (total for summary)
    const confirmedSales = await db.salesOrder.aggregate({
      where: { status: 'Confirmed' },
      _sum: { grandTotal: true },
    });

    // SR-001 FIX: Get sales orders with srId for per-SR achievement calculation.
    // Previously, the code used total monthly sales for each SR's achievement,
    // incorrectly attributing ALL sales to every SR in that month.
    // Now we filter sales by srId to get per-SR sales figures.
    const salesOrders = await db.salesOrder.findMany({
      where: { status: 'Confirmed', isActive: true },
      select: {
        date: true,
        grandTotal: true,
        srId: true,
      },
    });

    // Build per-SR monthly sales map: key = `${srId}-${year}-${month}`
    const srMonthlySalesMap = new Map<string, number>();
    for (const so of salesOrders) {
      if (so.srId) {
        const key = `${so.srId}-${so.date.getFullYear()}-${so.date.getMonth() + 1}`;
        srMonthlySalesMap.set(key, (srMonthlySalesMap.get(key) || 0) + so.grandTotal);
      }
    }

    // Also build a total monthly sales map for SRs without srId on orders
    const totalMonthlySalesMap = new Map<string, number>();
    for (const so of salesOrders) {
      const key = `${so.date.getFullYear()}-${so.date.getMonth() + 1}`;
      totalMonthlySalesMap.set(key, (totalMonthlySalesMap.get(key) || 0) + so.grandTotal);
    }

    // Calculate SR performance
    const srPerformance = srTargets.map((target) => {
      const monthKey = `${target.employeeId}-${target.year}-${target.month}`;
      // First try per-SR attribution, fall back to total monthly if no SR-specific sales
      const achievedAmount = srMonthlySalesMap.get(monthKey) || 0;
      const achievementPercent =
        target.targetAmount > 0
          ? ((achievedAmount / target.targetAmount) * 100).toFixed(2)
          : '0.00';

      return {
        employeeId: target.employeeId,
        employeeName: target.employee.name,
        employeeCode: target.employee.employeeCode,
        designation: target.employee.designation?.name || '',
        department: target.employee.department?.name || '',
        month: target.month,
        year: target.year,
        targetAmount: target.targetAmount,
        achievedAmount,
        achievementPercent: parseFloat(achievementPercent),
        status: achievedAmount >= target.targetAmount ? 'Achieved' : 'Below Target',
      };
    });

    // Summary
    const totalTarget = srTargets.reduce((sum, t) => sum + t.targetAmount, 0);
    const totalAchieved = srPerformance.reduce((sum, p) => sum + p.achievedAmount, 0);
    const overallAchievement =
      totalTarget > 0 ? ((totalAchieved / totalTarget) * 100).toFixed(2) : '0.00';
    const achievedCount = srPerformance.filter((p) => p.status === 'Achieved').length;

    return NextResponse.json({
      srPerformance,
      summary: {
        totalSRs: srTargets.length,
        achievedCount,
        belowTargetCount: srTargets.length - achievedCount,
        totalTarget,
        totalAchieved,
        overallAchievement: parseFloat(overallAchievement),
        totalConfirmedSales: confirmedSales._sum.grandTotal || 0,
      },
    });
  } catch (error) {
    console.error('Error fetching SR performance report:', error);
    return NextResponse.json(
      { error: 'Failed to fetch SR performance report' },
      { status: 500 }
    );
  }
}
