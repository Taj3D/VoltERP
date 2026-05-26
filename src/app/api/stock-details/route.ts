import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity } from '@/lib/api-security';

// GET /api/stock-details?productId=xxx - Return all StockEntry records for a product
// GET /api/stock-details - Return all products with stock summaries
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Stock', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId');
    const type = searchParams.get('type'); // IN, OUT, TRANSFER filter
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const skip = (page - 1) * limit;

    if (productId) {
      // Get product details with stock entries
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

      const whereClause: any = { productId };
      if (type) whereClause.type = type;

      const stockEntries = await db.stockEntry.findMany({
        where: whereClause,
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      });

      const total = await db.stockEntry.count({ where: whereClause });

      return NextResponse.json({
        product: {
          id: product.id,
          name: product.name,
          productCode: product.productCode,
          category: product.category,
          godown: product.godown,
          costPrice: product.costPrice,
          salePrice: product.salePrice,
          openingStock: product.openingStock,
          reorderLevel: product.reorderLevel,
        },
        entries: stockEntries,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    }

    // No productId - return all stock entries with product info
    const whereClause: any = {};
    if (type) whereClause.type = type;

    const stockEntries = await db.stockEntry.findMany({
      where: whereClause,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            productCode: true,
            category: { select: { id: true, name: true } },
            godown: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { date: 'desc' },
      skip,
      take: limit,
    });

    const total = await db.stockEntry.count({ where: whereClause });

    // Compute summary stats
    const inTotal = await db.stockEntry.aggregate({
      _sum: { quantity: true },
      where: { type: 'IN' },
    });
    const outTotal = await db.stockEntry.aggregate({
      _sum: { quantity: true },
      where: { type: 'OUT' },
    });
    const transferTotal = await db.stockEntry.aggregate({
      _sum: { quantity: true },
      where: { type: 'TRANSFER' },
    });

    return NextResponse.json({
      entries: stockEntries,
      summary: {
        totalIn: inTotal._sum.quantity || 0,
        totalOut: outTotal._sum.quantity || 0,
        totalTransfer: transferTotal._sum.quantity || 0,
      },
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Error fetching stock details:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stock details' },
      { status: 500 }
    );
  }
}
