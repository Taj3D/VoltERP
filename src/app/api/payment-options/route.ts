// ============================================================
// Payment Options API — Phase 7 Multi-Channel Payment Architecture
// Company-scoped isolation, Deactivated Channel Shield, Activity Logging
// Module Token: Sys-Ops-Channels
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// GET /api/payment-options — List payment options filtered by companyId
// Supports ?activeOnly=true to filter status="ACTIVE" only
// Default: returns ALL (both ACTIVE and INACTIVE)
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'PaymentOptions', 'GET');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;
  const activeOnly = request.nextUrl.searchParams.get('activeOnly') === 'true';

  try {
    const whereClause: Record<string, unknown> = {
      isActive: true,
      ...(companyId ? { companyId } : {}),
    };

    // Deactivated Channel Shield: filter by status when activeOnly requested
    if (activeOnly) {
      whereClause.status = 'ACTIVE';
    }

    const items = await db.paymentOption.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { cardTypeSetups: true } },
      },
    });

    return NextResponse.json(items);
  } catch (error) {
    console.error('Error fetching payment options:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payment options' },
      { status: 500 }
    );
  }
}

// POST /api/payment-options — Create payment option with company-scoped unique name check
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'PaymentOptions', 'POST');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const body = await request.json();

    // Validate required field
    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json(
        { error: 'Payment option name is required' },
        { status: 400 }
      );
    }

    const trimmedName = body.name.trim();

    // Company-scoped unique name check
    const existing = await db.paymentOption.findFirst({
      where: {
        ...(companyId ? { companyId } : {}),
        name: trimmedName,
        isActive: true,
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: `Payment option "${trimmedName}" already exists for this company` },
        { status: 409 }
      );
    }

    const item = await db.$transaction(async (tx) => {
      const record = await tx.paymentOption.create({
        data: {
          name: trimmedName,
          status: 'ACTIVE', // Default to ACTIVE on creation (Deactivated Channel Shield)
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
          status: record.status,
          companyId,
        }),
      });

      return record;
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error('Error creating payment option:', error);
    return NextResponse.json(
      { error: 'Failed to create payment option' },
      { status: 500 }
    );
  }
}
