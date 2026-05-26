import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'EmployeeLeaves', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const item = await db.employeeLeave.findUnique({
      where: { id },
      include: { employee: true },
    });
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch employee leave' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'EmployeeLeaves', 'PUT');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const body = await request.json();
    const item = await db.$transaction(async (tx) => {
      const record = await tx.employeeLeave.update({
        where: { id },
        data: {
          employeeId: body.employeeId,
          leaveType: body.leaveType,
          fromDate: body.fromDate ? new Date(body.fromDate) : undefined,
          toDate: body.toDate ? new Date(body.toDate) : undefined,
          reason: body.reason || null,
          status: body.status,
        },
        include: { employee: true },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'EmployeeLeaves',
          recordId: record.id,
          recordLabel: `${record.employee?.name || record.id} - ${record.leaveType}`,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ employeeId: record.employeeId, leaveType: record.leaveType, status: record.status }),
        },
      });

      return record;
    });
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update employee leave' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'EmployeeLeaves', 'DELETE');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    await db.$transaction(async (tx) => {
      const record = await tx.employeeLeave.findUnique({
        where: { id },
        include: { employee: true },
      });
      if (!record) throw new Error('Not found');

      // EmployeeLeave has no isActive field - perform hard delete with audit log
      await tx.employeeLeave.delete({ where: { id } });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'EmployeeLeaves',
          recordId: record.id,
          recordLabel: `${record.employee?.name || record.id} - ${record.leaveType}`,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ employeeId: record.employeeId, leaveType: record.leaveType, hardDelete: true }),
        },
      });

      return record;
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete employee leave' }, { status: 500 });
  }
}
