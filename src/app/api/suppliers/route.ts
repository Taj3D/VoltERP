import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const items = await db.supplier.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch suppliers' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const item = await db.$transaction(async (tx) => {
      let supplierCode = body.supplierCode;
      if (!supplierCode) {
        const lastSupplier = await tx.supplier.findFirst({
          orderBy: { createdAt: 'desc' },
          select: { supplierCode: true },
        });
        let nextNum = 1;
        if (lastSupplier?.supplierCode) {
          const match = lastSupplier.supplierCode.match(/SUP-(\d+)/);
          if (match) nextNum = parseInt(match[1]) + 1;
        }
        supplierCode = `SUP-${String(nextNum).padStart(3, '0')}`;
      }

      return tx.supplier.create({
        data: {
          supplierCode,
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
    return NextResponse.json({ error: 'Failed to create supplier' }, { status: 500 });
  }
}
