import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity } from '@/lib/api-security';

// GET /api/card-type-setup/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'CardTypeSetups', 'GET');
  if (!security.authorized) return security.response;
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
  const security = await withApiSecurity(request, 'CardTypeSetups', 'PUT');
  if (!security.authorized) return security.response;
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

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'CardTypeSetup',
          recordId: setup.id,
          recordLabel: `${setup.paymentOption?.name || setup.id} - ${setup.cardType?.name || setup.id}`,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ paymentOptionId, cardTypeId, chargePercentage, isActive }),
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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'CardTypeSetups', 'DELETE');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;

    await db.$transaction(async (tx) => {
      const record = await tx.cardTypeSetup.findUnique({ where: { id } });
      if (!record) throw new Error('Not found');

      // CardTypeSetup has no FK references, safe to soft-delete
      await tx.cardTypeSetup.update({
        where: { id },
        data: { isActive: false },
      });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'CardTypeSetup',
          recordId: record.id,
          recordLabel: record.id,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ paymentOptionId: record.paymentOptionId, cardTypeId: record.cardTypeId, softDelete: true }),
        },
      });

      return record;
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting card type setup:', error);
    return NextResponse.json(
      { error: 'Failed to delete card type setup' },
      { status: 500 }
    );
  }
}
