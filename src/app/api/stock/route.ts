import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity } from '@/lib/api-security';

// GET /api/stock - Calculate current stock for each product
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Stock', 'GET');
  if (!security.authorized) return security.response;
  try {
    // Get all products with their category and godown info
    const products = await db.product.findMany({
      include: {
        category: true,
        godown: true,
      },
      where: { isActive: true },
    });

    // Get all stock entries grouped by product
    const stockEntries = await db.stockEntry.findMany({
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
        stockMap.set(entry.productId, current + entry.quantity);
      } else if (entry.type === 'OUT') {
        stockMap.set(entry.productId, current - entry.quantity);
      }
    }

    // Build the result array
    const stockReport = products.map((product) => {
      const stockMovements = stockMap.get(product.id) || 0;
      const currentStock = product.openingStock + stockMovements;
      const stockValue = currentStock * product.costPrice;

      return {
        productId: product.id,
        productName: product.name,
        category: product.category?.name || 'Uncategorized',
        godown: product.godown?.name || 'Unassigned',
        currentStock,
        costPrice: product.costPrice,
        salePrice: product.salePrice,
        stockValue,
      };
    });

    return NextResponse.json(stockReport);
  } catch (error) {
    console.error('Error calculating stock:', error);
    return NextResponse.json(
      { error: 'Failed to calculate stock' },
      { status: 500 }
    );
  }
}
