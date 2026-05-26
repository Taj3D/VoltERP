import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Categories', 'GET');
  if (!security.authorized) return security.response;
  try {
    const items = await db.category.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      include: {
        parent: { select: { id: true, name: true, code: true } },
        children: { select: { id: true, name: true, code: true } },
        _count: { select: { products: true, children: true } },
      },
    });
    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Categories', 'POST');
  if (!security.authorized) return security.response;
  try {
    const body = await request.json();
    const item = await db.$transaction(async (tx) => {
      // Auto-generate code if not provided
      let code = body.code;
      if (!code) {
        const lastCategory = await tx.category.findFirst({
          orderBy: { createdAt: 'desc' },
          select: { code: true },
        });
        let nextNum = 1;
        if (lastCategory?.code) {
          const match = lastCategory.code.match(/CAT-(\d+)/);
          if (match) nextNum = parseInt(match[1]) + 1;
        }
        code = `CAT-${String(nextNum).padStart(3, '0')}`;
      }

      const record = await tx.category.create({
        data: {
          code,
          name: body.name,
          description: body.description || null,
          parentCategoryId: body.parentCategoryId || null,
          isActive: body.isActive ?? true,
        },
        include: {
          parent: { select: { id: true, name: true, code: true } },
          children: { select: { id: true, name: true, code: true } },
          _count: { select: { products: true, children: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'Categories',
          recordId: record.id,
          recordLabel: record.name || record.code || record.id,
          userId: 'system',
          userName: 'System',
          details: JSON.stringify({ code: record.code, name: record.name, parentCategoryId: body.parentCategoryId || null }),
        },
      });

      return record;
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create category' }, { status: 500 });
  }
}
