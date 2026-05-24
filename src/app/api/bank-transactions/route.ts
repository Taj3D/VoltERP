import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const items = await db.bankTransaction.findMany({
      orderBy: { createdAt: 'desc' },
      include: { bank: true },
    });
    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch bank transactions' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const item = await db.$transaction(async (tx) => {
      return tx.bankTransaction.create({
        data: {
          bankId: body.bankId,
          date: body.date ? new Date(body.date) : new Date(),
          type: body.type,
          amount: body.amount ?? 0,
          description: body.description || null,
          isActive: body.isActive ?? true,
        },
        include: { bank: true },
      });
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create bank transaction' }, { status: 500 });
  }
}
