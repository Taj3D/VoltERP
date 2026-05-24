import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const item = await db.cashDelivery.findUnique({
      where: { id },
      include: {
        supplier: true,
        paymentOption: true,
        bank: true,
      },
    });
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch cash delivery' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const item = await db.$transaction(async (tx) => {
      return tx.cashDelivery.update({
        where: { id },
        data: {
          supplierId: body.supplierId,
          date: body.date ? new Date(body.date) : undefined,
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
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update cash delivery' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await db.$transaction(async (tx) => {
      await tx.cashDelivery.delete({ where: { id } });
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete cash delivery' }, { status: 500 });
  }
}
