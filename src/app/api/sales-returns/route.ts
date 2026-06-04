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
import Papa from 'papaparse';

/**
 * Strip HTML tags from a string to prevent XSS in text fields.
 */
function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '').trim();
}

// ============================================================
// SHARED: Line-level Financial Computation for Sales Return
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

  // COGS Reversal: quantity * costPrice (from original order or product fallback)
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
// SHARED: Auto-generate returnNo: SRT-XXXXX
// ============================================================

async function generateReturnNo(tx: any): Promise<string> {
  const allSRs = await tx.salesReturn.findMany({
    select: { returnNo: true },
  });

  let maxNum = 0;
  for (const sr of allSRs) {
    if (sr.returnNo) {
      const match = sr.returnNo.match(/SRT-(\d+)/);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
    }
  }
  return `SRT-${String(maxNum + 1).padStart(5, '0')}`;
}

// ============================================================
// SHARED: AR Adjustment — reduce Customer.currentBalance by grandTotal
// Customer is owed money (Cr side), so:
//   If currentBalanceType === 'Dr': currentBalance -= grandTotal;
//     if goes negative, flip to Cr
//   If currentBalanceType === 'Cr': currentBalance += grandTotal
// After adjustment, check if balance normalized below creditLimit,
// toggle from OverLimit to Active
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
    // Customer owes us less; subtract from Dr balance
    newBalance = safeFinancialSubtract(customer.currentBalance, grandTotal);
    if (newBalance < 0) {
      // Flipped to Cr — customer is now owed money
      newBalance = Math.abs(newBalance);
      newBalanceType = 'Cr';
    }
  } else {
    // Customer already has Cr balance (we owe them); add to Cr
    newBalance = safeFinancialAdd(customer.currentBalance, grandTotal);
    newBalanceType = 'Cr';
  }

  // Normalize: if balance rounds to 0, default to Dr
  if (safeFinancialRound(newBalance) === 0) {
    newBalance = 0;
    newBalanceType = 'Dr';
  }

  // Check credit status toggle: OverLimit → Active if balance normalized below creditLimit
  let newCreditStatus = customer.creditStatus;
  if (customer.creditStatus === 'OverLimit' && customer.creditLimit > 0) {
    if (newBalanceType === 'Dr' && newBalance <= customer.creditLimit) {
      newCreditStatus = 'Active';
    } else if (newBalanceType === 'Cr') {
      // Cr balance means customer is owed — definitely within credit limit
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

// ============================================================
// SHARED: Reverse AR Adjustment — add grandTotal back to
// Customer.currentBalance (undo the credit)
// ============================================================

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

  // Reverse: we previously reduced Dr or increased Cr.
  // Now we need to increase Dr or reduce Cr by grandTotal.
  if (customer.currentBalanceType === 'Cr') {
    // Customer was Cr (owed money); reduce Cr balance
    newBalance = safeFinancialSubtract(customer.currentBalance, grandTotal);
    if (newBalance < 0) {
      // Flipped to Dr — customer now owes us
      newBalance = Math.abs(newBalance);
      newBalanceType = 'Dr';
    }
  } else {
    // Customer was Dr (owes us); add back to Dr balance
    newBalance = safeFinancialAdd(customer.currentBalance, grandTotal);
    newBalanceType = 'Dr';
  }

  // Normalize: if balance rounds to 0, default to Dr
  if (safeFinancialRound(newBalance) === 0) {
    newBalance = 0;
    newBalanceType = 'Dr';
  }

  // Check if reversal pushes customer back OverLimit
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
// GET /api/sales-returns — List all sales returns with relations
// ============================================================

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'SalesReturns', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const customerId = searchParams.get('customerId');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    const where: Record<string, unknown> = { isActive: true };

    if (status) where.status = status;
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

    const salesReturns = await db.salesReturn.findMany({
      where,
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
      orderBy: { createdAt: 'desc' },
    });

    // Apply VAT Auditor masking for financial fields
    const maskedReturns = salesReturns.map((ret) =>
      maskForVatAuditorFinancial(ret as Record<string, unknown>, security.user.role)
    );

    return NextResponse.json(maskedReturns);
  } catch (error) {
    console.error('[SalesReturns] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sales returns' },
      { status: 500 }
    );
  }
}

// ============================================================
// POST /api/sales-returns — Create sales return with full validation
// POST /api/sales-returns?import=true — CSV Import
// ============================================================

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'SalesReturns', 'POST');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const isImport = searchParams.get('import') === 'true';

    if (isImport) {
      return handleCsvImport(request, security);
    }

    return handleCreate(request, security);
  } catch (error) {
    console.error('[SalesReturns] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to process sales return request' },
      { status: 500 }
    );
  }
}

// ============================================================
// Create Handler — Single sales return with COGS reversal & AR adjustment
// ============================================================

async function handleCreate(
  request: NextRequest,
  security: { user: { id: string; email: string; name: string; role: string; companyId: string | null } }
): Promise<NextResponse> {
  const body = await request.json();
  const {
    salesOrderId,
    customerId,
    godownId,
    date,
    discount,
    vatPercentage,
    reason,
    creditMemoCode,
    lines,
    referenceKey,
  } = body;

  // ── Validation ──
  if (!salesOrderId) {
    return NextResponse.json(
      { error: 'salesOrderId is required' },
      { status: 400 }
    );
  }
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

  // Period close guard
  const periodLock = await checkPeriodClose(new Date(date));
  if (periodLock) return periodLock;

  // Idempotency check via referenceKey
  if (referenceKey) {
    const existing = await db.salesReturn.findFirst({
      where: { referenceKey },
    });
    if (existing) {
      return NextResponse.json(
        {
          error: 'Duplicate submission detected. This sales return has already been created.',
          referenceKey,
          existingId: existing.id,
        },
        { status: 409 }
      );
    }
  }

  // Validate sales order exists
  const salesOrder = await db.salesOrder.findUnique({
    where: { id: salesOrderId },
    include: { lines: true, customer: true },
  });
  if (!salesOrder) {
    return NextResponse.json(
      { error: 'Sales order not found' },
      { status: 400 }
    );
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

  // Godown SUSPENDED status check
  if (godownId) {
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

  // ── Transaction: create with full validation ──
  const result = await db.$transaction(async (tx) => {
    // Process lines with COGS reversal calculation
    const computedLines: ComputedSRLine[] = [];

    for (const line of lines) {
      if (!line.productId) {
        throw Object.assign(new Error('VALIDATION_ERROR'), {
          validationError: 'Each line must have a productId',
        });
      }

      // Find the original sales order line for this product
      const salesOrderLine = await tx.salesOrderLine.findFirst({
        where: {
          salesOrderId,
          productId: line.productId,
        },
      });

      if (!salesOrderLine) {
        throw Object.assign(new Error('VALIDATION_ERROR'), {
          validationError: `Product not found in Sales Order. Cannot return items that were not part of the original order.`,
        });
      }

      // ── Cumulative Return Validation ──
      const existingReturns = await tx.salesReturn.findMany({
        where: {
          salesOrderId,
          isActive: true,
          status: { not: 'Rejected' },
        },
        include: { lines: { where: { productId: line.productId } } },
      });
      const totalAlreadyReturned = existingReturns.reduce(
        (sum, ret) => sum + ret.lines.reduce((lineSum, l) => lineSum + l.quantity, 0),
        0
      );
      const requestedQty = Number(line.quantity) || 0;

      if (totalAlreadyReturned + requestedQty > salesOrderLine.quantity) {
        const fmtBD = (v: number) =>
          new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
        throw Object.assign(new Error('CUMULATIVE_EXCEEDED'), {
          validationError: `Cumulative return quantity (${fmtBD(totalAlreadyReturned + requestedQty)}) exceeds original order quantity (${fmtBD(salesOrderLine.quantity)}) for this product. Already returned: ${fmtBD(totalAlreadyReturned)}, Attempting: ${fmtBD(requestedQty)}`,
        });
      }

      // ── COGS Reversal Calculation ──
      // Use the original order line's costPrice; fallback to Product.costPrice
      let costPrice = salesOrderLine.costPrice || 0;

      if (!costPrice) {
        // Fallback: look up current Product.costPrice
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

    // Compute order-level financials
    const subTotal = computedLines.reduce(
      (sum, l) => safeFinancialAdd(sum, l.total),
      0
    );
    const headerDiscount = Number(discount) || 0;
    const vatPct = Number(vatPercentage) || 0;
    const afterDiscount = safeFinancialSubtract(subTotal, headerDiscount);
    const vatAmount = safeFinancialRound(afterDiscount * (vatPct / 100));
    const grandTotal = safeFinancialAdd(afterDiscount, vatAmount);

    // Compute order-level COGS reversal
    const cogsReversalTotal = computedLines.reduce(
      (sum, l) => safeFinancialAdd(sum, l.cogsReversal),
      0
    );

    // Auto-generate returnNo
    const returnNo = await generateReturnNo(tx);

    // Determine company ID
    const companyId = security.user.companyId || salesOrder.companyId || null;

    // Create sales return with lines
    const salesReturn = await tx.salesReturn.create({
      data: {
        returnNo,
        salesOrderId,
        customerId,
        godownId: godownId || null,
        date: new Date(date),
        subTotal,
        discount: headerDiscount,
        vatPercentage: vatPct,
        vatAmount,
        reason: reason ? stripHtml(String(reason)) : null,
        grandTotal,
        creditMemoCode: creditMemoCode || null,
        status: 'Pending',
        cogsReversal: cogsReversalTotal,
        arAdjustmentPosted: true,
        referenceKey: referenceKey || null,
        companyId,
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
            cogsReversal: cl.cogsReversal,
          })),
        },
      },
      include: {
        salesOrder: { include: { customer: true } },
        customer: true,
        godown: true,
        company: true,
        lines: { include: { product: true } },
      },
    });

    // Create StockEntry (type="IN") for each line — items restocked
    for (const line of computedLines) {
      await tx.stockEntry.create({
        data: {
          productId: line.productId,
          godownId: godownId || null,
          type: 'IN',
          quantity: line.quantity,
          reference: returnNo,
          referenceType: 'SalesReturn',
          date: new Date(date),
        },
      });
    }

    // ── AR Adjustment: Reduce Customer.currentBalance by grandTotal ──
    await applyArAdjustment(tx, customerId, grandTotal);

    // Audit log
    await tx.auditLog.create({
      data: {
        action: 'CREATE',
        module: 'SalesReturns',
        recordId: salesReturn.id,
        recordLabel: returnNo,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          returnNo,
          salesOrderId,
          customerId,
          subTotal,
          discount: headerDiscount,
          vatPercentage: vatPct,
          vatAmount,
          grandTotal,
          cogsReversal: cogsReversalTotal,
          arAdjustmentPosted: true,
          lineCount: computedLines.length,
        }),
      },
    });

    // Activity log
    await logUserActivity({
          tx: tx,
      action: 'CREATE',
      module: 'Inv-SalesReturn-Pipeline',
      recordId: salesReturn.id,
      recordLabel: returnNo,
      userId: security.user.id,
      userName: security.user.name,
      details: `Created sales return ${returnNo} for customer ${customer.name} against order ${salesOrder.invoiceNo} with ${computedLines.length} lines, grandTotal=${grandTotal}, cogsReversal=${cogsReversalTotal}`,
    });

    return salesReturn;
  }).catch((error: any) => {
    // Re-throw validation errors
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

  return NextResponse.json(result, { status: 201 });
}

// ============================================================
// CSV Import Handler
// Headers: salesOrderId (or invoiceNo), customerCode, date, productCode,
//          quantity, rate, discountPercent, vatAmount, godownCode, reason
// ============================================================

async function handleCsvImport(
  request: NextRequest,
  security: { user: { id: string; email: string; name: string; role: string; companyId: string | null } }
): Promise<NextResponse> {
  const contentType = request.headers.get('content-type') || '';
  let csvText: string;

  if (contentType.includes('text/csv')) {
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
    transformHeader: (h: string) => h.trim().replace(/"/g, ''),
  });

  if (parseResult.errors.length > 0) {
    const fieldErrors = parseResult.errors.map((e) => ({
      row: e.row !== undefined ? e.row + 2 : 0,
      message: e.message,
    }));
    return NextResponse.json(
      {
        error: 'CSV parsing failed',
        imported: 0,
        failed: fieldErrors.length,
        fieldErrors,
      },
      { status: 400 }
    );
  }

  const requiredHeaders = ['customerCode', 'date', 'productCode', 'quantity', 'rate'];
  const headers = parseResult.meta.fields || [];
  const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));
  if (missingHeaders.length > 0) {
    return NextResponse.json(
      { error: `Missing required CSV headers: ${missingHeaders.join(', ')}` },
      { status: 400 }
    );
  }

  interface CsvRow {
    salesOrderId?: string;
    invoiceNo?: string;
    customerCode: string;
    date: string;
    productCode: string;
    quantity: string;
    rate: string;
    discountPercent?: string;
    vatAmount?: string;
    godownCode?: string;
    reason?: string;
  }

  const parsedRows = parseResult.data as CsvRow[];
  const errors: Array<{ row: number; message: string }> = [];
  const fieldErrors: Array<{ row: number; field: string; message: string }> = [];

  // ── Cross-reference customerCode against Customer.customerCode ──
  const customerCodes = [...new Set(parsedRows.map((r) => r.customerCode?.trim()).filter(Boolean))];
  const existingCustomers = await db.customer.findMany({
    where: { customerCode: { in: customerCodes } },
    select: { id: true, customerCode: true, name: true, creditStatus: true, companyId: true },
  });
  const customerMap = new Map(existingCustomers.map((c) => [c.customerCode, c]));

  // ── Cross-reference productCode against Product.productCode ──
  const productCodes = [...new Set(parsedRows.map((r) => r.productCode?.trim()).filter(Boolean))];
  const existingProducts = await db.product.findMany({
    where: { productCode: { in: productCodes } },
    select: { id: true, productCode: true, name: true, costPrice: true },
  });
  const productMap = new Map(existingProducts.map((p) => [p.productCode, p]));

  // ── Cross-reference godownCode against Godown.code ──
  const godownCodes = [...new Set(parsedRows.map((r) => r.godownCode?.trim()).filter(Boolean))];
  let godownMap = new Map<string, { id: string; code: string; name: string; status: string }>();
  if (godownCodes.length > 0) {
    const existingGodowns = await db.godown.findMany({
      where: { code: { in: godownCodes } },
      select: { id: true, code: true, name: true, status: true },
    });
    godownMap = new Map(existingGodowns.map((g) => [g.code, g]));
  }

  // Validate each row
  interface ValidRow {
    rowNum: number;
    salesOrderId: string | null;
    invoiceNo: string | null;
    customerId: string;
    customerCode: string;
    date: string;
    productId: string;
    productCode: string;
    quantity: number;
    rate: number;
    discountPercent: number;
    vatAmount: number;
    godownId: string | null;
    reason: string;
  }

  const validRows: ValidRow[] = [];

  for (let i = 0; i < parsedRows.length; i++) {
    const row = parsedRows[i];
    const rowNum = i + 2; // +2: 1-indexed + header row

    const salesOrderIdVal = (row.salesOrderId || '').trim();
    const invoiceNoVal = (row.invoiceNo || '').trim();
    const customerCode = (row.customerCode || '').trim();
    const dateVal = (row.date || '').trim();
    const productCode = (row.productCode || '').trim();
    const quantityStr = (row.quantity || '').trim();
    const rateStr = (row.rate || '').trim();
    const discountPercentStr = (row.discountPercent || '').trim();
    const vatAmountStr = (row.vatAmount || '').trim();
    const godownCode = (row.godownCode || '').trim();
    const reasonVal = (row.reason || '').trim();

    // ── Incomplete Transaction ID Rejection ──
    // Reject rows where both salesOrderId and invoiceNo are missing or empty
    if (!salesOrderIdVal && !invoiceNoVal) {
      errors.push({
        row: rowNum,
        message: 'Incomplete transaction ID: Either salesOrderId or invoiceNo must be provided. Row rejected.',
      });
      fieldErrors.push({
        row: rowNum,
        field: 'salesOrderId/invoiceNo',
        message: 'Either salesOrderId or invoiceNo must be provided',
      });
      continue;
    }

    // Validate customerCode
    if (!customerCode) {
      errors.push({ row: rowNum, message: 'customerCode is required' });
      continue;
    }

    // ── Client Limit Validation: Check customer exists and creditStatus is not Frozen ──
    const csvCustomer = customerMap.get(customerCode);
    if (!csvCustomer) {
      errors.push({
        row: rowNum,
        message: `Customer code "${customerCode}" does not exist. Row rejected.`,
      });
      continue;
    }
    if (csvCustomer.creditStatus === 'Frozen') {
      errors.push({
        row: rowNum,
        message: `Customer "${csvCustomer.name}" (${customerCode}) account is FROZEN. Cannot create sales return for frozen accounts. Row rejected.`,
      });
      continue;
    }

    // Validate date
    if (!dateVal || isNaN(Date.parse(dateVal))) {
      errors.push({ row: rowNum, message: `Invalid date "${dateVal}"` });
      continue;
    }

    // Validate productCode
    if (!productCode) {
      errors.push({ row: rowNum, message: 'productCode is required' });
      continue;
    }

    const csvProduct = productMap.get(productCode);
    if (!csvProduct) {
      errors.push({
        row: rowNum,
        message: `Product code "${productCode}" does not exist. Row rejected.`,
      });
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

    // Resolve godown
    let godownId: string | null = null;
    if (godownCode) {
      const godown = godownMap.get(godownCode);
      if (!godown) {
        errors.push({
          row: rowNum,
          message: `Godown code "${godownCode}" does not exist. Row rejected.`,
        });
        continue;
      }
      if (godown.status === 'SUSPENDED') {
        errors.push({
          row: rowNum,
          message: `Godown "${godown.name}" (${godownCode}) is SUSPENDED. Row rejected.`,
        });
        continue;
      }
      godownId = godown.id;
    }

    validRows.push({
      rowNum,
      salesOrderId: salesOrderIdVal || null,
      invoiceNo: invoiceNoVal || null,
      customerId: csvCustomer.id,
      customerCode,
      date: dateVal,
      productId: csvProduct.id,
      productCode,
      quantity,
      rate,
      discountPercent,
      vatAmount,
      godownId,
      reason: reasonVal,
    });
  }

  if (validRows.length === 0) {
    return NextResponse.json(
      {
        imported: 0,
        failed: errors.length,
        errors,
        fieldErrors,
        message: 'No valid rows to import. All rows had errors.',
      },
      { status: 400 }
    );
  }

  // ── Resolve salesOrderId for each row ──
  // If invoiceNo is provided instead of salesOrderId, resolve it
  for (const row of validRows) {
    if (!row.salesOrderId && row.invoiceNo) {
      const so = await db.salesOrder.findFirst({
        where: { invoiceNo: row.invoiceNo },
        select: { id: true, customerId: true },
      });
      if (!so) {
        errors.push({
          row: row.rowNum,
          message: `Sales order with invoiceNo "${row.invoiceNo}" does not exist. Row rejected.`,
        });
        continue;
      }
      row.salesOrderId = so.id;
    }
  }

  // Filter out rows that still don't have a salesOrderId
  const resolvedRows = validRows.filter((r) => r.salesOrderId !== null);

  // ── Group valid rows by salesOrderId to create separate returns per order ──
  const returnGroups = new Map<string, typeof resolvedRows>();
  for (const row of resolvedRows) {
    const groupKey = `${row.salesOrderId}|${row.date}`;
    if (!returnGroups.has(groupKey)) {
      returnGroups.set(groupKey, []);
    }
    returnGroups.get(groupKey)!.push(row);
  }

  let imported = 0;
  const importErrors: Array<{ row: number; message: string }> = [];

  for (const [groupKey, groupRows] of returnGroups) {
    const [salesOrderIdStr, dateStr] = groupKey.split('|');

    try {
      await db.$transaction(async (tx) => {
        // Period close check
        const periodLock = await checkPeriodClose(new Date(dateStr));
        if (periodLock) {
          throw new Error(`Period locked for date ${dateStr}`);
        }

        // Fetch the sales order with lines for COGS calculation
        const salesOrder = await tx.salesOrder.findUnique({
          where: { id: salesOrderIdStr },
          include: { lines: true, customer: true },
        });
        if (!salesOrder) {
          throw new Error(`Sales order ${salesOrderIdStr} not found`);
        }

        const customerId = groupRows[0].customerId;
        const godownId = groupRows[0].godownId;

        // Compute line financials with COGS reversal
        const computedLines: ComputedSRLine[] = [];

        for (const row of groupRows) {
          // Find the original sales order line for this product
          const salesOrderLine = salesOrder.lines.find(
            (l) => l.productId === row.productId
          );

          if (!salesOrderLine) {
            throw new Error(
              `Product code "${row.productCode}" not found in Sales Order ${salesOrder.invoiceNo}. Row rejected.`
            );
          }

          // Cumulative return validation
          const existingReturns = await tx.salesReturn.findMany({
            where: {
              salesOrderId: salesOrderIdStr,
              isActive: true,
              status: { not: 'Rejected' },
            },
            include: { lines: { where: { productId: row.productId } } },
          });
          const totalAlreadyReturned = existingReturns.reduce(
            (sum, ret) => sum + ret.lines.reduce((lineSum, l) => lineSum + l.quantity, 0),
            0
          );

          if (totalAlreadyReturned + row.quantity > salesOrderLine.quantity) {
            throw new Error(
              `Cumulative return quantity exceeds original order quantity for product "${row.productCode}". Already returned: ${totalAlreadyReturned}, Attempting: ${row.quantity}`
            );
          }

          // COGS Reversal Calculation
          let costPrice = salesOrderLine.costPrice || 0;
          if (!costPrice) {
            const product = await tx.product.findUnique({
              where: { id: row.productId },
              select: { costPrice: true },
            });
            costPrice = product?.costPrice || 0;
          }

          const computed = computeSRLineFinancials(
            {
              productId: row.productId,
              quantity: row.quantity,
              rate: row.rate,
              discountPercent: row.discountPercent,
              vatAmount: row.vatAmount,
            },
            costPrice
          );
          computedLines.push(computed);
        }

        // Compute order-level financials
        const subTotal = computedLines.reduce(
          (sum, l) => safeFinancialAdd(sum, l.total),
          0
        );
        const afterDiscount = subTotal;
        const vatAmount = safeFinancialRound(0);
        const grandTotal = safeFinancialAdd(afterDiscount, vatAmount);
        const cogsReversalTotal = computedLines.reduce(
          (sum, l) => safeFinancialAdd(sum, l.cogsReversal),
          0
        );

        // Auto-generate returnNo
        const returnNo = await generateReturnNo(tx);

        // Determine company ID
        const companyId = security.user.companyId || salesOrder.companyId || null;

        const salesReturn = await tx.salesReturn.create({
          data: {
            returnNo,
            salesOrderId: salesOrderIdStr,
            customerId,
            godownId,
            date: new Date(dateStr),
            subTotal,
            discount: 0,
            vatPercentage: 0,
            vatAmount,
            reason: groupRows[0].reason || `Imported from CSV. Order: ${salesOrder.invoiceNo}`,
            grandTotal,
            status: 'Pending',
            cogsReversal: cogsReversalTotal,
            arAdjustmentPosted: true,
            referenceKey: null,
            companyId,
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
                cogsReversal: cl.cogsReversal,
              })),
            },
          },
        });

        // Create StockEntry (type="IN") for each line
        for (const line of computedLines) {
          await tx.stockEntry.create({
            data: {
              productId: line.productId,
              godownId,
              type: 'IN',
              quantity: line.quantity,
              reference: returnNo,
              referenceType: 'SalesReturn',
              date: new Date(dateStr),
            },
          });
        }

        // AR Adjustment
        await applyArAdjustment(tx, customerId, grandTotal);

        // Audit log
        await tx.auditLog.create({
          data: {
            action: 'IMPORT',
            module: 'SalesReturns',
            recordId: salesReturn.id,
            recordLabel: returnNo,
            userId: security.user.id,
            userName: security.user.name,
            details: JSON.stringify({
              returnNo,
              salesOrderId: salesOrderIdStr,
              customerId,
              importedFrom: 'CSV',
              lineCount: groupRows.length,
              grandTotal,
              cogsReversal: cogsReversalTotal,
            }),
          },
        });

        // Activity log
        await logUserActivity({
          tx: tx,
          action: 'IMPORT',
          module: 'Inv-SalesReturn-Pipeline',
          recordId: salesReturn.id,
          recordLabel: returnNo,
          userId: security.user.id,
          userName: security.user.name,
          details: `CSV import created sales return ${returnNo} for customer against order ${salesOrder.invoiceNo} with ${groupRows.length} lines`,
        });

        imported += groupRows.length;
      });
    } catch (txError: any) {
      importErrors.push({
        row: 0,
        message: `Failed to import sales return group for order ${salesOrderIdStr}: ${txError.message}`,
      });
    }
  }

  const allErrors = [...errors, ...importErrors];

  return NextResponse.json({
    imported,
    failed: allErrors.length,
    errors: allErrors,
    fieldErrors,
  });
}
