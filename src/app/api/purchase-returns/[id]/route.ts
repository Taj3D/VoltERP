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
// SHARED: Line-level Financial Computation for Purchase Return
// (duplicated from parent route to avoid cross-route imports)
// ============================================================

interface PRLineInput {
  productId: string;
  quantity: number;
  rate: number;
  discountPercent?: number;
  discountAmount?: number;
  vatAmount?: number;
}

interface ComputedPRLine {
  productId: string;
  quantity: number;
  rate: number;
  discountPercent: number;
  discountAmount: number;
  vatAmount: number;
  total: number;
  costPrice: number;
  cogsReversal: number;
  availableStock: number;
}

function computePRLineFinancials(
  line: PRLineInput,
  costPrice: number,
  availableStock: number
): ComputedPRLine {
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
    availableStock,
  };
}

// ============================================================
// SHARED: Stock computation helper
// ============================================================

async function computeCurrentStock(
  productId: string,
  godownId?: string | null
): Promise<number> {
  const inEntries = await db.stockEntry.aggregate({
    where: { productId, type: 'IN', ...(godownId ? { godownId } : {}) },
    _sum: { quantity: true },
  });
  const outEntries = await db.stockEntry.aggregate({
    where: { productId, type: 'OUT', ...(godownId ? { godownId } : {}) },
    _sum: { quantity: true },
  });
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { openingStock: true },
  });
  return safeFinancialAdd(
    product?.openingStock || 0,
    safeFinancialSubtract(inEntries._sum.quantity || 0, outEntries._sum.quantity || 0)
  );
}

// ============================================================
// SHARED: AP Adjustment helpers (same logic as parent route)
// ============================================================

function applyApAdjustment(
  supplier: { currentBalance: number; currentBalanceType: string; creditLimit: number; creditStatus: string },
  grandTotal: number
): { currentBalance: number; currentBalanceType: string; creditStatus: string } {
  let newBalance = supplier.currentBalance;
  let newBalanceType = supplier.currentBalanceType;

  if (newBalanceType === 'Cr') {
    newBalance = safeFinancialSubtract(newBalance, grandTotal);
    if (newBalance < 0) {
      newBalanceType = 'Dr';
      newBalance = Math.abs(newBalance);
    } else if (newBalance === 0) {
      newBalanceType = 'Cr';
    }
  } else {
    if (grandTotal > newBalance) {
      newBalanceType = 'Cr';
      newBalance = safeFinancialSubtract(grandTotal, newBalance);
    } else {
      newBalance = safeFinancialSubtract(newBalance, grandTotal);
    }
    if (newBalance === 0) newBalanceType = 'Cr';
  }

  let newCreditStatus = supplier.creditStatus;
  if (newBalanceType === 'Dr' && supplier.creditLimit > 0 && newBalance > supplier.creditLimit) {
    newCreditStatus = 'OverLimit';
  }

  return { currentBalance: newBalance, currentBalanceType: newBalanceType, creditStatus: newCreditStatus };
}

function reverseApAdjustment(
  supplier: { currentBalance: number; currentBalanceType: string; creditLimit: number; creditStatus: string },
  grandTotal: number
): { currentBalance: number; currentBalanceType: string; creditStatus: string } {
  let newBalance = supplier.currentBalance;
  let newBalanceType = supplier.currentBalanceType;

  if (newBalanceType === 'Cr') {
    newBalance = safeFinancialAdd(newBalance, grandTotal);
  } else {
    if (grandTotal > newBalance) {
      newBalanceType = 'Cr';
      newBalance = safeFinancialSubtract(grandTotal, newBalance);
    } else {
      newBalance = safeFinancialSubtract(newBalance, grandTotal);
    }
    if (newBalance === 0) newBalanceType = 'Cr';
  }

  let newCreditStatus = supplier.creditStatus;
  if (newCreditStatus === 'OverLimit' && supplier.creditLimit > 0 && !(newBalanceType === 'Dr' && newBalance > supplier.creditLimit)) {
    newCreditStatus = 'Active';
  }

  return { currentBalance: newBalance, currentBalanceType: newBalanceType, creditStatus: newCreditStatus };
}

// ============================================================
// Currency formatting helper
// ============================================================

const fmtBD = (v: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

// ============================================================
// GET /api/purchase-returns/[id] — Single return with full relations
// ============================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'PurchaseReturns', 'GET');
  if (!security.authorized) return security.response;

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
        godown: true,
        company: true,
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

    if (!purchaseReturn) {
      return NextResponse.json(
        { error: 'Purchase return not found' },
        { status: 404 }
      );
    }

    // isActive check (410 Gone for deleted)
    if (!purchaseReturn.isActive) {
      return NextResponse.json(
        { error: 'Purchase return has been deleted', returnNo: purchaseReturn.returnNo },
        { status: 410 }
      );
    }

    // Apply VAT Auditor masking
    const masked = maskForVatAuditorFinancial(
      purchaseReturn as Record<string, unknown>,
      security.user.role
    );

    return NextResponse.json(masked);
  } catch (error) {
    console.error('[PurchaseReturns] GET [id] error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch purchase return' },
      { status: 500 }
    );
  }
}

// ============================================================
// PUT /api/purchase-returns/[id] — Update return
// Handles status transitions (Pending→Approved→Completed, or Rejected)
// Reverses AP adjustment if Rejected
// Recalculates COGS reversal if lines change
// ============================================================

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'PurchaseReturns', 'PUT');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const body = await request.json();
    const {
      godownId,
      date,
      discount,
      discountPercent,
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
      include: {
        lines: true,
        purchaseOrder: { include: { lines: true } },
        supplier: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Purchase return not found' },
        { status: 404 }
      );
    }

    // Company isolation check
    if (security.user.companyId && security.user.role !== 'admin' && existing.companyId !== security.user.companyId) {
      return NextResponse.json(
        { error: 'Access denied. This return belongs to a different company.' },
        { status: 403 }
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
      let computedLines: ComputedPRLine[] | null = null;

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

          // Find the original purchase order line for this product
          const purchaseOrderLine = existing.purchaseOrder.lines.find(
            (l) => l.productId === line.productId
          );

          if (!purchaseOrderLine) {
            throw Object.assign(new Error('VALIDATION_ERROR'), {
              validationError: `Product not found in Purchase Order. Cannot return items that were not part of the original order.`,
            });
          }

          // Cumulative return validation (excluding current return)
          const requestedQty = Number(line.quantity) || 0;

          const otherReturns = await tx.purchaseReturn.findMany({
            where: {
              purchaseOrderId: existing.purchaseOrderId,
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

          if (totalAlreadyReturned + requestedQty > purchaseOrderLine.quantity) {
            throw Object.assign(new Error('CUMULATIVE_EXCEEDED'), {
              validationError: `Cumulative return quantity (${fmtBD(totalAlreadyReturned + requestedQty)}) exceeds original order quantity (${fmtBD(purchaseOrderLine.quantity)}) for this product. Already returned: ${fmtBD(totalAlreadyReturned)}, Attempting: ${fmtBD(requestedQty)}`,
            });
          }

          // COGS Reversal Calculation
          const product = await tx.product.findUnique({
            where: { id: line.productId },
            select: { costPrice: true },
          });
          const costPrice = product?.costPrice || 0;

          // Compute current available stock
          const effectiveGodownId = godownId !== undefined ? godownId : existing.godownId;
          const currentStock = await computeCurrentStock(line.productId, effectiveGodownId);

          const computed = computePRLineFinancials(
            {
              productId: line.productId,
              quantity: requestedQty,
              rate: Number(line.rate) || 0,
              discountPercent: Number(line.discountPercent) || 0,
              discountAmount: line.discountAmount ? Number(line.discountAmount) : undefined,
              vatAmount: line.vatAmount ? Number(line.vatAmount) : undefined,
            },
            costPrice,
            currentStock
          );

          computedLines.push(computed);
        }
      }

      // Recalculate order-level financials from lines
      let subTotal: number | undefined;
      let headerDiscount: number | undefined;
      let headerDiscountPercent: number | undefined;
      let vatPct: number | undefined;
      let vatAmount: number | undefined;
      let grandTotal: number | undefined;
      let cogsReversal: number | undefined;

      if (computedLines) {
        subTotal = computedLines.reduce(
          (sum, l) => safeFinancialAdd(sum, l.total),
          0
        );
        headerDiscountPercent = discountPercent !== undefined ? Number(discountPercent) : existing.discountPercent;
        headerDiscount = discount !== undefined ? Number(discount) : existing.discount;
        const effectiveDiscount = headerDiscountPercent > 0
          ? safeFinancialRound(subTotal * (headerDiscountPercent / 100))
          : headerDiscount;
        vatPct = vatPercentage !== undefined ? Number(vatPercentage) : existing.vatPercentage;
        const afterDiscount = safeFinancialSubtract(subTotal, effectiveDiscount);
        vatAmount = safeFinancialRound(afterDiscount * (vatPct / 100));
        grandTotal = safeFinancialAdd(afterDiscount, vatAmount);
        cogsReversal = computedLines.reduce(
          (sum, l) => safeFinancialAdd(sum, l.cogsReversal),
          0
        );
        headerDiscount = effectiveDiscount;
      } else if (discount !== undefined || discountPercent !== undefined || vatPercentage !== undefined) {
        // Recalculate with existing lines if only header discount/vat changed
        const existingSubTotal = existing.lines.reduce(
          (sum, l) => safeFinancialAdd(sum, l.total),
          0
        );
        subTotal = existingSubTotal;
        headerDiscountPercent = discountPercent !== undefined ? Number(discountPercent) : existing.discountPercent;
        headerDiscount = discount !== undefined ? Number(discount) : existing.discount;
        const effectiveDiscount = headerDiscountPercent > 0
          ? safeFinancialRound(existingSubTotal * (headerDiscountPercent / 100))
          : headerDiscount;
        vatPct = vatPercentage !== undefined ? Number(vatPercentage) : existing.vatPercentage;
        const afterDiscount = safeFinancialSubtract(existingSubTotal, effectiveDiscount);
        vatAmount = safeFinancialRound(afterDiscount * (vatPct / 100));
        grandTotal = safeFinancialAdd(afterDiscount, vatAmount);
        cogsReversal = existing.cogsReversal;
        headerDiscount = effectiveDiscount;
      }

      // ── Status change handling ──

      // If status changes to "Rejected", reverse the AP adjustment and stock entries
      if (newStatus === 'Rejected' && existing.status !== 'Rejected') {
        // Reverse AP adjustment if it was posted
        if (existing.apAdjustmentPosted) {
          const currentSupplier = await tx.supplier.findUnique({
            where: { id: existing.supplierId },
            select: {
              id: true,
              currentBalance: true,
              currentBalanceType: true,
              creditLimit: true,
              creditStatus: true,
            },
          });
          if (currentSupplier) {
            const apResult = reverseApAdjustment(currentSupplier, existing.grandTotal);
            await tx.supplier.update({
              where: { id: existing.supplierId },
              data: {
                currentBalance: apResult.currentBalance,
                currentBalanceType: apResult.currentBalanceType,
                ...(apResult.creditStatus !== currentSupplier.creditStatus && {
                  creditStatus: apResult.creditStatus,
                }),
              },
            });
          }
        }

        // Reverse stock entries (create IN entries to undo the OUT)
        const linesToReverse = computedLines || existing.lines;
        const effectiveGodownId =
          godownId !== undefined ? godownId : existing.godownId;

        for (const line of linesToReverse) {
          await tx.stockEntry.create({
            data: {
              productId: line.productId,
              godownId: effectiveGodownId || null,
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

      // If transitioning from Pending to Approved, no additional stock/AP action needed
      // (stock entries and AP adjustment were already created on initial creation)

      // If transitioning from Approved to Completed, no additional stock/AP action needed
      // (this is a terminal state for workflow tracking only)

      // ── Handle line replacement ──
      // If lines changed and status is Pending, we need to:
      // 1. Reverse old stock entries (IN entries to undo OUT entries)
      // 2. Delete old lines
      // 3. Create new lines
      // 4. Create new stock entries (OUT)
      // 5. Reverse old AP adjustment and apply new one
      if (computedLines && existing.status === 'Pending') {
        // Reverse old stock entries (create IN to undo OUT)
        const effectiveGodownId =
          godownId !== undefined ? godownId : existing.godownId;

        for (const line of existing.lines) {
          await tx.stockEntry.create({
            data: {
              productId: line.productId,
              godownId: effectiveGodownId || null,
              type: 'IN',
              quantity: line.quantity,
              reference: `${existing.returnNo}-LINE-UPDATE`,
              referenceType: 'PurchaseReturn',
              date: new Date(),
              notes: `Line update: Reversing old stock for Purchase Return ${existing.returnNo}`,
            },
          });
        }

        // Create new stock entries (OUT)
        for (const line of computedLines) {
          await tx.stockEntry.create({
            data: {
              productId: line.productId,
              godownId: effectiveGodownId || null,
              type: 'OUT',
              quantity: line.quantity,
              reference: `${existing.returnNo}-LINE-UPDATE`,
              referenceType: 'PurchaseReturn',
              date: existing.date,
              notes: `Line update: New stock entry for Purchase Return ${existing.returnNo}`,
            },
          });
        }

        // Reverse old AP adjustment and apply new one
        if (existing.apAdjustmentPosted && grandTotal !== undefined) {
          const currentSupplier = await tx.supplier.findUnique({
            where: { id: existing.supplierId },
            select: {
              id: true,
              currentBalance: true,
              currentBalanceType: true,
              creditLimit: true,
              creditStatus: true,
            },
          });
          if (currentSupplier) {
            // Reverse the old AP adjustment
            const reversedResult = reverseApAdjustment(currentSupplier, existing.grandTotal);
            // Apply the new AP adjustment on top
            const newApResult = applyApAdjustment(
              {
                currentBalance: reversedResult.currentBalance,
                currentBalanceType: reversedResult.currentBalanceType,
                creditLimit: currentSupplier.creditLimit,
                creditStatus: reversedResult.creditStatus,
              },
              grandTotal
            );
            await tx.supplier.update({
              where: { id: existing.supplierId },
              data: {
                currentBalance: newApResult.currentBalance,
                currentBalanceType: newApResult.currentBalanceType,
                ...(newApResult.creditStatus !== currentSupplier.creditStatus && {
                  creditStatus: newApResult.creditStatus,
                }),
              },
            });
          }
        }

        // Delete old lines
        await tx.purchaseReturnLine.deleteMany({
          where: { purchaseReturnId: id },
        });
      }

      // ── Update the purchase return record ──
      const updateData: Record<string, unknown> = {};

      if (godownId !== undefined) updateData.godownId = godownId || null;
      if (date) updateData.date = new Date(date);
      if (reason !== undefined) updateData.reason = reason;
      if (debitNoteCode !== undefined) updateData.debitNoteCode = debitNoteCode;
      if (challanRef !== undefined) updateData.challanRef = challanRef;
      if (status) updateData.status = newStatus;
      if (subTotal !== undefined) updateData.subTotal = subTotal;
      if (headerDiscount !== undefined) updateData.discount = headerDiscount;
      if (headerDiscountPercent !== undefined) updateData.discountPercent = headerDiscountPercent;
      if (vatPct !== undefined) updateData.vatPercentage = vatPct;
      if (vatAmount !== undefined) updateData.vatAmount = vatAmount;
      if (grandTotal !== undefined) updateData.grandTotal = grandTotal;
      if (cogsReversal !== undefined) updateData.cogsReversal = cogsReversal;

      // Mark AP adjustment as reversed if rejected
      if (newStatus === 'Rejected' && existing.status !== 'Rejected') {
        updateData.apAdjustmentPosted = false;
        updateData.stockRealignPosted = false;
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
            availableStock: cl.availableStock,
          })),
        };
      }

      const purchaseReturn = await tx.purchaseReturn.update({
        where: { id },
        data: updateData,
        include: {
          purchaseOrder: { include: { supplier: true } },
          supplier: true,
          godown: true,
          company: true,
          lines: { include: { product: { include: { category: true, brand: true } } } },
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'PurchaseReturns',
          recordId: purchaseReturn.id,
          recordLabel: existing.returnNo,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            previousStatus: existing.status,
            newStatus,
            subTotal,
            discount: headerDiscount,
            discountPercent: headerDiscountPercent,
            vatPercentage: vatPct,
            vatAmount,
            grandTotal,
            cogsReversal,
            statusChanged: existing.status !== newStatus,
            apReversed: newStatus === 'Rejected' && existing.status !== 'Rejected',
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
        module: 'Inv-Purchase-Return',
        recordId: purchaseReturn.id,
        recordLabel: existing.returnNo,
        userId: security.user.id,
        userName: security.user.name,
        details: `Updated purchase return ${existing.returnNo}.${statusChangeNote}${computedLines ? ' Lines recalculated with COGS reversal and stock realignment.' : ''}`,
      });

      return purchaseReturn;
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
    console.error('[PurchaseReturns] PUT error:', error);
    const message = error instanceof Error ? error.message : 'Failed to update purchase return';
    const status = message.includes('exceeds') || message.includes('not found') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// ============================================================
// DELETE /api/purchase-returns/[id] — Soft delete with stock reversal
// and AP adjustment reversal
// ============================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'PurchaseReturns', 'DELETE');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;

    const existing = await db.purchaseReturn.findUnique({
      where: { id },
      include: { lines: true, supplier: true },
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

    // Company isolation check
    if (security.user.companyId && security.user.role !== 'admin' && existing.companyId !== security.user.companyId) {
      return NextResponse.json(
        { error: 'Access denied. This return belongs to a different company.' },
        { status: 403 }
      );
    }

    // Period-close lock check
    const periodLock = await checkPeriodClose(existing.date);
    if (periodLock) return periodLock;

    await db.$transaction(async (tx) => {
      // ── Stock Reversal: Create IN entries for non-Rejected returns
      // to undo the OUT entries ──
      if (existing.status !== 'Rejected') {
        for (const line of existing.lines) {
          await tx.stockEntry.create({
            data: {
              productId: line.productId,
              godownId: existing.godownId || null,
              type: 'IN',
              quantity: line.quantity,
              reference: `${existing.returnNo}-DELETE`,
              referenceType: 'PurchaseReturn',
              date: new Date(),
              notes: `Deletion: Reversing stock for deleted Purchase Return ${existing.returnNo}`,
            },
          });
        }
      }

      // ── AP Adjustment Reversal ──
      if (existing.apAdjustmentPosted && existing.status !== 'Rejected') {
        const currentSupplier = await tx.supplier.findUnique({
          where: { id: existing.supplierId },
          select: {
            id: true,
            currentBalance: true,
            currentBalanceType: true,
            creditLimit: true,
            creditStatus: true,
          },
        });
        if (currentSupplier) {
          const apResult = reverseApAdjustment(currentSupplier, existing.grandTotal);
          await tx.supplier.update({
            where: { id: existing.supplierId },
            data: {
              currentBalance: apResult.currentBalance,
              currentBalanceType: apResult.currentBalanceType,
              ...(apResult.creditStatus !== currentSupplier.creditStatus && {
                creditStatus: apResult.creditStatus,
              }),
            },
          });
        }
      }

      // Soft delete
      await tx.purchaseReturn.update({
        where: { id },
        data: {
          isActive: false,
          apAdjustmentPosted: false,
          stockRealignPosted: false,
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'PurchaseReturns',
          recordId: id,
          recordLabel: existing.returnNo,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            softDelete: true,
            stockReversed: existing.status !== 'Rejected',
            apReversed: existing.apAdjustmentPosted && existing.status !== 'Rejected',
            grandTotal: existing.grandTotal,
            cogsReversal: existing.cogsReversal,
          }),
        },
      });

      // Activity log
      await logUserActivity({
          tx: tx,
        action: 'DELETE',
        module: 'Inv-Purchase-Return',
        recordId: id,
        recordLabel: existing.returnNo,
        userId: security.user.id,
        userName: security.user.name,
        details: `Deleted purchase return ${existing.returnNo}. Stock and AP adjustments reversed.`,
      });
    });

    return NextResponse.json({ message: 'Purchase return deleted successfully' });
  } catch (error) {
    console.error('[PurchaseReturns] DELETE error:', error);
    return NextResponse.json(
      { error: 'Failed to delete purchase return' },
      { status: 500 }
    );
  }
}
