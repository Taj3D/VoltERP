import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  checkPeriodClose,
  maskOrderWithLinesForVatAuditor,
  safeFinancialRound,
  safeFinancialAdd,
  safeFinancialSubtract,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// ============================================================
// SHARED: Compute current stock for a product
// currentStock = product.openingStock + sum(IN entries) - sum(OUT entries)
// ============================================================

async function computeCurrentStock(
  tx: any,
  productId: string,
  godownId?: string
): Promise<number> {
  const product = await tx.product.findUnique({
    where: { id: productId },
    select: { openingStock: true },
  });
  if (!product) return 0;

  const stockEntries = await tx.stockEntry.findMany({
    where: {
      productId,
      ...(godownId ? { godownId } : {}),
    },
    select: { type: true, quantity: true },
  });

  const stockDelta = stockEntries.reduce(
    (sum: number, e: { type: string; quantity: number }) =>
      sum + (e.type === 'IN' ? e.quantity : -e.quantity),
    0
  );

  return safeFinancialRound(product.openingStock + stockDelta);
}

// ============================================================
// SHARED: Line-level Financial Computation
// ============================================================

interface POLineInput {
  productId: string;
  quantity: number;
  rate: number;
  discountPercent?: number;
  vatPercentage?: number;
  receivedQuantity?: number;
  notes?: string;
}

interface ComputedPOLine {
  productId: string;
  quantity: number;
  rate: number;
  discountPercent: number;
  discountAmount: number;
  vatAmount: number;
  total: number;
  receivedQuantity: number;
  pendingQuantity: number;
  availableStock: number;
  stockStatus: string;
  notes: string | null;
}

function computeLineFinancials(
  line: POLineInput,
  availableStock: number
): ComputedPOLine {
  const lineGross = safeFinancialRound(line.quantity * line.rate);
  const discountPercent = line.discountPercent ?? 0;
  const discountAmount = safeFinancialRound(lineGross * (discountPercent / 100));
  const afterDiscount = safeFinancialSubtract(lineGross, discountAmount);
  const vatPercentage = line.vatPercentage ?? 0;
  const vatAmount = safeFinancialRound(afterDiscount * (vatPercentage / 100));
  const total = safeFinancialAdd(afterDiscount, vatAmount);

  const receivedQty = line.receivedQuantity ?? 0;
  const pendingQty = safeFinancialRound(line.quantity - receivedQty);

  // Determine stock status
  let stockStatus: string;
  if (availableStock <= 0) {
    stockStatus = 'Out of Stock';
  } else if (availableStock < line.quantity) {
    stockStatus = 'Low';
  } else {
    stockStatus = 'Available';
  }

  return {
    productId: line.productId,
    quantity: line.quantity,
    rate: line.rate,
    discountPercent,
    discountAmount,
    vatAmount,
    total,
    receivedQuantity: receivedQty,
    pendingQuantity: pendingQty,
    availableStock,
    stockStatus,
    notes: line.notes || null,
  };
}

// ============================================================
// SHARED: Order-level Financial Computation
// ============================================================

function computeOrderFinancials(
  computedLines: ComputedPOLine[],
  discountPercent: number,
  vatPercentage: number
) {
  const subTotal = computedLines.reduce(
    (sum, l) => safeFinancialAdd(sum, l.total),
    0
  );
  const discount = safeFinancialRound(subTotal * (discountPercent / 100));
  const afterDiscount = safeFinancialSubtract(subTotal, discount);
  const vatAmount = safeFinancialRound(afterDiscount * (vatPercentage / 100));
  const grandTotal = safeFinancialAdd(afterDiscount, vatAmount);

  return { subTotal, discount, vatAmount, grandTotal };
}

// ============================================================
// GET /api/purchase-orders/[id] — Get single PO with all relations
// ============================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'PurchaseOrders', 'GET');
  if (!security.authorized) return security.response;

  // Dealer: completely blocked from purchase order records
  if (security.user.role === 'dealer') {
    return NextResponse.json(
      { error: 'Access denied. Dealers cannot access purchase order records.' },
      { status: 403 }
    );
  }

  // SR: blocked from purchase order records
  if (security.user.role === 'sr') {
    return NextResponse.json(
      { error: 'Access denied. SRs cannot access purchase order records.' },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;

    const purchaseOrder = await db.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        godown: true,
        company: true,
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

    if (!purchaseOrder.isActive) {
      return NextResponse.json(
        { error: 'Purchase order has been deleted' },
        { status: 410 }
      );
    }

    // VAT Auditor masking (including line items)
    const masked = maskOrderWithLinesForVatAuditor(
      purchaseOrder as Record<string, unknown>,
      security.user.role
    );

    return NextResponse.json(masked);
  } catch (error) {
    console.error('[PurchaseOrders] GET /[id] error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch purchase order' },
      { status: 500 }
    );
  }
}

// ============================================================
// PUT /api/purchase-orders/[id] — Update PO with new fields
// ============================================================

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'PurchaseOrders', 'PUT');
  if (!security.authorized) return security.response;

  // Dealer: completely blocked from purchase order records
  if (security.user.role === 'dealer') {
    return NextResponse.json(
      { error: 'Access denied. Dealers cannot access purchase order records.' },
      { status: 403 }
    );
  }

  // SR: cannot modify purchase orders
  if (security.user.role === 'sr') {
    return NextResponse.json(
      { error: 'Access denied. SRs cannot modify purchase orders.' },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const {
      supplierId,
      date,
      godownId,
      notes,
      status,
      discount,
      discountPercent,
      vatPercentage,
      expectedDate,
      receivedDate,
      lines,
    } = body;

    // Fetch existing record for validation and audit
    const existing = await db.purchaseOrder.findUnique({
      where: { id },
      include: {
        lines: true,
        supplier: true,
        godown: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Purchase order not found' },
        { status: 404 }
      );
    }

    if (!existing.isActive) {
      return NextResponse.json(
        { error: 'Cannot update a deleted purchase order' },
        { status: 400 }
      );
    }

    // Validate status transition if status is being changed
    const newStatus = status || existing.status;
    const validTransitions: Record<string, string[]> = {
      Draft: ['Confirmed', 'Cancelled'],
      Confirmed: ['Received', 'Cancelled'],
      Received: ['Cancelled'],
      'Partially Received': ['Received', 'Cancelled'],
      Cancelled: [],
    };

    if (status && status !== existing.status) {
      const allowed = validTransitions[existing.status] || [];
      if (!allowed.includes(status)) {
        return NextResponse.json(
          {
            error: `Invalid status transition from "${existing.status}" to "${status}". Allowed transitions: ${allowed.join(', ') || 'none'}`,
          },
          { status: 400 }
        );
      }
    }

    // Period close check: use the request date or existing record's date
    const effectiveDate = date ? new Date(date) : existing.date;
    const periodLock = await checkPeriodClose(effectiveDate);
    if (periodLock) return periodLock;

    // Godown SUSPENDED status check
    if (godownId !== undefined && godownId !== null) {
      const targetGodown = await db.godown.findUnique({
        where: { id: godownId },
        select: { id: true, name: true, status: true, isActive: true },
      });
      if (!targetGodown || !targetGodown.isActive) {
        return NextResponse.json(
          { error: 'Destination warehouse not found or is inactive' },
          { status: 400 }
        );
      }
      if (targetGodown.status === 'SUSPENDED') {
        return NextResponse.json(
          {
            error: `EMERGENCY CLOSURE: Warehouse "${targetGodown.name}" is SUSPENDED. All receipt orders to this location are blocked until reactivated.`,
          },
          { status: 403 }
        );
      }
    }

    // ── Transaction: update with recalculation ──
    const result = await db.$transaction(async (tx) => {
      let computedLines: ComputedPOLine[] | undefined;
      let newSubTotal: number | undefined;
      let newDiscount: number | undefined;
      let newVatAmount: number | undefined;
      let newGrandTotal: number | undefined;
      let newFulfillmentStatus: string | undefined;
      let newReceivingStatus: string | undefined;

      const orderDiscountPercent = discountPercent !== undefined
        ? Number(discountPercent)
        : existing.discountPercent;
      const orderVatPercentage = vatPercentage !== undefined
        ? Number(vatPercentage)
        : existing.vatPercentage;

      // If lines are provided, recalculate everything
      if (lines && Array.isArray(lines)) {
        computedLines = [];
        for (const line of lines) {
          if (!line.productId) {
            throw Object.assign(new Error('VALIDATION_ERROR'), {
              validationError: 'Each line must have a productId',
            });
          }

          const product = await tx.product.findUnique({
            where: { id: line.productId },
            select: { id: true, openingStock: true },
          });

          if (!product) {
            throw Object.assign(new Error('VALIDATION_ERROR'), {
              validationError: `Product with ID "${line.productId}" not found`,
            });
          }

          const currentStock = await computeCurrentStock(
            tx,
            line.productId,
            (godownId !== undefined ? godownId : existing.godownId) || undefined
          );

          const computed = computeLineFinancials(
            {
              productId: line.productId,
              quantity: Number(line.quantity) || 0,
              rate: Number(line.rate) || 0,
              discountPercent: Number(line.discountPercent) || 0,
              vatPercentage: Number(line.vatPercentage) || 0,
              receivedQuantity: Number(line.receivedQuantity) || 0,
              notes: line.notes,
            },
            currentStock
          );
          computedLines.push(computed);
        }

        // Recalculate order totals
        const orderFinancials = computeOrderFinancials(
          computedLines,
          orderDiscountPercent,
          orderVatPercentage
        );
        newSubTotal = orderFinancials.subTotal;
        newDiscount = orderFinancials.discount;
        newVatAmount = orderFinancials.vatAmount;
        newGrandTotal = orderFinancials.grandTotal;

        // Delete existing lines and recreate
        await tx.purchaseOrderLine.deleteMany({
          where: { purchaseOrderId: id },
        });
      } else if (status && status !== existing.status) {
        // Status change without line changes — recompute fulfillment/receiving
        // from existing lines
        computedLines = existing.lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          rate: line.rate,
          discountPercent: line.discountPercent,
          discountAmount: line.discountAmount,
          vatAmount: line.vatAmount,
          total: line.total,
          receivedQuantity: line.receivedQuantity,
          pendingQuantity: line.pendingQuantity,
          availableStock: line.availableStock,
          stockStatus: line.stockStatus,
          notes: line.notes,
        }));
      }

      // Update fulfillment and receiving status based on receivedQuantity vs quantity
      if (computedLines && computedLines.length > 0) {
        const allFullyReceived = computedLines.every(
          (l) => l.receivedQuantity >= l.quantity
        );
        const anyPartiallyReceived = computedLines.some(
          (l) => l.receivedQuantity > 0 && l.receivedQuantity < l.quantity
        );

        if (allFullyReceived) {
          newReceivingStatus = 'Fully Received';
          newFulfillmentStatus = 'Fulfilled';
        } else if (anyPartiallyReceived) {
          newReceivingStatus = 'Partially Received';
          newFulfillmentStatus = 'Partial';
        } else {
          newReceivingStatus = 'Unreceived';
          newFulfillmentStatus = 'Pending';
        }

        // Override based on status
        if (newStatus === 'Draft') {
          newFulfillmentStatus = 'Pending';
          newReceivingStatus = 'Unreceived';
        } else if (newStatus === 'Confirmed') {
          newFulfillmentStatus = 'Pending';
          // Keep computed receivingStatus
          if (newReceivingStatus === 'Fully Received') {
            newReceivingStatus = 'Unreceived'; // Confirmed PO hasn't been received yet
          }
        } else if (newStatus === 'Received') {
          newFulfillmentStatus = 'Fulfilled';
          newReceivingStatus = 'Fully Received';
          // Update line-level receivedQuantity to match ordered quantity
          if (computedLines) {
            computedLines = computedLines.map((l) => ({
              ...l,
              receivedQuantity: l.quantity,
              pendingQuantity: 0,
            }));
          }
        }
      } else {
        // No lines provided and no status change — keep existing
        newFulfillmentStatus = undefined;
        newReceivingStatus = undefined;
      }

      // NOTE: Stock entry creation on status transitions has been removed.
      // Stock entries are ONLY created by the /api/purchase-orders/receive
      // endpoint when goods are physically received. Previously, changing
      // status to "Confirmed" or "Received" via PUT would also create stock
      // entries, causing double-entry when the receive endpoint was also used.
      // Now the flow is: Create PO → Confirm PO → Receive PO (receive endpoint
      // creates stock entries) → Stock updated.

      // Build update data object
      const updateData: Record<string, unknown> = {};

      if (supplierId) updateData.supplierId = supplierId;
      if (date) updateData.date = new Date(date);
      if (godownId !== undefined) updateData.godownId = godownId || null;
      if (notes !== undefined) updateData.notes = notes;
      if (status) updateData.status = newStatus;
      if (discount !== undefined) updateData.discount = Number(discount);
      if (discountPercent !== undefined) updateData.discountPercent = orderDiscountPercent;
      if (vatPercentage !== undefined) updateData.vatPercentage = orderVatPercentage;
      if (expectedDate !== undefined) updateData.expectedDate = expectedDate ? new Date(expectedDate) : null;
      if (receivedDate !== undefined) updateData.receivedDate = receivedDate ? new Date(receivedDate) : null;
      if (newSubTotal !== undefined) updateData.subTotal = newSubTotal;
      if (newDiscount !== undefined) updateData.discount = newDiscount;
      if (newVatAmount !== undefined) updateData.vatAmount = newVatAmount;
      if (newGrandTotal !== undefined) updateData.grandTotal = newGrandTotal;
      if (newFulfillmentStatus !== undefined) updateData.fulfillmentStatus = newFulfillmentStatus;
      if (newReceivingStatus !== undefined) updateData.receivingStatus = newReceivingStatus;

      // Add new lines if computed
      if (computedLines && lines && Array.isArray(lines)) {
        updateData.lines = {
          create: computedLines.map((cl) => ({
            productId: cl.productId,
            quantity: cl.quantity,
            receivedQuantity: cl.receivedQuantity,
            pendingQuantity: cl.pendingQuantity,
            rate: cl.rate,
            discountPercent: cl.discountPercent,
            discountAmount: cl.discountAmount,
            vatAmount: cl.vatAmount,
            total: cl.total,
            availableStock: cl.availableStock,
            stockStatus: cl.stockStatus,
            notes: cl.notes,
          })),
        };
      }

      const purchaseOrder = await tx.purchaseOrder.update({
        where: { id },
        data: updateData,
        include: {
          supplier: true,
          godown: true,
          company: true,
          lines: { include: { product: true } },
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'PurchaseOrders',
          recordId: id,
          recordLabel: existing.poNumber,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            previousStatus: existing.status,
            newStatus: status || existing.status,
            previousGrandTotal: existing.grandTotal,
            newGrandTotal: newGrandTotal || existing.grandTotal,
            linesChanged: !!lines,
            stockEntriesCreated: status === 'Confirmed' && existing.status === 'Draft',
          }),
        },
      });

      // Activity log
      await logUserActivity({
          tx: tx,
        action: 'UPDATE',
        module: 'Inv-PurchaseOrder-Pipeline',
        recordId: id,
        recordLabel: existing.poNumber,
        userId: security.user.id,
        userName: security.user.name,
        details: `Updated purchase order ${existing.poNumber}: status ${existing.status} → ${status || existing.status}`,
      });

      return purchaseOrder;
    }).catch((error: any) => {
      if (error?.message === 'VALIDATION_ERROR') {
        return { _validationError: true, message: error.validationError };
      }
      throw error;
    });

    // Handle validation failure
    if (result && typeof result === 'object' && '_validationError' in result) {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[PurchaseOrders] PUT /[id] error:', error);
    return NextResponse.json(
      { error: 'Failed to update purchase order' },
      { status: 500 }
    );
  }
}

// ============================================================
// DELETE /api/purchase-orders/[id] — Soft delete with stock reversal
// ============================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'PurchaseOrders', 'DELETE');
  if (!security.authorized) return security.response;

  // Dealer: completely blocked from purchase order records
  if (security.user.role === 'dealer') {
    return NextResponse.json(
      { error: 'Access denied. Dealers cannot access purchase order records.' },
      { status: 403 }
    );
  }

  // SR: cannot delete purchase orders
  if (security.user.role === 'sr') {
    return NextResponse.json(
      { error: 'Access denied. SRs cannot delete purchase orders.' },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;

    // Fetch existing record for validation, period lock, and audit
    const existing = await db.purchaseOrder.findUnique({
      where: { id },
      include: {
        lines: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Purchase order not found' },
        { status: 404 }
      );
    }

    if (!existing.isActive) {
      return NextResponse.json(
        { error: 'Purchase order is already deleted' },
        { status: 400 }
      );
    }

    // Period close check: use existing record's date
    const periodLock = await checkPeriodClose(existing.date);
    if (periodLock) return periodLock;

    await db.$transaction(async (tx) => {
      // Soft delete the purchase order
      await tx.purchaseOrder.update({
        where: { id },
        data: { isActive: false },
      });

      // If PO was Confirmed/Received, reverse the stock entries (create OUT entries)
      if (
        existing.status === 'Confirmed' ||
        existing.status === 'Received' ||
        existing.status === 'Partially Received'
      ) {
        for (const line of existing.lines) {
          // Check if there's a corresponding IN stock entry
          const existingInEntry = await tx.stockEntry.findFirst({
            where: {
              productId: line.productId,
              reference: existing.poNumber,
              referenceType: 'PurchaseOrder',
              type: 'IN',
            },
          });

          if (existingInEntry) {
            // Create a reversal OUT entry
            await tx.stockEntry.create({
              data: {
                productId: line.productId,
                godownId: existing.godownId || null,
                type: 'OUT',
                quantity: line.quantity,
                reference: existing.poNumber,
                referenceType: 'PurchaseOrder',
                date: new Date(),
                notes: `Reversal: PO ${existing.poNumber} deleted`,
              },
            });
          }
        }
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'PurchaseOrders',
          recordId: id,
          recordLabel: existing.poNumber || id,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            softDelete: true,
            previousStatus: existing.status,
            previousGrandTotal: existing.grandTotal,
            stockReversed:
              existing.status === 'Confirmed' ||
              existing.status === 'Received' ||
              existing.status === 'Partially Received',
          }),
        },
      });

      // Activity log
      await logUserActivity({
          tx: tx,
        action: 'DELETE',
        module: 'Inv-PurchaseOrder-Pipeline',
        recordId: id,
        recordLabel: existing.poNumber || id,
        userId: security.user.id,
        userName: security.user.name,
        details: `Deleted purchase order ${existing.poNumber} (status was: ${existing.status})`,
      });
    });

    return NextResponse.json({
      message: 'Purchase order deleted successfully',
      stockReversed:
        existing.status === 'Confirmed' ||
        existing.status === 'Received' ||
        existing.status === 'Partially Received',
    });
  } catch (error) {
    console.error('[PurchaseOrders] DELETE /[id] error:', error);
    return NextResponse.json(
      { error: 'Failed to delete purchase order' },
      { status: 500 }
    );
  }
}
