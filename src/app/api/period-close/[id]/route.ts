import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity, checkPeriodClosePermission } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// GET /api/period-close/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'PeriodClose', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const companyId = security.user.companyId;

    const periodClose = await db.periodClose.findUnique({ where: { id } });

    if (!periodClose) {
      return NextResponse.json(
        { error: 'Period close record not found' },
        { status: 404 }
      );
    }

    // CROSS-TENANT VALIDATION: Verify the record belongs to the user's company
    if (companyId && periodClose.companyId && periodClose.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Period close record not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ...periodClose,
      canModify: !periodClose.isLocked,
    });
  } catch (error) {
    console.error('Error fetching period close record:', error);
    return NextResponse.json(
      { error: 'Failed to fetch period close record' },
      { status: 500 }
    );
  }
}

// PUT /api/period-close/[id] - Toggle lock and update notes
// ADMIN-ONLY: Only administrators can unlock/relock periods
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'PeriodClose', 'PUT');
  if (!security.authorized) return security.response;

  // ADMIN-ONLY CHECK: Only admin can unlock/relock periods
  const permissionCheck = checkPeriodClosePermission(security.user.role);
  if (permissionCheck) return permissionCheck;

  try {
    const { id } = await params;
    const companyId = security.user.companyId;
    const body = await request.json();
    const { isLocked, notes } = body;

    // Verify record exists
    const existing = await db.periodClose.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Period close record not found' },
        { status: 404 }
      );
    }

    // CROSS-TENANT VALIDATION: Verify the record belongs to the user's company
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Period close record not found' },
        { status: 404 }
      );
    }

    const result = await db.$transaction(async (tx) => {
      const updateData: Record<string, unknown> = {};
      if (isLocked !== undefined) updateData.isLocked = isLocked;
      if (notes !== undefined) updateData.notes = notes;

      const periodClose = await tx.periodClose.update({
        where: { id },
        data: updateData,
      });

      return { ...periodClose, canModify: !periodClose.isLocked };
    });

    // Activity logging (non-blocking, outside transaction)
    // Log a detailed entry for unlock actions vs normal updates
    if (isLocked === false && existing.isLocked === true) {
      await logUserActivity({
        action: 'UPDATE',
        module: 'Acc-Period-Close',
        recordId: id,
        recordLabel: `${existing.code} - ${existing.periodMonth}/${existing.periodYear}`,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          warning: 'PERIOD UNLOCKED',
          code: existing.code,
          periodMonth: existing.periodMonth,
          periodYear: existing.periodYear,
          previouslyLocked: true,
          nowLocked: false,
          unlockedBy: security.user.name,
          companyId: companyId || null,
        }),
      });
    } else {
      await logUserActivity({
        action: 'UPDATE',
        module: 'Acc-Period-Close',
        recordId: id,
        recordLabel: `${existing.code} - ${existing.periodMonth}/${existing.periodYear}`,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          code: existing.code,
          before: { isLocked: existing.isLocked, notes: existing.notes },
          after: { isLocked: isLocked ?? existing.isLocked, notes: notes ?? existing.notes },
          companyId: companyId || null,
        }),
      });
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Error updating period close record:', error);
    const message = error instanceof Error ? error.message : 'Failed to update period close record';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/period-close/[id] - Cannot delete if locked; admin-only
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'PeriodClose', 'DELETE');
  if (!security.authorized) return security.response;

  // ADMIN-ONLY CHECK: Only admin can delete period records
  const permissionCheck = checkPeriodClosePermission(security.user.role);
  if (permissionCheck) return permissionCheck;

  try {
    const { id } = await params;
    const companyId = security.user.companyId;

    const existing = await db.periodClose.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Period close record not found' },
        { status: 404 }
      );
    }

    // CROSS-TENANT VALIDATION: Verify the record belongs to the user's company
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Period close record not found' },
        { status: 404 }
      );
    }

    // VALIDATION: Cannot delete if isLocked=true
    if (existing.isLocked) {
      return NextResponse.json(
        { error: 'Cannot delete a locked period close record' },
        { status: 403 }
      );
    }

    // Hard delete for unlocked records (PeriodClose has no isActive field)
    await db.$transaction(async (tx) => {
      await tx.periodClose.delete({ where: { id } });
    });

    // Activity logging (non-blocking, outside transaction)
    await logUserActivity({
      action: 'DELETE',
      module: 'Acc-Period-Close',
      recordId: id,
      recordLabel: `${existing.code} - ${existing.periodMonth}/${existing.periodYear}`,
      userId: security.user.id,
      userName: security.user.name,
      details: JSON.stringify({
        code: existing.code,
        periodMonth: existing.periodMonth,
        periodYear: existing.periodYear,
        wasLocked: existing.isLocked,
        companyId: companyId || null,
      }),
    });

    return NextResponse.json({ message: 'Period close record deleted successfully' });
  } catch (error) {
    console.error('Error deleting period close record:', error);
    return NextResponse.json(
      { error: 'Failed to delete period close record' },
      { status: 500 }
    );
  }
}
