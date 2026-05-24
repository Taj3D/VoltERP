import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const item = await db.employeeLeave.findUnique({
      where: { id },
      include: { employee: true },
    });
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch employee leave' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const item = await db.$transaction(async (tx) => {
      return tx.employeeLeave.update({
        where: { id },
        data: {
          employeeId: body.employeeId,
          leaveType: body.leaveType,
          fromDate: body.fromDate ? new Date(body.fromDate) : undefined,
          toDate: body.toDate ? new Date(body.toDate) : undefined,
          reason: body.reason || null,
          status: body.status,
        },
        include: { employee: true },
      });
    });
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update employee leave' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await db.$transaction(async (tx) => {
      await tx.employeeLeave.delete({ where: { id } });
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete employee leave' }, { status: 500 });
  }
}
