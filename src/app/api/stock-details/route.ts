import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity, maskForVatAuditor } from '@/lib/api-security';

// GET /api/stock-details?productId=xxx - Return 7-source historical stock movement trails for a specific product
// Query params: productId (required), from, to (optional date range)
//
// The 7 sources are:
// 1. PurchaseOrder (type=IN)
// 2. SalesOrder (type=OUT)
// 3. HireSales (type=OUT)
// 4. SalesReturn (type=IN)
// 5. PurchaseReturn (type=OUT)
// 6. ReplacementOrder (type=OUT - defective item removed)
// 7. Transfer (type=OUT from source, type=IN to destination)

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Stock', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const role = security.user?.role;

    // If no productId, return summary of all products with stock info
    if (!productId) {
      const products = await db.product.findMany({
        include: {
          category: true,
          godown: true,
        },
        where: { isActive: true },
      });

      const stockEntries = await db.stockEntry.findMany({
        select: {
          productId: true,
          type: true,
          quantity: true,
        },
      });

      const stockMap = new Map<string, number>();
      for (const entry of stockEntries) {
        const current = stockMap.get(entry.productId) || 0;
        if (entry.type === 'IN') {
          stockMap.set(entry.productId, current + entry.quantity);
        } else if (entry.type === 'OUT') {
          stockMap.set(entry.productId, current - entry.quantity);
        }
      }

      const summary = products.map((product) => {
        const stockMovements = stockMap.get(product.id) || 0;
        const currentStock = product.openingStock + stockMovements;
        const stockValue = currentStock * product.costPrice;
        return maskForVatAuditor({
          productId: product.id,
          productName: product.name,
          productCode: product.productCode,
          category: product.category?.name || 'Uncategorized',
          godown: product.godown?.name || 'Unassigned',
          currentStock,
          reorderLevel: product.reorderLevel,
          costPrice: product.costPrice,
          salePrice: product.salePrice,
          stockValue,
        }, role, ['costPrice', 'salePrice', 'stockValue']);
      });

      return NextResponse.json({ products: summary });
    }

    // productId provided — return detailed 7-source movement trail

    // Get product details
    const product = await db.product.findUnique({
      where: { id: productId },
      include: {
        category: true,
        godown: true,
      },
    });

    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    // Build date filter
    const dateFilter: Record<string, unknown> = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(new Date(to).setHours(23, 59, 59, 999));

    const whereClause: Record<string, unknown> = { productId };
    if (from || to) whereClause.date = dateFilter;

    // Fetch all stock entries for this product with date range
    const stockEntries = await db.stockEntry.findMany({
      where: whereClause,
      orderBy: { date: 'desc' },
    });

    // Group entries by referenceType for the 7-source breakdown
    const SOURCE_LABELS: Record<string, string> = {
      PurchaseOrder: 'Purchase Order',
      SalesOrder: 'Sales Order',
      HireSales: 'Hire Sales',
      SalesReturn: 'Sales Return',
      PurchaseReturn: 'Purchase Return',
      ReplacementOrder: 'Replacement Order',
      Transfer: 'Transfer',
    };

    // Source type movement mapping
    const SOURCE_TYPE_MAP: Record<string, string> = {
      PurchaseOrder: 'IN',
      SalesOrder: 'OUT',
      HireSales: 'OUT',
      SalesReturn: 'IN',
      PurchaseReturn: 'OUT',
      ReplacementOrder: 'OUT',
      Transfer: 'TRANSFER',
    };

    // Group entries by referenceType
    const movementBySource: Record<string, { entries: typeof stockEntries; count: number; totalQty: number }> = {};
    for (const entry of stockEntries) {
      const refType = entry.referenceType || 'Unknown';
      if (!movementBySource[refType]) {
        movementBySource[refType] = { entries: [], count: 0, totalQty: 0 };
      }
      movementBySource[refType].entries.push(entry);
      movementBySource[refType].count += 1;
      movementBySource[refType].totalQty += entry.quantity;
    }

    // Calculate summary stats
    let totalIn = 0;
    let totalOut = 0;

    for (const entry of stockEntries) {
      if (entry.type === 'IN') {
        totalIn += entry.quantity;
      } else if (entry.type === 'OUT') {
        totalOut += entry.quantity;
      }
      // Transfer entries: we count them in their respective direction
      // Transfer OUT from source godown, Transfer IN to destination godown
    }

    // Compute current balance for this product (using ALL stock entries, not just date-filtered)
    const allStockEntries = await db.stockEntry.findMany({
      where: { productId },
      select: { type: true, quantity: true },
    });

    let currentBalance = product.openingStock;
    for (const entry of allStockEntries) {
      if (entry.type === 'IN') {
        currentBalance += entry.quantity;
      } else if (entry.type === 'OUT') {
        currentBalance -= entry.quantity;
      }
    }

    // Calculate running balance for the entries (sorted by date desc)
    // We need to calculate from the beginning to get accurate running balance
    // First get all entries sorted by date ASC to compute running balances
    const allEntriesAsc = await db.stockEntry.findMany({
      where: { productId },
      orderBy: { date: 'asc' },
      select: {
        id: true,
        type: true,
        quantity: true,
        date: true,
      },
    });

    // Build running balance map
    const runningBalanceMap = new Map<string, number>();
    let runningBal = product.openingStock;
    for (const entry of allEntriesAsc) {
      if (entry.type === 'IN') {
        runningBal += entry.quantity;
      } else if (entry.type === 'OUT') {
        runningBal -= entry.quantity;
      }
      runningBalanceMap.set(entry.id, runningBal);
    }

    // Enrich stock entries with running balance and source label
    const enrichedEntries = stockEntries.map((entry) => ({
      id: entry.id,
      date: entry.date,
      type: entry.type,
      quantity: entry.quantity,
      reference: entry.reference,
      referenceType: entry.referenceType,
      sourceLabel: SOURCE_LABELS[entry.referenceType || ''] || entry.referenceType || 'Manual',
      expectedDirection: SOURCE_TYPE_MAP[entry.referenceType || ''] || null,
      godownId: entry.godownId,
      notes: entry.notes,
      runningBalance: runningBalanceMap.get(entry.id) ?? null,
      costPrice: product.costPrice,
      lineValue: entry.quantity * product.costPrice,
    }));

    // Movement count by source type
    const movementCountBySource: Record<string, { label: string; count: number; totalQty: number; direction: string }> = {};
    for (const [source, data] of Object.entries(movementBySource)) {
      movementCountBySource[source] = {
        label: SOURCE_LABELS[source] || source,
        count: data.count,
        totalQty: data.totalQty,
        direction: SOURCE_TYPE_MAP[source] || 'Unknown',
      };
    }

    // Build the response with centralized VAT masking
    const productInfo = maskForVatAuditor({
      id: product.id,
      name: product.name,
      productCode: product.productCode,
      category: product.category?.name || 'Uncategorized',
      godown: product.godown?.name || 'Unassigned',
      costPrice: product.costPrice,
      salePrice: product.salePrice,
      openingStock: product.openingStock,
      reorderLevel: product.reorderLevel,
    }, role, ['costPrice', 'salePrice']);

    const maskedEntries = enrichedEntries.map((entry) =>
      maskForVatAuditor(entry, role, ['costPrice', 'lineValue'])
    );

    const response = {
      product: productInfo,
      entries: maskedEntries,
      summary: {
        totalIn,
        totalOut,
        currentBalance,
        openingStock: product.openingStock,
        movementCountBySource,
        dateRange: {
          from: from || null,
          to: to || null,
        },
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching stock details:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stock details' },
      { status: 500 }
    );
  }
}
