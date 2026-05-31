// ============================================================
// GODOWNS API ROUTE — Enhanced with SUSPENDED status,
// multi-tenant companyId isolation, XSS sanitization,
// and Inv-Stock-Core audit token
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  maskForVatAuditor,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// XSS sanitization helper
function sanitizeString(input: string): string {
  return input.replace(/<[^>]*>/g, '').trim();
}

/**
 * GET /api/godowns
 * List all active godowns with multi-tenant isolation.
 * Includes product and productStock counts.
 */
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Godowns', 'GET');
  if (!security.authorized) return security.response;

  try {
    const companyId = security.user.companyId;

    const items = await db.godown.findMany({
      where: {
        isActive: true,
        ...(companyId ? { companyId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            products: true,
            productStocks: true,
          },
        },
      },
    });

    // Apply VAT Auditor masking (no financial fields on godowns, but apply for consistency)
    const role = security.user.role;
    const maskedItems = items.map((item) =>
      maskForVatAuditor(item as unknown as Record<string, unknown>, role, [])
    );

    // Log export activity
    await logUserActivity({
      action: 'EXPORT',
      module: 'Inv-Stock-Core',
      userId: security.user.id,
      userName: security.user.name,
      details: `Godowns list exported: count=${items.length}`,
    });

    return NextResponse.json(maskedItems);
  } catch (error) {
    console.error('[Godowns] Error fetching godowns:', error);
    return NextResponse.json(
      { error: 'Failed to fetch godowns' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/godowns
 * Create a new godown with XSS sanitization and multi-tenant companyId.
 * Default status is ACTIVE.
 */
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Godowns', 'POST');
  if (!security.authorized) return security.response;

  try {
    const body = await request.json();
    const companyId = security.user.companyId;

    // XSS sanitization on text fields
    const sanitizedName = sanitizeString(body.name || '');
    const sanitizedAddress = body.address ? sanitizeString(body.address) : null;
    const sanitizedInCharge = body.inCharge ? sanitizeString(body.inCharge) : null;

    if (!sanitizedName) {
      return NextResponse.json(
        { error: 'Godown name is required' },
        { status: 400 }
      );
    }

    // Check for duplicate name within same company
    const existing = await db.godown.findFirst({
      where: {
        name: sanitizedName,
        isActive: true,
        ...(companyId ? { companyId } : {}),
      },
    });
    if (existing) {
      return NextResponse.json(
        { error: `A godown with name "${sanitizedName}" already exists` },
        { status: 409 }
      );
    }

    const item = await db.$transaction(async (tx) => {
      const record = await tx.godown.create({
        data: {
          name: sanitizedName,
          address: sanitizedAddress,
          inCharge: sanitizedInCharge,
          status: 'ACTIVE', // Default status
          ...(companyId && { companyId }),
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'Inv-Stock-Core',
          recordId: record.id,
          recordLabel: record.name || record.id,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            name: record.name,
            address: record.address,
            status: record.status,
          }),
        },
      });

      return record;
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error('[Godowns] Error creating godown:', error);
    return NextResponse.json(
      { error: 'Failed to create godown' },
      { status: 500 }
    );
  }
}
