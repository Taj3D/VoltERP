import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/transfers/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const transfer = await db.stockTransfer.findUnique({
      where: { id },
      include: {
        fromGodown: true,
        toGodown: true,
        lines: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!transfer) {
      return NextResponse.json(
        { error: 'Transfer not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(transfer);
  } catch (error) {
    console.error('Error fetching transfer:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transfer' },
      { status: 500 }
    );
  }
}

// PUT /api/transfers/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { fromGodownId, toGodownId, date, notes, status, lines } = body;

    const result = await db.$transaction(async (tx) => {
      if (lines) {
        await tx.stockTransferLine.deleteMany({
          where: { stockTransferId: id },
        });
      }

      const transfer = await tx.stockTransfer.update({
        where: { id },
        data: {
          ...(fromGodownId && { fromGodownId }),
          ...(toGodownId && { toGodownId }),
          ...(date && { date: new Date(date) }),
          ...(notes !== undefined && { notes }),
          ...(status && { status }),
          ...(lines && {
            lines: {
              create: lines.map(
                (line: {
                  productId: string;
                  quantity: number;
                }) => ({
                  productId: line.productId,
                  quantity: line.quantity,
                })
              ),
            },
          }),
        },
        include: {
          fromGodown: true,
          toGodown: true,
          lines: { include: { product: true } },
        },
      });

      return transfer;
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating transfer:', error);
    return NextResponse.json(
      { error: 'Failed to update transfer' },
      { status: 500 }
    );
  }
}

// DELETE /api/transfers/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await db.$transaction(async (tx) => {
      await tx.stockTransferLine.deleteMany({
        where: { stockTransferId: id },
      });

      await tx.stockTransfer.delete({
        where: { id },
      });
    });

    return NextResponse.json({ message: 'Transfer deleted successfully' });
  } catch (error) {
    console.error('Error deleting transfer:', error);
    return NextResponse.json(
      { error: 'Failed to delete transfer' },
      { status: 500 }
    );
  }
}
