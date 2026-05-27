import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, maskForVatAuditor, validateImageFields } from '@/lib/api-security';

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
        _count: { select: { leaves: true, srTargets: true } },
      },
    });
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Mask salary for SR and VAT Auditor
    const masked = (security.user.role === 'vat_auditor' || security.user.role === 'sr')
      ? maskForVatAuditor(item, security.user.role, ['baseSalary'])
      : item;

    return NextResponse.json(masked);
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
    const imgError = validateImageFields(body, ['photo', 'nidFrontImage', 'nidBackImage']);
    if (imgError) return NextResponse.json({ error: imgError }, { status: 400 });
    const item = await db.$transaction(async (tx) => {
      const record = await tx.employee.update({
        where: { id },
        data: {
          name: body.name,
          designationId: body.designationId,
          departmentId: body.departmentId,
          joiningDate: body.joiningDate ? new Date(body.joiningDate) : undefined,
          baseSalary: body.baseSalary ?? undefined,
          employeeType: body.employeeType || undefined,
          status: body.status || undefined,
          gender: body.gender || null,
          bloodGroup: body.bloodGroup || null,
          religion: body.religion || null,
          dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
          fatherName: body.fatherName || null,
          motherName: body.motherName || null,
          spouseName: body.spouseName || null,
          maritalStatus: body.maritalStatus || null,
          nidNumber: body.nidNumber || null,
          tinNumber: body.tinNumber || null,
          phone: body.phone || null,
          email: body.email || null,
          presentAddress: body.presentAddress || null,
          permanentAddress: body.permanentAddress || null,
          emergencyContact: body.emergencyContact || null,
          emergencyContactName: body.emergencyContactName || null,
          bankName: body.bankName || null,
          bankAccountNo: body.bankAccountNo || null,
          photo: body.photo || null,
          nidFrontImage: body.nidFrontImage || null,
          nidBackImage: body.nidBackImage || null,
          referenceBy: body.referenceBy || null,
          address: body.address || null,
          isActive: body.isActive ?? true,
        },
        include: {
          designation: true,
          department: true,
          _count: { select: { leaves: true, srTargets: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'Employees',
          recordId: record.id,
          recordLabel: `${record.employeeCode} - ${record.name}`,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
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

      const [activeSRTargets, activeLeaves] = await Promise.all([
        tx.sRTargetSetup.count({ where: { employeeId: id, isActive: true } }),
        tx.employeeLeave.count({ where: { employeeId: id } }),
      ]);

      if (activeSRTargets > 0 || activeLeaves > 0) {
        throw new Error(
          `Cannot delete: Employee is referenced by ${activeSRTargets} active SR target(s) and ${activeLeaves} leave record(s)`
        );
      }

      await tx.employee.update({ where: { id }, data: { isActive: false } });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'Employees',
          recordId: record.id,
          recordLabel: `${record.employeeCode} - ${record.name}`,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
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
