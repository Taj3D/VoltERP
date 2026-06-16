// ============================================================
// Categories [id] API — Multi-tenant Cross-tenant Validation
// Module Token: Sys-Catalog-Core
// Phase 5: Boundary shields, case-insensitive unique checks,
//          text sanitizer, circular reference prevention
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// ── Text Sanitizer ──
function sanitizeText(value: unknown): string {
  if (typeof value !== 'string') return '';
  let cleaned = value.trim();
  cleaned = cleaned.replace(/<[^>]*>/g, ''); // Strip HTML tags
  cleaned = cleaned.replace(/\s{2,}/g, ' '); // Collapse double/triple spaces
  return cleaned;
}

// ── Name Length Limit ──
const CATEGORY_NAME_MAX_LENGTH = 100;

// GET /api/categories/[id] — Get single category with cross-tenant validation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Categories', 'GET');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

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

    if (!item) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cross-tenant validation: if user has a companyId and the record has one, they must match
    if (companyId && item.companyId && item.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(item);
  } catch (error) {
    console.error('Error fetching category:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch category' },
      { status: 500 }
    );
  }
}

// PUT /api/categories/[id] — Update with cross-tenant validation, text sanitizer & unique check
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Categories', 'PUT');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId || null;

  try {
    const { id } = await params;
    const body = await request.json();

    // Pre-fetch the existing record for cross-tenant validation
    const existing = await db.category.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Sanitize text fields
    const sanitizedName = sanitizeText(body.name);
    const sanitizedDescription = sanitizeText(body.description);

    if (body.name !== undefined && !sanitizedName) {
      return NextResponse.json(
        { error: 'Category name cannot be empty after sanitization.' },
        { status: 400 }
      );
    }

    if (sanitizedName && sanitizedName.length > CATEGORY_NAME_MAX_LENGTH) {
      return NextResponse.json(
        { error: `Category name must not exceed ${CATEGORY_NAME_MAX_LENGTH} characters (got ${sanitizedName.length}).` },
        { status: 400 }
      );
    }

    const item = await db.$transaction(async (tx) => {
      // Case-insensitive unique check scoped by company (exclude self) (SQLite-compatible)
      if (body.name !== undefined) {
        const existingNames = await tx.category.findMany({
          where: {
            companyId: companyId || null,
            isActive: true,
            id: { not: id },
          },
          select: { id: true, name: true },
        });
        const duplicate = existingNames.find(e => e.name.toLowerCase() === sanitizedName.toLowerCase());

        if (duplicate) {
          throw new Error(`DUPLICATE_NAME: A category with the name "${sanitizedName}" already exists in this company.`);
        }
      }

      // Circular reference prevention for parentCategoryId
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
          ...(body.name !== undefined ? { name: sanitizedName } : {}),
          ...(body.description !== undefined ? { description: sanitizedDescription || null } : {}),
          ...(body.parentCategoryId !== undefined ? { parentCategoryId: body.parentCategoryId || null } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
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
          module: 'Sys-Catalog-Core',
          recordId: record.id,
          recordLabel: record.name || record.code || record.id,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            previousName: existing.name,
            newName: record.name,
            parentCategoryId: body.parentCategoryId || null,
            companyId,
          }),
        },
      });

      return record;
    });

    return NextResponse.json(item);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.startsWith('DUPLICATE_NAME')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      if (error.message.startsWith('Circular reference')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    console.error('Error updating category:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update category' },
      { status: 500 }
    );
  }
}

// DELETE /api/categories/[id] — Soft delete with cross-tenant validation & FK check
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Categories', 'DELETE');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId || null;

  try {
    const { id } = await params;

    // Pre-fetch for cross-tenant validation
    const existing = await db.category.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await db.$transaction(async (tx) => {
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

      // Soft delete
      await tx.category.update({
        where: { id },
        data: { isActive: false },
      });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'Sys-Catalog-Core',
          recordId: existing.id,
          recordLabel: existing.name || existing.code || existing.id,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            code: existing.code,
            name: existing.name,
            softDelete: true,
            companyId,
          }),
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Cannot delete')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error deleting category:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete category' },
      { status: 500 }
    );
  }
}
