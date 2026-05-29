// ============================================================
// SMS BILLS API ROUTE — Stage 11 Rebuild
// Multi-tenant companyId isolation, RBAC (manager: create/update,
// admin-only delete), VAT Auditor masking, Activity logging with
// SMS-Billing-Settle token, safe financial arithmetic
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  maskSmsArray,
  maskForVatAuditorSms,
  checkFinancialDeletePermission,
  safeFinancialRound,
  safeFinancialSubtract,
  formatFinancialField,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// GET /api/sms-bills — List all active SMS bills for current tenant
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'SmsBills', 'GET');
  if (!security.authorized) return security.response;

  try {
    const companyId = security.user.companyId;
    const where: Record<string, unknown> = { isActive: true };
    if (companyId) {
      where.companyId = companyId;
    }

    const items = await db.smsBill.findMany({
      where,
      include: {
        payments: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Apply VAT Auditor masking + format empty fields
    const masked = maskSmsArray(
      items.map((item) => ({
        ...item,
        payments: item.payments.map((p) => ({
          ...p,
          method: formatFinancialField(p.method),
          reference: formatFinancialField(p.reference),
          notes: formatFinancialField(p.notes),
        })),
      })),
      security.user.role
    );

    return NextResponse.json(masked);
  } catch (error) {
    console.error('[SmsBills] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch SMS bills' },
      { status: 500 }
    );
  }
}

// POST /api/sms-bills — Create SMS bill (manager can create)
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'SmsBills', 'POST');
  if (!security.authorized) return security.response;

  try {
    const body = await request.json();
    const companyId = security.user.companyId;
    const { period, totalSms, totalSegments, totalCost, paidAmount, status } = body;

    if (!period) {
      return NextResponse.json(
        { error: 'period is required' },
        { status: 400 }
      );
    }

    // Safe financial calculations
    const safeTotalCost = safeFinancialRound(Number(totalCost) || 0);
    const safePaidAmount = safeFinancialRound(Number(paidAmount) || 0);
    const outstanding = safeFinancialSubtract(safeTotalCost, safePaidAmount);

    // Determine status based on amounts
    let billStatus = status || 'Unpaid';
    if (!status) {
      if (safePaidAmount >= safeTotalCost && safeTotalCost > 0) {
        billStatus = 'Paid';
      } else if (safePaidAmount > 0) {
        billStatus = 'Partial';
      }
    }

    const result = await db.$transaction(async (tx) => {
      const smsBill = await tx.smsBill.create({
        data: {
          period,
          totalSms: totalSms || 0,
          totalSegments: totalSegments || 0,
          totalCost: safeTotalCost,
          paidAmount: safePaidAmount,
          outstanding,
          status: billStatus,
          isActive: true,
          ...(companyId && { companyId }),
        },
        include: {
          payments: true,
        },
      });

      // Activity log with SMS-Billing-Settle module token
      await logUserActivity({
        action: 'CREATE',
        module: 'SMS-Billing-Settle',
        recordId: smsBill.id,
        recordLabel: smsBill.period || smsBill.id,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          period,
          totalSms: smsBill.totalSms,
          totalSegments: smsBill.totalSegments,
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

    return NextResponse.json(masked, { status: 201 });
  } catch (error) {
    console.error('[SmsBills] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to create SMS bill' },
      { status: 500 }
    );
  }
}
