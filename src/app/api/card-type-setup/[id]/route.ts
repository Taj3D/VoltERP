// ============================================================
// Card Type Setup [id] API — Phase 7 Multi-Channel Payment Architecture
// Cross-tenant validation, Rate bounds validation (0–10.00), safeFinancialRound
// Module Token: Sys-Ops-Channels
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, safeFinancialRound } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

/**
 * Validates that a rate value is numeric and within the allowed bounds [0, 10.00].
 * Returns an error message string if invalid, or null if valid.
 */
function validateRateBounds(
  value: unknown,
  fieldName: string
): string | null {
  if (value === undefined || value === null) return null; // optional on update

  const num = Number(value);

  if (isNaN(num)) {
    return `${fieldName} must be a numeric value, received non-numeric input`;
  }

  if (num < 0 || num > 10.0) {
    return `${fieldName} must be between 0 and 10.00, received ${num}`;
  }

  return null;
}

// GET /api/card-type-setup/[id] — Get single card type setup with cross-tenant validation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'CardTypeSetups', 'GET');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;
    const setup = await db.cardTypeSetup.findUnique({
      where: { id },
      include: {
        paymentOption: true,
        cardType: true,
      },
    });

    if (!setup) {
      return NextResponse.json(
        { error: 'Card type setup not found' },
        { status: 404 }
      );
    }

    // Cross-tenant validation: if user has a companyId and the record has one, they must match
    if (companyId && setup.companyId && setup.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Card type setup not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(setup);
  } catch (error) {
    console.error('Error fetching card type setup:', error);
    return NextResponse.json(
      { error: 'Failed to fetch card type setup' },
      { status: 500 }
    );
  }
}

// PUT /api/card-type-setup/[id] — Update with cross-tenant validation, rate bounds, safeFinancialRound
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'CardTypeSetups', 'PUT');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;
    const body = await request.json();
    const { paymentOptionId, cardTypeId, chargePercentage, bankServiceCharge, customerConvFee, isActive } = body;

    // Pre-fetch the existing record for cross-tenant validation
    const existing = await db.cardTypeSetup.findUnique({
      where: { id },
      include: {
        paymentOption: true,
        cardType: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Card type setup not found' },
        { status: 404 }
      );
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Card type setup not found' },
        { status: 404 }
      );
    }

    // Validate rate bounds: chargePercentage, bankServiceCharge and customerConvFee
    const chargeError = validateRateBounds(chargePercentage, 'Charge Percentage');
    if (chargeError) {
      return NextResponse.json({ error: chargeError }, { status: 400 });
    }

    const bscError = validateRateBounds(bankServiceCharge, 'Bank Service Charge (BSC %)');
    if (bscError) {
      return NextResponse.json({ error: bscError }, { status: 400 });
    }

    const ccfError = validateRateBounds(customerConvFee, 'Customer Conv. Fee (%)');
    if (ccfError) {
      return NextResponse.json({ error: ccfError }, { status: 400 });
    }

    // Apply safeFinancialRound to all rate fields being updated
    const updateData: Record<string, unknown> = {};
    if (paymentOptionId !== undefined) updateData.paymentOptionId = paymentOptionId;
    if (cardTypeId !== undefined) updateData.cardTypeId = cardTypeId;
    if (chargePercentage !== undefined && chargePercentage !== null) {
      updateData.chargePercentage = safeFinancialRound(Number(chargePercentage));
    }
    if (bankServiceCharge !== undefined && bankServiceCharge !== null) {
      updateData.bankServiceCharge = safeFinancialRound(Number(bankServiceCharge));
    }
    if (customerConvFee !== undefined && customerConvFee !== null) {
      updateData.customerConvFee = safeFinancialRound(Number(customerConvFee));
    }
    if (isActive !== undefined) updateData.isActive = isActive;
    // Enforce companyId — prevent cross-tenant reassignment
    if (companyId) updateData.companyId = companyId;

    const result = await db.$transaction(async (tx) => {
      const setup = await tx.cardTypeSetup.update({
        where: { id },
        data: updateData,
        include: {
          paymentOption: true,
          cardType: true,
        },
      });

      // Activity logging with module token Sys-Ops-Channels
      await logUserActivity({
          tx: tx,
        action: 'UPDATE',
        module: 'Sys-Ops-Channels',
        recordId: setup.id,
        recordLabel: `${setup.paymentOption?.name || setup.id} - ${setup.cardType?.name || setup.id}`,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          previousChargePercentage: existing.chargePercentage,
          previousBankServiceCharge: existing.bankServiceCharge,
          previousCustomerConvFee: existing.customerConvFee,
          newChargePercentage: setup.chargePercentage,
          newBankServiceCharge: setup.bankServiceCharge,
          newCustomerConvFee: setup.customerConvFee,
          companyId,
        }),
      });

      return setup;
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating card type setup:', error);
    return NextResponse.json(
      { error: 'Failed to update card type setup' },
      { status: 500 }
    );
  }
}

// DELETE /api/card-type-setup/[id] — Soft delete with cross-tenant validation
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'CardTypeSetups', 'DELETE');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;

    // Pre-fetch for cross-tenant validation
    const existing = await db.cardTypeSetup.findUnique({
      where: { id },
      include: {
        paymentOption: true,
        cardType: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Card type setup not found' },
        { status: 404 }
      );
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Card type setup not found' },
        { status: 404 }
      );
    }

    if (!existing.isActive) {
      return NextResponse.json(
        { error: 'Card type setup is already deleted' },
        { status: 400 }
      );
    }

    await db.$transaction(async (tx) => {
      // CardTypeSetup has no FK references to other models, safe to soft-delete
      await tx.cardTypeSetup.update({
        where: { id },
        data: { isActive: false },
      });

      // Activity logging with module token Sys-Ops-Channels
      await logUserActivity({
          tx: tx,
        action: 'DELETE',
        module: 'Sys-Ops-Channels',
        recordId: existing.id,
        recordLabel: `${existing.paymentOption?.name || existing.id} - ${existing.cardType?.name || existing.id}`,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          paymentOptionId: existing.paymentOptionId,
          cardTypeId: existing.cardTypeId,
          chargePercentage: existing.chargePercentage,
          bankServiceCharge: existing.bankServiceCharge,
          customerConvFee: existing.customerConvFee,
          softDelete: true,
          companyId,
        }),
      });
    });

    return NextResponse.json({
      success: true,
      message: 'Card type setup deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting card type setup:', error);
    return NextResponse.json(
      { error: 'Failed to delete card type setup' },
      { status: 500 }
    );
  }
}
