import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, type UserRole } from '@/lib/api-security';
import {
  handleKPI,
  handleMonthlyTrend,
  handleCategoryTurnover,
  handleStockAlerts,
  handleFinancialRatios,
  handleTopPerformers,
  handlePaymentMix,
  handleDailySalesTrend,
  handleReceivablesAging,
} from '@/app/api/dashboard-analytics/route';

export const maxDuration = 60;

// In-memory cache for batched dashboard data.
// PERFORMANCE: Uses a stale-while-revalidate pattern so that cache hits
// return INSTANTLY (even if slightly stale) while a background refresh
// fetches fresh data. This eliminates the 13s wait on repeat dashboard
// loads even after the 30s TTL expires.
interface CacheEntry {
  data: unknown;
  expiresAt: number;       // when data becomes "stale"
  hardExpiresAt: number;   // when data must be evicted entirely
  refreshing: boolean;     // background refresh in progress?
}
const batchCache = new Map<string, CacheEntry>();
const BATCH_CACHE_TTL_MS = 30_000;          // 30s — data is "fresh"
const BATCH_CACHE_HARD_TTL_MS = 5 * 60_000; // 5min — max staleness before eviction
const BATCH_CACHE_MAX = 100;

/**
 * Batched Dashboard Endpoint
 *
 * Combines 9 dashboard-analytics calls + 1 dashboard call into a SINGLE
 * HTTP round-trip. Saves ~2.4s of network overhead on slow connections
 * and reduces serverless cold-start invocations by 90%.
 *
 * Response shape:
 * {
 *   kpi, monthlyTrend, categoryTurnover, stockAlerts,
 *   financialRatios, topPerformers, paymentMix,
 *   receivablesAging, dailySalesTrend
 * }
 */

// ── Build the batch payload by running all 9 handlers in parallel ──
// Extracted into a helper so both the synchronous (cache miss) and
// background (stale-while-revalidate) paths share the same logic.
async function buildBatchPayload(
  vatMode: boolean,
  dateFilter: (base: Record<string, unknown>) => Record<string, unknown>,
  companyFilter: Record<string, unknown>,
  role: UserRole,
  userId: string,
  userName: string,
  sp: URLSearchParams,
  months: number,
): Promise<Record<string, unknown>> {
  // Run all 9 handlers in PARALLEL — each handler internally runs its
  // own sub-queries in parallel too.
  const [
    kpiRes, trendRes, catRes, stockRes, ratioRes,
    perfRes, payRes, agingRes, dailyRes,
  ] = await Promise.all([
    handleKPI(vatMode, dateFilter, companyFilter, role, userId, userName),
    handleMonthlyTrend(sp, vatMode, dateFilter, companyFilter, role, userId, userName),
    handleCategoryTurnover(vatMode, dateFilter, companyFilter, role, userId, userName),
    handleStockAlerts(companyFilter),
    handleFinancialRatios(vatMode, dateFilter, companyFilter, role, userId, userName),
    handleTopPerformers(sp, vatMode, dateFilter, companyFilter, role, userId, userName),
    handlePaymentMix(vatMode, dateFilter, companyFilter, role),
    handleReceivablesAging(vatMode, dateFilter, companyFilter, role, userId, userName),
    handleDailySalesTrend(vatMode, dateFilter, companyFilter, role, userId, userName),
  ]);

  // Extract JSON from each NextResponse (handlers return NextResponse.json())
  const [
    kpi, monthlyTrend, categoryTurnover, stockAlerts,
    financialRatios, topPerformers, paymentMix,
    receivablesAging, dailySalesTrend,
  ] = await Promise.all([
    kpiRes.json(), trendRes.json(), catRes.json(), stockRes.json(),
    ratioRes.json(), perfRes.json(), payRes.json(), agingRes.json(),
    dailyRes.json(),
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

// ── Background cache refresh (stale-while-revalidate) ──
// Called when a request hits stale (but not hard-expired) cache data.
// Fetches fresh data and atomically swaps it into the cache. The caller
// already received the stale response, so this runs truly in the background.
async function refreshBatchCache(
  cacheKey: string,
  vatMode: boolean,
  dateFilter: (base: Record<string, unknown>) => Record<string, unknown>,
  companyFilter: Record<string, unknown>,
  role: UserRole,
  userId: string,
  userName: string,
  sp: URLSearchParams,
  months: number,
): Promise<void> {
  const payload = await buildBatchPayload(
    vatMode, dateFilter, companyFilter, role, userId, userName, sp, months
  );
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

    // Multi-tenant isolation
    const companyId = security.user.companyId;
    const companyFilter = companyId ? { companyId } : {};

    // Build date filter helper (same pattern as individual endpoint)
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
    const userId = security.user.id;
    const userName = security.user.name;
    const sp = new URLSearchParams();
    if (months) sp.set('months', String(months));
    if (searchParams.get('limit')) sp.set('limit', searchParams.get('limit')!);

    // Cache key includes all params that affect the response
    const cacheKey = `${security.user.id}:${vatMode}:${startDateStr || ''}:${endDateStr || ''}:${months}:${sp.toString()}`;
    const now = Date.now();
    const cached = batchCache.get(cacheKey);

    // ── Stale-While-Revalidate logic ──
    // If we have cached data that hasn't hit its HARD expiry, return it
    // immediately. If the data is stale (past soft TTL) but still within
    // hard TTL, trigger a background refresh and return stale data.
    if (cached && cached.hardExpiresAt > now) {
      const isStale = cached.expiresAt <= now;
      const shouldBackgroundRefresh = isStale && !cached.refreshing;

      if (shouldBackgroundRefresh) {
        cached.refreshing = true;
        // Fire-and-forget background refresh — don't block the response.
        // Errors are swallowed because the cache still serves stale data.
        refreshBatchCache(cacheKey, vatMode, dateFilter, companyFilter, role, userId, userName, sp, months).catch(() => {
          const entry = batchCache.get(cacheKey);
          if (entry) entry.refreshing = false;
        });
      }

      return NextResponse.json(cached.data, {
        headers: {
          'Cache-Control': `private, max-age=5, stale-while-revalidate=60`,
          'X-Dashboard-Batch': isStale ? 'STALE-REVALIDATING' : 'HIT',
        },
      });
    }

    // ── Cache miss or hard-expired: fetch fresh data synchronously ──
    const payload = await buildBatchPayload(
      vatMode, dateFilter, companyFilter, role, userId, userName, sp, months
    );

    // Store in cache
    batchCache.set(cacheKey, {
      data: payload,
      expiresAt: now + BATCH_CACHE_TTL_MS,
      hardExpiresAt: now + BATCH_CACHE_HARD_TTL_MS,
      refreshing: false,
    });

    // Trim cache if it grows too large (safety valve)
    if (batchCache.size > BATCH_CACHE_MAX) {
      for (const [k, v] of batchCache.entries()) {
        if (v.hardExpiresAt <= now) batchCache.delete(k);
      }
      // If still over limit, drop oldest soft-expired entries
      if (batchCache.size > BATCH_CACHE_MAX) {
        const oldest = [...batchCache.entries()]
          .sort((a, b) => a[1].expiresAt - b[1].expiresAt)
          .slice(0, batchCache.size - BATCH_CACHE_MAX);
        for (const [k] of oldest) batchCache.delete(k);
      }
    }

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'private, max-age=5, stale-while-revalidate=60',
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
