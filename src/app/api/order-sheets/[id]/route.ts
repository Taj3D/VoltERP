import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/order-sheets/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const orderSheet = await db.orderSheet.findUnique({
      where: { id },
      include: {
        lines: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!orderSheet) {
      return NextResponse.json(
        { error: 'Order sheet not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(orderSheet);
  } catch (error) {
    console.error('Error fetching order sheet:', error);
    return NextResponse.json(
      { error: 'Failed to fetch order sheet' },
      { status: 500 }
    );
  }
}

// PUT /api/order-sheets/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { date, notes, status, companyId, customerId, lines } = body;

    const result = await db.$transaction(async (tx) => {
      if (lines) {
        await tx.orderSheetLine.deleteMany({
          where: { orderSheetId: id },
        });
      }

      const orderSheet = await tx.orderSheet.update({
        where: { id },
        data: {
          ...(date && { date: new Date(date) }),
          ...(notes !== undefined && { notes }),
          ...(status && { status }),
          ...(companyId !== undefined && { companyId: companyId || null }),
          ...(customerId !== undefined && { customerId: customerId || null }),
          ...(lines && {
            lines: {
              create: lines.map(
                (line: {
                  productId: string;
                  quantity: number;
                  rate: number;
                  total: number;
                  notes?: string;
                }) => ({
                  productId: line.productId,
                  quantity: line.quantity,
                  rate: line.rate,
                  total: line.total,
                  notes: line.notes || null,
                })
              ),
            },
          }),
        },
        include: {
          company: true,
          customer: true,
          lines: { include: { product: true } },
        },
      });

      return orderSheet;
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating order sheet:', error);
    return NextResponse.json(
      { error: 'Failed to update order sheet' },
      { status: 500 }
    );
  }
}

// DELETE /api/order-sheets/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await db.$transaction(async (tx) => {
      await tx.orderSheetLine.deleteMany({
        where: { orderSheetId: id },
      });

      await tx.orderSheet.delete({
        where: { id },
      });
    });

    return NextResponse.json({ message: 'Order sheet deleted successfully' });
  } catch (error) {
    console.error('Error deleting order sheet:', error);
    return NextResponse.json(
      { error: 'Failed to delete order sheet' },
      { status: 500 }
    );
  }
}
