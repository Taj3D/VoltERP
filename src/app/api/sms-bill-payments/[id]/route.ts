// ============================================================
// SMS BILL PAYMENTS [id] API ROUTE — Stage 11 Rebuild
// Multi-tenant companyId isolation (via SmsBill relation),
// RBAC (manager: create/update, admin-only delete), VAT Auditor
// masking, Activity logging with SMS-Billing-Settle token,
// safe financial arithmetic for all amount calculations
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  maskForVatAuditorSms,
  maskSmsArray,
  checkFinancialDeletePermission,
  safeFinancialRound,
  safeFinancialAdd,
  safeFinancialSubtract,
  formatFinancialField,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// Helper: convert empty string to null
function nullIfEmpty(val: string | undefined | null): string | null {
  if (val === undefined || val === null || val.trim() === '') return null;
  return val;
}

// GET /api/sms-bill-payments/[id] — Get single SMS bill payment
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'SmsBillPayments', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const companyId = security.user.companyId;

    const payment = await db.smsBillPayment.findUnique({
      where: { id },
      include: {
        smsBill: true,
      },
    });

    if (!payment) {
      return NextResponse.json(
        { error: 'SMS bill payment not found' },
        { status: 404 }
      );
    }

    // Cross-tenant validation (via smsBill.companyId)
    if (
      companyId &&
      payment.smsBill?.companyId &&
      payment.smsBill.companyId !== companyId
    ) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Apply VAT Auditor masking
    const masked = maskForVatAuditorSms(
      {
        ...payment,
        method: formatFinancialField(payment.method),
        reference: formatFinancialField(payment.reference),
        notes: formatFinancialField(payment.notes),
        smsBill: payment.smsBill
          ? { ...payment.smsBill }
          : null,
      },
      security.user.role
    );

    return NextResponse.json(masked);
  } catch (error) {
    console.error('[SmsBillPayments] GET [id] error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch SMS bill payment' },
      { status: 500 }
    );
  }
}

// PUT /api/sms-bill-payments/[id] — Update SMS bill payment (manager can update)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'SmsBillPayments', 'PUT');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const body = await request.json();
    const companyId = security.user.companyId;

    // Cross-tenant validation (via smsBill.companyId)
    const existing = await db.smsBillPayment.findUnique({
      where: { id },
      include: { smsBill: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'SMS bill payment not found' },
        { status: 404 }
      );
    }
    if (
      companyId &&
      existing.smsBill?.companyId &&
      existing.smsBill.companyId !== companyId
    ) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Safe financial rounding on amount if provided
    const safeAmount =
      body.amount !== undefined
        ? safeFinancialRound(Number(body.amount) || 0)
        : existing.amount;

    const result = await db.$transaction(async (tx) => {
      const payment = await tx.smsBillPayment.update({
        where: { id },
        data: {
          ...(body.smsBillId && { smsBillId: body.smsBillId }),
          ...(body.amount !== undefined && { amount: safeAmount }),
          ...(body.date && { date: new Date(body.date) }),
          ...(body.method !== undefined && { method: nullIfEmpty(body.method) }),
          ...(body.reference !== undefined && { reference: nullIfEmpty(body.reference) }),
          ...(body.notes !== undefined && { notes: nullIfEmpty(body.notes) }),
        },
        include: {
          smsBill: true,
        },
      });

      // Recalculate the SMS bill's paidAmount using safe financial arithmetic
      if (payment.smsBillId) {
        const smsBill = await tx.smsBill.findUnique({
          where: { id: payment.smsBillId },
          include: { payments: true },
        });

        if (smsBill) {
          const totalPaid = safeFinancialRound(
            smsBill.payments.reduce(
              (sum, p) => safeFinancialAdd(sum, p.amount),
              0
            )
          );
          const outstanding = safeFinancialSubtract(smsBill.totalCost, totalPaid);
          const newStatus =
            totalPaid >= smsBill.totalCost && smsBill.totalCost > 0
              ? 'Paid'
              : totalPaid > 0
                ? 'Partial'
                : 'Unpaid';

          await tx.smsBill.update({
            where: { id: smsBill.id },
            data: {
              paidAmount: totalPaid,
              outstanding,
              status: newStatus,
            },
          });
        }
      }

      // Activity log with SMS-Billing-Settle module token
      await logUserActivity({
        action: 'UPDATE',
        module: 'Comm-SMS-Marketing',
        recordId: payment.id,
        recordLabel: `${payment.smsBill?.period || payment.id} - ${payment.amount}`,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          smsBillId: payment.smsBillId,
          amount: payment.amount,
          method: payment.method,
          reference: payment.reference,
        }),
      });

      return payment;
    });

    // Apply VAT Auditor masking on response
    const masked = maskForVatAuditorSms(
      {
        ...result,
        method: formatFinancialField(result.method),
        reference: formatFinancialField(result.reference),
        notes: formatFinancialField(result.notes),
        smsBill: result.smsBill ? { ...result.smsBill } : null,
      },
      security.user.role
    );

    return NextResponse.json(masked);
  } catch (error) {
    console.error('[SmsBillPayments] PUT [id] error:', error);
    return NextResponse.json(
      { error: 'Failed to update SMS bill payment' },
      { status: 500 }
    );
  }
}

// DELETE /api/sms-bill-payments/[id] — Delete SMS bill payment (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'SmsBillPayments', 'DELETE');
  if (!security.authorized) return security.response;

  // RBAC: Only admin can delete financial posts (payments)
  const deleteDenied = checkFinancialDeletePermission(security.user.role);
  if (deleteDenied) return deleteDenied;

  try {
    const { id } = await params;
    const companyId = security.user.companyId;

    await db.$transaction(async (tx) => {
      // Get the payment first to find the smsBillId for recalculation
      const payment = await tx.smsBillPayment.findUnique({
        where: { id },
        include: { smsBill: true },
      });

      if (!payment) throw new Error('Not found');

      // Cross-tenant validation (via smsBill.companyId)
      if (
        companyId &&
        payment.smsBill?.companyId &&
        payment.smsBill.companyId !== companyId
      ) {
        throw new Error('Forbidden');
      }

      // Hard delete the payment (SmsBillPayment has no isActive field)
      await tx.smsBillPayment.delete({
        where: { id },
      });

      // Recalculate the SMS bill's paidAmount using safe financial arithmetic
      if (payment.smsBillId) {
        const smsBill = await tx.smsBill.findUnique({
          where: { id: payment.smsBillId },
          include: { payments: true },
        });

        if (smsBill) {
          const totalPaid = safeFinancialRound(
            smsBill.payments.reduce(
              (sum, p) => safeFinancialAdd(sum, p.amount),
              0
            )
          );
          const outstanding = safeFinancialSubtract(smsBill.totalCost, totalPaid);
          const newStatus =
            totalPaid >= smsBill.totalCost && smsBill.totalCost > 0
              ? 'Paid'
              : totalPaid > 0
                ? 'Partial'
                : 'Unpaid';

          await tx.smsBill.update({
            where: { id: smsBill.id },
            data: {
              paidAmount: totalPaid,
              outstanding,
              status: newStatus,
            },
          });
        }
      }

      // Activity log with SMS-Billing-Settle module token
      await logUserActivity({
        action: 'DELETE',
        module: 'Comm-SMS-Marketing',
        recordId: payment.id,
        recordLabel: `${payment.smsBill?.period || payment.smsBillId} - ${payment.amount}`,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          smsBillId: payment.smsBillId,
          amount: payment.amount,
          hardDelete: true,
        }),
      });

      return payment;
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    if (error instanceof Error && error.message === 'Not found') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    console.error('[SmsBillPayments] DELETE [id] error:', error);
    return NextResponse.json(
      { error: 'Failed to delete SMS bill payment' },
      { status: 500 }
    );
  }
}
