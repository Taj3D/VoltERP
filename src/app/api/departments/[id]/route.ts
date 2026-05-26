import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Departments', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const item = await db.department.findUnique({ where: { id } });
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Departments', 'PUT');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const body = await request.json();
    const item = await db.$transaction(async (tx) => {
      const record = await tx.department.update({
        where: { id },
        data: {
          name: body.name,
          description: body.description || null,
          isActive: body.isActive ?? true,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'Departments',
          recordId: record.id,
          recordLabel: record.name || record.id,
          userId: 'system',
          userName: 'System',
          details: JSON.stringify({ name: record.name }),
        },
      });

      return record;
    });
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Departments', 'DELETE');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    await db.$transaction(async (tx) => {
      const record = await tx.department.findUnique({ where: { id } });
      if (!record) throw new Error('Not found');

      // FK check: Check if department is referenced by active designations or employees
      const [activeDesignations, activeEmployees] = await Promise.all([
        tx.designation.count({ where: { departmentId: id, isActive: true } }),
        tx.employee.count({ where: { departmentId: id, isActive: true } }),
      ]);

      if (activeDesignations > 0 || activeEmployees > 0) {
        throw new Error(
          `Cannot delete: Department is referenced by ${activeDesignations} active designation(s) and ${activeEmployees} active employee(s)`
        );
      }

      await tx.department.update({
        where: { id },
        data: { isActive: false },
      });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'Departments',
          recordId: record.id,
          recordLabel: record.name || record.id,
          userId: 'system',
          userName: 'System',
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
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
