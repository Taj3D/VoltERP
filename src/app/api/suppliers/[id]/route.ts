import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, maskForVatAuditor, validateImageFields } from '@/lib/api-security';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Suppliers', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const item = await db.supplier.findUnique({
      where: { id },
      include: {
        _count: { select: { purchaseOrders: true, purchaseReturns: true, cashDeliveries: true } },
      },
    });
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const masked = security.user.role === 'vat_auditor'
      ? maskForVatAuditor(item, security.user.role, ['openingBalance', 'creditLimit'])
      : item;

    return NextResponse.json(masked);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch supplier' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Suppliers', 'PUT');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const body = await request.json();
    const imgError = validateImageFields(body, ['profileImage', 'nidFrontImage', 'nidBackImage']);
    if (imgError) return NextResponse.json({ error: imgError }, { status: 400 });
    const item = await db.$transaction(async (tx) => {
      const record = await tx.supplier.update({
        where: { id },
        data: {
          supplierCode: body.supplierCode,
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
          action: 'UPDATE',
          module: 'Suppliers',
          recordId: record.id,
          recordLabel: `${record.supplierCode} - ${record.name}`,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ supplierCode: record.supplierCode, name: record.name }),
        },
      });

      return record;
    });
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update supplier' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Suppliers', 'DELETE');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    await db.$transaction(async (tx) => {
      const record = await tx.supplier.findUnique({ where: { id } });
      if (!record) throw new Error('Not found');

      // Check for active references
      const [purchaseOrders, purchaseReturns, cashDeliveries] = await Promise.all([
        tx.purchaseOrder.count({ where: { supplierId: id } }),
        tx.purchaseReturn.count({ where: { supplierId: id } }),
        tx.cashDelivery.count({ where: { supplierId: id } }),
      ]);

      if (purchaseOrders + purchaseReturns + cashDeliveries > 0) {
        throw new Error(`Cannot delete: Supplier has ${purchaseOrders} purchase order(s), ${purchaseReturns} purchase return(s), ${cashDeliveries} cash deliver(ies)`);
      }

      await tx.supplier.delete({ where: { id } });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'Suppliers',
          recordId: record.id,
          recordLabel: `${record.supplierCode} - ${record.name}`,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ supplierCode: record.supplierCode, name: record.name, hardDelete: true }),
        },
      });

      return record;
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.message?.startsWith('Cannot delete')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to delete supplier' }, { status: 500 });
  }
}
