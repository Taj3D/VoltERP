import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/sales-orders/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const salesOrder = await db.salesOrder.findUnique({
      where: { id },
      include: {
        customer: true,
        godown: true,
        paymentOption: true,
        lines: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!salesOrder) {
      return NextResponse.json(
        { error: 'Sales order not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(salesOrder);
  } catch (error) {
    console.error('Error fetching sales order:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sales order' },
      { status: 500 }
    );
  }
}

// PUT /api/sales-orders/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { customerId, date, godownId, discount, paymentOptionId, notes, status, lines } =
      body;

    // Calculate grandTotal from lines if provided
    let grandTotal: number | undefined;
    if (lines) {
      const lineTotal = lines.reduce(
        (sum: number, line: { total: number }) => sum + (line.total || 0),
        0
      );
      grandTotal = lineTotal - (discount ?? 0);
    } else if (discount !== undefined) {
      // If only discount changed, recalculate
      const existing = await db.salesOrder.findUnique({
        where: { id },
        include: { lines: true },
      });
      if (existing) {
        const lineTotal = existing.lines.reduce((sum, l) => sum + l.total, 0);
        grandTotal = lineTotal - discount;
      }
    }

    const result = await db.$transaction(async (tx) => {
      // Delete existing lines if lines are provided
      if (lines) {
        await tx.salesOrderLine.deleteMany({
          where: { salesOrderId: id },
        });
      }

      const salesOrder = await tx.salesOrder.update({
        where: { id },
        data: {
          ...(customerId && { customerId }),
          ...(date && { date: new Date(date) }),
          ...(godownId !== undefined && { godownId: godownId || null }),
          ...(discount !== undefined && { discount }),
          ...(paymentOptionId !== undefined && { paymentOptionId: paymentOptionId || null }),
          ...(notes !== undefined && { notes }),
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
          customer: true,
          godown: true,
          paymentOption: true,
          lines: { include: { product: true } },
        },
      });

      return salesOrder;
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating sales order:', error);
    return NextResponse.json(
      { error: 'Failed to update sales order' },
      { status: 500 }
    );
  }
}

// DELETE /api/sales-orders/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await db.$transaction(async (tx) => {
      await tx.salesOrderLine.deleteMany({
        where: { salesOrderId: id },
      });

      await tx.salesOrder.delete({
        where: { id },
      });
    });

    return NextResponse.json({ message: 'Sales order deleted successfully' });
  } catch (error) {
    console.error('Error deleting sales order:', error);
    return NextResponse.json(
      { error: 'Failed to delete sales order' },
      { status: 500 }
    );
  }
}
