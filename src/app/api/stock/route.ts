// ============================================================
// STOCK API ROUTE — Enhanced with location-wise stock matrices,
// batch summaries, SUSPENDED godown flagging, multi-tenant
// companyId isolation, safe financial arithmetic, and
// VAT Auditor masking. Module token: Inv-Stock-Core
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

// Inventory VAT-masked fields
const STOCK_VAT_MASKED_FIELDS = [
  'costPrice',
  'salePrice',
  'wholesalePrice',
  'dealerPrice',
  'stockValue',
  'openingStock',
  'totalValue',
];

interface LocationEntry {
  godownId: string;
  godownName: string;
  quantity: number;
  costPrice: number;
  totalValue: number;
  alertLevel: number;
  isSuspended: boolean;
}

interface BatchSummary {
  activeBatches: number;
  nearestExpiry: string | null;
  expiredBatches: number;
}

interface StockReportItem {
  productId: string;
  productName: string;
  productCode: string;
  category: string;
  categoryId: string | null;
  godown: string;
  godownId: string | null;
  currentStock: number;
  reorderLevel: number;
  stockStatus: string;
  valuationMethod: string;
  costPrice: number;
  salePrice: number;
  wholesalePrice: number;
  dealerPrice: number;
  stockValue: number;
  openingStock: number;
  locations: LocationEntry[];
  batchSummary: BatchSummary;
}

/**
 * GET /api/stock
 * Enhanced stock calculation with location-wise breakdown and batch summaries.
 *
 * Query params:
 *   godownId    — filter by godown
 *   categoryId  — filter by category
 *   status      — "In Stock", "Low Stock", "Out of Stock"
 *   productId   — filter by single product
 */
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Stock', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const godownId = searchParams.get('godownId');
    const categoryId = searchParams.get('categoryId');
    const statusFilter = searchParams.get('status');
    const productId = searchParams.get('productId');
    const companyId = security.user.companyId;

    // Build product filter with multi-tenant isolation
    const productWhere: Record<string, unknown> = { isActive: true };
    if (companyId) productWhere.companyId = companyId;
    if (godownId) productWhere.godownId = godownId;
    if (categoryId) productWhere.categoryId = categoryId;
    if (productId) productWhere.id = productId;

    // Get all products with their category and godown info
    const products = await db.product.findMany({
      include: {
        category: { select: { name: true } },
        godown: { select: { name: true, status: true } },
      },
      where: productWhere,
    });

    if (products.length === 0) {
      return NextResponse.json([]);
    }

    const productIds = products.map((p) => p.id);

    // Get all stock entries grouped by product
    const stockEntries = await db.stockEntry.findMany({
      where: {
        productId: { in: productIds },
        isActive: true,
        ...(companyId ? { companyId } : {}),
      },
      select: {
        productId: true,
        type: true,
        quantity: true,
      },
    });

    // Build a map of product stock movements
    const stockMap = new Map<string, number>();
    for (const entry of stockEntries) {
      const current = stockMap.get(entry.productId) || 0;
      if (entry.type === 'IN') {
        stockMap.set(
          entry.productId,
          safeFinancialAdd(current, entry.quantity)
        );
      } else if (entry.type === 'OUT') {
        stockMap.set(
          entry.productId,
          safeFinancialSubtract(current, entry.quantity)
        );
      }
    }

    // Get ProductStock records for location-wise breakdown
    const productStocks = await db.productStock.findMany({
      where: {
        productId: { in: productIds },
        isActive: true,
        ...(companyId ? { companyId } : {}),
      },
      include: {
        godown: {
          select: { name: true, status: true, isActive: true },
        },
      },
    });

    // Group ProductStock by productId
    const productStockMap = new Map<
      string,
      Array<{
        godownId: string;
        godownName: string;
        godownStatus: string;
        quantity: number;
        costPrice: number;
        totalValue: number;
        alertLevel: number;
      }>
    >();

    for (const ps of productStocks) {
      if (!productStockMap.has(ps.productId)) {
        productStockMap.set(ps.productId, []);
      }
      productStockMap.get(ps.productId)!.push({
        godownId: ps.godownId,
        godownName: ps.godown?.name || 'Unknown',
        godownStatus: ps.godown?.status || 'ACTIVE',
        quantity: ps.quantity,
        costPrice: ps.costPrice,
        totalValue: ps.totalValue,
        alertLevel: ps.alertLevel,
      });
    }

    // Get BatchMaster records for batch summary
    const batchMasters = await db.batchMaster.findMany({
      where: {
        productId: { in: productIds },
        isActive: true,
        ...(companyId ? { companyId } : {}),
      },
      select: {
        productId: true,
        expiryDate: true,
        status: true,
      },
    });

    // Group batches by productId
    const batchMap = new Map<
      string,
      Array<{ expiryDate: Date | null; status: string }>
    >();
    for (const batch of batchMasters) {
      if (!batchMap.has(batch.productId)) {
        batchMap.set(batch.productId, []);
      }
      batchMap.get(batch.productId)!.push({
        expiryDate: batch.expiryDate,
        status: batch.status,
      });
    }

    // Helper to determine stock status
    const getStockStatus = (
      currentStock: number,
      reorderLevel: number
    ): string => {
      if (currentStock <= 0) return 'Out of Stock';
      if (currentStock <= reorderLevel) return 'Low Stock';
      return 'In Stock';
    };

    // Build the result array with enhanced data
    let stockReport: StockReportItem[] = products.map((product) => {
      const stockMovements = stockMap.get(product.id) || 0;
      const currentStock = safeFinancialAdd(
        product.openingStock,
        stockMovements
      );
      const stockValue = safeFinancialRound(currentStock * product.costPrice);
      const stockStatus = getStockStatus(currentStock, product.reorderLevel);

      // Build location-wise breakdown
      const locationEntries = productStockMap.get(product.id) || [];
      const locations: LocationEntry[] = locationEntries.map((loc) => ({
        godownId: loc.godownId,
        godownName: loc.godownName,
        quantity: loc.quantity,
        costPrice: loc.costPrice,
        totalValue: loc.totalValue,
        alertLevel: loc.alertLevel,
        isSuspended: loc.godownStatus === 'SUSPENDED',
      }));

      // If no ProductStock records but product has a godown, create a single location entry
      if (locations.length === 0 && product.godownId) {
        locations.push({
          godownId: product.godownId,
          godownName: product.godown?.name || 'Unassigned',
          quantity: currentStock,
          costPrice: product.costPrice,
          totalValue: stockValue,
          alertLevel: product.reorderLevel,
          isSuspended: product.godown?.status === 'SUSPENDED',
        });
      }

      // Build batch summary
      const productBatches = batchMap.get(product.id) || [];
      const activeBatches = productBatches.filter(
        (b) => b.status === 'Active'
      ).length;
      const expiredBatches = productBatches.filter(
        (b) => b.status === 'Expired'
      ).length;

      // Find nearest expiry from active batches
      let nearestExpiry: string | null = null;
      const futureExpiries = productBatches
        .filter(
          (b) =>
            b.expiryDate &&
            b.status === 'Active' &&
            new Date(b.expiryDate) > new Date()
        )
        .map((b) => new Date(b.expiryDate!))
        .sort((a, b) => a.getTime() - b.getTime());

      if (futureExpiries.length > 0) {
        nearestExpiry = futureExpiries[0].toISOString().split('T')[0];
      }

      const batchSummary: BatchSummary = {
        activeBatches,
        nearestExpiry,
        expiredBatches,
      };

      return {
        productId: product.id,
        productName: product.name,
        productCode: product.productCode,
        category: product.category?.name || 'Uncategorized',
        categoryId: product.categoryId,
        godown: product.godown?.name || 'Unassigned',
        godownId: product.godownId,
        currentStock,
        reorderLevel: product.reorderLevel,
        stockStatus,
        valuationMethod: product.valuationMethod || 'FIFO',
        costPrice: product.costPrice,
        salePrice: product.salePrice,
        wholesalePrice: product.wholesalePrice,
        dealerPrice: product.dealerPrice,
        stockValue,
        openingStock: product.openingStock,
        locations,
        batchSummary,
      };
    });

    // Apply VAT Auditor masking
    const role = security.user.role;
    stockReport = stockReport.map((item) => {
      const masked = maskForVatAuditor(
        item as unknown as Record<string, unknown>,
        role,
        STOCK_VAT_MASKED_FIELDS
      ) as unknown as StockReportItem;

      // Also mask location-level costPrice and totalValue for VAT Auditor
      if (role === 'vat_auditor' && masked.locations) {
        masked.locations = masked.locations.map((loc) => ({
          ...loc,
          costPrice: 'N/A (Audit Mode)' as unknown as number,
          totalValue: 'N/A (Audit Mode)' as unknown as number,
        }));
      }

      return masked;
    });

    // Filter by status if provided
    if (statusFilter) {
      stockReport = stockReport.filter(
        (item) => item.stockStatus === statusFilter
      );
    }

    // Log activity
    await logUserActivity({
      action: 'EXPORT',
      module: 'Inv-Stock-Core',
      userId: security.user.id,
      userName: security.user.name,
      details: `Stock report exported: products=${stockReport.length}, godownId=${godownId || 'all'}, statusFilter=${statusFilter || 'none'}`,
    });

    return NextResponse.json(stockReport);
  } catch (error) {
    console.error('[Stock] Error calculating stock:', error);
    return NextResponse.json(
      { error: 'Failed to calculate stock' },
      { status: 500 }
    );
  }
}
