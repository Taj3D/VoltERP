import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
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

    // Get all confirmed sales to calculate achievement
    // We'll match sales by employee - since there's no direct link,
    // we'll calculate total confirmed sales and distribute by SR targets
    const confirmedSales = await db.salesOrder.aggregate({
      where: { status: 'Confirmed' },
      _sum: { grandTotal: true },
    });

    // Get sales orders grouped by month/year for achievement calculation
    const salesOrders = await db.salesOrder.findMany({
      where: { status: 'Confirmed' },
      select: {
        date: true,
        grandTotal: true,
      },
    });

    // Build monthly sales map
    const monthlySalesMap = new Map<string, number>();
    for (const so of salesOrders) {
      const key = `${so.date.getFullYear()}-${so.date.getMonth() + 1}`;
      monthlySalesMap.set(key, (monthlySalesMap.get(key) || 0) + so.grandTotal);
    }

    // Calculate SR performance
    const srPerformance = srTargets.map((target) => {
      const monthKey = `${target.year}-${target.month}`;
      const achievedAmount = monthlySalesMap.get(monthKey) || 0;
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
