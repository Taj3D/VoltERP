import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const items = await db.customer.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const item = await db.$transaction(async (tx) => {
      let customerCode = body.customerCode;
      if (!customerCode) {
        const lastCustomer = await tx.customer.findFirst({
          orderBy: { createdAt: 'desc' },
          select: { customerCode: true },
        });
        let nextNum = 1;
        if (lastCustomer?.customerCode) {
          const match = lastCustomer.customerCode.match(/CUST-(\d+)/);
          if (match) nextNum = parseInt(match[1]) + 1;
        }
        customerCode = `CUST-${String(nextNum).padStart(3, '0')}`;
      }

      return tx.customer.create({
        data: {
          customerCode,
          name: body.name,
          phone: body.phone || null,
          address: body.address || null,
          openingBalance: body.openingBalance ?? 0,
          isActive: body.isActive ?? true,
        },
      });
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 });
  }
}
