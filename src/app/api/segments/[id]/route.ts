// ============================================================
// Segments [id] API — Multi-tenant Cross-tenant Validation
// Module Token: Sys-Structure-Matrix
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// ── Text sanitizer: strip HTML/XSS tags, normalize whitespace ──
function sanitizeText(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')           // Strip HTML/XSS tags
    .replace(/\r\n/g, '\n')            // Normalize line breaks
    .replace(/\n{3,}/g, '\n\n')        // Collapse excessive newlines
    .replace(/  +/g, ' ')              // Collapse double spaces
    .trim();
}

// GET /api/segments/[id] — Get single segment with cross-tenant validation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Segments', 'GET');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;
    const item = await db.segment.findUnique({
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
    console.error('Error fetching segment:', error);
    return NextResponse.json(
      { error: 'Failed to fetch segment' },
      { status: 500 }
    );
  }
}

// PUT /api/segments/[id] — Update with cross-tenant validation & text sanitization
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Segments', 'PUT');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;
    const body = await request.json();

    // Pre-fetch the existing record for cross-tenant validation
    const existing = await db.segment.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Sanitize text inputs
    const sanitizedName = typeof body.name === 'string' ? sanitizeText(body.name) : existing.name;
    const sanitizedDescription = typeof body.description === 'string' ? sanitizeText(body.description) : existing.description;

    // Reject empty name after sanitization
    if (!sanitizedName) {
      return NextResponse.json(
        { error: 'Segment name is required' },
        { status: 400 }
      );
    }

    // Duplicate name check within company scope (only if name is changing)
    if (sanitizedName !== existing.name && companyId) {
      const duplicate = await db.segment.findFirst({
        where: { companyId, name: sanitizedName, isActive: true, id: { not: id } },
      });
      if (duplicate) {
        return NextResponse.json(
          { error: 'DUPLICATE_NAME: A segment with this name already exists in your company' },
          { status: 409 }
        );
      }
    }

    const item = await db.$transaction(async (tx) => {
      const record = await tx.segment.update({
        where: { id },
        data: {
          name: sanitizedName,
          description: sanitizedDescription || null,
          isActive: body.isActive ?? existing.isActive,
          // Enforce companyId — prevent cross-tenant reassignment
          ...(companyId && { companyId }),
        },
      });

      await logUserActivity({
          tx: tx,
        action: 'UPDATE',
        module: 'Sys-Structure-Matrix',
        recordId: record.id,
        recordLabel: record.name || record.id,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          previousName: existing.name,
          newName: record.name,
          code: record.code,
          companyId,
        }),
      });

      return record;
    });

    return NextResponse.json(item);
  } catch (error) {
    console.error('Error updating segment:', error);
    return NextResponse.json(
      { error: 'Failed to update segment' },
      { status: 500 }
    );
  }
}

// DELETE /api/segments/[id] — Soft delete with FK check & cross-tenant validation
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Segments', 'DELETE');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;

    // Pre-fetch for cross-tenant validation
    const existing = await db.segment.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (!existing.isActive) {
      return NextResponse.json(
        { error: 'Segment is already deleted' },
        { status: 400 }
      );
    }

    await db.$transaction(async (tx) => {
      // FK check: Check if segment is referenced by active products
      const activeProducts = await tx.product.count({
        where: { segmentId: id, isActive: true },
      });
      if (activeProducts > 0) {
        throw new Error(
          `Cannot delete: Segment is referenced by ${activeProducts} active product(s)`
        );
      }

      // Soft delete
      await tx.segment.update({
        where: { id },
        data: { isActive: false },
      });

      await logUserActivity({
          tx: tx,
        action: 'DELETE',
        module: 'Sys-Structure-Matrix',
        recordId: existing.id,
        recordLabel: existing.name || existing.id,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          name: existing.name,
          code: existing.code,
          softDelete: true,
          companyId,
        }),
      });
    });

    return NextResponse.json({ success: true, message: 'Segment deleted successfully' });
  } catch (error: unknown) {
    if (error instanceof Error && error.message.startsWith('Cannot delete')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error deleting segment:', error);
    return NextResponse.json(
      { error: 'Failed to delete segment' },
      { status: 500 }
    );
  }
}
