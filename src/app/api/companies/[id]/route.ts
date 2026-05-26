import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Companies', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const item = await db.company.findUnique({
      where: { id },
      include: {
        _count: { select: { products: true, orderSheets: true } },
      },
    });
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Companies', 'PUT');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const body = await request.json();
    const item = await db.$transaction(async (tx) => {
      const record = await tx.company.update({
        where: { id },
        data: {
          name: body.name,
          address: body.address !== undefined ? (body.address || null) : undefined,
          phone: body.phone !== undefined ? (body.phone || null) : undefined,
          email: body.email !== undefined ? (body.email || null) : undefined,
          isActive: body.isActive !== undefined ? body.isActive : undefined,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'Companies',
          recordId: record.id,
          recordLabel: record.name || record.code || record.id,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ code: record.code, name: record.name }),
        },
      });

      return record;
    });
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Companies', 'DELETE');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const result = await db.$transaction(async (tx) => {
      const record = await tx.company.findUnique({ where: { id } });
      if (!record) throw new Error('Not found');

      // FK check: Check if company is referenced by active products or order sheets
      const [activeProducts, activeOrderSheets] = await Promise.all([
        tx.product.count({ where: { companyId: id, isActive: true } }),
        tx.orderSheet.count({ where: { companyId: id, isActive: true } }),
      ]);

      if (activeProducts > 0 || activeOrderSheets > 0) {
        throw new Error(
          `Cannot delete: Company is referenced by ${activeProducts} active product(s) and ${activeOrderSheets} active order sheet(s)`
        );
      }

      await tx.company.update({
        where: { id },
        data: { isActive: false },
      });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'Companies',
          recordId: record.id,
          recordLabel: record.name || record.code || record.id,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ code: record.code, name: record.name, softDelete: true }),
        },
      });

      return record;
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.message?.startsWith('Cannot delete')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
