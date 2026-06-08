import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, validateImageFields } from '@/lib/api-security';

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
    const imgError = validateImageFields(body, ['logo', 'brandLogo']);
    if (imgError) return NextResponse.json({ error: imgError }, { status: 400 });
    const item = await db.$transaction(async (tx) => {
      const record = await tx.company.update({
        where: { id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.address !== undefined && { address: body.address || null }),
          ...(body.phone !== undefined && { phone: body.phone || null }),
          ...(body.email !== undefined && { email: body.email || null }),
          ...(body.logo !== undefined && { logo: body.logo || null }),
          ...(body.brandLogo !== undefined && { brandLogo: body.brandLogo || null }),
          ...(body.mobile !== undefined && { mobile: body.mobile || null }),
          ...(body.website !== undefined && { website: body.website || null }),
          ...(body.vatNumber !== undefined && { vatNumber: body.vatNumber || null }),
          ...(body.tradeLicense !== undefined && { tradeLicense: body.tradeLicense || null }),
          ...(body.invoicePrefix !== undefined && { invoicePrefix: body.invoicePrefix || null }),
          ...(body.thankYouMsg !== undefined && { thankYouMsg: body.thankYouMsg || null }),
          ...(body.systemNote !== undefined && { systemNote: body.systemNote || null }),
          ...(body.showBarcode !== undefined && { showBarcode: body.showBarcode }),
          ...(body.showPayInWord !== undefined && { showPayInWord: body.showPayInWord }),
          ...(body.logoWidth !== undefined && { logoWidth: parseFloat(String(body.logoWidth)) || 30 }),
          ...(body.logoHeight !== undefined && { logoHeight: parseFloat(String(body.logoHeight)) || 20 }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
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
    if (error?.message === 'Not found') {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }
    if (error?.message?.startsWith('Cannot delete')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error?.code === 'P2025') {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
