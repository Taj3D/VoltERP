// ============================================================
// Card Types API — Phase 7 Multi-Channel Payment Architecture
// Company-scoped isolation, Activity Logging
// Module Token: Sys-Ops-Channels
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '').replace(/javascript:/gi, '').replace(/on\w+=/gi, '').trim();
}

// GET /api/card-types — List card types filtered by companyId, include cardTypeSetups count
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'CardTypes', 'GET');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const items = await db.cardType.findMany({
      where: companyId ? { companyId, isActive: true } : { isActive: true },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { cardTypeSetups: true } },
      },
    });

    return NextResponse.json(items);
  } catch (error) {
    console.error('Error fetching card types:', error);
    return NextResponse.json(
      { error: 'Failed to fetch card types' },
      { status: 500 }
    );
  }
}

// POST /api/card-types — Create card type with companyId from security.user.companyId
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'CardTypes', 'POST');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const body = await request.json();

    // Validate required field
    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json(
        { error: 'Card type name is required' },
        { status: 400 }
      );
    }

    const trimmedName = stripHtml(body.name.trim());

    // Company-scoped case-insensitive duplicate name check (SQLite-compatible)
    const existing = await db.cardType.findFirst({
      where: {
        ...(companyId ? { companyId } : {}),
        isActive: true,
      },
    });
    const allActive = await db.cardType.findMany({
      where: {
        ...(companyId ? { companyId } : {}),
        isActive: true,
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

    const item = await db.$transaction(async (tx) => {
      const record = await tx.cardType.create({
        data: {
          name: trimmedName,
          isActive: body.isActive ?? true,
          ...(companyId && { companyId }),
        },
      });

      // Activity logging with module token Sys-Ops-Channels
      await logUserActivity({
          tx: tx,
        action: 'CREATE',
        module: 'Sys-Ops-Channels',
        recordId: record.id,
        recordLabel: record.name,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          name: record.name,
          companyId,
        }),
      });

      return record;
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error('Error creating card type:', error);
    return NextResponse.json(
      { error: 'Failed to create card type' },
      { status: 500 }
    );
  }
}
