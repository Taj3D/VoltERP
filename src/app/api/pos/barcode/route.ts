import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity, maskForVatAuditor } from '@/lib/api-security';

export async function GET(req: NextRequest) {
  const security = await withApiSecurity(req, 'Products', 'GET');
  if (!security.authorized) return security.response;

  const role = security.user.role;

  try {
    const code = req.nextUrl.searchParams.get('code');
    if (!code) return NextResponse.json({ error: 'Barcode code is required' }, { status: 400 });

    // Find product by productCode or IMEI
    const product = await db.product.findFirst({
      where: {
        OR: [
          { productCode: code },
          { imeiNumber: code },
        ],
        isActive: true,
      },
      include: {
        category: { select: { name: true } },
        brand: { select: { name: true } },
        stockEntries: {
          where: { isActive: true },
          take: 50,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });

    // Get godown names for stock entries
    const godownIds = [...new Set(product.stockEntries.map(se => se.godownId).filter(Boolean) as string[])];
    const godowns = await db.godown.findMany({
      where: { id: { in: godownIds } },
      select: { id: true, name: true },
    });
    const godownMap = new Map(godowns.map(g => [g.id, g.name]));

    // Format stock info from stockEntries - aggregate by godown
    const stockMap = new Map<string, { godownId: string; godownName: string; quantity: number; costPrice: number }>();
    for (const se of product.stockEntries) {
      const key = se.godownId || 'unknown';
      const existing = stockMap.get(key);
      if (existing) {
        if (se.type === 'IN') existing.quantity += se.quantity;
        else if (se.type === 'OUT') existing.quantity -= se.quantity;
      } else {
        stockMap.set(key, {
          godownId: se.godownId || 'unknown',
          godownName: godownMap.get(se.godownId || '') || 'Unknown',
          quantity: se.type === 'OUT' ? -se.quantity : se.quantity,
          costPrice: se.costPrice,
        });
      }
    }
    const stockInfo = Array.from(stockMap.values()).filter(s => s.quantity > 0);

    const responseData: Record<string, unknown> = {
      id: product.id,
      productCode: product.productCode,
      name: product.name,
      salePrice: product.salePrice,
      costPrice: product.costPrice,
      wholesalePrice: product.wholesalePrice,
      dealerPrice: product.dealerPrice,
      unit: product.unit,
      imeiNumber: product.imeiNumber,
      category: product.category?.name,
      brand: product.brand?.name,
      image: product.image,
      companyId: product.companyId,
      stocks: stockInfo,
    };

    // Mask sensitive prices for non-admin/non-manager roles
    // For SR/Dealer roles, remove costPrice and wholesalePrice from response
    if (role !== 'admin' && role !== 'manager') {
      // Apply VAT Auditor / role-based masking for sensitive price fields
      const masked = maskForVatAuditor(
        responseData,
        role,
        ['costPrice', 'wholesalePrice', 'dealerPrice'],
        {
          costPrice: ['sr', 'dealer', 'vat_auditor'],
          wholesalePrice: ['sr', 'dealer', 'vat_auditor'],
          dealerPrice: ['sr', 'vat_auditor'],
        }
      );
      // Also mask costPrice in stock entries
      if (Array.isArray(masked.stocks)) {
        masked.stocks = (masked.stocks as Record<string, unknown>[]).map((stock) =>
          maskForVatAuditor(
            stock,
            role,
            ['costPrice'],
            { costPrice: ['sr', 'dealer', 'vat_auditor'] }
          )
        );
      }
      return NextResponse.json(masked);
    }

    return NextResponse.json(responseData);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Barcode lookup failed' }, { status: 500 });
  }
}
