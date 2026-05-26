import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, maskForVatAuditor } from '@/lib/api-security';

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Employees', 'GET');
  if (!security.authorized) return security.response;
  try {
    // SR role: can view employees but salary fields are masked
    // Dealer role: blocked at api-security level (MODULE_DENY)
    const items = await db.employee.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      include: {
        designation: true,
        department: true,
        _count: { select: { leaves: true, srTargets: true } },
      },
    });

    // Mask salary for SR and VAT Auditor
    const maskedItems = items.map(item => {
      if (security.user.role === 'vat_auditor' || security.user.role === 'sr') {
        return maskForVatAuditor(item, security.user.role, ['baseSalary']);
      }
      return item;
    });

    return NextResponse.json(maskedItems);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch employees' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Employees', 'POST');
  if (!security.authorized) return security.response;
  // SR: blocked from creating employees (handled by WRITE_DENY in api-security)
  try {
    const body = await request.json();
    const item = await db.$transaction(async (tx) => {
      // Auto-generate EMP-XXXXX code (5-digit zero-padded)
      let employeeCode = body.employeeCode;
      if (!employeeCode) {
        const lastEmployee = await tx.employee.findFirst({
          orderBy: { createdAt: 'desc' },
          select: { employeeCode: true },
        });
        let nextNum = 1;
        if (lastEmployee?.employeeCode) {
          const match = lastEmployee.employeeCode.match(/EMP-(\d+)/);
          if (match) nextNum = parseInt(match[1]) + 1;
        }
        employeeCode = `EMP-${String(nextNum).padStart(5, '0')}`;
      }

      const record = await tx.employee.create({
        data: {
          employeeCode,
          name: body.name,
          designationId: body.designationId,
          departmentId: body.departmentId,
          joiningDate: body.joiningDate ? new Date(body.joiningDate) : new Date(),
          baseSalary: body.baseSalary ?? 0,
          employeeType: body.employeeType || 'Permanent',
          status: body.status || 'Active',
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
          action: 'CREATE',
          module: 'Employees',
          recordId: record.id,
          recordLabel: `${record.employeeCode} - ${record.name}`,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ employeeCode: record.employeeCode, name: record.name, designationId: record.designationId, departmentId: record.departmentId }),
        },
      });

      return record;
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create employee' }, { status: 500 });
  }
}
