import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/sales-returns - List all sales returns with relations
export async function GET() {
  try {
    const salesReturns = await db.salesReturn.findMany({
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
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(salesReturns);
  } catch (error) {
    console.error('Error fetching sales returns:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sales returns' },
      { status: 500 }
    );
  }
}

// POST /api/sales-returns - Create sales return with lines
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { salesOrderId, customerId, date, reason, lines } = body;

    if (!salesOrderId || !customerId || !date || !lines || lines.length === 0) {
      return NextResponse.json(
        { error: 'salesOrderId, customerId, date, and lines are required' },
        { status: 400 }
      );
    }

    // Calculate grandTotal from lines
    const grandTotal = lines.reduce(
      (sum: number, line: { total: number }) => sum + (line.total || 0),
      0
    );

    // Auto-generate returnNo
    const lastSR = await db.salesReturn.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { returnNo: true },
    });

    let nextNum = 1;
    if (lastSR?.returnNo) {
      const match = lastSR.returnNo.match(/SR-(\d+)/);
      if (match) {
        nextNum = parseInt(match[1], 10) + 1;
      }
    }
    const returnNo = `SR-${String(nextNum).padStart(3, '0')}`;

    const result = await db.$transaction(async (tx) => {
      // Create sales return with lines
      const salesReturn = await tx.salesReturn.create({
        data: {
          returnNo,
          salesOrderId,
          customerId,
          date: new Date(date),
          reason: reason || null,
          grandTotal,
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
        },
        include: {
          salesOrder: { include: { customer: true } },
          lines: { include: { product: true } },
        },
      });

      // Create StockEntry (type="IN") for each line
      for (const line of lines) {
        await tx.stockEntry.create({
          data: {
            productId: line.productId,
            godownId: null,
            type: 'IN',
            quantity: line.quantity,
            reference: returnNo,
            referenceType: 'SalesReturn',
            date: new Date(date),
          },
        });
      }

      return salesReturn;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating sales return:', error);
    return NextResponse.json(
      { error: 'Failed to create sales return' },
      { status: 500 }
    );
  }
}
