// ============================================================
// Brands [id] API — Multi-tenant Cross-tenant Validation
// Module Token: Sys-Catalog-Core
// Phase 5: Text sanitizer, case-insensitive unique checks, FK guard
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

/**
 * sanitizeText - Trims whitespace, collapses multiple spaces, strips HTML tags.
 * Returns null if the string is empty after sanitization.
 */
function sanitizeText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  let text = String(value);
  // Strip HTML tags
  text = text.replace(/<[^>]*>/g, '');
  // Collapse double/triple spaces to single space
  text = text.replace(/\s{2,}/g, ' ');
  // Trim whitespace
  text = text.trim();
  return text || null;
}

// GET /api/brands/[id] — Get single brand with cross-tenant validation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Brands', 'GET');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;
    const item = await db.brand.findUnique({
      where: { id },
      include: {
        _count: { select: { products: true } },
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
    console.error('Error fetching brand:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch brand' },
      { status: 500 }
    );
  }
}

// PUT /api/brands/[id] — Update with cross-tenant validation, text sanitizer, case-insensitive unique check
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Brands', 'PUT');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;
    const body = await request.json();

    // Pre-fetch the existing record for cross-tenant validation
    const existing = await db.brand.findUnique({ where: { id } });

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
        { error: 'Brand name cannot be empty after sanitization.' },
        { status: 400 }
      );
    }

    // Case-insensitive unique check scoped by company (exclude self) (SQLite-compatible)
    if (sanitizedName) {
      const existingNames = await db.brand.findMany({
        where: {
          companyId: companyId || null,
          isActive: true,
          id: { not: id },
        },
        select: { id: true, name: true },
      });
      const duplicate = existingNames.find(e => e.name.toLowerCase() === sanitizedName.toLowerCase());

      if (duplicate) {
        return NextResponse.json(
          { error: `A brand with the name "${sanitizedName}" already exists in this company.` },
          { status: 409 }
        );
      }
    }

    const item = await db.$transaction(async (tx) => {
      const record = await tx.brand.update({
        where: { id },
        data: {
          ...(sanitizedName !== null && { name: sanitizedName }),
          description: sanitizedDescription !== undefined ? sanitizedDescription : existing.description,
          isActive: body.isActive ?? existing.isActive,
        },
        include: {
          _count: { select: { products: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'Sys-Catalog-Core',
          recordId: record.id,
          recordLabel: record.name || record.code,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            previousName: existing.name,
            newName: record.name,
            code: record.code,
            companyId,
          }),
        },
      });

      return record;
    });

    return NextResponse.json(item);
  } catch (error) {
    console.error('Error updating brand:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update brand' },
      { status: 500 }
    );
  }
}

// DELETE /api/brands/[id] — Soft delete with cross-tenant validation, FK check for active products
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Brands', 'DELETE');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;

    // Pre-fetch for cross-tenant validation
    const existing = await db.brand.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (!existing.isActive) {
      return NextResponse.json(
        { error: 'Brand is already deleted' },
        { status: 400 }
      );
    }

    await db.$transaction(async (tx) => {
      // FK check: Check if brand is referenced by active products
      const activeProducts = await tx.product.count({
        where: { brandId: id, isActive: true },
      });

      if (activeProducts > 0) {
        throw new Error(
          `Cannot delete: Brand is referenced by ${activeProducts} active product(s)`
        );
      }

      // Soft delete
      await tx.brand.update({
        where: { id },
        data: { isActive: false },
      });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'Sys-Catalog-Core',
          recordId: existing.id,
          recordLabel: existing.name || existing.code,
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

    return NextResponse.json({ success: true, message: 'Brand deleted successfully' });
  } catch (error: unknown) {
    if (error instanceof Error && error.message.startsWith('Cannot delete')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error deleting brand:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete brand' },
      { status: 500 }
    );
  }
}
