import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, maskForVatAuditor, validateImageFields } from '@/lib/api-security';

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

    // VAT Auditor: mask opening balances and credit limits
    const maskedItems = items.map(item => {
      if (security.user.role === 'vat_auditor') {
        return maskForVatAuditor(item, security.user.role, ['openingBalance', 'creditLimit']);
      }
      return item;
    });

    return NextResponse.json(maskedItems);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch suppliers' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Suppliers', 'POST');
  if (!security.authorized) return security.response;
  // SR: blocked from creating suppliers (handled by MODULE_DENY in api-security)
  try {
    const body = await request.json();
    const imgError = validateImageFields(body, ['profileImage', 'nidFrontImage', 'nidBackImage']);
    if (imgError) return NextResponse.json({ error: imgError }, { status: 400 });
    const item = await db.$transaction(async (tx) => {
      // Auto-generate SUP-XXXXX code (5-digit zero-padded)
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
        supplierCode = `SUP-${String(nextNum).padStart(5, '0')}`;
      }

      const record = await tx.supplier.create({
        data: {
          supplierCode,
          name: body.name,
          contactPerson: body.contactPerson || null,
          phone: body.phone || null,
          email: body.email || null,
          address: body.address || null,
          area: body.area || null,
          terms: body.terms || null,
          openingBalance: body.openingBalance ?? 0,
          openingBalanceType: body.openingBalanceType || 'Cr',
          creditLimit: body.creditLimit ?? 0,
          profileImage: body.profileImage || null,
          nidFrontImage: body.nidFrontImage || null,
          nidBackImage: body.nidBackImage || null,
          isActive: body.isActive ?? true,
        },
        include: {
          _count: { select: { purchaseOrders: true, purchaseReturns: true, cashDeliveries: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'Suppliers',
          recordId: record.id,
          recordLabel: `${record.supplierCode} - ${record.name}`,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ supplierCode: record.supplierCode, name: record.name, creditLimit: record.creditLimit }),
        },
      });

      return record;
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create supplier' }, { status: 500 });
  }
}
