import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, maskForVatAuditor, validateImageFields } from '@/lib/api-security';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Customers', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const item = await db.customer.findUnique({
      where: { id },
      include: {
        _count: { select: { salesOrders: true, hireSales: true, cashCollections: true, orderSheets: true } },
      },
    });
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const masked = security.user.role === 'vat_auditor'
      ? maskForVatAuditor(item, security.user.role, ['openingBalance', 'creditLimit'])
      : item;

    return NextResponse.json(masked);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch customer' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Customers', 'PUT');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const body = await request.json();
    const imgError = validateImageFields(body, ['profileImage', 'nidFrontImage', 'nidBackImage']);
    if (imgError) return NextResponse.json({ error: imgError }, { status: 400 });
    const item = await db.$transaction(async (tx) => {
      const record = await tx.customer.update({
        where: { id },
        data: {
          customerCode: body.customerCode,
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
          action: 'UPDATE',
          module: 'Customers',
          recordId: record.id,
          recordLabel: `${record.customerCode} - ${record.name}`,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ customerCode: record.customerCode, name: record.name }),
        },
      });

      return record;
    });
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update customer' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Customers', 'DELETE');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    await db.$transaction(async (tx) => {
      const record = await tx.customer.findUnique({ where: { id } });
      if (!record) throw new Error('Not found');

      // Check for active references
      const [salesOrders, hireSales, cashCollections, orderSheets] = await Promise.all([
        tx.salesOrder.count({ where: { customerId: id } }),
        tx.hireSales.count({ where: { customerId: id } }),
        tx.cashCollection.count({ where: { customerId: id } }),
        tx.orderSheet.count({ where: { customerId: id } }),
      ]);

      if (salesOrders + hireSales + cashCollections + orderSheets > 0) {
        throw new Error(`Cannot delete: Customer has ${salesOrders} sales order(s), ${hireSales} hire sale(s), ${cashCollections} cash collection(s), ${orderSheets} order sheet(s)`);
      }

      await tx.customer.delete({ where: { id } });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'Customers',
          recordId: record.id,
          recordLabel: `${record.customerCode} - ${record.name}`,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ customerCode: record.customerCode, name: record.name, hardDelete: true }),
        },
      });

      return record;
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.message?.startsWith('Cannot delete')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to delete customer' }, { status: 500 });
  }
}
