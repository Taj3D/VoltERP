import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity } from '@/lib/api-security';

// GET /api/sr-targets/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'SRTargets', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const target = await db.sRTargetSetup.findUnique({
      where: { id },
      include: {
        employee: true,
      },
    });

    if (!target) {
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

// PUT /api/sr-targets/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'SRTargets', 'PUT');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const body = await request.json();
    const { employeeId, month, year, targetAmount, isActive } = body;

    // Validate month and year if provided
    if (month !== undefined && (month < 1 || month > 12)) {
      return NextResponse.json(
        { error: 'Month must be between 1 and 12' },
        { status: 400 }
      );
    }
    if (year !== undefined && (year < 2000 || year > 2100)) {
      return NextResponse.json(
        { error: 'Year must be between 2000 and 2100' },
        { status: 400 }
      );
    }
    if (targetAmount !== undefined && targetAmount < 0) {
      return NextResponse.json(
        { error: 'Target amount must be a positive number' },
        { status: 400 }
      );
    }

    const result = await db.$transaction(async (tx) => {
      const target = await tx.sRTargetSetup.update({
        where: { id },
        data: {
          ...(employeeId && { employeeId }),
          ...(month !== undefined && { month }),
          ...(year !== undefined && { year }),
          ...(targetAmount !== undefined && { targetAmount }),
          ...(isActive !== undefined && { isActive }),
        },
        include: {
          employee: true,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'SRTargets',
          recordId: target.id,
          recordLabel: `${target.employee?.name || target.id} - ${target.month}/${target.year}`,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ employeeId, month, year, targetAmount, isActive }),
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

// DELETE /api/sr-targets/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'SRTargets', 'DELETE');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;

    await db.$transaction(async (tx) => {
      const record = await tx.sRTargetSetup.findUnique({
        where: { id },
        include: { employee: true },
      });
      if (!record) throw new Error('Not found');

      // SRTargetSetup has no FK references, safe to soft-delete
      await tx.sRTargetSetup.update({
        where: { id },
        data: { isActive: false },
      });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'SRTargets',
          recordId: record.id,
          recordLabel: `${record.employee?.name || record.id} - ${record.month}/${record.year}`,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ employeeId: record.employeeId, month: record.month, year: record.year, softDelete: true }),
        },
      });

      return record;
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
