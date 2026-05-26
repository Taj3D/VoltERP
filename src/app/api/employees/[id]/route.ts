import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Employees', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const item = await db.employee.findUnique({
      where: { id },
      include: {
        designation: true,
        department: true,
      },
    });
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch employee' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Employees', 'PUT');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const body = await request.json();
    const item = await db.$transaction(async (tx) => {
      const record = await tx.employee.update({
        where: { id },
        data: {
          employeeCode: body.employeeCode,
          name: body.name,
          designationId: body.designationId,
          departmentId: body.departmentId,
          joiningDate: body.joiningDate ? new Date(body.joiningDate) : undefined,
          phone: body.phone || null,
          address: body.address || null,
          photo: body.photo || null,
          isActive: body.isActive ?? true,
        },
        include: {
          designation: true,
          department: true,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'Employees',
          recordId: record.id,
          recordLabel: record.name || record.employeeCode || record.id,
          userId: 'system',
          userName: 'System',
          details: JSON.stringify({ employeeCode: record.employeeCode, name: record.name }),
        },
      });

      return record;
    });
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update employee' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Employees', 'DELETE');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    await db.$transaction(async (tx) => {
      const record = await tx.employee.findUnique({ where: { id } });
      if (!record) throw new Error('Not found');

      // FK check: Check if employee is referenced by active SR targets or employee leaves
      const [activeSRTargets, activeLeaves] = await Promise.all([
        tx.sRTargetSetup.count({ where: { employeeId: id, isActive: true } }),
        tx.employeeLeave.count({ where: { employeeId: id } }),
      ]);

      if (activeSRTargets > 0 || activeLeaves > 0) {
        throw new Error(
          `Cannot delete: Employee is referenced by ${activeSRTargets} active SR target(s) and ${activeLeaves} leave record(s)`
        );
      }

      await tx.employee.update({
        where: { id },
        data: { isActive: false },
      });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'Employees',
          recordId: record.id,
          recordLabel: record.name || record.employeeCode || record.id,
          userId: 'system',
          userName: 'System',
          details: JSON.stringify({ employeeCode: record.employeeCode, name: record.name, softDelete: true }),
        },
      });

      return record;
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.message?.startsWith('Cannot delete')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to delete employee' }, { status: 500 });
  }
}
