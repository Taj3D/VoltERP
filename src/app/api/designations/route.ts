import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const items = await db.designation.findMany({
      orderBy: { createdAt: 'desc' },
      include: { department: true },
    });
    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch designations' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const item = await db.$transaction(async (tx) => {
      return tx.designation.create({
        data: {
          name: body.name,
          departmentId: body.departmentId,
          isActive: body.isActive ?? true,
        },
        include: { department: true },
      });
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create designation' }, { status: 500 });
  }
}
