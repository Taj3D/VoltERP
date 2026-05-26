import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, maskForVatAuditor } from '@/lib/api-security';
import type { UserRole } from '@/lib/api-security';

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Designations', 'GET');
  if (!security.authorized) return security.response;
  try {
    const items = await db.designation.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      include: { department: true, _count: { select: { employees: true } } },
    });

    // VAT Auditor masking: hide salary band values
    const maskedItems = items.map(item => {
      if (security.user.role === 'vat_auditor') {
        return maskForVatAuditor(item, security.user.role, ['salaryBandMin', 'salaryBandMax']);
      }
      return item;
    });

    return NextResponse.json(maskedItems);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch designations' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Designations', 'POST');
  if (!security.authorized) return security.response;
  try {
    const body = await request.json();
    if (body.salaryBandMax !== undefined && body.salaryBandMin !== undefined && Number(body.salaryBandMax) < Number(body.salaryBandMin)) {
      return NextResponse.json(
        { error: 'salaryBandMax must be greater than or equal to salaryBandMin' },
        { status: 400 }
      );
    }
    const item = await db.$transaction(async (tx) => {
      // Auto-generate DSG-XXXXX code
      let code = body.code;
      if (!code) {
        const lastRecord = await tx.designation.findFirst({
          orderBy: { createdAt: 'desc' },
          select: { code: true },
        });
        let nextNum = 1;
        if (lastRecord?.code) {
          const match = lastRecord.code.match(/DSG-(\d+)/);
          if (match) nextNum = parseInt(match[1]) + 1;
        }
        code = `DSG-${String(nextNum).padStart(5, '0')}`;
      }

      const record = await tx.designation.create({
        data: {
          code,
          name: body.name,
          departmentId: body.departmentId,
          gradeLevel: body.gradeLevel || null,
          salaryBandMin: body.salaryBandMin ?? 0,
          salaryBandMax: body.salaryBandMax ?? 0,
          description: body.description || null,
          isActive: body.isActive ?? true,
        },
        include: { department: true, _count: { select: { employees: true } } },
      });

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'Designations',
          recordId: record.id,
          recordLabel: `${record.code} - ${record.name}`,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ code: record.code, name: record.name, departmentId: record.departmentId, gradeLevel: record.gradeLevel, salaryBandMin: record.salaryBandMin, salaryBandMax: record.salaryBandMax }),
        },
      });

      return record;
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create designation' }, { status: 500 });
  }
}
