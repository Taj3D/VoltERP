import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/hire-sales/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const hireSale = await db.hireSales.findUnique({
      where: { id },
      include: {
        customer: true,
        godown: true,
        lines: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!hireSale) {
      return NextResponse.json(
        { error: 'Hire sale not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(hireSale);
  } catch (error) {
    console.error('Error fetching hire sale:', error);
    return NextResponse.json(
      { error: 'Failed to fetch hire sale' },
      { status: 500 }
    );
  }
}

// PUT /api/hire-sales/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      customerId, date, godownId, hireRate, duration, installmentAmount,
      totalPaid, currentStatus, nextPaymentDate, returnDate, notes, status,
      lines,
    } = body;

    // Calculate grandTotal from lines if provided
    const grandTotal = lines
      ? lines.reduce(
          (sum: number, line: { total: number }) => sum + (line.total || 0),
          0
        )
      : undefined;

    const result = await db.$transaction(async (tx) => {
      if (lines) {
        await tx.hireSalesLine.deleteMany({
          where: { hireSalesId: id },
        });
      }

      const hireSale = await tx.hireSales.update({
        where: { id },
        data: {
          ...(customerId && { customerId }),
          ...(date && { date: new Date(date) }),
          ...(godownId !== undefined && { godownId: godownId || null }),
          ...(hireRate !== undefined && { hireRate }),
          ...(duration !== undefined && { duration }),
          ...(installmentAmount !== undefined && { installmentAmount }),
          ...(totalPaid !== undefined && { totalPaid }),
          ...(currentStatus !== undefined && { currentStatus }),
          ...(nextPaymentDate !== undefined && {
            nextPaymentDate: nextPaymentDate ? new Date(nextPaymentDate) : null,
          }),
          ...(returnDate !== undefined && {
            returnDate: returnDate ? new Date(returnDate) : null,
          }),
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
          lines: { include: { product: true } },
        },
      });

      return hireSale;
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating hire sale:', error);
    return NextResponse.json(
      { error: 'Failed to update hire sale' },
      { status: 500 }
    );
  }
}

// DELETE /api/hire-sales/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await db.$transaction(async (tx) => {
      await tx.hireSalesLine.deleteMany({
        where: { hireSalesId: id },
      });

      await tx.hireSales.delete({
        where: { id },
      });
    });

    return NextResponse.json({ message: 'Hire sale deleted successfully' });
  } catch (error) {
    console.error('Error deleting hire sale:', error);
    return NextResponse.json(
      { error: 'Failed to delete hire sale' },
      { status: 500 }
    );
  }
}
