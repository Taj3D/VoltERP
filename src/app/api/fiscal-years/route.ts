// ============================================================
// Fiscal Years API — Multi-tenant CompanyId Isolation
// Module Token: Fin-Statements-Core
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';
import { generateNextCode } from '@/lib/accounting-utils';

// GET /api/fiscal-years — List all fiscal years filtered by companyId
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'FiscalYears', 'GET');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const items = await db.fiscalYear.findMany({
      where: companyId ? { companyId, isActive: true } : { isActive: true },
      orderBy: { startDate: 'desc' },
    });

    return NextResponse.json(items);
  } catch (error) {
    console.error('Error fetching fiscal years:', error);
    return NextResponse.json(
      { error: 'Failed to fetch fiscal years' },
      { status: 500 }
    );
  }
}

// POST /api/fiscal-years — Create a new fiscal year
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'FiscalYears', 'POST');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const body = await request.json();

    // ── Required field validation ──
    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json(
        { error: 'Fiscal year name is required.' },
        { status: 400 }
      );
    }

    if (!body.startDate) {
      return NextResponse.json(
        { error: 'Start date is required.' },
        { status: 400 }
      );
    }

    if (!body.endDate) {
      return NextResponse.json(
        { error: 'End date is required.' },
        { status: 400 }
      );
    }

    const startDate = new Date(body.startDate);
    const endDate = new Date(body.endDate);

    // Validate startDate < endDate
    if (startDate >= endDate) {
      return NextResponse.json(
        { error: 'Start date must be before end date.' },
        { status: 400 }
      );
    }

    // ── Overlapping fiscal year check ──
    // A new fiscal year [startDate, endDate] overlaps with an existing one if:
    //   existing.startDate <= new.endDate AND existing.endDate >= new.startDate
    const overlappingFilter: Record<string, unknown> = {
      isActive: true,
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    };
    if (companyId) overlappingFilter.companyId = companyId;

    const overlapping = await db.fiscalYear.findFirst({
      where: overlappingFilter,
    });

    if (overlapping) {
      return NextResponse.json(
        {
          error: `Overlapping fiscal year detected. The date range conflicts with "${overlapping.name}" (${new Date(overlapping.startDate).toISOString().slice(0, 10)} to ${new Date(overlapping.endDate).toISOString().slice(0, 10)}).`,
        },
        { status: 409 }
      );
    }

    // ── Generate sequential code ──
    const code = await generateNextCode('fiscalYear', 'FY-');

    // ── Create fiscal year ──
    const result = await db.$transaction(async (tx) => {
      const record = await tx.fiscalYear.create({
        data: {
          code,
          name: body.name.trim(),
          startDate,
          endDate,
          status: 'OPEN',
          notes: body.notes || null,
          ...(companyId && { companyId }),
        },
      });

      return record;
    });

    // Fire-and-forget activity log (outside transaction to avoid SQLite timeout)
    logUserActivity({
      action: 'CREATE',
      module: 'Fin-Statements-Core',
      recordId: result.id,
      recordLabel: result.name,
      userId: security.user.id,
      userName: security.user.name,
      details: JSON.stringify({
        code: result.code,
        name: result.name,
        startDate: result.startDate,
        endDate: result.endDate,
        status: result.status,
        companyId,
      }),
    }).catch(() => {});

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating fiscal year:', error);
    return NextResponse.json(
      { error: 'Failed to create fiscal year' },
      { status: 500 }
    );
  }
}
