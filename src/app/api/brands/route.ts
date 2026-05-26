import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Brands', 'GET');
  if (!security.authorized) return security.response;
  try {
    const items = await db.brand.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { products: true } },
      },
    });
    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch brands' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Brands', 'POST');
  if (!security.authorized) return security.response;
  try {
    const body = await request.json();
    const item = await db.$transaction(async (tx) => {
      const count = await tx.brand.count();
      const code = `BRN-${String(count + 1).padStart(5, '0')}`;

      const record = await tx.brand.create({
        data: {
          code,
          name: body.name,
          description: body.description || null,
          isActive: body.isActive ?? true,
        },
        include: {
          _count: { select: { products: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'Brands',
          recordId: record.id,
          recordLabel: record.name || record.code,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ code: record.code, name: record.name }),
        },
      });

      return record;
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create brand' }, { status: 500 });
  }
}
