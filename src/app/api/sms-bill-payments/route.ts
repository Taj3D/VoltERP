// ============================================================
// SMS BILL PAYMENTS API ROUTE — Stage 11 Rebuild
// Multi-tenant companyId isolation (via SmsBill relation),
// RBAC (manager: create/update, admin-only delete), VAT Auditor
// masking, Activity logging with SMS-Billing-Settle token,
// safe financial arithmetic for all amount calculations
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  maskSmsArray,
  checkFinancialDeletePermission,
  safeFinancialRound,
  safeFinancialAdd,
  safeFinancialSubtract,
  formatFinancialField,
  stripHtml,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// Helper: convert empty string to null
function nullIfEmpty(val: string | undefined | null): string | null {
  if (val === undefined || val === null || val.trim() === '') return null;
  return val;
}

// GET /api/sms-bill-payments — List all SMS bill payments for current tenant
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'SmsBillPayments', 'GET');
  if (!security.authorized) return security.response;

  try {
    const companyId = security.user.companyId;

    // SmsBillPayment doesn't have companyId directly — filter through SmsBill relation
    const where: Record<string, unknown> = {};
    if (companyId) {
      where.smsBill = { companyId, isActive: true };
    }

    const payments = await db.smsBillPayment.findMany({
      where,
      include: {
        smsBill: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Apply VAT Auditor masking + format empty fields
    const masked = maskSmsArray(
      payments.map((p) => ({
        ...p,
        method: formatFinancialField(p.method),
        reference: formatFinancialField(p.reference),
        notes: formatFinancialField(p.notes),
        smsBill: p.smsBill
          ? {
              ...p.smsBill,
            }
          : null,
      })),
      security.user.role
    );

    return NextResponse.json(masked);
  } catch (error) {
    console.error('[SmsBillPayments] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch SMS bill payments' },
      { status: 500 }
    );
  }
}

// POST /api/sms-bill-payments — Create SMS bill payment (manager can create)
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'SmsBillPayments', 'POST');
  if (!security.authorized) return security.response;

  try {
    const body = await request.json();
    const companyId = security.user.companyId;
    const { smsBillId, amount, date, method, notes, reference } = body;

    if (!smsBillId || amount === undefined || !date) {
      return NextResponse.json(
        { error: 'smsBillId, amount, and date are required' },
        { status: 400 }
      );
    }

    // Validate smsBill belongs to tenant
    const smsBill = await db.smsBill.findUnique({
      where: { id: smsBillId },
    });
    if (!smsBill) {
      return NextResponse.json(
        { error: 'SMS bill not found' },
        { status: 404 }
      );
    }
    if (companyId && smsBill.companyId && smsBill.companyId !== companyId) {
      return NextResponse.json(
        { error: 'SMS bill not found' },
        { status: 404 }
      );
    }

    // Safe financial rounding on amount
    const safeAmount = safeFinancialRound(Number(amount) || 0);

    const result = await db.$transaction(async (tx) => {
      const payment = await tx.smsBillPayment.create({
        data: {
          smsBillId,
          amount: safeAmount,
          date: new Date(date),
          method: nullIfEmpty(method ? stripHtml(method) : undefined),
          reference: nullIfEmpty(reference ? stripHtml(reference) : undefined),
          notes: nullIfEmpty(notes ? stripHtml(notes) : undefined),
        },
        include: {
          smsBill: true,
        },
      });

      // Recalculate the SMS bill's paidAmount using safe financial arithmetic
      const bill = await tx.smsBill.findUnique({
        where: { id: smsBillId },
        include: { payments: true },
      });

      if (bill) {
        const totalPaid = safeFinancialRound(
          bill.payments.reduce((sum, p) => safeFinancialAdd(sum, p.amount), 0)
        );
        const outstanding = safeFinancialSubtract(bill.totalCost, totalPaid);
        const newStatus =
          totalPaid >= bill.totalCost && bill.totalCost > 0
            ? 'Paid'
            : totalPaid > 0
              ? 'Partial'
              : 'Unpaid';

        await tx.smsBill.update({
          where: { id: smsBillId },
          data: {
            paidAmount: totalPaid,
            outstanding,
            status: newStatus,
          },
        });
      }

      // Activity log with SMS-Billing-Settle module token
      await logUserActivity({
          tx: tx,
        action: 'CREATE',
        module: 'SMS-Billing-Settle',
        recordId: payment.id,
        recordLabel: `${payment.smsBill?.period || payment.id} - ${payment.amount}`,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          smsBillId,
          amount: safeAmount,
          date,
          method: payment.method,
          reference: payment.reference,
        }),
      });

      return payment;
    });

    // Apply VAT Auditor masking on response
    const masked = formatFinancialField;
    const response = {
      ...result,
      method: masked(result.method),
      reference: masked(result.reference),
      notes: masked(result.notes),
    };

    // Re-fetch the smsBill with updated data for the response
    let updatedSmsBill = result.smsBill;
    try {
      const freshBill = await db.smsBill.findUnique({
        where: { id: smsBillId },
      });
      if (freshBill) {
        updatedSmsBill = freshBill;
      }
    } catch { /* non-blocking: use stale bill data if re-fetch fails */ }

    response.smsBill = updatedSmsBill;

    // Apply SMS masking via maskSmsArray (wraps in array, masks, then extracts)
    const maskedArr = maskSmsArray([response], security.user.role);

    return NextResponse.json(maskedArr[0], { status: 201 });
  } catch (error) {
    console.error('[SmsBillPayments] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to create SMS bill payment' },
      { status: 500 }
    );
  }
}
