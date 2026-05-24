import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const item = await db.product.findUnique({
      where: { id },
      include: {
        category: true,
        color: true,
        godown: true,
        segment: true,
        company: true,
      },
    });
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch product' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const item = await db.$transaction(async (tx) => {
      return tx.product.update({
        where: { id },
        data: {
          productCode: body.productCode,
          name: body.name,
          categoryId: body.categoryId,
          colorId: body.colorId || null,
          unit: body.unit || null,
          sizeCapacity: body.sizeCapacity || null,
          costPrice: body.costPrice ?? 0,
          salePrice: body.salePrice ?? 0,
          openingStock: body.openingStock ?? 0,
          reorderLevel: body.reorderLevel ?? 0,
          godownId: body.godownId || null,
          segmentId: body.segmentId || null,
          companyId: body.companyId || null,
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
    });
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await db.$transaction(async (tx) => {
      await tx.product.delete({ where: { id } });
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 });
  }
}
