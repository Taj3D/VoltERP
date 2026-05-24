import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/stock-details?productId=xxx - Return all StockEntry records for a product
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId');

    if (!productId) {
      return NextResponse.json(
        { error: 'productId query parameter is required' },
        { status: 400 }
      );
    }

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

    // Get all stock entries for this product
    const stockEntries = await db.stockEntry.findMany({
      where: { productId },
      orderBy: { date: 'desc' },
    });

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
    });
  } catch (error) {
    console.error('Error fetching stock details:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stock details' },
      { status: 500 }
    );
  }
}
