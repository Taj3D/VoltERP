import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const item = await db.bankTransaction.findUnique({
      where: { id },
      include: { bank: true },
    });
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch bank transaction' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const item = await db.$transaction(async (tx) => {
      return tx.bankTransaction.update({
        where: { id },
        data: {
          bankId: body.bankId,
          date: body.date ? new Date(body.date) : undefined,
          type: body.type,
          amount: body.amount ?? 0,
          description: body.description || null,
          isActive: body.isActive ?? true,
        },
        include: { bank: true },
      });
    });
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update bank transaction' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await db.$transaction(async (tx) => {
      await tx.bankTransaction.delete({ where: { id } });
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete bank transaction' }, { status: 500 });
  }
}
