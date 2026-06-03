import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  checkPeriodClose,
  maskForVatAuditorFinancial,
  safeFinancialRound,
  safeFinancialAdd,
  safeFinancialSubtract,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// ============================================================
// SHARED: Line-level Financial Computation for Sales Return
// (duplicated from parent route to avoid cross-route imports)
// ============================================================

interface SRLineInput {
  productId: string;
  quantity: number;
  rate: number;
  discountPercent?: number;
  discountAmount?: number;
  vatAmount?: number;
}

interface ComputedSRLine {
  productId: string;
  quantity: number;
  rate: number;
  discountPercent: number;
  discountAmount: number;
  vatAmount: number;
  total: number;
  costPrice: number;
  cogsReversal: number;
}

function computeSRLineFinancials(
  line: SRLineInput,
  costPrice: number
): ComputedSRLine {
  const lineGross = safeFinancialRound(line.quantity * line.rate);
  const discountPercent = line.discountPercent ?? 0;
  const discountAmount =
    line.discountAmount ?? safeFinancialRound(lineGross * (discountPercent / 100));
  const afterDiscount = safeFinancialSubtract(lineGross, discountAmount);
  const vatAmount = line.vatAmount ?? 0;
  const total = safeFinancialAdd(afterDiscount, vatAmount);

  const cogsReversal = safeFinancialRound(line.quantity * costPrice);

  return {
    productId: line.productId,
    quantity: line.quantity,
    rate: line.rate,
    discountPercent,
    discountAmount,
    vatAmount,
    total,
    costPrice,
    cogsReversal,
  };
}

// ============================================================
// SHARED: AR Adjustment helpers (same logic as parent route)
// ============================================================

async function applyArAdjustment(
  tx: any,
  customerId: string,
  grandTotal: number
): Promise<void> {
  const customer = await tx.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      currentBalance: true,
      currentBalanceType: true,
      creditLimit: true,
      creditStatus: true,
    },
  });
  if (!customer) return;

  let newBalance = customer.currentBalance;
  let newBalanceType = customer.currentBalanceType;

  if (customer.currentBalanceType === 'Dr') {
    newBalance = safeFinancialSubtract(customer.currentBalance, grandTotal);
    if (newBalance < 0) {
      newBalance = Math.abs(newBalance);
      newBalanceType = 'Cr';
    }
  } else {
    newBalance = safeFinancialAdd(customer.currentBalance, grandTotal);
    newBalanceType = 'Cr';
  }

  if (safeFinancialRound(newBalance) === 0) {
    newBalance = 0;
    newBalanceType = 'Dr';
  }

  let newCreditStatus = customer.creditStatus;
  if (customer.creditStatus === 'OverLimit' && customer.creditLimit > 0) {
    if (newBalanceType === 'Dr' && newBalance <= customer.creditLimit) {
      newCreditStatus = 'Active';
    } else if (newBalanceType === 'Cr') {
      newCreditStatus = 'Active';
    }
  }

  await tx.customer.update({
    where: { id: customerId },
    data: {
      currentBalance: newBalance,
      currentBalanceType: newBalanceType,
      ...(newCreditStatus !== customer.creditStatus && {
        creditStatus: newCreditStatus,
      }),
    },
  });
}

async function reverseArAdjustment(
  tx: any,
  customerId: string,
  grandTotal: number
): Promise<void> {
  const customer = await tx.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      currentBalance: true,
      currentBalanceType: true,
      creditLimit: true,
      creditStatus: true,
    },
  });
  if (!customer) return;

  let newBalance = customer.currentBalance;
  let newBalanceType = customer.currentBalanceType;

  if (customer.currentBalanceType === 'Cr') {
    newBalance = safeFinancialSubtract(customer.currentBalance, grandTotal);
    if (newBalance < 0) {
      newBalance = Math.abs(newBalance);
      newBalanceType = 'Dr';
    }
  } else {
    newBalance = safeFinancialAdd(customer.currentBalance, grandTotal);
    newBalanceType = 'Dr';
  }

  if (safeFinancialRound(newBalance) === 0) {
    newBalance = 0;
    newBalanceType = 'Dr';
  }

  let newCreditStatus = customer.creditStatus;
  if (customer.creditLimit > 0 && newBalanceType === 'Dr' && newBalance > customer.creditLimit) {
    newCreditStatus = 'OverLimit';
  }

  await tx.customer.update({
    where: { id: customerId },
    data: {
      currentBalance: newBalance,
      currentBalanceType: newBalanceType,
      ...(newCreditStatus !== customer.creditStatus && {
        creditStatus: newCreditStatus,
      }),
    },
  });
}

// ============================================================
// GET /api/sales-returns/[id] — Single return with full relations
// ============================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'SalesReturns', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const salesReturn = await db.salesReturn.findUnique({
      where: { id },
      include: {
        salesOrder: {
          include: {
            customer: true,
          },
        },
        customer: true,
        godown: true,
        company: true,
        lines: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!salesReturn) {
      return NextResponse.json(
        { error: 'Sales return not found' },
        { status: 404 }
      );
    }

    // Apply VAT Auditor masking
    const masked = maskForVatAuditorFinancial(
      salesReturn as Record<string, unknown>,
      security.user.role
    );

    return NextResponse.json(masked);
  } catch (error) {
    console.error('[SalesReturns] GET [id] error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sales return' },
      { status: 500 }
    );
  }
}

// ============================================================
// PUT /api/sales-returns/[id] — Update return
// Handles status transitions (Pending→Approved→Completed, or Rejected)
// Reverses AR adjustment if Rejected
// Recalculates COGS reversal if lines change
// ============================================================

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'SalesReturns', 'PUT');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const body = await request.json();
    const {
      godownId,
      date,
      discount,
      vatPercentage,
      reason,
      creditMemoCode,
      status,
      lines,
    } = body;

    // Fetch existing record for status change logic
    const existing = await db.salesReturn.findUnique({
      where: { id },
      include: {
        lines: true,
        salesOrder: { include: { lines: true } },
        customer: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Sales return not found' },
        { status: 404 }
      );
    }

    // Period-close lock check (use effective date)
    const effectiveDate = date || existing.date;
    const periodLock = await checkPeriodClose(effectiveDate);
    if (periodLock) return periodLock;

    // ── Status transition validation ──
    const validTransitions: Record<string, string[]> = {
      Pending: ['Approved', 'Rejected'],
      Approved: ['Completed', 'Rejected'],
      Completed: [], // Terminal state
      Rejected: [],  // Terminal state
    };

    const newStatus = status || existing.status;
    if (newStatus !== existing.status) {
      const allowed = validTransitions[existing.status] || [];
      if (!allowed.includes(newStatus)) {
        return NextResponse.json(
          {
            error: `Invalid status transition from "${existing.status}" to "${newStatus}". Allowed transitions: ${allowed.length > 0 ? allowed.join(', ') : 'None (terminal state)'}`,
          },
          { status: 400 }
        );
      }
    }

    // returnNo is immutable
    const result = await db.$transaction(async (tx) => {
      // Process lines if provided
      let computedLines: ComputedSRLine[] | null = null;

      if (lines && Array.isArray(lines) && lines.length > 0) {
        // Only allow line changes when status is Pending
        if (existing.status !== 'Pending') {
          throw Object.assign(new Error('VALIDATION_ERROR'), {
            validationError: `Cannot modify lines when return status is "${existing.status}". Only Pending returns can have their lines modified.`,
          });
        }

        computedLines = [];
        for (const line of lines) {
          if (!line.productId) {
            throw Object.assign(new Error('VALIDATION_ERROR'), {
              validationError: 'Each line must have a productId',
            });
          }

          // Find the original sales order line for this product
          const salesOrderLine = existing.salesOrder.lines.find(
            (l) => l.productId === line.productId
          );

          if (!salesOrderLine) {
            throw Object.assign(new Error('VALIDATION_ERROR'), {
              validationError: `Product not found in Sales Order. Cannot return items that were not part of the original order.`,
            });
          }

          // Cumulative return validation (excluding current return)
          const requestedQty = Number(line.quantity) || 0;

          const otherReturns = await tx.salesReturn.findMany({
            where: {
              salesOrderId: existing.salesOrderId,
              isActive: true,
              status: { not: 'Rejected' },
              id: { not: id }, // Exclude current return
            },
            include: { lines: { where: { productId: line.productId } } },
          });
          const totalAlreadyReturned = otherReturns.reduce(
            (sum, ret) => sum + ret.lines.reduce((lineSum, l) => lineSum + l.quantity, 0),
            0
          );

          if (totalAlreadyReturned + requestedQty > salesOrderLine.quantity) {
            throw Object.assign(new Error('CUMULATIVE_EXCEEDED'), {
              validationError: `Cumulative return quantity (${totalAlreadyReturned + requestedQty}) exceeds original order quantity (${salesOrderLine.quantity}) for this product. Already returned: ${totalAlreadyReturned}, Attempting: ${requestedQty}`,
            });
          }

          // COGS Reversal Calculation
          let costPrice = salesOrderLine.costPrice || 0;
          if (!costPrice) {
            const product = await tx.product.findUnique({
              where: { id: line.productId },
              select: { costPrice: true },
            });
            costPrice = product?.costPrice || 0;
          }

          const computed = computeSRLineFinancials(
            {
              productId: line.productId,
              quantity: requestedQty,
              rate: Number(line.rate) || 0,
              discountPercent: Number(line.discountPercent) || 0,
              discountAmount: line.discountAmount ? Number(line.discountAmount) : undefined,
              vatAmount: line.vatAmount ? Number(line.vatAmount) : undefined,
            },
            costPrice
          );

          computedLines.push(computed);
        }
      }

      // Recalculate order-level financials from lines
      let subTotal: number | undefined;
      let headerDiscount: number | undefined;
      let vatPct: number | undefined;
      let vatAmount: number | undefined;
      let grandTotal: number | undefined;
      let cogsReversal: number | undefined;

      if (computedLines) {
        subTotal = computedLines.reduce(
          (sum, l) => safeFinancialAdd(sum, l.total),
          0
        );
        headerDiscount = discount !== undefined ? Number(discount) : existing.discount;
        vatPct = vatPercentage !== undefined ? Number(vatPercentage) : existing.vatPercentage;
        const afterDiscount = safeFinancialSubtract(subTotal, headerDiscount);
        vatAmount = safeFinancialRound(afterDiscount * (vatPct / 100));
        grandTotal = safeFinancialAdd(afterDiscount, vatAmount);
        cogsReversal = computedLines.reduce(
          (sum, l) => safeFinancialAdd(sum, l.cogsReversal),
          0
        );
      } else if (discount !== undefined || vatPercentage !== undefined) {
        // Recalculate with existing lines if only header discount/vat changed
        const existingSubTotal = existing.lines.reduce(
          (sum, l) => safeFinancialAdd(sum, l.total),
          0
        );
        subTotal = existingSubTotal;
        headerDiscount = discount !== undefined ? Number(discount) : existing.discount;
        vatPct = vatPercentage !== undefined ? Number(vatPercentage) : existing.vatPercentage;
        const afterDiscount = safeFinancialSubtract(existingSubTotal, headerDiscount);
        vatAmount = safeFinancialRound(afterDiscount * (vatPct / 100));
        grandTotal = safeFinancialAdd(afterDiscount, vatAmount);
        cogsReversal = existing.cogsReversal;
      }

      // ── Status change handling ──

      // If status changes to "Rejected", reverse the AR adjustment and stock entries
      if (newStatus === 'Rejected' && existing.status !== 'Rejected') {
        // Reverse AR adjustment if it was posted
        if (existing.arAdjustmentPosted) {
          await reverseArAdjustment(tx, existing.customerId, existing.grandTotal);
        }

        // Reverse stock entries (create OUT entries to undo the restock)
        const linesToReverse = computedLines || existing.lines;
        const effectiveGodownId =
          godownId !== undefined ? godownId : existing.godownId;

        for (const line of linesToReverse) {
          await tx.stockEntry.create({
            data: {
              productId: line.productId,
              godownId: effectiveGodownId || null,
              type: 'OUT',
              quantity: line.quantity,
              reference: `${existing.returnNo}-REVERSAL`,
              referenceType: 'SalesReturn',
              date: new Date(),
              notes: `Reversal: Sales Return ${existing.returnNo} rejected`,
            },
          });
        }
      }

      // If transitioning from Pending to Approved, no additional stock/AR action needed
      // (stock entries and AR adjustment were already created on initial creation)

      // If transitioning from Approved to Completed, no additional stock/AR action needed
      // (this is a terminal state for workflow tracking only)

      // ── Handle line replacement ──
      // If lines changed and status is Pending, we need to:
      // 1. Remove old stock entries (OUT entries to undo IN entries)
      // 2. Delete old lines
      // 3. Create new lines
      // 4. Create new stock entries (IN)
      // 5. Reverse old AR adjustment and apply new one
      if (computedLines && existing.status === 'Pending') {
        // Reverse old stock entries
        const effectiveGodownId =
          godownId !== undefined ? godownId : existing.godownId;

        for (const line of existing.lines) {
          await tx.stockEntry.create({
            data: {
              productId: line.productId,
              godownId: effectiveGodownId || null,
              type: 'OUT',
              quantity: line.quantity,
              reference: `${existing.returnNo}-LINE-UPDATE`,
              referenceType: 'SalesReturn',
              date: new Date(),
              notes: `Line update: Reversing old stock for Sales Return ${existing.returnNo}`,
            },
          });
        }

        // Create new stock entries
        for (const line of computedLines) {
          await tx.stockEntry.create({
            data: {
              productId: line.productId,
              godownId: effectiveGodownId || null,
              type: 'IN',
              quantity: line.quantity,
              reference: `${existing.returnNo}-LINE-UPDATE`,
              referenceType: 'SalesReturn',
              date: existing.date,
              notes: `Line update: New stock entry for Sales Return ${existing.returnNo}`,
            },
          });
        }

        // Reverse old AR adjustment and apply new one
        if (existing.arAdjustmentPosted && grandTotal !== undefined) {
          await reverseArAdjustment(tx, existing.customerId, existing.grandTotal);
          await applyArAdjustment(tx, existing.customerId, grandTotal);
        }

        // Delete old lines
        await tx.salesReturnLine.deleteMany({
          where: { salesReturnId: id },
        });
      }

      // ── Update the sales return record ──
      const updateData: Record<string, unknown> = {};

      if (godownId !== undefined) updateData.godownId = godownId || null;
      if (date) updateData.date = new Date(date);
      if (reason !== undefined) updateData.reason = reason;
      if (creditMemoCode !== undefined) updateData.creditMemoCode = creditMemoCode;
      if (status) updateData.status = newStatus;
      if (subTotal !== undefined) updateData.subTotal = subTotal;
      if (headerDiscount !== undefined) updateData.discount = headerDiscount;
      if (vatPct !== undefined) updateData.vatPercentage = vatPct;
      if (vatAmount !== undefined) updateData.vatAmount = vatAmount;
      if (grandTotal !== undefined) updateData.grandTotal = grandTotal;
      if (cogsReversal !== undefined) updateData.cogsReversal = cogsReversal;

      // Mark AR adjustment as reversed if rejected
      if (newStatus === 'Rejected' && existing.status !== 'Rejected') {
        updateData.arAdjustmentPosted = false;
      }

      if (computedLines) {
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
            cogsReversal: cl.cogsReversal,
          })),
        };
      }

      const salesReturn = await tx.salesReturn.update({
        where: { id },
        data: updateData,
        include: {
          salesOrder: { include: { customer: true } },
          customer: true,
          godown: true,
          company: true,
          lines: { include: { product: true } },
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'SalesReturns',
          recordId: salesReturn.id,
          recordLabel: existing.returnNo,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            previousStatus: existing.status,
            newStatus,
            subTotal,
            discount: headerDiscount,
            vatPercentage: vatPct,
            vatAmount,
            grandTotal,
            cogsReversal,
            statusChanged: existing.status !== newStatus,
            arReversed: newStatus === 'Rejected' && existing.status !== 'Rejected',
            linesUpdated: computedLines !== null,
          }),
        },
      });

      // Activity log
      const statusChangeNote =
        existing.status !== newStatus
          ? ` Status changed from ${existing.status} to ${newStatus}.`
          : '';
      await logUserActivity({
          tx: tx,
        action: 'UPDATE',
        module: 'Inv-SalesReturn-Pipeline',
        recordId: salesReturn.id,
        recordLabel: existing.returnNo,
        userId: security.user.id,
        userName: security.user.name,
        details: `Updated sales return ${existing.returnNo}.${statusChangeNote}${computedLines ? ' Lines recalculated with COGS reversal.' : ''}`,
      });

      return salesReturn;
    }).catch((error: any) => {
      if (error?.message === 'VALIDATION_ERROR') {
        return { _validationError: true, message: error.validationError };
      }
      if (error?.message === 'CUMULATIVE_EXCEEDED') {
        return { _cumulativeError: true, message: error.validationError };
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

    // Handle cumulative exceeded failure
    if (result && typeof result === 'object' && '_cumulativeError' in result) {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('[SalesReturns] PUT error:', error);
    const message = error instanceof Error ? error.message : 'Failed to update sales return';
    const status = message.includes('exceeds') || message.includes('not found') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// ============================================================
// DELETE /api/sales-returns/[id] — Soft delete with stock reversal
// and AR adjustment reversal
// ============================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'SalesReturns', 'DELETE');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;

    const existing = await db.salesReturn.findUnique({
      where: { id },
      include: { lines: true, customer: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Sales return not found' },
        { status: 404 }
      );
    }

    if (!existing.isActive) {
      return NextResponse.json(
        { error: 'Sales return is already deleted' },
        { status: 400 }
      );
    }

    // Period-close lock check
    const periodLock = await checkPeriodClose(existing.date);
    if (periodLock) return periodLock;

    await db.$transaction(async (tx) => {
      // ── Stock Reversal: Remove IN stock entries by creating OUT entries ──
      if (existing.status !== 'Rejected') {
        for (const line of existing.lines) {
          await tx.stockEntry.create({
            data: {
              productId: line.productId,
              godownId: existing.godownId || null,
              type: 'OUT',
              quantity: line.quantity,
              reference: `${existing.returnNo}-DELETE`,
              referenceType: 'SalesReturn',
              date: new Date(),
              notes: `Deletion: Reversing stock for deleted Sales Return ${existing.returnNo}`,
            },
          });
        }
      }

      // ── AR Adjustment Reversal ──
      if (existing.arAdjustmentPosted && existing.status !== 'Rejected') {
        await reverseArAdjustment(tx, existing.customerId, existing.grandTotal);
      }

      // Soft delete
      await tx.salesReturn.update({
        where: { id },
        data: {
          isActive: false,
          arAdjustmentPosted: false,
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'SalesReturns',
          recordId: id,
          recordLabel: existing.returnNo,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            softDelete: true,
            stockReversed: existing.status !== 'Rejected',
            arReversed: existing.arAdjustmentPosted && existing.status !== 'Rejected',
            grandTotal: existing.grandTotal,
            cogsReversal: existing.cogsReversal,
          }),
        },
      });

      // Activity log
      await logUserActivity({
          tx: tx,
        action: 'DELETE',
        module: 'Inv-SalesReturn-Pipeline',
        recordId: id,
        recordLabel: existing.returnNo,
        userId: security.user.id,
        userName: security.user.name,
        details: `Deleted sales return ${existing.returnNo}. Stock and AR adjustments reversed.`,
      });
    });

    return NextResponse.json({ message: 'Sales return deleted successfully' });
  } catch (error) {
    console.error('[SalesReturns] DELETE error:', error);
    return NextResponse.json(
      { error: 'Failed to delete sales return' },
      { status: 500 }
    );
  }
}
