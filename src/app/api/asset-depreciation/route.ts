import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  safeFinancialRound,
  safeFinancialSubtract,
  maskFinancialArray,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

const AUDIT_MODULE = 'Inv-Asset-Ledger';

const DEPRECIATION_MASKED_FIELDS = [
  'depreciationAmount',
  'accumulatedDepreciation',
  'netBookValue',
];

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Assets', 'GET');
  if (!security.authorized) return security.response;

  try {
    const companyId = security.user.companyId;
    const { searchParams } = new URL(request.url);
    const assetId = searchParams.get('assetId');
    const periodDateFrom = searchParams.get('periodDateFrom');
    const periodDateTo = searchParams.get('periodDateTo');

    const where: Record<string, unknown> = {
      isActive: true,
    };

    // Filter by assetId
    if (assetId) where.assetId = assetId;

    // Filter by period date range
    if (periodDateFrom || periodDateTo) {
      where.periodDate = {
        ...(periodDateFrom ? { gte: new Date(periodDateFrom) } : {}),
        ...(periodDateTo ? { lte: new Date(periodDateTo) } : {}),
      };
    }

    // Filter by companyId via Asset relation
    if (companyId) {
      where.asset = { companyId };
    }

    const items = await db.assetDepreciation.findMany({
      where,
      orderBy: { periodDate: 'desc' },
      include: {
        asset: {
          include: { investmentHead: true },
        },
      },
    });

    // VAT Auditor masking
    const masked = maskFinancialArray(
      items as unknown as Record<string, unknown>[],
      security.user.role,
      DEPRECIATION_MASKED_FIELDS
    );

    return NextResponse.json(masked);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch depreciation schedules' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Assets', 'POST');
  if (!security.authorized) return security.response;

  try {
    const body = await request.json();
    const companyId = security.user.companyId;

    const assetId = body.assetId as string;
    if (!assetId) return NextResponse.json({ error: 'assetId is required' }, { status: 400 });

    const periodDate = body.periodDate ? new Date(body.periodDate as string) : new Date();

    const item = await db.$transaction(async (tx) => {
      // Get the asset
      const asset = await tx.asset.findUnique({
        where: { id: assetId },
        include: { investmentHead: true },
      });

      if (!asset) throw new Error('Asset not found');

      // Cross-tenant validation
      if (companyId && asset.companyId && asset.companyId !== companyId) {
        throw new Error('Cross-tenant access denied');
      }

      // Only Fixed Assets can have depreciation
      if (asset.assetCategory !== 'Fixed') {
        throw new Error('Depreciation only applies to Fixed Assets. Current Assets bypass depreciation.');
      }

      // Validate Fixed Asset depreciation parameters
      if (!asset.usefulLifeMonths || asset.usefulLifeMonths <= 0) {
        throw new Error('Asset usefulLifeMonths must be > 0 to calculate depreciation');
      }

      if (asset.salvageValue >= asset.purchaseValue) {
        throw new Error('Asset salvageValue must be < purchaseValue to calculate depreciation');
      }

      // Calculate monthly depreciation: (purchaseValue - salvageValue) / usefulLifeMonths
      const depreciationAmount = safeFinancialRound(
        safeFinancialSubtract(asset.purchaseValue, asset.salvageValue) / asset.usefulLifeMonths
      );

      // Update running totals
      const newAccumulatedDepreciation = safeFinancialRound(
        asset.accumulatedDepreciation + depreciationAmount
      );
      const newNetBookValue = safeFinancialSubtract(asset.purchaseValue, newAccumulatedDepreciation);

      // Ensure netBookValue doesn't go below salvageValue
      const finalNetBookValue = newNetBookValue < asset.salvageValue ? asset.salvageValue : newNetBookValue;
      const finalAccumulatedDepreciation = safeFinancialSubtract(asset.purchaseValue, finalNetBookValue);

      // Check if depreciation already exists for this asset+period
      const periodStart = new Date(periodDate.getFullYear(), periodDate.getMonth(), 1);
      const periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0, 23, 59, 59);

      const existingSchedule = await tx.assetDepreciation.findFirst({
        where: {
          assetId,
          periodDate: {
            gte: periodStart,
            lte: periodEnd,
          },
          isActive: true,
        },
      });

      if (existingSchedule) {
        throw new Error(`Depreciation already exists for this asset in period ${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, '0')}`);
      }

      // Create depreciation schedule entry
      const schedule = await tx.assetDepreciation.create({
        data: {
          assetId,
          periodDate,
          depreciationAmount: safeFinancialRound(depreciationAmount),
          accumulatedDepreciation: safeFinancialRound(finalAccumulatedDepreciation),
          netBookValue: safeFinancialRound(finalNetBookValue),
          method: body.method || 'StraightLine',
          notes: (body.notes as string) || null,
          isActive: true,
        },
      });

      // Update the Asset's running totals
      await tx.asset.update({
        where: { id: assetId },
        data: {
          accumulatedDepreciation: safeFinancialRound(finalAccumulatedDepreciation),
          netBookValue: safeFinancialRound(finalNetBookValue),
        },
      });

      // AuditLog
      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: AUDIT_MODULE,
          recordId: schedule.id,
          recordLabel: `Depreciation: ${asset.investmentHead?.name || asset.id} - Period ${periodDate.toISOString().slice(0, 7)}`,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            assetId,
            depreciationAmount,
            accumulatedDepreciation: finalAccumulatedDepreciation,
            netBookValue: finalNetBookValue,
            periodDate: periodDate.toISOString(),
          }),
        },
      });

      return schedule;
    });

    await logUserActivity({
      action: 'CREATE',
      module: AUDIT_MODULE,
      recordId: item.id,
      recordLabel: `Depreciation schedule for asset ${assetId}`,
      userId: security.user.id,
      userName: security.user.name,
      details: `Created depreciation schedule for asset ${assetId}`,
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Cross-tenant access denied') return NextResponse.json({ error: 'Not found' }, { status: 404 });
      if (error.message.includes('only applies to') || error.message.includes('must be') || error.message.includes('already exists')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    return NextResponse.json({ error: 'Failed to create depreciation schedule', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
