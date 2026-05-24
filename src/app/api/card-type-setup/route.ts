import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/card-type-setup - List all card type setups with relations
export async function GET() {
  try {
    const setups = await db.cardTypeSetup.findMany({
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
