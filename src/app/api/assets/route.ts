import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, checkPeriodClose, maskForVatAuditor } from '@/lib/api-security';

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Assets', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const headType = searchParams.get('headType');

    const where: any = { isActive: true };
    if (category) where.assetCategory = category;
    if (headType) where.investmentHead = { type: headType };

    const items = await db.asset.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { investmentHead: true },
    });

    // VAT Auditor masking
    const masked = items.map(item => maskForVatAuditor(item, security.user.role, ['amount']));
    return NextResponse.json(masked);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch assets' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Assets', 'POST');
  if (!security.authorized) return security.response;
  try {
    const body = await request.json();

    // Validate investmentHeadId
    if (!body.investmentHeadId) {
      return NextResponse.json({ error: 'Investment Head is required' }, { status: 400 });
    }
    
    // Period close check
    if (body.date) {
      const periodLock = await checkPeriodClose(body.date);
      if (periodLock) return periodLock;
    }

    const item = await db.$transaction(async (tx) => {
      const purchaseValue = body.purchaseValue !== undefined ? Number(body.purchaseValue) : Number(body.amount) || 0;
      const salvageValue = body.salvageValue !== undefined ? Number(body.salvageValue) : 0;
      const usefulLifeMonths = body.usefulLifeMonths !== undefined ? Number(body.usefulLifeMonths) : 0;
      const netBookValue = purchaseValue; // Initially, net book value equals purchase value

      const record = await tx.asset.create({
        data: {
          investmentHeadId: body.investmentHeadId,
          date: body.date ? new Date(body.date) : new Date(),
          amount: body.amount,
          assetCategory: body.assetCategory || 'Fixed',
          purchaseValue,
          salvageValue,
          usefulLifeMonths,
          accumulatedDepreciation: 0,
          netBookValue,
          companyId: body.companyId || null,
          description: body.description || null,
          isActive: body.isActive ?? true,
        },
        include: { investmentHead: true },
      });

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'Assets',
          recordId: record.id,
          recordLabel: `${record.investmentHead?.name || record.id} - Tk. ${record.amount}`,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({ investmentHeadId: record.investmentHeadId, amount: record.amount, category: record.assetCategory, purchaseValue, salvageValue, usefulLifeMonths, date: record.date }),
        },
      });

      return record;
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error: any) {
    console.error('[Assets POST] Error:', error?.message, error?.stack);
    return NextResponse.json({ error: 'Failed to create asset', details: error?.message }, { status: 500 });
  }
}
