// ============================================================
// SMS BILLS [id] API ROUTE — Stage 11 Rebuild
// Multi-tenant companyId isolation, RBAC (manager: create/update,
// admin-only delete), VAT Auditor masking, Activity logging with
// SMS-Billing-Settle token, safe financial arithmetic
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  maskForVatAuditorSms,
  checkFinancialDeletePermission,
  safeFinancialRound,
  safeFinancialSubtract,
  formatFinancialField,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// GET /api/sms-bills/[id] — Get single SMS bill with payments
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'SmsBills', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const companyId = security.user.companyId;

    const smsBill = await db.smsBill.findUnique({
      where: { id },
      include: {
        payments: true,
      },
    });

    if (!smsBill) {
      return NextResponse.json(
        { error: 'SMS bill not found' },
        { status: 404 }
      );
    }

    // Cross-tenant validation
    if (companyId && smsBill.companyId && smsBill.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Apply VAT Auditor masking
    const masked = maskForVatAuditorSms(
      {
        ...smsBill,
        payments: smsBill.payments.map((p) => ({
          ...p,
          method: formatFinancialField(p.method),
          reference: formatFinancialField(p.reference),
          notes: formatFinancialField(p.notes),
        })),
      },
      security.user.role
    );

    return NextResponse.json(masked);
  } catch (error) {
    console.error('[SmsBills] GET [id] error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch SMS bill' },
      { status: 500 }
    );
  }
}

// PUT /api/sms-bills/[id] — Update SMS bill (manager can update)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'SmsBills', 'PUT');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const body = await request.json();
    const companyId = security.user.companyId;

    // Cross-tenant validation
    const existing = await db.smsBill.findUnique({
      where: { id },
      include: { payments: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'SMS bill not found' }, { status: 404 });
    }
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Safe financial calculations
    const newTotalCost = body.totalCost !== undefined
      ? safeFinancialRound(Number(body.totalCost) || 0)
      : existing.totalCost;
    const newPaidAmount = body.paidAmount !== undefined
      ? safeFinancialRound(Number(body.paidAmount) || 0)
      : existing.paidAmount;
    const outstanding = safeFinancialSubtract(newTotalCost, newPaidAmount);

    // Determine status
    let newStatus = body.status || existing.status;
    if (body.status === undefined && (body.totalCost !== undefined || body.paidAmount !== undefined)) {
      if (newPaidAmount >= newTotalCost && newTotalCost > 0) {
        newStatus = 'Paid';
      } else if (newPaidAmount > 0) {
        newStatus = 'Partial';
      } else {
        newStatus = 'Unpaid';
      }
    }

    const result = await db.$transaction(async (tx) => {
      const smsBill = await tx.smsBill.update({
        where: { id },
        data: {
          ...(body.period !== undefined && { period: body.period }),
          ...(body.totalSms !== undefined && { totalSms: body.totalSms }),
          ...(body.totalSegments !== undefined && { totalSegments: body.totalSegments }),
          totalCost: newTotalCost,
          paidAmount: newPaidAmount,
          outstanding,
          status: newStatus,
        },
        include: {
          payments: true,
        },
      });

      // Activity log with SMS-Billing-Settle module token
      await logUserActivity({
        action: 'UPDATE',
        module: 'SMS-Billing-Settle',
        recordId: smsBill.id,
        recordLabel: smsBill.period || smsBill.id,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          period: smsBill.period,
          totalCost: smsBill.totalCost,
          paidAmount: smsBill.paidAmount,
          outstanding: smsBill.outstanding,
          status: smsBill.status,
        }),
      });

      return smsBill;
    });

    // Apply VAT Auditor masking on response
    const masked = maskForVatAuditorSms(
      {
        ...result,
        payments: result.payments.map((p) => ({
          ...p,
          method: formatFinancialField(p.method),
          reference: formatFinancialField(p.reference),
          notes: formatFinancialField(p.notes),
        })),
      },
      security.user.role
    );

    return NextResponse.json(masked);
  } catch (error) {
    console.error('[SmsBills] PUT [id] error:', error);
    return NextResponse.json(
      { error: 'Failed to update SMS bill' },
      { status: 500 }
    );
  }
}

// DELETE /api/sms-bills/[id] — Soft delete SMS bill (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'SmsBills', 'DELETE');
  if (!security.authorized) return security.response;

  // RBAC: Only admin can delete financial posts (bills)
  const deleteDenied = checkFinancialDeletePermission(security.user.role);
  if (deleteDenied) return deleteDenied;

  try {
    const { id } = await params;
    const companyId = security.user.companyId;

    await db.$transaction(async (tx) => {
      const record = await tx.smsBill.findUnique({
        where: { id },
        include: { payments: true },
      });
      if (!record) throw new Error('Not found');

      // Cross-tenant validation
      if (companyId && record.companyId && record.companyId !== companyId) {
        throw new Error('Forbidden');
      }

      // Soft delete the bill
      await tx.smsBill.update({
        where: { id },
        data: { isActive: false },
      });

      // Also soft-delete associated payments if they had isActive
      // SmsBillPayment doesn't have isActive — leave them as-is (bill is soft-deleted)

      // Activity log with SMS-Billing-Settle module token
      await logUserActivity({
        action: 'DELETE',
        module: 'SMS-Billing-Settle',
        recordId: record.id,
        recordLabel: record.period || record.id,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          period: record.period,
          totalCost: record.totalCost,
          paidAmount: record.paidAmount,
          outstanding: record.outstanding,
          softDelete: true,
        }),
      });

      return record;
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    if (error instanceof Error && error.message === 'Not found') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    console.error('[SmsBills] DELETE [id] error:', error);
    return NextResponse.json(
      { error: 'Failed to delete SMS bill' },
      { status: 500 }
    );
  }
}
