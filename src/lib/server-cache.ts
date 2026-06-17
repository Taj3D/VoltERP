// ============================================================
// VoltERP — Server-Side In-Memory Cache
// Reduces Turso cloud DB round-trips for slow-changing data.
// Each Vercel serverless instance keeps its own cache for the
// lifetime of the warm function. Cache TTL is short (60-300s)
// to balance freshness vs. latency.
// ============================================================

interface CacheEntry<T> {
  value: T;
  expiresAt: number; // epoch ms
}

/** Module-level Map — persists across warm invocations on the same instance */
const cacheStore = new Map<string, CacheEntry<unknown>>();

/** Pending fetch promises — prevents duplicate concurrent fetches (thundering herd) */
const pendingFetches = new Map<string, Promise<unknown>>();

/**
 * Get a cached value if still valid, otherwise return undefined.
 */
export function getCached<T>(key: string): T | undefined {
  const entry = cacheStore.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cacheStore.delete(key);
    return undefined;
  }
  return entry.value as T;
}

/**
 * Store a value in cache with a TTL (in seconds).
 */
export function setCached<T>(key: string, value: T, ttlSeconds: number): void {
  cacheStore.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

/**
 * Invalidate a cached key (call when the underlying data changes).
 */
export function invalidateCache(key: string): void {
  cacheStore.delete(key);
  pendingFetches.delete(key);
}

/**
 * Invalidate all cache keys matching a prefix.
 */
export function invalidateByPrefix(prefix: string): void {
  for (const key of cacheStore.keys()) {
    if (key.startsWith(prefix)) {
      cacheStore.delete(key);
    }
  }
}

/**
 * Cached fetch with single-flight (thundering-herd protection).
 *
 * - If a valid cached value exists, returns it immediately.
 * - If a fetch is already in-flight for this key, returns the same promise.
 * - Otherwise, calls `fetcher()`, caches the result for `ttlSeconds`, and returns it.
 *
 * On fetcher rejection, the error is NOT cached — next call will retry.
 */
export async function cachedFetch<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  // 1. Return cached value if valid
  const cached = getCached<T>(key);
  if (cached !== undefined) {
    return cached;
  }

  // 2. Deduplicate concurrent fetches (single-flight)
  const pending = pendingFetches.get(key) as Promise<T> | undefined;
  if (pending) {
    return pending;
  }

  // 3. Start a new fetch
  const fetchPromise = (async () => {
    try {
      const value = await fetcher();
      setCached(key, value, ttlSeconds);
      return value;
    } finally {
      pendingFetches.delete(key);
    }
  })();

  pendingFetches.set(key, fetchPromise);
  return fetchPromise;
}

/**
 * Cache key builders for common patterns.
 * Includes companyId when available to maintain multi-tenant isolation.
 */
export const cacheKeys = {
  companyBranding: (companyId?: string) =>
    `company-branding:${companyId || 'default'}`,
  categories: (companyId?: string) =>
    `categories:${companyId || 'default'}`,
  systemConfig: (companyId?: string) =>
    `system-config:${companyId || 'default'}`,
  dashboardSummary: (companyId?: string) =>
    `dashboard-summary:${companyId || 'default'}`,
  productSummary: (companyId?: string) =>
    `product-summary:${companyId || 'default'}`,
  lowStockProducts: (companyId?: string) =>
    `low-stock:${companyId || 'default'}`,
};

/** Clear all cached entries (useful for tests / admin flush) */
export function flushAllCache(): void {
  cacheStore.clear();
  pendingFetches.clear();
}
