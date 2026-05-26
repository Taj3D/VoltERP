import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Categories', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const item = await db.category.findUnique({
      where: { id },
      include: {
        parent: { select: { id: true, name: true, code: true } },
        children: { select: { id: true, name: true, code: true } },
        _count: { select: { products: true, children: true } },
      },
    });
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Categories', 'PUT');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const body = await request.json();

    const item = await db.$transaction(async (tx) => {
      // FIX 5: Circular reference prevention for parentCategoryId
      if (body.parentCategoryId !== undefined && body.parentCategoryId !== null) {
        // Cannot set self as parent
        if (body.parentCategoryId === id) {
          throw new Error('Circular reference: A category cannot be its own parent');
        }

        // Traverse the parent chain to detect cycles
        let currentParentId: string | null = body.parentCategoryId;
        const visited = new Set<string>([id]);

        while (currentParentId) {
          if (visited.has(currentParentId)) {
            throw new Error('Circular reference detected: Setting this parent would create a cycle in the category hierarchy');
          }
          visited.add(currentParentId);

          const parent = await tx.category.findUnique({
            where: { id: currentParentId },
            select: { parentCategoryId: true },
          });

          if (!parent) break;
          currentParentId = parent.parentCategoryId;
        }
      }

      const record = await tx.category.update({
        where: { id },
        data: {
          name: body.name,
          description: body.description || null,
          parentCategoryId: body.parentCategoryId !== undefined ? (body.parentCategoryId || null) : undefined,
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
          action: 'UPDATE',
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
    return NextResponse.json(item);
  } catch (error: any) {
    if (error?.message?.startsWith('Circular reference')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Categories', 'DELETE');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const result = await db.$transaction(async (tx) => {
      const record = await tx.category.findUnique({ where: { id } });
      if (!record) throw new Error('Not found');

      // FK check: Check if category is referenced by active products or active children
      const [activeProducts, activeChildren] = await Promise.all([
        tx.product.count({ where: { categoryId: id, isActive: true } }),
        tx.category.count({ where: { parentCategoryId: id, isActive: true } }),
      ]);

      if (activeProducts > 0 || activeChildren > 0) {
        throw new Error(
          `Cannot delete: Category is referenced by ${activeProducts} active product(s) and ${activeChildren} active child categor(y/ies)`
        );
      }

      // Null out parentCategoryId on inactive children to avoid FK issues
      await tx.category.updateMany({
        where: { parentCategoryId: id },
        data: { parentCategoryId: null },
      });

      await tx.category.update({
        where: { id },
        data: { isActive: false },
      });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'Categories',
          recordId: record.id,
          recordLabel: record.name || record.code || record.id,
          userId: 'system',
          userName: 'System',
          details: JSON.stringify({ code: record.code, name: record.name, softDelete: true }),
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
