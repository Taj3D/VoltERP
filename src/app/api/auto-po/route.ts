import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity, checkPeriodClose, safeFinancialRound } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// ============================================================
// TYPES
// ============================================================

interface AutoPOItem {
  productId: string;
  productCode: string;
  productName: string;
  category: string;
  brand: string;
  godown: string;
  supplierId: string | null;
  supplierName: string | null;
  currentStock: number;
  reorderLevel: number;
  avgDailySales: number;
  leadTimeDays: number;
  safetyStock: number;
  suggestedQuantity: number;
  costPrice: number | string;
  estimatedCost: number | string;
  urgency: 'critical' | 'low' | 'normal';
}

interface AutoPOSummary {
  totalItemsBelowReorder: number;
  totalEstimatedCost: number | string;
  criticalCount: number;
  lowCount: number;
  normalCount: number;
  supplierCount: number;
}

interface AutoPOGroup {
  supplierId: string;
  supplierName: string;
  items: AutoPOItem[];
  totalEstimatedCost: number | string;
  itemCount: number;
}

// ============================================================
// CONSTANTS
// ============================================================

const DEFAULT_LEAD_TIME_DAYS = 14;
const DAYS_FOR_AVG = 90;

// ============================================================
// HELPER: Compute urgency classification
// ============================================================

function computeUrgency(currentStock: number, reorderLevel: number, suggestedQuantity: number): 'critical' | 'low' | 'normal' {
  if (currentStock <= 0) return 'critical';
  if (currentStock <= reorderLevel) return 'low';
  if (suggestedQuantity > 0) return 'normal';
  return 'normal';
}

// ============================================================
// HELPER: Derive primary supplier per product from PO history
// ============================================================

async function getPrimarySupplierMap(): Promise<Map<string, { supplierId: string; supplierName: string }>> {
  // Find the most recent PurchaseOrderLine per product to determine primary supplier
  const recentPOLines = await db.purchaseOrderLine.findMany({
    where: {
      purchaseOrder: { isActive: true },
    },
    select: {
      productId: true,
      purchaseOrder: {
        select: {
          supplierId: true,
          supplier: { select: { name: true } },
          createdAt: true,
        },
      },
    },
    orderBy: {
      purchaseOrder: { createdAt: 'desc' },
    },
  });

  const supplierMap = new Map<string, { supplierId: string; supplierName: string }>();
  for (const line of recentPOLines) {
    if (!supplierMap.has(line.productId)) {
      supplierMap.set(line.productId, {
        supplierId: line.purchaseOrder.supplierId,
        supplierName: line.purchaseOrder.supplier.name,
      });
    }
  }

  return supplierMap;
}

// ============================================================
// GET /api/auto-po — Enhanced threshold engine
// ============================================================

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'AutoPO', 'GET');
  if (!security.authorized) return security.response;

  // Dealer: completely blocked from auto PO
  if (security.user?.role === 'dealer') {
    return NextResponse.json(
      { error: 'Access denied. Dealers cannot access auto PO suggestions.' },
      { status: 403 }
    );
  }

  // SR: completely blocked from auto PO
  if (security.user?.role === 'sr') {
    return NextResponse.json(
      { error: 'Access denied. SRs cannot access auto PO suggestions.' },
      { status: 403 }
    );
  }

  try {
    const isVatAuditor = security.user?.role === 'vat_auditor';
    const { searchParams } = new URL(request.url);

    // Query params for filtering
    const filterSupplierId = searchParams.get('supplierId');
    const filterCategoryId = searchParams.get('categoryId');
    const filterGodownId = searchParams.get('godownId');
    const filterUrgency = searchParams.get('urgency'); // critical | low | normal

    // Validate urgency param
    if (filterUrgency && !['critical', 'low', 'normal'].includes(filterUrgency)) {
      return NextResponse.json(
        { error: 'Invalid urgency filter. Must be one of: critical, low, normal' },
        { status: 400 }
      );
    }

    // Build product filter
    const productWhere: Record<string, unknown> = { isActive: true };
    if (filterCategoryId) productWhere.categoryId = filterCategoryId;
    if (filterGodownId) productWhere.godownId = filterGodownId;

    // 1. Get all active products with category, brand, godown
    const products = await db.product.findMany({
      include: {
        category: true,
        brand: true,
        godown: true,
        company: true,
      },
      where: productWhere,
    });

    // 2. Get primary supplier map (from most recent PO per product)
    const primarySupplierMap = await getPrimarySupplierMap();

    // 3. Compute current stock per product using StockEntry records
    // Current stock = openingStock + IN entries - OUT entries
    const stockEntries = await db.stockEntry.findMany({
      select: {
        productId: true,
        type: true,
        quantity: true,
      },
    });

    // Build stock movement maps (IN and OUT per product)
    const stockInMap = new Map<string, number>();
    const stockOutMap = new Map<string, number>();

    for (const entry of stockEntries) {
      if (entry.type === 'IN') {
        stockInMap.set(entry.productId, (stockInMap.get(entry.productId) || 0) + entry.quantity);
      } else if (entry.type === 'OUT') {
        stockOutMap.set(entry.productId, (stockOutMap.get(entry.productId) || 0) + entry.quantity);
      }
    }

    // 4. Calculate average daily sales per product over last 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - DAYS_FOR_AVG);

    const salesEntries = await db.stockEntry.findMany({
      where: {
        type: 'OUT',
        date: { gte: ninetyDaysAgo },
      },
      select: {
        productId: true,
        quantity: true,
      },
    });

    // Build sales map: total quantity sold per product over 90 days
    const salesMap = new Map<string, number>();
    for (const entry of salesEntries) {
      salesMap.set(entry.productId, (salesMap.get(entry.productId) || 0) + entry.quantity);
    }

    // 5. Compute auto-PO items for all products
    let autoPOItems: AutoPOItem[] = products.map((product) => {
      const inQty = stockInMap.get(product.id) || 0;
      const outQty = stockOutMap.get(product.id) || 0;
      const currentStock = safeFinancialRound(product.openingStock + inQty - outQty);

      const totalSoldLast90Days = salesMap.get(product.id) || 0;
      const avgDailySales = safeFinancialRound(totalSoldLast90Days / DAYS_FOR_AVG);

      const leadTimeDays = DEFAULT_LEAD_TIME_DAYS;
      const safetyStock = product.reorderLevel;

      // Formula: Suggested PO = ceil(avgDailySales * leadTimeDays - currentStock + safetyStock)
      const rawSuggestedPO = avgDailySales * leadTimeDays - currentStock + safetyStock;
      const suggestedQuantity = rawSuggestedPO > 0 ? Math.ceil(rawSuggestedPO) : 0;

      const urgency = computeUrgency(currentStock, product.reorderLevel, suggestedQuantity);

      const supplierInfo = primarySupplierMap.get(product.id);
      const estimatedCost = safeFinancialRound(suggestedQuantity * product.costPrice);

      return {
        productId: product.id,
        productCode: product.productCode,
        productName: product.name,
        category: product.category?.name || 'Uncategorized',
        brand: product.brand?.name || 'No Brand',
        godown: product.godown?.name || 'Unassigned',
        supplierId: supplierInfo?.supplierId || null,
        supplierName: supplierInfo?.supplierName || null,
        currentStock,
        reorderLevel: product.reorderLevel,
        avgDailySales,
        leadTimeDays,
        safetyStock,
        suggestedQuantity,
        costPrice: isVatAuditor ? 'N/A (Audit Mode)' : product.costPrice,
        estimatedCost: isVatAuditor ? 'N/A (Audit Mode)' : estimatedCost,
        urgency,
      };
    });

    // 6. Filter: only show products that need PO (suggested > 0) or are below/at reorder level
    autoPOItems = autoPOItems.filter(
      (item) => item.suggestedQuantity > 0 || item.currentStock <= item.reorderLevel
    );

    // 7. Apply query param filters
    if (filterSupplierId) {
      autoPOItems = autoPOItems.filter((item) => item.supplierId === filterSupplierId);
    }
    if (filterUrgency) {
      autoPOItems = autoPOItems.filter((item) => item.urgency === filterUrgency);
    }

    // 8. Compute summary
    const criticalItems = autoPOItems.filter((i) => i.urgency === 'critical');
    const lowItems = autoPOItems.filter((i) => i.urgency === 'low');
    const normalItems = autoPOItems.filter((i) => i.urgency === 'normal');
    const itemsBelowReorder = autoPOItems.filter((i) => i.currentStock <= i.reorderLevel);

    const totalEstimatedCost = isVatAuditor
      ? 'N/A (Audit Mode)'
      : safeFinancialRound(
          autoPOItems.reduce(
            (sum, item) => sum + (typeof item.estimatedCost === 'number' ? item.estimatedCost : 0),
            0
          )
        );

    const uniqueSuppliers = new Set(autoPOItems.map((i) => i.supplierId).filter(Boolean));

    const summary: AutoPOSummary = {
      totalItemsBelowReorder: itemsBelowReorder.length,
      totalEstimatedCost,
      criticalCount: criticalItems.length,
      lowCount: lowItems.length,
      normalCount: normalItems.length,
      supplierCount: uniqueSuppliers.size,
    };

    // 9. Group results by supplier
    const supplierGroups = new Map<string, AutoPOGroup>();

    for (const item of autoPOItems) {
      const groupKey = item.supplierId || '__no_supplier__';
      const groupName = item.supplierName || 'No Supplier Assigned';

      if (!supplierGroups.has(groupKey)) {
        supplierGroups.set(groupKey, {
          supplierId: item.supplierId || '',
          supplierName: groupName,
          items: [],
          totalEstimatedCost: 0,
          itemCount: 0,
        });
      }

      const group = supplierGroups.get(groupKey)!;
      group.items.push(item);
      group.itemCount += 1;
      if (typeof item.estimatedCost === 'number') {
        group.totalEstimatedCost = safeFinancialRound(
          (typeof group.totalEstimatedCost === 'number' ? group.totalEstimatedCost : 0) + item.estimatedCost
        );
      }
    }

    // Apply VAT masking to group totals
    const groupedBySupplier: AutoPOGroup[] = Array.from(supplierGroups.values()).map((group) => ({
      ...group,
      totalEstimatedCost: isVatAuditor ? 'N/A (Audit Mode)' : group.totalEstimatedCost,
    }));

    return NextResponse.json({
      summary,
      items: autoPOItems,
      groupedBySupplier,
    });
  } catch (error) {
    console.error('Error generating auto PO suggestions:', error);
    return NextResponse.json(
      { error: 'Failed to generate auto PO suggestions' },
      { status: 500 }
    );
  }
}

// ============================================================
// POST /api/auto-po — Auto-PO generation endpoint
// ============================================================

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'AutoPO', 'POST');
  if (!security.authorized) return security.response;

  // Dealer: completely blocked from auto PO
  if (security.user?.role === 'dealer') {
    return NextResponse.json(
      { error: 'Access denied. Dealers cannot generate auto purchase orders.' },
      { status: 403 }
    );
  }

  // SR: completely blocked from auto PO
  if (security.user?.role === 'sr') {
    return NextResponse.json(
      { error: 'Access denied. SRs cannot generate auto purchase orders.' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { supplierId, godownId, date, items } = body as {
      supplierId: string;
      godownId?: string;
      date: string;
      items: { productId: string; quantity: number; rate: number }[];
    };

    // ── Input validation ──
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
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'items array with at least one item is required' },
        { status: 400 }
      );
    }

    // Validate each item has required fields
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.productId || !item.quantity || !item.rate) {
        return NextResponse.json(
          { error: `Item at index ${i} is missing required fields (productId, quantity, rate)` },
          { status: 400 }
        );
      }
      if (item.quantity <= 0) {
        return NextResponse.json(
          { error: `Item at index ${i} has invalid quantity (must be > 0)` },
          { status: 400 }
        );
      }
      if (item.rate < 0) {
        return NextResponse.json(
          { error: `Item at index ${i} has invalid rate (must be >= 0)` },
          { status: 400 }
        );
      }
    }

    // ── Period-close lock check ──
    const periodLock = await checkPeriodClose(new Date(date));
    if (periodLock) return periodLock;

    // ── Validate supplier exists ──
    const supplier = await db.supplier.findUnique({
      where: { id: supplierId, isActive: true },
    });
    if (!supplier) {
      return NextResponse.json(
        { error: 'Supplier not found or is inactive' },
        { status: 400 }
      );
    }

    // ── Credit freeze check ──
    if (supplier.creditStatus === 'Frozen') {
      return NextResponse.json(
        { error: `CREDIT FREEZE: Supplier account "${supplier.name}" is frozen. Cannot create purchase orders.` },
        { status: 403 }
      );
    }

    // ── Validate godown if provided ──
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
          { error: `EMERGENCY CLOSURE: Warehouse "${targetGodown.name}" is SUSPENDED. All receipt orders to this location are blocked.` },
          { status: 403 }
        );
      }
    }

    // ── Validate all productIds exist and have the specified supplier as primary ──
    const productIds = items.map((item) => item.productId);
    const products = await db.product.findMany({
      where: {
        id: { in: productIds },
        isActive: true,
      },
      select: { id: true, productCode: true, name: true, costPrice: true },
    });

    // Check all products exist
    const foundIds = new Set(products.map((p) => p.id));
    const missingIds = productIds.filter((id) => !foundIds.has(id));
    if (missingIds.length > 0) {
      return NextResponse.json(
        { error: `Products not found or inactive: ${missingIds.join(', ')}` },
        { status: 400 }
      );
    }

    // Check supplier is primary for each product (based on PO history)
    const primarySupplierMap = await getPrimarySupplierMap();
    const supplierMismatchItems: string[] = [];

    for (const item of items) {
      const primary = primarySupplierMap.get(item.productId);
      if (!primary) {
        // Product has no PO history — allow it (first-time purchase from this supplier)
        continue;
      }
      if (primary.supplierId !== supplierId) {
        const product = products.find((p) => p.id === item.productId);
        supplierMismatchItems.push(
          `${product?.productCode || item.productId} (primary: ${primary.supplierName})`
        );
      }
    }

    if (supplierMismatchItems.length > 0) {
      return NextResponse.json(
        {
          error: `Supplier mismatch. The following products have a different primary supplier: ${supplierMismatchItems.join('; ')}. Please use the correct supplier or create a manual PO.`,
          mismatchedItems: supplierMismatchItems,
        },
        { status: 400 }
      );
    }

    // ── Calculate line-level and order-level totals ──
    const processedLines = items.map((item) => {
      const lineQty = Number(item.quantity);
      const lineRate = Number(item.rate);
      const lineTotal = safeFinancialRound(lineQty * lineRate);
      return {
        productId: item.productId,
        quantity: lineQty,
        rate: lineRate,
        discountPercent: 0,
        discountAmount: 0,
        vatAmount: 0,
        total: lineTotal,
      };
    });

    const subTotal = safeFinancialRound(
      processedLines.reduce((sum, l) => sum + l.total, 0)
    );
    const grandTotal = subTotal; // No discount/VAT in auto-PO

    // ── Credit limit check ──
    if (supplier.creditLimit > 0) {
      const outstandingBalance = Math.abs(supplier.currentBalance);
      const projectedBalance = outstandingBalance + grandTotal;
      if (projectedBalance > supplier.creditLimit) {
        if (supplier.creditStatus !== 'OverLimit') {
          await db.supplier.update({
            where: { id: supplierId },
            data: { creditStatus: 'OverLimit' },
          });
        }
        return NextResponse.json(
          {
            error: `CREDIT LIMIT: Supplier outstanding + proposed order (Tk. ${safeFinancialRound(projectedBalance)}) exceeds credit ceiling (Tk. ${safeFinancialRound(supplier.creditLimit)}). Review supplier payment terms or increase credit limit.`,
          },
          { status: 403 }
        );
      }
    }

    // ── Auto-generate poNumber: PUR-XXXXX ──
    const allPOs = await db.purchaseOrder.findMany({
      select: { poNumber: true },
    });

    let maxPONum = 0;
    for (const po of allPOs) {
      if (po.poNumber) {
        const match = po.poNumber.match(/PUR-(\d+)/);
        if (match) maxPONum = Math.max(maxPONum, parseInt(match[1], 10));
      }
    }
    const poNumber = `PUR-${String(maxPONum + 1).padStart(5, '0')}`;

    // ── Create PurchaseOrder + StockEntries in a transaction ──
    const result = await db.$transaction(async (tx) => {
      // Create purchase order with lines
      const purchaseOrder = await tx.purchaseOrder.create({
        data: {
          poNumber,
          supplierId,
          date: new Date(date),
          godownId: godownId || null,
          subTotal,
          discount: 0,
          discountPercent: 0,
          vatPercentage: 0,
          vatAmount: 0,
          grandTotal,
          notes: 'Auto-generated PO from reorder threshold engine',
          lines: {
            create: processedLines.map((line) => ({
              productId: line.productId,
              quantity: line.quantity,
              pendingQuantity: line.quantity,
              rate: line.rate,
              discountPercent: line.discountPercent,
              discountAmount: line.discountAmount,
              vatAmount: line.vatAmount,
              total: line.total,
            })),
          },
        },
        include: {
          supplier: true,
          godown: true,
          lines: { include: { product: true } },
        },
      });

      // Create StockEntry (type=IN) for each line
      for (const line of processedLines) {
        await tx.stockEntry.create({
          data: {
            productId: line.productId,
            godownId: godownId || null,
            type: 'IN',
            quantity: line.quantity,
            reference: poNumber,
            referenceType: 'PurchaseOrder',
            date: new Date(date),
          },
        });
      }

      // Create audit log for PO creation
      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'AutoPO',
          recordId: purchaseOrder.id,
          recordLabel: poNumber,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            type: 'Auto-PO Generation',
            supplierId,
            supplierName: supplier.name,
            godownId: godownId || null,
            grandTotal,
            lineCount: processedLines.length,
            products: processedLines.map((l) => ({
              productId: l.productId,
              quantity: l.quantity,
              rate: l.rate,
              total: l.total,
            })),
          }),
        },
      });

      // Activity logging inside transaction
      await logUserActivity({
        tx: tx,
        action: 'CREATE',
        module: 'Inv-AutoPO-Engine',
        recordId: purchaseOrder.id,
        recordLabel: poNumber,
        userId: security.user.id,
        userName: security.user.name,
        details: `Auto-PO ${poNumber} created for supplier ${supplier.name} with ${items.length} line(s), grand total: ${safeFinancialRound(grandTotal)}`,
      });

      return purchaseOrder;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error generating auto PO:', error);
    return NextResponse.json(
      { error: 'Failed to generate auto purchase order' },
      { status: 500 }
    );
  }
}
