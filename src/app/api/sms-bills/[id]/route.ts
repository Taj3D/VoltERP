import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/sms-bills/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const smsBill = await db.smsBill.findUnique({
      where: { id },
      include: {
        payments: true,
      },
    });

    if (!smsBill) {
      return NextResponse.json(
        { error: 'SMS bill not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(smsBill);
  } catch (error) {
    console.error('Error fetching SMS bill:', error);
    return NextResponse.json(
      { error: 'Failed to fetch SMS bill' },
      { status: 500 }
    );
  }
}

// PUT /api/sms-bills/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { period, totalSms, totalCost, paidAmount, status } = body;

    const result = await db.$transaction(async (tx) => {
      const smsBill = await tx.smsBill.update({
        where: { id },
        data: {
          ...(period && { period }),
          ...(totalSms !== undefined && { totalSms }),
          ...(totalCost !== undefined && { totalCost }),
          ...(paidAmount !== undefined && { paidAmount }),
          ...(status && { status }),
        },
        include: {
          payments: true,
        },
      });

      return smsBill;
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating SMS bill:', error);
    return NextResponse.json(
      { error: 'Failed to update SMS bill' },
      { status: 500 }
    );
  }
}

// DELETE /api/sms-bills/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await db.$transaction(async (tx) => {
      await tx.smsBillPayment.deleteMany({
        where: { smsBillId: id },
      });

      await tx.smsBill.delete({
        where: { id },
      });
    });

    return NextResponse.json({ message: 'SMS bill deleted successfully' });
  } catch (error) {
    console.error('Error deleting SMS bill:', error);
    return NextResponse.json(
      { error: 'Failed to delete SMS bill' },
      { status: 500 }
    );
  }
}
