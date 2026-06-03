import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, maskForVatAuditor } from '@/lib/api-security';
import type { UserRole } from '@/lib/api-security';

// Activity logging helper — fire-and-forget
async function logActivity(userEmail: string, actionType: string, module: string, details: string) {
  try {
    await fetch(`${process.env.NEXT_PUBLIC_APP_URL || ''}/api/user-activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Email': userEmail },
      body: JSON.stringify({ actionType, module, details }),
    });
  } catch {}
}

// ============================================================
// GET /api/card-type-setups/[id] — Get a single card type setup by ID
// ============================================================
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'CardTypeSetups', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const companyId = security.user.companyId;
    const role = security.user.role as UserRole;

    const item = await db.cardTypeSetup.findUnique({
      where: { id },
      include: {
        paymentOption: { select: { id: true, name: true } },
        cardType: { select: { id: true, name: true } },
        company: { select: { id: true, name: true } },
      },
    });

    // Not found or cross-tenant protection
    if (!item || (companyId && item.companyId !== companyId)) {
      return NextResponse.json({ error: 'Card type setup not found' }, { status: 404 });
    }

    // Apply VAT auditor masking on chargePercentage
    const masked = maskForVatAuditor(
      item as unknown as Record<string, unknown>,
      role,
      ['chargePercentage'] // Sensitive fields: charge percentage controls financial processing charges
    );

    // Compute formatted percentage display
    const maskedRecord = masked as typeof item & { chargePercentageFormatted?: string };
    if (role === 'vat_auditor') {
      maskedRecord.chargePercentageFormatted = 'N/A (Audit Mode)';
    } else {
      maskedRecord.chargePercentageFormatted = `${Number(item.chargePercentage).toFixed(2)}%`;
    }

    // Handle empty/null optional fields for display consistency
    if (!maskedRecord.company) {
      (maskedRecord as Record<string, unknown>).company = null;
    }

    return NextResponse.json(maskedRecord);
  } catch (error) {
    console.error('Error fetching card type setup:', error);
    return NextResponse.json(
      { error: 'Failed to fetch card type setup' },
      { status: 500 }
    );
  }
}

// ============================================================
// PUT /api/card-type-setups/[id] — Update a card type setup (admin/manager only)
// ============================================================
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'CardTypeSetups', 'PUT');
  if (!security.authorized) return security.response;

  // RBAC: Only admin or manager can update; sr, dealer → 403
  // Card Settlement Tariffs control financial processing charges
  if (!['admin', 'manager'].includes(security.user.role)) {
    return NextResponse.json(
      { error: 'Access denied. Only admin or manager can update card type setups.' },
      { status: 403 }
    );
  }

  const companyId = security.user.companyId;

  try {
    const { id } = await params;
    const body = await request.json();

    // Verify the record exists and belongs to the user's company (cross-tenant protection)
    const existing = await db.cardTypeSetup.findUnique({ where: { id } });
    if (!existing || (companyId && existing.companyId !== companyId)) {
      return NextResponse.json({ error: 'Card type setup not found' }, { status: 404 });
    }

    const newPaymentOptionId = body.paymentOptionId !== undefined ? body.paymentOptionId : existing.paymentOptionId;
    const newCardTypeId = body.cardTypeId !== undefined ? body.cardTypeId : existing.cardTypeId;

    // Composite duplicate check: if paymentOptionId or cardTypeId is changing,
    // verify no other record with same paymentOptionId + cardTypeId + companyId exists
    const isPaymentChanging = body.paymentOptionId !== undefined && body.paymentOptionId !== existing.paymentOptionId;
    const isCardTypeChanging = body.cardTypeId !== undefined && body.cardTypeId !== existing.cardTypeId;

    if ((isPaymentChanging || isCardTypeChanging) && companyId) {
      const duplicate = await db.cardTypeSetup.findFirst({
        where: {
          paymentOptionId: newPaymentOptionId,
          cardTypeId: newCardTypeId,
          companyId,
          isActive: true,
          id: { not: id }, // Exclude the current record
        },
      });
      if (duplicate) {
        return NextResponse.json(
          { error: 'A card type setup with this payment option and card type already exists in your company.' },
          { status: 409 }
        );
      }
    }

    const item = await db.$transaction(async (tx) => {
      const record = await tx.cardTypeSetup.update({
        where: { id },
        data: {
          ...(body.paymentOptionId !== undefined ? { paymentOptionId: body.paymentOptionId } : {}),
          ...(body.cardTypeId !== undefined ? { cardTypeId: body.cardTypeId } : {}),
          ...(body.chargePercentage !== undefined ? { chargePercentage: body.chargePercentage } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        },
        include: {
          paymentOption: { select: { id: true, name: true } },
          cardType: { select: { id: true, name: true } },
        },
      });

      // Audit log entry
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'CardTypeSetup',
          recordId: record.id,
          recordLabel: `${record.paymentOption?.name || record.id} - ${record.cardType?.name || record.id}`,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            before: {
              paymentOptionId: existing.paymentOptionId,
              cardTypeId: existing.cardTypeId,
              chargePercentage: existing.chargePercentage,
            },
            after: {
              paymentOptionId: record.paymentOptionId,
              cardTypeId: record.cardTypeId,
              chargePercentage: record.chargePercentage,
            },
          }),
        },
      });

      return record;
    });

    // Activity logging — fire-and-forget, module token "Payment-Gateway-Setup"
    logActivity(
      security.user.email,
      'UPDATE',
      'Payment-Gateway-Setup',
      `Updated card type setup "${item.paymentOption?.name || item.id} - ${item.cardType?.name || item.id}" (ID: ${item.id})`
    );

    // Add computed display field to response
    const responseItem = {
      ...item,
      chargePercentageFormatted: `${Number(item.chargePercentage).toFixed(2)}%`,
    };

    return NextResponse.json(responseItem);
  } catch (error) {
    console.error('Error updating card type setup:', error);
    return NextResponse.json(
      { error: 'Failed to update card type setup' },
      { status: 500 }
    );
  }
}

// ============================================================
// DELETE /api/card-type-setups/[id] — Soft delete (admin/manager only)
// ============================================================
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'CardTypeSetups', 'DELETE');
  if (!security.authorized) return security.response;

  // RBAC: Only admin or manager can delete; sr, dealer → 403
  // Card Settlement Tariffs control financial processing charges
  if (!['admin', 'manager'].includes(security.user.role)) {
    return NextResponse.json(
      { error: 'Access denied. Only admin or manager can delete card type setups.' },
      { status: 403 }
    );
  }

  const companyId = security.user.companyId;

  try {
    const { id } = await params;

    // Verify the record exists and belongs to the user's company (cross-tenant protection)
    const existing = await db.cardTypeSetup.findUnique({ where: { id } });
    if (!existing || (companyId && existing.companyId !== companyId)) {
      return NextResponse.json({ error: 'Card type setup not found' }, { status: 404 });
    }

    // Soft delete — set isActive = false
    await db.$transaction(async (tx) => {
      await tx.cardTypeSetup.update({
        where: { id },
        data: { isActive: false },
      });

      // Audit log entry
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'CardTypeSetup',
          recordId: existing.id,
          recordLabel: existing.id,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            paymentOptionId: existing.paymentOptionId,
            cardTypeId: existing.cardTypeId,
            chargePercentage: existing.chargePercentage,
            softDelete: true,
          }),
        },
      });
    });

    // Activity logging — fire-and-forget, module token "Payment-Gateway-Setup"
    logActivity(
      security.user.email,
      'DELETE',
      'Payment-Gateway-Setup',
      `Deleted card type setup (ID: ${existing.id}) — soft delete`
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting card type setup:', error);
    return NextResponse.json(
      { error: 'Failed to delete card type setup' },
      { status: 500 }
    );
  }
}
