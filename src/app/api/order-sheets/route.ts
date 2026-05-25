import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/order-sheets - List all order sheets with relations
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    const customerId = searchParams.get('customerId');
    const status = searchParams.get('status');

    const where: any = {};
    if (companyId) where.companyId = companyId;
    if (customerId) where.customerId = customerId;
    if (status) where.status = status;

    const orderSheets = await db.orderSheet.findMany({
      where,
      include: {
        company: true,
        customer: true,
        lines: {
          include: {
            product: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(orderSheets);
  } catch (error) {
    console.error('Error fetching order sheets:', error);
    return NextResponse.json(
      { error: 'Failed to fetch order sheets' },
      { status: 500 }
    );
  }
}

// POST /api/order-sheets - Create order sheet with lines
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date, notes, companyId, customerId, lines } = body;

    if (!date || !lines || lines.length === 0) {
      return NextResponse.json(
        { error: 'date and lines are required' },
        { status: 400 }
      );
    }

    // Auto-generate sheetNo
    const lastSheet = await db.orderSheet.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { sheetNo: true },
    });

    let nextNum = 1;
    if (lastSheet?.sheetNo) {
      const match = lastSheet.sheetNo.match(/OS-(\d+)/);
      if (match) {
        nextNum = parseInt(match[1], 10) + 1;
    }
    }
    const sheetNo = `OS-${String(nextNum).padStart(3, '0')}`;

    const result = await db.$transaction(async (tx) => {
      const orderSheet = await tx.orderSheet.create({
        data: {
          sheetNo,
          companyId: companyId || null,
          customerId: customerId || null,
          date: new Date(date),
          notes: notes || null,
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
        },
        include: {
          company: true,
          customer: true,
          lines: { include: { product: true } },
        },
      });

      return orderSheet;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating order sheet:', error);
    return NextResponse.json(
      { error: 'Failed to create order sheet' },
      { status: 500 }
    );
  }
}
