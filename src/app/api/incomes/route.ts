import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const items = await db.income.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        head: true,
        paymentOption: true,
        bank: true,
      },
    });
    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch incomes' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const item = await db.$transaction(async (tx) => {
      return tx.income.create({
        data: {
          date: body.date ? new Date(body.date) : new Date(),
          headId: body.headId,
          amount: body.amount ?? 0,
          paymentOptionId: body.paymentOptionId || null,
          bankId: body.bankId || null,
          description: body.description || null,
          isActive: body.isActive ?? true,
        },
        include: {
          head: true,
          paymentOption: true,
          bank: true,
        },
      });
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create income' }, { status: 500 });
  }
}
