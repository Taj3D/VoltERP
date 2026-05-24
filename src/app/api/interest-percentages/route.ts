import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const items = await db.interestPercentage.findMany({ orderBy: { createdAt: 'desc' } });
    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch interest percentages' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const item = await db.$transaction(async (tx) => {
      return tx.interestPercentage.create({
        data: {
          percentage: body.percentage,
          effectiveDate: body.effectiveDate ? new Date(body.effectiveDate) : new Date(),
          isActive: body.isActive ?? true,
        },
      });
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create interest percentage' }, { status: 500 });
  }
}
