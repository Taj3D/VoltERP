import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const items = await db.cashDelivery.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        supplier: true,
        paymentOption: true,
        bank: true,
      },
    });
    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch cash deliveries' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const item = await db.$transaction(async (tx) => {
      return tx.cashDelivery.create({
        data: {
          supplierId: body.supplierId,
          date: body.date ? new Date(body.date) : new Date(),
          amount: body.amount ?? 0,
          paymentOptionId: body.paymentOptionId || null,
          bankId: body.bankId || null,
          description: body.description || null,
          isActive: body.isActive ?? true,
        },
        include: {
          supplier: true,
          paymentOption: true,
          bank: true,
        },
      });
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create cash delivery' }, { status: 500 });
  }
}
