import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity } from '@/lib/api-security';

// GET /api/auto-po - Find products below reorder level and suggest PO quantities
// Formula: Suggested PO = Avg Daily Sales × Lead Time Days - Current Stock + Safety Stock
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'AutoPO', 'GET');
  if (!security.authorized) return security.response;

  // Dealer: completely blocked from auto PO
  if (security.user?.role === 'dealer') {
    return NextResponse.json({ error: 'Access denied. Dealers cannot access auto PO suggestions.' }, { status: 403 });
  }

  // SR: completely blocked from auto PO
  if (security.user?.role === 'sr') {
    return NextResponse.json({ error: 'Access denied. SRs cannot access auto PO suggestions.' }, { status: 403 });
  }

  try {
    const isVatAuditor = security.user?.role === 'vat_auditor';

    // Get all active products with related info
    const products = await db.product.findMany({
      include: {
        category: true,
        godown: true,
        company: true,
      },
      where: { isActive: true },
    });

    // Get all stock entries to compute current stock per product
    const stockEntries = await db.stockEntry.findMany({
      select: {
        productId: true,
        type: true,
        quantity: true,
      },
    });

    // Build stock map (current stock = openingStock + IN entries - OUT entries)
    const stockMap = new Map<string, number>();
    for (const entry of stockEntries) {
      const current = stockMap.get(entry.productId) || 0;
      if (entry.type === 'IN') {
        stockMap.set(entry.productId, current + entry.quantity);
      } else if (entry.type === 'OUT') {
        stockMap.set(entry.productId, current - entry.quantity);
      }
    }

    // Calculate average daily sales per product over the last 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

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
      const current = salesMap.get(entry.productId) || 0;
      salesMap.set(entry.productId, current + entry.quantity);
    }

    // Parameters for the formula
    const leadTimeDays = 14; // 2 weeks default lead time
    const DAYS_FOR_AVG = 90;

    // Calculate suggested PO for ALL products (not just those below reorder level)
    // Then filter to only show those with suggestedQuantity > 0 or below reorder level
    const autoPOItems = products
      .map((product) => {
        const stockMovements = stockMap.get(product.id) || 0;
        const currentStock = product.openingStock + stockMovements;
        const totalSoldLast90Days = salesMap.get(product.id) || 0;
        const avgDailySales = totalSoldLast90Days / DAYS_FOR_AVG;

        // Safety stock = reorder level (as per specification)
        const safetyStock = product.reorderLevel;

        // Suggested PO = ceil(avgDailySales * leadTimeDays - currentStock + safetyStock)
        const rawSuggestedPO = avgDailySales * leadTimeDays - currentStock + safetyStock;
        const suggestedQuantity = rawSuggestedPO > 0 ? Math.ceil(rawSuggestedPO) : 0;

        return {
          productId: product.id,
          productCode: product.productCode,
          productName: product.name,
          category: product.category?.name || 'Uncategorized',
          godown: product.godown?.name || 'Unassigned',
          currentStock,
          reorderLevel: product.reorderLevel,
          avgDailySales: Math.round(avgDailySales * 100) / 100, // 2 decimal places
          leadTimeDays,
          safetyStock,
          suggestedQuantity,
          costPrice: isVatAuditor ? 'N/A (Audit Mode)' : product.costPrice,
          estimatedCost: isVatAuditor ? 'N/A (Audit Mode)' : Math.max(suggestedQuantity, 0) * product.costPrice,
        };
      })
      // Show products that need PO (suggested > 0) or are below reorder level
      .filter((item) => item.suggestedQuantity > 0 || item.currentStock <= item.reorderLevel);

    return NextResponse.json(autoPOItems);
  } catch (error) {
    console.error('Error generating auto PO suggestions:', error);
    return NextResponse.json(
      { error: 'Failed to generate auto PO suggestions' },
      { status: 500 }
    );
  }
}
