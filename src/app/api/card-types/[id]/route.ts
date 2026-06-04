// ============================================================
// Card Types [id] API — Phase 7 Multi-Channel Payment Architecture
// Cross-tenant validation, FK check + soft delete, Activity Logging
// Module Token: Sys-Ops-Channels
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '').replace(/javascript:/gi, '').replace(/on\w+=/gi, '').trim();
}

// GET /api/card-types/[id] — Get single card type with cross-tenant validation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'CardTypes', 'GET');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;
    const item = await db.cardType.findUnique({ where: { id } });

    if (!item) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cross-tenant validation: if user has a companyId and the record has one, they must match
    if (companyId && item.companyId && item.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(item);
  } catch (error) {
    console.error('Error fetching card type:', error);
    return NextResponse.json(
      { error: 'Failed to fetch card type' },
      { status: 500 }
    );
  }
}

// PUT /api/card-types/[id] — Update with cross-tenant validation
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'CardTypes', 'PUT');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;
    const body = await request.json();

    // Pre-fetch the existing record for cross-tenant validation
    const existing = await db.cardType.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // If changing name, check company-scoped case-insensitive unique constraint
    if (body.name && typeof body.name === 'string' && body.name.trim() !== existing.name) {
      const trimmedName = stripHtml(body.name.trim());
      const allActive = await db.cardType.findMany({
        where: {
          ...(companyId ? { companyId } : {}),
          isActive: true,
          id: { not: id },
        },
        select: { id: true, name: true },
      });
      const duplicate = allActive.find(
        (ct) => ct.name.toLowerCase() === trimmedName.toLowerCase()
      );
      if (duplicate) {
        return NextResponse.json(
          { error: `Card type "${trimmedName}" already exists` },
          { status: 409 }
        );
      }
    }

    const item = await db.$transaction(async (tx) => {
      const record = await tx.cardType.update({
        where: { id },
        data: {
          ...(body.name && { name: stripHtml(body.name.trim()) }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
          // Enforce companyId — prevent cross-tenant reassignment
          ...(companyId && { companyId }),
        },
      });

      // Activity logging with module token Sys-Ops-Channels
      await logUserActivity({
          tx: tx,
        action: 'UPDATE',
        module: 'Sys-Ops-Channels',
        recordId: record.id,
        recordLabel: record.name,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          previousName: existing.name,
          newName: record.name,
          companyId,
        }),
      });

      return record;
    });

    return NextResponse.json(item);
  } catch (error) {
    console.error('Error updating card type:', error);
    return NextResponse.json(
      { error: 'Failed to update card type' },
      { status: 500 }
    );
  }
}

// DELETE /api/card-types/[id] — Soft delete with FK check, cross-tenant validation
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'CardTypes', 'DELETE');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;

    // Pre-fetch for cross-tenant validation
    const existing = await db.cardType.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (!existing.isActive) {
      return NextResponse.json(
        { error: 'Card type is already deleted' },
        { status: 400 }
      );
    }

    await db.$transaction(async (tx) => {
      // FK check: Check if card type is referenced by active card type setups
      const activeCardTypeSetups = await tx.cardTypeSetup.count({
        where: { cardTypeId: id, isActive: true },
      });

      if (activeCardTypeSetups > 0) {
        throw new Error(
          `Cannot delete: Card Type is referenced by ${activeCardTypeSetups} active card type setup(s)`
        );
      }

      // Soft delete
      await tx.cardType.update({
        where: { id },
        data: { isActive: false },
      });

      // Activity logging with module token Sys-Ops-Channels
      await logUserActivity({
          tx: tx,
        action: 'DELETE',
        module: 'Sys-Ops-Channels',
        recordId: existing.id,
        recordLabel: existing.name,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          name: existing.name,
          softDelete: true,
          companyId,
        }),
      });
    });

    return NextResponse.json({
      success: true,
      message: 'Card type deleted successfully',
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message.startsWith('Cannot delete')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error deleting card type:', error);
    return NextResponse.json(
      { error: 'Failed to delete card type' },
      { status: 500 }
    );
  }
}
