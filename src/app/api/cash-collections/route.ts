import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const items = await db.cashCollection.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        customer: true,
        paymentOption: true,
        bank: true,
      },
    });
    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch cash collections' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const item = await db.$transaction(async (tx) => {
      return tx.cashCollection.create({
        data: {
          customerId: body.customerId,
          date: body.date ? new Date(body.date) : new Date(),
          amount: body.amount ?? 0,
          paymentOptionId: body.paymentOptionId || null,
          bankId: body.bankId || null,
          description: body.description || null,
          isActive: body.isActive ?? true,
        },
        include: {
          customer: true,
          paymentOption: true,
          bank: true,
        },
      });
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create cash collection' }, { status: 500 });
  }
}
