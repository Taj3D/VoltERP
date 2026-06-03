// ============================================================
// Card Types API — Phase 7 Multi-Channel Payment Architecture
// Company-scoped isolation, Activity Logging
// Module Token: Sys-Ops-Channels
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

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

    const item = await db.$transaction(async (tx) => {
      const record = await tx.cardType.create({
        data: {
          name: body.name.trim(),
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
