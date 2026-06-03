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
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

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
// SHARED: Compute stock per godown for a product
// ============================================================

async function computeStockByGodown(
  productId: string
): Promise<Array<{ godownId: string; godownName: string; quantity: number }>> {
  // Get all stock entries for this product, grouped by godown
  const stockEntries = await db.stockEntry.findMany({
    where: { productId, isActive: true },
    select: { godownId: true, type: true, quantity: true },
  });

  // Get all opening stock entries for this product, grouped by godown
  const openingStocks = await db.openingStock.findMany({
    where: { productId, isActive: true, status: 'Posted' },
    select: { godownId: true, quantity: true },
  });

  // Get all godowns
  const godowns = await db.godown.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });
  const godownMap = new Map(godowns.map(g => [g.id, g.name]));

  // Aggregate stock by godown
  const godownStockMap = new Map<string, number>();

  // Add opening stock from Product.openingStock (default godown)
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { openingStock: true, godownId: true },
  });

  if (product && product.openingStock > 0 && product.godownId) {
    godownStockMap.set(
      product.godownId,
      safeFinancialAdd(godownStockMap.get(product.godownId) || 0, product.openingStock)
    );
  }

  // Add OpeningStock entries
  for (const os of openingStocks) {
    if (os.godownId) {
      godownStockMap.set(
        os.godownId,
        safeFinancialAdd(godownStockMap.get(os.godownId) || 0, os.quantity)
      );
    }
  }

  // Add stock entry movements
  for (const entry of stockEntries) {
    if (entry.godownId) {
      const current = godownStockMap.get(entry.godownId) || 0;
      const delta = entry.type === 'IN' ? entry.quantity : -entry.quantity;
      godownStockMap.set(entry.godownId, safeFinancialAdd(current, delta));
    }
  }

  // Build result array
  const result: Array<{ godownId: string; godownName: string; quantity: number }> = [];
  for (const [gId, qty] of godownStockMap) {
    if (qty > 0) {
      result.push({
        godownId: gId,
        godownName: godownMap.get(gId) || 'Unknown',
        quantity: qty,
      });
    }
  }

  return result;
}

// ============================================================
// SHARED: Auto-generate adjustment reference: ADJ-XXXXX
// ============================================================

async function generateAdjustmentRef(tx: any): Promise<string> {
  // Collision-safe code generation: findMany + Math.max
  const allAdjEntries = await tx.stockEntry.findMany({
    where: { referenceType: 'Adjustment', reference: { startsWith: 'ADJ-' } },
    select: { reference: true },
  });

  let maxNum = 0;
  for (const entry of allAdjEntries) {
    if (entry.reference) {
      const match = entry.reference.match(/ADJ-(\d+)/);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
    }
  }
  return `ADJ-${String(maxNum + 1).padStart(5, '0')}`;
}

// ============================================================
// GET /api/stock — Enhanced Real-Time Inventory Control Framework
// Query params: godownId, categoryId, status, includeBatchInfo, includeValuation
// ============================================================

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Stock', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const godownId = searchParams.get('godownId');
    const categoryId = searchParams.get('categoryId');
    const statusFilter = searchParams.get('status'); // "In Stock", "Low Stock", "Out of Stock"
    const includeBatchInfo = searchParams.get('includeBatchInfo') === 'true';
    const includeValuation = searchParams.get('includeValuation') === 'true';

    const role = security.user.role;

    // Build product filter
    const productWhere: Record<string, unknown> = { isActive: true };
    if (godownId) productWhere.godownId = godownId;
    if (categoryId) productWhere.categoryId = categoryId;

    // Company isolation for non-admin users
    if (security.user.companyId && role !== 'admin') {
      productWhere.companyId = security.user.companyId;
    }

    // Get all products with their category, brand, and godown info
    const products = await db.product.findMany({
      include: {
        category: true,
        brand: true,
        godown: true,
      },
      where: productWhere,
    });

    // Get all stock entries
    const stockEntries = await db.stockEntry.findMany({
      where: { isActive: true },
      select: {
        productId: true,
        godownId: true,
        type: true,
        quantity: true,
        costPrice: true,
      },
    });

    // Build stock maps
    const stockMap = new Map<string, number>(); // productId -> total stock
    const godownStockMap = new Map<string, Map<string, number>>(); // productId -> (godownId -> qty)
    const costPriceMap = new Map<string, { totalCost: number; totalQty: number }>(); // productId -> weighted cost

    for (const entry of stockEntries) {
      // Product total
      const current = stockMap.get(entry.productId) || 0;
      if (entry.type === 'IN') {
        stockMap.set(entry.productId, current + entry.quantity);
      } else if (entry.type === 'OUT') {
        stockMap.set(entry.productId, current - entry.quantity);
      }

      // Per-godown tracking
      if (entry.godownId) {
        if (!godownStockMap.has(entry.productId)) {
          godownStockMap.set(entry.productId, new Map());
        }
        const gMap = godownStockMap.get(entry.productId)!;
        const gCurrent = gMap.get(entry.godownId) || 0;
        if (entry.type === 'IN') {
          gMap.set(entry.godownId, gCurrent + entry.quantity);
        } else {
          gMap.set(entry.godownId, gCurrent - entry.quantity);
        }
      }

      // Weighted average cost tracking (only IN entries contribute)
      if (entry.type === 'IN' && entry.costPrice > 0) {
        const costData = costPriceMap.get(entry.productId) || { totalCost: 0, totalQty: 0 };
        costData.totalCost += entry.costPrice * entry.quantity;
        costData.totalQty += entry.quantity;
        costPriceMap.set(entry.productId, costData);
      }
    }

    // Helper to determine stock status
    const getStockStatus = (currentStock: number, reorderLevel: number): string => {
      if (currentStock <= 0) return 'Out of Stock';
      if (currentStock <= reorderLevel) return 'Low Stock';
      return 'In Stock';
    };

    // Get all godowns for name resolution
    const allGodowns = await db.godown.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });
    const godownNameMap = new Map(allGodowns.map(g => [g.id, g.name]));

    // Get batches if includeBatchInfo
    let batchMap = new Map<string, Array<{ batchId: string; batchCode: string; onHand: number; status: string; expiryDate: Date | null }>>();
    if (includeBatchInfo) {
      const batches = await db.batchMaster.findMany({
        where: { isActive: true },
        select: {
          id: true,
          batchCode: true,
          productId: true,
          quantityOnHand: true,
          status: true,
          expiryDate: true,
        },
      });
      for (const batch of batches) {
        if (!batchMap.has(batch.productId)) {
          batchMap.set(batch.productId, []);
        }
        // Auto-detect expired batches
        let batchStatus = batch.status;
        if (batch.expiryDate && new Date(batch.expiryDate) < new Date() && batch.status === 'Active') {
          batchStatus = 'Expired';
        }
        batchMap.get(batch.productId)!.push({
          batchId: batch.id,
          batchCode: batch.batchCode,
          onHand: batch.quantityOnHand,
          status: batchStatus,
          expiryDate: batch.expiryDate,
        });
      }
    }

    // Build the result array
    let stockReport = await Promise.all(products.map(async (product) => {
      const stockMovements = stockMap.get(product.id) || 0;
      const currentStock = safeFinancialRound(product.openingStock + stockMovements);
      const stockStatus = getStockStatus(currentStock, product.reorderLevel);

      // Stock by godown
      const gMap = godownStockMap.get(product.id) || new Map<string, number>();
      const stockByGodown: Array<{ godownId: string; godownName: string; quantity: number }> = [];

      // Add product's default godown opening stock
      if (product.godownId && product.openingStock > 0) {
        const existingQty = gMap.get(product.godownId) || 0;
        gMap.set(product.godownId, existingQty + product.openingStock);
      }

      for (const [gId, qty] of gMap) {
        if (qty > 0) {
          stockByGodown.push({
            godownId: gId,
            godownName: godownNameMap.get(gId) || 'Unknown',
            quantity: safeFinancialRound(qty),
          });
        }
      }

      // Batch info
      const batchInfo = includeBatchInfo ? (batchMap.get(product.id) || []) : undefined;

      // Valuation data
      let valuationData = undefined;
      if (includeValuation) {
        const costData = costPriceMap.get(product.id);
        const weightedAvgCost = costData && costData.totalQty > 0
          ? safeFinancialRound(costData.totalCost / costData.totalQty)
          : product.costPrice;

        const totalCostValue = safeFinancialRound(currentStock * weightedAvgCost);
        const totalSaleValue = safeFinancialRound(currentStock * product.salePrice);
        const totalWholesaleValue = safeFinancialRound(currentStock * product.wholesalePrice);

        valuationData = {
          totalCostValue,
          totalSaleValue,
          totalWholesaleValue,
          weightedAvgCost,
        };
      }

      return {
        productId: product.id,
        productName: product.name,
        productCode: product.productCode,
        sku: product.sku,
        category: product.category?.name || 'Uncategorized',
        categoryId: product.categoryId,
        brand: product.brand?.name || null,
        brandId: product.brandId,
        godown: product.godown?.name || 'Unassigned',
        godownId: product.godownId,
        currentStock,
        reorderLevel: product.reorderLevel,
        stockStatus,
        costPrice: product.costPrice,
        salePrice: product.salePrice,
        wholesalePrice: product.wholesalePrice,
        dealerPrice: product.dealerPrice,
        stockValue: safeFinancialRound(currentStock * product.costPrice),
        openingStock: product.openingStock,
        stockByGodown,
        ...(batchInfo !== undefined ? { batchInfo } : {}),
        ...(valuationData !== undefined ? { valuationData } : {}),
      };
    }));

    // Filter by status if provided
    if (statusFilter) {
      stockReport = stockReport.filter((item) => item.stockStatus === statusFilter);
    }

    // Apply VAT Auditor masking using centralized maskForVatAuditor utility
    const sensitiveFields = ['costPrice', 'salePrice', 'wholesalePrice', 'dealerPrice', 'stockValue', 'openingStock'];
    const valuationFields = includeValuation
      ? [...sensitiveFields, 'totalCostValue', 'totalSaleValue', 'totalWholesaleValue', 'weightedAvgCost']
      : sensitiveFields;

    stockReport = stockReport.map(item => {
      let masked = maskForVatAuditor(item as Record<string, unknown>, role, valuationFields);
      // Mask nested valuationData if present
      if (includeValuation && masked.valuationData && typeof masked.valuationData === 'object' && role === 'vat_auditor') {
        masked = {
          ...masked,
          valuationData: maskForVatAuditor(
            masked.valuationData as Record<string, unknown>,
            role,
            ['totalCostValue', 'totalSaleValue', 'totalWholesaleValue', 'weightedAvgCost']
          ),
        };
      }
      // Mask nested batchInfo cost fields
      if (includeBatchInfo && masked.batchInfo && Array.isArray(masked.batchInfo) && role === 'vat_auditor') {
        masked = {
          ...masked,
          batchInfo: (masked.batchInfo as Record<string, unknown>[]).map(b =>
            maskForVatAuditor(b, role, ['onHand'])
          ),
        };
      }
      return masked;
    });

    return NextResponse.json(stockReport);
  } catch (error) {
    console.error('[Stock] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to calculate stock' },
      { status: 500 }
    );
  }
}

// ============================================================
// POST /api/stock — Manual Stock Adjustment (IN/OUT)
// Body: { productId, godownId, type, quantity, batchId?, costPrice?, notes? }
// ============================================================

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Stock', 'POST');
  if (!security.authorized) return security.response;

  try {
    const body = await request.json();
    const { productId, godownId, type, quantity, batchId, costPrice, notes } = body;

    // ── Validation ──
    if (!productId) {
      return NextResponse.json({ error: 'productId is required' }, { status: 400 });
    }
    if (!type || !['IN', 'OUT'].includes(type)) {
      return NextResponse.json({ error: 'type must be "IN" or "OUT"' }, { status: 400 });
    }
    if (!quantity || quantity <= 0) {
      return NextResponse.json({ error: 'quantity must be a positive number' }, { status: 400 });
    }

    // Validate product exists
    const product = await db.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, productCode: true, costPrice: true, godownId: true },
    });
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 400 });
    }

    // Validate batchId if provided
    if (batchId) {
      const batch = await db.batchMaster.findUnique({
        where: { id: batchId },
        select: { id: true, productId: true, quantityOnHand: true, status: true },
      });
      if (!batch) {
        return NextResponse.json({ error: 'Batch not found' }, { status: 400 });
      }
      if (batch.productId !== productId) {
        return NextResponse.json({ error: 'Batch does not belong to this product' }, { status: 400 });
      }
    }

    // Godown SUSPENDED check
    const effectiveGodownId = godownId || product.godownId;
    if (effectiveGodownId) {
      const godown = await db.godown.findUnique({
        where: { id: effectiveGodownId },
        select: { id: true, name: true, status: true, isActive: true },
      });
      if (godown && godown.status === 'SUSPENDED') {
        return NextResponse.json(
          { error: `EMERGENCY CLOSURE: Warehouse "${godown.name}" is SUSPENDED. Stock adjustments are blocked.` },
          { status: 403 }
        );
      }
    }

    // Period-close check (use current date for adjustments)
    const periodLock = await checkPeriodClose(new Date());
    if (periodLock) return periodLock;

    // For OUT adjustments, verify sufficient stock
    if (type === 'OUT') {
      const currentStock = await computeCurrentStock(db, productId, effectiveGodownId || undefined);
      if (currentStock < quantity) {
        const fmtBD = (v: number) =>
          // Use en-US to guarantee Latin digits — en-US may produce Bengali numerals
          new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
        return NextResponse.json(
          { error: `Insufficient stock. Current stock is ${fmtBD(currentStock)} units, but ${fmtBD(quantity)} requested for adjustment.` },
          { status: 400 }
        );
      }
    }

    // Snapshot costPrice
    const effectiveCostPrice = costPrice || product.costPrice;

    // Create adjustment entry atomically
    const result = await db.$transaction(async (tx) => {
      const adjustmentRef = await generateAdjustmentRef(tx);

      const stockEntry = await tx.stockEntry.create({
        data: {
          productId,
          godownId: effectiveGodownId || null,
          type,
          quantity,
          reference: adjustmentRef,
          referenceType: 'Adjustment',
          date: new Date(),
          batchId: batchId || null,
          costPrice: effectiveCostPrice,
          notes: notes || `Stock adjustment: ${type} ${quantity} units`,
          companyId: security.user.companyId || null,
        },
      });

      // Update batch quantityOnHand if batchId provided
      if (batchId) {
        const batch = await tx.batchMaster.findUnique({
          where: { id: batchId },
          select: { quantityOnHand: true },
        });
        if (batch) {
          const newOnHand = type === 'IN'
            ? safeFinancialAdd(batch.quantityOnHand, quantity)
            : safeFinancialSubtract(batch.quantityOnHand, quantity);

          await tx.batchMaster.update({
            where: { id: batchId },
            data: {
              quantityOnHand: Math.max(0, newOnHand),
              status: newOnHand <= 0 ? 'Depleted' : undefined,
            },
          });
        }
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'Stock',
          recordId: stockEntry.id,
          recordLabel: adjustmentRef,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            type: 'StockAdjustment',
            productId,
            productName: product.name,
            adjustmentType: type,
            quantity,
            costPrice: effectiveCostPrice,
            godownId: effectiveGodownId,
            batchId: batchId || null,
            reference: adjustmentRef,
          }),
        },
      });

      return stockEntry;
    });

    // Activity log
    await logUserActivity({
      action: 'CREATE',
      module: 'Inv-Stock-Adjustment',
      recordId: result.id,
      recordLabel: result.reference,
      userId: security.user.id,
      userName: security.user.name,
      details: `Stock adjustment ${type} ${quantity} units of ${product.name} (${product.productCode})`,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('[Stock] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to create stock adjustment' },
      { status: 500 }
    );
  }
}
