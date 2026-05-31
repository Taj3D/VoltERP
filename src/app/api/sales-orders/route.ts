import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  checkPeriodClose,
  maskForVatAuditor,
  maskFinancialArray,
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
// GET /api/sales-orders - List all sales orders with relations,
// customer credit info, and multi-tenant isolation
// ─────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'SalesOrders', 'GET');
  if (!security.authorized) return security.response;

  const role = security.user.role;
  const companyId = security.user.companyId;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const customerId = searchParams.get('customerId');

    const where: Record<string, unknown> = {
      isActive: true,
      ...(companyId && { companyId }),
    };
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;

    const salesOrders = await db.salesOrder.findMany({
      where,
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
      orderBy: { createdAt: 'desc' },
    });

    // Enrich with customerName, godownName, paymentOptionName + credit info
    const enrichedOrders = await Promise.all(
      salesOrders.map(async (order) => {
        // Calculate customer credit info for Credit Shield
        let customerCreditInfo: {
          creditLimit: number;
          currentOutstanding: number;
        } | null = null;

        if (order.customer && order.customer.creditLimit > 0) {
          const existingOrders = await db.salesOrder.findMany({
            where: {
              customerId: order.customerId,
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
              customerId: order.customerId,
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
            creditLimit: order.customer.creditLimit,
            currentOutstanding: outstanding,
          };
        }

        return {
          ...order,
          customerName: order.customer?.name || '',
          godownName: order.godown?.name || '',
          paymentOptionName: order.paymentOption?.name || '',
          customerCreditInfo,
        };
      })
    );

    // VAT Auditor masking — use maskFinancialArray for comprehensive financial field masking
    const maskedOrders = maskFinancialArray(
      enrichedOrders as Record<string, unknown>[],
      role,
      ['subTotal', 'discount', 'vatAmount', 'grandTotal', 'deliveryCost', 'cashAmount', 'bankAmount', 'mfsAmount', 'cardAmount']
    ).map((order) => {
      const typedOrder = order as Record<string, unknown>;
      // Also mask line-level financial fields
      if (Array.isArray(typedOrder.lines)) {
        typedOrder.lines = typedOrder.lines.map((line: unknown) => {
          const typedLine = line as Record<string, unknown>;
          return maskForVatAuditor(
            typedLine,
            role,
            ['rate', 'discountPercent', 'discountAmount', 'vatAmount', 'total']
          );
        });
      }
      return typedOrder;
    });

    return NextResponse.json(maskedOrders);
  } catch (error) {
    console.error('Error fetching sales orders:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sales orders' },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/sales-orders - Complete overhaul with:
// - Godown Status Validation (SUSPENDED = 403)
// - Strict Numeric Validation (400)
// - Total Transaction Value Calculation with deliveryCost
// - B2B Customer Credit Shield Interlock (422)
// - Credit Override for admin
// - Negative Stock Prevention using ProductStock (409)
// - Atomic Double-Entry Bookkeeping ($transaction)
// - ProductStock decrement, StockEntry with costPrice/totalCost
// - Double-entry ledger auto-post (Dr: AR, Cr: Sales Revenue)
// - LedgerAutoPost record
// - Activity logger with "Inv-Orders-Core" token
// - Auto-SMS hook with buildPurchaseSms
// ─────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'SalesOrders', 'POST');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;
  const userId = security.user.id;
  const userName = security.user.name;
  const userRole = security.user.role;

  try {
    const body = await request.json();
    const {
      customerId,
      date,
      godownId,
      discount,
      paymentOptionId,
      notes,
      vatPercentage,
      lines,
      status,
      deliveryCost,
      dueDate,
      cashAmount,
      bankAmount,
      mfsAmount,
      cardAmount,
      creditOverride,
    } = body;

    // ── Required fields validation ──
    if (!customerId || !date || !lines || !Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json(
        { error: 'customerId, date, and lines are required' },
        { status: 400 }
      );
    }

    // ── 1. Godown Status Validation (SUSPENDED = 403) ──
    if (godownId) {
      const godown = await db.godown.findUnique({ where: { id: godownId } });
      if (godown && godown.status === 'SUSPENDED') {
        return NextResponse.json(
          { error: `Godown "${godown.name}" is SUSPENDED. All stock operations are blocked. Contact an administrator.` },
          { status: 403 }
        );
      }
    }

    // ── 2. Strict Numeric Validation (400) ──
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

    const deliveryCostVal = Number(deliveryCost) || 0;
    if (deliveryCostVal < 0) {
      return NextResponse.json(
        { error: 'deliveryCost must be greater than or equal to 0' },
        { status: 400 }
      );
    }

    // Payment breakdown validation
    const cashAmt = Number(cashAmount) || 0;
    const bankAmt = Number(bankAmount) || 0;
    const mfsAmt = Number(mfsAmount) || 0;
    const cardAmt = Number(cardAmount) || 0;

    if (cashAmt < 0 || bankAmt < 0 || mfsAmt < 0 || cardAmt < 0) {
      return NextResponse.json(
        { error: 'Payment breakdown amounts (cashAmount, bankAmount, mfsAmount, cardAmount) must each be >= 0' },
        { status: 400 }
      );
    }

    // Period-close lock check
    const periodLock = await checkPeriodClose(new Date(date));
    if (periodLock) return periodLock;

    // ── 3. Total Transaction Value Calculation ──
    const processedLines = lines.map((line: Record<string, unknown>) => {
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

    // SubTotal = sum of line totals
    const subTotal = safeFinancialRound(processedLines.reduce((sum, l) => safeFinancialAdd(sum, l.total), 0));

    const totalDiscount = Number(discount) || 0;
    const vatPct = Number(vatPercentage) || 0;

    // After discount, add deliveryCost, then apply VAT
    const afterDiscount = safeFinancialSubtract(subTotal, totalDiscount);
    const afterDelivery = safeFinancialAdd(afterDiscount, deliveryCostVal);
    const vatAmount = safeFinancialRound(afterDelivery * (vatPct / 100));
    const grandTotal = safeFinancialAdd(afterDelivery, vatAmount);

    // ── 4. B2B Customer Credit Shield Interlock ──
    const customer = await db.customer.findUnique({
      where: { id: customerId },
      include: { coaAccount: true },
    });
    if (!customer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 400 }
      );
    }

    let creditOverrideApplied = false;
    let overrideByUser: string | null = null;

    if (customer.creditLimit > 0) {
      // Calculate current outstanding = total unpaid sales orders - total cash collections
      const existingOrders = await db.salesOrder.findMany({
        where: { customerId, status: { not: 'Cancelled' }, isActive: true },
        select: { grandTotal: true },
      });
      const totalOrderValue = existingOrders.reduce(
        (sum, o) => safeFinancialAdd(sum, o.grandTotal),
        0
      );

      const existingCollections = await db.cashCollection.findMany({
        where: { customerId, status: 'Approved', isActive: true },
        select: { amount: true },
      });
      const totalCollections = existingCollections.reduce(
        (sum, c) => safeFinancialAdd(sum, c.amount),
        0
      );

      const currentOutstanding = safeFinancialSubtract(totalOrderValue, totalCollections);

      if (safeFinancialAdd(currentOutstanding, grandTotal) > customer.creditLimit) {
        // Credit limit would be breached
        if (creditOverride === true && userRole === 'admin') {
          // Admin bypass: allow the transaction with override tracking
          creditOverrideApplied = true;
          overrideByUser = userId;
        } else {
          // Return 422 Unprocessable Entity
          const excess = safeFinancialSubtract(
            safeFinancialAdd(currentOutstanding, grandTotal),
            customer.creditLimit
          );
          return NextResponse.json(
            {
              error: 'Credit Shield Violation: Customer balance threshold breached. Transaction rejected.',
              creditShieldViolation: true,
              currentDue: currentOutstanding,
              newOrderValue: grandTotal,
              creditLimit: customer.creditLimit,
              excess,
            },
            { status: 422 }
          );
        }
      }
    }

    // ── 5. Negative Stock Prevention ──
    // Pre-validate stock for all lines before entering the transaction
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

      if (godownId) {
        // Use ProductStock for godown-level stock check
        const productStock = await db.productStock.findUnique({
          where: { productId_godownId: { productId: line.productId, godownId } },
        });
        const available = productStock?.quantity || 0;
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

    // ── Determine if stock/ledger operations should run ──
    const effectiveStatus = status || 'Draft';
    const shouldProcessStockAndLedger = effectiveStatus === 'Confirmed' || effectiveStatus === 'Delivered';

    // ── 6. Atomic Double-Entry Bookkeeping ($transaction) ──
    const result = await db.$transaction(async (tx) => {
      // Auto-generate invoiceNo with 5-digit padding: SO-XXXXX
      const lastSO = await tx.salesOrder.findFirst({
        orderBy: { invoiceNo: 'desc' },
        select: { invoiceNo: true },
      });

      let nextNum = 1;
      if (lastSO?.invoiceNo) {
        const match = lastSO.invoiceNo.match(/SO-(\d+)/);
        if (match) {
          nextNum = parseInt(match[1], 10) + 1;
        }
      }
      const invoiceNo = `SO-${String(nextNum).padStart(5, '0')}`;

      // a) Create SalesOrder with lines (including payment breakdown, credit override, deliveryCost, dueDate)
      const salesOrder = await tx.salesOrder.create({
        data: {
          invoiceNo,
          customerId,
          date: new Date(date),
          dueDate: dueDate ? new Date(dueDate) : null,
          godownId: godownId || null,
          subTotal,
          discount: totalDiscount,
          deliveryCost: deliveryCostVal,
          vatPercentage: vatPct,
          vatAmount,
          grandTotal,
          paymentOptionId: paymentOptionId || null,
          cashAmount: cashAmt,
          bankAmount: bankAmt,
          mfsAmount: mfsAmt,
          cardAmount: cardAmt,
          creditOverride: creditOverrideApplied,
          overrideBy: overrideByUser,
          status: effectiveStatus,
          notes: notes || null,
          ...(companyId && { companyId }),
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
        },
        include: {
          customer: true,
          godown: true,
          paymentOption: true,
          lines: { include: { product: true } },
        },
      });

      if (shouldProcessStockAndLedger) {
        // b) For each line, decrement ProductStock
        for (const line of processedLines) {
          if (godownId) {
            const currentStock = await tx.productStock.findUnique({
              where: { productId_godownId: { productId: line.productId, godownId } },
            });
            if (!currentStock || currentStock.quantity < line.quantity) {
              throw new Error(`Insufficient stock for product ${line.productId}`);
            }
            await tx.productStock.update({
              where: { id: currentStock.id },
              data: { quantity: { decrement: line.quantity } },
            });
          }

          // c) Create StockEntry for each line (type="OUT" with costPrice and totalCost)
          await tx.stockEntry.create({
            data: {
              productId: line.productId,
              godownId: godownId || null,
              type: 'OUT',
              quantity: line.quantity,
              costPrice: line.rate,
              totalCost: safeFinancialRound(line.quantity * line.rate),
              reference: invoiceNo,
              referenceType: 'SalesOrder',
              ...(companyId && { companyId }),
              date: new Date(date),
            },
          });
        }

        // d) Double-Entry Ledger Auto-Post
        // Find or create CoA accounts
        const customerCoaId = customer.coaAccountId || await findOrCreateCoAAccount(
          tx, customer.name, 'Asset', 'COA-AR', companyId
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

        // Debit: Accounts Receivable
        await tx.ledgerEntry.create({
          data: {
            entryCode: entryCode1,
            date: new Date(date),
            accountId: customerCoaId,
            account: 'Accounts Receivable',
            particulars: `Invoice ${invoiceNo} - ${customer.name}`,
            debit: grandTotal,
            credit: 0,
            reference: invoiceNo,
            referenceType: 'SalesOrder',
            ...(companyId && { companyId }),
          },
        });

        // Credit: Sales Revenue
        await tx.ledgerEntry.create({
          data: {
            entryCode: entryCode2,
            date: new Date(date),
            accountId: salesRevenueCoaId,
            account: 'Sales Revenue',
            particulars: `Invoice ${invoiceNo} - Sales`,
            debit: 0,
            credit: grandTotal,
            reference: invoiceNo,
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
            sourceCode: invoiceNo,
            debitEntryId: entryCode1,
            creditEntryId: entryCode2,
            debitAccount: 'Accounts Receivable',
            creditAccount: 'Sales Revenue',
            amount: grandTotal,
            postingDate: new Date(date),
            status: 'Posted',
            postedBy: userId,
            ...(companyId && { companyId }),
          },
        });
      }

      // 7. Activity Logger with "Inv-Orders-Core" token
      await logUserActivity({
        action: 'CREATE',
        module: 'Inv-Orders-Core',
        recordId: salesOrder.id,
        recordLabel: invoiceNo,
        userId,
        userName,
        details: JSON.stringify({
          type: 'SalesOrder',
          customerId,
          grandTotal,
          lineCount: processedLines.length,
          creditOverride: creditOverrideApplied,
          deliveryCost: deliveryCostVal,
        }),
      });

      return salesOrder;
    });

    // ── 8. Auto-SMS Hook ──
    const customerPhone = result.customer?.phone || '';
    const itemSummary = (result.lines || [])
      .map((l: Record<string, unknown>) => (l.product as Record<string, unknown>)?.name)
      .filter(Boolean)
      .join(', ')
      .substring(0, 50);

    const smsMessage = buildPurchaseSms({
      customerName: result.customer?.name || 'Customer',
      invoiceNo: result.invoiceNo,
      itemSummary,
      grandTotal: String(grandTotal),
    });

    void dispatchAutoSms({
      triggerType: 'purchase',
      recipient: customerPhone,
      message: smsMessage,
      companyId,
      userId,
      userName,
      referenceData: { invoiceNo: result.invoiceNo, grandTotal, customerId },
    }).catch(() => {});

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating sales order:', error);
    const message = error instanceof Error ? error.message : 'Failed to create sales order';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
