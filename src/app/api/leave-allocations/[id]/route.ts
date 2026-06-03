import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'EmployeeLeaves', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const companyId = security.user.companyId;

    const item = await db.leaveAllocation.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            employeeCode: true,
            designation: { select: { id: true, name: true, code: true } },
            department: { select: { id: true, name: true, code: true } },
          },
        },
      },
    });
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Cross-tenant companyId validation
    if (companyId && item.companyId && item.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // VAT Auditor masking not needed (leave allocations are not financial)
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch leave allocation' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'EmployeeLeaves', 'PUT');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const body = await request.json();
    const companyId = security.user.companyId;
    const userId = security.user.id;
    const userName = security.user.name;

    const item = await db.$transaction(async (tx) => {
      // Cross-tenant validation before modification
      const existing = await tx.leaveAllocation.findUnique({ where: { id } });
      if (!existing) throw new Error('Not found');
      if (companyId && existing.companyId && existing.companyId !== companyId) {
        throw new Error('Not found');
      }

      // Validate allocatedDays > 0 if provided
      const allocatedDays = body.allocatedDays !== undefined ? Number(body.allocatedDays) : existing.allocatedDays;
      if (allocatedDays <= 0) {
        throw new Error('allocatedDays must be greater than 0');
      }

      // Get usedDays: prevent manual override above allocatedDays
      const usedDays = body.usedDays !== undefined ? Number(body.usedDays) : existing.usedDays;
      if (usedDays > allocatedDays) {
        throw new Error('usedDays cannot exceed allocatedDays');
      }

      // Recompute remainingDays = allocatedDays - usedDays
      const remainingDays = allocatedDays - usedDays;

      const record = await tx.leaveAllocation.update({
        where: { id },
        data: {
          ...(body.employeeId !== undefined && { employeeId: body.employeeId }),
          ...(body.leaveType !== undefined && { leaveType: body.leaveType }),
          allocatedDays,
          usedDays,
          remainingDays,
          ...(body.year !== undefined && { year: Number(body.year) }),
        },
        include: {
          employee: {
            select: {
              id: true,
              name: true,
              employeeCode: true,
              designation: { select: { id: true, name: true, code: true } },
              department: { select: { id: true, name: true, code: true } },
            },
          },
        },
      });

      await logUserActivity({
          tx: tx,
        action: 'UPDATE',
        module: 'HR-Personnel-Core',
        recordId: record.id,
        recordLabel: `${record.employee?.name || record.employeeId} - ${record.leaveType} ${record.year}`,
        userId,
        userName,
        details: JSON.stringify({
          employeeId: record.employeeId,
          leaveType: record.leaveType,
          allocatedDays: record.allocatedDays,
          usedDays: record.usedDays,
          remainingDays: record.remainingDays,
          year: record.year,
        }),
      });

      return record;
    });

    return NextResponse.json(item);
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === 'Not found') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      if (error.message === 'allocatedDays must be greater than 0') {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      if (error.message === 'usedDays cannot exceed allocatedDays') {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    return NextResponse.json({ error: 'Failed to update leave allocation' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'EmployeeLeaves', 'DELETE');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const companyId = security.user.companyId;
    const userId = security.user.id;
    const userName = security.user.name;

    // Only admin can delete
    if (security.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Delete access denied. Only administrators can delete leave allocations.' },
        { status: 403 }
      );
    }

    await db.$transaction(async (tx) => {
      const record = await tx.leaveAllocation.findUnique({ where: { id } });
      if (!record) throw new Error('Not found');

      // Cross-tenant validation
      if (companyId && record.companyId && record.companyId !== companyId) {
        throw new Error('Not found');
      }

      // Hard delete (leave allocations can be removed)
      await tx.leaveAllocation.delete({ where: { id } });

      await logUserActivity({
          tx: tx,
        action: 'DELETE',
        module: 'HR-Personnel-Core',
        recordId: record.id,
        recordLabel: `Leave allocation - ${record.leaveType} ${record.year}`,
        userId,
        userName,
        details: JSON.stringify({
          employeeId: record.employeeId,
          leaveType: record.leaveType,
          allocatedDays: record.allocatedDays,
          usedDays: record.usedDays,
          remainingDays: record.remainingDays,
          year: record.year,
          hardDelete: true,
        }),
      });
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Not found') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to delete leave allocation' }, { status: 500 });
  }
}
