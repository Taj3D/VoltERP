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
// SHARED: Line-level Financial Computation for Sales
// ============================================================

interface SOLineInput {
  productId: string;
  quantity: number;
  rate: number;
  discountPercent?: number;
  discountAmount?: number;
  vatAmount?: number;
}

interface ComputedSOLine {
  productId: string;
  quantity: number;
  rate: number;
  discountPercent: number;
  discountAmount: number;
  vatAmount: number;
  total: number;
  costPrice: number;
  cogsAmount: number;
  grossProfit: number;
}

function computeSalesLineFinancials(
  line: SOLineInput,
  costPrice: number
): ComputedSOLine {
  const lineGross = safeFinancialRound(line.quantity * line.rate);
  const discountPercent = line.discountPercent ?? 0;

  let discountAmount: number;
  if (line.discountAmount !== undefined && line.discountAmount > 0) {
    discountAmount = safeFinancialRound(line.discountAmount);
  } else {
    discountAmount = safeFinancialRound(lineGross * (discountPercent / 100));
  }

  const afterDiscount = safeFinancialSubtract(lineGross, discountAmount);
  const vatAmount = safeFinancialRound(line.vatAmount ?? 0);
  const total = safeFinancialAdd(afterDiscount, vatAmount);

  const cogsAmount = safeFinancialRound(line.quantity * costPrice);
  const grossProfit = safeFinancialSubtract(total, cogsAmount);

  return {
    productId: line.productId,
    quantity: line.quantity,
    rate: line.rate,
    discountPercent,
    discountAmount,
    vatAmount,
    total,
    costPrice,
    cogsAmount,
    grossProfit,
  };
}

// ============================================================
// SHARED: Order-level Financial Computation for Sales
// ============================================================

function computeSalesOrderFinancials(
  computedLines: ComputedSOLine[],
  discountPercent: number,
  vatPercentage: number,
  discount?: number
) {
  const subTotal = computedLines.reduce(
    (sum, l) => safeFinancialAdd(sum, l.total),
    0
  );

  const orderDiscount = discount !== undefined && discount > 0
    ? safeFinancialRound(discount)
    : safeFinancialRound(subTotal * (discountPercent / 100));

  const afterDiscount = safeFinancialSubtract(subTotal, orderDiscount);
  const vatAmount = safeFinancialRound(afterDiscount * (vatPercentage / 100));
  const grandTotal = safeFinancialAdd(afterDiscount, vatAmount);

  const cogsTotal = computedLines.reduce(
    (sum, l) => safeFinancialAdd(sum, l.cogsAmount),
    0
  );
  const grossProfit = safeFinancialSubtract(grandTotal, cogsTotal);
  const profitMargin = grandTotal > 0 ? safeFinancialRound((grossProfit / grandTotal) * 100) : 0;

  return { subTotal, discount: orderDiscount, vatAmount, grandTotal, cogsTotal, grossProfit, profitMargin };
}

// ============================================================
// SHARED: AR Ledger balance update for Customer
// ============================================================

function computeNewArBalance(
  currentBalance: number,
  currentBalanceType: string,
  grandTotal: number
): { newBalance: number; newBalanceType: string } {
  if (currentBalanceType === 'Dr') {
    return {
      newBalance: safeFinancialAdd(currentBalance, grandTotal),
      newBalanceType: 'Dr',
    };
  } else {
    if (grandTotal > currentBalance) {
      return {
        newBalance: safeFinancialSubtract(grandTotal, currentBalance),
        newBalanceType: 'Dr',
      };
    } else {
      return {
        newBalance: safeFinancialSubtract(currentBalance, grandTotal),
        newBalanceType: 'Cr',
      };
    }
  }
}

function computeArReversal(
  currentBalance: number,
  currentBalanceType: string,
  grandTotal: number
): { newBalance: number; newBalanceType: string } {
  if (currentBalanceType === 'Dr') {
    if (grandTotal >= currentBalance) {
      return {
        newBalance: safeFinancialSubtract(grandTotal, currentBalance),
        newBalanceType: 'Cr',
      };
    } else {
      return {
        newBalance: safeFinancialSubtract(currentBalance, grandTotal),
        newBalanceType: 'Dr',
      };
    }
  } else {
    return {
      newBalance: safeFinancialAdd(currentBalance, grandTotal),
      newBalanceType: 'Cr',
    };
  }
}

const fmtBD = (v: number) =>
  // Use en-US to guarantee Latin digits — en-US may produce Bengali numerals
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

// ============================================================
// GET /api/sales-orders/[id] — Get single sales order with full relations
// ============================================================

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
        company: true,
        sr: {
          include: {
            designation: true,
          },
        },
        lines: {
          include: {
            product: {
              include: {
                category: true,
                brand: true,
              },
            },
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

    if (!salesOrder.isActive) {
      return NextResponse.json(
        { error: 'Sales order has been deleted' },
        { status: 410 }
      );
    }

    // VAT Auditor masking (including line items)
    const masked = maskOrderWithLinesForVatAuditor(
      salesOrder as Record<string, unknown>,
      security.user.role
    );

    return NextResponse.json(masked);
  } catch (error) {
    console.error('[SalesOrders] GET /[id] error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sales order' },
      { status: 500 }
    );
  }
}

// ============================================================
// PUT /api/sales-orders/[id] — Update sales order
// Status transitions: Draft → Confirmed → Delivered → Completed → Cancelled
// ============================================================

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'SalesOrders', 'PUT');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const body = await request.json();
    const {
      customerId,
      date,
      godownId,
      notes,
      status,
      discount,
      discountPercent,
      vatPercentage,
      paymentOptionId,
      srId,
      lines,
    } = body;

    // Fetch existing record for validation and audit
    const existing = await db.salesOrder.findUnique({
      where: { id },
      include: {
        lines: true,
        customer: true,
        godown: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Sales order not found' },
        { status: 404 }
      );
    }

    if (!existing.isActive) {
      return NextResponse.json(
        { error: 'Cannot update a deleted sales order' },
        { status: 400 }
      );
    }

    // Validate status transition if status is being changed
    const newStatus = status || existing.status;
    const validTransitions: Record<string, string[]> = {
      Draft: ['Confirmed', 'Cancelled'],
      Confirmed: ['Delivered', 'Cancelled'],
      Delivered: ['Completed', 'Cancelled'],
      Completed: ['Cancelled'],
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

    // ── Transaction: update with recalculation ──
    const result = await db.$transaction(async (tx) => {
      let computedLines: ComputedSOLine[] | undefined;
      let newSubTotal: number | undefined;
      let newDiscount: number | undefined;
      let newVatAmount: number | undefined;
      let newGrandTotal: number | undefined;
      let newCogsTotal: number | undefined;
      let newGrossProfit: number | undefined;
      let newProfitMargin: number | undefined;

      const orderDiscountPercent = discountPercent !== undefined
        ? Number(discountPercent)
        : existing.discountPercent;
      const orderVatPercentage = vatPercentage !== undefined
        ? Number(vatPercentage)
        : existing.vatPercentage;
      const orderDiscount = discount !== undefined ? Number(discount) : undefined;

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
            select: { id: true, name: true, costPrice: true, openingStock: true },
          });

          if (!product) {
            throw Object.assign(new Error('VALIDATION_ERROR'), {
              validationError: `Product with ID "${line.productId}" not found`,
            });
          }

          // Stock safety check for new lines
          const effectiveGodownId = (godownId !== undefined ? godownId : existing.godownId) || undefined;
          const currentStock = await computeCurrentStock(
            tx,
            line.productId,
            effectiveGodownId
          );

          const lineQuantity = Number(line.quantity) || 0;
          if (currentStock < lineQuantity) {
            throw Object.assign(new Error('INSUFFICIENT_STOCK'), {
              stockError: `Insufficient stock for "${product.name}". Available: ${currentStock}, Requested: ${lineQuantity}.`,
            });
          }

          const costPrice = product.costPrice || 0;
          const computed = computeSalesLineFinancials(
            {
              productId: line.productId,
              quantity: lineQuantity,
              rate: Number(line.rate) || 0,
              discountPercent: Number(line.discountPercent) || 0,
              discountAmount: line.discountAmount !== undefined ? Number(line.discountAmount) : undefined,
              vatAmount: line.vatAmount !== undefined ? Number(line.vatAmount) : undefined,
            },
            costPrice
          );
          computedLines.push(computed);
        }

        // Recalculate order totals including COGS
        const orderFinancials = computeSalesOrderFinancials(
          computedLines,
          orderDiscountPercent,
          orderVatPercentage,
          orderDiscount
        );
        newSubTotal = orderFinancials.subTotal;
        newDiscount = orderFinancials.discount;
        newVatAmount = orderFinancials.vatAmount;
        newGrandTotal = orderFinancials.grandTotal;
        newCogsTotal = orderFinancials.cogsTotal;
        newGrossProfit = orderFinancials.grossProfit;
        newProfitMargin = orderFinancials.profitMargin;

        // Delete existing lines and recreate
        await tx.salesOrderLine.deleteMany({
          where: { salesOrderId: id },
        });
      } else if (discount !== undefined || vatPercentage !== undefined || discountPercent !== undefined) {
        // If only discount/vat changed, recalculate from existing lines
        // Need to recalculate COGS as well
        const existingLines = existing.lines;
        computedLines = existingLines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          rate: line.rate,
          discountPercent: line.discountPercent,
          discountAmount: line.discountAmount,
          vatAmount: line.vatAmount,
          total: line.total,
          costPrice: line.costPrice,
          cogsAmount: line.cogsAmount,
          grossProfit: line.grossProfit,
        }));

        const orderFinancials = computeSalesOrderFinancials(
          computedLines,
          orderDiscountPercent,
          orderVatPercentage,
          orderDiscount
        );
        newSubTotal = orderFinancials.subTotal;
        newDiscount = orderFinancials.discount;
        newVatAmount = orderFinancials.vatAmount;
        newGrandTotal = orderFinancials.grandTotal;
        newCogsTotal = orderFinancials.cogsTotal;
        newGrossProfit = orderFinancials.grossProfit;
        newProfitMargin = orderFinancials.profitMargin;
      }

      // ── Handle status transitions ──

      // When status changes to "Cancelled": reverse stock entries and adjust AR
      if (status === 'Cancelled' && existing.status !== 'Cancelled') {
        // Reverse stock entries — create IN entries to reverse the OUT entries
        const linesToReverse = computedLines || existing.lines;
        for (const line of linesToReverse) {
          await tx.stockEntry.create({
            data: {
              productId: line.productId,
              godownId: existing.godownId || null,
              type: 'IN',
              quantity: line.quantity,
              reference: existing.invoiceNo,
              referenceType: 'SalesOrder',
              date: new Date(),
              notes: `Reversal: SO ${existing.invoiceNo} cancelled`,
            },
          });
        }

        // Adjust AR — subtract grandTotal from customer balance
        if (existing.arPosted) {
          const previousGrandTotal = newGrandTotal !== undefined ? newGrandTotal : existing.grandTotal;
          const customer = await tx.customer.findUnique({
            where: { id: existing.customerId },
          });
          if (customer) {
            const { newBalance, newBalanceType } = computeArReversal(
              customer.currentBalance,
              customer.currentBalanceType,
              previousGrandTotal
            );

            // Recompute credit status
            let newCreditStatus = customer.creditStatus;
            if (newBalanceType === 'Dr' && customer.creditLimit > 0 && newBalance > customer.creditLimit) {
              newCreditStatus = 'OverLimit';
            } else if (newBalanceType === 'Cr' || (newBalanceType === 'Dr' && newBalance <= customer.creditLimit)) {
              // If previously OverLimit, check if we should revert to Active
              if (customer.creditStatus === 'OverLimit') {
                newCreditStatus = 'Active';
              }
            }

            await tx.customer.update({
              where: { id: existing.customerId },
              data: {
                currentBalance: newBalance,
                currentBalanceType: newBalanceType,
                creditStatus: newCreditStatus,
              },
            });
          }
        }
      }

      // Build update data object
      const updateData: Record<string, unknown> = {};

      if (customerId) updateData.customerId = customerId;
      if (date) updateData.date = new Date(date);
      if (godownId !== undefined) updateData.godownId = godownId || null;
      if (notes !== undefined) updateData.notes = notes;
      if (status) updateData.status = newStatus;
      if (paymentOptionId !== undefined) updateData.paymentOptionId = paymentOptionId || null;
      if (srId !== undefined) updateData.srId = srId || null;
      if (discountPercent !== undefined) updateData.discountPercent = orderDiscountPercent;
      if (vatPercentage !== undefined) updateData.vatPercentage = orderVatPercentage;
      if (newSubTotal !== undefined) updateData.subTotal = newSubTotal;
      if (newDiscount !== undefined) updateData.discount = newDiscount;
      if (newVatAmount !== undefined) updateData.vatAmount = newVatAmount;
      if (newGrandTotal !== undefined) updateData.grandTotal = newGrandTotal;
      if (newCogsTotal !== undefined) updateData.cogsTotal = newCogsTotal;
      if (newGrossProfit !== undefined) updateData.grossProfit = newGrossProfit;
      if (newProfitMargin !== undefined) updateData.profitMargin = newProfitMargin;

      // Add new lines if computed from provided lines
      if (computedLines && lines && Array.isArray(lines)) {
        updateData.lines = {
          create: computedLines.map((cl) => ({
            productId: cl.productId,
            quantity: cl.quantity,
            rate: cl.rate,
            discountPercent: cl.discountPercent,
            discountAmount: cl.discountAmount,
            vatAmount: cl.vatAmount,
            total: cl.total,
            costPrice: cl.costPrice,
            cogsAmount: cl.cogsAmount,
            grossProfit: cl.grossProfit,
          })),
        };
      }

      const salesOrder = await tx.salesOrder.update({
        where: { id },
        data: updateData,
        include: {
          customer: true,
          godown: true,
          paymentOption: true,
          company: true,
          sr: { include: { designation: true } },
          lines: { include: { product: { include: { category: true, brand: true } } } },
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'SalesOrders',
          recordId: id,
          recordLabel: existing.invoiceNo,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            previousStatus: existing.status,
            newStatus: status || existing.status,
            previousGrandTotal: existing.grandTotal,
            newGrandTotal: newGrandTotal || existing.grandTotal,
            linesChanged: !!lines,
            stockReversed: status === 'Cancelled' && existing.status !== 'Cancelled',
            arAdjusted: status === 'Cancelled' && existing.arPosted,
          }),
        },
      });

      // Activity log
      await logUserActivity({
          tx: tx,
        action: 'UPDATE',
        module: 'Inv-SalesOrder-Pipeline',
        recordId: id,
        recordLabel: existing.invoiceNo,
        userId: security.user.id,
        userName: security.user.name,
        details: `Updated sales order ${existing.invoiceNo}: status ${existing.status} → ${status || existing.status}`,
      });

      return salesOrder;
    }).catch((error: any) => {
      if (error?.message === 'VALIDATION_ERROR') {
        return { _validationError: true, message: error.validationError };
      }
      if (error?.message === 'INSUFFICIENT_STOCK') {
        return { _stockError: true, message: error.stockError };
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

    // Handle insufficient stock
    if (result && typeof result === 'object' && '_stockError' in result) {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }

    // Automated SMS: Sales Confirmation Event (when status changes TO Confirmed)
    if (
      result &&
      typeof result === 'object' &&
      'status' in result &&
      (result as any).status === 'Confirmed' &&
      existing.status !== 'Confirmed'
    ) {
      try {
        const { triggerSalesConfirmationSms } = await import('@/lib/sms-event-hooks');
        await triggerSalesConfirmationSms({
          id: (result as any).id,
          invoiceNo: (result as any).invoiceNo,
          customerId: (result as any).customerId,
          grandTotal: (result as any).grandTotal,
          date: (result as any).date,
          companyId: (result as any).companyId || undefined,
        });
      } catch (smsError) {
        console.error('[SalesOrders] SMS trigger failed (non-blocking):', smsError);
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[SalesOrders] PUT /[id] error:', error);
    return NextResponse.json(
      { error: 'Failed to update sales order' },
      { status: 500 }
    );
  }
}

// ============================================================
// DELETE /api/sales-orders/[id] — Soft delete with stock reversal and AR adjustment
// ============================================================

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
      include: {
        lines: true,
      },
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

    // Period close check: use existing record's date
    const periodLock = await checkPeriodClose(existing.date);
    if (periodLock) return periodLock;

    await db.$transaction(async (tx) => {
      // Soft delete the sales order
      await tx.salesOrder.update({
        where: { id },
        data: { isActive: false },
      });

      // Reverse stock entries — for any status that had stock OUT entries
      // (all sales orders create OUT entries on creation)
      if (existing.status !== 'Cancelled') {
        for (const line of existing.lines) {
          // Check if there's a corresponding OUT stock entry
          const existingOutEntry = await tx.stockEntry.findFirst({
            where: {
              productId: line.productId,
              reference: existing.invoiceNo,
              referenceType: 'SalesOrder',
              type: 'OUT',
            },
          });

          if (existingOutEntry) {
            // Create a reversal IN entry
            await tx.stockEntry.create({
              data: {
                productId: line.productId,
                godownId: existing.godownId || null,
                type: 'IN',
                quantity: line.quantity,
                reference: existing.invoiceNo,
                referenceType: 'SalesOrder',
                date: new Date(),
                notes: `Reversal: SO ${existing.invoiceNo} deleted`,
              },
            });
          }
        }
      }

      // ── AR Ledger Adjustment ──
      // If the order was AR-posted, reverse the balance impact
      if (existing.arPosted && existing.status !== 'Cancelled') {
        const customer = await tx.customer.findUnique({
          where: { id: existing.customerId },
        });
        if (customer) {
          const { newBalance, newBalanceType } = computeArReversal(
            customer.currentBalance,
            customer.currentBalanceType,
            existing.grandTotal
          );

          // Recompute credit status
          let newCreditStatus = customer.creditStatus;
          if (newBalanceType === 'Dr' && customer.creditLimit > 0 && newBalance > customer.creditLimit) {
            newCreditStatus = 'OverLimit';
          } else if (customer.creditStatus === 'OverLimit') {
            // Check if we should revert from OverLimit
            if (newBalanceType === 'Cr' || (newBalanceType === 'Dr' && newBalance <= customer.creditLimit)) {
              newCreditStatus = 'Active';
            }
          }

          await tx.customer.update({
            where: { id: existing.customerId },
            data: {
              currentBalance: newBalance,
              currentBalanceType: newBalanceType,
              creditStatus: newCreditStatus,
            },
          });
        }
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'SalesOrders',
          recordId: id,
          recordLabel: existing.invoiceNo || id,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            softDelete: true,
            previousStatus: existing.status,
            previousGrandTotal: existing.grandTotal,
            stockReversed: existing.status !== 'Cancelled',
            arAdjusted: existing.arPosted && existing.status !== 'Cancelled',
          }),
        },
      });

      // Activity log
      await logUserActivity({
          tx: tx,
        action: 'DELETE',
        module: 'Inv-SalesOrder-Pipeline',
        recordId: id,
        recordLabel: existing.invoiceNo || id,
        userId: security.user.id,
        userName: security.user.name,
        details: `Deleted sales order ${existing.invoiceNo} (status was: ${existing.status})`,
      });
    });

    return NextResponse.json({
      message: 'Sales order deleted successfully',
      stockReversed: existing.status !== 'Cancelled',
      arAdjusted: existing.arPosted && existing.status !== 'Cancelled',
    });
  } catch (error) {
    console.error('[SalesOrders] DELETE /[id] error:', error);
    return NextResponse.json(
      { error: 'Failed to delete sales order' },
      { status: 500 }
    );
  }
}
