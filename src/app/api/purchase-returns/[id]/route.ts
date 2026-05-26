import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity, checkPeriodClose } from '@/lib/api-security';

// GET /api/purchase-returns/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'PurchaseReturns', 'GET');
  if (!security.authorized) return security.response;

  // Dealer: completely blocked from purchase return records
  if (security.user?.role === 'dealer') {
    return NextResponse.json({ error: 'Access denied. Dealers cannot access purchase return records.' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const purchaseReturn = await db.purchaseReturn.findUnique({
      where: { id },
      include: {
        purchaseOrder: {
          include: {
            supplier: true,
          },
        },
        supplier: true,
        lines: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!purchaseReturn) {
      return NextResponse.json(
        { error: 'Purchase return not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(purchaseReturn);
  } catch (error) {
    console.error('Error fetching purchase return:', error);
    return NextResponse.json(
      { error: 'Failed to fetch purchase return' },
      { status: 500 }
    );
  }
}

// PUT /api/purchase-returns/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'PurchaseReturns', 'PUT');
  if (!security.authorized) return security.response;

  // Dealer: completely blocked from purchase return records
  if (security.user?.role === 'dealer') {
    return NextResponse.json({ error: 'Access denied. Dealers cannot access purchase return records.' }, { status: 403 });
  }

  // SR: cannot modify purchase returns
  if (security.user?.role === 'sr') {
    return NextResponse.json({ error: 'Access denied. SRs cannot create or modify purchase returns.' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const {
      purchaseOrderId,
      supplierId,
      date,
      discount,
      vatPercentage,
      reason,
      debitNoteCode,
      challanRef,
      status,
      lines,
    } = body;

    // Fetch existing record for status change logic
    const existing = await db.purchaseReturn.findUnique({
      where: { id },
      select: { returnNo: true, status: true, lines: true, date: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Purchase return not found' },
        { status: 404 }
      );
    }

    // Period-close lock check
    const effectiveDate = date || existing.date;
    const periodLock = await checkPeriodClose(effectiveDate);
    if (periodLock) return periodLock;

    // returnNo is immutable
    const result = await db.$transaction(async (tx) => {
      // Process lines if provided
      let processedLines: Array<{
        productId: string;
        quantity: number;
        rate: number;
        discountPercent: number;
        discountAmount: number;
        vatAmount: number;
        total: number;
      }> | null = null;

      if (lines && lines.length > 0) {
        processedLines = lines.map(
          (line: {
            productId: string;
            quantity: number;
            rate: number;
            discountPercent?: number;
            discountAmount?: number;
            vatAmount?: number;
            total: number;
          }) => {
            const lineDiscountPercent = line.discountPercent || 0;
            const lineRate = line.rate || 0;
            const lineQty = line.quantity || 0;
            const lineGross = lineRate * lineQty;
            const lineDiscountAmount = line.discountAmount || Math.round(lineGross * (lineDiscountPercent / 100) * 100) / 100;
            const afterLineDiscount = lineGross - lineDiscountAmount;
            const lineVatAmount = line.vatAmount || 0;
            const lineTotal = Math.round((afterLineDiscount + lineVatAmount) * 100) / 100;

            return {
              productId: line.productId,
              quantity: lineQty,
              rate: lineRate,
              discountPercent: lineDiscountPercent,
              discountAmount: lineDiscountAmount,
              vatAmount: lineVatAmount,
              total: lineTotal,
            };
          }
        );

        // CRITICAL VALIDATION: Validate returnQty against PurchaseOrderLine
        const poId = purchaseOrderId || (await tx.purchaseReturn.findUnique({ where: { id }, select: { purchaseOrderId: true } }))!.purchaseOrderId;

        for (const line of processedLines) {
          const purchaseOrderLine = await tx.purchaseOrderLine.findFirst({
            where: {
              purchaseOrderId: poId,
              productId: line.productId,
            },
          });

          if (!purchaseOrderLine) {
            throw new Error(
              `Product ${line.productId} not found in Purchase Order. Cannot return items that were not part of the original order.`
            );
          }

          if (line.quantity > purchaseOrderLine.quantity) {
            throw new Error(
              `Return quantity (${line.quantity}) exceeds original order quantity (${purchaseOrderLine.quantity}) for product ${line.productId}. Return rejected.`
            );
          }
        }
      }

      // Recalculate subTotal, vatAmount, grandTotal from lines
      let subTotal: number | undefined;
      let headerDiscount: number | undefined;
      let vatPct: number | undefined;
      let vatAmount: number | undefined;
      let grandTotal: number | undefined;

      if (processedLines) {
        subTotal = processedLines.reduce((sum, line) => sum + line.total, 0);
        headerDiscount = discount !== undefined ? discount : 0;
        vatPct = vatPercentage !== undefined ? vatPercentage : 0;
        const afterDiscount = subTotal - headerDiscount;
        vatAmount = Math.round(afterDiscount * (vatPct / 100) * 100) / 100;
        grandTotal = Math.round((afterDiscount + vatAmount) * 100) / 100;
      } else if (discount !== undefined || vatPercentage !== undefined) {
        // Recalculate with existing lines if only header discount/vat changed
        const existingReturn = await tx.purchaseReturn.findUnique({
          where: { id },
          include: { lines: true },
        });
        const existingSubTotal = existingReturn!.lines.reduce((sum, l) => sum + l.total, 0);
        subTotal = existingSubTotal;
        headerDiscount = discount !== undefined ? discount : existingReturn!.discount;
        vatPct = vatPercentage !== undefined ? vatPercentage : existingReturn!.vatPercentage;
        const afterDiscount = existingSubTotal - headerDiscount;
        vatAmount = Math.round(afterDiscount * (vatPct / 100) * 100) / 100;
        grandTotal = Math.round((afterDiscount + vatAmount) * 100) / 100;
      }

      // Replace lines if provided
      if (processedLines) {
        await tx.purchaseReturnLine.deleteMany({
          where: { purchaseReturnId: id },
        });
      }

      // Status change handling
      const newStatus = status || existing.status;

      // If status changes to "Rejected", reverse the StockEntry (create IN entries to undo the decrement)
      if (newStatus === 'Rejected' && existing.status !== 'Rejected') {
        const linesToReverse = processedLines || existing.lines;
        for (const line of linesToReverse) {
          await tx.stockEntry.create({
            data: {
              productId: line.productId,
              godownId: null,
              type: 'IN',
              quantity: line.quantity,
              reference: `${existing.returnNo}-REVERSAL`,
              referenceType: 'PurchaseReturn',
              date: new Date(),
              notes: `Reversal: Purchase Return ${existing.returnNo} rejected`,
            },
          });
        }
      }

      const purchaseReturn = await tx.purchaseReturn.update({
        where: { id },
        data: {
          ...(purchaseOrderId && { purchaseOrderId }),
          ...(supplierId && { supplierId }),
          ...(date && { date: new Date(date) }),
          ...(reason !== undefined && { reason }),
          ...(debitNoteCode !== undefined && { debitNoteCode }),
          ...(challanRef !== undefined && { challanRef }),
          ...(status && { status }),
          ...(subTotal !== undefined && { subTotal }),
          ...(headerDiscount !== undefined && { discount: headerDiscount }),
          ...(vatPct !== undefined && { vatPercentage: vatPct }),
          ...(vatAmount !== undefined && { vatAmount }),
          ...(grandTotal !== undefined && { grandTotal }),
          ...(processedLines && {
            lines: {
              create: processedLines,
            },
          }),
        },
        include: {
          purchaseOrder: { include: { supplier: true } },
          supplier: true,
          lines: { include: { product: true } },
        },
      });

      // Create AuditLog entry for update
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'PurchaseReturns',
          recordId: purchaseReturn.id,
          recordLabel: existing.returnNo,
          details: JSON.stringify({
            previousStatus: existing.status,
            newStatus,
            subTotal,
            discount: headerDiscount,
            vatPercentage: vatPct,
            vatAmount,
            grandTotal,
            statusChanged: existing.status !== newStatus,
            reversed: newStatus === 'Rejected' && existing.status !== 'Rejected',
          }),
        },
      });

      return purchaseReturn;
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Error updating purchase return:', error);
    const message = error instanceof Error ? error.message : 'Failed to update purchase return';
    const status = message.includes('exceeds') || message.includes('not found') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// DELETE /api/purchase-returns/[id] - Soft delete
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'PurchaseReturns', 'DELETE');
  if (!security.authorized) return security.response;

  // Dealer: completely blocked from purchase return records
  if (security.user?.role === 'dealer') {
    return NextResponse.json({ error: 'Access denied. Dealers cannot access purchase return records.' }, { status: 403 });
  }

  // SR: cannot delete purchase returns
  if (security.user?.role === 'sr') {
    return NextResponse.json({ error: 'Access denied. SRs cannot create or modify purchase returns.' }, { status: 403 });
  }

  try {
    const { id } = await params;

    const existing = await db.purchaseReturn.findUnique({
      where: { id },
      select: { returnNo: true, isActive: true, date: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Purchase return not found' },
        { status: 404 }
      );
    }

    if (!existing.isActive) {
      return NextResponse.json(
        { error: 'Purchase return is already deleted' },
        { status: 400 }
      );
    }

    // Period-close lock check
    const periodLock = await checkPeriodClose(existing.date);
    if (periodLock) return periodLock;

    await db.$transaction(async (tx) => {
      await tx.purchaseReturn.update({
        where: { id },
        data: { isActive: false },
      });

      // Create AuditLog entry
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'PurchaseReturns',
          recordId: id,
          recordLabel: existing.returnNo,
          details: JSON.stringify({ softDelete: true }),
        },
      });
    });

    return NextResponse.json({ message: 'Purchase return deleted successfully' });
  } catch (error) {
    console.error('Error deleting purchase return:', error);
    return NextResponse.json(
      { error: 'Failed to delete purchase return' },
      { status: 500 }
    );
  }
}
