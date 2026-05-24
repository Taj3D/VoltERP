import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/transfers - List all stock transfers with relations
export async function GET() {
  try {
    const transfers = await db.stockTransfer.findMany({
      include: {
        fromGodown: true,
        toGodown: true,
        lines: {
          include: {
            product: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(transfers);
  } catch (error) {
    console.error('Error fetching transfers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transfers' },
      { status: 500 }
    );
  }
}

// POST /api/transfers - Create stock transfer with lines
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fromGodownId, toGodownId, date, notes, lines } = body;

    if (!fromGodownId || !toGodownId || !date || !lines || lines.length === 0) {
      return NextResponse.json(
        { error: 'fromGodownId, toGodownId, date, and lines are required' },
        { status: 400 }
      );
    }

    // Auto-generate transferNo
    const lastTransfer = await db.stockTransfer.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { transferNo: true },
    });

    let nextNum = 1;
    if (lastTransfer?.transferNo) {
      const match = lastTransfer.transferNo.match(/TRF-(\d+)/);
      if (match) {
        nextNum = parseInt(match[1], 10) + 1;
      }
    }
    const transferNo = `TRF-${String(nextNum).padStart(3, '0')}`;

    const result = await db.$transaction(async (tx) => {
      // Create stock transfer with lines
      const transfer = await tx.stockTransfer.create({
        data: {
          transferNo,
          fromGodownId,
          toGodownId,
          date: new Date(date),
          notes: notes || null,
          lines: {
            create: lines.map(
              (line: {
                productId: string;
                quantity: number;
              }) => ({
                productId: line.productId,
                quantity: line.quantity,
              })
            ),
          },
        },
        include: {
          fromGodown: true,
          toGodown: true,
          lines: { include: { product: true } },
        },
      });

      // Create two StockEntry per line: OUT from fromGodown, IN to toGodown
      for (const line of lines) {
        // OUT entry from source godown
        await tx.stockEntry.create({
          data: {
            productId: line.productId,
            godownId: fromGodownId,
            type: 'OUT',
            quantity: line.quantity,
            reference: transferNo,
            referenceType: 'Transfer',
            date: new Date(date),
          },
        });

        // IN entry to destination godown
        await tx.stockEntry.create({
          data: {
            productId: line.productId,
            godownId: toGodownId,
            type: 'IN',
            quantity: line.quantity,
            reference: transferNo,
            referenceType: 'Transfer',
            date: new Date(date),
          },
        });
      }

      return transfer;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating transfer:', error);
    return NextResponse.json(
      { error: 'Failed to create transfer' },
      { status: 500 }
    );
  }
}
