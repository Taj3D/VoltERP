import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/card-type-setup/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    return NextResponse.json(setup);
  } catch (error) {
    console.error('Error fetching card type setup:', error);
    return NextResponse.json(
      { error: 'Failed to fetch card type setup' },
      { status: 500 }
    );
  }
}

// PUT /api/card-type-setup/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { paymentOptionId, cardTypeId, chargePercentage, isActive } = body;

    const result = await db.$transaction(async (tx) => {
      const setup = await tx.cardTypeSetup.update({
        where: { id },
        data: {
          ...(paymentOptionId && { paymentOptionId }),
          ...(cardTypeId && { cardTypeId }),
          ...(chargePercentage !== undefined && { chargePercentage }),
          ...(isActive !== undefined && { isActive }),
        },
        include: {
          paymentOption: true,
          cardType: true,
        },
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

// DELETE /api/card-type-setup/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await db.$transaction(async (tx) => {
      await tx.cardTypeSetup.delete({
        where: { id },
      });
    });

    return NextResponse.json({ message: 'Card type setup deleted successfully' });
  } catch (error) {
    console.error('Error deleting card type setup:', error);
    return NextResponse.json(
      { error: 'Failed to delete card type setup' },
      { status: 500 }
    );
  }
}
