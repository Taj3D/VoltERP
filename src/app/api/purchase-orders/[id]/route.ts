import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity, checkPeriodClose } from '@/lib/api-security';

// GET /api/purchase-orders/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'PurchaseOrders', 'GET');
  if (!security.authorized) return security.response;

  // Dealer: completely blocked from purchase order records
  if (security.user?.role === 'dealer') {
    return NextResponse.json({ error: 'Access denied. Dealers cannot access purchase order records.' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const purchaseOrder = await db.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        godown: true,
        lines: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!purchaseOrder) {
      return NextResponse.json(
        { error: 'Purchase order not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(purchaseOrder);
  } catch (error) {
    console.error('Error fetching purchase order:', error);
    return NextResponse.json(
      { error: 'Failed to fetch purchase order' },
      { status: 500 }
    );
  }
}

// PUT /api/purchase-orders/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'PurchaseOrders', 'PUT');
  if (!security.authorized) return security.response;

  // Dealer: completely blocked from purchase order records
  if (security.user?.role === 'dealer') {
    return NextResponse.json({ error: 'Access denied. Dealers cannot access purchase order records.' }, { status: 403 });
  }

  // SR: cannot approve/modify purchase orders
  if (security.user?.role === 'sr') {
    return NextResponse.json({ error: 'Access denied. SRs cannot approve or modify purchase orders.' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { supplierId, date, godownId, notes, status, discount, vatPercentage, lines } = body;

    // Period-close lock check: use request date or existing record's date
    const existing = await db.purchaseOrder.findUnique({ where: { id }, select: { date: true } });
    const periodLock = await checkPeriodClose(date ? new Date(date) : existing?.date || new Date());
    if (periodLock) return periodLock;

    // Calculate totals from lines if provided (with server-side hardening)
    let subTotal: number | undefined;
    let vatAmount: number | undefined;
    let grandTotal: number | undefined;
    let processedLines: any[] | undefined;
    const totalDiscount = discount ?? 0;
    const vatPct = vatPercentage ?? 0;

    if (lines) {
      processedLines = lines.map((line: any) => {
        const lineQty = Number(line.quantity) || 0;
        const lineRate = Number(line.rate) || 0;
        const lineDiscPct = Number(line.discountPercent) || 0;
        const lineDiscAmt = Number(line.discountAmount) || Math.round(lineQty * lineRate * (lineDiscPct / 100) * 100) / 100;
        const lineGross = Math.round(lineQty * lineRate * 100) / 100;
        const afterLineDisc = Math.round((lineGross - lineDiscAmt) * 100) / 100;
        const lineVatAmt = Number(line.vatAmount) || 0;
        const lineTotal = Math.round((afterLineDisc + lineVatAmt) * 100) / 100;
        return {
          productId: line.productId,
          quantity: lineQty,
          rate: lineRate,
          discountPercent: lineDiscPct,
          discountAmount: lineDiscAmt,
          vatAmount: lineVatAmt,
          total: lineTotal,
        };
      });
      subTotal = Math.round(processedLines.reduce((sum, l) => sum + l.total, 0) * 100) / 100;
      const afterDiscount = subTotal - totalDiscount;
      vatAmount = Math.round(afterDiscount * (vatPct / 100) * 100) / 100;
      grandTotal = Math.round((afterDiscount + vatAmount) * 100) / 100;
    }

    const result = await db.$transaction(async (tx) => {
      // Delete existing lines if lines are provided
      if (lines) {
        await tx.purchaseOrderLine.deleteMany({
          where: { purchaseOrderId: id },
        });
      }

      const purchaseOrder = await tx.purchaseOrder.update({
        where: { id },
        data: {
          ...(supplierId && { supplierId }),
          ...(date && { date: new Date(date) }),
          ...(godownId !== undefined && { godownId: godownId || null }),
          ...(notes !== undefined && { notes }),
          ...(status && { status }),
          ...(discount !== undefined && { discount: totalDiscount }),
          ...(vatPercentage !== undefined && { vatPercentage: vatPct }),
          ...(subTotal !== undefined && { subTotal }),
          ...(vatAmount !== undefined && { vatAmount }),
          ...(grandTotal !== undefined && { grandTotal }),
          ...(processedLines && {
            lines: {
              create: processedLines.map((line) => ({
                productId: line.productId,
                quantity: line.quantity,
                rate: line.rate,
                discountPercent: line.discountPercent,
                discountAmount: line.discountAmount,
                vatAmount: line.vatAmount,
                total: line.total,
              })),
            },
          }),
        },
        include: {
          supplier: true,
          godown: true,
          lines: { include: { product: true } },
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'PurchaseOrders',
          recordId: id,
          recordLabel: purchaseOrder.poNumber,
          details: JSON.stringify({ status, grandTotal }),
        },
      });

      return purchaseOrder;
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating purchase order:', error);
    return NextResponse.json(
      { error: 'Failed to update purchase order' },
      { status: 500 }
    );
  }
}

// DELETE /api/purchase-orders/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'PurchaseOrders', 'DELETE');
  if (!security.authorized) return security.response;

  // Dealer: completely blocked from purchase order records
  if (security.user?.role === 'dealer') {
    return NextResponse.json({ error: 'Access denied. Dealers cannot access purchase order records.' }, { status: 403 });
  }

  // SR: cannot delete purchase orders
  if (security.user?.role === 'sr') {
    return NextResponse.json({ error: 'Access denied. SRs cannot delete purchase orders.' }, { status: 403 });
  }

  try {
    const { id } = await params;

    // Period-close lock check: use existing record's date
    const existing = await db.purchaseOrder.findUnique({ where: { id }, select: { date: true } });
    const periodLock = await checkPeriodClose(existing?.date || new Date());
    if (periodLock) return periodLock;

    await db.$transaction(async (tx) => {
      // Get PO number for audit
      const po = await tx.purchaseOrder.findUnique({ where: { id }, select: { poNumber: true } });

      // Delete lines first (cascade should handle this, but be explicit)
      await tx.purchaseOrderLine.deleteMany({
        where: { purchaseOrderId: id },
      });

      await tx.purchaseOrder.delete({
        where: { id },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'PurchaseOrders',
          recordId: id,
          recordLabel: po?.poNumber || id,
        },
      });
    });

    return NextResponse.json({ message: 'Purchase order deleted successfully' });
  } catch (error) {
    console.error('Error deleting purchase order:', error);
    return NextResponse.json(
      { error: 'Failed to delete purchase order' },
      { status: 500 }
    );
  }
}
