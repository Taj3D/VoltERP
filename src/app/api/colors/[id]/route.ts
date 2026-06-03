// ============================================================
// Colors [id] API — Multi-tenant Cross-tenant Validation
// Module Token: Sys-Catalog-Core
// Phase 5: Boundary shields, case-insensitive unique checks
//          (name + colorCode), text sanitizer, FK check
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

// GET /api/colors/[id] — Get single color with cross-tenant validation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Colors', 'GET');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;
    const item = await db.color.findUnique({
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
    console.error('Error fetching color:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch color' },
      { status: 500 }
    );
  }
}

// PUT /api/colors/[id] — Update with cross-tenant validation, text sanitizer & unique check
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Colors', 'PUT');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId || null;

  try {
    const { id } = await params;
    const body = await request.json();

    // Pre-fetch the existing record for cross-tenant validation
    const existing = await db.color.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Sanitize text fields
    const sanitizedName = sanitizeText(body.name);
    const sanitizedColorCode = sanitizeText(body.colorCode);

    if (body.name !== undefined && !sanitizedName) {
      return NextResponse.json(
        { error: 'Color name cannot be empty after sanitization.' },
        { status: 400 }
      );
    }

    if (body.colorCode !== undefined && !sanitizedColorCode) {
      return NextResponse.json(
        { error: 'Color code cannot be empty after sanitization.' },
        { status: 400 }
      );
    }

    const item = await db.$transaction(async (tx) => {
      // Case-insensitive unique check for name & colorCode scoped by company (exclude self) (SQLite-compatible)
      const existingColors = await tx.color.findMany({
        where: {
          companyId: companyId || null,
          isActive: true,
          id: { not: id },
        },
        select: { id: true, name: true, colorCode: true },
      });
      if (body.name !== undefined) {
        const duplicateName = existingColors.find(e => e.name.toLowerCase() === sanitizedName.toLowerCase());

        if (duplicateName) {
          throw new Error(`DUPLICATE_NAME: A color with the name "${sanitizedName}" already exists in this company.`);
        }
      }

      if (body.colorCode !== undefined) {
        const duplicateCode = existingColors.find(e => e.colorCode.toLowerCase() === sanitizedColorCode.toLowerCase());

        if (duplicateCode) {
          throw new Error(`DUPLICATE_CODE: A color with the color code "${sanitizedColorCode}" already exists in this company.`);
        }
      }

      const record = await tx.color.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: sanitizedName } : {}),
          ...(body.colorCode !== undefined ? { colorCode: sanitizedColorCode } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
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
          recordLabel: record.name || record.id,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            previousName: existing.name,
            newName: record.name,
            previousColorCode: existing.colorCode,
            newColorCode: record.colorCode,
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
      if (error.message.startsWith('DUPLICATE_CODE')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    console.error('Error updating color:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update color' },
      { status: 500 }
    );
  }
}

// DELETE /api/colors/[id] — Soft delete with cross-tenant validation & FK check
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Colors', 'DELETE');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId || null;

  try {
    const { id } = await params;

    // Pre-fetch for cross-tenant validation
    const existing = await db.color.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await db.$transaction(async (tx) => {
      // FK check: Check if color is referenced by active products
      const activeProducts = await tx.product.count({ where: { colorId: id, isActive: true } });

      if (activeProducts > 0) {
        throw new Error(`Cannot delete: Color is referenced by ${activeProducts} active product(s)`);
      }

      // Soft delete
      await tx.color.update({
        where: { id },
        data: { isActive: false },
      });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'Sys-Catalog-Core',
          recordId: existing.id,
          recordLabel: existing.name || existing.id,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            name: existing.name,
            colorCode: existing.colorCode,
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
    console.error('Error deleting color:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete color' },
      { status: 500 }
    );
  }
}
