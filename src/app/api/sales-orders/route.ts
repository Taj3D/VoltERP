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
import Papa from 'papaparse';

/**
 * Strip HTML tags from a string to prevent XSS in text fields.
 */
function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '').trim();
}

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

  // Use provided discountAmount or calculate from percent
  let discountAmount: number;
  if (line.discountAmount !== undefined && line.discountAmount > 0) {
    discountAmount = safeFinancialRound(line.discountAmount);
  } else {
    discountAmount = safeFinancialRound(lineGross * (discountPercent / 100));
  }

  const afterDiscount = safeFinancialSubtract(lineGross, discountAmount);
  const vatAmount = safeFinancialRound(line.vatAmount ?? 0);
  const total = safeFinancialAdd(afterDiscount, vatAmount);

  // COGS calculation
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

  // Order-level discount
  const orderDiscount = discount !== undefined && discount > 0
    ? safeFinancialRound(discount)
    : safeFinancialRound(subTotal * (discountPercent / 100));

  const afterDiscount = safeFinancialSubtract(subTotal, orderDiscount);
  const vatAmount = safeFinancialRound(afterDiscount * (vatPercentage / 100));
  const grandTotal = safeFinancialAdd(afterDiscount, vatAmount);

  // COGS totals
  const cogsTotal = computedLines.reduce(
    (sum, l) => safeFinancialAdd(sum, l.cogsAmount),
    0
  );
  const grossProfit = safeFinancialSubtract(grandTotal, cogsTotal);
  const profitMargin = grandTotal > 0 ? safeFinancialRound((grossProfit / grandTotal) * 100) : 0;

  return { subTotal, discount: orderDiscount, vatAmount, grandTotal, cogsTotal, grossProfit, profitMargin };
}

// ============================================================
// SHARED: Auto-generate invoiceNo: SO-XXXXX
// ============================================================

async function generateInvoiceNo(tx: any): Promise<string> {
  const allSOs = await tx.salesOrder.findMany({
    select: { invoiceNo: true },
  });

  let maxNum = 0;
  for (const so of allSOs) {
    if (so.invoiceNo) {
      const match = so.invoiceNo.match(/SO-(\d+)/);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
    }
  }
  return `SO-${String(maxNum + 1).padStart(5, '0')}`;
}

// ============================================================
// SHARED: Currency formatter
// ============================================================

const fmtBD = (v: number) =>
  // Use en-US to guarantee Latin digits — en-US may produce Bengali numerals
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

// ============================================================
// SHARED: AR Ledger balance update for Customer
// Adding grandTotal to Dr side (customer owes more)
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
    // Credit balance
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

// ============================================================
// SHARED: AR Ledger reversal (subtract grandTotal from Dr side)
// ============================================================

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
    // Cr balance — customer has advance/payments; reducing debit means increasing credit
    return {
      newBalance: safeFinancialAdd(currentBalance, grandTotal),
      newBalanceType: 'Cr',
    };
  }
}

// ============================================================
// GET /api/sales-orders — List all sales orders with full relations
// ============================================================

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'SalesOrders', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const customerId = searchParams.get('customerId');
    const godownId = searchParams.get('godownId');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const arPosted = searchParams.get('arPosted');
    const srId = searchParams.get('srId');

    const where: Record<string, unknown> = { isActive: true };

    if (status) where.status = status;
    if (customerId) where.customerId = customerId;
    if (godownId) where.godownId = godownId;
    if (arPosted !== null && arPosted !== undefined && arPosted !== '') {
      where.arPosted = arPosted === 'true';
    }
    if (srId) where.srId = srId;

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

    const salesOrders = await db.salesOrder.findMany({
      where,
      include: {
        customer: true,
        godown: true,
        paymentOption: true,
        // PERF: Exclude logo/brandLogo (~192KB base64) from company relation.
        company: { select: { id: true, code: true, name: true, phone: true, mobile: true, email: true, address: true, vatNumber: true, tradeLicense: true, invoicePrefix: true, thankYouMsg: true, systemNote: true, showBarcode: true, showPayInWord: true, website: true } },
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
      orderBy: { createdAt: 'desc' },
    });

    // Apply VAT Auditor masking for financial fields (including line items)
    const maskedOrders = salesOrders.map((order) =>
      maskOrderWithLinesForVatAuditor(order as Record<string, unknown>, security.user.role)
    );

    return NextResponse.json(maskedOrders);
  } catch (error) {
    console.error('[SalesOrders] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sales orders' },
      { status: 500 }
    );
  }
}

// ============================================================
// POST /api/sales-orders — Create sales order with full validation
// POST /api/sales-orders?import=true — CSV Import
// ============================================================

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'SalesOrders', 'POST');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const isImport = searchParams.get('import') === 'true';

    if (isImport) {
      return handleCsvImport(request, security);
    }

    return handleCreate(request, security);
  } catch (error) {
    console.error('[SalesOrders] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to process sales order request' },
      { status: 500 }
    );
  }
}

// ============================================================
// Create Handler — Single sales order with full validation
// ============================================================

async function handleCreate(
  request: NextRequest,
  security: { user: { id: string; email: string; name: string; role: string; companyId: string | null } }
): Promise<NextResponse> {
  const body = await request.json();
  const {
    customerId,
    date,
    godownId,
    discountPercent = 0,
    discount,
    vatPercentage = 0,
    paymentOptionId,
    notes,
    referenceKey,
    status = 'Draft',
    srId,
    lines,
    sendSms = false,
  } = body;

  // ── Validation ──
  if (!customerId) {
    return NextResponse.json(
      { error: 'customerId is required' },
      { status: 400 }
    );
  }
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

  // Validate status
  const validStatuses = ['Draft', 'Confirmed', 'Delivered', 'Completed', 'Cancelled'];
  if (!validStatuses.includes(status)) {
    return NextResponse.json(
      { error: `Invalid status "${status}". Must be one of: ${validStatuses.join(', ')}` },
      { status: 400 }
    );
  }

  // Period close guard
  const periodLock = await checkPeriodClose(new Date(date));
  if (periodLock) return periodLock;

  // Idempotency check via referenceKey
  if (referenceKey) {
    const existing = await db.salesOrder.findFirst({
      where: { referenceKey },
    });
    if (existing) {
      return NextResponse.json(
        {
          error: 'Duplicate submission detected. This sales order has already been created.',
          referenceKey,
          existingId: existing.id,
        },
        { status: 409 }
      );
    }
  }

  // Validate customer exists
  const customer = await db.customer.findUnique({
    where: { id: customerId },
  });
  if (!customer) {
    return NextResponse.json(
      { error: 'Customer not found' },
      { status: 400 }
    );
  }

  // ── Credit Limit Protection ──
  // Check if customer account is frozen
  if (customer.creditStatus === 'Frozen') {
    return NextResponse.json(
      {
        error: `CREDIT FREEZE: Transaction blocked. Customer account is frozen. Outstanding Tk. ${fmtBD(Math.abs(customer.currentBalance))}. Contact management to unfreeze account or collect outstanding payments.`,
      },
      { status: 403 }
    );
  }

  // ── Transaction: create with full validation ──
  const result = await db.$transaction(async (tx) => {
    // Validate each line's productId exists and compute COGS
    const computedLines: ComputedSOLine[] = [];
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

      // STOCK SAFETY: Verify sufficient stock before creating sales order
      const currentStock = await computeCurrentStock(
        tx,
        line.productId,
        godownId || undefined
      );

      const lineQuantity = Number(line.quantity) || 0;
      if (currentStock < lineQuantity) {
        throw Object.assign(new Error('INSUFFICIENT_STOCK'), {
          stockError: `Insufficient stock for "${product.name}". Available: ${currentStock}, Requested: ${lineQuantity}. Transaction rolled back.`,
        });
      }

      // Compute line financials with COGS
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

    // Compute order-level financials including COGS
    const orderDiscountPercent = Number(discountPercent) || 0;
    const orderVatPercentage = Number(vatPercentage) || 0;
    const orderDiscount = discount !== undefined ? Number(discount) : undefined;
    const { subTotal, discount: totalDiscount, vatAmount, grandTotal, cogsTotal, grossProfit, profitMargin } =
      computeSalesOrderFinancials(computedLines, orderDiscountPercent, orderVatPercentage, orderDiscount);

    // ── Credit Limit Protection (with projected balance) ──
    if (customer.creditLimit > 0) {
      const outstandingBalance = Math.abs(customer.currentBalance);
      const projectedBalance = safeFinancialAdd(outstandingBalance, grandTotal);

      if (projectedBalance > customer.creditLimit) {
        // Auto-toggle creditStatus to OverLimit
        if (customer.creditStatus !== 'OverLimit') {
          await tx.customer.update({
            where: { id: customerId },
            data: { creditStatus: 'OverLimit' },
          });
        }

        throw Object.assign(new Error('CREDIT_LIMIT_EXCEEDED'), {
          creditError: `CREDIT FREEZE: Transaction blocked. Customer outstanding Tk. ${fmtBD(outstandingBalance)} + proposed Tk. ${fmtBD(grandTotal)} = Tk. ${fmtBD(projectedBalance)} exceeds credit ceiling Tk. ${fmtBD(customer.creditLimit)}. Contact management to increase credit limit or collect outstanding payments.`,
        });
      }
    }

    // Auto-generate invoiceNo
    const invoiceNo = await generateInvoiceNo(tx);

    // Determine company ID
    const companyId = security.user.companyId || customer.companyId || null;

    const salesOrder = await tx.salesOrder.create({
      data: {
        invoiceNo,
        customerId,
        date: new Date(date),
        godownId: godownId || null,
        subTotal,
        discount: totalDiscount,
        discountPercent: orderDiscountPercent,
        vatPercentage: orderVatPercentage,
        vatAmount,
        grandTotal,
        paymentOptionId: paymentOptionId || null,
        status,
        notes: notes ? stripHtml(String(notes)) : null,
        srId: srId || null,
        companyId,
        // COGS & Fiscal Tracking
        cogsTotal,
        grossProfit,
        profitMargin,
        arPosted: false,
        referenceKey: referenceKey || null,
        lines: {
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
        },
      },
      include: {
        customer: true,
        godown: true,
        paymentOption: true,
        company: true,
        sr: { include: { designation: true } },
        lines: { include: { product: { include: { category: true, brand: true } } } },
      },
    });

    // Create StockEntry (type=OUT) for each line
    for (const line of computedLines) {
      await tx.stockEntry.create({
        data: {
          productId: line.productId,
          godownId: godownId || null,
          type: 'OUT',
          quantity: line.quantity,
          reference: invoiceNo,
          referenceType: 'SalesOrder',
          date: new Date(date),
        },
      });
    }

    // ── AR Ledger Integration ──
    // On creation, update Customer.currentBalance (add grandTotal to Dr side)
    const { newBalance, newBalanceType } = computeNewArBalance(
      customer.currentBalance,
      customer.currentBalanceType,
      grandTotal
    );

    // Auto-toggle creditStatus to 'OverLimit' if new Dr balance > creditLimit
    let newCreditStatus = customer.creditStatus;
    if (newBalanceType === 'Dr' && customer.creditLimit > 0 && newBalance > customer.creditLimit) {
      newCreditStatus = 'OverLimit';
    }

    await tx.customer.update({
      where: { id: customerId },
      data: {
        currentBalance: newBalance,
        currentBalanceType: newBalanceType,
        creditStatus: newCreditStatus,
      },
    });

    // Set arPosted = true on the SalesOrder
    await tx.salesOrder.update({
      where: { id: salesOrder.id },
      data: { arPosted: true },
    });

    // Audit log
    await tx.auditLog.create({
      data: {
        action: 'CREATE',
        module: 'SalesOrders',
        recordId: salesOrder.id,
        recordLabel: invoiceNo,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          invoiceNo,
          customerId,
          status,
          subTotal,
          discount: totalDiscount,
          vatAmount,
          grandTotal,
          cogsTotal,
          grossProfit,
          profitMargin,
          lineCount: computedLines.length,
          arPosted: true,
          arNewBalance: newBalance,
          arNewBalanceType: newBalanceType,
        }),
      },
    });

    // Activity log
    await logUserActivity({
          tx: tx,
      action: 'CREATE',
      module: 'Inv-SalesOrder-Pipeline',
      recordId: salesOrder.id,
      recordLabel: invoiceNo,
      userId: security.user.id,
      userName: security.user.name,
      details: `Created sales order ${invoiceNo} for customer ${customer.name} with ${computedLines.length} lines, grandTotal=${grandTotal}, cogsTotal=${cogsTotal}, grossProfit=${grossProfit}, status=${status}`,
    });

    return salesOrder;
  }).catch((error: any) => {
    // Re-throw validation errors
    if (error?.message === 'VALIDATION_ERROR') {
      return { _validationError: true, message: error.validationError };
    }
    if (error?.message === 'CREDIT_LIMIT_EXCEEDED') {
      return { _creditError: true, message: error.creditError };
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

  // Handle credit limit failure
  if (result && typeof result === 'object' && '_creditError' in result) {
    return NextResponse.json(
      { error: result.message },
      { status: 403 }
    );
  }

  // Handle insufficient stock
  if (result && typeof result === 'object' && '_stockError' in result) {
    return NextResponse.json(
      { error: result.message },
      { status: 400 }
    );
  }

  // Automated SMS: Sales Confirmation Event
  // Trigger if: status is Confirmed (auto-trigger) OR sendSms checkbox is explicitly checked
  const shouldSendSms = (result && typeof result === 'object' && 'status' in result && (result as any).status === 'Confirmed') || sendSms;
  if (shouldSendSms && result && typeof result === 'object' && 'id' in result) {
    try {
      // Check company SMS automation toggle (autoSmsOnPurchase) when using explicit sendSms
      if (sendSms) {
        const automationConfig = await db.smsAutomationConfig.findFirst({
          where: {
            OR: [
              { companyId: (result as any).companyId ?? null },
              { companyId: null },
            ],
          },
          orderBy: { companyId: 'desc' },
        });
        if (automationConfig && automationConfig.autoSmsOnPurchase === false) {
          // Company-wide toggle is OFF — skip SMS even if user checked the box
          console.log('[SalesOrders] SMS skipped: company autoSmsOnPurchase toggle is OFF');
        } else {
          const { triggerSalesConfirmationSms } = await import('@/lib/sms-event-hooks');
          await triggerSalesConfirmationSms({
            id: (result as any).id,
            invoiceNo: (result as any).invoiceNo,
            customerId: (result as any).customerId,
            grandTotal: (result as any).grandTotal,
            date: (result as any).date,
            companyId: (result as any).companyId || undefined,
          });
        }
      } else {
        // Auto-trigger for Confirmed status (existing behavior)
        const { triggerSalesConfirmationSms } = await import('@/lib/sms-event-hooks');
        await triggerSalesConfirmationSms({
          id: (result as any).id,
          invoiceNo: (result as any).invoiceNo,
          customerId: (result as any).customerId,
          grandTotal: (result as any).grandTotal,
          date: (result as any).date,
          companyId: (result as any).companyId || undefined,
        });
      }
    } catch (smsError) {
      console.error('[SalesOrders] SMS trigger failed (non-blocking):', smsError);
    }
  }

  return NextResponse.json(result, { status: 201 });
}

// ============================================================
// CSV Import Handler
// Headers: customerCode, date, productCode, quantity, rate,
//          discountPercent, vatAmount, godownId, notes, srId
// ============================================================

async function handleCsvImport(
  request: NextRequest,
  security: { user: { id: string; email: string; name: string; role: string; companyId: string | null } }
): Promise<NextResponse> {
  const contentType = request.headers.get('content-type') || '';
  let csvText: string;

  if (contentType.includes('text/csv') || contentType.includes('text/plain')) {
    csvText = await request.text();
  } else {
    // Also accept JSON with a csvData field
    const body = await request.json();
    csvText = body.csvData || body.csv || '';
  }

  if (!csvText.trim()) {
    return NextResponse.json(
      { error: 'No CSV data provided' },
      { status: 400 }
    );
  }

  // Parse CSV with PapaParse
  const parseResult = Papa.parse(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
    trimHeaders: true,
  });

  if (parseResult.errors.length > 0) {
    const errorMessages = parseResult.errors.map(
      (e) => `Row ${e.row !== undefined ? e.row + 2 : '?'}: ${e.message}`
    );
    return NextResponse.json(
      { error: `CSV parse errors: ${errorMessages.join('; ')}` },
      { status: 400 }
    );
  }

  const rows = parseResult.data as Record<string, string>[];
  if (rows.length === 0) {
    return NextResponse.json(
      { error: 'CSV must have a header row and at least one data row' },
      { status: 400 }
    );
  }

  // Validate required headers
  const headers = parseResult.meta.fields || [];
  const requiredHeaders = ['customerCode', 'date', 'productCode', 'quantity', 'rate'];
  const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));
  if (missingHeaders.length > 0) {
    return NextResponse.json(
      { error: `Missing required CSV headers: ${missingHeaders.join(', ')}` },
      { status: 400 }
    );
  }

  interface CsvRow {
    customerCode: string;
    productCode: string;
    date: string;
    quantity: number;
    rate: number;
    discountPercent: number;
    vatAmount: number;
    godownId: string;
    srId: string;
    notes: string;
  }

  const parsedRows: CsvRow[] = [];
  const errors: Array<{ row: number; message: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // +2 for 1-based + header row

    const customerCode = (row['customerCode'] || '').trim();
    const date = (row['date'] || '').trim();
    const productCode = (row['productCode'] || '').trim();
    const quantityStr = (row['quantity'] || '').trim();
    const rateStr = (row['rate'] || '').trim();
    const discountPercentStr = (row['discountPercent'] || '').trim();
    const vatAmountStr = (row['vatAmount'] || '').trim();
    const godownId = (row['godownId'] || '').trim();
    const srId = (row['srId'] || '').trim();
    const notes = (row['notes'] || '').trim();

    // Validate customerCode
    if (!customerCode) {
      errors.push({ row: rowNum, message: 'customerCode is required' });
      continue;
    }

    // Validate date
    if (!date || isNaN(Date.parse(date))) {
      errors.push({ row: rowNum, message: `Invalid date "${date}"` });
      continue;
    }

    // Validate productCode
    if (!productCode) {
      errors.push({ row: rowNum, message: 'productCode is required' });
      continue;
    }

    // Validate quantity
    const quantity = parseFloat(quantityStr);
    if (isNaN(quantity) || quantity <= 0) {
      errors.push({
        row: rowNum,
        message: `Invalid quantity "${quantityStr}". Must be a positive number.`,
      });
      continue;
    }

    // Validate rate
    const rate = parseFloat(rateStr);
    if (isNaN(rate) || rate < 0) {
      errors.push({
        row: rowNum,
        message: `Invalid rate "${rateStr}". Must be a non-negative number.`,
      });
      continue;
    }

    const discountPercent = discountPercentStr ? parseFloat(discountPercentStr) : 0;
    if (discountPercentStr && (isNaN(discountPercent) || discountPercent < 0 || discountPercent > 100)) {
      errors.push({
        row: rowNum,
        message: `Invalid discountPercent "${discountPercentStr}". Must be between 0 and 100.`,
      });
      continue;
    }

    const vatAmount = vatAmountStr ? parseFloat(vatAmountStr) : 0;
    if (vatAmountStr && (isNaN(vatAmount) || vatAmount < 0)) {
      errors.push({
        row: rowNum,
        message: `Invalid vatAmount "${vatAmountStr}". Must be a non-negative number.`,
      });
      continue;
    }

    parsedRows.push({
      customerCode,
      productCode,
      date,
      quantity,
      rate,
      discountPercent,
      vatAmount,
      godownId,
      srId,
      notes,
    });
  }

  // ── CRITICAL: Cross-reference customerCode against Customer.customerCode ──
  const customerCodes = [...new Set(parsedRows.map((r) => r.customerCode))];
  const existingCustomers = await db.customer.findMany({
    where: { customerCode: { in: customerCodes } },
    select: {
      id: true,
      customerCode: true,
      name: true,
      creditStatus: true,
      creditLimit: true,
      currentBalance: true,
      currentBalanceType: true,
      companyId: true,
    },
  });
  const customerMap = new Map(existingCustomers.map((c) => [c.customerCode, c]));

  // ── CRITICAL: Cross-reference productCode against Product.productCode ──
  const productCodes = [...new Set(parsedRows.map((r) => r.productCode))];
  const existingProducts = await db.product.findMany({
    where: { productCode: { in: productCodes } },
    select: { id: true, productCode: true, name: true, costPrice: true, openingStock: true },
  });
  const productMap = new Map(existingProducts.map((p) => [p.productCode, p]));

  // Filter rows with invalid customer codes or product codes
  const validRows: Array<CsvRow & { rowNum: number; customerId: string; productId: string }> = [];
  for (let i = 0; i < parsedRows.length; i++) {
    const row = parsedRows[i];
    const rowNum = i + 2;

    const customer = customerMap.get(row.customerCode);
    if (!customer) {
      errors.push({
        row: rowNum,
        message: `Customer code "${row.customerCode}" does not exist. Row rejected.`,
      });
      continue;
    }

    // Check if customer is frozen
    if (customer.creditStatus === 'Frozen') {
      errors.push({
        row: rowNum,
        message: `Customer "${row.customerCode}" account is FROZEN. Row rejected.`,
      });
      continue;
    }

    const product = productMap.get(row.productCode);
    if (!product) {
      errors.push({
        row: rowNum,
        message: `Product code "${row.productCode}" does not exist. Row rejected.`,
      });
      continue;
    }

    validRows.push({
      ...row,
      rowNum,
      customerId: customer.id,
      productId: product.id,
    });
  }

  if (validRows.length === 0) {
    return NextResponse.json(
      {
        imported: 0,
        failed: errors.length,
        errors,
        message: 'No valid rows to import. All rows had errors.',
      },
      { status: 400 }
    );
  }

  // ── Validate client credit limits before batch insertion ──
  // Group by customerId and compute projected totals per customer
  const customerTotals = new Map<string, number>();
  for (const row of validRows) {
    const currentTotal = customerTotals.get(row.customerId) || 0;
    const lineGross = safeFinancialRound(row.quantity * row.rate);
    const discAmt = safeFinancialRound(lineGross * (row.discountPercent / 100));
    const afterDisc = safeFinancialSubtract(lineGross, discAmt);
    const lineTotal = safeFinancialAdd(afterDisc, row.vatAmount);
    customerTotals.set(row.customerId, safeFinancialAdd(currentTotal, lineTotal));
  }

  // Check each customer's credit limit
  for (const [customerId, totalOrderValue] of customerTotals) {
    const customer = customerMap.get(
      [...customerMap.entries()].find(([_, c]) => c.id === customerId)?.[0] || ''
    );
    if (customer && customer.creditLimit > 0) {
      const outstandingBalance = Math.abs(customer.currentBalance);
      const projectedBalance = safeFinancialAdd(outstandingBalance, totalOrderValue);
      if (projectedBalance > customer.creditLimit) {
        errors.push({
          row: 0,
          message: `CREDIT LIMIT: Customer "${customer.name}" (${customer.customerCode}) — outstanding Tk. ${fmtBD(outstandingBalance)} + proposed Tk. ${fmtBD(totalOrderValue)} = Tk. ${fmtBD(projectedBalance)} exceeds credit ceiling Tk. ${fmtBD(customer.creditLimit)}. All rows for this customer rejected.`,
        });
        // Remove all rows for this customer
        for (let i = validRows.length - 1; i >= 0; i--) {
          if (validRows[i].customerId === customerId) {
            validRows.splice(i, 1);
          }
        }
      }
    }
  }

  if (validRows.length === 0) {
    return NextResponse.json(
      {
        imported: 0,
        failed: errors.length,
        errors,
        message: 'No valid rows to import after credit limit validation. All rows had errors.',
      },
      { status: 400 }
    );
  }

  // ── Group valid rows by customerId to create separate orders per customer ──
  const orderGroups = new Map<string, typeof validRows>();
  for (const row of validRows) {
    const groupKey = `${row.customerId}|${row.date}`;
    if (!orderGroups.has(groupKey)) {
      orderGroups.set(groupKey, []);
    }
    orderGroups.get(groupKey)!.push(row);
  }

  let imported = 0;
  const importErrors: Array<{ row: number; message: string }> = [];

  for (const [groupKey, groupRows] of orderGroups) {
    const [customerId, date] = groupKey.split('|');
    const customerEntry = [...customerMap.values()].find((c) => c.id === customerId);
    if (!customerEntry) continue;

    try {
      await db.$transaction(async (tx) => {
        // Period close check
        const periodLock = await checkPeriodClose(new Date(date));
        if (periodLock) {
          throw new Error(`Period locked for date ${date}`);
        }

        // Customer credit freeze check (re-check within transaction)
        const freshCustomer = await tx.customer.findUnique({
          where: { id: customerId },
          select: { creditStatus: true, creditLimit: true, currentBalance: true, currentBalanceType: true, companyId: true },
        });
        if (!freshCustomer || freshCustomer.creditStatus === 'Frozen') {
          throw new Error(`Customer account is FROZEN. Cannot create sales order.`);
        }

        // Compute line financials with COGS and stock verification
        const computedLines: ComputedSOLine[] = [];
        for (const row of groupRows) {
          const product = await tx.product.findUnique({
            where: { id: row.productId },
            select: { id: true, name: true, costPrice: true, openingStock: true },
          });
          if (!product) {
            throw new Error(`Product "${row.productCode}" not found`);
          }

          // Stock safety check
          const currentStock = await computeCurrentStock(tx, row.productId, undefined);
          if (currentStock < row.quantity) {
            throw new Error(`Insufficient stock for "${product.name}". Available: ${currentStock}, Requested: ${row.quantity}`);
          }

          const computed = computeSalesLineFinancials(
            {
              productId: row.productId,
              quantity: row.quantity,
              rate: row.rate,
              discountPercent: row.discountPercent,
              vatAmount: row.vatAmount,
            },
            product.costPrice || 0
          );
          computedLines.push(computed);
        }

        // Compute order-level financials
        const { subTotal, discount: totalDiscount, vatAmount, grandTotal, cogsTotal, grossProfit, profitMargin } =
          computeSalesOrderFinancials(computedLines, 0, 0);

        // Customer credit limit check (within transaction)
        if (freshCustomer.creditLimit > 0) {
          const outstandingBalance = Math.abs(freshCustomer.currentBalance);
          const projectedBalance = safeFinancialAdd(outstandingBalance, grandTotal);
          if (projectedBalance > freshCustomer.creditLimit) {
            // Auto-toggle OverLimit
            if (freshCustomer.creditStatus !== 'OverLimit') {
              await tx.customer.update({
                where: { id: customerId },
                data: { creditStatus: 'OverLimit' },
              });
            }
            throw new Error(
              `Credit limit exceeded for customer "${customerEntry.name}". Outstanding + proposed exceeds ceiling.`
            );
          }
        }

        // Auto-generate invoiceNo
        const invoiceNo = await generateInvoiceNo(tx);

        // Company ID from customer or user
        const companyId = security.user.companyId || freshCustomer.companyId || null;

        const salesOrder = await tx.salesOrder.create({
          data: {
            invoiceNo,
            customerId,
            date: new Date(date),
            godownId: null,
            subTotal,
            discount: totalDiscount,
            discountPercent: 0,
            vatPercentage: 0,
            vatAmount,
            grandTotal,
            status: 'Draft',
            notes: `Imported from CSV. Customer: ${row.customerCode}`,
            srId: null,
            companyId,
            cogsTotal,
            grossProfit,
            profitMargin,
            arPosted: false,
            referenceKey: null,
            lines: {
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
            },
          },
        });

        // Create StockEntry (type=OUT) for each line
        for (const line of computedLines) {
          await tx.stockEntry.create({
            data: {
              productId: line.productId,
              godownId: null,
              type: 'OUT',
              quantity: line.quantity,
              reference: invoiceNo,
              referenceType: 'SalesOrder',
              date: new Date(date),
            },
          });
        }

        // ── AR Ledger Integration ──
        const { newBalance, newBalanceType } = computeNewArBalance(
          freshCustomer.currentBalance,
          freshCustomer.currentBalanceType,
          grandTotal
        );

        let newCreditStatus = freshCustomer.creditStatus;
        if (newBalanceType === 'Dr' && freshCustomer.creditLimit > 0 && newBalance > freshCustomer.creditLimit) {
          newCreditStatus = 'OverLimit';
        }

        await tx.customer.update({
          where: { id: customerId },
          data: {
            currentBalance: newBalance,
            currentBalanceType: newBalanceType,
            creditStatus: newCreditStatus,
          },
        });

        // Set arPosted = true
        await tx.salesOrder.update({
          where: { id: salesOrder.id },
          data: { arPosted: true },
        });

        // Audit log
        await tx.auditLog.create({
          data: {
            action: 'IMPORT',
            module: 'SalesOrders',
            recordId: salesOrder.id,
            recordLabel: invoiceNo,
            userId: security.user.id,
            userName: security.user.name,
            details: JSON.stringify({
              invoiceNo,
              customerCode: row.customerCode,
              importedFrom: 'CSV',
              lineCount: groupRows.length,
              grandTotal,
              cogsTotal,
            }),
          },
        });

        // Activity log
        await logUserActivity({
          tx: tx,
          action: 'IMPORT',
          module: 'Inv-SalesOrder-Pipeline',
          recordId: salesOrder.id,
          recordLabel: invoiceNo,
          userId: security.user.id,
          userName: security.user.name,
          details: `CSV import created sales order ${invoiceNo} for customer ${customerEntry.name} with ${groupRows.length} lines`,
        });

        imported += groupRows.length;
      });
    } catch (txError: any) {
      importErrors.push({
        row: 0,
        message: `Failed to import SO group for customer ${customerEntry.name}: ${txError.message}`,
      });
    }
  }

  const allErrors = [...errors, ...importErrors];

  return NextResponse.json({
    imported,
    failed: allErrors.length,
    errors: allErrors,
  });
}
