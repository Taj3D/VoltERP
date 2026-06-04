// ============================================================
// Interest Percentages [id] API — Multi-tenant CompanyId Isolation
// Module Token: Sys-Interest-Amortization
// Cross-tenant validation, percentage/type/range validation, soft delete
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

const VALID_TYPES = ['HIRE_PURCHASE', 'TERM_LOAN', 'OVERDRAFT', 'CUSTOM'] as const;

function sanitizeText(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')           // Strip HTML/XSS tags
    .replace(/javascript:/gi, '')       // Strip javascript: URIs
    .replace(/on\w+=/gi, '')           // Strip event handler attributes (onclick=, etc.)
    .replace(/\r\n/g, '\n')            // Normalize line breaks
    .replace(/\n{3,}/g, '\n\n')        // Collapse excessive newlines
    .replace(/  +/g, ' ')              // Collapse double spaces
    .trim();
}

// GET /api/interest-percentages/[id] — Fetch single interest rate with cross-tenant validation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'InterestPercentages', 'GET');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;
    const item = await db.interestPercentage.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true } },
      },
    });

    if (!item) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cross-tenant validation
    if (companyId && item.companyId && item.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(item);
  } catch (error) {
    console.error('Error fetching interest percentage:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: 'Failed to fetch interest percentage' },
      { status: 500 }
    );
  }
}

// PUT /api/interest-percentages/[id] — Update with cross-tenant validation and range checks
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'InterestPercentages', 'PUT');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;
    const body = await request.json();

    // Pre-fetch for cross-tenant validation
    const existing = await db.interestPercentage.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Validate percentage range if being updated
    if (body.percentage !== undefined && (body.percentage < 0 || body.percentage > 100)) {
      return NextResponse.json(
        { error: 'Percentage must be between 0 and 100' },
        { status: 400 }
      );
    }

    // Validate type if being updated
    if (body.type !== undefined && !VALID_TYPES.includes(body.type as (typeof VALID_TYPES)[number])) {
      return NextResponse.json(
        { error: `Type must be one of: ${VALID_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate effectiveDate if being updated
    if (body.effectiveDate !== undefined) {
      const testDate = new Date(body.effectiveDate);
      if (isNaN(testDate.getTime())) {
        return NextResponse.json(
          { error: 'effectiveDate must be a valid date' },
          { status: 400 }
        );
      }
    }

    // Validate expiryDate > effectiveDate if either is being updated
    const effectiveDateToCheck = body.effectiveDate ? new Date(body.effectiveDate) : existing.effectiveDate;
    const expiryDateToCheck = body.expiryDate !== undefined
      ? (body.expiryDate ? new Date(body.expiryDate) : null)
      : existing.expiryDate;
    if (expiryDateToCheck && effectiveDateToCheck && new Date(expiryDateToCheck) <= new Date(effectiveDateToCheck)) {
      return NextResponse.json(
        { error: 'expiryDate must be after effectiveDate' },
        { status: 400 }
      );
    }

    // Amount range validation
    const minAmount = body.minimumAmount !== undefined ? body.minimumAmount : existing.minimumAmount;
    const maxAmount = body.maximumAmount !== undefined ? body.maximumAmount : existing.maximumAmount;
    if (minAmount > 0 && maxAmount > 0 && minAmount > maxAmount) {
      return NextResponse.json(
        { error: 'minimumAmount must be less than or equal to maximumAmount' },
        { status: 400 }
      );
    }

    // Duration range validation
    const durMin = body.durationMonthsMin !== undefined ? body.durationMonthsMin : existing.durationMonthsMin;
    const durMax = body.durationMonthsMax !== undefined ? body.durationMonthsMax : existing.durationMonthsMax;
    if (durMin > 0 && durMax > 0 && durMin > durMax) {
      return NextResponse.json(
        { error: 'durationMonthsMin must be less than or equal to durationMonthsMax' },
        { status: 400 }
      );
    }

    // Sanitize text inputs
    const sanitizedDescription = body.description !== undefined
      ? (body.description ? sanitizeText(body.description) : null)
      : undefined;

    const item = await db.$transaction(async (tx) => {
      const record = await tx.interestPercentage.update({
        where: { id },
        data: {
          ...(body.percentage !== undefined && { percentage: body.percentage }),
          ...(body.type !== undefined && { type: body.type }),
          ...(body.effectiveDate !== undefined && { effectiveDate: new Date(body.effectiveDate) }),
          ...(body.expiryDate !== undefined && { expiryDate: body.expiryDate ? new Date(body.expiryDate) : null }),
          ...(body.minimumAmount !== undefined && { minimumAmount: body.minimumAmount }),
          ...(body.maximumAmount !== undefined && { maximumAmount: body.maximumAmount }),
          ...(body.durationMonthsMin !== undefined && { durationMonthsMin: body.durationMonthsMin }),
          ...(body.durationMonthsMax !== undefined && { durationMonthsMax: body.durationMonthsMax }),
          ...(sanitizedDescription !== undefined && { description: sanitizedDescription }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
        },
      });

      await logUserActivity({
          tx: tx,
        action: 'UPDATE',
        module: 'Sys-Interest-Amortization',
        recordId: record.id,
        recordLabel: record.code || record.id,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          code: record.code,
          percentage: record.percentage,
          type: record.type,
          effectiveDate: record.effectiveDate,
          expiryDate: record.expiryDate,
          minimumAmount: record.minimumAmount,
          maximumAmount: record.maximumAmount,
          durationMonthsMin: record.durationMonthsMin,
          durationMonthsMax: record.durationMonthsMax,
          previousPercentage: existing.percentage,
          previousType: existing.type,
          companyId,
          updatedFields: Object.keys(body),
        }),
      });

      return record;
    });

    return NextResponse.json(item);
  } catch (error) {
    console.error('Error updating interest percentage:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: 'Failed to update interest percentage' },
      { status: 500 }
    );
  }
}

// DELETE /api/interest-percentages/[id] — Soft-delete with cross-tenant validation
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'InterestPercentages', 'DELETE');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;

    await db.$transaction(async (tx) => {
      const record = await tx.interestPercentage.findUnique({ where: { id } });
      if (!record) throw new Error('Not found');

      // Cross-tenant validation
      if (companyId && record.companyId && record.companyId !== companyId) {
        throw new Error('Not found');
      }

      // No FK references from HireSales yet — safe to soft-delete

      await tx.interestPercentage.update({
        where: { id },
        data: { isActive: false },
      });

      await logUserActivity({
          tx: tx,
        action: 'DELETE',
        module: 'Sys-Interest-Amortization',
        recordId: record.id,
        recordLabel: record.code || record.id,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          code: record.code,
          percentage: record.percentage,
          type: record.type,
          effectiveDate: record.effectiveDate,
          softDelete: true,
          companyId,
        }),
      });

      return record;
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Not found') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
    }
    console.error('Error deleting interest percentage:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: 'Failed to delete interest percentage' },
      { status: 500 }
    );
  }
}
