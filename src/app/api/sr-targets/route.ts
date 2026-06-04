import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity, safeFinancialRound } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// ============================================================
// SR TARGET SETUP — Phase 7: Operations & Field Controls
// Financial Benchmark Shields, Monthly Overlap Interlock,
// Multi-tenant Isolation, Activity Logging
// Module token: "Sys-Ops-Channels"
// ============================================================

// GET /api/sr-targets - List all SR targets with relations (multi-tenant filtered)
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'SRTargets', 'GET');
  if (!security.authorized) return security.response;

  try {
    const companyId = security.user.companyId;

    const targets = await db.sRTargetSetup.findMany({
      where: {
        isActive: true,
        ...(companyId ? { companyId } : {}),
      },
      include: {
        employee: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(targets);
  } catch (error) {
    console.error('Error fetching SR targets:', error);
    return NextResponse.json(
      { error: 'Failed to fetch SR targets' },
      { status: 500 }
    );
  }
}

// POST /api/sr-targets - Create SR target with Phase 7 shields
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'SRTargets', 'POST');
  if (!security.authorized) return security.response;

  try {
    const body = await request.json();
    const companyId = security.user.companyId;

    // ── Batch mode support ──
    if (body.batchMode === true && Array.isArray(body.data)) {
      const results: unknown[] = [];
      const errors: { index: number; error: string }[] = [];

      for (let i = 0; i < body.data.length; i++) {
        try {
          const item = body.data[i];
          const result = await createSingleTarget(item, companyId, security);
          results.push(result);
        } catch (err) {
          errors.push({
            index: i,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }

      // Log batch activity
      await logUserActivity({
        action: 'CREATE',
        module: 'Sys-Ops-Channels',
        recordId: 'BATCH',
        recordLabel: `Batch SR Target Setup — ${results.length} created, ${errors.length} failed`,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({ total: body.data.length, created: results.length, failed: errors.length, errors }),
      });

      return NextResponse.json(
        { created: results.length, failed: errors.length, results, errors },
        { status: 201 }
      );
    }

    // ── Single mode ──
    const result = await createSingleTarget(body, companyId, security);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating SR target:', error);
    if (error instanceof Error && error.message.startsWith('VALIDATION:')) {
      return NextResponse.json(
        { error: error.message.replace('VALIDATION:', '') },
        { status: 400 }
      );
    }
    if (error instanceof Error && error.message.startsWith('CONFLICT:')) {
      return NextResponse.json(
        { error: error.message.replace('CONFLICT:', '') },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to create SR target' },
      { status: 500 }
    );
  }
}

/**
 * createSingleTarget - Shared logic for single and batch SR target creation.
 * Enforces all Phase 7 financial benchmark shields and monthly overlap interlock.
 */
async function createSingleTarget(
  body: Record<string, unknown>,
  companyId: string | null,
  security: { user: { id: string; name: string; email: string; role: string; companyId: string | null } }
) {
  const { employeeId, month, year, targetAmount, minimumSalesQuota, commissionPercentage, status } = body;

  // ── Required field validation ──
  if (!employeeId || month === undefined || month === undefined || year === undefined || targetAmount === undefined || minimumSalesQuota === undefined || commissionPercentage === undefined) {
    throw new Error('VALIDATION:employeeId, month, year, targetAmount, minimumSalesQuota, and commissionPercentage are required');
  }

  // ── Month validation (1-12) ──
  const monthNum = Number(month);
  if (!Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) {
    throw new Error('VALIDATION:Month must be an integer between 1 and 12');
  }

  // ── Year validation ──
  const yearNum = Number(year);
  if (!Number.isInteger(yearNum) || yearNum < 2000 || yearNum > 2100) {
    throw new Error('VALIDATION:Year must be an integer between 2000 and 2100');
  }

  // ── Financial Benchmark Shield: targetAmount must be > 0 ──
  const safeTargetAmount = safeFinancialRound(Number(targetAmount));
  if (!safeTargetAmount || safeTargetAmount <= 0) {
    throw new Error('VALIDATION:targetAmount must be greater than zero. Negative, zero, or null values are not allowed.');
  }

  // ── Financial Benchmark Shield: minimumSalesQuota must be > 0 ──
  const safeMinimumSalesQuota = safeFinancialRound(Number(minimumSalesQuota));
  if (!safeMinimumSalesQuota || safeMinimumSalesQuota <= 0) {
    throw new Error('VALIDATION:minimumSalesQuota must be greater than zero. Negative, zero, or null values are not allowed.');
  }

  // ── Financial Benchmark Shield: commissionPercentage must be >= 0 and <= 100 ──
  const safeCommissionPercentage = safeFinancialRound(Number(commissionPercentage));
  if (safeCommissionPercentage < 0 || isNaN(safeCommissionPercentage)) {
    throw new Error('VALIDATION:commissionPercentage must be zero or greater. Negative values are not allowed.');
  }
  if (safeCommissionPercentage > 100) {
    throw new Error('VALIDATION:commissionPercentage must not exceed 100%.');
  }

  // ── Monthly Overlap Interlock ──
  // Prevent duplicate or overlapping target configurations for the same SR/Month/Year cycle
  const overlapFilter: Record<string, unknown> = {
    employeeId: String(employeeId),
    month: monthNum,
    year: yearNum,
    isActive: true,
  };
  if (companyId) {
    overlapFilter.companyId = companyId;
  }

  const existingTarget = await db.sRTargetSetup.findFirst({
    where: overlapFilter,
  });

  if (existingTarget) {
    throw new Error(
      `CONFLICT:Monthly overlap detected. An active SR target already exists for employee ${String(employeeId)} in month ${monthNum}/${yearNum}. Cannot create duplicate or overlapping target configurations.`
    );
  }

  // ── Create with transaction ──
  const result = await db.$transaction(async (tx) => {
    const target = await tx.sRTargetSetup.create({
      data: {
        employeeId: String(employeeId),
        month: monthNum,
        year: yearNum,
        targetAmount: safeTargetAmount,
        minimumSalesQuota: safeMinimumSalesQuota,
        commissionPercentage: safeCommissionPercentage,
        status: status ? String(status) : 'ACTIVE',
        ...(companyId && { companyId }),
        isActive: true,
      },
      include: {
        employee: true,
      },
    });

    await tx.auditLog.create({
      data: {
        action: 'CREATE',
        module: 'Sys-Ops-Channels',
        recordId: target.id,
        recordLabel: `${target.employee?.name || target.id} - ${target.month}/${target.year}`,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          employeeId: String(employeeId),
          month: monthNum,
          year: yearNum,
          targetAmount: safeTargetAmount,
          minimumSalesQuota: safeMinimumSalesQuota,
          commissionPercentage: safeCommissionPercentage,
        }),
      },
    });

    return target;
  });

  return result;
}
