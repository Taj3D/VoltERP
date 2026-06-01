// ============================================================
// Fiscal Years [id] API — Multi-tenant Cross-tenant Validation
// Module Token: Fin-Statements-Core
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, checkFinancialDeletePermission } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// GET /api/fiscal-years/[id] — Get single fiscal year with cross-tenant validation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'FiscalYears', 'GET');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;
    const item = await db.fiscalYear.findUnique({ where: { id } });

    if (!item) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cross-tenant validation: if user has a companyId and the record has one, they must match
    if (companyId && item.companyId && item.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(item);
  } catch (error) {
    console.error('Error fetching fiscal year:', error);
    return NextResponse.json(
      { error: 'Failed to fetch fiscal year' },
      { status: 500 }
    );
  }
}

// PUT /api/fiscal-years/[id] — Update fiscal year (name, notes only)
// Cannot modify startDate, endDate, or status via PUT — status changes only through year-end close
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'FiscalYears', 'PUT');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;
    const body = await request.json();

    // Pre-fetch the existing record for cross-tenant validation
    const existing = await db.fiscalYear.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Guard: Cannot modify startDate, endDate, or status via PUT
    if (body.startDate !== undefined || body.endDate !== undefined) {
      return NextResponse.json(
        { error: 'Cannot modify start date or end date. Date range changes require creating a new fiscal year.' },
        { status: 400 }
      );
    }

    if (body.status !== undefined) {
      return NextResponse.json(
        { error: 'Cannot modify status via PUT. Status changes are only allowed through the year-end close process.' },
        { status: 400 }
      );
    }

    // Only allow updating name and notes
    const updateData: Record<string, unknown> = {};

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim()) {
        return NextResponse.json(
          { error: 'Fiscal year name cannot be empty.' },
          { status: 400 }
        );
      }
      updateData.name = body.name.trim();
    }

    if (body.notes !== undefined) {
      updateData.notes = body.notes || null;
    }

    const item = await db.$transaction(async (tx) => {
      const record = await tx.fiscalYear.update({
        where: { id },
        data: updateData,
      });

      // Activity log
      await logUserActivity({
        action: 'UPDATE',
        module: 'Fin-Statements-Core',
        recordId: record.id,
        recordLabel: record.name,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          previousName: existing.name,
          newName: record.name,
          previousNotes: existing.notes,
          newNotes: record.notes,
          companyId,
        }),
      });

      return record;
    });

    return NextResponse.json(item);
  } catch (error) {
    console.error('Error updating fiscal year:', error);
    return NextResponse.json(
      { error: 'Failed to update fiscal year' },
      { status: 500 }
    );
  }
}

// DELETE /api/fiscal-years/[id] — Soft delete (admin only, OPEN status only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'FiscalYears', 'DELETE');
  if (!security.authorized) return security.response;

  // Only admin can delete fiscal years
  const deleteCheck = checkFinancialDeletePermission(security.user.role);
  if (deleteCheck) return deleteCheck;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;

    // Pre-fetch for cross-tenant validation and status check
    const existing = await db.fiscalYear.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (!existing.isActive) {
      return NextResponse.json(
        { error: 'Fiscal year is already deleted.' },
        { status: 400 }
      );
    }

    // Cannot delete CLOSED fiscal years
    if (existing.status === 'CLOSED') {
      return NextResponse.json(
        { error: 'Cannot delete a closed fiscal year. Closed fiscal years are permanently locked for audit integrity.' },
        { status: 403 }
      );
    }

    await db.$transaction(async (tx) => {
      // Soft delete
      await tx.fiscalYear.update({
        where: { id },
        data: { isActive: false },
      });

      // Activity log
      await logUserActivity({
        action: 'DELETE',
        module: 'Fin-Statements-Core',
        recordId: existing.id,
        recordLabel: existing.name,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          code: existing.code,
          name: existing.name,
          startDate: existing.startDate,
          endDate: existing.endDate,
          status: existing.status,
          softDelete: true,
          companyId,
        }),
      });
    });

    return NextResponse.json({ success: true, message: 'Fiscal year deleted successfully' });
  } catch (error) {
    console.error('Error deleting fiscal year:', error);
    return NextResponse.json(
      { error: 'Failed to delete fiscal year' },
      { status: 500 }
    );
  }
}
