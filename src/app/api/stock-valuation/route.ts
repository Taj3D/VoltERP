// ============================================================
// PERPETUAL STOCK VALUATION ENGINE — FIFO & Weighted Average
// Calculates inventory value per product using FIFO layers
// or Weighted Average cost method.
// Module token: Inv-Stock-Core
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  safeFinancialRound,
  safeFinancialAdd,
  safeFinancialSubtract,
  maskForVatAuditor,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// XSS sanitization helper
function sanitizeString(input: string): string {
  return input.replace(/<[^>]*>/g, '').trim();
}

// Godown SUSPENDED check helper
async function validateGodownActive(
  tx: any,
  godownId: string,
  companyId?: string | null
): Promise<{ valid: boolean; error?: string }> {
  const where: any = { id: godownId, isActive: true };
  if (companyId) where.companyId = companyId;
  const godown = await tx.godown.findFirst({ where });
  if (!godown) return { valid: false, error: 'Godown not found or inactive' };
  if (godown.status === 'SUSPENDED')
    return {
      valid: false,
      error: 'Godown is SUSPENDED. Stock operations are blocked for this warehouse.',
    };
  return { valid: true };
}

// Inventory VAT-masked fields for stock valuation
const INVENTORY_VAT_MASKED_FIELDS = [
  'totalValue',
  'averageCost',
  'costPrice',
  'totalCost',
];

interface FifoLayer {
  date: string;
  quantity: number;
  costPrice: number;
  totalCost: number;
  batchNumber: string | null;
}

interface ValuationResult {
  productId: string;
  productName: string;
  productCode: string;
  valuationMethod: string;
  totalQuantity: number;
  totalValue: number;
  averageCost: number;
  layers: FifoLayer[];
  godown: string | null;
  category: string | null;
}

/**
 * GET /api/stock-valuation
 * Calculate stock valuations using FIFO or Weighted Average method.
 *
 * Query params:
 *   method     — "FIFO" | "WeightedAverage" (optional, defaults to product.valuationMethod or "FIFO")
 *   productId  — filter by single product
 *   godownId   — filter by godown
 *   companyId  — multi-tenant filter (overridden by security.user.companyId)
 */
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Stock', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const requestedMethod = searchParams.get('method'); // "FIFO" or "WeightedAverage"
    const productId = searchParams.get('productId');
    const godownId = searchParams.get('godownId');
    const companyId = security.user.companyId;

    // Build product filter with multi-tenant isolation
    const productWhere: Record<string, unknown> = { isActive: true };
    if (companyId) productWhere.companyId = companyId;
    if (productId) productWhere.id = productId;
    if (godownId) productWhere.godownId = godownId;

    // Validate godown is not SUSPENDED if specified
    if (godownId) {
      const godownCheck = await validateGodownActive(db, godownId, companyId);
      if (!godownCheck.valid) {
        return NextResponse.json({ error: godownCheck.error }, { status: 400 });
      }
    }

    // Fetch products with category and godown info
    const products = await db.product.findMany({
      where: productWhere,
      include: {
        category: { select: { name: true } },
        godown: { select: { name: true, status: true } },
      },
      orderBy: { name: 'asc' },
    });

    if (products.length === 0) {
      return NextResponse.json([]);
    }

    const productIds = products.map((p) => p.id);

    // Fetch all IN-type StockEntry records for these products, ordered by date ASC
    const inEntries = await db.stockEntry.findMany({
      where: {
        productId: { in: productIds },
        type: 'IN',
        isActive: true,
        ...(companyId ? { companyId } : {}),
      },
      orderBy: { date: 'asc' },
      select: {
        id: true,
        productId: true,
        quantity: true,
        costPrice: true,
        totalCost: true,
        date: true,
        batchId: true,
      },
    });

    // Fetch total OUT quantity per product
    const outEntries = await db.stockEntry.findMany({
      where: {
        productId: { in: productIds },
        type: 'OUT',
        isActive: true,
        ...(companyId ? { companyId } : {}),
      },
      select: {
        productId: true,
        quantity: true,
      },
    });

    // Build OUT total map per product
    const outTotalMap = new Map<string, number>();
    for (const entry of outEntries) {
      const current = outTotalMap.get(entry.productId) || 0;
      outTotalMap.set(entry.productId, safeFinancialAdd(current, entry.quantity));
    }

    // Build IN entries grouped by product
    const inEntriesMap = new Map<
      string,
      Array<{
        id: string;
        quantity: number;
        costPrice: number;
        totalCost: number;
        date: Date;
        batchId: string | null;
      }>
    >();
    for (const entry of inEntries) {
      if (!inEntriesMap.has(entry.productId)) {
        inEntriesMap.set(entry.productId, []);
      }
      inEntriesMap.get(entry.productId)!.push(entry);
    }

    // Fetch batch numbers for IN entries that have batchId
    const batchIds = inEntries
      .filter((e) => e.batchId)
      .map((e) => e.batchId!);
    const batchMap = new Map<string, string>();
    if (batchIds.length > 0) {
      const batches = await db.batchMaster.findMany({
        where: { id: { in: batchIds } },
        select: { id: true, batchNumber: true },
      });
      for (const b of batches) {
        batchMap.set(b.id, b.batchNumber);
      }
    }

    // Calculate valuation for each product
    const results: ValuationResult[] = [];

    for (const product of products) {
      // Determine valuation method: requested param > product setting > default FIFO
      const valuationMethod =
        requestedMethod || product.valuationMethod || 'FIFO';

      const inProductEntries = inEntriesMap.get(product.id) || [];
      const totalOutQty = outTotalMap.get(product.id) || 0;

      // Calculate total IN quantity and cost
      let totalInQty = 0;
      let totalInCost = 0;
      for (const entry of inProductEntries) {
        totalInQty = safeFinancialAdd(totalInQty, entry.quantity);
        totalInCost = safeFinancialAdd(totalInCost, entry.totalCost);
      }

      // Net quantity
      const netQty = safeFinancialSubtract(totalInQty, totalOutQty);

      if (valuationMethod === 'WeightedAverage') {
        // Weighted Average calculation
        const weightedAvgCost =
          totalInQty > 0
            ? safeFinancialRound(totalInCost / totalInQty)
            : 0;
        const totalValue = safeFinancialRound(netQty * weightedAvgCost);

        results.push({
          productId: product.id,
          productName: product.name,
          productCode: product.productCode,
          valuationMethod: 'WeightedAverage',
          totalQuantity: netQty,
          totalValue,
          averageCost: weightedAvgCost,
          layers: [], // No layers for Weighted Average
          godown: product.godown?.name || null,
          category: product.category?.name || null,
        });
      } else {
        // FIFO calculation — consume OUT from earliest IN layers
        const layers: FifoLayer[] = [];
        let remainingOut = totalOutQty;

        for (const entry of inProductEntries) {
          let layerQty = entry.quantity;

          // Consume from this layer if there's remaining OUT
          if (remainingOut > 0) {
            if (remainingOut >= layerQty) {
              remainingOut = safeFinancialSubtract(remainingOut, layerQty);
              continue; // Entire layer consumed, skip it
            } else {
              layerQty = safeFinancialSubtract(layerQty, remainingOut);
              remainingOut = 0;
            }
          }

          // Remaining qty in this layer
          if (layerQty > 0) {
            const layerCostPrice = entry.costPrice;
            const layerTotalCost = safeFinancialRound(layerQty * layerCostPrice);
            const batchNumber = entry.batchId
              ? batchMap.get(entry.batchId) || null
              : null;

            layers.push({
              date: entry.date.toISOString(),
              quantity: layerQty,
              costPrice: layerCostPrice,
              totalCost: layerTotalCost,
              batchNumber,
            });
          }
        }

        // Calculate totals from remaining layers
        let totalValue = 0;
        let totalLayerQty = 0;
        for (const layer of layers) {
          totalValue = safeFinancialAdd(totalValue, layer.totalCost);
          totalLayerQty = safeFinancialAdd(totalLayerQty, layer.quantity);
        }
        totalValue = safeFinancialRound(totalValue);

        const averageCost =
          totalLayerQty > 0
            ? safeFinancialRound(totalValue / totalLayerQty)
            : 0;

        results.push({
          productId: product.id,
          productName: product.name,
          productCode: product.productCode,
          valuationMethod: 'FIFO',
          totalQuantity: totalLayerQty,
          totalValue,
          averageCost,
          layers,
          godown: product.godown?.name || null,
          category: product.category?.name || null,
        });
      }
    }

    // Apply VAT Auditor masking on valuation results
    const role = security.user.role;
    const maskedResults = results.map((item) => {
      const masked = maskForVatAuditor(
        item as unknown as Record<string, unknown>,
        role,
        INVENTORY_VAT_MASKED_FIELDS
      ) as unknown as ValuationResult;

      // Also mask layer-level costPrice and totalCost for VAT Auditor
      if (role === 'vat_auditor' && masked.layers) {
        masked.layers = masked.layers.map((layer) => ({
          ...layer,
          costPrice: 'N/A (Audit Mode)' as unknown as number,
          totalCost: 'N/A (Audit Mode)' as unknown as number,
        }));
      }

      return masked;
    });

    // Log activity
    await logUserActivity({
      action: 'EXPORT',
      module: 'Inv-Stock-Core',
      userId: security.user.id,
      userName: security.user.name,
      details: `Stock valuation export: method=${
        requestedMethod || 'FIFO'
      }, products=${results.length}, godownId=${godownId || 'all'}`,
    });

    return NextResponse.json(maskedResults);
  } catch (error) {
    console.error('[StockValuation] Error calculating valuations:', error);
    return NextResponse.json(
      { error: 'Failed to calculate stock valuations' },
      { status: 500 }
    );
  }
}
