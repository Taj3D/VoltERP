import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  maskForVatAuditor,
  maskAccountingArray,
  safeFinancialRound,
  safeFinancialAdd,
  safeFinancialSubtract,
} from '@/lib/api-security';

// ============================================================
// GET /api/valuation — Inventory Valuation Engine
// Computes real-time inventory valuation using weighted average cost
// Query params: godownId, categoryId, asOfDate, method (FIFO/LIFO/WeightedAverage)
// ============================================================

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Stock', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const godownId = searchParams.get('godownId');
    const categoryId = searchParams.get('categoryId');
    const asOfDateStr = searchParams.get('asOfDate');
    const method = searchParams.get('method') || 'WeightedAverage'; // FIFO, LIFO, WeightedAverage

    const asOfDate = asOfDateStr ? new Date(asOfDateStr) : new Date();

    // Build product filter
    const productWhere: Record<string, unknown> = { isActive: true };
    if (godownId) productWhere.godownId = godownId;
    if (categoryId) productWhere.categoryId = categoryId;

    // Company isolation for non-admin users
    if (security.user.companyId && security.user.role !== 'admin') {
      productWhere.companyId = security.user.companyId;
    }

    // Get all products
    const products = await db.product.findMany({
      where: productWhere,
      include: {
        category: true,
        brand: true,
        godown: true,
      },
    });

    // Get all stock entries up to asOfDate
    const stockEntryWhere: Record<string, unknown> = {
      isActive: true,
      date: { lte: asOfDate },
    };
    if (godownId) stockEntryWhere.godownId = godownId;

    const stockEntries = await db.stockEntry.findMany({
      where: stockEntryWhere,
      select: {
        id: true,
        productId: true,
        type: true,
        quantity: true,
        costPrice: true,
        date: true,
        batchId: true,
      },
      orderBy: { date: 'asc' },
    });

    // Get opening stock entries up to asOfDate
    const openingStockWhere: Record<string, unknown> = {
      isActive: true,
      status: 'Posted',
      effectiveDate: { lte: asOfDate },
    };
    if (godownId) openingStockWhere.godownId = godownId;

    const openingStocks = await db.openingStock.findMany({
      where: openingStockWhere,
      select: {
        productId: true,
        quantity: true,
        costPrice: true,
      },
    });

    // Get batches for batch-level valuation
    const batches = await db.batchMaster.findMany({
      where: { isActive: true },
      select: {
        id: true,
        batchCode: true,
        productId: true,
        quantityOnHand: true,
        costPricePerUnit: true,
        status: true,
        expiryDate: true,
      },
    });

    // Build per-product valuation
    const productValuations = [];

    for (const product of products) {
      // Compute current stock
      const productStockEntries = stockEntries.filter(e => e.productId === product.id);
      const productOpeningStocks = openingStocks.filter(os => os.productId === product.id);

      // Stock from product.openingStock
      let currentStock = product.openingStock;

      // Stock from OpeningStock entries
      for (const os of productOpeningStocks) {
        currentStock = safeFinancialAdd(currentStock, os.quantity);
      }

      // Stock from StockEntry movements
      for (const entry of productStockEntries) {
        if (entry.type === 'IN') {
          currentStock = safeFinancialAdd(currentStock, entry.quantity);
        } else {
          currentStock = safeFinancialSubtract(currentStock, entry.quantity);
        }
      }

      // Compute weighted average cost from IN entries
      let totalCostWeighted = 0;
      let totalInQty = 0;

      // Add opening stock cost
      if (product.openingStock > 0 && product.costPrice > 0) {
        totalCostWeighted += product.openingStock * product.costPrice;
        totalInQty += product.openingStock;
      }

      // Add OpeningStock entry costs
      for (const os of productOpeningStocks) {
        if (os.quantity > 0 && os.costPrice > 0) {
          totalCostWeighted += os.quantity * os.costPrice;
          totalInQty += os.quantity;
        }
      }

      // Add IN stock entry costs
      for (const entry of productStockEntries) {
        if (entry.type === 'IN' && entry.quantity > 0 && entry.costPrice > 0) {
          totalCostWeighted += entry.quantity * entry.costPrice;
          totalInQty += entry.quantity;
        }
      }

      const valuationPerUnit = totalInQty > 0
        ? safeFinancialRound(totalCostWeighted / totalInQty)
        : product.costPrice;

      const totalValue = safeFinancialRound(currentStock * valuationPerUnit);
      const saleValue = safeFinancialRound(currentStock * product.salePrice);
      const potentialProfit = safeFinancialSubtract(saleValue, totalValue);

      // Batch-level valuation breakdown
      const productBatches = batches.filter(b => b.productId === product.id);
      const batchValuation = productBatches.map(batch => ({
        batchId: batch.id,
        batchCode: batch.batchCode,
        onHand: batch.quantityOnHand,
        costPerUnit: batch.costPricePerUnit,
        batchValue: safeFinancialRound(batch.quantityOnHand * batch.costPricePerUnit),
        status: batch.status,
        expiryDate: batch.expiryDate,
      }));

      productValuations.push({
        productId: product.id,
        productName: product.name,
        productCode: product.productCode,
        category: product.category?.name || 'Uncategorized',
        brand: product.brand?.name || null,
        godown: product.godown?.name || 'Unassigned',
        currentStock,
        valuationPerUnit,
        totalValue,
        saleValue,
        potentialProfit,
        costPrice: product.costPrice,
        salePrice: product.salePrice,
        wholesalePrice: product.wholesalePrice,
        method,
        batches: batchValuation,
      });
    }

    // Compute aggregates
    let totalInventoryValue = 0;
    let totalSaleValue = 0;
    let totalPotentialProfit = 0;
    let outOfStockCount = 0;
    let lowStockCount = 0;

    for (const pv of productValuations) {
      totalInventoryValue = safeFinancialAdd(totalInventoryValue, pv.totalValue);
      totalSaleValue = safeFinancialAdd(totalSaleValue, pv.saleValue);
      totalPotentialProfit = safeFinancialAdd(totalPotentialProfit, pv.potentialProfit);

      if (pv.currentStock <= 0) outOfStockCount++;
      else {
        // Find product's reorder level
        const product = products.find(p => p.id === pv.productId);
        if (product && pv.currentStock <= product.reorderLevel) {
          lowStockCount++;
        }
      }
    }

    const response = {
      method,
      asOfDate: asOfDate.toISOString(),
      filters: {
        godownId: godownId || null,
        categoryId: categoryId || null,
        asOfDate: asOfDateStr || null,
      },
      aggregates: {
        totalInventoryValue,
        totalSaleValue,
        totalPotentialProfit,
        totalProducts: productValuations.length,
        outOfStockCount,
        lowStockCount,
      },
      products: productValuations,
    };

    // Apply VAT Auditor masking for all monetary fields
    const role = security.user.role;
    if (role === 'vat_auditor') {
      const monetaryFields = [
        'valuationPerUnit', 'totalValue', 'saleValue', 'potentialProfit',
        'costPrice', 'salePrice', 'wholesalePrice', 'batchValue', 'costPerUnit',
      ];

      // Mask nested aggregates object
      if (response.aggregates && typeof response.aggregates === 'object') {
        response.aggregates = maskForVatAuditor(
          response.aggregates as Record<string, unknown>,
          role,
          ['totalInventoryValue', 'totalSaleValue', 'totalPotentialProfit']
        );
      }

      // Mask top-level (in case any are added in future)
      const maskedResponse = maskForVatAuditor(
        response as Record<string, unknown>,
        role,
        ['totalInventoryValue', 'totalSaleValue', 'totalPotentialProfit']
      );

      // Mask products array
      if (Array.isArray(maskedResponse.products)) {
        maskedResponse.products = (maskedResponse.products as Record<string, unknown>[]).map(p => {
          let masked = maskForVatAuditor(p, role, monetaryFields);
          // Mask nested batches
          if (Array.isArray(masked.batches)) {
            masked = {
              ...masked,
              batches: (masked.batches as Record<string, unknown>[]).map(b =>
                maskForVatAuditor(b, role, ['batchValue', 'costPerUnit'])
              ),
            };
          }
          return masked;
        });
      }

      return NextResponse.json({ ...maskedResponse, vatAuditMode: true });
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('[Valuation] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to compute inventory valuation' },
      { status: 500 }
    );
  }
}
