import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');

    const where: any = {};
    if (type) {
      where.type = type;
    }

    const items = await db.liability.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { investmentHead: true },
    });
    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch liabilities' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const item = await db.$transaction(async (tx) => {
      return tx.liability.create({
        data: {
          investmentHeadId: body.investmentHeadId,
          date: body.date ? new Date(body.date) : new Date(),
          amount: body.amount,
          type: body.type || 'received',
          paymentMethod: body.paymentMethod || null,
          description: body.description || null,
          isActive: body.isActive ?? true,
        },
        include: { investmentHead: true },
      });
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create liability' }, { status: 500 });
  }
}
