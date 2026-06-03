import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  maskForVatAuditorFinancial,
  safeFinancialRound,
  safeFinancialAdd,
  safeFinancialSubtract,
  checkPeriodClose,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// ============================================================
// SHARED: Stock Validation Engine (duplicated for route isolation)
// ============================================================

async function validateStockAvailability(
  tx: any,
  lines: Array<{ productId: string; quantity: number }>,
  godownId?: string
) {
  const stockErrors: Array<{
    productId: string;
    productName: string;
    requested: number;
    available: number;
    deficit: number;
  }> = [];
  const stockSnapshots: Array<{
    productId: string;
    availableStock: number;
    stockStatus: string;
    allocatedQuantity: number;
  }> = [];

  for (const line of lines) {
    const product = await tx.product.findUnique({
      where: { id: line.productId },
    });
    if (!product) {
      stockErrors.push({
        productId: line.productId,
        productName: 'Unknown Product',
        requested: line.quantity,
        available: 0,
        deficit: line.quantity,
      });
      stockSnapshots.push({
        productId: line.productId,
        availableStock: 0,
        stockStatus: 'Insufficient',
        allocatedQuantity: 0,
      });
      continue;
    }

    const stockEntries = await tx.stockEntry.findMany({
      where: {
        productId: line.productId,
        ...(godownId ? { godownId } : {}),
      },
    });
    const currentStock =
      product.openingStock +
      stockEntries.reduce(
        (sum: number, e: any) =>
          sum + (e.type === 'IN' ? e.quantity : -e.quantity),
        0
      );

    if (line.quantity > currentStock) {
      stockErrors.push({
        productId: line.productId,
        productName: product.name,
        requested: line.quantity,
        available: currentStock,
        deficit: safeFinancialRound(line.quantity - currentStock),
      });
      stockSnapshots.push({
        productId: line.productId,
        availableStock: currentStock,
        stockStatus: currentStock > 0 ? 'Partial' : 'Insufficient',
        allocatedQuantity: Math.min(currentStock, line.quantity),
      });
    } else {
      stockSnapshots.push({
        productId: line.productId,
        availableStock: currentStock,
        stockStatus: 'Available',
        allocatedQuantity: line.quantity,
      });
    }
  }

  return { stockErrors, stockSnapshots };
}

// ============================================================
// Line-level Financial Computation
// ============================================================

interface LineInput {
  productId: string;
  quantity: number;
  rate: number;
  discountPercent?: number;
  notes?: string;
}

function computeLineFinancials(
  line: LineInput,
  stockSnapshot?: {
    availableStock: number;
    stockStatus: string;
    allocatedQuantity: number;
  }
) {
  const lineTotal = safeFinancialRound(line.quantity * line.rate);
  const discountPercent = line.discountPercent ?? 0;
  const discountAmount = safeFinancialRound(
    lineTotal * (discountPercent / 100)
  );
  const afterDiscount = safeFinancialSubtract(lineTotal, discountAmount);
  const vatAmount = 0; // VAT applied at order level

  return {
    productId: line.productId,
    quantity: line.quantity,
    rate: line.rate,
    discountPercent,
    discountAmount,
    vatAmount,
    total: afterDiscount,
    allocatedQuantity: stockSnapshot?.allocatedQuantity ?? 0,
    fulfilledQuantity: 0,
    availableStock: stockSnapshot?.availableStock ?? 0,
    stockStatus: stockSnapshot?.stockStatus ?? 'Available',
    notes: line.notes || null,
  };
}

// ============================================================
// Order-level Financial Computation
// ============================================================

function computeOrderFinancials(
  computedLines: ReturnType<typeof computeLineFinancials>[],
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
// GET /api/order-sheets/[id] — Single order sheet with full details
// ============================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'OrderSheets', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;

    const orderSheet = await db.orderSheet.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true, code: true } },
        customer: {
          select: { id: true, name: true, customerCode: true },
        },
        godown: { select: { id: true, name: true, code: true } },
        paymentOption: { select: { id: true, name: true } },
        lines: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                productCode: true,
                unit: true,
                salePrice: true,
              },
            },
          },
        },
      },
    });

    if (!orderSheet || !orderSheet.isActive) {
      return NextResponse.json(
        { error: 'Order sheet not found' },
        { status: 404 }
      );
    }

    // Apply VAT Auditor masking
    const maskedSheet = maskForVatAuditorFinancial(
      orderSheet as any,
      security.user.role
    );

    return NextResponse.json(maskedSheet);
  } catch (error) {
    console.error('[OrderSheets] GET [id] error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch order sheet' },
      { status: 500 }
    );
  }
}

// ============================================================
// PUT /api/order-sheets/[id] — Update with stock validation
// ============================================================

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'OrderSheets', 'PUT');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const body = await request.json();

    // Verify the order sheet exists
    const existing = await db.orderSheet.findUnique({ where: { id } });
    if (!existing || !existing.isActive) {
      return NextResponse.json(
        { error: 'Order sheet not found' },
        { status: 404 }
      );
    }

    // Cannot modify cancelled order sheets
    if (existing.status === 'Cancelled') {
      return NextResponse.json(
        { error: 'Cannot modify a cancelled order sheet' },
        { status: 400 }
      );
    }

    const {
      orderType,
      companyId,
      customerId,
      godownId,
      date,
      discountPercent,
      vatPercentage,
      paymentOptionId,
      notes,
      status,
      lines,
      referenceKey,
    } = body;

    // If confirming, re-validate stock (stock may have changed since draft)
    const isConfirming = status === 'Confirmed' && existing.status !== 'Confirmed';

    // Period close guard
    const effectiveDate = date ? new Date(date) : existing.date;
    const periodLock = await checkPeriodClose(effectiveDate);
    if (periodLock) return periodLock;

    // ── Transaction: update with stock validation ──
    const result = await db.$transaction(async (tx) => {
      // Determine which lines to validate
      const effectiveOrderType = orderType || existing.orderType;
      const effectiveGodownId =
        godownId !== undefined ? godownId : existing.godownId;

      // If lines are provided, validate stock for them
      let stockValidationResult:
        | {
            stockErrors: Array<{
              productId: string;
              productName: string;
              requested: number;
              available: number;
              deficit: number;
            }>;
            stockSnapshots: Array<{
              productId: string;
              availableStock: number;
              stockStatus: string;
              allocatedQuantity: number;
            }>;
          }
        | undefined;

      if (lines && Array.isArray(lines) && lines.length > 0) {
        stockValidationResult = await validateStockAvailability(
          tx,
          lines.map((l: LineInput) => ({
            productId: l.productId,
            quantity: l.quantity,
          })),
          effectiveGodownId || undefined
        );

        // On confirmation, ANY insufficient stock must block the transition
        if (
          isConfirming &&
          stockValidationResult.stockErrors.length > 0
        ) {
          throw Object.assign(
            new Error('STOCK_INSUFFICIENT_ON_CONFIRM'),
            {
              stockErrors: stockValidationResult.stockErrors,
              stockSnapshots: stockValidationResult.stockSnapshots,
            }
          );
        }

        // For non-confirm updates, also reject if insufficient stock exists
        if (stockValidationResult.stockErrors.length > 0) {
          throw Object.assign(new Error('STOCK_INSUFFICIENT'), {
            stockErrors: stockValidationResult.stockErrors,
            stockSnapshots: stockValidationResult.stockSnapshots,
          });
        }
      } else if (isConfirming) {
        // Re-validate existing lines when confirming without new lines
        const existingLines = await tx.orderSheetLine.findMany({
          where: { orderSheetId: id },
        });

        stockValidationResult = await validateStockAvailability(
          tx,
          existingLines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
          })),
          effectiveGodownId || undefined
        );

        if (stockValidationResult.stockErrors.length > 0) {
          throw Object.assign(
            new Error('STOCK_INSUFFICIENT_ON_CONFIRM'),
            {
              stockErrors: stockValidationResult.stockErrors,
              stockSnapshots: stockValidationResult.stockSnapshots,
            }
          );
        }
      }

      // Delete existing lines and recreate if lines are provided
      if (lines && Array.isArray(lines)) {
        await tx.orderSheetLine.deleteMany({
          where: { orderSheetId: id },
        });
      }

      // Compute financials if lines are provided
      let computedLines: ReturnType<typeof computeLineFinancials>[] = [];
      let orderFinancials: ReturnType<typeof computeOrderFinancials> | undefined;

      if (lines && Array.isArray(lines) && lines.length > 0 && stockValidationResult) {
        const snapshotMap = new Map(
          stockValidationResult.stockSnapshots.map((s) => [s.productId, s])
        );
        computedLines = lines.map((line: LineInput) => {
          const snap = snapshotMap.get(line.productId);
          return computeLineFinancials(line, snap);
        });

        const effectiveDiscountPercent =
          discountPercent !== undefined
            ? discountPercent
            : existing.discountPercent;
        const effectiveVatPercentage =
          vatPercentage !== undefined ? vatPercentage : existing.vatPercentage;

        orderFinancials = computeOrderFinancials(
          computedLines,
          effectiveDiscountPercent,
          effectiveVatPercentage
        );
      }

      // Determine fulfillment status
      let fulfillmentStatus = existing.fulfillmentStatus;
      if (computedLines.length > 0) {
        const allAvailable = computedLines.every(
          (l) => l.stockStatus === 'Available'
        );
        const anyPartial = computedLines.some(
          (l) => l.stockStatus === 'Partial'
        );
        fulfillmentStatus = allAvailable
          ? 'Unfulfilled'
          : anyPartial
            ? 'Partial'
            : 'Unfulfilled';
      }

      // Build update data
      const updateData: any = {};

      if (orderType !== undefined) updateData.orderType = orderType;
      if (companyId !== undefined)
        updateData.companyId = orderType === 'Company' ? companyId : null;
      if (customerId !== undefined)
        updateData.customerId =
          orderType === 'Customer' ? customerId : null;
      if (godownId !== undefined) updateData.godownId = godownId || null;
      if (date !== undefined) updateData.date = new Date(date);
      if (notes !== undefined) updateData.notes = notes;
      if (paymentOptionId !== undefined)
        updateData.paymentOptionId = paymentOptionId || null;
      if (referenceKey !== undefined)
        updateData.referenceKey = referenceKey || null;

      // Status transition
      if (status !== undefined) {
        updateData.status = status;

        // When confirming, update fulfillment status
        if (isConfirming) {
          fulfillmentStatus = 'Unfulfilled'; // Will be updated as items are dispatched
        }
      }

      updateData.fulfillmentStatus = fulfillmentStatus;

      // Apply computed financials
      if (orderFinancials) {
        updateData.subTotal = orderFinancials.subTotal;
        updateData.discount = orderFinancials.discount;
        updateData.discountPercent =
          discountPercent !== undefined
            ? discountPercent
            : existing.discountPercent;
        updateData.vatPercentage =
          vatPercentage !== undefined
            ? vatPercentage
            : existing.vatPercentage;
        updateData.vatAmount = orderFinancials.vatAmount;
        updateData.grandTotal = orderFinancials.grandTotal;
      } else if (discountPercent !== undefined || vatPercentage !== undefined) {
        // Recompute with existing lines if only discount/VAT changed
        const existingLines = await tx.orderSheetLine.findMany({
          where: { orderSheetId: id },
        });

        const subTotal = existingLines.reduce(
          (sum, l) => safeFinancialAdd(sum, l.total),
          0
        );
        const effectiveDiscountPercent =
          discountPercent !== undefined
            ? discountPercent
            : existing.discountPercent;
        const effectiveVatPercentage =
          vatPercentage !== undefined
            ? vatPercentage
            : existing.vatPercentage;
        const discount = safeFinancialRound(
          subTotal * (effectiveDiscountPercent / 100)
        );
        const afterDiscount = safeFinancialSubtract(subTotal, discount);
        const vatAmount = safeFinancialRound(
          afterDiscount * (effectiveVatPercentage / 100)
        );
        const grandTotal = safeFinancialAdd(afterDiscount, vatAmount);

        updateData.subTotal = subTotal;
        updateData.discount = discount;
        updateData.discountPercent = effectiveDiscountPercent;
        updateData.vatPercentage = effectiveVatPercentage;
        updateData.vatAmount = vatAmount;
        updateData.grandTotal = grandTotal;
      }

      // Recreate lines if provided
      if (lines && Array.isArray(lines) && computedLines.length > 0) {
        updateData.lines = {
          create: computedLines.map((cl) => ({
            productId: cl.productId,
            quantity: cl.quantity,
            allocatedQuantity: cl.allocatedQuantity,
            fulfilledQuantity: cl.fulfilledQuantity,
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

      const updatedSheet = await tx.orderSheet.update({
        where: { id },
        data: updateData,
        include: {
          company: true,
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
          module: 'OrderSheets',
          recordId: updatedSheet.id,
          recordLabel: updatedSheet.sheetNo,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({
            sheetNo: updatedSheet.sheetNo,
            status: updatedSheet.status,
            fulfillmentStatus: updatedSheet.fulfillmentStatus,
            grandTotal: updatedSheet.grandTotal,
            isConfirming,
          }),
        },
      });

      // Activity log
      await logUserActivity({
          tx: tx,
        action: 'UPDATE',
        module: 'Inv-OrderSheet-Pipeline',
        recordId: updatedSheet.id,
        recordLabel: updatedSheet.sheetNo,
        userId: security.user?.id,
        userName: security.user?.name,
        details: `Updated order sheet ${updatedSheet.sheetNo}, status=${updatedSheet.status}, fulfillmentStatus=${updatedSheet.fulfillmentStatus}`,
      });

      return updatedSheet;
    }).catch((error: any) => {
      if (
        error?.message === 'STOCK_INSUFFICIENT' ||
        error?.message === 'STOCK_INSUFFICIENT_ON_CONFIRM'
      ) {
        return {
          _stockError: true,
          _errorType: error.message,
          stockErrors: error.stockErrors,
          stockSnapshots: error.stockSnapshots,
        };
      }
      throw error;
    });

    // Handle stock validation failure
    if (
      result &&
      typeof result === 'object' &&
      '_stockError' in result
    ) {
      const statusCode =
        result._errorType === 'STOCK_INSUFFICIENT_ON_CONFIRM'
          ? 409
          : 409;
      const errorMessage =
        result._errorType === 'STOCK_INSUFFICIENT_ON_CONFIRM'
          ? 'Cannot confirm order: insufficient stock for one or more products. Stock levels may have changed since the order was drafted.'
          : 'Insufficient stock for one or more products';

      return NextResponse.json(
        {
          error: errorMessage,
          stockErrors: result.stockErrors,
          stockSnapshots: result.stockSnapshots,
        },
        { status: statusCode }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[OrderSheets] PUT [id] error:', error);
    return NextResponse.json(
      { error: 'Failed to update order sheet' },
      { status: 500 }
    );
  }
}

// ============================================================
// DELETE /api/order-sheets/[id] — Soft delete
// ============================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'OrderSheets', 'DELETE');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;

    const result = await db.$transaction(async (tx) => {
      const record = await tx.orderSheet.findUnique({
        where: { id },
        include: { lines: true },
      });

      if (!record || !record.isActive) {
        throw new Error('NOT_FOUND');
      }

      // Cannot delete confirmed/processing orders
      if (
        record.status === 'Confirmed' ||
        record.status === 'Processing' ||
        record.status === 'Completed'
      ) {
        throw new Error(
          `CANNOT_DELETE:${record.status}`
        );
      }

      // Period close guard
      const periodLock = await checkPeriodClose(record.date);
      if (periodLock) {
        throw new Error('PERIOD_LOCKED');
      }

      // Soft delete
      await tx.orderSheet.update({
        where: { id },
        data: { isActive: false },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'OrderSheets',
          recordId: record.id,
          recordLabel: record.sheetNo,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({
            sheetNo: record.sheetNo,
            softDelete: true,
            previousStatus: record.status,
            lineCount: record.lines.length,
          }),
        },
      });

      // Activity log
      await logUserActivity({
          tx: tx,
        action: 'DELETE',
        module: 'Inv-OrderSheet-Pipeline',
        recordId: record.id,
        recordLabel: record.sheetNo,
        userId: security.user?.id,
        userName: security.user?.name,
        details: `Soft-deleted order sheet ${record.sheetNo}`,
      });

      return record;
    });

    return NextResponse.json({
      message: 'Order sheet deleted successfully',
      sheetNo: result.sheetNo,
    });
  } catch (error: any) {
    if (error?.message === 'NOT_FOUND') {
      return NextResponse.json(
        { error: 'Order sheet not found' },
        { status: 404 }
      );
    }
    if (error?.message?.startsWith('CANNOT_DELETE:')) {
      const status = error.message.split(':')[1];
      return NextResponse.json(
        {
          error: `Cannot delete order sheet with status "${status}". Only Draft or Cancelled orders can be deleted.`,
        },
        { status: 400 }
      );
    }
    if (error?.message === 'PERIOD_LOCKED') {
      return NextResponse.json(
        { error: 'Cannot delete order sheet in a locked period' },
        { status: 403 }
      );
    }
    console.error('[OrderSheets] DELETE [id] error:', error);
    return NextResponse.json(
      { error: 'Failed to delete order sheet' },
      { status: 500 }
    );
  }
}
