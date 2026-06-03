import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  checkPeriodClose,
  checkFinancialDeletePermission,
  safeFinancialRound,
  safeFinancialAdd,
  safeFinancialSubtract,
  maskForVatAuditorFinancial,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// ============================================================
// SHARED: AP Adjustment for Supplier (Cr balance system)
// Positive amount = we owe more (increase Cr), Negative = we owe less (decrease Cr)
// ============================================================

function applySupplierApAdjustment(
  supplier: { currentBalance: number; currentBalanceType: string; creditLimit: number; creditStatus: string },
  amount: number
): { currentBalance: number; currentBalanceType: string; creditStatus: string } {
  let newBalance = supplier.currentBalance;
  let newBalanceType = supplier.currentBalanceType;

  if (amount >= 0) {
    // Increase Cr liability
    if (newBalanceType === 'Cr') {
      newBalance = safeFinancialAdd(newBalance, amount);
    } else {
      // Dr
      if (amount > newBalance) {
        newBalanceType = 'Cr';
        newBalance = safeFinancialSubtract(amount, newBalance);
      } else {
        newBalance = safeFinancialSubtract(newBalance, amount);
      }
      if (newBalance === 0) newBalanceType = 'Cr';
    }
  } else {
    // Decrease Cr liability
    const absAmount = Math.abs(amount);
    if (newBalanceType === 'Cr') {
      newBalance = safeFinancialSubtract(newBalance, absAmount);
      if (newBalance < 0) {
        newBalanceType = 'Dr';
        newBalance = Math.abs(newBalance);
      }
      if (newBalance === 0) newBalanceType = 'Cr';
    } else {
      // Dr
      newBalance = safeFinancialAdd(newBalance, absAmount);
    }
  }

  let newCreditStatus = supplier.creditStatus;
  if (newBalanceType === 'Dr' && supplier.creditLimit > 0 && newBalance > supplier.creditLimit) {
    newCreditStatus = 'OverLimit';
  } else if (
    newCreditStatus === 'OverLimit' &&
    supplier.creditLimit > 0 &&
    !(newBalanceType === 'Dr' && newBalance > supplier.creditLimit)
  ) {
    newCreditStatus = 'Active';
  }

  return { currentBalance: newBalance, currentBalanceType: newBalanceType, creditStatus: newCreditStatus };
}

// ============================================================
// SHARED: AR Adjustment for Customer (Dr balance system)
// Positive amount = customer owes more (increase Dr), Negative = customer owes less (decrease Dr)
// ============================================================

function applyCustomerArAdjustment(
  customer: { currentBalance: number; currentBalanceType: string; creditLimit: number; creditStatus: string },
  amount: number
): { currentBalance: number; currentBalanceType: string; creditStatus: string } {
  let newBalance = customer.currentBalance;
  let newBalanceType = customer.currentBalanceType;

  if (amount >= 0) {
    if (newBalanceType === 'Dr') {
      newBalance = safeFinancialAdd(newBalance, amount);
    } else {
      // Cr
      if (amount > newBalance) {
        newBalanceType = 'Dr';
        newBalance = safeFinancialSubtract(amount, newBalance);
      } else {
        newBalance = safeFinancialSubtract(newBalance, amount);
      }
      if (newBalance === 0) newBalanceType = 'Dr';
    }
  } else {
    const absAmount = Math.abs(amount);
    if (newBalanceType === 'Dr') {
      newBalance = safeFinancialSubtract(newBalance, absAmount);
      if (newBalance < 0) {
        newBalanceType = 'Cr';
        newBalance = Math.abs(newBalance);
      }
      if (newBalance === 0) newBalanceType = 'Dr';
    } else {
      // Cr
      newBalance = safeFinancialAdd(newBalance, absAmount);
    }
  }

  let newCreditStatus = customer.creditStatus;
  if (newBalanceType === 'Dr' && customer.creditLimit > 0 && newBalance > customer.creditLimit) {
    newCreditStatus = 'OverLimit';
  } else if (
    newCreditStatus === 'OverLimit' &&
    customer.creditLimit > 0 &&
    !(newBalanceType === 'Dr' && newBalance > customer.creditLimit)
  ) {
    newCreditStatus = 'Active';
  }

  return { currentBalance: newBalance, currentBalanceType: newBalanceType, creditStatus: newCreditStatus };
}

// ============================================================
// SHARED: Stock computation helper
// ============================================================

async function computeCurrentStock(productId: string, godownId?: string | null): Promise<number> {
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
// SHARED: Line-level Financial Computation for Replacement Order
// ============================================================

interface RPLLineInput {
  productId: string;
  replacementProductId?: string;
  quantity: number;
  rate: number;
  replacementRate?: number;
}

interface ComputedRPLLine {
  productId: string;
  replacementProductId: string | null;
  quantity: number;
  rate: number;
  replacementRate: number;
  total: number;
  replacementTotal: number;
  costPrice: number;
  replacementCostPrice: number;
  lineAdjustment: number;
}

function computeRPLLineFinancials(
  line: RPLLineInput,
  costPrice: number,
  replacementCostPrice: number
): ComputedRPLLine {
  const quantity = Number(line.quantity) || 0;
  const rate = Number(line.rate) || 0;
  const replacementRate = Number(line.replacementRate) || 0;

  const total = safeFinancialRound(quantity * rate);
  const replacementTotal = safeFinancialRound(quantity * replacementRate);

  // lineAdjustment = (replacementCostPrice - costPrice) * quantity
  const costDiff = safeFinancialSubtract(replacementCostPrice, costPrice);
  const lineAdjustment = safeFinancialRound(costDiff * quantity);

  return {
    productId: line.productId,
    replacementProductId: line.replacementProductId || null,
    quantity,
    rate,
    replacementRate,
    total,
    replacementTotal,
    costPrice,
    replacementCostPrice,
    lineAdjustment,
  };
}

// ============================================================
// Valid status transitions map
// ============================================================

const VALID_TRANSITIONS: Record<string, string[]> = {
  Pending: ['Approved', 'Cancelled'],
  Approved: ['Processing', 'Cancelled'],
  Processing: ['Completed', 'Cancelled'],
  Completed: [], // Terminal state
  Cancelled: [], // Terminal state
};

// ============================================================
// GET /api/replacements/[id] — Single replacement with full relations
// ============================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Replacements', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;

    const replacement = await db.replacementOrder.findUnique({
      where: { id },
      include: {
        salesOrder: {
          include: {
            customer: true,
          },
        },
        supplier: true,
        customer: true,
        company: true,
        lines: {
          include: {
            product: true,
            replacementProduct: true,
          },
        },
      },
    });

    if (!replacement) {
      return NextResponse.json(
        { error: 'Replacement order not found' },
        { status: 404 }
      );
    }

    // isActive check — 410 Gone for deleted
    if (!replacement.isActive) {
      return NextResponse.json(
        { error: 'This replacement order has been deleted.', deletedAt: replacement.updatedAt },
        { status: 410 }
      );
    }

    // VAT Auditor masking
    const maskedReplacement = maskForVatAuditorFinancial(
      replacement as unknown as Record<string, unknown>,
      security.user.role
    );

    return NextResponse.json(maskedReplacement);
  } catch (error) {
    console.error('[Replacements] GET [id] error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch replacement order' },
      { status: 500 }
    );
  }
}

// ============================================================
// PUT /api/replacements/[id] — Update replacement with status transitions,
// financial recalculation, stock adjustment on status changes,
// and ledger reversal on cancellation
// ============================================================

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Replacements', 'PUT');
  if (!security.authorized) return security.response;

  // Dealer: blocked from modifying replacements
  if (security.user.role === 'dealer') {
    return NextResponse.json(
      { error: 'Access denied. Dealer role cannot modify replacement orders.' },
      { status: 403 }
    );
  }

  // SR: cannot create or modify replacements
  if (security.user.role === 'sr') {
    return NextResponse.json(
      { error: 'Access denied. SR role cannot modify replacement orders.' },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const {
      salesOrderId,
      supplierId,
      customerId,
      date,
      reason,
      status: newStatus,
      notes,
      lines,
    } = body;

    // Fetch existing record
    const existing = await db.replacementOrder.findUnique({
      where: { id },
      include: {
        lines: true,
        supplier: true,
        customer: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Replacement order not found' },
        { status: 404 }
      );
    }

    if (!existing.isActive) {
      return NextResponse.json(
        { error: 'Cannot update a deleted replacement order.' },
        { status: 410 }
      );
    }

    // Company isolation
    if (security.user.companyId && security.user.role !== 'admin' && existing.companyId !== security.user.companyId) {
      return NextResponse.json(
        { error: 'Access denied. You can only modify replacement orders within your company.' },
        { status: 403 }
      );
    }

    // Period close guard
    const periodLock = await checkPeriodClose(date ? new Date(date) : existing.date);
    if (periodLock) return periodLock;

    // Status transition validation
    if (newStatus && newStatus !== existing.status) {
      const allowedTransitions = VALID_TRANSITIONS[existing.status] || [];
      if (!allowedTransitions.includes(newStatus)) {
        return NextResponse.json(
          {
            error: `Invalid status transition from "${existing.status}" to "${newStatus}". Allowed transitions: ${allowedTransitions.length > 0 ? allowedTransitions.join(', ') : 'None (terminal state)'}`,
          },
          { status: 400 }
        );
      }
    }

    // Line modification only allowed when status is Pending
    if (lines && existing.status !== 'Pending') {
      return NextResponse.json(
        { error: `Line modification is only allowed when status is "Pending". Current status: "${existing.status}"` },
        { status: 400 }
      );
    }

    // ── Transaction: update with full financial recalculation ──
    const result = await db.$transaction(async (tx) => {
      let originalCostTotal = existing.originalCostTotal;
      let replacementCostTotal = existing.replacementCostTotal;
      let adjustmentAmount = existing.adjustmentAmount;
      let computedLines: ComputedRPLLine[] | null = null;

      // ── Financial Adjustment Recalculation when lines change ──
      if (lines && Array.isArray(lines) && lines.length > 0) {
        computedLines = [];

        for (const line of lines) {
          if (!line.productId) {
            throw Object.assign(new Error('VALIDATION_ERROR'), {
              validationError: 'Each line must have a productId',
            });
          }

          // Look up Product.costPrice for the original product
          const originalProduct = await tx.product.findUnique({
            where: { id: line.productId },
            select: { costPrice: true, name: true },
          });

          if (!originalProduct) {
            throw Object.assign(new Error('VALIDATION_ERROR'), {
              validationError: `Product with ID "${line.productId}" not found.`,
            });
          }

          const costPrice = originalProduct.costPrice || 0;

          // Look up Product.costPrice for replacement product (if provided)
          let replacementCostPrice = 0;
          if (line.replacementProductId) {
            const replacementProduct = await tx.product.findUnique({
              where: { id: line.replacementProductId },
              select: { costPrice: true, name: true },
            });

            if (!replacementProduct) {
              throw Object.assign(new Error('VALIDATION_ERROR'), {
                validationError: `Replacement product with ID "${line.replacementProductId}" not found.`,
              });
            }

            replacementCostPrice = replacementProduct.costPrice || 0;
          }

          const computed = computeRPLLineFinancials(
            {
              productId: line.productId,
              replacementProductId: line.replacementProductId,
              quantity: Number(line.quantity) || 0,
              rate: Number(line.rate) || 0,
              replacementRate: Number(line.replacementRate) || 0,
            },
            costPrice,
            replacementCostPrice
          );

          computedLines.push(computed);
        }

        // Recalculate order-level financials
        originalCostTotal = computedLines.reduce(
          (sum, l) => safeFinancialAdd(sum, safeFinancialRound(l.costPrice * l.quantity)),
          0
        );
        replacementCostTotal = computedLines.reduce(
          (sum, l) => safeFinancialAdd(sum, safeFinancialRound(l.replacementCostPrice * l.quantity)),
          0
        );
        adjustmentAmount = safeFinancialSubtract(replacementCostTotal, originalCostTotal);

        // If financialAdjustmentPosted, reverse old adjustment and apply new one
        if (existing.financialAdjustmentPosted && existing.adjustmentAmount !== 0) {
          // Reverse old adjustment
          const oldAdjustment = existing.adjustmentAmount;

          if (existing.supplierId) {
            const supplier = await tx.supplier.findUnique({
              where: { id: existing.supplierId },
              select: {
                id: true,
                currentBalance: true,
                currentBalanceType: true,
                creditLimit: true,
                creditStatus: true,
              },
            });

            if (supplier) {
              // Reverse: negate the old adjustment
              const reversed = applySupplierApAdjustment(supplier, -oldAdjustment);
              await tx.supplier.update({
                where: { id: existing.supplierId },
                data: {
                  currentBalance: reversed.currentBalance,
                  currentBalanceType: reversed.currentBalanceType,
                  ...(reversed.creditStatus !== supplier.creditStatus && {
                    creditStatus: reversed.creditStatus,
                  }),
                },
              });
            }
          }

          if (existing.customerId) {
            const customerRecord = await tx.customer.findUnique({
              where: { id: existing.customerId },
              select: {
                id: true,
                currentBalance: true,
                currentBalanceType: true,
                creditLimit: true,
                creditStatus: true,
              },
            });

            if (customerRecord) {
              // Reverse: negate the old adjustment
              const reversed = applyCustomerArAdjustment(customerRecord, -oldAdjustment);
              await tx.customer.update({
                where: { id: existing.customerId },
                data: {
                  currentBalance: reversed.currentBalance,
                  currentBalanceType: reversed.currentBalanceType,
                  ...(reversed.creditStatus !== customerRecord.creditStatus && {
                    creditStatus: reversed.creditStatus,
                  }),
                },
              });
            }
          }

          // Apply new adjustment
          if (adjustmentAmount !== 0) {
            const effectiveSupplierId = supplierId || existing.supplierId;
            const effectiveCustomerId = customerId || existing.customerId;

            if (effectiveSupplierId) {
              const supplier = await tx.supplier.findUnique({
                where: { id: effectiveSupplierId },
                select: {
                  id: true,
                  currentBalance: true,
                  currentBalanceType: true,
                  creditLimit: true,
                  creditStatus: true,
                },
              });

              if (supplier) {
                const adjusted = applySupplierApAdjustment(supplier, adjustmentAmount);
                await tx.supplier.update({
                  where: { id: effectiveSupplierId },
                  data: {
                    currentBalance: adjusted.currentBalance,
                    currentBalanceType: adjusted.currentBalanceType,
                    ...(adjusted.creditStatus !== supplier.creditStatus && {
                      creditStatus: adjusted.creditStatus,
                    }),
                  },
                });
              }
            }

            if (effectiveCustomerId) {
              const customerRecord = await tx.customer.findUnique({
                where: { id: effectiveCustomerId },
                select: {
                  id: true,
                  currentBalance: true,
                  currentBalanceType: true,
                  creditLimit: true,
                  creditStatus: true,
                },
              });

              if (customerRecord) {
                const adjusted = applyCustomerArAdjustment(customerRecord, adjustmentAmount);
                await tx.customer.update({
                  where: { id: effectiveCustomerId },
                  data: {
                    currentBalance: adjusted.currentBalance,
                    currentBalanceType: adjusted.currentBalanceType,
                    ...(adjusted.creditStatus !== customerRecord.creditStatus && {
                      creditStatus: adjusted.creditStatus,
                    }),
                  },
                });
              }
            }
          }
        }

        // Reverse old stock entries and create new ones
        if (existing.stockAdjustmentPosted) {
          // Reverse old stock entries (IN for original OUT, OUT for original IN)
          for (const oldLine of existing.lines) {
            // Reverse OUT for original product → create IN
            await tx.stockEntry.create({
              data: {
                productId: oldLine.productId,
                type: 'IN',
                quantity: oldLine.quantity,
                reference: existing.replacementNo,
                referenceType: 'Replacement',
                date: existing.date,
                notes: `Reversal: replacement order ${existing.replacementNo} line update`,
              },
            });

            // Reverse IN for replacement product → create OUT
            if (oldLine.replacementProductId) {
              await tx.stockEntry.create({
                data: {
                  productId: oldLine.replacementProductId,
                  type: 'OUT',
                  quantity: oldLine.quantity,
                  reference: existing.replacementNo,
                  referenceType: 'Replacement',
                  date: existing.date,
                  notes: `Reversal: replacement order ${existing.replacementNo} line update`,
                },
              });
            }
          }
        }

        // Create new stock entries for new lines (unless being cancelled)
        const effectiveStatus = newStatus || existing.status;
        if (effectiveStatus !== 'Cancelled') {
          for (const line of computedLines) {
            // Original product: OUT (removed from inventory)
            await tx.stockEntry.create({
              data: {
                productId: line.productId,
                type: 'OUT',
                quantity: line.quantity,
                reference: existing.replacementNo,
                referenceType: 'Replacement',
                date: date ? new Date(date) : existing.date,
                notes: `Replacement order ${existing.replacementNo}: original product removed (updated)`,
              },
            });

            // Replacement product: IN (enters inventory)
            if (line.replacementProductId) {
              await tx.stockEntry.create({
                data: {
                  productId: line.replacementProductId,
                  type: 'IN',
                  quantity: line.quantity,
                  reference: existing.replacementNo,
                  referenceType: 'Replacement',
                  date: date ? new Date(date) : existing.date,
                  notes: `Replacement order ${existing.replacementNo}: replacement product received (updated)`,
                },
              });
            }
          }
        }

        // Delete old lines and create new ones
        await tx.replacementOrderLine.deleteMany({
          where: { replacementOrderId: id },
        });
      }

      // ── Stock Reversal on Status Change to Cancelled ──
      // If status changes to Cancelled and stockAdjustmentPosted: reverse stock entries
      if (newStatus === 'Cancelled' && existing.status !== 'Cancelled' && existing.stockAdjustmentPosted) {
        // Use new computed lines if available, otherwise use existing lines
        const linesToReverse = computedLines
          ? computedLines.map((cl) => ({
              productId: cl.productId,
              replacementProductId: cl.replacementProductId,
              quantity: cl.quantity,
            }))
          : existing.lines.map((l) => ({
              productId: l.productId,
              replacementProductId: l.replacementProductId,
              quantity: l.quantity,
            }));

        for (const line of linesToReverse) {
          // Reverse OUT for original product → create IN (restock original item)
          await tx.stockEntry.create({
            data: {
              productId: line.productId,
              type: 'IN',
              quantity: line.quantity,
              reference: existing.replacementNo,
              referenceType: 'Replacement',
              date: existing.date,
              notes: `Reversal: replacement order ${existing.replacementNo} cancelled`,
            },
          });

          // Reverse IN for replacement product → create OUT (remove replacement item)
          if (line.replacementProductId) {
            await tx.stockEntry.create({
              data: {
                productId: line.replacementProductId,
                type: 'OUT',
                quantity: line.quantity,
                reference: existing.replacementNo,
                referenceType: 'Replacement',
                date: existing.date,
                notes: `Reversal: replacement order ${existing.replacementNo} cancelled`,
              },
            });
          }
        }
      }

      // ── Ledger Reversal on Cancelled ──
      if (newStatus === 'Cancelled' && existing.status !== 'Cancelled' && existing.financialAdjustmentPosted) {
        // Use recalculated adjustment if lines were changed, otherwise use existing
        const adjustmentToReverse = computedLines
          ? adjustmentAmount
          : existing.adjustmentAmount;

        // Reverse the adjustment: negate it
        if (adjustmentToReverse !== 0) {
          if (existing.supplierId) {
            const supplier = await tx.supplier.findUnique({
              where: { id: existing.supplierId },
              select: {
                id: true,
                currentBalance: true,
                currentBalanceType: true,
                creditLimit: true,
                creditStatus: true,
              },
            });

            if (supplier) {
              const reversed = applySupplierApAdjustment(supplier, -adjustmentToReverse);
              await tx.supplier.update({
                where: { id: existing.supplierId },
                data: {
                  currentBalance: reversed.currentBalance,
                  currentBalanceType: reversed.currentBalanceType,
                  ...(reversed.creditStatus !== supplier.creditStatus && {
                    creditStatus: reversed.creditStatus,
                  }),
                },
              });
            }
          }

          if (existing.customerId) {
            const customerRecord = await tx.customer.findUnique({
              where: { id: existing.customerId },
              select: {
                id: true,
                currentBalance: true,
                currentBalanceType: true,
                creditLimit: true,
                creditStatus: true,
              },
            });

            if (customerRecord) {
              const reversed = applyCustomerArAdjustment(customerRecord, -adjustmentToReverse);
              await tx.customer.update({
                where: { id: existing.customerId },
                data: {
                  currentBalance: reversed.currentBalance,
                  currentBalanceType: reversed.currentBalanceType,
                  ...(reversed.creditStatus !== customerRecord.creditStatus && {
                    creditStatus: reversed.creditStatus,
                  }),
                },
              });
            }
          }
        }
      }

      // Build update data object
      const updateData: Record<string, unknown> = {};

      if (salesOrderId !== undefined) updateData.salesOrderId = salesOrderId || null;
      if (supplierId !== undefined) updateData.supplierId = supplierId || null;
      if (customerId !== undefined) updateData.customerId = customerId || null;
      if (date) updateData.date = new Date(date);
      if (reason !== undefined) updateData.reason = reason;
      if (notes !== undefined) updateData.notes = notes;

      if (newStatus) {
        updateData.status = newStatus;

        // If cancelled, reset posted flags
        if (newStatus === 'Cancelled') {
          updateData.stockAdjustmentPosted = false;
          updateData.financialAdjustmentPosted = false;
        }
      }

      // Update financial fields if lines were recalculated
      if (computedLines) {
        updateData.originalCostTotal = originalCostTotal;
        updateData.replacementCostTotal = replacementCostTotal;
        updateData.adjustmentAmount = adjustmentAmount;

        // Create new lines
        updateData.lines = {
          create: computedLines.map((cl) => ({
            productId: cl.productId,
            replacementProductId: cl.replacementProductId,
            quantity: cl.quantity,
            rate: cl.rate,
            replacementRate: cl.replacementRate,
            total: cl.total,
            replacementTotal: cl.replacementTotal,
            costPrice: cl.costPrice,
            replacementCostPrice: cl.replacementCostPrice,
            lineAdjustment: cl.lineAdjustment,
          })),
        };
      }

      // Update the replacement order
      const replacement = await tx.replacementOrder.update({
        where: { id },
        data: updateData,
        include: {
          salesOrder: { include: { customer: true } },
          supplier: true,
          customer: true,
          company: true,
          lines: { include: { product: true, replacementProduct: true } },
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'Replacements',
          recordId: replacement.id,
          recordLabel: replacement.replacementNo,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            replacementNo: replacement.replacementNo,
            previousStatus: existing.status,
            newStatus: newStatus || existing.status,
            linesChanged: !!computedLines,
            originalCostTotal,
            replacementCostTotal,
            adjustmentAmount,
          }),
        },
      });

      // Activity log
      await logUserActivity({
          tx: tx,
        action: 'UPDATE',
        module: 'Inv-Replacement-Order',
        recordId: replacement.id,
        recordLabel: replacement.replacementNo,
        userId: security.user.id,
        userName: security.user.name,
        details: `Updated replacement order ${replacement.replacementNo}: status ${existing.status} → ${newStatus || existing.status}${computedLines ? ', lines recalculated' : ''}`,
      });

      return replacement;
    }, { maxWait: 15000, timeout: 30000 }).catch((error: unknown) => {
      // Re-throw validation errors
      if (error instanceof Error && error.message === 'VALIDATION_ERROR') {
        const validationError = (error as Error & { validationError?: string }).validationError;
        return { _validationError: true, message: validationError };
      }
      throw error;
    });

    // Handle validation failure
    if (result && typeof result === 'object' && '_validationError' in result) {
      return NextResponse.json(
        { error: (result as { message: string }).message },
        { status: 400 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[Replacements] PUT [id] error:', error);
    return NextResponse.json(
      { error: 'Failed to update replacement order' },
      { status: 500 }
    );
  }
}

// ============================================================
// DELETE /api/replacements/[id] — Soft delete with stock reversal,
// ledger reversal, and auto-toggle OverLimit→Active
// ============================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Replacements', 'DELETE');
  if (!security.authorized) return security.response;

  // Manager cannot delete financial posts
  const deleteCheck = checkFinancialDeletePermission(security.user.role);
  if (deleteCheck) return deleteCheck;

  try {
    const { id } = await params;

    const existing = await db.replacementOrder.findUnique({
      where: { id },
      include: {
        lines: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Replacement order not found' },
        { status: 404 }
      );
    }

    if (!existing.isActive) {
      return NextResponse.json(
        { error: 'This replacement order has already been deleted.' },
        { status: 410 }
      );
    }

    // Company isolation
    if (security.user.companyId && security.user.role !== 'admin' && existing.companyId !== security.user.companyId) {
      return NextResponse.json(
        { error: 'Access denied. You can only delete replacement orders within your company.' },
        { status: 403 }
      );
    }

    // Period close guard
    const periodLock = await checkPeriodClose(existing.date);
    if (periodLock) return periodLock;

    // ── Transaction: soft delete with reversals ──
    await db.$transaction(async (tx) => {
      // ── Stock Reversal if stockAdjustmentPosted and not Cancelled ──
      if (existing.stockAdjustmentPosted && existing.status !== 'Cancelled') {
        for (const line of existing.lines) {
          // Reverse OUT for original product → create IN (restock original item)
          await tx.stockEntry.create({
            data: {
              productId: line.productId,
              type: 'IN',
              quantity: line.quantity,
              reference: existing.replacementNo,
              referenceType: 'Replacement',
              date: existing.date,
              notes: `Reversal: replacement order ${existing.replacementNo} deleted`,
            },
          });

          // Reverse IN for replacement product → create OUT (remove replacement item)
          if (line.replacementProductId) {
            await tx.stockEntry.create({
              data: {
                productId: line.replacementProductId,
                type: 'OUT',
                quantity: line.quantity,
                reference: existing.replacementNo,
                referenceType: 'Replacement',
                date: existing.date,
                notes: `Reversal: replacement order ${existing.replacementNo} deleted`,
              },
            });
          }
        }
      }

      // ── Ledger Reversal if financialAdjustmentPosted and not Cancelled ──
      if (existing.financialAdjustmentPosted && existing.adjustmentAmount !== 0 && existing.status !== 'Cancelled') {
        const adjustmentToReverse = existing.adjustmentAmount;

        // Reverse supplier AP adjustment
        if (existing.supplierId) {
          const supplier = await tx.supplier.findUnique({
            where: { id: existing.supplierId },
            select: {
              id: true,
              currentBalance: true,
              currentBalanceType: true,
              creditLimit: true,
              creditStatus: true,
            },
          });

          if (supplier) {
            const reversed = applySupplierApAdjustment(supplier, -adjustmentToReverse);
            await tx.supplier.update({
              where: { id: existing.supplierId },
              data: {
                currentBalance: reversed.currentBalance,
                currentBalanceType: reversed.currentBalanceType,
                ...(reversed.creditStatus !== supplier.creditStatus && {
                  creditStatus: reversed.creditStatus,
                }),
              },
            });
          }
        }

        // Reverse customer AR adjustment
        if (existing.customerId) {
          const customerRecord = await tx.customer.findUnique({
            where: { id: existing.customerId },
            select: {
              id: true,
              currentBalance: true,
              currentBalanceType: true,
              creditLimit: true,
              creditStatus: true,
            },
          });

          if (customerRecord) {
            const reversed = applyCustomerArAdjustment(customerRecord, -adjustmentToReverse);
            await tx.customer.update({
              where: { id: existing.customerId },
              data: {
                currentBalance: reversed.currentBalance,
                currentBalanceType: reversed.currentBalanceType,
                ...(reversed.creditStatus !== customerRecord.creditStatus && {
                  creditStatus: reversed.creditStatus,
                }),
              },
            });
          }
        }
      }

      // ── Auto-toggle OverLimit→Active for supplier if balance falls below credit limit ──
      if (existing.supplierId) {
        const supplier = await tx.supplier.findUnique({
          where: { id: existing.supplierId },
          select: {
            id: true,
            currentBalance: true,
            currentBalanceType: true,
            creditLimit: true,
            creditStatus: true,
          },
        });

        if (supplier && supplier.creditStatus === 'OverLimit' && supplier.creditLimit > 0) {
          if (!(supplier.currentBalanceType === 'Dr' && supplier.currentBalance > supplier.creditLimit)) {
            await tx.supplier.update({
              where: { id: existing.supplierId },
              data: { creditStatus: 'Active' },
            });
          }
        }
      }

      // ── Auto-toggle OverLimit→Active for customer if balance falls below credit limit ──
      if (existing.customerId) {
        const customerRecord = await tx.customer.findUnique({
          where: { id: existing.customerId },
          select: {
            id: true,
            currentBalance: true,
            currentBalanceType: true,
            creditLimit: true,
            creditStatus: true,
          },
        });

        if (customerRecord && customerRecord.creditStatus === 'OverLimit' && customerRecord.creditLimit > 0) {
          if (!(customerRecord.currentBalanceType === 'Dr' && customerRecord.currentBalance > customerRecord.creditLimit)) {
            await tx.customer.update({
              where: { id: existing.customerId },
              data: { creditStatus: 'Active' },
            });
          }
        }
      }

      // Soft delete: set flags to false
      await tx.replacementOrder.update({
        where: { id },
        data: {
          isActive: false,
          financialAdjustmentPosted: false,
          stockAdjustmentPosted: false,
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'Replacements',
          recordId: existing.id,
          recordLabel: existing.replacementNo,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            replacementNo: existing.replacementNo,
            softDelete: true,
            stockReversed: existing.stockAdjustmentPosted && existing.status !== 'Cancelled',
            ledgerReversed: existing.financialAdjustmentPosted && existing.status !== 'Cancelled',
          }),
        },
      });

      // Activity log
      await logUserActivity({
          tx: tx,
        action: 'DELETE',
        module: 'Inv-Replacement-Order',
        recordId: existing.id,
        recordLabel: existing.replacementNo,
        userId: security.user.id,
        userName: security.user.name,
        details: `Deleted replacement order ${existing.replacementNo}${existing.stockAdjustmentPosted ? ' (stock reversed)' : ''}${existing.financialAdjustmentPosted ? ' (ledger reversed)' : ''}`,
      });
    }, { maxWait: 15000, timeout: 30000 });

    return NextResponse.json({ message: 'Replacement order deleted successfully' });
  } catch (error) {
    console.error('[Replacements] DELETE [id] error:', error);
    return NextResponse.json(
      { error: 'Failed to delete replacement order' },
      { status: 500 }
    );
  }
}
