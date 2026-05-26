import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity } from '@/lib/api-security';

// GET /api/card-type-setup - List all card type setups with relations
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'CardTypeSetups', 'GET');
  if (!security.authorized) return security.response;
  try {
    const setups = await db.cardTypeSetup.findMany({
      where: { isActive: true },
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

// POST /api/card-type-setup - Create card type setup
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'CardTypeSetups', 'POST');
  if (!security.authorized) return security.response;
  try {
    const body = await request.json();
    const { paymentOptionId, cardTypeId, chargePercentage, isActive } = body;

    if (!paymentOptionId || !cardTypeId) {
      return NextResponse.json(
        { error: 'paymentOptionId and cardTypeId are required' },
        { status: 400 }
      );
    }

    const result = await db.$transaction(async (tx) => {
      const setup = await tx.cardTypeSetup.create({
        data: {
          paymentOptionId,
          cardTypeId,
          chargePercentage: chargePercentage || 0,
          isActive: isActive !== undefined ? isActive : true,
        },
        include: {
          paymentOption: true,
          cardType: true,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'CardTypeSetup',
          recordId: setup.id,
          recordLabel: `${setup.paymentOption?.name || setup.id} - ${setup.cardType?.name || setup.id}`,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ paymentOptionId, cardTypeId, chargePercentage: chargePercentage || 0 }),
        },
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
