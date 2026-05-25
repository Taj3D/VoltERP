import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/hire-sales - List all hire sales with relations
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const customerId = searchParams.get('customerId');
    const currentStatus = searchParams.get('currentStatus');

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;
    if (currentStatus) where.currentStatus = currentStatus;

    const hireSales = await db.hireSales.findMany({
      where,
      include: {
        customer: true,
        godown: true,
        lines: {
          include: {
            product: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(hireSales);
  } catch (error) {
    console.error('Error fetching hire sales:', error);
    return NextResponse.json(
      { error: 'Failed to fetch hire sales' },
      { status: 500 }
    );
  }
}

// POST /api/hire-sales - Create hire sale with lines
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      customerId, date, godownId, hireRate, duration, installmentAmount,
      totalPaid, currentStatus, nextPaymentDate, returnDate, notes, lines,
    } = body;

    if (!customerId || !date || !lines || lines.length === 0) {
      return NextResponse.json(
        { error: 'customerId, date, and lines are required' },
        { status: 400 }
      );
    }

    // Calculate grandTotal from lines
    const grandTotal = lines.reduce(
      (sum: number, line: { total: number }) => sum + (line.total || 0),
      0
    );

    // Auto-generate invoiceNo
    const lastHire = await db.hireSales.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { invoiceNo: true },
    });

    let nextNum = 1;
    if (lastHire?.invoiceNo) {
      const match = lastHire.invoiceNo.match(/HIRE-(\d+)/);
      if (match) {
        nextNum = parseInt(match[1], 10) + 1;
      }
    }
    const invoiceNo = `HIRE-${String(nextNum).padStart(3, '0')}`;

    const result = await db.$transaction(async (tx) => {
      // Create hire sale with lines
      const hireSale = await tx.hireSales.create({
        data: {
          invoiceNo,
          customerId,
          date: new Date(date),
          godownId: godownId || null,
          hireRate: hireRate || 0,
          duration: duration || 0,
          installmentAmount: installmentAmount || 0,
          totalPaid: totalPaid || 0,
          currentStatus: currentStatus || 'Active',
          nextPaymentDate: nextPaymentDate ? new Date(nextPaymentDate) : null,
          returnDate: returnDate ? new Date(returnDate) : null,
          grandTotal,
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
          lines: { include: { product: true } },
        },
      });

      // Create StockEntry (type="OUT") for each line
      for (const line of lines) {
        await tx.stockEntry.create({
          data: {
            productId: line.productId,
            godownId: godownId || null,
            type: 'OUT',
            quantity: line.quantity,
            reference: invoiceNo,
            referenceType: 'HireSales',
            date: new Date(date),
          },
        });
      }

      return hireSale;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating hire sale:', error);
    return NextResponse.json(
      { error: 'Failed to create hire sale' },
      { status: 500 }
    );
  }
}
