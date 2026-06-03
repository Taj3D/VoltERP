import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, checkPeriodClose, maskForVatAuditor } from '@/lib/api-security';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Assets', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const item = await db.asset.findUnique({
      where: { id },
      include: { investmentHead: true },
    });
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const masked = maskForVatAuditor(item, security.user.role, ['amount']);
    return NextResponse.json(masked);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Assets', 'PUT');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const body = await request.json();

    // Period close check
    if (body.date) {
      const periodLock = await checkPeriodClose(body.date);
      if (periodLock) return periodLock;
    }

    const item = await db.$transaction(async (tx) => {
      // If purchaseValue changes, recalculate netBookValue
      const existingAsset = await tx.asset.findUnique({ where: { id } });
      const purchaseValue = body.purchaseValue !== undefined ? Number(body.purchaseValue) : (existingAsset?.purchaseValue ?? 0);
      const salvageValue = body.salvageValue !== undefined ? Number(body.salvageValue) : (existingAsset?.salvageValue ?? 0);
      const usefulLifeMonths = body.usefulLifeMonths !== undefined ? Number(body.usefulLifeMonths) : (existingAsset?.usefulLifeMonths ?? 0);
      const accumulatedDepreciation = existingAsset?.accumulatedDepreciation ?? 0;
      const netBookValue = purchaseValue - accumulatedDepreciation;

      const record = await tx.asset.update({
        where: { id },
        data: {
          investmentHeadId: body.investmentHeadId,
          date: body.date ? new Date(body.date) : new Date(),
          amount: body.amount,
          assetCategory: body.assetCategory || undefined,
          purchaseValue: body.purchaseValue !== undefined ? purchaseValue : undefined,
          salvageValue: body.salvageValue !== undefined ? salvageValue : undefined,
          usefulLifeMonths: body.usefulLifeMonths !== undefined ? usefulLifeMonths : undefined,
          netBookValue: body.purchaseValue !== undefined ? netBookValue : undefined,
          companyId: body.companyId !== undefined ? (body.companyId || null) : undefined,
          description: body.description || null,
          isActive: body.isActive ?? true,
        },
        include: { investmentHead: true },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'Assets',
          recordId: record.id,
          recordLabel: `${record.investmentHead?.name || record.id} - ৳${record.amount}`,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({ investmentHeadId: record.investmentHeadId, amount: record.amount, category: record.assetCategory }),
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
  const security = await withApiSecurity(request, 'Assets', 'DELETE');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    await db.$transaction(async (tx) => {
      const record = await tx.asset.findUnique({
        where: { id },
        include: { investmentHead: true },
      });
      if (!record) throw new Error('Not found');

      await tx.asset.update({
        where: { id },
        data: { isActive: false },
      });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'Assets',
          recordId: record.id,
          recordLabel: `${record.investmentHead?.name || record.id} - ৳${record.amount}`,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({ investmentHeadId: record.investmentHeadId, amount: record.amount, softDelete: true }),
        },
      });

      return record;
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
