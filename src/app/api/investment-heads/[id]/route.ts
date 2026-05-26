import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'InvestmentHeads', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const item = await db.investmentHead.findUnique({
      where: { id },
      include: {
        _count: { select: { assets: true, liabilities: true } },
      },
    });
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'InvestmentHeads', 'PUT');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const body = await request.json();
    const item = await db.$transaction(async (tx) => {
      const record = await tx.investmentHead.update({
        where: { id },
        data: {
          name: body.name,
          description: body.description !== undefined ? (body.description || null) : undefined,
          type: body.type,
          openingBalance: body.openingBalance !== undefined ? body.openingBalance : undefined,
          openingType: body.openingType !== undefined ? body.openingType : undefined,
          isActive: body.isActive !== undefined ? body.isActive : undefined,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'InvestmentHeads',
          recordId: record.id,
          recordLabel: record.name || record.code || record.id,
          userId: 'system',
          userName: 'System',
          details: JSON.stringify({ code: record.code, name: record.name, type: record.type }),
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
  const security = await withApiSecurity(request, 'InvestmentHeads', 'DELETE');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    await db.$transaction(async (tx) => {
      const record = await tx.investmentHead.findUnique({ where: { id } });
      if (!record) throw new Error('Not found');

      // FK check: Check if investment head is referenced by active assets or liabilities
      const [activeAssets, activeLiabilities] = await Promise.all([
        tx.asset.count({ where: { investmentHeadId: id, isActive: true } }),
        tx.liability.count({ where: { investmentHeadId: id, isActive: true } }),
      ]);

      if (activeAssets > 0 || activeLiabilities > 0) {
        throw new Error(
          `Cannot delete: Investment Head is referenced by ${activeAssets} active asset(s) and ${activeLiabilities} active liabilit(y/ies)`
        );
      }

      await tx.investmentHead.update({
        where: { id },
        data: { isActive: false },
      });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'InvestmentHeads',
          recordId: record.id,
          recordLabel: record.name || record.code || record.id,
          userId: 'system',
          userName: 'System',
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
