import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/purchase-returns - List all purchase returns with relations
export async function GET() {
  try {
    const purchaseReturns = await db.purchaseReturn.findMany({
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
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(purchaseReturns);
  } catch (error) {
    console.error('Error fetching purchase returns:', error);
    return NextResponse.json(
      { error: 'Failed to fetch purchase returns' },
      { status: 500 }
    );
  }
}

// POST /api/purchase-returns - Create purchase return with lines
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { purchaseOrderId, supplierId, date, reason, lines } = body;

    if (!purchaseOrderId || !supplierId || !date || !lines || lines.length === 0) {
      return NextResponse.json(
        { error: 'purchaseOrderId, supplierId, date, and lines are required' },
        { status: 400 }
      );
    }

    // Calculate grandTotal from lines
    const grandTotal = lines.reduce(
      (sum: number, line: { total: number }) => sum + (line.total || 0),
      0
    );

    // Auto-generate returnNo
    const lastPR = await db.purchaseReturn.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { returnNo: true },
    });

    let nextNum = 1;
    if (lastPR?.returnNo) {
      const match = lastPR.returnNo.match(/PR-(\d+)/);
      if (match) {
        nextNum = parseInt(match[1], 10) + 1;
      }
    }
    const returnNo = `PR-${String(nextNum).padStart(3, '0')}`;

    const result = await db.$transaction(async (tx) => {
      // Create purchase return with lines
      const purchaseReturn = await tx.purchaseReturn.create({
        data: {
          returnNo,
          purchaseOrderId,
          supplierId,
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
          purchaseOrder: { include: { supplier: true } },
          lines: { include: { product: true } },
        },
      });

      // Create StockEntry (type="OUT") for each line
      for (const line of lines) {
        await tx.stockEntry.create({
          data: {
            productId: line.productId,
            godownId: null,
            type: 'OUT',
            quantity: line.quantity,
            reference: returnNo,
            referenceType: 'PurchaseReturn',
            date: new Date(date),
          },
        });
      }

      return purchaseReturn;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating purchase return:', error);
    return NextResponse.json(
      { error: 'Failed to create purchase return' },
      { status: 500 }
    );
  }
}
