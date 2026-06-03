import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  checkPeriodClose,
  maskForVatAuditorFinancial,
  safeFinancialRound,
  safeFinancialAdd,
  safeFinancialSubtract,
  maskFinancialArray,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';
import Papa from 'papaparse';

// ============================================================
// SHARED: Line-level Financial Computation for Purchase Return
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

  // COGS Reversal: quantity * costPrice
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
// SHARED: Auto-generate returnNo: PRT-XXXXX
// ============================================================

async function generateReturnNo(tx: any): Promise<string> {
  const allPRs = await tx.purchaseReturn.findMany({
    select: { returnNo: true },
  });

  let maxNum = 0;
  for (const pr of allPRs) {
    if (pr.returnNo) {
      const match = pr.returnNo.match(/PRT-(\d+)/);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
    }
  }
  return `PRT-${String(maxNum + 1).padStart(5, '0')}`;
}

// ============================================================
// SHARED: Auto-generate debitNoteCode: DN-XXXXX
// ============================================================

async function generateDebitNoteCode(tx: any): Promise<string> {
  // Collision-safe code generation (findMany + Math.max)
  const allPRs = await tx.purchaseReturn.findMany({ select: { debitNoteCode: true } });
  let maxNum = 0;
  for (const pr of allPRs) {
    const match = pr.debitNoteCode?.match(/DN-(\d+)/);
    if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
  }
  return `DN-${String(maxNum + 1).padStart(5, '0')}`;
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
// SHARED: AP Adjustment — reduce Supplier.currentBalance (Cr)
// Purchase return reduces AP liability: we owe supplier less
//   If currentBalanceType === 'Cr': reduce Cr (currentBalance - grandTotal)
//     if goes negative, flip to Dr
//   If currentBalanceType === 'Dr': if grandTotal > currentBalance, flip to Cr
//     with (grandTotal - currentBalance); else subtract
// After adjustment, check OverLimit toggle
// ============================================================

function applyApAdjustment(
  supplier: { currentBalance: number; currentBalanceType: string; creditLimit: number; creditStatus: string },
  grandTotal: number
): { currentBalance: number; currentBalanceType: string; creditStatus: string } {
  let newBalance = supplier.currentBalance;
  let newBalanceType = supplier.currentBalanceType;

  if (newBalanceType === 'Cr') {
    // Reduce Cr liability — we owe the supplier less
    newBalance = safeFinancialSubtract(newBalance, grandTotal);
    if (newBalance < 0) {
      newBalanceType = 'Dr';
      newBalance = Math.abs(newBalance);
    } else if (newBalance === 0) {
      newBalanceType = 'Cr'; // Normalize zero to Cr
    }
  } else {
    // Dr balance: supplier owes us
    if (grandTotal > newBalance) {
      newBalanceType = 'Cr';
      newBalance = safeFinancialSubtract(grandTotal, newBalance);
    } else {
      newBalance = safeFinancialSubtract(newBalance, grandTotal);
    }
    if (newBalance === 0) newBalanceType = 'Cr';
  }

  // Auto-toggle OverLimit
  let newCreditStatus = supplier.creditStatus;
  if (newBalanceType === 'Dr' && supplier.creditLimit > 0 && newBalance > supplier.creditLimit) {
    newCreditStatus = 'OverLimit';
  }

  return { currentBalance: newBalance, currentBalanceType: newBalanceType, creditStatus: newCreditStatus };
}

// ============================================================
// SHARED: Reverse AP Adjustment — add grandTotal back to Cr side
// ============================================================

function reverseApAdjustment(
  supplier: { currentBalance: number; currentBalanceType: string; creditLimit: number; creditStatus: string },
  grandTotal: number
): { currentBalance: number; currentBalanceType: string; creditStatus: string } {
  // Reverse = add grandTotal back to Cr side
  let newBalance = supplier.currentBalance;
  let newBalanceType = supplier.currentBalanceType;

  if (newBalanceType === 'Cr') {
    newBalance = safeFinancialAdd(newBalance, grandTotal);
  } else {
    // Dr
    if (grandTotal > newBalance) {
      newBalanceType = 'Cr';
      newBalance = safeFinancialSubtract(grandTotal, newBalance);
    } else {
      newBalance = safeFinancialSubtract(newBalance, grandTotal);
    }
    if (newBalance === 0) newBalanceType = 'Cr';
  }

  // Auto-toggle OverLimit → Active
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
// GET /api/purchase-returns — List all purchase returns with relations
// ============================================================

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'PurchaseReturns', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const supplierId = searchParams.get('supplierId');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const apPosted = searchParams.get('apPosted');

    const where: Record<string, unknown> = { isActive: true };

    if (status) where.status = status;
    if (supplierId) where.supplierId = supplierId;
    if (apPosted !== null && apPosted !== undefined && apPosted !== '') {
      where.apAdjustmentPosted = apPosted === 'true';
    }

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

    const purchaseReturns = await db.purchaseReturn.findMany({
      where,
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
      orderBy: { createdAt: 'desc' },
    });

    // Apply VAT Auditor masking for financial fields
    const maskedReturns = maskFinancialArray(
      purchaseReturns as unknown as Record<string, unknown>[],
      security.user.role as any,
      ['cogsReversal', 'costPrice', 'availableStock']
    );

    return NextResponse.json(maskedReturns);
  } catch (error) {
    console.error('[PurchaseReturns] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch purchase returns' },
      { status: 500 }
    );
  }
}

// ============================================================
// POST /api/purchase-returns — Create purchase return with full validation
// POST /api/purchase-returns?import=true — CSV Import
// ============================================================

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'PurchaseReturns', 'POST');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const isImport = searchParams.get('import') === 'true';

    if (isImport) {
      return handleCsvImport(request, security);
    }

    return handleCreate(request, security);
  } catch (error) {
    console.error('[PurchaseReturns] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to process purchase return request' },
      { status: 500 }
    );
  }
}

// ============================================================
// Create Handler — Single purchase return with COGS reversal,
// inventory realignment & AP adjustment
// ============================================================

async function handleCreate(
  request: NextRequest,
  security: { user: { id: string; email: string; name: string; role: string; companyId: string | null } }
): Promise<NextResponse> {
  const body = await request.json();
  const {
    purchaseOrderId,
    supplierId,
    godownId,
    date,
    discount,
    discountPercent,
    vatPercentage,
    reason,
    debitNoteCode,
    challanRef,
    lines,
    referenceKey,
  } = body;

  // ── Validation ──
  if (!purchaseOrderId) {
    return NextResponse.json(
      { error: 'purchaseOrderId is required' },
      { status: 400 }
    );
  }
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

  // Period close guard
  const periodLock = await checkPeriodClose(new Date(date));
  if (periodLock) return periodLock;

  // Idempotency check via referenceKey
  if (referenceKey) {
    const existing = await db.purchaseReturn.findFirst({
      where: { referenceKey },
    });
    if (existing) {
      return NextResponse.json(
        {
          error: 'Duplicate submission detected. This purchase return has already been created.',
          referenceKey,
          existingId: existing.id,
        },
        { status: 409 }
      );
    }
  }

  // Validate purchase order exists and is not Cancelled
  const purchaseOrder = await db.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    include: { lines: true, supplier: true },
  });
  if (!purchaseOrder) {
    return NextResponse.json(
      { error: 'Purchase order not found' },
      { status: 400 }
    );
  }
  if (purchaseOrder.status === 'Cancelled') {
    return NextResponse.json(
      { error: `Cannot create return against a Cancelled purchase order (${purchaseOrder.poNumber})` },
      { status: 400 }
    );
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

  // If creditStatus === 'Frozen', reject
  if (supplier.creditStatus === 'Frozen') {
    return NextResponse.json(
      { error: `Supplier "${supplier.name}" account is FROZEN. Cannot create purchase return for frozen accounts. Contact administration to unfreeze.` },
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
    // Process lines with COGS reversal calculation and inventory realignment
    const computedLines: ComputedPRLine[] = [];

    for (const line of lines) {
      if (!line.productId) {
        throw Object.assign(new Error('VALIDATION_ERROR'), {
          validationError: 'Each line must have a productId',
        });
      }

      // Find the original purchase order line for this product
      const purchaseOrderLine = await tx.purchaseOrderLine.findFirst({
        where: {
          purchaseOrderId,
          productId: line.productId,
        },
      });

      if (!purchaseOrderLine) {
        throw Object.assign(new Error('VALIDATION_ERROR'), {
          validationError: `Product not found in Purchase Order. Cannot return items that were not part of the original order.`,
        });
      }

      // ── Cumulative Return Validation ──
      const existingReturns = await tx.purchaseReturn.findMany({
        where: {
          purchaseOrderId,
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

      if (totalAlreadyReturned + requestedQty > purchaseOrderLine.quantity) {
        throw Object.assign(new Error('CUMULATIVE_EXCEEDED'), {
          validationError: `Cumulative return quantity (${fmtBD(totalAlreadyReturned + requestedQty)}) exceeds original order quantity (${fmtBD(purchaseOrderLine.quantity)}) for this product. Already returned: ${fmtBD(totalAlreadyReturned)}, Attempting: ${fmtBD(requestedQty)}`,
        });
      }

      // ── COGS Reversal Calculation ──
      const product = await tx.product.findUnique({
        where: { id: line.productId },
        select: { costPrice: true },
      });
      const costPrice = product?.costPrice || 0;

      // ── Inventory Realignment: Compute current available stock ──
      const currentStock = await computeCurrentStock(line.productId, godownId);

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

    // Compute order-level financials
    const subTotal = computedLines.reduce(
      (sum, l) => safeFinancialAdd(sum, l.total),
      0
    );
    const headerDiscountPercent = Number(discountPercent) || 0;
    const headerDiscountAmount = Number(discount) || 0;
    // Apply order-level discount: use percent if provided, else flat amount
    const effectiveDiscount = headerDiscountPercent > 0
      ? safeFinancialRound(subTotal * (headerDiscountPercent / 100))
      : headerDiscountAmount;
    const vatPct = Number(vatPercentage) || 0;
    const afterDiscount = safeFinancialSubtract(subTotal, effectiveDiscount);
    const vatAmount = safeFinancialRound(afterDiscount * (vatPct / 100));
    const grandTotal = safeFinancialAdd(afterDiscount, vatAmount);

    // Compute order-level COGS reversal
    const cogsReversalTotal = computedLines.reduce(
      (sum, l) => safeFinancialAdd(sum, l.cogsReversal),
      0
    );

    // Auto-generate returnNo
    const returnNo = await generateReturnNo(tx);

    // Auto-generate debitNoteCode
    const effectiveDebitNoteCode = debitNoteCode || await generateDebitNoteCode(tx);

    // Determine company ID
    const companyId = security.user.companyId || purchaseOrder.companyId || null;

    // Create purchase return with lines
    const purchaseReturn = await tx.purchaseReturn.create({
      data: {
        returnNo,
        purchaseOrderId,
        supplierId,
        godownId: godownId || null,
        date: new Date(date),
        subTotal,
        discount: effectiveDiscount,
        discountPercent: headerDiscountPercent,
        vatPercentage: vatPct,
        vatAmount,
        reason: reason || null,
        grandTotal,
        debitNoteCode: effectiveDebitNoteCode,
        challanRef: challanRef || null,
        status: 'Pending',
        cogsReversal: cogsReversalTotal,
        apAdjustmentPosted: true,
        stockRealignPosted: true,
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
            availableStock: cl.availableStock,
          })),
        },
      },
      include: {
        purchaseOrder: { include: { supplier: true } },
        supplier: true,
        godown: true,
        company: true,
        lines: { include: { product: { include: { category: true, brand: true } } } },
      },
    });

    // ── Inventory Realignment: Create StockEntry (type="OUT") for each line ──
    // Items are removed from inventory back to supplier
    for (const line of computedLines) {
      await tx.stockEntry.create({
        data: {
          productId: line.productId,
          godownId: godownId || null,
          type: 'OUT',
          quantity: line.quantity,
          reference: returnNo,
          referenceType: 'PurchaseReturn',
          date: new Date(date),
        },
      });
    }

    // ── AP Ledger Integration ──
    const freshSupplier = await tx.supplier.findUnique({
      where: { id: supplierId },
      select: {
        id: true,
        currentBalance: true,
        currentBalanceType: true,
        creditLimit: true,
        creditStatus: true,
      },
    });
    if (freshSupplier) {
      const apResult = applyApAdjustment(freshSupplier, grandTotal);
      await tx.supplier.update({
        where: { id: supplierId },
        data: {
          currentBalance: apResult.currentBalance,
          currentBalanceType: apResult.currentBalanceType,
          ...(apResult.creditStatus !== freshSupplier.creditStatus && {
            creditStatus: apResult.creditStatus,
          }),
        },
      });
    }

    // Audit log
    await tx.auditLog.create({
      data: {
        action: 'CREATE',
        module: 'PurchaseReturns',
        recordId: purchaseReturn.id,
        recordLabel: returnNo,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          returnNo,
          purchaseOrderId,
          supplierId,
          subTotal,
          discount: effectiveDiscount,
          discountPercent: headerDiscountPercent,
          vatPercentage: vatPct,
          vatAmount,
          grandTotal,
          cogsReversal: cogsReversalTotal,
          debitNoteCode: effectiveDebitNoteCode,
          apAdjustmentPosted: true,
          stockRealignPosted: true,
          lineCount: computedLines.length,
        }),
      },
    });

    // Activity log
    await logUserActivity({
          tx: tx,
      action: 'CREATE',
      module: 'Inv-Purchase-Return',
      recordId: purchaseReturn.id,
      recordLabel: returnNo,
      userId: security.user.id,
      userName: security.user.name,
      details: `Created purchase return ${returnNo} for supplier ${supplier.name} against PO ${purchaseOrder.poNumber} with ${computedLines.length} lines, grandTotal=${grandTotal}, cogsReversal=${cogsReversalTotal}`,
    });

    return purchaseReturn;
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
// Headers: supplierCode, date, productCode, quantity, rate,
//          discountPercent, vatAmount, godownCode, poNumber, reason
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

  const requiredHeaders = ['supplierCode', 'date', 'productCode', 'quantity', 'rate'];
  const headers = parseResult.meta.fields || [];
  const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));
  if (missingHeaders.length > 0) {
    return NextResponse.json(
      { error: `Missing required CSV headers: ${missingHeaders.join(', ')}` },
      { status: 400 }
    );
  }

  interface CsvRow {
    supplierCode: string;
    date: string;
    productCode: string;
    quantity: string;
    rate: string;
    discountPercent?: string;
    vatAmount?: string;
    godownCode?: string;
    poNumber?: string;
    reason?: string;
  }

  const parsedRows = parseResult.data as CsvRow[];
  const errors: Array<{ row: number; message: string }> = [];
  const fieldErrors: Array<{ row: number; field: string; message: string }> = [];

  // ── Input Sanitization: Negative Quantity Rejection ──
  const droppedNegativeRows: Array<{ row: number; quantity: number }> = [];
  const sanitizedRows: CsvRow[] = [];

  for (let i = 0; i < parsedRows.length; i++) {
    const row = parsedRows[i];
    const q = parseFloat(row.quantity || '0');
    if (q < 0) {
      droppedNegativeRows.push({ row: i + 2, quantity: q });
      errors.push({
        row: i + 2,
        message: `Negative quantity (${q}) rejected. Row dropped.`,
      });
      continue;
    }
    sanitizedRows.push(row);
  }

  // ── Cross-reference supplierCode against Supplier.supplierCode ──
  const supplierCodes = [...new Set(sanitizedRows.map((r) => r.supplierCode?.trim()).filter(Boolean))];
  const existingSuppliers = await db.supplier.findMany({
    where: { supplierCode: { in: supplierCodes } },
    select: { id: true, supplierCode: true, name: true, creditStatus: true, companyId: true },
  });
  const supplierMap = new Map(existingSuppliers.map((s) => [s.supplierCode, s]));

  // ── Cross-reference productCode against Product.productCode ──
  const productCodes = [...new Set(sanitizedRows.map((r) => r.productCode?.trim()).filter(Boolean))];
  const existingProducts = await db.product.findMany({
    where: { productCode: { in: productCodes } },
    select: { id: true, productCode: true, name: true, costPrice: true },
  });
  const productMap = new Map(existingProducts.map((p) => [p.productCode, p]));

  // ── Cross-reference godownCode against Godown.code ──
  const godownCodes = [...new Set(sanitizedRows.map((r) => r.godownCode?.trim()).filter(Boolean))];
  let godownMap = new Map<string, { id: string; code: string; name: string; status: string }>();
  if (godownCodes.length > 0) {
    const existingGodowns = await db.godown.findMany({
      where: { code: { in: godownCodes } },
      select: { id: true, code: true, name: true, status: true },
    });
    godownMap = new Map(existingGodowns.map((g) => [g.code, g]));
  }

  // ── Resolve poNumber to purchaseOrderId ──
  const poNumbers = [...new Set(sanitizedRows.map((r) => r.poNumber?.trim()).filter(Boolean))];
  let poMap = new Map<string, { id: string; poNumber: string; supplierId: string; status: string; companyId: string | null }>();
  if (poNumbers.length > 0) {
    const existingPOs = await db.purchaseOrder.findMany({
      where: { poNumber: { in: poNumbers } },
      select: { id: true, poNumber: true, supplierId: true, status: true, companyId: true },
    });
    poMap = new Map(existingPOs.map((po) => [po.poNumber, po]));
  }

  // Validate each row
  interface ValidRow {
    rowNum: number;
    purchaseOrderId: string | null;
    poNumber: string | null;
    supplierId: string;
    supplierCode: string;
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

  for (let i = 0; i < sanitizedRows.length; i++) {
    const row = sanitizedRows[i];
    const rowNum = i + 2; // +2: 1-indexed + header row

    const supplierCode = (row.supplierCode || '').trim();
    const dateVal = (row.date || '').trim();
    const productCode = (row.productCode || '').trim();
    const quantityStr = (row.quantity || '').trim();
    const rateStr = (row.rate || '').trim();
    const discountPercentStr = (row.discountPercent || '').trim();
    const vatAmountStr = (row.vatAmount || '').trim();
    const godownCode = (row.godownCode || '').trim();
    const poNumber = (row.poNumber || '').trim();
    const reasonVal = (row.reason || '').trim();

    // Validate supplierCode
    if (!supplierCode) {
      errors.push({ row: rowNum, message: 'supplierCode is required' });
      continue;
    }

    // ── Client Limit Validation: Check supplier exists and creditStatus is not Frozen ──
    const csvSupplier = supplierMap.get(supplierCode);
    if (!csvSupplier) {
      errors.push({
        row: rowNum,
        message: `Supplier code "${supplierCode}" does not exist. Row rejected.`,
      });
      continue;
    }
    if (csvSupplier.creditStatus === 'Frozen') {
      errors.push({
        row: rowNum,
        message: `Supplier "${csvSupplier.name}" (${supplierCode}) account is FROZEN. Cannot create purchase return for frozen accounts. Row rejected.`,
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

    // Resolve purchaseOrderId from poNumber
    let purchaseOrderId: string | null = null;
    if (poNumber) {
      const po = poMap.get(poNumber);
      if (!po) {
        errors.push({
          row: rowNum,
          message: `Purchase order with poNumber "${poNumber}" does not exist. Row rejected.`,
        });
        continue;
      }
      if (po.status === 'Cancelled') {
        errors.push({
          row: rowNum,
          message: `Purchase order "${poNumber}" is Cancelled. Cannot create return. Row rejected.`,
        });
        continue;
      }
      purchaseOrderId = po.id;
    }

    validRows.push({
      rowNum,
      purchaseOrderId,
      poNumber: poNumber || null,
      supplierId: csvSupplier.id,
      supplierCode,
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

  // Filter out rows that don't have a purchaseOrderId
  const resolvedRows = validRows.filter((r) => r.purchaseOrderId !== null);

  // ── Group valid rows by purchaseOrderId+date for separate return creation ──
  const returnGroups = new Map<string, typeof resolvedRows>();
  for (const row of resolvedRows) {
    const groupKey = `${row.purchaseOrderId}|${row.date}`;
    if (!returnGroups.has(groupKey)) {
      returnGroups.set(groupKey, []);
    }
    returnGroups.get(groupKey)!.push(row);
  }

  let imported = 0;
  const importErrors: Array<{ row: number; message: string }> = [];

  for (const [groupKey, groupRows] of returnGroups) {
    const [purchaseOrderIdStr, dateStr] = groupKey.split('|');

    try {
      await db.$transaction(async (tx) => {
        // Period close check
        const periodLock = await checkPeriodClose(new Date(dateStr));
        if (periodLock) {
          throw new Error(`Period locked for date ${dateStr}`);
        }

        // Fetch the purchase order with lines for COGS calculation
        const purchaseOrder = await tx.purchaseOrder.findUnique({
          where: { id: purchaseOrderIdStr },
          include: { lines: true, supplier: true },
        });
        if (!purchaseOrder) {
          throw new Error(`Purchase order ${purchaseOrderIdStr} not found`);
        }

        const supplierId = groupRows[0].supplierId;
        const godownId = groupRows[0].godownId;

        // Compute line financials with COGS reversal and inventory realignment
        const computedLines: ComputedPRLine[] = [];

        for (const row of groupRows) {
          // Find the original purchase order line for this product
          const purchaseOrderLine = purchaseOrder.lines.find(
            (l) => l.productId === row.productId
          );

          if (!purchaseOrderLine) {
            throw new Error(
              `Product code "${row.productCode}" not found in Purchase Order ${purchaseOrder.poNumber}. Row rejected.`
            );
          }

          // Cumulative return validation
          const existingReturns = await tx.purchaseReturn.findMany({
            where: {
              purchaseOrderId: purchaseOrderIdStr,
              isActive: true,
              status: { not: 'Rejected' },
            },
            include: { lines: { where: { productId: row.productId } } },
          });
          const totalAlreadyReturned = existingReturns.reduce(
            (sum, ret) => sum + ret.lines.reduce((lineSum, l) => lineSum + l.quantity, 0),
            0
          );

          if (totalAlreadyReturned + row.quantity > purchaseOrderLine.quantity) {
            throw new Error(
              `Cumulative return quantity exceeds original order quantity for product "${row.productCode}". Already returned: ${totalAlreadyReturned}, Attempting: ${row.quantity}`
            );
          }

          // COGS Reversal Calculation
          const product = await tx.product.findUnique({
            where: { id: row.productId },
            select: { costPrice: true },
          });
          const costPrice = product?.costPrice || 0;

          // Inventory realignment: compute current available stock
          const currentStock = await computeCurrentStock(row.productId, godownId);

          const computed = computePRLineFinancials(
            {
              productId: row.productId,
              quantity: row.quantity,
              rate: row.rate,
              discountPercent: row.discountPercent,
              vatAmount: row.vatAmount,
            },
            costPrice,
            currentStock
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

        // Auto-generate returnNo and debitNoteCode
        const returnNo = await generateReturnNo(tx);
        const debitNoteCode = await generateDebitNoteCode(tx);

        // Determine company ID
        const companyId = security.user.companyId || purchaseOrder.companyId || null;

        const purchaseReturn = await tx.purchaseReturn.create({
          data: {
            returnNo,
            purchaseOrderId: purchaseOrderIdStr,
            supplierId,
            godownId,
            date: new Date(dateStr),
            subTotal,
            discount: 0,
            discountPercent: 0,
            vatPercentage: 0,
            vatAmount,
            reason: groupRows[0].reason || `Imported from CSV. PO: ${purchaseOrder.poNumber}`,
            grandTotal,
            debitNoteCode,
            status: 'Pending',
            cogsReversal: cogsReversalTotal,
            apAdjustmentPosted: true,
            stockRealignPosted: true,
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
                availableStock: cl.availableStock,
              })),
            },
          },
        });

        // Create StockEntry (type="OUT") for each line — items removed from inventory
        for (const line of computedLines) {
          await tx.stockEntry.create({
            data: {
              productId: line.productId,
              godownId,
              type: 'OUT',
              quantity: line.quantity,
              reference: returnNo,
              referenceType: 'PurchaseReturn',
              date: new Date(dateStr),
            },
          });
        }

        // AP Adjustment
        const freshSupplier = await tx.supplier.findUnique({
          where: { id: supplierId },
          select: {
            id: true,
            currentBalance: true,
            currentBalanceType: true,
            creditLimit: true,
            creditStatus: true,
          },
        });
        if (freshSupplier) {
          const apResult = applyApAdjustment(freshSupplier, grandTotal);
          await tx.supplier.update({
            where: { id: supplierId },
            data: {
              currentBalance: apResult.currentBalance,
              currentBalanceType: apResult.currentBalanceType,
              ...(apResult.creditStatus !== freshSupplier.creditStatus && {
                creditStatus: apResult.creditStatus,
              }),
            },
          });
        }

        // Audit log
        await tx.auditLog.create({
          data: {
            action: 'IMPORT',
            module: 'PurchaseReturns',
            recordId: purchaseReturn.id,
            recordLabel: returnNo,
            userId: security.user.id,
            userName: security.user.name,
            details: JSON.stringify({
              returnNo,
              purchaseOrderId: purchaseOrderIdStr,
              supplierId,
              importedFrom: 'CSV',
              lineCount: groupRows.length,
              grandTotal,
              cogsReversal: cogsReversalTotal,
              debitNoteCode,
            }),
          },
        });

        // Activity log
        await logUserActivity({
          tx: tx,
          action: 'IMPORT',
          module: 'Inv-Purchase-Return',
          recordId: purchaseReturn.id,
          recordLabel: returnNo,
          userId: security.user.id,
          userName: security.user.name,
          details: `CSV import created purchase return ${returnNo} for supplier against PO ${purchaseOrder.poNumber} with ${groupRows.length} lines`,
        });

        imported += groupRows.length;
      });
    } catch (txError: any) {
      importErrors.push({
        row: 0,
        message: `Failed to import purchase return group for PO ${purchaseOrderIdStr}: ${txError.message}`,
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
