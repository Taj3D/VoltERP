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
// SHARED: Line-level Financial Computation
// ============================================================

interface POLineInput {
  productId: string;
  quantity: number;
  rate: number;
  discountPercent?: number;
  vatPercentage?: number;
  notes?: string;
}

interface ComputedPOLine {
  productId: string;
  quantity: number;
  rate: number;
  discountPercent: number;
  discountAmount: number;
  vatAmount: number;
  total: number;
  receivedQuantity: number;
  pendingQuantity: number;
  availableStock: number;
  stockStatus: string;
  notes: string | null;
}

function computeLineFinancials(
  line: POLineInput,
  availableStock: number
): ComputedPOLine {
  const lineGross = safeFinancialRound(line.quantity * line.rate);
  const discountPercent = line.discountPercent ?? 0;
  const discountAmount = safeFinancialRound(lineGross * (discountPercent / 100));
  const afterDiscount = safeFinancialSubtract(lineGross, discountAmount);
  const vatPercentage = line.vatPercentage ?? 0;
  const vatAmount = safeFinancialRound(afterDiscount * (vatPercentage / 100));
  const total = safeFinancialAdd(afterDiscount, vatAmount);

  // Determine stock status based on available quantity
  let stockStatus: string;
  if (availableStock <= 0) {
    stockStatus = 'Out of Stock';
  } else if (availableStock < line.quantity) {
    stockStatus = 'Low';
  } else {
    stockStatus = 'Available';
  }

  return {
    productId: line.productId,
    quantity: line.quantity,
    rate: line.rate,
    discountPercent,
    discountAmount,
    vatAmount,
    total,
    receivedQuantity: 0,
    pendingQuantity: line.quantity,
    availableStock,
    stockStatus,
    notes: line.notes || null,
  };
}

// ============================================================
// SHARED: Order-level Financial Computation
// ============================================================

function computeOrderFinancials(
  computedLines: ComputedPOLine[],
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
// SHARED: Auto-generate poNumber: PUR-XXXXX
// ============================================================

async function generatePoNumber(tx: any): Promise<string> {
  const allPOs = await tx.purchaseOrder.findMany({
    select: { poNumber: true },
  });

  let maxNum = 0;
  for (const po of allPOs) {
    if (po.poNumber) {
      const match = po.poNumber.match(/PUR-(\d+)/);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
    }
  }
  return `PUR-${String(maxNum + 1).padStart(5, '0')}`;
}

// ============================================================
// GET /api/purchase-orders — List all purchase orders with relations
// ============================================================

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'PurchaseOrders', 'GET');
  if (!security.authorized) return security.response;

  // Dealer: completely blocked from purchase order records
  if (security.user.role === 'dealer') {
    return NextResponse.json(
      { error: 'Access denied. Dealers cannot access purchase order records.' },
      { status: 403 }
    );
  }

  // SR: blocked from purchase order records
  if (security.user.role === 'sr') {
    return NextResponse.json(
      { error: 'Access denied. SRs cannot access purchase order records.' },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const supplierId = searchParams.get('supplierId');
    const godownId = searchParams.get('godownId');
    const fulfillmentStatus = searchParams.get('fulfillmentStatus');
    const receivingStatus = searchParams.get('receivingStatus');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    const where: Record<string, unknown> = { isActive: true };

    if (status) where.status = status;
    if (supplierId) where.supplierId = supplierId;
    if (godownId) where.godownId = godownId;
    if (fulfillmentStatus) where.fulfillmentStatus = fulfillmentStatus;
    if (receivingStatus) where.receivingStatus = receivingStatus;

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

    const purchaseOrders = await db.purchaseOrder.findMany({
      where,
      include: {
        supplier: true,
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

    // Apply VAT Auditor masking for financial fields (including line items)
    const maskedOrders = purchaseOrders.map((order) =>
      maskOrderWithLinesForVatAuditor(order as Record<string, unknown>, security.user.role)
    );

    return NextResponse.json(maskedOrders);
  } catch (error) {
    console.error('[PurchaseOrders] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch purchase orders' },
      { status: 500 }
    );
  }
}

// ============================================================
// POST /api/purchase-orders — Create purchase order with full validation
// POST /api/purchase-orders?import=true — CSV Import
// ============================================================

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'PurchaseOrders', 'POST');
  if (!security.authorized) return security.response;

  // Dealer: completely blocked from purchase order records
  if (security.user.role === 'dealer') {
    return NextResponse.json(
      { error: 'Access denied. Dealers cannot access purchase order records.' },
      { status: 403 }
    );
  }

  // SR: cannot create purchase orders
  if (security.user.role === 'sr') {
    return NextResponse.json(
      { error: 'Access denied. SRs cannot create purchase orders.' },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const isImport = searchParams.get('import') === 'true';

    if (isImport) {
      return handleCsvImport(request, security);
    }

    return handleCreate(request, security);
  } catch (error) {
    console.error('[PurchaseOrders] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to process purchase order request' },
      { status: 500 }
    );
  }
}

// ============================================================
// Create Handler — Single purchase order with full validation
// ============================================================

async function handleCreate(
  request: NextRequest,
  security: { user: { id: string; email: string; name: string; role: string; companyId: string | null } }
): Promise<NextResponse> {
  const body = await request.json();
  const {
    supplierId,
    date,
    godownId,
    discountPercent = 0,
    vatPercentage = 0,
    notes,
    referenceKey,
    status = 'Draft',
    expectedDate,
    lines,
  } = body;

  // ── Validation ──
  if (!supplierId) {
    return NextResponse.json(
      { error: 'supplierId is required' },
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

  // Validate status is one of the allowed values
  const validStatuses = ['Draft', 'Confirmed', 'Received', 'Cancelled'];
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
    const existing = await db.purchaseOrder.findFirst({
      where: { referenceKey },
    });
    if (existing) {
      return NextResponse.json(
        {
          error: 'Duplicate submission detected. This purchase order has already been created.',
          referenceKey,
          existingId: existing.id,
        },
        { status: 409 }
      );
    }
  }

  // Validate supplier exists
  const supplier = await db.supplier.findUnique({
    where: { id: supplierId },
  });
  if (!supplier) {
    return NextResponse.json(
      { error: 'Supplier not found' },
      { status: 400 }
    );
  }

  // Supplier credit limit protection — Frozen account blocks all orders
  if (supplier.creditStatus === 'Frozen') {
    const fmtBD = (v: number) =>
      new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
    return NextResponse.json(
      {
        error: `CREDIT FREEZE: Transaction blocked. Supplier account is frozen. Outstanding Tk. ${fmtBD(Math.abs(supplier.currentBalance))}. Review supplier payment terms or contact management to unfreeze account.`,
      },
      { status: 403 }
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
    // Validate each line's productId exists and compute stock snapshots
    const computedLines: ComputedPOLine[] = [];
    for (const line of lines) {
      if (!line.productId) {
        throw Object.assign(new Error('VALIDATION_ERROR'), {
          validationError: 'Each line must have a productId',
        });
      }

      const product = await tx.product.findUnique({
        where: { id: line.productId },
        select: { id: true, openingStock: true },
      });

      if (!product) {
        throw Object.assign(new Error('VALIDATION_ERROR'), {
          validationError: `Product with ID "${line.productId}" not found`,
        });
      }

      // Compute current stock for this product
      const currentStock = await computeCurrentStock(
        tx,
        line.productId,
        godownId || undefined
      );

      const computed = computeLineFinancials(
        {
          productId: line.productId,
          quantity: Number(line.quantity) || 0,
          rate: Number(line.rate) || 0,
          discountPercent: Number(line.discountPercent) || 0,
          vatPercentage: Number(line.vatPercentage) || 0,
          notes: line.notes,
        },
        currentStock
      );

      computedLines.push(computed);
    }

    // Compute order-level financials
    const orderDiscountPercent = Number(discountPercent) || 0;
    const orderVatPercentage = Number(vatPercentage) || 0;
    const { subTotal, discount, vatAmount, grandTotal } = computeOrderFinancials(
      computedLines,
      orderDiscountPercent,
      orderVatPercentage
    );

    // Supplier credit limit protection — check if projected exceeds credit ceiling
    if (supplier.creditLimit > 0) {
      const outstandingBalance = Math.abs(supplier.currentBalance);
      const projectedBalance = safeFinancialAdd(outstandingBalance, grandTotal);

      if (projectedBalance > supplier.creditLimit) {
        // Auto-toggle creditStatus to OverLimit
        if (supplier.creditStatus !== 'OverLimit') {
          await tx.supplier.update({
            where: { id: supplierId },
            data: { creditStatus: 'OverLimit' },
          });
        }

        const fmtBD = (v: number) =>
          new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
        throw Object.assign(new Error('CREDIT_LIMIT_EXCEEDED'), {
          creditError: `CREDIT FREEZE: Transaction blocked. Supplier outstanding Tk. ${fmtBD(outstandingBalance)} + proposed Tk. ${fmtBD(grandTotal)} = Tk. ${fmtBD(projectedBalance)} exceeds credit ceiling Tk. ${fmtBD(supplier.creditLimit)}. Review supplier payment terms or increase credit limit.`,
        });
      }
    }

    // Determine fulfillment and receiving status
    const fulfillmentStatus = status === 'Draft' ? 'Pending' : 'Pending';
    const receivingStatus = 'Unreceived';

    // Auto-generate poNumber
    const poNumber = await generatePoNumber(tx);

    // Determine company ID
    const companyId = security.user.companyId || supplier.companyId || null;

    const purchaseOrder = await tx.purchaseOrder.create({
      data: {
        poNumber,
        supplierId,
        date: new Date(date),
        godownId: godownId || null,
        subTotal,
        discount,
        discountPercent: orderDiscountPercent,
        vatPercentage: orderVatPercentage,
        vatAmount,
        grandTotal,
        status,
        fulfillmentStatus,
        receivingStatus,
        expectedDate: expectedDate ? new Date(expectedDate) : null,
        receivedDate: null,
        referenceKey: referenceKey || null,
        notes: notes ? stripHtml(String(notes)) : null,
        companyId,
        lines: {
          create: computedLines.map((cl) => ({
            productId: cl.productId,
            quantity: cl.quantity,
            receivedQuantity: cl.receivedQuantity,
            pendingQuantity: cl.pendingQuantity,
            rate: cl.rate,
            discountPercent: cl.discountPercent,
            discountAmount: cl.discountAmount,
            vatAmount: cl.vatAmount,
            total: cl.total,
            availableStock: cl.availableStock,
            stockStatus: cl.stockStatus,
            notes: cl.notes,
          })),
        },
      },
      include: {
        supplier: true,
        godown: true,
        company: true,
        lines: { include: { product: true } },
      },
    });

    // NOTE: StockEntry (type=IN) is NOT created here on PO creation.
    // Stock is only added when the PO is actually RECEIVED via the
    // /api/purchase-orders/receive endpoint. Creating stock entries on
    // PO creation caused a double-entry bug (stock doubled when a
    // Confirmed PO was later received).

    // Audit log
    await tx.auditLog.create({
      data: {
        action: 'CREATE',
        module: 'PurchaseOrders',
        recordId: purchaseOrder.id,
        recordLabel: poNumber,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          poNumber,
          supplierId,
          status,
          subTotal,
          discount,
          vatAmount,
          grandTotal,
          lineCount: computedLines.length,
          fulfillmentStatus,
          receivingStatus,
          stockEntriesCreated: status === 'Confirmed' || status === 'Received',
        }),
      },
    });

    // Activity log
    await logUserActivity({
          tx: tx,
      action: 'CREATE',
      module: 'Inv-PurchaseOrder-Pipeline',
      recordId: purchaseOrder.id,
      recordLabel: poNumber,
      userId: security.user.id,
      userName: security.user.name,
      details: `Created purchase order ${poNumber} for supplier ${supplier.name} with ${computedLines.length} lines, grandTotal=${grandTotal}, status=${status}`,
    });

    return purchaseOrder;
  }).catch((error: any) => {
    // Re-throw validation errors
    if (error?.message === 'VALIDATION_ERROR') {
      return { _validationError: true, message: error.validationError };
    }
    if (error?.message === 'CREDIT_LIMIT_EXCEEDED') {
      return { _creditError: true, message: error.creditError };
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

  // Automated SMS: Inventory Ingestion Event (when PO is Confirmed or Received)
  if (result && typeof result === 'object' && 'status' in result && ((result as any).status === 'Confirmed' || (result as any).status === 'Received')) {
    try {
      const { triggerInventoryIngestionSms } = await import('@/lib/sms-event-hooks');
      for (const line of (result as any).lines || []) {
        await triggerInventoryIngestionSms({
          id: (result as any).id,
          supplierId: (result as any).supplierId,
          productId: line.productId,
          quantity: line.quantity,
          godownId: (result as any).godownId,
          date: (result as any).date,
          companyId: (result as any).companyId || undefined,
        });
      }
    } catch (smsError) {
      console.error('[PurchaseOrders] SMS trigger failed (non-blocking):', smsError);
    }
  }

  return NextResponse.json(result, { status: 201 });
}

// ============================================================
// CSV Import Handler
// Headers: poNumber, supplierCode, date, productCode, quantity, rate,
//          discountPercent, vatPercentage, godownCode, notes
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

  // Parse CSV
  const csvLines = csvText.trim().split('\n');
  if (csvLines.length < 2) {
    return NextResponse.json(
      { error: 'CSV must have a header row and at least one data row' },
      { status: 400 }
    );
  }

  const headers = csvLines[0].split(',').map((h) => h.trim().replace(/"/g, ''));
  const requiredHeaders = ['supplierCode', 'date', 'productCode', 'quantity', 'rate'];
  const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));
  if (missingHeaders.length > 0) {
    return NextResponse.json(
      { error: `Missing required CSV headers: ${missingHeaders.join(', ')}` },
      { status: 400 }
    );
  }

  const headerIndex: Record<string, number> = {};
  headers.forEach((h, i) => {
    headerIndex[h] = i;
  });

  interface CsvRow {
    supplierCode: string;
    productCode: string;
    date: string;
    quantity: number;
    rate: number;
    discountPercent: number;
    vatPercentage: number;
    godownCode: string;
    notes: string;
  }

  const parsedRows: CsvRow[] = [];
  const errors: Array<{ row: number; message: string }> = [];

  for (let i = 1; i < csvLines.length; i++) {
    const row = csvLines[i].split(',').map((c) => c.trim().replace(/"/g, ''));
    const rowNum = i + 1; // 1-based row number for user readability

    const supplierCode = row[headerIndex['supplierCode']] || '';
    const date = row[headerIndex['date']] || '';
    const productCode = row[headerIndex['productCode']] || '';
    const quantityStr = row[headerIndex['quantity']] || '';
    const rateStr = row[headerIndex['rate']] || '';
    const discountPercentStr =
      headerIndex['discountPercent'] !== undefined
        ? row[headerIndex['discountPercent']]
        : '';
    const vatPercentageStr =
      headerIndex['vatPercentage'] !== undefined
        ? row[headerIndex['vatPercentage']]
        : '';
    const godownCode =
      headerIndex['godownCode'] !== undefined
        ? row[headerIndex['godownCode']]
        : '';
    const notes =
      headerIndex['notes'] !== undefined ? row[headerIndex['notes']] : '';

    // Validate supplierCode
    if (!supplierCode) {
      errors.push({ row: rowNum, message: 'supplierCode is required' });
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

    const vatPercentage = vatPercentageStr ? parseFloat(vatPercentageStr) : 0;
    if (vatPercentageStr && (isNaN(vatPercentage) || vatPercentage < 0 || vatPercentage > 100)) {
      errors.push({
        row: rowNum,
        message: `Invalid vatPercentage "${vatPercentageStr}". Must be between 0 and 100.`,
      });
      continue;
    }

    parsedRows.push({
      supplierCode,
      productCode,
      date,
      quantity,
      rate,
      discountPercent,
      vatPercentage,
      godownCode,
      notes,
    });
  }

  // ── CRITICAL: Cross-reference supplierCode against Supplier.supplierCode ──
  const supplierCodes = [...new Set(parsedRows.map((r) => r.supplierCode))];
  const existingSuppliers = await db.supplier.findMany({
    where: { supplierCode: { in: supplierCodes } },
    select: { id: true, supplierCode: true, name: true, creditStatus: true, creditLimit: true, currentBalance: true, companyId: true },
  });
  const supplierMap = new Map(existingSuppliers.map((s) => [s.supplierCode, s]));

  // ── CRITICAL: Cross-reference productCode against Product.productCode ──
  const productCodes = [...new Set(parsedRows.map((r) => r.productCode))];
  const existingProducts = await db.product.findMany({
    where: { productCode: { in: productCodes } },
    select: { id: true, productCode: true, name: true, openingStock: true },
  });
  const productMap = new Map(existingProducts.map((p) => [p.productCode, p]));

  // ── Cross-reference godownCode against Godown.code ──
  const godownCodes = [...new Set(parsedRows.map((r) => r.godownCode).filter(Boolean))];
  let godownMap = new Map<string, { id: string; code: string; name: string; status: string }>();
  if (godownCodes.length > 0) {
    const existingGodowns = await db.godown.findMany({
      where: { code: { in: godownCodes } },
      select: { id: true, code: true, name: true, status: true },
    });
    godownMap = new Map(existingGodowns.map((g) => [g.code, g]));
  }

  // Filter rows with invalid supplier codes or product codes
  const validRows: Array<CsvRow & { rowNum: number; supplierId: string; productId: string; godownId: string | null }> = [];
  for (let i = 0; i < parsedRows.length; i++) {
    const row = parsedRows[i];
    const rowNum = i + 2; // +2 because: +1 for 0-index, +1 for header row

    const supplier = supplierMap.get(row.supplierCode);
    if (!supplier) {
      errors.push({
        row: rowNum,
        message: `Supplier code "${row.supplierCode}" does not exist. Row rejected.`,
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

    // Resolve godown
    let godownId: string | null = null;
    if (row.godownCode) {
      const godown = godownMap.get(row.godownCode);
      if (!godown) {
        errors.push({
          row: rowNum,
          message: `Godown code "${row.godownCode}" does not exist. Row rejected.`,
        });
        continue;
      }
      if (godown.status === 'SUSPENDED') {
        errors.push({
          row: rowNum,
          message: `Godown "${godown.name}" (${row.godownCode}) is SUSPENDED. Row rejected.`,
        });
        continue;
      }
      godownId = godown.id;
    }

    validRows.push({
      ...row,
      rowNum,
      supplierId: supplier.id,
      productId: product.id,
      godownId,
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

  // ── Group valid rows by supplierCode to create separate POs per supplier ──
  const poGroups = new Map<string, typeof validRows>();
  for (const row of validRows) {
    // Group by supplierCode + date + godownCode for logical separation
    const groupKey = `${row.supplierCode}|${row.date}|${row.godownCode || ''}`;
    if (!poGroups.has(groupKey)) {
      poGroups.set(groupKey, []);
    }
    poGroups.get(groupKey)!.push(row);
  }

  let imported = 0;
  const importErrors: Array<{ row: number; message: string }> = [];

  for (const [groupKey, groupRows] of poGroups) {
    const [supplierCode, date, godownCodeStr] = groupKey.split('|');
    const supplier = supplierMap.get(supplierCode);
    if (!supplier) continue; // Already validated above, but safety check

    try {
      await db.$transaction(async (tx) => {
        // Period close check
        const periodLock = await checkPeriodClose(new Date(date));
        if (periodLock) {
          throw new Error(`Period locked for date ${date}`);
        }

        // Supplier credit freeze check
        if (supplier.creditStatus === 'Frozen') {
          throw new Error(`Supplier "${supplier.name}" (${supplierCode}) account is FROZEN. Cannot create PO.`);
        }

        // Resolve godown
        const godownId = groupRows[0].godownId;

        // Compute line financials with stock snapshots
        const computedLines: ComputedPOLine[] = [];
        for (const row of groupRows) {
          const currentStock = await computeCurrentStock(
            tx,
            row.productId,
            godownId || undefined
          );

          const computed = computeLineFinancials(
            {
              productId: row.productId,
              quantity: row.quantity,
              rate: row.rate,
              discountPercent: row.discountPercent,
              vatPercentage: row.vatPercentage,
              notes: row.notes,
            },
            currentStock
          );
          computedLines.push(computed);
        }

        // Compute order-level financials (no order-level discount for CSV import by default)
        const { subTotal, discount, vatAmount, grandTotal } =
          computeOrderFinancials(computedLines, 0, 0);

        // Supplier credit limit check
        if (supplier.creditLimit > 0) {
          const outstandingBalance = Math.abs(supplier.currentBalance);
          const projectedBalance = safeFinancialAdd(outstandingBalance, grandTotal);
          if (projectedBalance > supplier.creditLimit) {
            // Auto-toggle OverLimit
            if (supplier.creditStatus !== 'OverLimit') {
              await tx.supplier.update({
                where: { id: supplier.id },
                data: { creditStatus: 'OverLimit' },
              });
            }
            throw new Error(
              `Credit limit exceeded for supplier "${supplier.name}". Outstanding + proposed exceeds ceiling.`
            );
          }
        }

        // Auto-generate poNumber
        const poNumber = await generatePoNumber(tx);

        // Company ID from supplier or user
        const companyId = security.user.companyId || supplier.companyId || null;

        const purchaseOrder = await tx.purchaseOrder.create({
          data: {
            poNumber,
            supplierId: supplier.id,
            date: new Date(date),
            godownId: godownId || null,
            subTotal,
            discount,
            discountPercent: 0,
            vatPercentage: 0,
            vatAmount,
            grandTotal,
            status: 'Draft', // CSV import creates Draft POs by default
            fulfillmentStatus: 'Pending',
            receivingStatus: 'Unreceived',
            referenceKey: null,
            notes: `Imported from CSV. Supplier: ${supplierCode}`,
            companyId,
            lines: {
              create: computedLines.map((cl) => ({
                productId: cl.productId,
                quantity: cl.quantity,
                receivedQuantity: cl.receivedQuantity,
                pendingQuantity: cl.pendingQuantity,
                rate: cl.rate,
                discountPercent: cl.discountPercent,
                discountAmount: cl.discountAmount,
                vatAmount: cl.vatAmount,
                total: cl.total,
                availableStock: cl.availableStock,
                stockStatus: cl.stockStatus,
                notes: cl.notes,
              })),
            },
          },
        });

        // NO stock entries for Draft POs

        // Audit log
        await tx.auditLog.create({
          data: {
            action: 'IMPORT',
            module: 'PurchaseOrders',
            recordId: purchaseOrder.id,
            recordLabel: poNumber,
            userId: security.user.id,
            userName: security.user.name,
            details: JSON.stringify({
              poNumber,
              supplierCode,
              importedFrom: 'CSV',
              lineCount: groupRows.length,
              grandTotal,
            }),
          },
        });

        // Activity log
        await logUserActivity({
          tx: tx,
          action: 'IMPORT',
          module: 'Inv-PurchaseOrder-Pipeline',
          recordId: purchaseOrder.id,
          recordLabel: poNumber,
          userId: security.user.id,
          userName: security.user.name,
          details: `CSV import created purchase order ${poNumber} for supplier ${supplier.name} with ${groupRows.length} lines`,
        });

        imported += groupRows.length;
      });
    } catch (txError: any) {
      importErrors.push({
        row: 0,
        message: `Failed to import PO group for supplier ${supplierCode}: ${txError.message}`,
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
