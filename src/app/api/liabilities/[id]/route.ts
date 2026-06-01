import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  checkPeriodClose,
  checkFinancialDeletePermission,
  safeFinancialRound,
  safeFinancialSubtract,
  safeFinancialAdd,
  maskForVatAuditorFinancial,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

const AUDIT_MODULE = 'Inv-Asset-Ledger';

/**
 * computeAgingBucket - Determines the aging classification of a liability
 * based on how many days it is past its due date.
 */
function computeAgingBucket(dueDate: Date | null, referenceDate: Date): string {
  if (!dueDate) return 'Current';

  const diffMs = referenceDate.getTime() - new Date(dueDate).getTime();
  const overdueDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (overdueDays <= 0) return 'Current';
  if (overdueDays <= 30) return '1-30';
  if (overdueDays <= 60) return '31-60';
  if (overdueDays <= 90) return '61-90';
  return '90+';
}

/**
 * computeOverdueDays - Calculates the number of days a liability is past its due date.
 */
function computeOverdueDays(dueDate: Date | null, referenceDate: Date): number {
  if (!dueDate) return 0;
  const diffMs = referenceDate.getTime() - new Date(dueDate).getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * getHeadOutstandingBalance - Calculates the outstanding balance for an InvestmentHead.
 * Formula: openingBalance + sum(received amounts) - sum(paid amounts)
 * Excludes the liability being updated (by excludeId) to avoid counting it twice.
 */
async function getHeadOutstandingBalance(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  investmentHeadId: string,
  excludeId?: string
): Promise<number> {
  const head = await tx.investmentHead.findUnique({
    where: { id: investmentHeadId },
    select: { openingBalance: true },
  });

  const receivedWhere: Record<string, unknown> = {
    investmentHeadId,
    type: 'received',
    isActive: true,
  };
  if (excludeId) receivedWhere.id = { not: excludeId };

  const paidWhere: Record<string, unknown> = {
    investmentHeadId,
    type: 'pay',
    isActive: true,
  };
  if (excludeId) paidWhere.id = { not: excludeId };

  const receivedAgg = await tx.liability.aggregate({
    _sum: { amount: true },
    where: receivedWhere,
  });

  const paidAgg = await tx.liability.aggregate({
    _sum: { amount: true },
    where: paidWhere,
  });

  const openingBalance = head?.openingBalance || 0;
  const totalReceived = receivedAgg._sum.amount || 0;
  const totalPaid = paidAgg._sum.amount || 0;

  return safeFinancialSubtract(safeFinancialAdd(openingBalance, totalReceived), totalPaid);
}

// ── GET Handler ──

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Liabilities', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const companyId = security.user.companyId;

    const item = await db.liability.findUnique({
      where: { id },
      include: { investmentHead: true },
    });

    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Cross-tenant validation
    if (companyId && item.companyId && item.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const masked = maskForVatAuditorFinancial(
      item as unknown as Record<string, unknown>,
      security.user.role
    );

    return NextResponse.json(masked);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

// ── PUT Handler ──

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Liabilities', 'PUT');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const companyId = security.user.companyId;
    const body = await request.json();

    // Period close check
    if (body.date) {
      const periodLock = await checkPeriodClose(body.date);
      if (periodLock) return periodLock;
    }

    const item = await db.$transaction(async (tx) => {
      // Cross-tenant validation
      const existing = await tx.liability.findUnique({ where: { id } });
      if (!existing) throw new Error('Not found');
      if (companyId && existing.companyId && existing.companyId !== companyId) {
        throw new Error('Cross-tenant access denied');
      }

      // Check Investment Head isActive if changing head
      if (body.investmentHeadId && body.investmentHeadId !== existing.investmentHeadId) {
        const head = await tx.investmentHead.findUnique({ where: { id: body.investmentHeadId } });
        if (!head || !head.isActive) {
          throw new Error('Action Blocked: Chosen Investment Head is inactive or archived.');
        }
      }

      // Amount must be > 0 if provided
      if (body.amount !== undefined && Number(body.amount) <= 0) {
        throw new Error('Amount must be > 0');
      }

      // ── Determine the new values ──
      const newAmount = body.amount !== undefined ? safeFinancialRound(Number(body.amount)) : existing.amount;
      const newType = body.type || existing.type;
      const newDate = body.date ? new Date(body.date as string) : existing.date;

      // ── When updating to "pay" type, verify payment doesn't exceed outstanding balance ──
      if (newType === 'pay') {
        const headId = body.investmentHeadId || existing.investmentHeadId;
        // Exclude this record from balance calculation to avoid double-counting
        const outstandingBalance = await getHeadOutstandingBalance(tx, headId, id);
        if (outstandingBalance < newAmount) {
          throw new Error('Action Blocked: Payment amount exceeds outstanding balance for this head.');
        }
      }

      // ── Recalculate aging bucket and overdue days when amount or date changes ──
      let agingBucket = body.agingBucket !== undefined ? (body.agingBucket as string) : existing.agingBucket;
      let dueDate = existing.dueDate;
      let overdueDays = existing.overdueDays;

      // If dueDate is explicitly provided, use it
      if (body.dueDate !== undefined) {
        dueDate = body.dueDate ? new Date(body.dueDate as string) : null;
      }

      // Recalculate aging if date or amount changed
      if (body.date !== undefined || body.amount !== undefined || body.dueDate !== undefined || body.agingBucket === undefined) {
        // For "received" type, ensure dueDate is set (default: date + 30 days)
        if (newType === 'received' && !dueDate) {
          dueDate = new Date(newDate.getTime() + 30 * 24 * 60 * 60 * 1000);
        }

        const now = new Date();
        if (body.agingBucket === undefined) {
          // Only auto-compute if not explicitly provided
          agingBucket = computeAgingBucket(dueDate, now);
        }
        overdueDays = computeOverdueDays(dueDate, now);
      }

      // ── Build update data ──
      const updateData: Record<string, unknown> = {
        investmentHeadId: body.investmentHeadId || undefined,
        date: body.date ? new Date(body.date as string) : undefined,
        amount: body.amount !== undefined ? safeFinancialRound(Number(body.amount)) : undefined,
        type: body.type || undefined,
        paymentMethod: body.paymentMethod !== undefined ? body.paymentMethod : undefined,
        description: body.description !== undefined ? (body.description || null) : undefined,
        isActive: body.isActive !== undefined ? body.isActive : undefined,
        // New AP Sync fields
        agingBucket,
        apSyncStatus: body.apSyncStatus !== undefined ? (body.apSyncStatus as string) : existing.apSyncStatus,
        dueDate,
        overdueDays,
      };

      const record = await tx.liability.update({
        where: { id },
        data: updateData,
        include: { investmentHead: true },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: AUDIT_MODULE,
          recordId: record.id,
          recordLabel: `${record.investmentHead?.name || record.id} - ৳${record.amount}`,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            investmentHeadId: record.investmentHeadId,
            amount: record.amount,
            type: record.type,
            agingBucket: record.agingBucket,
            apSyncStatus: record.apSyncStatus,
            dueDate: record.dueDate,
            overdueDays: record.overdueDays,
          }),
        },
      });

      return record;
    });

    await logUserActivity({
      action: 'UPDATE',
      module: AUDIT_MODULE,
      recordId: item.id,
      recordLabel: `${item.investmentHead?.name || item.id} - ৳${item.amount}`,
      userId: security.user.id,
      userName: security.user.name,
      details: `Updated liability: ${item.investmentHead?.name || item.id} - ৳${item.amount}`,
    });

    return NextResponse.json(item);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Not found') return NextResponse.json({ error: 'Not found' }, { status: 404 });
      if (error.message === 'Cross-tenant access denied') return NextResponse.json({ error: 'Not found' }, { status: 404 });
      if (error.message.startsWith('Action Blocked:') || error.message.includes('must be')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

// ── DELETE Handler ──

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Liabilities', 'DELETE');
  if (!security.authorized) return security.response;

  // Admin-only delete
  const deleteCheck = checkFinancialDeletePermission(security.user.role);
  if (deleteCheck) return deleteCheck;

  try {
    const { id } = await params;
    const companyId = security.user.companyId;

    await db.$transaction(async (tx) => {
      const record = await tx.liability.findUnique({
        where: { id },
        include: { investmentHead: true },
      });
      if (!record) throw new Error('Not found');

      // Cross-tenant validation
      if (companyId && record.companyId && record.companyId !== companyId) {
        throw new Error('Cross-tenant access denied');
      }

      await tx.liability.update({
        where: { id },
        data: { isActive: false },
      });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: AUDIT_MODULE,
          recordId: record.id,
          recordLabel: `${record.investmentHead?.name || record.id} - ৳${record.amount}`,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            investmentHeadId: record.investmentHeadId,
            amount: record.amount,
            softDelete: true,
          }),
        },
      });

      return record;
    });

    await logUserActivity({
      action: 'DELETE',
      module: AUDIT_MODULE,
      recordId: id,
      recordLabel: id,
      userId: security.user.id,
      userName: security.user.name,
      details: `Soft-deleted liability: ${id}`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Not found') return NextResponse.json({ error: 'Not found' }, { status: 404 });
      if (error.message === 'Cross-tenant access denied') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
