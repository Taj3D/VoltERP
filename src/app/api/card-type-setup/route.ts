// ============================================================
// Card Type Setup API — Phase 7 Multi-Channel Payment Architecture
// Rate bounds validation (0–10.00), safeFinancialRound, Company-scoped isolation
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

// GET /api/card-type-setup — List card type setups filtered by companyId
// Includes paymentOption and cardType relations
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'CardTypeSetups', 'GET');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const setups = await db.cardTypeSetup.findMany({
      where: companyId ? { companyId, isActive: true } : { isActive: true },
      include: {
        paymentOption: true,
        cardType: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(setups);
  } catch (error) {
    console.error('Error fetching card type setups:', error);
    return NextResponse.json(
      { error: 'Failed to fetch card type setups' },
      { status: 500 }
    );
  }
}

// POST /api/card-type-setup — Create card type setup with rate bounds validation & safeFinancialRound
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'CardTypeSetups', 'POST');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const body = await request.json();
    const { paymentOptionId, cardTypeId, chargePercentage, bankServiceCharge, customerConvFee, isActive } = body;

    // Validate required fields
    if (!paymentOptionId) {
      return NextResponse.json(
        { error: 'paymentOptionId is required' },
        { status: 400 }
      );
    }

    if (!cardTypeId) {
      return NextResponse.json(
        { error: 'cardTypeId is required' },
        { status: 400 }
      );
    }

    // Validate rate bounds: bankServiceCharge and customerConvFee must be 0 <= rate <= 10.00
    const bscError = validateRateBounds(bankServiceCharge, 'Bank Service Charge (BSC %)');
    if (bscError) {
      return NextResponse.json({ error: bscError }, { status: 400 });
    }

    const ccfError = validateRateBounds(customerConvFee, 'Customer Conv. Fee (%)');
    if (ccfError) {
      return NextResponse.json({ error: ccfError }, { status: 400 });
    }

    // Apply safeFinancialRound to all rate fields
    const safeBsc = bankServiceCharge !== undefined && bankServiceCharge !== null
      ? safeFinancialRound(Number(bankServiceCharge))
      : 0;
    const safeCcf = customerConvFee !== undefined && customerConvFee !== null
      ? safeFinancialRound(Number(customerConvFee))
      : 0;
    const safeCharge = chargePercentage !== undefined && chargePercentage !== null
      ? safeFinancialRound(Number(chargePercentage))
      : 0;

    const result = await db.$transaction(async (tx) => {
      const setup = await tx.cardTypeSetup.create({
        data: {
          paymentOptionId,
          cardTypeId,
          chargePercentage: safeCharge,
          bankServiceCharge: safeBsc,
          customerConvFee: safeCcf,
          isActive: isActive !== undefined ? isActive : true,
          ...(companyId && { companyId }),
        },
        include: {
          paymentOption: true,
          cardType: true,
        },
      });

      // Activity logging with module token Sys-Ops-Channels
      await logUserActivity({
          tx: tx,
        action: 'CREATE',
        module: 'Sys-Ops-Channels',
        recordId: setup.id,
        recordLabel: `${setup.paymentOption?.name || setup.id} - ${setup.cardType?.name || setup.id}`,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          paymentOptionId,
          cardTypeId,
          chargePercentage: safeCharge,
          bankServiceCharge: safeBsc,
          customerConvFee: safeCcf,
          companyId,
        }),
      });

      return setup;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating card type setup:', error);
    return NextResponse.json(
      { error: 'Failed to create card type setup' },
      { status: 500 }
    );
  }
}
