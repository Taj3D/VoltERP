// ============================================================
// Interest Percentages Amortization API — Schedule Calculator
// Module Token: Sys-Interest-Amortization
// Reducing Balance Method for Hire Purchase / Term Loan / Overdraft
// Uses safeFinancialRound for all calculations
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, safeFinancialRound } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';
import { db } from '@/lib/db';

// GET /api/interest-percentages/amortization — Calculate amortization schedule
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'InterestPercentages', 'GET');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;
  const { searchParams } = new URL(request.url);

  try {
    // ── Required parameters ──
    const principalStr = searchParams.get('principal');
    const rateStr = searchParams.get('rate');
    const durationStr = searchParams.get('duration');

    if (!principalStr || !durationStr) {
      return NextResponse.json(
        { error: 'principal and duration are required parameters' },
        { status: 400 }
      );
    }

    const principal = parseFloat(principalStr);
    const duration = parseInt(durationStr, 10);
    const downPayment = parseFloat(searchParams.get('downPayment') || '0');
    const type = searchParams.get('type') || 'HIRE_PURCHASE';

    if (isNaN(principal) || principal <= 0) {
      return NextResponse.json(
        { error: 'principal must be a positive number' },
        { status: 400 }
      );
    }

    if (isNaN(duration) || duration <= 0) {
      return NextResponse.json(
        { error: 'duration must be a positive integer' },
        { status: 400 }
      );
    }

    if (isNaN(downPayment) || downPayment < 0) {
      return NextResponse.json(
        { error: 'downPayment must be zero or a positive number' },
        { status: 400 }
      );
    }

    if (downPayment >= principal) {
      return NextResponse.json(
        { error: 'downPayment must be less than principal' },
        { status: 400 }
      );
    }

    // ── Resolve rate ──
    let annualRate: number;

    if (rateStr && !isNaN(parseFloat(rateStr))) {
      annualRate = parseFloat(rateStr);
    } else {
      // Look up active rate from database
      const amount = principal - downPayment;
      const now = new Date();

      const bestRate = await db.interestPercentage.findFirst({
        where: {
          isActive: true,
          ...(companyId ? { companyId } : {}),
          type,
          effectiveDate: { lte: now },
          OR: [
            { expiryDate: null },
            { expiryDate: { gt: now } },
          ],
          minimumAmount: { lte: amount },
          AND: [
            {
              OR: [
                { maximumAmount: 0 },
                { maximumAmount: { gte: amount } },
              ],
            },
          ],
          durationMonthsMin: { lte: duration },
        },
        orderBy: { effectiveDate: 'desc' },
      });

      // Additional filter for durationMonthsMax
      let resolved = bestRate;
      if (bestRate && bestRate.durationMonthsMax > 0 && bestRate.durationMonthsMax < duration) {
        const candidates = await db.interestPercentage.findMany({
          where: {
            isActive: true,
            ...(companyId ? { companyId } : {}),
            type,
            effectiveDate: { lte: now },
            OR: [
              { expiryDate: null },
              { expiryDate: { gt: now } },
            ],
            minimumAmount: { lte: amount },
            durationMonthsMin: { lte: duration },
          },
          orderBy: { effectiveDate: 'desc' },
        });

        resolved = candidates.find((c) => {
          const amountOk = c.maximumAmount === 0 || c.maximumAmount >= amount;
          const durationOk = c.durationMonthsMax === 0 || c.durationMonthsMax >= duration;
          return amountOk && durationOk;
        }) || null;
      }

      if (!resolved) {
        return NextResponse.json(
          { error: 'No active interest rate found for the specified parameters. Please provide a rate parameter.' },
          { status: 404 }
        );
      }

      annualRate = resolved.percentage;
    }

    if (annualRate < 0 || annualRate > 100) {
      return NextResponse.json(
        { error: 'Annual interest rate must be between 0 and 100' },
        { status: 400 }
      );
    }

    // ── Calculate amortization schedule (Reducing Balance Method) ──
    const netPrincipal = safeFinancialRound(principal - downPayment);
    const monthlyRate = safeFinancialRound(annualRate / 12 / 100);

    let monthlyInstallment: number;

    if (monthlyRate === 0) {
      // Zero interest — simple equal installments
      monthlyInstallment = safeFinancialRound(netPrincipal / duration);
    } else {
      // EMI formula: P * r * (1+r)^n / ((1+r)^n - 1)
      const powerFactor = Math.pow(1 + monthlyRate, duration);
      monthlyInstallment = safeFinancialRound(
        netPrincipal * monthlyRate * powerFactor / (powerFactor - 1)
      );
    }

    // Build schedule
    const schedule: any[] = [];
    let remainingBalance = netPrincipal;

    for (let month = 1; month <= duration; month++) {
      const openingBalance = safeFinancialRound(remainingBalance);
      const interestComponent = safeFinancialRound(remainingBalance * monthlyRate);
      let principalComponent = safeFinancialRound(monthlyInstallment - interestComponent);

      // Last month: adjust for rounding remainder
      if (month === duration) {
        principalComponent = safeFinancialRound(openingBalance);
      }

      const closingBalance = safeFinancialRound(openingBalance - principalComponent);

      schedule.push({
        month,
        openingBalance,
        installment: safeFinancialRound(interestComponent + principalComponent),
        interestComponent,
        principalComponent,
        closingBalance: Math.max(closingBalance, 0),
      });

      remainingBalance = Math.max(closingBalance, 0);
    }

    const totalPayable = safeFinancialRound(downPayment + schedule.reduce(
      (sum, row) => safeFinancialRound(sum + row.installment), 0
    ));
    const totalInterest = safeFinancialRound(totalPayable - principal);

    // Log the calculation
    await logUserActivity({
      action: 'EXPORT',
      module: 'Sys-Interest-Amortization',
      recordId: 'AMORTIZATION',
      recordLabel: `Amortization: ${principal} @ ${annualRate}% for ${duration}mo`,
      userId: security.user.id,
      userName: security.user.name,
      details: JSON.stringify({
        principal,
        downPayment,
        netPrincipal,
        annualRate,
        duration,
        type,
        monthlyInstallment,
        totalPayable,
        totalInterest,
        companyId,
      }),
    });

    return NextResponse.json({
      principal,
      downPayment,
      netPrincipal,
      annualRate,
      monthlyRate,
      duration,
      monthlyInstallment,
      totalPayable,
      totalInterest,
      schedule,
    });
  } catch (error) {
    console.error('Error calculating amortization schedule:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: 'Failed to calculate amortization schedule' },
      { status: 500 }
    );
  }
}
