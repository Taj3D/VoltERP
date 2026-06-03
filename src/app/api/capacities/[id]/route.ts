// ============================================================
// Capacities [id] API — Multi-tenant Cross-tenant Validation
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

// GET /api/capacities/[id] — Get single capacity with cross-tenant validation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Capacities', 'GET');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;
    const item = await db.capacity.findUnique({ where: { id } });

    if (!item) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cross-tenant validation: if user has a companyId and the record has one, they must match
    if (companyId && item.companyId && item.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(item);
  } catch (error) {
    console.error('Error fetching capacity:', error);
    return NextResponse.json(
      { error: 'Failed to fetch capacity' },
      { status: 500 }
    );
  }
}

// PUT /api/capacities/[id] — Update with cross-tenant validation & text sanitization
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Capacities', 'PUT');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;
    const body = await request.json();

    // Pre-fetch the existing record for cross-tenant validation
    const existing = await db.capacity.findUnique({ where: { id } });

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
    const sanitizedCapacityUnit = typeof body.capacityUnit === 'string' ? sanitizeText(body.capacityUnit) : existing.capacityUnit;

    // Reject empty name after sanitization
    if (!sanitizedName) {
      return NextResponse.json(
        { error: 'Capacity name is required' },
        { status: 400 }
      );
    }

    // CRITICAL: If capacityValue is being updated, validate it must be > 0
    let capacityValue = existing.capacityValue;
    if (body.capacityValue !== undefined && body.capacityValue !== null) {
      capacityValue = Number(body.capacityValue);
      if (isNaN(capacityValue) || capacityValue <= 0) {
        return NextResponse.json(
          { error: 'Capacity value must be a positive number greater than zero' },
          { status: 400 }
        );
      }
    }

    // Duplicate name check within company scope (only if name is changing)
    if (sanitizedName !== existing.name && companyId) {
      const duplicate = await db.capacity.findFirst({
        where: { companyId, name: sanitizedName, isActive: true, id: { not: id } },
      });
      if (duplicate) {
        return NextResponse.json(
          { error: 'DUPLICATE_NAME: A capacity with this name already exists in your company' },
          { status: 409 }
        );
      }
    }

    const item = await db.$transaction(async (tx) => {
      const record = await tx.capacity.update({
        where: { id },
        data: {
          name: sanitizedName,
          description: sanitizedDescription || null,
          capacityValue,
          capacityUnit: sanitizedCapacityUnit || null,
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
          capacityValue: record.capacityValue,
          capacityUnit: record.capacityUnit,
          companyId,
        }),
      });

      return record;
    });

    return NextResponse.json(item);
  } catch (error) {
    console.error('Error updating capacity:', error);
    return NextResponse.json(
      { error: 'Failed to update capacity' },
      { status: 500 }
    );
  }
}

// DELETE /api/capacities/[id] — Soft delete (safe, no FK references) & cross-tenant validation
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Capacities', 'DELETE');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;

    // Pre-fetch for cross-tenant validation
    const existing = await db.capacity.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (!existing.isActive) {
      return NextResponse.json(
        { error: 'Capacity is already deleted' },
        { status: 400 }
      );
    }

    // Capacity has no FK references, safe to soft-delete
    await db.$transaction(async (tx) => {
      await tx.capacity.update({
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
          capacityValue: existing.capacityValue,
          capacityUnit: existing.capacityUnit,
          softDelete: true,
          companyId,
        }),
      });
    });

    return NextResponse.json({ success: true, message: 'Capacity deleted successfully' });
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error deleting capacity:', error.message);
    } else {
      console.error('Error deleting capacity:', error);
    }
    return NextResponse.json(
      { error: 'Failed to delete capacity' },
      { status: 500 }
    );
  }
}
