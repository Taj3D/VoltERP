import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity, safeFinancialRound } from '@/lib/api-security';

// ============================================================
// GET /api/order-sheets/stock-check
// Real-time stock availability check for the frontend
// ============================================================

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'OrderSheets', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId');
    const godownId = searchParams.get('godownId');
    const requestedQuantityStr = searchParams.get('requestedQuantity');

    // productId is required
    if (!productId) {
      return NextResponse.json(
        { error: 'productId query parameter is required' },
        { status: 400 }
      );
    }

    // Look up product
    const product = await db.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        name: true,
        productCode: true,
        openingStock: true,
        isActive: true,
      },
    });

    if (!product || !product.isActive) {
      return NextResponse.json(
        {
          productId,
          productName: 'Unknown Product',
          currentStock: 0,
          requestedQuantity: requestedQuantityStr
            ? parseFloat(requestedQuantityStr)
            : undefined,
          available: false,
          deficit: requestedQuantityStr
            ? parseFloat(requestedQuantityStr)
            : 0,
          stockStatus: 'Insufficient',
        },
        { status: 200 }
      );
    }

    // Calculate current stock from StockEntry model
    const stockWhere: any = { productId };
    if (godownId) {
      stockWhere.godownId = godownId;
    }

    const stockEntries = await db.stockEntry.findMany({
      where: stockWhere,
    });

    const currentStock =
      product.openingStock +
      stockEntries.reduce(
        (sum, e) => sum + (e.type === 'IN' ? e.quantity : -e.quantity),
        0
      );

    // Determine stock status based on requested quantity
    const requestedQuantity = requestedQuantityStr
      ? parseFloat(requestedQuantityStr)
      : undefined;

    let stockStatus: string;
    let available: boolean;
    let deficit: number;

    if (requestedQuantity !== undefined && !isNaN(requestedQuantity)) {
      if (currentStock >= requestedQuantity) {
        stockStatus = 'Available';
        available = true;
        deficit = 0;
      } else if (currentStock > 0) {
        stockStatus = 'Partial';
        available = false;
        deficit = safeFinancialRound(requestedQuantity - currentStock);
      } else {
        stockStatus = 'Insufficient';
        available = false;
        deficit = safeFinancialRound(requestedQuantity);
      }
    } else {
      // No requested quantity — just report current stock status
      stockStatus = currentStock > 0 ? 'Available' : 'Insufficient';
      available = currentStock > 0;
      deficit = 0;
    }

    return NextResponse.json({
      productId: product.id,
      productName: product.name,
      productCode: product.productCode,
      currentStock: safeFinancialRound(currentStock),
      requestedQuantity: requestedQuantity !== undefined && !isNaN(requestedQuantity)
        ? safeFinancialRound(requestedQuantity)
        : undefined,
      available,
      deficit: safeFinancialRound(deficit),
      stockStatus,
      godownId: godownId || null,
    });
  } catch (error) {
    console.error('[OrderSheets] Stock check error:', error);
    return NextResponse.json(
      { error: 'Failed to check stock availability' },
      { status: 500 }
    );
  }
}
