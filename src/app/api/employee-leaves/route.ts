import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const items = await db.employeeLeave.findMany({
      orderBy: { createdAt: 'desc' },
      include: { employee: true },
    });
    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch employee leaves' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const item = await db.$transaction(async (tx) => {
      return tx.employeeLeave.create({
        data: {
          employeeId: body.employeeId,
          leaveType: body.leaveType,
          fromDate: body.fromDate ? new Date(body.fromDate) : new Date(),
          toDate: body.toDate ? new Date(body.toDate) : new Date(),
          reason: body.reason || null,
          status: body.status || 'Pending',
        },
        include: { employee: true },
      });
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create employee leave' }, { status: 500 });
  }
}
