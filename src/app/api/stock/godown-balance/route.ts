import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity, maskForVatAuditor, UserRole } from '@/lib/api-security';

// GET /api/stock/godown-balance?productId=xxx&godownId=yyy
// Returns the current available stock for a specific product at a specific godown
// Used by frontend for real-time balance display during transfer form
// MULTI-TENANT ISOLATED (filter by companyId)
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'StockTransfers', 'GET');
  if (!security.authorized) return security.response;

  // RBAC GATE: Dealer — blocked from stock transfer balance data
  if (security.user.role === 'dealer') {
    return NextResponse.json({ error: 'Access denied. Dealers cannot access godown balance data.' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId');
    const godownId = searchParams.get('godownId');
    const companyId = security.user.companyId;
    const role = security.user.role as UserRole;

    if (!productId || !godownId) {
      return NextResponse.json(
        { error: 'Both productId and godownId query parameters are required' },
        { status: 400 }
      );
    }

    // CROSS-TENANT SAFETY: Verify the godown belongs to the user's company
    if (companyId) {
      const godown = await db.godown.findFirst({
        where: { id: godownId, companyId },
        select: { id: true, name: true },
      });
      if (!godown) {
        return NextResponse.json(
          { error: 'Godown not found or does not belong to your company.' },
          { status: 404 }
        );
      }
    }

    // CROSS-TENANT SAFETY: Verify the product belongs to the user's company
    if (companyId) {
      const product = await db.product.findFirst({
        where: { id: productId, companyId },
        select: { id: true },
      });
      if (!product) {
        return NextResponse.json(
          { error: 'Product not found or does not belong to your company.' },
          { status: 404 }
        );
      }
    }

    // Query stock entries for this product at the specific godown
    const stockInWhere: Record<string, unknown> = { productId, godownId, type: 'IN' };
    const stockOutWhere: Record<string, unknown> = { productId, godownId, type: 'OUT' };
    if (companyId) {
      stockInWhere.companyId = companyId;
      stockOutWhere.companyId = companyId;
    }

    const [stockIns, stockOuts, product, godown] = await Promise.all([
      db.stockEntry.findMany({
        where: stockInWhere,
        select: { quantity: true },
      }),
      db.stockEntry.findMany({
        where: stockOutWhere,
        select: { quantity: true },
      }),
      db.product.findUnique({
        where: { id: productId },
        select: { name: true, productCode: true, costPrice: true, openingStock: true },
      }),
      db.godown.findUnique({
        where: { id: godownId },
        select: { name: true },
      }),
    ]);

    const totalIn = stockIns.reduce((sum, entry) => sum + entry.quantity, 0);
    const totalOut = stockOuts.reduce((sum, entry) => sum + entry.quantity, 0);
    const stockMovements = totalIn - totalOut;
    const openingStock = product?.openingStock || 0;
    const availableStock = openingStock + stockMovements;

    // Build the result
    const result: Record<string, unknown> = {
      productId,
      godownId,
      godownName: godown?.name || 'Unknown',
      availableStock: Math.round(availableStock * 100) / 100, // Round to 2 decimal places
      product: product ? {
        name: product.name,
        productCode: product.productCode,
        costPrice: product.costPrice,
      } : null,
    };

    // VAT AUDITOR MASKING: Mask costPrice for VAT auditor role
    if (role === 'vat_auditor' && result.product) {
      result.product = maskForVatAuditor(
        result.product as Record<string, unknown>,
        role,
        ['costPrice']
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching godown balance:', error);
    return NextResponse.json(
      { error: 'Failed to fetch godown balance' },
      { status: 500 }
    );
  }
}
