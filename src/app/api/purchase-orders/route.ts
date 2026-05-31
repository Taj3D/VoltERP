import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity, checkPeriodClose, maskForVatAuditor, safeFinancialRound } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';
import { dispatchAutoSms, buildStockReceiveSms } from '@/lib/sms-auto-trigger';

// ─────────────────────────────────────────────────────────────
// Helper: Strict numeric validation for PO line items
// Returns error message string or null if valid
// ─────────────────────────────────────────────────────────────
function validateLineItemNumeric(line: Record<string, unknown>, index: number): string | null {
  // quantity must be a positive number (> 0)
  const qty = line.quantity;
  if (qty === undefined || qty === null || Number.isNaN(Number(qty)) || Number(qty) <= 0) {
    return `Invalid line item ${index + 1}: quantity must be a positive number (received: ${qty})`;
  }
  // rate (Unit Cost Price) must be a positive number (> 0)
  const rate = line.rate;
  if (rate === undefined || rate === null || Number.isNaN(Number(rate)) || Number(rate) <= 0) {
    return `Invalid line item ${index + 1}: rate must be a positive number (received: ${rate})`;
  }
  // taxRate must be >= 0
  const taxRate = line.taxRate;
  if (taxRate !== undefined && taxRate !== null) {
    if (Number.isNaN(Number(taxRate)) || Number(taxRate) < 0) {
      return `Invalid line item ${index + 1}: taxRate must be zero or a positive number (received: ${taxRate})`;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// Helper: Find or create CoA account under a classification
// ─────────────────────────────────────────────────────────────
async function findOrCreateCoaAccount(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  classification: string,
  accountName: string,
  companyId: string | null
): Promise<string> {
  // Try to find existing account
  const existing = await tx.chartOfAccount.findFirst({
    where: {
      name: accountName,
      classification,
      ...(companyId ? { companyId } : {}),
      isActive: true,
    },
  });
  if (existing) return existing.id;

  // Find parent under classification
  let parentId: string | undefined;
  const parent = await tx.chartOfAccount.findFirst({
    where: {
      classification,
      ...(companyId ? { companyId } : {}),
      isActive: true,
      parentAccountId: null,
    },
  });
  if (parent) {
    parentId = parent.id;
  }

  // Auto-generate COA code
  const lastCoa = await tx.chartOfAccount.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { code: true },
  });
  let nextCoaNum = 1;
  if (lastCoa?.code) {
    const match = lastCoa.code.match(/COA-(\d+)/);
    if (match) nextCoaNum = parseInt(match[1], 10) + 1;
  }
  const coaCode = `COA-${String(nextCoaNum).padStart(5, '0')}`;

  const newAccount = await tx.chartOfAccount.create({
    data: {
      code: coaCode,
      name: accountName,
      classification,
      parentAccountId: parentId || null,
      openingBalance: 0,
      openingBalanceType: classification === 'Asset' ? 'Dr' : 'Cr',
      ...(companyId ? { companyId } : {}),
    },
  });
  return newAccount.id;
}

// ─────────────────────────────────────────────────────────────
// Helper: Process PO receipt — stock, batch, stock-entry, ledger
// Called inside $transaction for both POST (status=Received) and PUT (status→Received)
// Returns SMS dispatch params for fire-and-forget after commit
// ─────────────────────────────────────────────────────────────
interface ProcessedLine {
  productId: string;
  quantity: number;
  rate: number;
  taxRate: number;
  discountPercent: number;
  discountAmount: number;
  vatAmount: number;
  total: number;
  batchNumber: string | null;
  expiryDate: string | null;
}

interface SmsDispatchParams {
  itemSummary: string;
  godownName: string;
  poNumber: string;
  supplierPhone: string;
  companyId: string | null;
  userId: string;
  userName: string;
  supplierId: string;
}

async function processPoReceiptWithinTransaction(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  params: {
    purchaseOrderId: string;
    poNumber: string;
    godownId: string | null;
    supplierId: string;
    date: string;
    grandTotal: number;
    processedLines: ProcessedLine[];
    companyId: string | null;
    userId: string;
    userName: string;
  }
): Promise<SmsDispatchParams> {
  const { purchaseOrderId, poNumber, godownId, supplierId, date, grandTotal, processedLines, companyId, userId, userName } = params;

  // Fetch supplier info for ledger and SMS
  const supplier = await tx.supplier.findUnique({
    where: { id: supplierId },
    select: { id: true, name: true, phone: true, coaAccountId: true },
  });
  const supplierName = supplier?.name || 'Unknown Supplier';
  const supplierPhone = supplier?.phone || '';
  const supplierCoaId = supplier?.coaAccountId || null;

  // Fetch godown name for SMS
  let godownName = 'Main Warehouse';
  if (godownId) {
    const godown = await tx.godown.findUnique({
      where: { id: godownId },
      select: { name: true },
    });
    godownName = godown?.name || 'Main Warehouse';
  }

  // (b) For each line, update/create ProductStock record
  for (const line of processedLines) {
    if (!godownId) continue; // Cannot update stock without a godown
    await tx.productStock.upsert({
      where: { productId_godownId: { productId: line.productId, godownId } },
      create: {
        productId: line.productId,
        godownId,
        quantity: line.quantity,
        costPrice: line.rate,
        totalValue: safeFinancialRound(line.quantity * line.rate),
        alertLevel: 0,
        ...(companyId ? { companyId } : {}),
      },
      update: {
        quantity: { increment: line.quantity },
        totalValue: { increment: safeFinancialRound(line.quantity * line.rate) },
      },
    });
  }

  // (c) For each line with batchNumber, create BatchMaster record
  const batchIds: Record<string, string> = {};
  for (const line of processedLines) {
    if (line.batchNumber && godownId) {
      const batch = await tx.batchMaster.create({
        data: {
          batchNumber: line.batchNumber,
          productId: line.productId,
          godownId,
          quantity: line.quantity,
          costPrice: line.rate,
          totalCost: safeFinancialRound(line.quantity * line.rate),
          salePrice: 0,
          expiryDate: line.expiryDate ? new Date(line.expiryDate) : null,
          supplierId,
          purchaseOrderId,
          status: 'Active',
          ...(companyId ? { companyId } : {}),
        },
      });
      batchIds[line.productId] = batch.id;
    }
  }

  // (d) Create StockEntry for each line (type="IN", with costPrice and totalCost)
  for (const line of processedLines) {
    const batchId = batchIds[line.productId] || null;
    await tx.stockEntry.create({
      data: {
        productId: line.productId,
        godownId: godownId || null,
        batchId,
        type: 'IN',
        quantity: line.quantity,
        costPrice: line.rate,
        totalCost: safeFinancialRound(line.quantity * line.rate),
        reference: poNumber,
        referenceType: 'PurchaseOrder',
        ...(companyId ? { companyId } : {}),
        date: new Date(date),
      },
    });
  }

  // (e) Double-Entry Ledger Auto-Post
  const inventoryAssetCoaId = await findOrCreateCoaAccount(tx, 'Asset', 'Inventory Asset', companyId);

  let accountsPayableCoaId: string;
  if (supplierCoaId) {
    accountsPayableCoaId = supplierCoaId;
  } else {
    accountsPayableCoaId = await findOrCreateCoaAccount(tx, 'Liability', 'Accounts Payable', companyId);
  }

  // Auto-generate ledger entry codes
  const lastLedgerEntry = await tx.ledgerEntry.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { entryCode: true },
  });
  let nextLedgerNum = 1;
  if (lastLedgerEntry?.entryCode) {
    const match = lastLedgerEntry.entryCode.match(/LED-(\d+)/);
    if (match) nextLedgerNum = parseInt(match[1], 10) + 1;
  }
  const ledgerCode1 = `LED-${String(nextLedgerNum).padStart(5, '0')}`;
  const ledgerCode2 = `LED-${String(nextLedgerNum + 1).padStart(5, '0')}`;

  // Debit: Inventory Asset
  const debitEntry = await tx.ledgerEntry.create({
    data: {
      entryCode: ledgerCode1,
      date: new Date(date),
      accountId: inventoryAssetCoaId,
      account: 'Inventory Asset',
      particulars: `PO ${poNumber} - Stock Receipt`,
      debit: grandTotal,
      credit: 0,
      reference: poNumber,
      referenceType: 'PurchaseOrder',
      ...(companyId ? { companyId } : {}),
    },
  });

  // Credit: Accounts Payable
  const creditEntry = await tx.ledgerEntry.create({
    data: {
      entryCode: ledgerCode2,
      date: new Date(date),
      accountId: accountsPayableCoaId,
      account: 'Accounts Payable',
      particulars: `PO ${poNumber} - Supplier ${supplierName}`,
      debit: 0,
      credit: grandTotal,
      reference: poNumber,
      referenceType: 'PurchaseOrder',
      ...(companyId ? { companyId } : {}),
    },
  });

  // Create LedgerAutoPost record
  const lastLap = await tx.ledgerAutoPost.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { code: true },
  });
  let nextLapNum = 1;
  if (lastLap?.code) {
    const match = lastLap.code.match(/LAP-(\d+)/);
    if (match) nextLapNum = parseInt(match[1], 10) + 1;
  }
  const lapCode = `LAP-${String(nextLapNum).padStart(5, '0')}`;

  await tx.ledgerAutoPost.create({
    data: {
      code: lapCode,
      sourceType: 'PurchaseOrder',
      sourceId: purchaseOrderId,
      sourceCode: poNumber,
      debitEntryId: debitEntry.id,
      creditEntryId: creditEntry.id,
      debitAccount: 'Inventory Asset',
      creditAccount: 'Accounts Payable',
      amount: grandTotal,
      postingDate: new Date(date),
      status: 'Posted',
      ...(companyId ? { companyId } : {}),
    },
  });

  // (f) Update Product.lastSupplierId to the current supplierId
  for (const line of processedLines) {
    await tx.product.update({
      where: { id: line.productId },
      data: { lastSupplierId: supplierId },
    });
  }

  // (4) Activity Logger with "Inv-Orders-Core" token
  await logUserActivity({
    action: 'CREATE',
    module: 'Inv-Orders-Core',
    recordId: purchaseOrderId,
    recordLabel: poNumber,
    userId,
    userName,
    details: JSON.stringify({
      type: 'PurchaseOrder',
      supplierId,
      grandTotal,
      lineCount: processedLines.length,
      status: 'Received',
    }),
  });

  // Return SMS params for dispatch after transaction commits
  const itemSummary = processedLines
    .map(() => '')
    .join(', '); // placeholder — will be replaced with product names from result
  return {
    itemSummary,
    godownName,
    poNumber,
    supplierPhone,
    companyId,
    userId,
    userName,
    supplierId,
  };
}

// GET /api/purchase-orders - List all purchase orders with relations
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'PurchaseOrders', 'GET');
  if (!security.authorized) return security.response;

  // Dealer: completely blocked from purchase order records
  if (security.user?.role === 'dealer') {
    return NextResponse.json({ error: 'Access denied. Dealers cannot access purchase order records.' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const supplierId = searchParams.get('supplierId');
    const isAutoGenerated = searchParams.get('isAutoGenerated');
    const companyId = security.user.companyId;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (supplierId) where.supplierId = supplierId;
    if (isAutoGenerated !== null && isAutoGenerated !== undefined && isAutoGenerated !== '') {
      where.isAutoGenerated = isAutoGenerated === 'true';
    }
    // Multi-tenant isolation
    if (companyId) {
      where.companyId = companyId;
    }
    where.isActive = true;

    const purchaseOrders = await db.purchaseOrder.findMany({
      where,
      include: {
        supplier: true,
        godown: true,
        lines: {
          include: {
            product: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Add supplierName and godownName fields in response (join names)
    const enrichedOrders = purchaseOrders.map((order: Record<string, unknown>) => ({
      ...order,
      supplierName: (order.supplier as Record<string, unknown>)?.name || null,
      godownName: (order.godown as Record<string, unknown>)?.name || null,
    }));

    // VAT Auditor masking
    const maskedOrders = security.user.role === 'vat_auditor'
      ? enrichedOrders.map((order: Record<string, unknown>) => ({
          ...maskForVatAuditor(order, security.user.role as any, ['subTotal', 'discount', 'vatAmount', 'grandTotal']),
          lines: (order.lines as Record<string, unknown>[])?.map((line: Record<string, unknown>) =>
            maskForVatAuditor(line, security.user.role as any, ['rate', 'discountPercent', 'discountAmount', 'vatAmount', 'total'])
          ),
        }))
      : enrichedOrders;

    return NextResponse.json(maskedOrders);
  } catch (error) {
    console.error('Error fetching purchase orders:', error);
    return NextResponse.json(
      { error: 'Failed to fetch purchase orders' },
      { status: 500 }
    );
  }
}

// POST /api/purchase-orders - Create purchase order with lines
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'PurchaseOrders', 'POST');
  if (!security.authorized) return security.response;

  // Dealer: completely blocked from purchase order records
  if (security.user?.role === 'dealer') {
    return NextResponse.json({ error: 'Access denied. Dealers cannot access purchase order records.' }, { status: 403 });
  }

  // SR: cannot create purchase orders
  if (security.user?.role === 'sr') {
    return NextResponse.json({ error: 'Access denied. SRs cannot create purchase orders.' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { supplierId, date, godownId, notes, discount, vatPercentage, lines } = body;
    const companyId = security.user.companyId;

    if (!supplierId || !date || !lines || lines.length === 0) {
      return NextResponse.json(
        { error: 'supplierId, date, and lines are required' },
        { status: 400 }
      );
    }

    // ── Godown Status Validation (SUSPENDED = 403 Forbidden) ──
    if (godownId) {
      const godown = await db.godown.findUnique({
        where: { id: godownId },
        select: { name: true, status: true },
      });
      if (godown && godown.status === 'SUSPENDED') {
        return NextResponse.json(
          { error: `Purchase Order blocked: Target godown '${godown.name}' is SUSPENDED. All stock operations are prohibited for this location.` },
          { status: 403 }
        );
      }
    }

    // ── Strict Numeric Validation (400 Bad Request) ──
    for (let i = 0; i < lines.length; i++) {
      const validationError = validateLineItemNumeric(lines[i], i);
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
      }
    }

    // Period-close lock check
    const periodLock = await checkPeriodClose(new Date(date));
    if (periodLock) return periodLock;

    // Calculate line-level totals server-side to prevent floating-point drift
    const processedLines: ProcessedLine[] = lines.map((line: Record<string, unknown>) => {
      const lineQty = Number(line.quantity);
      const lineRate = Number(line.rate);
      const lineTaxRate = line.taxRate !== undefined && line.taxRate !== null ? Number(line.taxRate) : 0;
      const lineDiscPct = Number(line.discountPercent) || 0;
      const lineDiscAmt = Number(line.discountAmount) || safeFinancialRound(lineQty * lineRate * (lineDiscPct / 100));
      const lineGross = safeFinancialRound(lineQty * lineRate);
      const afterLineDisc = safeFinancialRound(lineGross - lineDiscAmt);
      const lineTaxAmt = safeFinancialRound(afterLineDisc * (lineTaxRate / 100));
      const lineVatAmt = Number(line.vatAmount) || lineTaxAmt;
      const lineTotal = safeFinancialRound(afterLineDisc + lineVatAmt);
      return {
        productId: line.productId as string,
        quantity: lineQty,
        rate: lineRate,
        taxRate: lineTaxRate,
        discountPercent: lineDiscPct,
        discountAmount: lineDiscAmt,
        vatAmount: lineVatAmt,
        total: lineTotal,
        batchNumber: (line.batchNumber as string) || null,
        expiryDate: (line.expiryDate as string) || null,
      };
    });

    const subTotal = safeFinancialRound(processedLines.reduce((sum, l) => sum + l.total, 0));
    const totalDiscount = discount || 0;
    const vatPct = vatPercentage || 0;
    const afterDiscount = safeFinancialRound(subTotal - totalDiscount);
    const vatAmount = safeFinancialRound(afterDiscount * (vatPct / 100));
    const grandTotal = safeFinancialRound(afterDiscount + vatAmount);

    // Auto-generate poNumber with 5-digit padding: PUR-XXXXX
    const lastPO = await db.purchaseOrder.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { poNumber: true },
    });

    let nextNum = 1;
    if (lastPO?.poNumber) {
      const match = lastPO.poNumber.match(/PUR-(\d+)/);
      if (match) {
        nextNum = parseInt(match[1], 10) + 1;
      }
    }
    const poNumber = `PUR-${String(nextNum).padStart(5, '0')}`;
    const poStatus = body.status || 'Draft';

    const result = await db.$transaction(async (tx) => {
      // (a) Create the PurchaseOrder with lines
      const purchaseOrder = await tx.purchaseOrder.create({
        data: {
          poNumber,
          supplierId,
          date: new Date(date),
          godownId: godownId || null,
          subTotal,
          discount: totalDiscount,
          vatPercentage: vatPct,
          vatAmount,
          grandTotal,
          notes: notes || null,
          status: poStatus,
          isAutoGenerated: body.isAutoGenerated || false,
          ...(companyId ? { companyId } : {}),
          lines: {
            create: processedLines.map((line) => ({
              productId: line.productId,
              quantity: line.quantity,
              rate: line.rate,
              taxRate: line.taxRate,
              discountPercent: line.discountPercent,
              discountAmount: line.discountAmount,
              vatAmount: line.vatAmount,
              total: line.total,
              batchNumber: line.batchNumber,
              expiryDate: line.expiryDate ? new Date(line.expiryDate) : null,
            })),
          },
        },
        include: {
          supplier: true,
          godown: true,
          lines: { include: { product: true } },
        },
      });

      // When status is "Received", execute the full double-entry bookkeeping
      let smsParams: SmsDispatchParams | null = null;
      if (poStatus === 'Received') {
        smsParams = await processPoReceiptWithinTransaction(tx, {
          purchaseOrderId: purchaseOrder.id,
          poNumber,
          godownId: godownId || null,
          supplierId,
          date,
          grandTotal,
          processedLines,
          companyId,
          userId: security.user.id,
          userName: security.user.name,
        });
      } else {
        // Activity logging for non-Received POs
        await logUserActivity({
          action: 'CREATE',
          module: 'Inv-Orders-Core',
          recordId: purchaseOrder.id,
          recordLabel: poNumber,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            type: 'PurchaseOrder',
            supplierId,
            grandTotal,
            lineCount: processedLines.length,
            isAutoGenerated: body.isAutoGenerated || false,
          }),
        });
      }

      return { purchaseOrder, smsParams };
    });

    // ── Auto-SMS: Stock Receive trigger (fire-and-forget, only on Received status) ──
    if (poStatus === 'Received' && result.smsParams) {
      const smsParams = result.smsParams;
      // Build item summary from result with product names
      const productNames = result.purchaseOrder.lines?.map((l: Record<string, unknown>) => (l.product as Record<string, unknown>)?.name).filter(Boolean).join(', ').substring(0, 50) || '';
      const smsMessage = buildStockReceiveSms({
        itemSummary: productNames,
        godownName: smsParams.godownName,
        poNo: smsParams.poNumber,
      });
      void dispatchAutoSms({
        triggerType: 'stock_receive',
        recipient: smsParams.supplierPhone,
        message: smsMessage,
        companyId: smsParams.companyId,
        userId: smsParams.userId,
        userName: smsParams.userName,
        referenceData: { poNumber: smsParams.poNumber, godownName: smsParams.godownName, supplierId: smsParams.supplierId },
      }).catch(() => {});
    }

    return NextResponse.json(result.purchaseOrder, { status: 201 });
  } catch (error) {
    console.error('Error creating purchase order:', error);
    return NextResponse.json(
      { error: 'Failed to create purchase order' },
      { status: 500 }
    );
  }
}
