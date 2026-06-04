import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  checkPeriodClose,
  maskForVatAuditor,
  maskFinancialArray,
  safeFinancialRound,
  safeFinancialAdd,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

/**
 * Strip HTML tags from a string to prevent XSS in text fields.
 */
function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '').trim();
}

// ============================================================
// SHARED: Compute current stock for a product at a specific godown
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
// SHARED: Auto-generate transferNo: TRN-XXXXX
// ============================================================

async function generateTransferNo(tx: any): Promise<string> {
  const allTransfers = await tx.stockTransfer.findMany({
    select: { transferNo: true },
  });

  let maxNum = 0;
  for (const t of allTransfers) {
    if (t.transferNo) {
      const match = t.transferNo.match(/TRN-(\d+)/);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
    }
  }
  return `TRN-${String(maxNum + 1).padStart(5, '0')}`;
}

// ============================================================
// SHARED: Sanitize CSV text fields
// ============================================================

function sanitizeCSVText(value: string): string {
  return value
    .replace(/[\r\n\t]/g, ' ')
    .replace(/<[^>]*>/g, '')
    .trim();
}

// ============================================================
// SHARED: VAT Auditor masking for transfer records
// ============================================================

function maskTransferForVatAuditor(
  transfer: Record<string, unknown>,
  role: string
): Record<string, unknown> {
  if (role !== 'vat_auditor') return transfer;

  let masked = maskForVatAuditor(transfer, role, ['totalCostValue']);

  // Mask nested lines
  if (Array.isArray(masked.lines)) {
    masked = {
      ...masked,
      lines: (masked.lines as Record<string, unknown>[]).map(line => {
        let maskedLine = maskForVatAuditor(line, role, ['costPrice', 'lineTotal']);
        // Mask nested product
        if (maskedLine.product && typeof maskedLine.product === 'object') {
          maskedLine = {
            ...maskedLine,
            product: maskForVatAuditor(
              maskedLine.product as Record<string, unknown>,
              role,
              ['costPrice', 'salePrice', 'wholesalePrice', 'dealerPrice']
            ),
          };
        }
        return maskedLine;
      }),
    };
  }

  return masked;
}

// ============================================================
// GET /api/transfers — Enhanced Secure Inter-Warehouse Transfer System
// Includes company isolation, status filter, shippingStatus filter, date filters
// Full relation data with VAT Auditor masking
// ============================================================

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'StockTransfers', 'GET');
  if (!security.authorized) return security.response;

  // Dealer: completely blocked from transfer records
  if (security.user.role === 'dealer') {
    return NextResponse.json(
      { error: 'Access denied. Dealers cannot access transfer records.' },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const shippingStatus = searchParams.get('shippingStatus');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    const where: Record<string, unknown> = { isActive: true };

    if (status) where.status = status;
    if (shippingStatus) where.shippingStatus = shippingStatus;

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

    const transfers = await db.stockTransfer.findMany({
      where,
      include: {
        fromGodown: true,
        toGodown: true,
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

    // Apply VAT Auditor masking
    const role = security.user.role;
    const maskedTransfers = transfers.map(transfer =>
      maskTransferForVatAuditor(transfer as Record<string, unknown>, role)
    );

    return NextResponse.json(maskedTransfers);
  } catch (error) {
    console.error('[Transfers] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transfers' },
      { status: 500 }
    );
  }
}

// ============================================================
// POST /api/transfers — Create Enhanced Secure Inter-Warehouse Transfer
// POST /api/transfers?import=true — CSV Import
// ============================================================

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'StockTransfers', 'POST');
  if (!security.authorized) return security.response;

  // Dealer: completely blocked from transfer records
  if (security.user.role === 'dealer') {
    return NextResponse.json(
      { error: 'Access denied. Dealers cannot access transfer records.' },
      { status: 403 }
    );
  }

  // SR: cannot create transfers
  if (security.user.role === 'sr') {
    return NextResponse.json(
      { error: 'Access denied. SRs cannot create or modify transfers.' },
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
    console.error('[Transfers] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to process transfer request' },
      { status: 500 }
    );
  }
}

// ============================================================
// Create Handler — Single atomic transfer creation
// ============================================================

async function handleCreate(
  request: NextRequest,
  security: { user: { id: string; email: string; name: string; role: string; companyId: string | null } }
): Promise<NextResponse> {
  const body = await request.json();
  const { fromGodownId, toGodownId, date, notes, lines, referenceKey } = body;

  // ── Validation ──
  if (!fromGodownId || !toGodownId || !date || !lines || lines.length === 0) {
    return NextResponse.json(
      { error: 'fromGodownId, toGodownId, date, and lines are required' },
      { status: 400 }
    );
  }

  // Validate fromGodownId !== toGodownId
  if (fromGodownId === toGodownId) {
    return NextResponse.json(
      { error: 'Source and destination godown cannot be the same' },
      { status: 400 }
    );
  }

  // Period-close lock check
  const periodLock = await checkPeriodClose(new Date(date));
  if (periodLock) return periodLock;

  // SUSPENDED godown check (both source and destination)
  const [fromGodown, toGodown] = await Promise.all([
    db.godown.findUnique({
      where: { id: fromGodownId },
      select: { id: true, name: true, status: true, isActive: true },
    }),
    db.godown.findUnique({
      where: { id: toGodownId },
      select: { id: true, name: true, status: true, isActive: true },
    }),
  ]);

  if (!fromGodown || !fromGodown.isActive) {
    return NextResponse.json({ error: 'Source warehouse not found or is inactive' }, { status: 400 });
  }
  if (!toGodown || !toGodown.isActive) {
    return NextResponse.json({ error: 'Destination warehouse not found or is inactive' }, { status: 400 });
  }
  if (fromGodown.status === 'SUSPENDED') {
    return NextResponse.json(
      { error: `EMERGENCY CLOSURE: Source warehouse "${fromGodown.name}" is SUSPENDED. All stock transfers from this location are blocked until reactivated.` },
      { status: 403 }
    );
  }
  if (toGodown.status === 'SUSPENDED') {
    return NextResponse.json(
      { error: `EMERGENCY CLOSURE: Destination warehouse "${toGodown.name}" is SUSPENDED. All stock transfers to this location are blocked until reactivated.` },
      { status: 403 }
    );
  }

  // Idempotency check via referenceKey
  if (referenceKey) {
    const existing = await db.stockTransfer.findFirst({
      where: { referenceKey },
    });
    if (existing) {
      return NextResponse.json(
        {
          error: 'Duplicate submission detected. This transfer has already been created.',
          referenceKey,
          existingId: existing.id,
        },
        { status: 409 }
      );
    }
  }

  // Process in atomic transaction
  const result = await db.$transaction(async (tx) => {
    // Auto-generate transferNo
    const transferNo = await generateTransferNo(tx);

    // Process each line: compute stock, costPrice, lineTotal
    const processedLines: Array<{
      productId: string;
      quantity: number;
      batchId: string | null;
      costPrice: number;
      lineTotal: number;
      availableStock: number;
      stockStatus: string;
    }> = [];

    let totalCostValue = 0;

    for (const line of lines) {
      if (!line.productId) {
        throw Object.assign(new Error('VALIDATION_ERROR'), {
          validationError: 'Each line must have a productId',
        });
      }

      // Validate product exists
      const product = await tx.product.findUnique({
        where: { id: line.productId },
        select: { id: true, costPrice: true, name: true, isActive: true },
      });
      if (!product || !product.isActive) {
        throw Object.assign(new Error('VALIDATION_ERROR'), {
          validationError: `Product with ID "${line.productId}" not found or inactive`,
        });
      }

      // Compute current stock at source godown
      const currentStock = await computeCurrentStock(tx, line.productId, fromGodownId);

      // Determine stock status
      let stockStatus: string;
      if (currentStock <= 0) {
        stockStatus = 'Insufficient';
      } else if (currentStock < line.quantity) {
        stockStatus = 'Partial';
      } else {
        stockStatus = 'Available';
      }

      // Validate quantity <= available stock
      if (currentStock < line.quantity) {
        const fmtBD = (v: number) =>
          new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
        throw Object.assign(new Error('INSUFFICIENT_STOCK'), {
          stockError: `Insufficient stock at source godown for "${product.name}". Available: ${fmtBD(currentStock)} units, Requested: ${fmtBD(line.quantity)} units.`,
        });
      }

      // Snapshot costPrice from Product.costPrice
      const costPrice = safeFinancialRound(product.costPrice);
      const lineTotal = safeFinancialRound(line.quantity * costPrice);

      processedLines.push({
        productId: line.productId,
        quantity: safeFinancialRound(line.quantity),
        batchId: line.batchId || null,
        costPrice,
        lineTotal,
        availableStock: currentStock,
        stockStatus,
      });

      totalCostValue = safeFinancialAdd(totalCostValue, lineTotal);
    }

    // Auto-calculate totalItems and totalQuantity
    const totalItems = processedLines.length;
    const totalQuantity = processedLines.reduce((sum, l) => sum + l.quantity, 0);

    // Create StockTransfer with lines
    const transfer = await tx.stockTransfer.create({
      data: {
        transferNo,
        fromGodownId,
        toGodownId,
        date: new Date(date),
        shippingStatus: 'Pending',
        status: 'Pending',
        totalItems,
        totalQuantity,
        totalCostValue,
        referenceKey: referenceKey || null,
        notes: notes ? stripHtml(String(notes)) : null,
        companyId: security.user.companyId || null,
        lines: {
          create: processedLines.map(l => ({
            productId: l.productId,
            quantity: l.quantity,
            batchId: l.batchId,
            costPrice: l.costPrice,
            lineTotal: l.lineTotal,
            availableStock: l.availableStock,
            stockStatus: l.stockStatus,
          })),
        },
      },
      include: {
        fromGodown: true,
        toGodown: true,
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

    // Stock Locking: Create StockEntry (type="OUT") from source godown for each line
    for (const line of processedLines) {
      await tx.stockEntry.create({
        data: {
          productId: line.productId,
          godownId: fromGodownId,
          type: 'OUT',
          quantity: line.quantity,
          reference: transferNo,
          referenceType: 'Transfer',
          date: new Date(date),
          batchId: line.batchId,
          costPrice: line.costPrice,
          notes: `Stock transfer OUT: ${transferNo}`,
          companyId: security.user.companyId || null,
        },
      });
    }

    // Audit log
    await tx.auditLog.create({
      data: {
        action: 'CREATE',
        module: 'StockTransfers',
        recordId: transfer.id,
        recordLabel: transferNo,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          transferNo,
          fromGodownId,
          toGodownId,
          totalItems,
          totalQuantity,
          totalCostValue,
          lineCount: processedLines.length,
        }),
      },
    });

    // Activity log inside transaction
    await logUserActivity({
      tx: tx,
      action: 'CREATE',
      module: 'Inv-Stock-Transfer',
      recordId: transfer.id,
      recordLabel: transferNo,
      userId: security.user.id,
      userName: security.user.name,
      details: `Created transfer ${transferNo}: ${totalItems} items, ${totalQuantity} units`,
    });

    return transfer;
  }).catch((error: any) => {
    // Re-throw validation errors
    if (error?.message === 'VALIDATION_ERROR') {
      return { _validationError: true, message: error.validationError };
    }
    if (error?.message === 'INSUFFICIENT_STOCK') {
      return { _stockError: true, message: error.stockError };
    }
    throw error;
  });

  // Handle validation failure
  if (result && typeof result === 'object' && '_validationError' in result) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  // Handle insufficient stock failure
  if (result && typeof result === 'object' && '_stockError' in result) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  // Apply VAT Auditor masking to response
  const maskedResult = maskTransferForVatAuditor(result as Record<string, unknown>, security.user.role);

  return NextResponse.json(maskedResult, { status: 201 });
}

// ============================================================
// CSV Import Handler
// Required headers: fromGodownCode, toGodownCode, date, productCode, quantity
// Optional: batchCode
// Groups by fromGodownCode+toGodownCode+date for separate transfer creation
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
    const body = await request.json();
    csvText = body.csvData || body.csv || '';
  }

  if (!csvText.trim()) {
    return NextResponse.json({ error: 'No CSV data provided' }, { status: 400 });
  }

  // Parse CSV
  const csvLines = csvText.trim().split('\n');
  if (csvLines.length < 2) {
    return NextResponse.json(
      { error: 'CSV must have a header row and at least one data row' },
      { status: 400 }
    );
  }

  const headers = csvLines[0].split(',').map(h => sanitizeCSVText(h.replace(/"/g, '')));
  const requiredHeaders = ['fromGodownCode', 'toGodownCode', 'date', 'productCode', 'quantity'];
  const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
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
    fromGodownCode: string;
    toGodownCode: string;
    date: string;
    productCode: string;
    quantity: number;
    batchCode: string;
  }

  const parsedRows: CsvRow[] = [];
  const errors: Array<{ row: number; message: string }> = [];

  for (let i = 1; i < csvLines.length; i++) {
    const row = csvLines[i].split(',').map(c => sanitizeCSVText(c.replace(/"/g, '')));
    const rowNum = i + 1;

    const fromGodownCode = row[headerIndex['fromGodownCode']] || '';
    const toGodownCode = row[headerIndex['toGodownCode']] || '';
    const date = row[headerIndex['date']] || '';
    const productCode = row[headerIndex['productCode']] || '';
    const quantityStr = row[headerIndex['quantity']] || '';
    const batchCode = headerIndex['batchCode'] !== undefined ? row[headerIndex['batchCode']] : '';

    if (!fromGodownCode) {
      errors.push({ row: rowNum, message: 'fromGodownCode is required' });
      continue;
    }
    if (!toGodownCode) {
      errors.push({ row: rowNum, message: 'toGodownCode is required' });
      continue;
    }
    if (fromGodownCode === toGodownCode) {
      errors.push({ row: rowNum, message: 'Source and destination godown cannot be the same' });
      continue;
    }
    if (!date || isNaN(Date.parse(date))) {
      errors.push({ row: rowNum, message: `Invalid date "${date}"` });
      continue;
    }
    if (!productCode) {
      errors.push({ row: rowNum, message: 'productCode is required' });
      continue;
    }
    const quantity = parseFloat(quantityStr);
    if (isNaN(quantity) || quantity <= 0) {
      errors.push({ row: rowNum, message: `Invalid quantity "${quantityStr}". Must be positive.` });
      continue;
    }

    parsedRows.push({
      fromGodownCode: sanitizeCSVText(fromGodownCode),
      toGodownCode: sanitizeCSVText(toGodownCode),
      date,
      productCode: sanitizeCSVText(productCode),
      quantity,
      batchCode: batchCode ? sanitizeCSVText(batchCode) : '',
    });
  }

  // Cross-reference godownCodes
  const fromGodownCodes = [...new Set(parsedRows.map(r => r.fromGodownCode))];
  const toGodownCodes = [...new Set(parsedRows.map(r => r.toGodownCode))];
  const allGodownCodes = [...new Set([...fromGodownCodes, ...toGodownCodes])];

  const existingGodowns = await db.godown.findMany({
    where: { code: { in: allGodownCodes } },
    select: { id: true, code: true, name: true, status: true, isActive: true },
  });
  const godownMap = new Map(existingGodowns.map(g => [g.code, g]));

  // Cross-reference productCodes
  const productCodes = [...new Set(parsedRows.map(r => r.productCode))];
  const existingProducts = await db.product.findMany({
    where: { productCode: { in: productCodes } },
    select: { id: true, productCode: true, name: true, costPrice: true, isActive: true },
  });
  const productMap = new Map(existingProducts.map(p => [p.productCode, p]));

  // Cross-reference batchCodes if provided
  const batchCodes = [...new Set(parsedRows.map(r => r.batchCode).filter(Boolean))];
  let batchMap = new Map<string, { id: string; batchCode: string; productId: string; quantityOnHand: number }>();
  if (batchCodes.length > 0) {
    const existingBatches = await db.batchMaster.findMany({
      where: { batchCode: { in: batchCodes }, isActive: true },
      select: { id: true, batchCode: true, productId: true, quantityOnHand: true },
    });
    batchMap = new Map(existingBatches.map(b => [b.batchCode, b]));
  }

  // Validate rows
  const validRows: Array<CsvRow & { rowNum: number; fromGodownId: string; toGodownId: string; productId: string; batchId: string | null }> = [];

  for (let i = 0; i < parsedRows.length; i++) {
    const row = parsedRows[i];
    const rowNum = i + 2;

    // Validate fromGodownCode
    const fromGodown = godownMap.get(row.fromGodownCode);
    if (!fromGodown || !fromGodown.isActive) {
      errors.push({ row: rowNum, message: `Source godown code "${row.fromGodownCode}" not found or inactive` });
      continue;
    }
    // REJECT transfers targeting SUSPENDED warehouses
    if (fromGodown.status === 'SUSPENDED') {
      errors.push({ row: rowNum, message: `Source warehouse "${fromGodown.name}" is SUSPENDED. Row rejected.` });
      continue;
    }

    // Validate toGodownCode
    const toGodown = godownMap.get(row.toGodownCode);
    if (!toGodown || !toGodown.isActive) {
      errors.push({ row: rowNum, message: `Destination godown code "${row.toGodownCode}" not found or inactive` });
      continue;
    }
    if (toGodown.status === 'SUSPENDED') {
      errors.push({ row: rowNum, message: `Destination warehouse "${toGodown.name}" is SUSPENDED. Row rejected.` });
      continue;
    }

    // Validate productCode
    const product = productMap.get(row.productCode);
    if (!product || !product.isActive) {
      errors.push({ row: rowNum, message: `Product code "${row.productCode}" not found or inactive` });
      continue;
    }

    // Validate batchCode if provided
    let batchId: string | null = null;
    if (row.batchCode) {
      const batch = batchMap.get(row.batchCode);
      if (!batch) {
        errors.push({ row: rowNum, message: `Batch code "${row.batchCode}" not found` });
        continue;
      }
      if (batch.productId !== product.id) {
        errors.push({ row: rowNum, message: `Batch "${row.batchCode}" does not belong to product "${row.productCode}"` });
        continue;
      }
      batchId = batch.id;
    }

    validRows.push({
      ...row,
      rowNum,
      fromGodownId: fromGodown.id,
      toGodownId: toGodown.id,
      productId: product.id,
      batchId,
    });
  }

  if (validRows.length === 0) {
    return NextResponse.json(
      { imported: 0, failed: errors.length, errors, message: 'No valid rows to import.' },
      { status: 400 }
    );
  }

  // Group by fromGodownCode+toGodownCode+date for separate transfer creation
  const transferGroups = new Map<string, typeof validRows>();
  for (const row of validRows) {
    const groupKey = `${row.fromGodownCode}|${row.toGodownCode}|${row.date}`;
    if (!transferGroups.has(groupKey)) {
      transferGroups.set(groupKey, []);
    }
    transferGroups.get(groupKey)!.push(row);
  }

  let imported = 0;
  const importErrors: Array<{ row: number; message: string }> = [];

  for (const [groupKey, groupRows] of transferGroups) {
    const [fromCode, toCode, dateStr] = groupKey.split('|');
    const fromGodown = godownMap.get(fromCode);
    const toGodown = godownMap.get(toCode);
    if (!fromGodown || !toGodown) continue;

    try {
      await db.$transaction(async (tx) => {
        // Period close check
        const periodLock = await checkPeriodClose(new Date(dateStr));
        if (periodLock) {
          throw new Error(`Period locked for date ${dateStr}`);
        }

        // Process each line
        const processedLines: Array<{
          productId: string;
          quantity: number;
          batchId: string | null;
          costPrice: number;
          lineTotal: number;
          availableStock: number;
          stockStatus: string;
        }> = [];

        let totalCostValue = 0;

        for (const row of groupRows) {
          const product = productMap.get(row.productCode);
          if (!product) continue;

          const currentStock = await computeCurrentStock(tx, row.productId, fromGodown.id);

          let stockStatus: string;
          if (currentStock <= 0) stockStatus = 'Insufficient';
          else if (currentStock < row.quantity) stockStatus = 'Partial';
          else stockStatus = 'Available';

          if (currentStock < row.quantity) {
            throw new Error(
              `Insufficient stock for product "${product.name}" at source godown. Available: ${currentStock}, Requested: ${row.quantity}`
            );
          }

          const costPrice = safeFinancialRound(product.costPrice);
          const lineTotal = safeFinancialRound(row.quantity * costPrice);

          processedLines.push({
            productId: row.productId,
            quantity: safeFinancialRound(row.quantity),
            batchId: row.batchId,
            costPrice,
            lineTotal,
            availableStock: currentStock,
            stockStatus,
          });

          totalCostValue = safeFinancialAdd(totalCostValue, lineTotal);
        }

        // Auto-generate transferNo
        const transferNo = await generateTransferNo(tx);

        const totalItems = processedLines.length;
        const totalQuantity = processedLines.reduce((sum, l) => sum + l.quantity, 0);

        // Create transfer
        const transfer = await tx.stockTransfer.create({
          data: {
            transferNo,
            fromGodownId: fromGodown.id,
            toGodownId: toGodown.id,
            date: new Date(dateStr),
            shippingStatus: 'Pending',
            status: 'Pending',
            totalItems,
            totalQuantity,
            totalCostValue,
            notes: `Imported from CSV. From: ${fromCode}, To: ${toCode}`,
            companyId: security.user.companyId || null,
            lines: {
              create: processedLines.map(l => ({
                productId: l.productId,
                quantity: l.quantity,
                batchId: l.batchId,
                costPrice: l.costPrice,
                lineTotal: l.lineTotal,
                availableStock: l.availableStock,
                stockStatus: l.stockStatus,
              })),
            },
          },
        });

        // Create StockEntry OUT from source godown
        for (const line of processedLines) {
          await tx.stockEntry.create({
            data: {
              productId: line.productId,
              godownId: fromGodown.id,
              type: 'OUT',
              quantity: line.quantity,
              reference: transferNo,
              referenceType: 'Transfer',
              date: new Date(dateStr),
              batchId: line.batchId,
              costPrice: line.costPrice,
              notes: `CSV Import transfer OUT: ${transferNo}`,
              companyId: security.user.companyId || null,
            },
          });
        }

        // Audit log
        await tx.auditLog.create({
          data: {
            action: 'IMPORT',
            module: 'StockTransfers',
            recordId: transfer.id,
            recordLabel: transferNo,
            userId: security.user.id,
            userName: security.user.name,
            details: JSON.stringify({
              transferNo,
              fromGodownCode: fromCode,
              toGodownCode: toCode,
              importedFrom: 'CSV',
              lineCount: groupRows.length,
              totalCostValue,
            }),
          },
        });

        // Activity log inside transaction
        await logUserActivity({
          tx: tx,
          action: 'IMPORT',
          module: 'Inv-Stock-Transfer',
          userId: security.user.id,
          userName: security.user.name,
          details: `CSV import transfer ${transferNo}: ${groupRows.length} lines, From: ${fromCode}, To: ${toCode}`,
        });

        imported += groupRows.length;
      });
    } catch (txError: any) {
      importErrors.push({
        row: 0,
        message: `Failed to import transfer group ${fromCode}→${toCode} on ${dateStr}: ${txError.message}`,
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
