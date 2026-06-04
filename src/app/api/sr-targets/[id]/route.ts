import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity, safeFinancialRound } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// ============================================================
// SR TARGET SETUP [id] — Phase 7: Operations & Field Controls
// Financial Benchmark Shields, Monthly Overlap Interlock,
// Multi-tenant Isolation, Activity Logging
// Module token: "Sys-Ops-Channels"
// ============================================================

// GET /api/sr-targets/[id] - Get single SR target with cross-tenant validation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'SRTargets', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const companyId = security.user.companyId;

    const target = await db.sRTargetSetup.findUnique({
      where: { id },
      include: {
        employee: true,
      },
    });

    if (!target || !target.isActive) {
      return NextResponse.json(
        { error: 'SR target not found' },
        { status: 404 }
      );
    }

    // ── Cross-tenant validation ──
    if (companyId && target.companyId && target.companyId !== companyId) {
      return NextResponse.json(
        { error: 'SR target not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(target);
  } catch (error) {
    console.error('Error fetching SR target:', error);
    return NextResponse.json(
      { error: 'Failed to fetch SR target' },
      { status: 500 }
    );
  }
}

// PUT /api/sr-targets/[id] - Update SR target with Phase 7 shields
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'SRTargets', 'PUT');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const companyId = security.user.companyId;
    const body = await request.json();

    const { employeeId, month, year, targetAmount, minimumSalesQuota, commissionPercentage, status, isActive } = body;

    // ── Pre-fetch record for cross-tenant validation ──
    const existing = await db.sRTargetSetup.findUnique({
      where: { id },
      include: { employee: true },
    });

    if (!existing || !existing.isActive) {
      return NextResponse.json(
        { error: 'SR target not found' },
        { status: 404 }
      );
    }

    // ── Cross-tenant validation ──
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json(
        { error: 'SR target not found' },
        { status: 404 }
      );
    }

    // ── Month validation (1-12) if provided ──
    const effectiveMonth = month !== undefined ? Number(month) : existing.month;
    if (month !== undefined && (!Number.isInteger(effectiveMonth) || effectiveMonth < 1 || effectiveMonth > 12)) {
      return NextResponse.json(
        { error: 'Month must be an integer between 1 and 12' },
        { status: 400 }
      );
    }

    // ── Year validation if provided ──
    const effectiveYear = year !== undefined ? Number(year) : existing.year;
    if (year !== undefined && (!Number.isInteger(effectiveYear) || effectiveYear < 2000 || effectiveYear > 2100)) {
      return NextResponse.json(
        { error: 'Year must be an integer between 2000 and 2100' },
        { status: 400 }
      );
    }

    // ── Financial Benchmark Shield: targetAmount must be > 0 if provided ──
    let safeTargetAmount: number | undefined;
    if (targetAmount !== undefined) {
      safeTargetAmount = safeFinancialRound(Number(targetAmount));
      if (!safeTargetAmount || safeTargetAmount <= 0) {
        return NextResponse.json(
          { error: 'targetAmount must be greater than zero. Negative, zero, or null values are not allowed.' },
          { status: 400 }
        );
      }
    }

    // ── Financial Benchmark Shield: minimumSalesQuota must be > 0 if provided ──
    let safeMinimumSalesQuota: number | undefined;
    if (minimumSalesQuota !== undefined) {
      safeMinimumSalesQuota = safeFinancialRound(Number(minimumSalesQuota));
      if (!safeMinimumSalesQuota || safeMinimumSalesQuota <= 0) {
        return NextResponse.json(
          { error: 'minimumSalesQuota must be greater than zero. Negative, zero, or null values are not allowed.' },
          { status: 400 }
        );
      }
    }

    // ── Financial Benchmark Shield: commissionPercentage must be >= 0 and <= 100 if provided ──
    let safeCommissionPercentage: number | undefined;
    if (commissionPercentage !== undefined) {
      safeCommissionPercentage = safeFinancialRound(Number(commissionPercentage));
      if (safeCommissionPercentage < 0 || isNaN(safeCommissionPercentage)) {
        return NextResponse.json(
          { error: 'commissionPercentage must be zero or greater. Negative values are not allowed.' },
          { status: 400 }
        );
      }
      if (safeCommissionPercentage > 100) {
        return NextResponse.json(
          { error: 'commissionPercentage must not exceed 100%.' },
          { status: 400 }
        );
      }
    }

    // ── Monthly Overlap Interlock (excluding current record by id) ──
    const effectiveEmployeeId = employeeId ? String(employeeId) : existing.employeeId;
    const overlapFilter: Record<string, unknown> = {
      employeeId: effectiveEmployeeId,
      month: effectiveMonth,
      year: effectiveYear,
      isActive: true,
      id: { not: id },
    };
    if (companyId) {
      overlapFilter.companyId = companyId;
    } else if (existing.companyId) {
      overlapFilter.companyId = existing.companyId;
    }

    const overlappingTarget = await db.sRTargetSetup.findFirst({
      where: overlapFilter,
    });

    if (overlappingTarget) {
      return NextResponse.json(
        { error: `Monthly overlap detected. An active SR target already exists for employee ${effectiveEmployeeId} in month ${effectiveMonth}/${effectiveYear}. Cannot create duplicate or overlapping target configurations.` },
        { status: 409 }
      );
    }

    // ── Update with transaction ──
    const result = await db.$transaction(async (tx) => {
      const target = await tx.sRTargetSetup.update({
        where: { id },
        data: {
          ...(employeeId && { employeeId: String(employeeId) }),
          ...(month !== undefined && { month: effectiveMonth }),
          ...(year !== undefined && { year: effectiveYear }),
          ...(safeTargetAmount !== undefined && { targetAmount: safeTargetAmount }),
          ...(safeMinimumSalesQuota !== undefined && { minimumSalesQuota: safeMinimumSalesQuota }),
          ...(safeCommissionPercentage !== undefined && { commissionPercentage: safeCommissionPercentage }),
          ...(status !== undefined && { status: String(status) }),
          ...(isActive !== undefined && { isActive: Boolean(isActive) }),
        },
        include: {
          employee: true,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'Sys-Ops-Channels',
          recordId: target.id,
          recordLabel: `${target.employee?.name || target.id} - ${target.month}/${target.year}`,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            employeeId: employeeId ? String(employeeId) : undefined,
            month: month !== undefined ? effectiveMonth : undefined,
            year: year !== undefined ? effectiveYear : undefined,
            targetAmount: safeTargetAmount,
            minimumSalesQuota: safeMinimumSalesQuota,
            commissionPercentage: safeCommissionPercentage,
            status: status !== undefined ? String(status) : undefined,
            isActive: isActive !== undefined ? Boolean(isActive) : undefined,
          }),
        },
      });

      return target;
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating SR target:', error);
    return NextResponse.json(
      { error: 'Failed to update SR target' },
      { status: 500 }
    );
  }
}

// DELETE /api/sr-targets/[id] - Soft-delete SR target with cross-tenant validation
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'SRTargets', 'DELETE');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const companyId = security.user.companyId;

    // ── Pre-fetch record for cross-tenant validation ──
    const existing = await db.sRTargetSetup.findUnique({
      where: { id },
      include: { employee: true },
    });

    if (!existing || !existing.isActive) {
      return NextResponse.json(
        { error: 'SR target not found' },
        { status: 404 }
      );
    }

    // ── Cross-tenant validation ──
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json(
        { error: 'SR target not found' },
        { status: 404 }
      );
    }

    // ── Soft-delete with transaction ──
    await db.$transaction(async (tx) => {
      await tx.sRTargetSetup.update({
        where: { id },
        data: {
          isActive: false,
          status: 'INACTIVE',
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'Sys-Ops-Channels',
          recordId: existing.id,
          recordLabel: `${existing.employee?.name || existing.id} - ${existing.month}/${existing.year}`,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            employeeId: existing.employeeId,
            month: existing.month,
            year: existing.year,
            targetAmount: existing.targetAmount,
            minimumSalesQuota: existing.minimumSalesQuota,
            commissionPercentage: existing.commissionPercentage,
            softDelete: true,
          }),
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting SR target:', error);
    return NextResponse.json(
      { error: 'Failed to delete SR target' },
      { status: 500 }
    );
  }
}
