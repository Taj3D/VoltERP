import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Suppliers', 'GET');
  if (!security.authorized) return security.response;
  try {
    const items = await db.supplier.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { purchaseOrders: true, purchaseReturns: true, cashDeliveries: true } },
      },
    });
    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch suppliers' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Suppliers', 'POST');
  if (!security.authorized) return security.response;
  try {
    const body = await request.json();
    const item = await db.$transaction(async (tx) => {
      // Auto-generate code if not provided
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
          email: body.email || null,
          address: body.address || null,
          openingBalance: body.openingBalance ?? 0,
          openingBalanceType: body.openingBalanceType || 'Cr',
          creditLimit: body.creditLimit ?? 0,
          isActive: body.isActive ?? true,
        },
        include: {
          _count: { select: { purchaseOrders: true, purchaseReturns: true, cashDeliveries: true } },
        },
      });
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create supplier' }, { status: 500 });
  }
}
