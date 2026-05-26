import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Designations', 'GET');
  if (!security.authorized) return security.response;
  try {
    const items = await db.designation.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      include: { department: true },
    });
    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch designations' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Designations', 'POST');
  if (!security.authorized) return security.response;
  try {
    const body = await request.json();
    const item = await db.$transaction(async (tx) => {
      const record = await tx.designation.create({
        data: {
          name: body.name,
          departmentId: body.departmentId,
          isActive: body.isActive ?? true,
        },
        include: { department: true },
      });

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
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
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create designation' }, { status: 500 });
  }
}
