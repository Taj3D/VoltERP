import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, maskForVatAuditor, validateImageFields } from '@/lib/api-security';

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

    // VAT Auditor: mask credit limits and opening balances (sensitive margins)
    // SR: mask creditLimit (should not see customer credit limits)
    const maskedItems = items.map(item => {
      if (security.user.role === 'vat_auditor') {
        return maskForVatAuditor(item, security.user.role, ['openingBalance', 'creditLimit']);
      }
      if (security.user.role === 'sr') {
        return maskForVatAuditor(item, security.user.role, ['creditLimit']);
      }
      return item;
    });

    return NextResponse.json(maskedItems);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Customers', 'POST');
  if (!security.authorized) return security.response;
  try {
    const body = await request.json();
    const imgError = validateImageFields(body, ['profileImage', 'nidFrontImage', 'nidBackImage']);
    if (imgError) return NextResponse.json({ error: imgError }, { status: 400 });
    const item = await db.$transaction(async (tx) => {
      // Auto-generate CUS-XXXXX code (5-digit zero-padded)
      let customerCode = body.customerCode;
      if (!customerCode) {
        const lastCustomer = await tx.customer.findFirst({
          orderBy: { createdAt: 'desc' },
          select: { customerCode: true },
        });
        let nextNum = 1;
        if (lastCustomer?.customerCode) {
          const match = lastCustomer.customerCode.match(/CUS-(\d+)/);
          if (match) nextNum = parseInt(match[1]) + 1;
        }
        customerCode = `CUS-${String(nextNum).padStart(5, '0')}`;
      }

      const record = await tx.customer.create({
        data: {
          customerCode,
          name: body.name,
          phone: body.phone || null,
          email: body.email || null,
          address: body.address || null,
          area: body.area || null,
          reference: body.reference || null,
          openingBalance: body.openingBalance ?? 0,
          openingBalanceType: body.openingBalanceType || 'Dr',
          creditLimit: body.creditLimit ?? 0,
          customerType: body.customerType || 'Regular',
          profileImage: body.profileImage || null,
          nidFrontImage: body.nidFrontImage || null,
          nidBackImage: body.nidBackImage || null,
          isActive: body.isActive ?? true,
        },
        include: {
          _count: { select: { salesOrders: true, hireSales: true, cashCollections: true, orderSheets: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'Customers',
          recordId: record.id,
          recordLabel: `${record.customerCode} - ${record.name}`,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ customerCode: record.customerCode, name: record.name, customerType: record.customerType, creditLimit: record.creditLimit }),
        },
      });

      return record;
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 });
  }
}
