import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/replacements/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const replacement = await db.replacementOrder.findUnique({
      where: { id },
      include: {
        salesOrder: true,
        lines: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!replacement) {
      return NextResponse.json(
        { error: 'Replacement order not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(replacement);
  } catch (error) {
    console.error('Error fetching replacement order:', error);
    return NextResponse.json(
      { error: 'Failed to fetch replacement order' },
      { status: 500 }
    );
  }
}

// PUT /api/replacements/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { salesOrderId, date, reason, status, lines } = body;

    const result = await db.$transaction(async (tx) => {
      if (lines) {
        await tx.replacementOrderLine.deleteMany({
          where: { replacementOrderId: id },
        });
      }

      const replacement = await tx.replacementOrder.update({
        where: { id },
        data: {
          ...(salesOrderId !== undefined && { salesOrderId: salesOrderId || null }),
          ...(date && { date: new Date(date) }),
          ...(reason !== undefined && { reason }),
          ...(status && { status }),
          ...(lines && {
            lines: {
              create: lines.map(
                (line: {
                  productId: string;
                  quantity: number;
                  rate: number;
                  total: number;
                }) => ({
                  productId: line.productId,
                  quantity: line.quantity,
                  rate: line.rate,
                  total: line.total,
                })
              ),
            },
          }),
        },
        include: {
          salesOrder: true,
          lines: { include: { product: true } },
        },
      });

      return replacement;
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating replacement order:', error);
    return NextResponse.json(
      { error: 'Failed to update replacement order' },
      { status: 500 }
    );
  }
}

// DELETE /api/replacements/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await db.$transaction(async (tx) => {
      await tx.replacementOrderLine.deleteMany({
        where: { replacementOrderId: id },
      });

      await tx.replacementOrder.delete({
        where: { id },
      });
    });

    return NextResponse.json({ message: 'Replacement order deleted successfully' });
  } catch (error) {
    console.error('Error deleting replacement order:', error);
    return NextResponse.json(
      { error: 'Failed to delete replacement order' },
      { status: 500 }
    );
  }
}
