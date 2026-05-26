import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Designations', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const item = await db.designation.findUnique({
      where: { id },
      include: { department: true },
    });
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch designation' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Designations', 'PUT');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const body = await request.json();
    const item = await db.$transaction(async (tx) => {
      const record = await tx.designation.update({
        where: { id },
        data: {
          name: body.name,
          departmentId: body.departmentId,
          isActive: body.isActive ?? true,
        },
        include: { department: true },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'Designations',
          recordId: record.id,
          recordLabel: record.name || record.id,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ name: record.name, departmentId: record.departmentId }),
        },
      });

      return record;
    });
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update designation' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Designations', 'DELETE');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    await db.$transaction(async (tx) => {
      const record = await tx.designation.findUnique({ where: { id } });
      if (!record) throw new Error('Not found');

      // FK check: Check if designation is referenced by active employees
      const activeEmployees = await tx.employee.count({ where: { designationId: id, isActive: true } });
      if (activeEmployees > 0) {
        throw new Error(`Cannot delete: Designation is referenced by ${activeEmployees} active employee(s)`);
      }

      await tx.designation.update({
        where: { id },
        data: { isActive: false },
      });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'Designations',
          recordId: record.id,
          recordLabel: record.name || record.id,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ name: record.name, softDelete: true }),
        },
      });

      return record;
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.message?.startsWith('Cannot delete')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to delete designation' }, { status: 500 });
  }
}
