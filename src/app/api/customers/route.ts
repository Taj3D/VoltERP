import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Customers', 'GET');
  if (!security.authorized) return security.response;
  try {
    const items = await db.customer.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { salesOrders: true, hireSales: true, cashCollections: true, orderSheets: true } },
      },
    });
    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Customers', 'POST');
  if (!security.authorized) return security.response;
  try {
    const body = await request.json();
    const item = await db.$transaction(async (tx) => {
      // Auto-generate code if not provided
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
          email: body.email || null,
          address: body.address || null,
          openingBalance: body.openingBalance ?? 0,
          openingBalanceType: body.openingBalanceType || 'Dr',
          creditLimit: body.creditLimit ?? 0,
          customerType: body.customerType || 'Regular',
          isActive: body.isActive ?? true,
        },
        include: {
          _count: { select: { salesOrders: true, hireSales: true, cashCollections: true, orderSheets: true } },
        },
      });
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 });
  }
}
