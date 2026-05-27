import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity, checkPeriodClose } from '@/lib/api-security';

// GET /api/sales-orders/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'SalesOrders', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const salesOrder = await db.salesOrder.findUnique({
      where: { id },
      include: {
        customer: true,
        godown: true,
        paymentOption: true,
        lines: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!salesOrder) {
      return NextResponse.json(
        { error: 'Sales order not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(salesOrder);
  } catch (error) {
    console.error('Error fetching sales order:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sales order' },
      { status: 500 }
    );
  }
}

// PUT /api/sales-orders/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'SalesOrders', 'PUT');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const body = await request.json();
    const { customerId, date, godownId, discount, paymentOptionId, notes, status, vatPercentage, lines } =
      body;

    // Period-close lock check: use request date or existing record's date
    const existing = await db.salesOrder.findUnique({ where: { id }, select: { date: true } });
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
    } else if (discount !== undefined || vatPercentage !== undefined) {
      // If only discount/vat changed, recalculate
      const existingOrder = await db.salesOrder.findUnique({
        where: { id },
        include: { lines: true },
      });
      if (existingOrder) {
        subTotal = existingOrder.lines.reduce((sum, l) => sum + l.total, 0);
        const effectiveDiscount = discount ?? existingOrder.discount;
        const effectiveVatPct = vatPercentage ?? existingOrder.vatPercentage;
        const afterDiscount = subTotal - effectiveDiscount;
        vatAmount = Math.round(afterDiscount * (effectiveVatPct / 100) * 100) / 100;
        grandTotal = Math.round((afterDiscount + vatAmount) * 100) / 100;
      }
    }

    const result = await db.$transaction(async (tx) => {
      // Delete existing lines if lines are provided
      if (lines) {
        await tx.salesOrderLine.deleteMany({
          where: { salesOrderId: id },
        });
      }

      const salesOrder = await tx.salesOrder.update({
        where: { id },
        data: {
          ...(customerId && { customerId }),
          ...(date && { date: new Date(date) }),
          ...(godownId !== undefined && { godownId: godownId || null }),
          ...(discount !== undefined && { discount: totalDiscount }),
          ...(vatPercentage !== undefined && { vatPercentage: vatPct }),
          ...(paymentOptionId !== undefined && { paymentOptionId: paymentOptionId || null }),
          ...(notes !== undefined && { notes }),
          ...(status && { status }),
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
          customer: true,
          godown: true,
          paymentOption: true,
          lines: { include: { product: true } },
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'SalesOrders',
          recordId: id,
          recordLabel: salesOrder.invoiceNo,
          details: JSON.stringify({ status, grandTotal }),
        },
      });

      return salesOrder;
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating sales order:', error);
    return NextResponse.json(
      { error: 'Failed to update sales order' },
      { status: 500 }
    );
  }
}

// DELETE /api/sales-orders/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'SalesOrders', 'DELETE');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;

    // Fetch existing record for validation, period lock, and audit
    const existing = await db.salesOrder.findUnique({
      where: { id },
      select: { date: true, invoiceNo: true, isActive: true, status: true, grandTotal: true, paymentOptionId: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Sales order not found' },
        { status: 404 }
      );
    }

    if (!existing.isActive) {
      return NextResponse.json(
        { error: 'Sales order is already deleted' },
        { status: 400 }
      );
    }

    // Period-close lock check: use existing record's date
    const periodLock = await checkPeriodClose(existing.date || new Date());
    if (periodLock) return periodLock;

    await db.$transaction(async (tx) => {
      // Soft delete the sales order
      await tx.salesOrder.update({
        where: { id },
        data: { isActive: false },
      });

      // NOTE: SalesOrder does not have a direct bankId field, so bank balance
      // reversal cannot be applied here. Bank impact is handled at the
      // CashCollection/CashDelivery level where bankId is available.

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'SalesOrders',
          recordId: id,
          recordLabel: existing.invoiceNo || id,
          details: JSON.stringify({
            softDelete: true,
            previousStatus: existing.status,
            previousGrandTotal: existing.grandTotal,
          }),
        },
      });
    });

    return NextResponse.json({ message: 'Sales order deleted successfully' });
  } catch (error) {
    console.error('Error deleting sales order:', error);
    return NextResponse.json(
      { error: 'Failed to delete sales order' },
      { status: 500 }
    );
  }
}
