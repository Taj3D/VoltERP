import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/purchase-orders - List all purchase orders with relations
export async function GET() {
  try {
    const purchaseOrders = await db.purchaseOrder.findMany({
      include: {
        supplier: true,
        godown: true,
        lines: {
          include: {
            product: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(purchaseOrders);
  } catch (error) {
    console.error('Error fetching purchase orders:', error);
    return NextResponse.json(
      { error: 'Failed to fetch purchase orders' },
      { status: 500 }
    );
  }
}

// POST /api/purchase-orders - Create purchase order with lines
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { supplierId, date, godownId, notes, lines } = body;

    if (!supplierId || !date || !lines || lines.length === 0) {
      return NextResponse.json(
        { error: 'supplierId, date, and lines are required' },
        { status: 400 }
      );
    }

    // Calculate grandTotal from lines
    const grandTotal = lines.reduce(
      (sum: number, line: { total: number }) => sum + (line.total || 0),
      0
    );

    // Auto-generate poNumber
    const lastPO = await db.purchaseOrder.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { poNumber: true },
    });

    let nextNum = 1;
    if (lastPO?.poNumber) {
      const match = lastPO.poNumber.match(/PO-(\d+)/);
      if (match) {
        nextNum = parseInt(match[1], 10) + 1;
      }
    }
    const poNumber = `PO-${String(nextNum).padStart(3, '0')}`;

    const result = await db.$transaction(async (tx) => {
      // Create purchase order with lines
      const purchaseOrder = await tx.purchaseOrder.create({
        data: {
          poNumber,
          supplierId,
          date: new Date(date),
          godownId: godownId || null,
          notes: notes || null,
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
          supplier: true,
          godown: true,
          lines: { include: { product: true } },
        },
      });

      // Create StockEntry for each line (type="IN")
      for (const line of lines) {
        await tx.stockEntry.create({
          data: {
            productId: line.productId,
            godownId: godownId || null,
            type: 'IN',
            quantity: line.quantity,
            reference: poNumber,
            referenceType: 'PurchaseOrder',
            date: new Date(date),
          },
        });
      }

      return purchaseOrder;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating purchase order:', error);
    return NextResponse.json(
      { error: 'Failed to create purchase order' },
      { status: 500 }
    );
  }
}
