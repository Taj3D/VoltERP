import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  checkFinancialDeletePermission,
  safeFinancialRound,
  safeFinancialSubtract,
  maskForVatAuditorFinancial,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

const AUDIT_MODULE = 'Inv-Asset-Ledger';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Assets', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const companyId = security.user.companyId;

    const item = await db.assetDepreciation.findUnique({
      where: { id },
      include: {
        asset: {
          include: { investmentHead: true },
        },
      },
    });

    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Cross-tenant validation via Asset relation
    if (companyId && item.asset?.companyId && item.asset.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const masked = maskForVatAuditorFinancial(
      item as unknown as Record<string, unknown>,
      security.user.role
    );

    return NextResponse.json(masked);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch depreciation entry' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Assets', 'PUT');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const companyId = security.user.companyId;
    const body = await request.json();

    const item = await db.$transaction(async (tx) => {
      // Get existing entry
      const existing = await tx.assetDepreciation.findUnique({
        where: { id },
        include: { asset: true },
      });

      if (!existing) throw new Error('Not found');

      // Cross-tenant validation
      if (companyId && existing.asset?.companyId && existing.asset.companyId !== companyId) {
        throw new Error('Cross-tenant access denied');
      }

      // Update depreciation entry
      const depreciationAmount = body.depreciationAmount !== undefined
        ? safeFinancialRound(Number(body.depreciationAmount))
        : existing.depreciationAmount;

      const notes = body.notes !== undefined ? body.notes : existing.notes;
      const method = body.method || existing.method;
      const periodDate = body.periodDate ? new Date(body.periodDate as string) : existing.periodDate;

      const record = await tx.assetDepreciation.update({
        where: { id },
        data: {
          depreciationAmount,
          method,
          periodDate,
          notes: notes as string | null,
        },
      });

      // Recalculate Asset totals by summing all active depreciation schedules
      const allSchedules = await tx.assetDepreciation.findMany({
        where: { assetId: existing.assetId, isActive: true },
        orderBy: { periodDate: 'asc' },
      });

      let runningAccumulated = 0;
      let lastScheduleId: string | null = null;

      for (const schedule of allSchedules) {
        runningAccumulated = safeFinancialRound(runningAccumulated + schedule.depreciationAmount);
        const newNetBookValue = safeFinancialSubtract(existing.asset.purchaseValue, runningAccumulated);
        const finalNetBookValue = newNetBookValue < existing.asset.salvageValue
          ? existing.asset.salvageValue
          : newNetBookValue;
        const finalAccumulated = safeFinancialSubtract(existing.asset.purchaseValue, finalNetBookValue);

        await tx.assetDepreciation.update({
          where: { id: schedule.id },
          data: {
            accumulatedDepreciation: safeFinancialRound(finalAccumulated),
            netBookValue: safeFinancialRound(finalNetBookValue),
          },
        });

        lastScheduleId = schedule.id;
        runningAccumulated = finalAccumulated;
      }

      // Update Asset running totals from the last schedule
      const lastSchedule = lastScheduleId
        ? await tx.assetDepreciation.findUnique({ where: { id: lastScheduleId } })
        : null;

      if (lastSchedule) {
        await tx.asset.update({
          where: { id: existing.assetId },
          data: {
            accumulatedDepreciation: safeFinancialRound(lastSchedule.accumulatedDepreciation),
            netBookValue: safeFinancialRound(lastSchedule.netBookValue),
          },
        });
      }

      // AuditLog
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: AUDIT_MODULE,
          recordId: record.id,
          recordLabel: `Depreciation entry ${record.id}`,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            depreciationAmount,
            assetId: existing.assetId,
          }),
        },
      });

      return record;
    });

    await logUserActivity({
      action: 'UPDATE',
      module: AUDIT_MODULE,
      recordId: item.id,
      recordLabel: `Depreciation entry ${item.id}`,
      userId: security.user.id,
      userName: security.user.name,
      details: `Updated depreciation entry ${item.id}`,
    });

    return NextResponse.json(item);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Not found') return NextResponse.json({ error: 'Not found' }, { status: 404 });
      if (error.message === 'Cross-tenant access denied') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to update depreciation entry' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Assets', 'DELETE');
  if (!security.authorized) return security.response;

  // Admin-only delete
  const deleteCheck = checkFinancialDeletePermission(security.user.role);
  if (deleteCheck) return deleteCheck;

  try {
    const { id } = await params;
    const companyId = security.user.companyId;

    await db.$transaction(async (tx) => {
      const existing = await tx.assetDepreciation.findUnique({
        where: { id },
        include: { asset: true },
      });

      if (!existing) throw new Error('Not found');

      // Cross-tenant validation
      if (companyId && existing.asset?.companyId && existing.asset.companyId !== companyId) {
        throw new Error('Cross-tenant access denied');
      }

      // Soft delete the depreciation entry
      await tx.assetDepreciation.update({
        where: { id },
        data: { isActive: false },
      });

      // Recalculate Asset totals from remaining active schedules
      const remainingSchedules = await tx.assetDepreciation.findMany({
        where: { assetId: existing.assetId, isActive: true },
        orderBy: { periodDate: 'asc' },
      });

      let runningAccumulated = 0;
      let lastScheduleId: string | null = null;

      for (const schedule of remainingSchedules) {
        runningAccumulated = safeFinancialRound(runningAccumulated + schedule.depreciationAmount);
        const newNetBookValue = safeFinancialSubtract(existing.asset.purchaseValue, runningAccumulated);
        const finalNetBookValue = newNetBookValue < existing.asset.salvageValue
          ? existing.asset.salvageValue
          : newNetBookValue;
        const finalAccumulated = safeFinancialSubtract(existing.asset.purchaseValue, finalNetBookValue);

        await tx.assetDepreciation.update({
          where: { id: schedule.id },
          data: {
            accumulatedDepreciation: safeFinancialRound(finalAccumulated),
            netBookValue: safeFinancialRound(finalNetBookValue),
          },
        });

        lastScheduleId = schedule.id;
        runningAccumulated = finalAccumulated;
      }

      // Update Asset running totals
      const lastSchedule = lastScheduleId
        ? await tx.assetDepreciation.findUnique({ where: { id: lastScheduleId } })
        : null;

      await tx.asset.update({
        where: { id: existing.assetId },
        data: {
          accumulatedDepreciation: lastSchedule
            ? safeFinancialRound(lastSchedule.accumulatedDepreciation)
            : 0,
          netBookValue: lastSchedule
            ? safeFinancialRound(lastSchedule.netBookValue)
            : existing.asset.purchaseValue,
        },
      });

      // AuditLog
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: AUDIT_MODULE,
          recordId: existing.id,
          recordLabel: `Depreciation entry ${existing.id}`,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            assetId: existing.assetId,
            depreciationAmount: existing.depreciationAmount,
            softDelete: true,
          }),
        },
      });
    });

    await logUserActivity({
      action: 'DELETE',
      module: AUDIT_MODULE,
      recordId: id,
      recordLabel: `Depreciation entry ${id}`,
      userId: security.user.id,
      userName: security.user.name,
      details: `Soft-deleted depreciation entry ${id}`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Not found') return NextResponse.json({ error: 'Not found' }, { status: 404 });
      if (error.message === 'Cross-tenant access denied') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to delete depreciation entry' }, { status: 500 });
  }
}
