import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const items = await db.smsLog.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch SMS logs' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const item = await db.$transaction(async (tx) => {
      return tx.smsLog.create({
        data: {
          recipient: body.recipient,
          message: body.message,
          status: body.status || 'Pending',
          sentAt: body.sentAt ? new Date(body.sentAt) : new Date(),
          cost: body.cost ?? 0,
          isActive: body.isActive ?? true,
        },
      });
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create SMS log' }, { status: 500 });
  }
}
