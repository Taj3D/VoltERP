import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Products', 'GET');
  if (!security.authorized) return security.response;
  try {
    const items = await db.product.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      include: {
        category: true,
        color: true,
        godown: true,
        segment: true,
        company: true,
      },
    });
    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Products', 'POST');
  if (!security.authorized) return security.response;
  try {
    const body = await request.json();
    const item = await db.$transaction(async (tx) => {
      let productCode = body.productCode;
      if (!productCode) {
        const lastProduct = await tx.product.findFirst({
          orderBy: { createdAt: 'desc' },
          select: { productCode: true },
        });
        let nextNum = 1;
        if (lastProduct?.productCode) {
          const match = lastProduct.productCode.match(/PROD-(\d+)/);
          if (match) nextNum = parseInt(match[1]) + 1;
        }
        productCode = `PROD-${String(nextNum).padStart(3, '0')}`;
      }

      const record = await tx.product.create({
        data: {
          productCode,
          name: body.name,
          categoryId: body.categoryId,
          colorId: body.colorId || null,
          unit: body.unit || null,
          sizeCapacity: body.sizeCapacity || null,
          costPrice: body.costPrice ?? 0,
          salePrice: body.salePrice ?? 0,
          wholesalePrice: body.wholesalePrice ?? 0,
          dealerPrice: body.dealerPrice ?? 0,
          openingStock: body.openingStock ?? 0,
          reorderLevel: body.reorderLevel ?? 0,
          godownId: body.godownId || null,
          segmentId: body.segmentId || null,
          companyId: body.companyId || null,
          imeiNumber: body.imeiNumber || null,
          image: body.image || null,
          isActive: body.isActive ?? true,
        },
        include: {
          category: true,
          color: true,
          godown: true,
          segment: true,
          company: true,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'Products',
          recordId: record.id,
          recordLabel: record.name || record.productCode || record.id,
          userId: 'system',
          userName: 'System',
          details: JSON.stringify({ productCode: record.productCode, name: record.name, categoryId: record.categoryId }),
        },
      });

      return record;
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 });
  }
}
