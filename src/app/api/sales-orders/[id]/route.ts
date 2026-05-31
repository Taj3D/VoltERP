import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  checkPeriodClose,
  maskForVatAuditor,
  maskForVatAuditorFinancial,
  safeFinancialRound,
  safeFinancialAdd,
  safeFinancialSubtract,
  checkFinancialDeletePermission,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';
import { dispatchAutoSms, buildPurchaseSms } from '@/lib/sms-auto-trigger';

// ─────────────────────────────────────────────────────────────
// Helper: normalize empty strings to null for optional fields
// ─────────────────────────────────────────────────────────────
function nullIfEmpty(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
}

// ─────────────────────────────────────────────────────────────
// Helper: Find or Create CoA Account for double-entry ledger
// ─────────────────────────────────────────────────────────────
async function findOrCreateCoAAccount(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  name: string,
  classification: string,
  parentCode: string,
  companyId: string | null
): Promise<string> {
  // Try to find existing
  let account = await tx.chartOfAccount.findFirst({
    where: { name, classification, ...(companyId && { companyId }) },
  });
  if (account) return account.id;

  // Find parent
  const parent = await tx.chartOfAccount.findFirst({
    where: { code: parentCode, ...(companyId && { companyId }) },
  });

  // Create
  const code = `COA-${String(Date.now()).slice(-5)}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
  account = await tx.chartOfAccount.create({
    data: {
      code,
      name,
      classification,
      parentAccountId: parent?.id || null,
      ...(companyId && { companyId }),
    },
  });
  return account.id;
}

// ─────────────────────────────────────────────────────────────
// GET /api/sales-orders/[id] - Single sales order with
// cross-tenant validation, VAT masking, and customer credit info
// ─────────────────────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'SalesOrders', 'GET');
  if (!security.authorized) return security.response;

  const role = security.user.role;
  const companyId = security.user.companyId;

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

    if (!salesOrder || !salesOrder.isActive) {
      return NextResponse.json(
        { error: 'Sales order not found' },
        { status: 404 }
      );
    }

    // Cross-tenant validation
    if (companyId && salesOrder.companyId && salesOrder.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Sales order not found' },
        { status: 404 }
      );
    }

    // Calculate customer credit info for Credit Shield
    let customerCreditInfo: {
      creditLimit: number;
      currentOutstanding: number;
    } | null = null;

    if (salesOrder.customer && salesOrder.customer.creditLimit > 0) {
      const existingOrders = await db.salesOrder.findMany({
        where: {
          customerId: salesOrder.customerId,
          status: { not: 'Cancelled' },
          isActive: true,
        },
        select: { grandTotal: true },
      });
      const totalOrderValue = existingOrders.reduce(
        (sum, o) => safeFinancialAdd(sum, o.grandTotal),
        0
      );

      const existingCollections = await db.cashCollection.findMany({
        where: {
          customerId: salesOrder.customerId,
          status: 'Approved',
          isActive: true,
        },
        select: { amount: true },
      });
      const totalCollections = existingCollections.reduce(
        (sum, c) => safeFinancialAdd(sum, c.amount),
        0
      );

      const outstanding = safeFinancialSubtract(totalOrderValue, totalCollections);

      customerCreditInfo = {
        creditLimit: salesOrder.customer.creditLimit,
        currentOutstanding: outstanding,
      };
    }

    // Enrich with customerName, godownName, paymentOptionName
    const enriched = {
      ...salesOrder,
      customerName: salesOrder.customer?.name || '',
      godownName: salesOrder.godown?.name || '',
      paymentOptionName: salesOrder.paymentOption?.name || '',
      customerCreditInfo,
    };

    // Apply VAT Auditor masking
    let masked = maskForVatAuditorFinancial(enriched, role);

    // Mask additional sales-order-specific fields
    masked = maskForVatAuditor(
      masked,
      role,
      ['subTotal', 'discount', 'vatAmount', 'grandTotal', 'deliveryCost', 'cashAmount', 'bankAmount', 'mfsAmount', 'cardAmount']
    );

    // Mask line-level financial fields
    if (Array.isArray(masked.lines)) {
      masked = {
        ...masked,
        lines: masked.lines.map((line: Record<string, unknown>) =>
          maskForVatAuditor(line, role, ['rate', 'discountPercent', 'discountAmount', 'vatAmount', 'total'])
        ),
      };
    }

    return NextResponse.json(masked);
  } catch (error) {
    console.error('Error fetching sales order:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sales order' },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────
// PUT /api/sales-orders/[id] - Same validations as POST,
// credit shield check on updates, stock/ledger operations
// when status transitions to Confirmed/Delivered
// ─────────────────────────────────────────────────────────────
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'SalesOrders', 'PUT');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;
  const userId = security.user.id;
  const userName = security.user.name;
  const userRole = security.user.role;

  try {
    const { id } = await params;
    const body = await request.json();
    const {
      customerId,
      date,
      godownId,
      discount,
      paymentOptionId,
      notes,
      status,
      vatPercentage,
      lines,
      deliveryCost,
      dueDate,
      cashAmount,
      bankAmount,
      mfsAmount,
      cardAmount,
      creditOverride,
    } = body;

    // ── Fetch existing record for validation ──
    const existing = await db.salesOrder.findUnique({
      where: { id },
      include: {
        customer: true,
        godown: true,
        paymentOption: true,
        lines: { include: { product: true } },
      },
    });

    if (!existing || !existing.isActive) {
      return NextResponse.json(
        { error: 'Sales order not found' },
        { status: 404 }
      );
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Sales order not found' },
        { status: 404 }
      );
    }

    // Period-close lock check
    const periodLock = await checkPeriodClose(
      date ? new Date(date) : existing.date || new Date()
    );
    if (periodLock) return periodLock;

    // ── 1. Godown Status Validation (SUSPENDED = 403) ──
    const effectiveGodownId = godownId !== undefined ? (godownId || null) : existing.godownId;
    if (effectiveGodownId) {
      const godown = await db.godown.findUnique({ where: { id: effectiveGodownId } });
      if (godown && godown.status === 'SUSPENDED') {
        return NextResponse.json(
          { error: `Godown "${godown.name}" is SUSPENDED. All stock operations are blocked. Contact an administrator.` },
          { status: 403 }
        );
      }
    }

    // ── 2. Strict Numeric Validation (400) ──
    let processedLines: {
      productId: string;
      quantity: number;
      rate: number;
      discountPercent: number;
      discountAmount: number;
      vatAmount: number;
      total: number;
    }[] | undefined;

    if (lines && Array.isArray(lines)) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineQty = Number(line.quantity);
        const lineRate = Number(line.rate);

        if (!line.productId) {
          return NextResponse.json(
            { error: `Line ${i + 1}: productId is required` },
            { status: 400 }
          );
        }
        if (isNaN(lineQty) || lineQty <= 0) {
          return NextResponse.json(
            { error: `Line ${i + 1}: quantity must be greater than 0` },
            { status: 400 }
          );
        }
        if (isNaN(lineRate) || lineRate <= 0) {
          return NextResponse.json(
            { error: `Line ${i + 1}: rate must be greater than 0` },
            { status: 400 }
          );
        }
      }

      processedLines = lines.map((line: Record<string, unknown>) => {
        const lineQty = Number(line.quantity) || 0;
        const lineRate = Number(line.rate) || 0;
        const lineDiscPct = Number(line.discountPercent) || 0;
        const lineDiscAmt = Number(line.discountAmount) || safeFinancialRound(lineQty * lineRate * (lineDiscPct / 100));
        const lineGross = safeFinancialRound(lineQty * lineRate);
        const afterLineDisc = safeFinancialSubtract(lineGross, lineDiscAmt);
        const lineVatAmt = Number(line.vatAmount) || 0;
        const lineTotal = safeFinancialAdd(afterLineDisc, lineVatAmt);
        return {
          productId: line.productId as string,
          quantity: lineQty,
          rate: lineRate,
          discountPercent: lineDiscPct,
          discountAmount: lineDiscAmt,
          vatAmount: lineVatAmt,
          total: lineTotal,
        };
      });
    }

    // deliveryCost validation
    const effectiveDeliveryCost = deliveryCost !== undefined ? Number(deliveryCost) : existing.deliveryCost;
    if (effectiveDeliveryCost < 0) {
      return NextResponse.json(
        { error: 'deliveryCost must be greater than or equal to 0' },
        { status: 400 }
      );
    }

    // Payment breakdown validation
    if (cashAmount !== undefined && Number(cashAmount) < 0) {
      return NextResponse.json(
        { error: 'cashAmount must be >= 0' },
        { status: 400 }
      );
    }
    if (bankAmount !== undefined && Number(bankAmount) < 0) {
      return NextResponse.json(
        { error: 'bankAmount must be >= 0' },
        { status: 400 }
      );
    }
    if (mfsAmount !== undefined && Number(mfsAmount) < 0) {
      return NextResponse.json(
        { error: 'mfsAmount must be >= 0' },
        { status: 400 }
      );
    }
    if (cardAmount !== undefined && Number(cardAmount) < 0) {
      return NextResponse.json(
        { error: 'cardAmount must be >= 0' },
        { status: 400 }
      );
    }

    // ── Calculate totals from lines if provided ──
    let subTotal: number | undefined;
    let vatAmount: number | undefined;
    let grandTotal: number | undefined;

    const totalDiscount = discount !== undefined ? Number(discount) : existing.discount;
    const vatPct = vatPercentage !== undefined ? Number(vatPercentage) : existing.vatPercentage;

    if (processedLines) {
      subTotal = safeFinancialRound(processedLines.reduce((sum, l) => safeFinancialAdd(sum, l.total), 0));
      const afterDiscount = safeFinancialSubtract(subTotal, totalDiscount);
      const afterDelivery = safeFinancialAdd(afterDiscount, effectiveDeliveryCost);
      vatAmount = safeFinancialRound(afterDelivery * (vatPct / 100));
      grandTotal = safeFinancialAdd(afterDelivery, vatAmount);
    } else if (discount !== undefined || vatPercentage !== undefined || deliveryCost !== undefined) {
      // Recalculate from existing lines
      subTotal = existing.lines.reduce((sum, l) => safeFinancialAdd(sum, l.total), 0);
      const afterDiscount = safeFinancialSubtract(subTotal, totalDiscount);
      const afterDelivery = safeFinancialAdd(afterDiscount, effectiveDeliveryCost);
      vatAmount = safeFinancialRound(afterDelivery * (vatPct / 100));
      grandTotal = safeFinancialAdd(afterDelivery, vatAmount);
    }

    // ── 4. B2B Customer Credit Shield Interlock on updates ──
    const effectiveCustomerId = customerId || existing.customerId;
    const effectiveGrandTotal = grandTotal || existing.grandTotal;
    const effectiveStatus = status || existing.status;

    const customer = await db.customer.findUnique({
      where: { id: effectiveCustomerId },
      include: { coaAccount: true },
    });

    let creditOverrideApplied = existing.creditOverride;
    let overrideByUser = existing.overrideBy;

    if (customer && customer.creditLimit > 0 && effectiveGrandTotal !== existing.grandTotal) {
      // Recalculate credit check if grandTotal changed
      const existingOrders = await db.salesOrder.findMany({
        where: {
          customerId: effectiveCustomerId,
          status: { not: 'Cancelled' },
          isActive: true,
          id: { not: id }, // Exclude current order from calculation
        },
        select: { grandTotal: true },
      });
      const totalOrderValue = existingOrders.reduce(
        (sum, o) => safeFinancialAdd(sum, o.grandTotal),
        0
      );

      const existingCollections = await db.cashCollection.findMany({
        where: { customerId: effectiveCustomerId, status: 'Approved', isActive: true },
        select: { amount: true },
      });
      const totalCollections = existingCollections.reduce(
        (sum, c) => safeFinancialAdd(sum, c.amount),
        0
      );

      const currentOutstanding = safeFinancialSubtract(totalOrderValue, totalCollections);

      if (safeFinancialAdd(currentOutstanding, effectiveGrandTotal) > customer.creditLimit) {
        if (creditOverride === true && userRole === 'admin') {
          creditOverrideApplied = true;
          overrideByUser = userId;
        } else {
          const excess = safeFinancialSubtract(
            safeFinancialAdd(currentOutstanding, effectiveGrandTotal),
            customer.creditLimit
          );
          return NextResponse.json(
            {
              error: 'Credit Shield Violation: Customer balance threshold breached. Transaction rejected.',
              creditShieldViolation: true,
              currentDue: currentOutstanding,
              newOrderValue: effectiveGrandTotal,
              creditLimit: customer.creditLimit,
              excess,
            },
            { status: 422 }
          );
        }
      }
    }

    // ── 5. Negative Stock Prevention (only for Confirmed/Delivered transitions) ──
    const wasConfirmedOrDelivered = existing.status === 'Confirmed' || existing.status === 'Delivered';
    const isNowConfirmedOrDelivered = effectiveStatus === 'Confirmed' || effectiveStatus === 'Delivered';

    if (isNowConfirmedOrDelivered && processedLines && effectiveGodownId) {
      for (const line of processedLines) {
        const product = await db.product.findUnique({
          where: { id: line.productId },
        });
        if (!product) {
          return NextResponse.json(
            { error: `Product not found: ${line.productId}` },
            { status: 400 }
          );
        }

        const productStock = await db.productStock.findUnique({
          where: { productId_godownId: { productId: line.productId, godownId: effectiveGodownId } },
        });

        // If already confirmed, existing line quantities were already deducted,
        // so add them back before checking
        let available = productStock?.quantity || 0;
        if (wasConfirmedOrDelivered) {
          // Add back the existing line quantities for this product
          const existingLineForProduct = existing.lines.find(
            (l) => l.productId === line.productId
          );
          if (existingLineForProduct) {
            available = safeFinancialAdd(available, existingLineForProduct.quantity);
          }
        }

        if (available < line.quantity) {
          return NextResponse.json(
            {
              error: `Insufficient stock for '${product.name}'. Available: ${available}, Requested: ${line.quantity}. Transaction rejected.`,
              stockViolation: true,
            },
            { status: 409 }
          );
        }
      }
    }

    // ── 6. Atomic Double-Entry Bookkeeping ($transaction) ──
    const result = await db.$transaction(async (tx) => {
      // If transitioning from Confirmed/Delivered to non-confirmed, reverse stock and ledger
      if (wasConfirmedOrDelivered && !isNowConfirmedOrDelivered) {
        // Reverse ProductStock increments (add stock back)
        for (const line of existing.lines) {
          if (existing.godownId) {
            const currentStock = await tx.productStock.findUnique({
              where: { productId_godownId: { productId: line.productId, godownId: existing.godownId } },
            });
            if (currentStock) {
              await tx.productStock.update({
                where: { id: currentStock.id },
                data: { quantity: { increment: line.quantity } },
              });
            }
          }

          // Create reversal StockEntry (type="IN")
          await tx.stockEntry.create({
            data: {
              productId: line.productId,
              godownId: existing.godownId || null,
              type: 'IN',
              quantity: line.quantity,
              costPrice: line.rate,
              totalCost: safeFinancialRound(line.quantity * line.rate),
              reference: existing.invoiceNo,
              referenceType: 'SalesOrder',
              ...(companyId && { companyId }),
              date: new Date(),
              notes: 'Reversal: SO status changed from confirmed',
            },
          });
        }

        // Reverse ledger entries
        const existingLedgerEntries = await tx.ledgerEntry.findMany({
          where: { reference: existing.invoiceNo, referenceType: 'SalesOrder' },
        });

        for (const entry of existingLedgerEntries) {
          // Create reversal entry
          const lastLedgerEntry = await tx.ledgerEntry.findFirst({
            orderBy: { entryCode: 'desc' },
            select: { entryCode: true },
          });
          let ledgerNextNum = 1;
          if (lastLedgerEntry?.entryCode) {
            const match = lastLedgerEntry.entryCode.match(/LED-(\d+)/);
            if (match) {
              ledgerNextNum = parseInt(match[1], 10) + 1;
            }
          }
          const reversalCode = `LED-${String(ledgerNextNum).padStart(5, '0')}`;

          await tx.ledgerEntry.create({
            data: {
              entryCode: reversalCode,
              date: new Date(),
              accountId: entry.accountId,
              account: entry.account,
              particulars: `Reversal: ${entry.particulars || ''}`,
              debit: entry.credit,  // Swap debit/credit
              credit: entry.debit,
              reference: existing.invoiceNo,
              referenceType: 'SalesOrder',
              ...(companyId && { companyId }),
            },
          });
        }

        // Soft-delete existing LedgerAutoPost
        await tx.ledgerAutoPost.updateMany({
          where: { sourceType: 'SalesOrder', sourceId: id },
          data: { status: 'Reversed' },
        });
      }

      // Delete existing lines if lines are provided
      if (processedLines) {
        await tx.salesOrderLine.deleteMany({
          where: { salesOrderId: id },
        });
      }

      // Build update data
      const updateData: Record<string, unknown> = {
        ...(customerId && { customerId }),
        ...(date && { date: new Date(date) }),
        ...(godownId !== undefined && { godownId: godownId || null }),
        ...(discount !== undefined && { discount: totalDiscount }),
        ...(vatPercentage !== undefined && { vatPercentage: vatPct }),
        ...(paymentOptionId !== undefined && { paymentOptionId: paymentOptionId || null }),
        ...(notes !== undefined && { notes }),
        ...(status && { status: effectiveStatus }),
        ...(subTotal !== undefined && { subTotal }),
        ...(vatAmount !== undefined && { vatAmount }),
        ...(grandTotal !== undefined && { grandTotal }),
        ...(deliveryCost !== undefined && { deliveryCost: effectiveDeliveryCost }),
        ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
        ...(cashAmount !== undefined && { cashAmount: Number(cashAmount) || 0 }),
        ...(bankAmount !== undefined && { bankAmount: Number(bankAmount) || 0 }),
        ...(mfsAmount !== undefined && { mfsAmount: Number(mfsAmount) || 0 }),
        ...(cardAmount !== undefined && { cardAmount: Number(cardAmount) || 0 }),
        ...(creditOverride !== undefined && { creditOverride: creditOverrideApplied, overrideBy: overrideByUser }),
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
      };

      const salesOrder = await tx.salesOrder.update({
        where: { id },
        data: updateData,
        include: {
          customer: true,
          godown: true,
          paymentOption: true,
          lines: { include: { product: true } },
        },
      });

      // If transitioning to Confirmed/Delivered (and wasn't before), process stock and ledger
      if (isNowConfirmedOrDelivered && !wasConfirmedOrDelivered) {
        const linesToProcess = processedLines || existing.lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          rate: l.rate,
          discountPercent: l.discountPercent,
          discountAmount: l.discountAmount,
          vatAmount: l.vatAmount,
          total: l.total,
        }));

        for (const line of linesToProcess) {
          // b) Decrement ProductStock
          if (effectiveGodownId) {
            const currentStock = await tx.productStock.findUnique({
              where: { productId_godownId: { productId: line.productId, godownId: effectiveGodownId } },
            });
            if (!currentStock || currentStock.quantity < line.quantity) {
              const product = await tx.product.findUnique({ where: { id: line.productId } });
              throw new Error(`Insufficient stock for '${product?.name || line.productId}'`);
            }
            await tx.productStock.update({
              where: { id: currentStock.id },
              data: { quantity: { decrement: line.quantity } },
            });
          }

          // c) Create StockEntry (type="OUT" with costPrice and totalCost)
          await tx.stockEntry.create({
            data: {
              productId: line.productId,
              godownId: effectiveGodownId || null,
              type: 'OUT',
              quantity: line.quantity,
              costPrice: line.rate,
              totalCost: safeFinancialRound(line.quantity * line.rate),
              reference: salesOrder.invoiceNo,
              referenceType: 'SalesOrder',
              ...(companyId && { companyId }),
              date: salesOrder.date,
            },
          });
        }

        // d) Double-Entry Ledger Auto-Post
        const effectiveCustomer = customer || existing.customer;
        const customerCoaId = effectiveCustomer?.coaAccountId || await findOrCreateCoAAccount(
          tx, effectiveCustomer?.name || 'Customer', 'Asset', 'COA-AR', companyId
        );
        const salesRevenueCoaId = await findOrCreateCoAAccount(
          tx, 'Sales Revenue', 'Income', 'COA-INC', companyId
        );

        // Auto-generate entry codes: LED-XXXXX
        const lastLedgerEntry = await tx.ledgerEntry.findFirst({
          orderBy: { entryCode: 'desc' },
          select: { entryCode: true },
        });
        let ledgerNextNum = 1;
        if (lastLedgerEntry?.entryCode) {
          const match = lastLedgerEntry.entryCode.match(/LED-(\d+)/);
          if (match) {
            ledgerNextNum = parseInt(match[1], 10) + 1;
          }
        }
        const entryCode1 = `LED-${String(ledgerNextNum).padStart(5, '0')}`;
        const entryCode2 = `LED-${String(ledgerNextNum + 1).padStart(5, '0')}`;

        const effectiveGrandTotalForLedger = grandTotal || existing.grandTotal;

        // Debit: Accounts Receivable
        await tx.ledgerEntry.create({
          data: {
            entryCode: entryCode1,
            date: salesOrder.date,
            accountId: customerCoaId,
            account: 'Accounts Receivable',
            particulars: `Invoice ${salesOrder.invoiceNo} - ${effectiveCustomer?.name || 'Customer'}`,
            debit: effectiveGrandTotalForLedger,
            credit: 0,
            reference: salesOrder.invoiceNo,
            referenceType: 'SalesOrder',
            ...(companyId && { companyId }),
          },
        });

        // Credit: Sales Revenue
        await tx.ledgerEntry.create({
          data: {
            entryCode: entryCode2,
            date: salesOrder.date,
            accountId: salesRevenueCoaId,
            account: 'Sales Revenue',
            particulars: `Invoice ${salesOrder.invoiceNo} - Sales`,
            debit: 0,
            credit: effectiveGrandTotalForLedger,
            reference: salesOrder.invoiceNo,
            referenceType: 'SalesOrder',
            ...(companyId && { companyId }),
          },
        });

        // Create LedgerAutoPost record: LAP-XXXXX
        const lastAutoPost = await tx.ledgerAutoPost.findFirst({
          orderBy: { code: 'desc' },
          select: { code: true },
        });
        let lapNextNum = 1;
        if (lastAutoPost?.code) {
          const match = lastAutoPost.code.match(/LAP-(\d+)/);
          if (match) {
            lapNextNum = parseInt(match[1], 10) + 1;
          }
        }
        const lapCode = `LAP-${String(lapNextNum).padStart(5, '0')}`;

        await tx.ledgerAutoPost.create({
          data: {
            code: lapCode,
            sourceType: 'SalesOrder',
            sourceId: salesOrder.id,
            sourceCode: salesOrder.invoiceNo,
            debitEntryId: entryCode1,
            creditEntryId: entryCode2,
            debitAccount: 'Accounts Receivable',
            creditAccount: 'Sales Revenue',
            amount: effectiveGrandTotalForLedger,
            postingDate: salesOrder.date,
            status: 'Posted',
            postedBy: userId,
            ...(companyId && { companyId }),
          },
        });
      }

      // Activity Logger with "Inv-Orders-Core" token
      await logUserActivity({
        action: 'UPDATE',
        module: 'Inv-Orders-Core',
        recordId: id,
        recordLabel: salesOrder.invoiceNo,
        userId,
        userName,
        details: JSON.stringify({
          status: effectiveStatus,
          grandTotal: grandTotal || existing.grandTotal,
          creditOverride: creditOverrideApplied,
          deliveryCost: effectiveDeliveryCost,
        }),
      });

      return salesOrder;
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating sales order:', error);
    const message = error instanceof Error ? error.message : 'Failed to update sales order';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────
// DELETE /api/sales-orders/[id] - Soft delete with
// checkFinancialDeletePermission, cross-tenant validation,
// stock reversal, ledger reversal, activity logging
// ─────────────────────────────────────────────────────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'SalesOrders', 'DELETE');
  if (!security.authorized) return security.response;

  const role = security.user.role;
  const companyId = security.user.companyId;
  const userId = security.user.id;
  const userName = security.user.name;

  // Only admin can delete financial posts
  const deletePermission = checkFinancialDeletePermission(role);
  if (deletePermission) return deletePermission;

  try {
    const { id } = await params;

    // Fetch existing record for validation
    const existing = await db.salesOrder.findUnique({
      where: { id },
      include: { lines: true },
    });

    if (!existing || !existing.isActive) {
      return NextResponse.json(
        { error: 'Sales order not found' },
        { status: 404 }
      );
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Sales order not found' },
        { status: 404 }
      );
    }

    // Period-close lock check
    const periodLock = await checkPeriodClose(existing.date || new Date());
    if (periodLock) return periodLock;

    const wasConfirmedOrDelivered = existing.status === 'Confirmed' || existing.status === 'Delivered';

    await db.$transaction(async (tx) => {
      // If SO was Confirmed/Delivered, reverse stock and ledger entries
      if (wasConfirmedOrDelivered) {
        // Reverse ProductStock increments (add stock back)
        for (const line of existing.lines) {
          if (existing.godownId) {
            const currentStock = await tx.productStock.findUnique({
              where: { productId_godownId: { productId: line.productId, godownId: existing.godownId } },
            });
            if (currentStock) {
              await tx.productStock.update({
                where: { id: currentStock.id },
                data: { quantity: { increment: line.quantity } },
              });
            }
          }

          // Create reversal StockEntry (type="IN")
          await tx.stockEntry.create({
            data: {
              productId: line.productId,
              godownId: existing.godownId || null,
              type: 'IN',
              quantity: line.quantity,
              costPrice: line.rate,
              totalCost: safeFinancialRound(line.quantity * line.rate),
              reference: existing.invoiceNo,
              referenceType: 'SalesOrder',
              ...(companyId && { companyId }),
              date: new Date(),
              notes: 'Reversal: SO soft-deleted',
            },
          });
        }

        // Reverse ledger entries
        const existingLedgerEntries = await tx.ledgerEntry.findMany({
          where: { reference: existing.invoiceNo, referenceType: 'SalesOrder' },
        });

        for (const entry of existingLedgerEntries) {
          const lastLedgerEntry = await tx.ledgerEntry.findFirst({
            orderBy: { entryCode: 'desc' },
            select: { entryCode: true },
          });
          let ledgerNextNum = 1;
          if (lastLedgerEntry?.entryCode) {
            const match = lastLedgerEntry.entryCode.match(/LED-(\d+)/);
            if (match) {
              ledgerNextNum = parseInt(match[1], 10) + 1;
            }
          }
          const reversalCode = `LED-${String(ledgerNextNum).padStart(5, '0')}`;

          await tx.ledgerEntry.create({
            data: {
              entryCode: reversalCode,
              date: new Date(),
              accountId: entry.accountId,
              account: entry.account,
              particulars: `Reversal: ${entry.particulars || ''} (SO deleted)`,
              debit: entry.credit,  // Swap debit/credit
              credit: entry.debit,
              reference: existing.invoiceNo,
              referenceType: 'SalesOrder',
              ...(companyId && { companyId }),
            },
          });
        }

        // Mark LedgerAutoPost as Reversed
        await tx.ledgerAutoPost.updateMany({
          where: { sourceType: 'SalesOrder', sourceId: id },
          data: { status: 'Reversed', reversalReason: 'Sales order soft-deleted' },
        });
      }

      // Soft delete the sales order
      await tx.salesOrder.update({
        where: { id },
        data: { isActive: false, status: 'Cancelled' },
      });

      // Activity Logger with "Inv-Orders-Core" token
      await logUserActivity({
        action: 'DELETE',
        module: 'Inv-Orders-Core',
        recordId: id,
        recordLabel: existing.invoiceNo || id,
        userId,
        userName,
        details: JSON.stringify({
          softDelete: true,
          previousStatus: existing.status,
          previousGrandTotal: existing.grandTotal,
          stockReversed: wasConfirmedOrDelivered,
        }),
      });
    });

    return NextResponse.json({ message: 'Sales order deleted successfully' });
  } catch (error) {
    console.error('Error deleting sales order:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete sales order';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
