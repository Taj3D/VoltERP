import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  maskForVatAuditorFinancial,
  safeFinancialRound,
  safeFinancialAdd,
  safeFinancialSubtract,
  checkPeriodClose,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

/**
 * Strip HTML tags from a string to prevent XSS in text fields.
 */
function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '').trim();
}

// ============================================================
// SHARED: Stock Validation Engine
// ============================================================

async function validateStockAvailability(
  tx: any,
  lines: Array<{ productId: string; quantity: number }>,
  godownId?: string
) {
  const stockErrors: Array<{
    productId: string;
    productName: string;
    requested: number;
    available: number;
    deficit: number;
  }> = [];
  const stockSnapshots: Array<{
    productId: string;
    availableStock: number;
    stockStatus: string;
    allocatedQuantity: number;
  }> = [];

  for (const line of lines) {
    const product = await tx.product.findUnique({
      where: { id: line.productId },
    });
    if (!product) {
      stockErrors.push({
        productId: line.productId,
        productName: 'Unknown Product',
        requested: line.quantity,
        available: 0,
        deficit: line.quantity,
      });
      stockSnapshots.push({
        productId: line.productId,
        availableStock: 0,
        stockStatus: 'Insufficient',
        allocatedQuantity: 0,
      });
      continue;
    }

    const stockEntries = await tx.stockEntry.findMany({
      where: {
        productId: line.productId,
        ...(godownId ? { godownId } : {}),
      },
    });
    const currentStock =
      product.openingStock +
      stockEntries.reduce(
        (sum: number, e: any) =>
          sum + (e.type === 'IN' ? e.quantity : -e.quantity),
        0
      );

    if (line.quantity > currentStock) {
      stockErrors.push({
        productId: line.productId,
        productName: product.name,
        requested: line.quantity,
        available: currentStock,
        deficit: safeFinancialRound(line.quantity - currentStock),
      });
      stockSnapshots.push({
        productId: line.productId,
        availableStock: currentStock,
        stockStatus: currentStock > 0 ? 'Partial' : 'Insufficient',
        allocatedQuantity: Math.min(currentStock, line.quantity),
      });
    } else {
      stockSnapshots.push({
        productId: line.productId,
        availableStock: currentStock,
        stockStatus: 'Available',
        allocatedQuantity: line.quantity,
      });
    }
  }

  return { stockErrors, stockSnapshots };
}

// ============================================================
// Line-level Financial Computation
// ============================================================

interface LineInput {
  productId: string;
  quantity: number;
  rate: number;
  discountPercent?: number;
  notes?: string;
}

function computeLineFinancials(line: LineInput, stockSnapshot?: { availableStock: number; stockStatus: string; allocatedQuantity: number }) {
  const lineTotal = safeFinancialRound(line.quantity * line.rate);
  const discountPercent = line.discountPercent ?? 0;
  const discountAmount = safeFinancialRound(lineTotal * (discountPercent / 100));
  const afterDiscount = safeFinancialSubtract(lineTotal, discountAmount);
  // Line-level VAT not applied here (VAT applied at order level)
  const vatAmount = 0;

  return {
    productId: line.productId,
    quantity: line.quantity,
    rate: line.rate,
    discountPercent,
    discountAmount,
    vatAmount,
    total: afterDiscount,
    allocatedQuantity: stockSnapshot?.allocatedQuantity ?? 0,
    fulfilledQuantity: 0,
    availableStock: stockSnapshot?.availableStock ?? 0,
    stockStatus: stockSnapshot?.stockStatus ?? 'Available',
    notes: line.notes ? stripHtml(String(line.notes)) : null,
  };
}

// ============================================================
// Order-level Financial Computation
// ============================================================

function computeOrderFinancials(
  computedLines: ReturnType<typeof computeLineFinancials>[],
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
// Auto-generate sheetNo: OS-XXXXX
// ============================================================

async function generateSheetNo(tx: any): Promise<string> {
  const allSheets = await tx.orderSheet.findMany({
    select: { sheetNo: true },
  });

  let nextNum = 1;
  for (const s of allSheets) {
    const match = s.sheetNo?.match(/OS-(\d+)/);
    if (match) nextNum = Math.max(nextNum, parseInt(match[1], 10) + 1);
  }
  return `OS-${String(nextNum).padStart(5, '0')}`;
}

// ============================================================
// GET /api/order-sheets — List all order sheets with relations
// ============================================================

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'OrderSheets', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    const customerId = searchParams.get('customerId');
    const status = searchParams.get('status');
    const fulfillmentStatus = searchParams.get('fulfillmentStatus');
    const orderType = searchParams.get('orderType');
    const godownId = searchParams.get('godownId');

    const where: any = { isActive: true };
    if (companyId) where.companyId = companyId;
    if (customerId) where.customerId = customerId;
    if (status) where.status = status;
    if (fulfillmentStatus) where.fulfillmentStatus = fulfillmentStatus;
    if (orderType) where.orderType = orderType;
    if (godownId) where.godownId = godownId;

    // Multi-tenant isolation for non-admin
    if (security.user.companyId && security.user.role !== 'admin') {
      where.companyId = security.user.companyId;
    }

    const orderSheets = await db.orderSheet.findMany({
      where,
      include: {
        company: { select: { id: true, name: true, code: true } },
        customer: { select: { id: true, name: true, customerCode: true } },
        godown: { select: { id: true, name: true, code: true } },
        paymentOption: { select: { id: true, name: true } },
        lines: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                productCode: true,
                unit: true,
                salePrice: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Apply VAT Auditor masking for financial fields
    const maskedSheets = orderSheets.map((sheet) =>
      maskForVatAuditorFinancial(sheet as any, security.user.role)
    );

    return NextResponse.json(maskedSheets);
  } catch (error: any) {
    console.error('[OrderSheets] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch order sheets', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}

// ============================================================
// POST /api/order-sheets — Create order sheet with stock validation
// POST /api/order-sheets?import=true — CSV Import
// ============================================================

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'OrderSheets', 'POST');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const isImport = searchParams.get('import') === 'true';

    if (isImport) {
      return handleCsvImport(request, security);
    }

    return handleCreate(request, security);
  } catch (error) {
    console.error('[OrderSheets] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to process order sheet request' },
      { status: 500 }
    );
  }
}

// ============================================================
// Create Handler — Single order sheet with full stock validation
// ============================================================

async function handleCreate(
  request: NextRequest,
  security: any
): Promise<NextResponse> {
  const body = await request.json();
  const {
    orderType = 'Company',
    companyId,
    customerId,
    godownId,
    date,
    discountPercent = 0,
    vatPercentage = 0,
    paymentOptionId,
    notes,
    referenceKey,
    lines,
  } = body;

  // ── Validation ──
  if (!date) {
    return NextResponse.json(
      { error: 'Date is required' },
      { status: 400 }
    );
  }
  if (!lines || !Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json(
      { error: 'At least one line item is required' },
      { status: 400 }
    );
  }
  if (orderType === 'Company' && !companyId) {
    return NextResponse.json(
      { error: 'companyId is required when orderType is "Company"' },
      { status: 400 }
    );
  }
  if (orderType === 'Customer' && !customerId) {
    return NextResponse.json(
      { error: 'customerId is required when orderType is "Customer"' },
      { status: 400 }
    );
  }

  // Validate each line has a rate (required for financial calculations)
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].rate === undefined || lines[i].rate === null || isNaN(lines[i].rate)) {
      return NextResponse.json(
        { error: `Line item at index ${i} is missing a valid "rate" (unit price). All line items must have a rate.` },
        { status: 400 }
      );
    }
    if (lines[i].productId === undefined || lines[i].productId === null) {
      return NextResponse.json(
        { error: `Line item at index ${i} is missing a "productId".` },
        { status: 400 }
      );
    }
    if (!lines[i].quantity || lines[i].quantity <= 0) {
      return NextResponse.json(
        { error: `Line item at index ${i} has invalid quantity (must be > 0).` },
        { status: 400 }
      );
    }
  }

  // Period close guard
  const periodLock = await checkPeriodClose(new Date(date));
  if (periodLock) return periodLock;

  // Idempotency check via referenceKey
  if (referenceKey) {
    const existing = await db.orderSheet.findFirst({
      where: { referenceKey },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'Duplicate submission detected. This order has already been created.', referenceKey, existingId: existing.id },
        { status: 409 }
      );
    }
  }

  // ── Transaction: create with stock validation ──
  const result = await db.$transaction(async (tx) => {
    // Validate stock for all lines
    const { stockErrors, stockSnapshots } = await validateStockAvailability(
      tx,
      lines.map((l: LineInput) => ({ productId: l.productId, quantity: l.quantity })),
      godownId || undefined
    );

    // If ANY line has insufficient stock, abort with 409
    if (stockErrors.length > 0) {
      throw Object.assign(new Error('STOCK_INSUFFICIENT'), {
        stockErrors,
        stockSnapshots,
      });
    }

    // Compute line-level financials
    const snapshotMap = new Map(stockSnapshots.map((s) => [s.productId, s]));
    const computedLines = lines.map((line: LineInput) => {
      const snap = snapshotMap.get(line.productId);
      return computeLineFinancials(line, snap);
    });

    // Compute order-level financials
    const orderDiscountPercent = discountPercent ?? 0;
    const orderVatPercentage = vatPercentage ?? 0;
    const { subTotal, discount, vatAmount, grandTotal } = computeOrderFinancials(
      computedLines,
      orderDiscountPercent,
      orderVatPercentage
    );

    // Determine initial fulfillment status
    const allAvailable = computedLines.every(
      (l) => l.stockStatus === 'Available'
    );
    const anyPartial = computedLines.some(
      (l) => l.stockStatus === 'Partial'
    );
    const fulfillmentStatus = allAvailable
      ? 'Unfulfilled'
      : anyPartial
        ? 'Partial'
        : 'Unfulfilled';

    // Auto-generate sheetNo
    const sheetNo = await generateSheetNo(tx);

    const orderSheet = await tx.orderSheet.create({
      data: {
        sheetNo,
        orderType,
        companyId: orderType === 'Company' ? companyId : null,
        customerId: orderType === 'Customer' ? customerId : null,
        godownId: godownId || null,
        date: new Date(date),
        subTotal,
        discount,
        discountPercent: orderDiscountPercent,
        vatPercentage: orderVatPercentage,
        vatAmount,
        grandTotal,
        fulfillmentStatus,
        paymentOptionId: paymentOptionId || null,
        notes: notes ? stripHtml(String(notes)) : null,
        referenceKey: referenceKey || null,
        lines: {
          create: computedLines.map((cl) => ({
            productId: cl.productId,
            quantity: cl.quantity,
            allocatedQuantity: cl.allocatedQuantity,
            fulfilledQuantity: cl.fulfilledQuantity,
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
        company: true,
        customer: true,
        godown: true,
        paymentOption: true,
        lines: { include: { product: true } },
      },
    });

    // Audit log
    await tx.auditLog.create({
      data: {
        action: 'CREATE',
        module: 'OrderSheets',
        recordId: orderSheet.id,
        recordLabel: orderSheet.sheetNo,
        userId: security.user?.id || 'system',
        userName: security.user?.name || 'System',
        details: JSON.stringify({
          sheetNo,
          orderType,
          subTotal,
          discount,
          vatAmount,
          grandTotal,
          lineCount: lines.length,
          fulfillmentStatus,
        }),
      },
    });

    // Activity log
    await logUserActivity({
          tx: tx,
      action: 'CREATE',
      module: 'Inv-OrderSheet-Pipeline',
      recordId: orderSheet.id,
      recordLabel: orderSheet.sheetNo,
      userId: security.user?.id,
      userName: security.user?.name,
      details: `Created order sheet ${sheetNo} with ${lines.length} lines, grandTotal=${grandTotal}`,
    });

    return orderSheet;
  }).catch((error: any) => {
    // Re-throw stock errors as a special case
    if (error?.message === 'STOCK_INSUFFICIENT') {
      return { _stockError: true, stockErrors: error.stockErrors, stockSnapshots: error.stockSnapshots };
    }
    throw error;
  });

  // Handle stock validation failure
  if (result && typeof result === 'object' && '_stockError' in result) {
    return NextResponse.json(
      {
        error: 'Insufficient stock for one or more products',
        stockErrors: result.stockErrors,
        stockSnapshots: result.stockSnapshots,
      },
      { status: 409 }
    );
  }

  return NextResponse.json(result, { status: 201 });
}

// ============================================================
// CSV Import Handler
// ============================================================

async function handleCsvImport(
  request: NextRequest,
  security: any
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
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) {
    return NextResponse.json(
      { error: 'CSV must have a header row and at least one data row' },
      { status: 400 }
    );
  }

  const headers = lines[0].split(',').map((h) => h.trim().replace(/"/g, ''));
  const requiredHeaders = ['orderType', 'date', 'productId', 'quantity', 'rate'];
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
    orderType: string;
    companyId?: string;
    customerId?: string;
    date: string;
    productId: string;
    quantity: number;
    rate: number;
    discountPercent?: number;
  }

  const parsedRows: CsvRow[] = [];
  const errors: Array<{ row: number; message: string }> = [];
  const fieldErrors: Array<{ row: number; field: string; message: string }> = [];

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',').map((c) => c.trim().replace(/"/g, ''));
    const rowNum = i + 1; // 1-based row number for user readability

    const orderType = row[headerIndex['orderType']] || '';
    const date = row[headerIndex['date']] || '';
    const productId = row[headerIndex['productId']] || '';
    const quantityStr = row[headerIndex['quantity']] || '';
    const rateStr = row[headerIndex['rate']] || '';
    const companyId = headerIndex['companyId'] !== undefined ? row[headerIndex['companyId']] : '';
    const customerId = headerIndex['customerId'] !== undefined ? row[headerIndex['customerId']] : '';
    const discountPercentStr = headerIndex['discountPercent'] !== undefined ? row[headerIndex['discountPercent']] : '';

    // Validate orderType
    if (orderType !== 'Company' && orderType !== 'Customer') {
      fieldErrors.push({ row: rowNum, field: 'orderType', message: `Invalid orderType "${orderType}". Must be "Company" or "Customer".` });
      errors.push({ row: rowNum, message: `Invalid orderType "${orderType}"` });
      continue;
    }

    // Validate date
    if (!date || isNaN(Date.parse(date))) {
      fieldErrors.push({ row: rowNum, field: 'date', message: `Invalid date "${date}"` });
      errors.push({ row: rowNum, message: `Invalid date "${date}"` });
      continue;
    }

    // Validate productId
    if (!productId) {
      fieldErrors.push({ row: rowNum, field: 'productId', message: 'productId is required' });
      errors.push({ row: rowNum, message: 'Missing productId' });
      continue;
    }

    // Validate quantity
    const quantity = parseFloat(quantityStr);
    if (isNaN(quantity) || quantity <= 0) {
      fieldErrors.push({ row: rowNum, field: 'quantity', message: `Invalid quantity "${quantityStr}". Must be a positive number.` });
      errors.push({ row: rowNum, message: `Invalid quantity "${quantityStr}"` });
      continue;
    }

    // Validate rate
    const rate = parseFloat(rateStr);
    if (isNaN(rate) || rate < 0) {
      fieldErrors.push({ row: rowNum, field: 'rate', message: `Invalid rate "${rateStr}". Must be a non-negative number.` });
      errors.push({ row: rowNum, message: `Invalid rate "${rateStr}"` });
      continue;
    }

    const discountPercent = discountPercentStr ? parseFloat(discountPercentStr) : 0;
    if (discountPercentStr && (isNaN(discountPercent) || discountPercent < 0 || discountPercent > 100)) {
      fieldErrors.push({ row: rowNum, field: 'discountPercent', message: `Invalid discountPercent "${discountPercentStr}". Must be between 0 and 100.` });
      errors.push({ row: rowNum, message: `Invalid discountPercent "${discountPercentStr}"` });
      continue;
    }

    parsedRows.push({
      orderType,
      date,
      productId,
      quantity,
      rate,
      companyId: companyId || undefined,
      customerId: customerId || undefined,
      discountPercent,
    });
  }

  // ── Validate all productIds exist in database ──
  const productIds = [...new Set(parsedRows.map((r) => r.productId))];
  const existingProducts = await db.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true },
  });
  const existingProductIds = new Set(existingProducts.map((p) => p.id));

  // Filter rows with invalid product IDs
  const validRows: CsvRow[] = [];
  for (let i = 0; i < parsedRows.length; i++) {
    const row = parsedRows[i];
    const rowNum = i + 2; // +2 because: +1 for 0-index, +1 for header row
    if (!existingProductIds.has(row.productId)) {
      fieldErrors.push({
        row: rowNum,
        field: 'productId',
        message: `Product ID "${row.productId}" does not exist in the Product table. Row rejected.`,
      });
      errors.push({
        row: rowNum,
        message: `Product ID "${row.productId}" not found`,
      });
    } else {
      validRows.push(row);
    }
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

  // ── Group rows by orderType + companyId/customerId + date to create order sheets ──
  const orderGroups = new Map<string, CsvRow[]>();
  for (const row of validRows) {
    const groupKey = `${row.orderType}|${row.companyId || ''}|${row.customerId || ''}|${row.date}`;
    if (!orderGroups.has(groupKey)) {
      orderGroups.set(groupKey, []);
    }
    orderGroups.get(groupKey)!.push(row);
  }

  let imported = 0;
  const importErrors: Array<{ row: number; message: string }> = [];

  for (const [groupKey, groupRows] of orderGroups) {
    const [orderType, companyId, customerId, date] = groupKey.split('|');

    try {
      await db.$transaction(async (tx) => {
        // Period close check
        const periodLock = await checkPeriodClose(new Date(date));
        if (periodLock) {
          throw new Error(`Period locked for date ${date}`);
        }

        // Validate stock
        const { stockErrors: sErrors, stockSnapshots } =
          await validateStockAvailability(
            tx,
            groupRows.map((r) => ({ productId: r.productId, quantity: r.quantity })),
            undefined
          );

        // For CSV import, we don't abort on insufficient stock — we still create the order
        // but mark the lines with Partial/Insufficient status
        const snapshotMap = new Map(
          stockSnapshots.map((s) => [s.productId, s])
        );

        const computedLines = groupRows.map((row) => {
          const snap = snapshotMap.get(row.productId);
          return computeLineFinancials(
            {
              productId: row.productId,
              quantity: row.quantity,
              rate: row.rate,
              discountPercent: row.discountPercent,
            },
            snap
          );
        });

        const { subTotal, discount, vatAmount, grandTotal } =
          computeOrderFinancials(computedLines, 0, 0);

        const allAvailable = computedLines.every(
          (l) => l.stockStatus === 'Available'
        );
        const fulfillmentStatus = allAvailable ? 'Unfulfilled' : 'Partial';

        const sheetNo = await generateSheetNo(tx);

        const orderSheet = await tx.orderSheet.create({
          data: {
            sheetNo,
            orderType,
            companyId: orderType === 'Company' ? companyId || null : null,
            customerId:
              orderType === 'Customer' ? customerId || null : null,
            date: new Date(date),
            subTotal,
            discount,
            discountPercent: 0,
            vatPercentage: 0,
            vatAmount,
            grandTotal,
            fulfillmentStatus,
            lines: {
              create: computedLines.map((cl) => ({
                productId: cl.productId,
                quantity: cl.quantity,
                allocatedQuantity: cl.allocatedQuantity,
                fulfilledQuantity: cl.fulfilledQuantity,
                rate: cl.rate,
                discountPercent: cl.discountPercent,
                discountAmount: cl.discountAmount,
                vatAmount: cl.vatAmount,
                total: cl.total,
                availableStock: cl.availableStock,
                stockStatus: cl.stockStatus,
              })),
            },
          },
        });

        await tx.auditLog.create({
          data: {
            action: 'IMPORT',
            module: 'OrderSheets',
            recordId: orderSheet.id,
            recordLabel: orderSheet.sheetNo,
            userId: security.user?.id || 'system',
            userName: security.user?.name || 'System',
            details: JSON.stringify({
              sheetNo,
              orderType,
              importedFrom: 'CSV',
              lineCount: groupRows.length,
              grandTotal,
            }),
          },
        });

        await logUserActivity({
          tx: tx,
          action: 'IMPORT',
          module: 'Inv-OrderSheet-Pipeline',
          recordId: orderSheet.id,
          recordLabel: orderSheet.sheetNo,
          userId: security.user?.id,
          userName: security.user?.name,
          details: `CSV import created order sheet ${sheetNo} with ${groupRows.length} lines`,
        });

        imported += groupRows.length;
      });
    } catch (txError: any) {
      importErrors.push({
        row: 0,
        message: `Failed to import group ${groupKey}: ${txError.message}`,
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
