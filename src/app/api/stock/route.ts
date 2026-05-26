import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity } from '@/lib/api-security';

// GET /api/stock - Calculate current stock for each product
// Query params: godownId, categoryId, status (In Stock, Low Stock, Out of Stock)
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Stock', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const godownId = searchParams.get('godownId');
    const categoryId = searchParams.get('categoryId');
    const statusFilter = searchParams.get('status'); // "In Stock", "Low Stock", "Out of Stock"

    const isVatAuditor = security.user?.role === 'vat_auditor';

    // Build product filter
    const productWhere: Record<string, unknown> = { isActive: true };
    if (godownId) productWhere.godownId = godownId;
    if (categoryId) productWhere.categoryId = categoryId;

    // Get all products with their category and godown info
    const products = await db.product.findMany({
      include: {
        category: true,
        godown: true,
      },
      where: productWhere,
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

    // Helper to determine stock status
    const getStockStatus = (currentStock: number, reorderLevel: number): string => {
      if (currentStock <= 0) return 'Out of Stock';
      if (currentStock <= reorderLevel) return 'Low Stock';
      return 'In Stock';
    };

    // Build the result array with stockStatus
    let stockReport = products.map((product) => {
      const stockMovements = stockMap.get(product.id) || 0;
      const currentStock = product.openingStock + stockMovements;
      const stockValue = currentStock * product.costPrice;
      const stockStatus = getStockStatus(currentStock, product.reorderLevel);

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
        costPrice: isVatAuditor ? 'N/A (Audit Mode)' : product.costPrice,
        salePrice: isVatAuditor ? 'N/A (Audit Mode)' : product.salePrice,
        stockValue: isVatAuditor ? 'N/A (Audit Mode)' : stockValue,
      };
    });

    // Filter by status if provided
    if (statusFilter) {
      stockReport = stockReport.filter((item) => item.stockStatus === statusFilter);
    }

    return NextResponse.json(stockReport);
  } catch (error) {
    console.error('Error calculating stock:', error);
    return NextResponse.json(
      { error: 'Failed to calculate stock' },
      { status: 500 }
    );
  }
}
