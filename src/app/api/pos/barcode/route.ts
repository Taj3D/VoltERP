import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
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
        productStocks: {
          where: { isActive: true },
          include: { godown: { select: { id: true, name: true } } },
        },
      },
    });

    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });

    // Format stock info
    const stockInfo = product.productStocks.map(ps => ({
      godownId: ps.godownId,
      godownName: ps.godown.name,
      quantity: ps.quantity,
      costPrice: ps.costPrice,
    }));

    return NextResponse.json({
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
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Barcode lookup failed' }, { status: 500 });
  }
}
