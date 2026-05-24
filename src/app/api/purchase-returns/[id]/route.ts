import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/purchase-returns/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const purchaseReturn = await db.purchaseReturn.findUnique({
      where: { id },
      include: {
        purchaseOrder: {
          include: {
            supplier: true,
          },
        },
        lines: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!purchaseReturn) {
      return NextResponse.json(
        { error: 'Purchase return not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(purchaseReturn);
  } catch (error) {
    console.error('Error fetching purchase return:', error);
    return NextResponse.json(
      { error: 'Failed to fetch purchase return' },
      { status: 500 }
    );
  }
}

// PUT /api/purchase-returns/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { purchaseOrderId, supplierId, date, reason, status, lines } = body;

    // Calculate grandTotal from lines if provided
    const grandTotal = lines
      ? lines.reduce(
          (sum: number, line: { total: number }) => sum + (line.total || 0),
          0
        )
      : undefined;

    const result = await db.$transaction(async (tx) => {
      if (lines) {
        await tx.purchaseReturnLine.deleteMany({
          where: { purchaseReturnId: id },
        });
      }

      const purchaseReturn = await tx.purchaseReturn.update({
        where: { id },
        data: {
          ...(purchaseOrderId && { purchaseOrderId }),
          ...(supplierId && { supplierId }),
          ...(date && { date: new Date(date) }),
          ...(reason !== undefined && { reason }),
          ...(status && { status }),
          ...(grandTotal !== undefined && { grandTotal }),
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
          purchaseOrder: { include: { supplier: true } },
          lines: { include: { product: true } },
        },
      });

      return purchaseReturn;
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating purchase return:', error);
    return NextResponse.json(
      { error: 'Failed to update purchase return' },
      { status: 500 }
    );
  }
}

// DELETE /api/purchase-returns/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await db.$transaction(async (tx) => {
      await tx.purchaseReturnLine.deleteMany({
        where: { purchaseReturnId: id },
      });

      await tx.purchaseReturn.delete({
        where: { id },
      });
    });

    return NextResponse.json({ message: 'Purchase return deleted successfully' });
  } catch (error) {
    console.error('Error deleting purchase return:', error);
    return NextResponse.json(
      { error: 'Failed to delete purchase return' },
      { status: 500 }
    );
  }
}
