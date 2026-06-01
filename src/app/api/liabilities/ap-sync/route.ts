import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  safeFinancialRound,
  safeFinancialAdd,
  safeFinancialSubtract,
  maskFinancialArray,
} from '@/lib/api-security';

const LIABILITY_MASKED_FIELDS = ['amount'];

/**
 * GET /api/liabilities/ap-sync
 *
 * Accounts Payable Aging Data endpoint.
 * Returns aging summary, per-head breakdown with outstanding balances,
 * and sync status summary for AP reconciliation.
 *
 * Query params:
 * - companyId: Filter by company (cross-tenant isolation)
 * - headId: Filter by specific InvestmentHead
 * - agingBucket: Filter by aging bucket ("Current", "1-30", "31-60", "61-90", "90+")
 */
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Liabilities', 'GET');
  if (!security.authorized) return security.response;

  try {
    const companyId = security.user.companyId;
    const { searchParams } = new URL(request.url);
    const headId = searchParams.get('headId');
    const agingBucketFilter = searchParams.get('agingBucket');

    // ── Build where clause for InvestmentHeads ──
    const headWhere: Record<string, unknown> = {
      isActive: true,
      ...(companyId ? { companyId } : {}),
    };
    if (headId) headWhere.id = headId;

    // Fetch all active investment heads for the company
    const heads = await db.investmentHead.findMany({
      where: headWhere,
      orderBy: { name: 'asc' },
      include: {
        liabilities: {
          where: {
            isActive: true,
            ...(companyId ? { companyId } : {}),
          },
          orderBy: { date: 'desc' },
        },
      },
    });

    // ── Compute per-head aging data ──
    const agingSummary: Record<string, { count: number; totalAmount: number }> = {
      'Current': { count: 0, totalAmount: 0 },
      '1-30': { count: 0, totalAmount: 0 },
      '31-60': { count: 0, totalAmount: 0 },
      '61-90': { count: 0, totalAmount: 0 },
      '90+': { count: 0, totalAmount: 0 },
    };

    let totalOutstanding = 0;
    let syncedCount = 0;
    let pendingCount = 0;
    let failedCount = 0;

    const headsResult = [];

    for (const head of heads) {
      const receivedLiabilities = head.liabilities.filter((l) => l.type === 'received');
      const paidLiabilities = head.liabilities.filter((l) => l.type === 'pay');

      // Calculate outstanding balance:
      // openingBalance + sum(received amounts) - sum(paid amounts)
      const totalReceived = receivedLiabilities.reduce(
        (sum, l) => safeFinancialAdd(sum, l.amount),
        0
      );
      const totalPaid = paidLiabilities.reduce(
        (sum, l) => safeFinancialAdd(sum, l.amount),
        0
      );
      const outstandingBalance = safeFinancialSubtract(
        safeFinancialAdd(head.openingBalance, totalReceived),
        totalPaid
      );

      // Determine the head's dominant aging bucket based on the worst aging
      // among its "received" liabilities
      let headAgingBucket = 'Current';

      // Only include "received" type liabilities for aging
      const agingLiabilities = receivedLiabilities;

      // Apply aging bucket filter if specified
      const filteredLiabilities = agingBucketFilter
        ? agingLiabilities.filter((l) => l.agingBucket === agingBucketFilter)
        : agingLiabilities;

      // Accumulate aging summary from ALL received liabilities (not filtered)
      for (const liab of agingLiabilities) {
        const bucket = liab.agingBucket || 'Current';
        if (agingSummary[bucket]) {
          agingSummary[bucket].count += 1;
          agingSummary[bucket].totalAmount = safeFinancialAdd(
            agingSummary[bucket].totalAmount,
            liab.amount
          );
        }

        // Track sync status counts
        if (liab.apSyncStatus === 'Synced') syncedCount++;
        else if (liab.apSyncStatus === 'Failed') failedCount++;
        else pendingCount++;
      }

      // Determine head's aging bucket: use the worst bucket among its received liabilities
      const bucketOrder = ['Current', '1-30', '31-60', '61-90', '90+'];
      let worstBucketIndex = 0;
      for (const liab of agingLiabilities) {
        const bucket = liab.agingBucket || 'Current';
        const idx = bucketOrder.indexOf(bucket);
        if (idx > worstBucketIndex) worstBucketIndex = idx;
      }
      headAgingBucket = bucketOrder[worstBucketIndex];

      // Find the last payment date
      const lastPayment = paidLiabilities.length > 0
        ? paidLiabilities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
        : null;

      // Build the liabilities array for this head
      const liabilitiesData = filteredLiabilities.map((l) => ({
        id: l.id,
        date: l.date,
        amount: l.amount,
        type: l.type,
        agingBucket: l.agingBucket,
        overdueDays: l.overdueDays,
        apSyncStatus: l.apSyncStatus,
      }));

      // Determine the head's apSyncStatus: if any liability is "Failed", mark as "Failed";
      // if any is "Pending", mark as "Pending"; otherwise "Synced"
      const headApSyncStatus = agingLiabilities.some((l) => l.apSyncStatus === 'Failed')
        ? 'Failed'
        : agingLiabilities.some((l) => l.apSyncStatus === 'Pending')
          ? 'Pending'
          : agingLiabilities.length > 0
            ? 'Synced'
            : 'N/A';

      totalOutstanding = safeFinancialAdd(totalOutstanding, Math.max(0, outstandingBalance));

      // Only include heads that have outstanding balance or received liabilities
      if (outstandingBalance > 0 || receivedLiabilities.length > 0 || agingBucketFilter) {
        headsResult.push({
          id: head.id,
          code: head.code,
          name: head.name,
          outstandingBalance: safeFinancialRound(outstandingBalance),
          agingBucket: headAgingBucket,
          lastPaymentDate: lastPayment ? lastPayment.date : null,
          apSyncStatus: headApSyncStatus,
          liabilities: liabilitiesData,
        });
      }
    }

    // ── Build response ──
    const response = {
      agingSummary: {
        current: {
          count: agingSummary['Current'].count,
          totalAmount: safeFinancialRound(agingSummary['Current'].totalAmount),
        },
        '1-30': {
          count: agingSummary['1-30'].count,
          totalAmount: safeFinancialRound(agingSummary['1-30'].totalAmount),
        },
        '31-60': {
          count: agingSummary['31-60'].count,
          totalAmount: safeFinancialRound(agingSummary['31-60'].totalAmount),
        },
        '61-90': {
          count: agingSummary['61-90'].count,
          totalAmount: safeFinancialRound(agingSummary['61-90'].totalAmount),
        },
        '90+': {
          count: agingSummary['90+'].count,
          totalAmount: safeFinancialRound(agingSummary['90+'].totalAmount),
        },
      },
      totalOutstanding: safeFinancialRound(totalOutstanding),
      heads: headsResult,
      syncStatusSummary: {
        synced: syncedCount,
        pending: pendingCount,
        failed: failedCount,
      },
    };

    // VAT Auditor masking for the response
    if (security.user.role === 'vat_auditor') {
      const maskedHeads = maskFinancialArray(
        headsResult as unknown as Record<string, unknown>[],
        security.user.role,
        LIABILITY_MASKED_FIELDS
      );
      return NextResponse.json({
        ...response,
        heads: maskedHeads,
        totalOutstanding: 'N/A (Audit Mode)',
        agingSummary: {
          current: { ...response.agingSummary.current, totalAmount: 'N/A (Audit Mode)' as unknown as number },
          '1-30': { ...response.agingSummary['1-30'], totalAmount: 'N/A (Audit Mode)' as unknown as number },
          '31-60': { ...response.agingSummary['31-60'], totalAmount: 'N/A (Audit Mode)' as unknown as number },
          '61-90': { ...response.agingSummary['61-90'], totalAmount: 'N/A (Audit Mode)' as unknown as number },
          '90+': { ...response.agingSummary['90+'], totalAmount: 'N/A (Audit Mode)' as unknown as number },
        },
      });
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('[AP-Sync] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch AP aging data' }, { status: 500 });
  }
}
