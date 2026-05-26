import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Godowns', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const item = await db.godown.findUnique({ where: { id } });
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Godowns', 'PUT');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const body = await request.json();
    const item = await db.$transaction(async (tx) => {
      const record = await tx.godown.update({
        where: { id },
        data: {
          name: body.name,
          address: body.address || null,
          inCharge: body.inCharge || null,
          isActive: body.isActive ?? true,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'Godowns',
          recordId: record.id,
          recordLabel: record.name || record.id,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ name: record.name }),
        },
      });

      return record;
    });
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Godowns', 'DELETE');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    await db.$transaction(async (tx) => {
      const record = await tx.godown.findUnique({ where: { id } });
      if (!record) throw new Error('Not found');

      // FK check: Check if godown is referenced by active records
      const [
        activeProducts,
        activePurchaseOrders,
        activeSalesOrders,
        activeHireSales,
        activeSalesReturns,
        activeTransfersFrom,
        activeTransfersTo,
      ] = await Promise.all([
        tx.product.count({ where: { godownId: id, isActive: true } }),
        tx.purchaseOrder.count({ where: { godownId: id, isActive: true } }),
        tx.salesOrder.count({ where: { godownId: id, isActive: true } }),
        tx.hireSales.count({ where: { godownId: id, isActive: true } }),
        tx.salesReturn.count({ where: { godownId: id, isActive: true } }),
        tx.stockTransfer.count({ where: { fromGodownId: id, isActive: true } }),
        tx.stockTransfer.count({ where: { toGodownId: id, isActive: true } }),
      ]);

      const totalRefs = activeProducts + activePurchaseOrders + activeSalesOrders + activeHireSales + activeSalesReturns + activeTransfersFrom + activeTransfersTo;
      if (totalRefs > 0) {
        throw new Error(
          `Cannot delete: Godown is referenced by ${activeProducts} product(s), ${activePurchaseOrders} PO(s), ${activeSalesOrders} SO(s), ${activeHireSales} hire sale(s), ${activeSalesReturns} return(s), ${activeTransfersFrom + activeTransfersTo} transfer(s)`
        );
      }

      await tx.godown.update({
        where: { id },
        data: { isActive: false },
      });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'Godowns',
          recordId: record.id,
          recordLabel: record.name || record.id,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ name: record.name, softDelete: true }),
        },
      });

      return record;
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.message?.startsWith('Cannot delete')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
