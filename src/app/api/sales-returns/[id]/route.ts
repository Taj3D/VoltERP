import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/sales-returns/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const salesReturn = await db.salesReturn.findUnique({
      where: { id },
      include: {
        salesOrder: {
          include: {
            customer: true,
          },
        },
        lines: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!salesReturn) {
      return NextResponse.json(
        { error: 'Sales return not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(salesReturn);
  } catch (error) {
    console.error('Error fetching sales return:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sales return' },
      { status: 500 }
    );
  }
}

// PUT /api/sales-returns/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { salesOrderId, customerId, date, reason, status, lines } = body;

    // Calculate grandTotal from lines if provided
    const grandTotal = lines
      ? lines.reduce(
          (sum: number, line: { total: number }) => sum + (line.total || 0),
          0
        )
      : undefined;

    const result = await db.$transaction(async (tx) => {
      if (lines) {
        await tx.salesReturnLine.deleteMany({
          where: { salesReturnId: id },
        });
      }

      const salesReturn = await tx.salesReturn.update({
        where: { id },
        data: {
          ...(salesOrderId && { salesOrderId }),
          ...(customerId && { customerId }),
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
          salesOrder: { include: { customer: true } },
          lines: { include: { product: true } },
        },
      });

      return salesReturn;
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating sales return:', error);
    return NextResponse.json(
      { error: 'Failed to update sales return' },
      { status: 500 }
    );
  }
}

// DELETE /api/sales-returns/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await db.$transaction(async (tx) => {
      await tx.salesReturnLine.deleteMany({
        where: { salesReturnId: id },
      });

      await tx.salesReturn.delete({
        where: { id },
      });
    });

    return NextResponse.json({ message: 'Sales return deleted successfully' });
  } catch (error) {
    console.error('Error deleting sales return:', error);
    return NextResponse.json(
      { error: 'Failed to delete sales return' },
      { status: 500 }
    );
  }
}
