// ============================================================
// Units [id] API — Multi-tenant Cross-tenant Validation
// Module Token: Sys-Catalog-Core
// Phase 5: Text sanitizer, case-insensitive unique checks (name + code), soft delete
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

// GET /api/units/[id] — Get single unit with cross-tenant validation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Units', 'GET');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;
    const item = await db.unit.findUnique({ where: { id } });

    if (!item) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cross-tenant validation: if user has a companyId and the record has one, they must match
    if (companyId && item.companyId && item.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(item);
  } catch (error) {
    console.error('Error fetching unit:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch unit' },
      { status: 500 }
    );
  }
}

// PUT /api/units/[id] — Update with cross-tenant validation, text sanitizer, case-insensitive unique check
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Units', 'PUT');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;
    const body = await request.json();

    // Pre-fetch the existing record for cross-tenant validation
    const existing = await db.unit.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Sanitize text fields
    const sanitizedName = sanitizeText(body.name);
    const sanitizedSymbol = sanitizeText(body.symbol);
    const sanitizedDescription = sanitizeText(body.description);

    if (body.name !== undefined && !sanitizedName) {
      return NextResponse.json(
        { error: 'Unit name cannot be empty after sanitization.' },
        { status: 400 }
      );
    }

    // Case-insensitive unique check for name & code scoped by company (exclude self) (SQLite-compatible)
    const existingUnits = await db.unit.findMany({
      where: {
        companyId: companyId || null,
        isActive: true,
        id: { not: id },
      },
      select: { id: true, name: true, code: true },
    });
    if (sanitizedName) {
      const duplicateName = existingUnits.find(e => e.name.toLowerCase() === sanitizedName.toLowerCase());

      if (duplicateName) {
        return NextResponse.json(
          { error: `A unit with the name "${sanitizedName}" already exists in this company.` },
          { status: 409 }
        );
      }
    }

    if (body.code) {
      const sanitizedCode = sanitizeText(body.code);
      if (sanitizedCode) {
        const duplicateCode = existingUnits.find(e => e.code && e.code.toLowerCase() === sanitizedCode.toLowerCase());

        if (duplicateCode) {
          return NextResponse.json(
            { error: `A unit with the code "${sanitizedCode}" already exists in this company.` },
            { status: 409 }
          );
        }
      }
    }

    const item = await db.$transaction(async (tx) => {
      const record = await tx.unit.update({
        where: { id },
        data: {
          ...(sanitizedName !== null && { name: sanitizedName }),
          symbol: sanitizedSymbol !== undefined ? sanitizedSymbol : existing.symbol,
          description: sanitizedDescription !== undefined ? sanitizedDescription : existing.description,
          isActive: body.isActive ?? existing.isActive,
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
            symbol: record.symbol,
            companyId,
          }),
        },
      });

      return record;
    });

    return NextResponse.json(item);
  } catch (error) {
    console.error('Error updating unit:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update unit' },
      { status: 500 }
    );
  }
}

// DELETE /api/units/[id] — Soft delete with cross-tenant validation
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Units', 'DELETE');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;

    // Pre-fetch for cross-tenant validation
    const existing = await db.unit.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (!existing.isActive) {
      return NextResponse.json(
        { error: 'Unit is already deleted' },
        { status: 400 }
      );
    }

    await db.$transaction(async (tx) => {
      // Soft delete
      await tx.unit.update({
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

    return NextResponse.json({ success: true, message: 'Unit deleted successfully' });
  } catch (error) {
    console.error('Error deleting unit:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete unit' },
      { status: 500 }
    );
  }
}
