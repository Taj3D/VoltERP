import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, type UserRole } from '@/lib/api-security';
import {
  buildSharedDashboardData,
  computeKPI,
  computeFinancialRatios,
  computeMonthlyTrend,
  computeCategoryTurnover,
  computeStockAlerts,
  computeTopPerformers,
  computePaymentMix,
  computeDailySalesTrend,
  computeReceivablesAging,
} from '@/lib/dashboard-shared';

export const maxDuration = 60;

// ── Stale-While-Revalidate cache ──
// PERFORMANCE: Increased TTLs so the cold path (13s, 35 DB queries) is hit
// far less often. Dashboard data doesn't need to be real-time fresh — 2 min
// soft / 10 min hard is a good tradeoff for an ERP overview screen.
interface CacheEntry {
  data: unknown;
  expiresAt: number;       // when data becomes "stale" (soft TTL)
  hardExpiresAt: number;   // when data must be evicted entirely (hard TTL)
  refreshing: boolean;     // background refresh in progress?
}
const batchCache = new Map<string, CacheEntry>();
const BATCH_CACHE_TTL_MS = 2 * 60_000;           // 2 min — data is "fresh" (was 30s)
const BATCH_CACHE_HARD_TTL_MS = 10 * 60_000;     // 10 min — max staleness (was 5 min)
const BATCH_CACHE_MAX = 100;

/**
 * Build the batch payload using the SHARED query layer.
 * This runs ALL unique DB queries in a SINGLE Promise.all (~35 queries
// instead of 61), then derives all 9 dashboard sections from the shared data.
 */
async function buildBatchPayload(
  vatMode: boolean,
  dateFilter: (base: Record<string, unknown>) => Record<string, unknown>,
  companyFilter: Record<string, unknown>,
  role: UserRole,
  months: number,
  limit: number,
): Promise<Record<string, unknown>> {
  // ── SINGLE batch of all unique base queries ──
  const shared = await buildSharedDashboardData({
    dateFilter,
    companyFilter,
    months,
  });

  // ── Derive all 9 sections from shared data (pure computation, no extra DB hits) ──
  // TopPerformers still needs 2 small ID-lookup queries, but those are bounded
  // to `limit` IDs (5 by default) so they're fast.
  const [
    kpi, financialRatios, monthlyTrend, categoryTurnover, stockAlerts,
    topPerformers, paymentMix, dailySalesTrend, receivablesAging,
  ] = await Promise.all([
    Promise.resolve(computeKPI(shared, vatMode, role)),
    Promise.resolve(computeFinancialRatios(shared, role)),
    Promise.resolve(computeMonthlyTrend(shared, months, role)),
    Promise.resolve(computeCategoryTurnover(shared, role)),
    Promise.resolve(computeStockAlerts(shared)),
    computeTopPerformers(shared, limit, companyFilter, vatMode, role),
    Promise.resolve(computePaymentMix(shared, vatMode, role)),
    Promise.resolve(computeDailySalesTrend(shared, role)),
    Promise.resolve(computeReceivablesAging(shared, vatMode, role)),
  ]);

  return {
    success: true,
    kpi,
    monthlyTrend,
    categoryTurnover,
    stockAlerts,
    financialRatios,
    topPerformers,
    paymentMix,
    receivablesAging,
    dailySalesTrend,
    _meta: {
      batched: true,
      cached: false,
      generatedAt: new Date().toISOString(),
    },
  };
}

async function refreshBatchCache(
  cacheKey: string,
  vatMode: boolean,
  dateFilter: (base: Record<string, unknown>) => Record<string, unknown>,
  companyFilter: Record<string, unknown>,
  role: UserRole,
  months: number,
  limit: number,
): Promise<void> {
  const payload = await buildBatchPayload(vatMode, dateFilter, companyFilter, role, months, limit);
  const now = Date.now();
  batchCache.set(cacheKey, {
    data: payload,
    expiresAt: now + BATCH_CACHE_TTL_MS,
    hardExpiresAt: now + BATCH_CACHE_HARD_TTL_MS,
    refreshing: false,
  });
}

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'DashboardAnalytics', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const vatMode = searchParams.get('vatMode') === 'true';
    const startDateStr = searchParams.get('startDate');
    const endDateStr = searchParams.get('endDate');
    const startDate = startDateStr ? new Date(startDateStr) : undefined;
    const endDate = endDateStr ? new Date(endDateStr) : undefined;
    const months = parseInt(searchParams.get('months') || '12', 10);
    const limit = parseInt(searchParams.get('limit') || '5', 10);

    const companyId = security.user.companyId;
    const companyFilter = companyId ? { companyId } : {};

    const dateFilter = (baseWhere: Record<string, unknown>) => {
      if (startDate || endDate) {
        const dateConstraint: Record<string, unknown> = {};
        if (startDate) dateConstraint.gte = startDate;
        if (endDate) dateConstraint.lte = endDate;
        baseWhere.date = dateConstraint;
      }
      return baseWhere;
    };

    const role: UserRole = security.user.role;

    const cacheKey = `${security.user.id}:${vatMode}:${startDateStr || ''}:${endDateStr || ''}:${months}:${limit}`;
    const now = Date.now();
    const cached = batchCache.get(cacheKey);

    // ── Stale-While-Revalidate ──
    if (cached && cached.hardExpiresAt > now) {
      const isStale = cached.expiresAt <= now;
      const shouldBackgroundRefresh = isStale && !cached.refreshing;

      if (shouldBackgroundRefresh) {
        cached.refreshing = true;
        refreshBatchCache(cacheKey, vatMode, dateFilter, companyFilter, role, months, limit).catch(() => {
          const entry = batchCache.get(cacheKey);
          if (entry) entry.refreshing = false;
        });
      }

      return NextResponse.json(cached.data, {
        headers: {
          'Cache-Control': `private, max-age=30, stale-while-revalidate=120`,
          'X-Dashboard-Batch': isStale ? 'STALE-REVALIDATING' : 'HIT',
        },
      });
    }

    // ── Cache miss: fetch fresh (cold path, ~35 queries) ──
    const payload = await buildBatchPayload(vatMode, dateFilter, companyFilter, role, months, limit);

    batchCache.set(cacheKey, {
      data: payload,
      expiresAt: now + BATCH_CACHE_TTL_MS,
      hardExpiresAt: now + BATCH_CACHE_HARD_TTL_MS,
      refreshing: false,
    });

    if (batchCache.size > BATCH_CACHE_MAX) {
      for (const [k, v] of batchCache.entries()) {
        if (v.hardExpiresAt <= now) batchCache.delete(k);
      }
      if (batchCache.size > BATCH_CACHE_MAX) {
        const oldest = [...batchCache.entries()]
          .sort((a, b) => a[1].expiresAt - b[1].expiresAt)
          .slice(0, batchCache.size - BATCH_CACHE_MAX);
        for (const [k] of oldest) batchCache.delete(k);
      }
    }

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'private, max-age=30, stale-while-revalidate=120',
        'X-Dashboard-Batch': 'MISS',
      },
    });
  } catch (error) {
    console.error('Dashboard Batch API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate batched analytics' },
      { status: 500 }
    );
  }
}

// ── Internal endpoint for cache warmup (called by Vercel Cron) ──
// Exported so the warmup route can trigger a cache build for a specific user
// without going through the full HTTP auth flow.
export async function warmupBatchCache(
  userId: string,
  companyId: string | null,
  role: UserRole,
  vatMode: boolean,
): Promise<void> {
  const companyFilter = companyId ? { companyId } : {};
  const dateFilter = (base: Record<string, unknown>) => base;
  const cacheKey = `${userId}:${vatMode}::12:5`;
  const payload = await buildBatchPayload(vatMode, dateFilter, companyFilter, role, 12, 5);
  const now = Date.now();
  batchCache.set(cacheKey, {
    data: payload,
    expiresAt: now + BATCH_CACHE_TTL_MS,
    hardExpiresAt: now + BATCH_CACHE_HARD_TTL_MS,
    refreshing: false,
  });
}
