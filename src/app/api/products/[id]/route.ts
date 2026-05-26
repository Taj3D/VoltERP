import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Products', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const item = await db.product.findUnique({
      where: { id },
      include: {
        category: true,
        color: true,
        godown: true,
        segment: true,
        company: true,
      },
    });
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch product' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Products', 'PUT');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const body = await request.json();
    const item = await db.$transaction(async (tx) => {
      const record = await tx.product.update({
        where: { id },
        data: {
          productCode: body.productCode,
          name: body.name,
          categoryId: body.categoryId,
          colorId: body.colorId || null,
          unit: body.unit || null,
          sizeCapacity: body.sizeCapacity || null,
          costPrice: body.costPrice ?? 0,
          salePrice: body.salePrice ?? 0,
          wholesalePrice: body.wholesalePrice ?? 0,
          dealerPrice: body.dealerPrice ?? 0,
          openingStock: body.openingStock ?? 0,
          reorderLevel: body.reorderLevel ?? 0,
          godownId: body.godownId || null,
          segmentId: body.segmentId || null,
          companyId: body.companyId || null,
          imeiNumber: body.imeiNumber || null,
          image: body.image || null,
          isActive: body.isActive ?? true,
        },
        include: {
          category: true,
          color: true,
          godown: true,
          segment: true,
          company: true,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'Products',
          recordId: record.id,
          recordLabel: record.name || record.productCode || record.id,
          userId: 'system',
          userName: 'System',
          details: JSON.stringify({ productCode: record.productCode, name: record.name }),
        },
      });

      return record;
    });
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Products', 'DELETE');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    await db.$transaction(async (tx) => {
      const record = await tx.product.findUnique({ where: { id } });
      if (!record) throw new Error('Not found');

      // FK check: Check if product is referenced by active transaction lines
      const [
        activePOLines,
        activeSalesLines,
        activeTransferLines,
        activeHireLines,
        activeReplacementLines,
        activeSalesReturnLines,
        activePurchaseReturnLines,
      ] = await Promise.all([
        tx.purchaseOrderLine.count({ where: { productId: id, purchaseOrder: { isActive: true } } }),
        tx.salesOrderLine.count({ where: { productId: id, salesOrder: { isActive: true } } }),
        tx.stockTransferLine.count({ where: { productId: id, stockTransfer: { isActive: true } } }),
        tx.hireSalesLine.count({ where: { productId: id, hireSales: { isActive: true } } }),
        tx.replacementOrderLine.count({ where: { productId: id, replacementOrder: { isActive: true } } }),
        tx.salesReturnLine.count({ where: { productId: id, salesReturn: { isActive: true } } }),
        tx.purchaseReturnLine.count({ where: { productId: id, purchaseReturn: { isActive: true } } }),
      ]);

      const totalRefs = activePOLines + activeSalesLines + activeTransferLines + activeHireLines + activeReplacementLines + activeSalesReturnLines + activePurchaseReturnLines;
      if (totalRefs > 0) {
        throw new Error(
          `Cannot delete: Product is referenced by ${totalRefs} active transaction line(s) across orders, transfers, and returns`
        );
      }

      await tx.product.update({
        where: { id },
        data: { isActive: false },
      });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'Products',
          recordId: record.id,
          recordLabel: record.name || record.productCode || record.id,
          userId: 'system',
          userName: 'System',
          details: JSON.stringify({ productCode: record.productCode, name: record.name, softDelete: true }),
        },
      });

      return record;
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.message?.startsWith('Cannot delete')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 });
  }
}
