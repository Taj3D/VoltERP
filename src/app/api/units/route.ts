import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Units', 'GET');
  if (!security.authorized) return security.response;
  try {
    const items = await db.unit.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch units' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Units', 'POST');
  if (!security.authorized) return security.response;
  try {
    const body = await request.json();
    const item = await db.$transaction(async (tx) => {
      const count = await tx.unit.count();
      const code = `UNT-${String(count + 1).padStart(5, '0')}`;

      const record = await tx.unit.create({
        data: {
          code,
          name: body.name,
          symbol: body.symbol || null,
          description: body.description || null,
          isActive: body.isActive ?? true,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'Units',
          recordId: record.id,
          recordLabel: record.name || record.code,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ code: record.code, name: record.name, symbol: record.symbol }),
        },
      });

      return record;
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create unit' }, { status: 500 });
  }
}
