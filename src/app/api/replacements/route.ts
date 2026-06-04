import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  checkPeriodClose,
  safeFinancialRound,
  safeFinancialAdd,
  safeFinancialSubtract,
  maskForVatAuditorFinancial,
  maskFinancialArray,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

/**
 * Strip HTML tags from a string to prevent XSS in text fields.
 */
function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '').trim();
}

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
// SHARED: Auto-generate replacementNo: RPL-XXXXX
// ============================================================

async function generateReplacementNo(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]): Promise<string> {
  const allRPLs = await tx.replacementOrder.findMany({
    select: { replacementNo: true },
  });

  let maxNum = 0;
  for (const rpl of allRPLs) {
    if (rpl.replacementNo) {
      const match = rpl.replacementNo.match(/RPL-(\d+)/);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
    }
  }
  return `RPL-${String(maxNum + 1).padStart(5, '0')}`;
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
// Currency formatting helper
// ============================================================

const fmtBD = (v: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

// ============================================================
// GET /api/replacements — List all replacement orders with relations
// ============================================================

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Replacements', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const supplierId = searchParams.get('supplierId');
    const customerId = searchParams.get('customerId');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    const where: Record<string, unknown> = { isActive: true };

    if (status) where.status = status;
    if (supplierId) where.supplierId = supplierId;
    if (customerId) where.customerId = customerId;

    // Date range filter
    if (dateFrom || dateTo) {
      const dateFilter: Record<string, Date> = {};
      if (dateFrom) dateFilter.gte = new Date(dateFrom);
      if (dateTo) dateFilter.lte = new Date(dateTo);
      where.date = dateFilter;
    }

    // Company isolation for non-admin users
    if (security.user.companyId && security.user.role !== 'admin') {
      where.companyId = security.user.companyId;
    }

    const replacements = await db.replacementOrder.findMany({
      where,
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
      orderBy: { createdAt: 'desc' },
    });

    // Apply VAT Auditor masking
    const maskedReplacements = maskFinancialArray(
      replacements as unknown as Record<string, unknown>[],
      security.user.role,
      ['adjustmentAmount', 'originalCostTotal', 'replacementCostTotal', 'total', 'replacementTotal', 'costPrice', 'replacementCostPrice', 'lineAdjustment', 'rate', 'replacementRate']
    );

    return NextResponse.json(maskedReplacements);
  } catch (error) {
    console.error('[Replacements] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch replacement orders' },
      { status: 500 }
    );
  }
}

// ============================================================
// POST /api/replacements — Create replacement order with Financial Adjustment Engine
// ============================================================

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Replacements', 'POST');
  if (!security.authorized) return security.response;

  // Dealer: blocked from creating replacements
  if (security.user.role === 'dealer') {
    return NextResponse.json(
      { error: 'Access denied. Dealer role cannot create replacement orders.' },
      { status: 403 }
    );
  }

  // SR: cannot create or modify replacements
  if (security.user.role === 'sr') {
    return NextResponse.json(
      { error: 'Access denied. SR role cannot create replacement orders.' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const {
      salesOrderId,
      supplierId,
      customerId,
      date,
      reason,
      status: inputStatus,
      notes,
      referenceKey,
      lines,
    } = body;

    // ── Validation ──
    if (!date) {
      return NextResponse.json(
        { error: 'date is required' },
        { status: 400 }
      );
    }

    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json(
        { error: 'At least one line item is required' },
        { status: 400 }
      );
    }

    // Validate each line has productId and quantity
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].productId) {
        return NextResponse.json(
          { error: `Line ${i + 1}: productId is required` },
          { status: 400 }
        );
      }
      if (!lines[i].quantity || Number(lines[i].quantity) <= 0) {
        return NextResponse.json(
          { error: `Line ${i + 1}: quantity must be greater than 0` },
          { status: 400 }
        );
      }
    }

    // Period close guard
    const periodLock = await checkPeriodClose(new Date(date));
    if (periodLock) return periodLock;

    // Idempotency check via referenceKey
    if (referenceKey) {
      const existing = await db.replacementOrder.findFirst({
        where: { referenceKey },
      });
      if (existing) {
        return NextResponse.json(
          {
            error: 'Duplicate submission detected. This replacement order has already been created.',
            referenceKey,
            existingId: existing.id,
          },
          { status: 409 }
        );
      }
    }

    // Validate salesOrderId if provided
    if (salesOrderId) {
      const salesOrder = await db.salesOrder.findUnique({
        where: { id: salesOrderId },
      });
      if (!salesOrder) {
        return NextResponse.json(
          { error: 'Sales order not found' },
          { status: 400 }
        );
      }
    }

    // Validate supplierId if provided
    if (supplierId) {
      const supplier = await db.supplier.findUnique({
        where: { id: supplierId },
      });
      if (!supplier) {
        return NextResponse.json(
          { error: 'Supplier not found' },
          { status: 400 }
        );
      }
    }

    // Validate customerId if provided
    if (customerId) {
      const customer = await db.customer.findUnique({
        where: { id: customerId },
      });
      if (!customer) {
        return NextResponse.json(
          { error: 'Customer not found' },
          { status: 400 }
        );
      }
    }

    // Determine company ID
    const companyId = security.user.companyId || null;

    // Validate status — only allow Pending on creation
    const validStatuses = ['Pending', 'Approved', 'Processing', 'Completed', 'Cancelled'];
    const replacementStatus = inputStatus && validStatuses.includes(inputStatus) ? inputStatus : 'Pending';

    // ── Transaction: create with Financial Adjustment Engine ──
    const result = await db.$transaction(async (tx) => {
      // ── Process lines with Financial Adjustment Engine ──
      const computedLines: ComputedRPLLine[] = [];

      for (const line of lines) {
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

        // Stock safety verification for original product (must have stock to remove)
        const currentStock = await computeCurrentStock(line.productId);
        const requestedQty = Number(line.quantity) || 0;
        if (currentStock < requestedQty) {
          throw Object.assign(new Error('VALIDATION_ERROR'), {
            validationError: `Insufficient stock for product "${originalProduct.name}". Available: ${fmtBD(currentStock)}, Requested: ${fmtBD(requestedQty)}`,
          });
        }

        const computed = computeRPLLineFinancials(
          {
            productId: line.productId,
            replacementProductId: line.replacementProductId,
            quantity: requestedQty,
            rate: Number(line.rate) || 0,
            replacementRate: Number(line.replacementRate) || 0,
          },
          costPrice,
          replacementCostPrice
        );

        computedLines.push(computed);
      }

      // ── Calculate order-level financials ──
      const originalCostTotal = computedLines.reduce(
        (sum, l) => safeFinancialAdd(sum, safeFinancialRound(l.costPrice * l.quantity)),
        0
      );
      const replacementCostTotal = computedLines.reduce(
        (sum, l) => safeFinancialAdd(sum, safeFinancialRound(l.replacementCostPrice * l.quantity)),
        0
      );
      const adjustmentAmount = safeFinancialSubtract(replacementCostTotal, originalCostTotal);

      // Auto-generate replacementNo
      const replacementNo = await generateReplacementNo(tx);

      // Determine if we should post stock & financial adjustments
      const shouldPostStock = replacementStatus !== 'Cancelled';
      const shouldPostFinancial = adjustmentAmount !== 0 && replacementStatus !== 'Cancelled';

      // Create ReplacementOrder with lines
      const replacement = await tx.replacementOrder.create({
        data: {
          replacementNo,
          salesOrderId: salesOrderId || null,
          supplierId: supplierId || null,
          customerId: customerId || null,
          date: new Date(date),
          reason: reason ? stripHtml(String(reason)) : null,
          status: replacementStatus,
          companyId,
          financialAdjustmentPosted: shouldPostFinancial,
          stockAdjustmentPosted: shouldPostStock,
          adjustmentAmount,
          originalCostTotal,
          replacementCostTotal,
          notes: notes ? stripHtml(String(notes)) : null,
          referenceKey: referenceKey || null,
          lines: {
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
          },
        },
        include: {
          salesOrder: { include: { customer: true } },
          supplier: true,
          customer: true,
          company: true,
          lines: { include: { product: true, replacementProduct: true } },
        },
      });

      // ── Stock Adjustment ──
      // Original product: OUT (removed from inventory — returned to supplier or scrapped)
      // Replacement product: IN (enters inventory from supplier)
      if (shouldPostStock) {
        for (const line of computedLines) {
          await tx.stockEntry.create({
            data: {
              productId: line.productId,
              type: 'OUT',
              quantity: line.quantity,
              reference: replacementNo,
              referenceType: 'Replacement',
              date: new Date(date),
              notes: `Replacement order ${replacementNo}: original product removed`,
            },
          });

          // Replacement product: IN (enters inventory from supplier)
          if (line.replacementProductId) {
            await tx.stockEntry.create({
              data: {
                productId: line.replacementProductId,
                type: 'IN',
                quantity: line.quantity,
                reference: replacementNo,
                referenceType: 'Replacement',
                date: new Date(date),
                notes: `Replacement order ${replacementNo}: replacement product received`,
              },
            });
          }
        }
      }

      // ── Ledger Adjustments ──
      // When adjustmentAmount > 0 (replacement costs more):
      //   If supplierId exists: Increase Supplier Cr (we owe more to supplier)
      //   If customerId exists: Increase Customer Dr (customer owes more)
      // When adjustmentAmount < 0 (replacement costs less):
      //   If supplierId exists: Decrease Supplier Cr
      //   If customerId exists: Decrease Customer Dr
      if (shouldPostFinancial) {
        if (supplierId) {
          const supplier = await tx.supplier.findUnique({
            where: { id: supplierId },
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
              where: { id: supplierId },
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

        if (customerId) {
          const customerRecord = await tx.customer.findUnique({
            where: { id: customerId },
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
              where: { id: customerId },
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

      // Audit log
      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'Replacements',
          recordId: replacement.id,
          recordLabel: replacementNo,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            replacementNo,
            salesOrderId: salesOrderId || null,
            supplierId: supplierId || null,
            customerId: customerId || null,
            originalCostTotal,
            replacementCostTotal,
            adjustmentAmount,
            financialAdjustmentPosted: shouldPostFinancial,
            stockAdjustmentPosted: shouldPostStock,
            lineCount: computedLines.length,
          }),
        },
      });

      // Activity log
      await logUserActivity({
          tx: tx,
        action: 'CREATE',
        module: 'Inv-Replacement-Order',
        recordId: replacement.id,
        recordLabel: replacementNo,
        userId: security.user.id,
        userName: security.user.name,
        details: `Created replacement order ${replacementNo} with ${computedLines.length} lines, originalCostTotal=৳${fmtBD(originalCostTotal)}, replacementCostTotal=৳${fmtBD(replacementCostTotal)}, adjustmentAmount=৳${fmtBD(adjustmentAmount)}`,
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

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('[Replacements] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to create replacement order' },
      { status: 500 }
    );
  }
}
