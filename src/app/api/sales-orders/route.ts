import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/sales-orders - List all sales orders with relations
export async function GET() {
  try {
    const salesOrders = await db.salesOrder.findMany({
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
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(salesOrders);
  } catch (error) {
    console.error('Error fetching sales orders:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sales orders' },
      { status: 500 }
    );
  }
}

// POST /api/sales-orders - Create sales order with lines
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customerId, date, godownId, discount, paymentOptionId, notes, lines } =
      body;

    if (!customerId || !date || !lines || lines.length === 0) {
      return NextResponse.json(
        { error: 'customerId, date, and lines are required' },
        { status: 400 }
      );
    }

    // Calculate grandTotal from lines minus discount
    const lineTotal = lines.reduce(
      (sum: number, line: { total: number }) => sum + (line.total || 0),
      0
    );
    const grandTotal = lineTotal - (discount || 0);

    // Auto-generate invoiceNo
    const lastSO = await db.salesOrder.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { invoiceNo: true },
    });

    let nextNum = 1;
    if (lastSO?.invoiceNo) {
      const match = lastSO.invoiceNo.match(/INV-(\d+)/);
      if (match) {
        nextNum = parseInt(match[1], 10) + 1;
      }
    }
    const invoiceNo = `INV-${String(nextNum).padStart(3, '0')}`;

    const result = await db.$transaction(async (tx) => {
      // Create sales order with lines
      const salesOrder = await tx.salesOrder.create({
        data: {
          invoiceNo,
          customerId,
          date: new Date(date),
          godownId: godownId || null,
          discount: discount || 0,
          grandTotal,
          paymentOptionId: paymentOptionId || null,
          notes: notes || null,
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
          customer: true,
          godown: true,
          paymentOption: true,
          lines: { include: { product: true } },
        },
      });

      // Create StockEntry for each line (type="OUT")
      for (const line of lines) {
        await tx.stockEntry.create({
          data: {
            productId: line.productId,
            godownId: godownId || null,
            type: 'OUT',
            quantity: line.quantity,
            reference: invoiceNo,
            referenceType: 'SalesOrder',
            date: new Date(date),
          },
        });
      }

      return salesOrder;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating sales order:', error);
    return NextResponse.json(
      { error: 'Failed to create sales order' },
      { status: 500 }
    );
  }
}
