// ============================================================
// PRODUCTION-GRADE LOCAL MEMORY CACHING UTILITY
// Group 6: Core Performance Configurations & System Settings
// ============================================================
// In-memory cache with TTL, LRU eviction, and cache warming.
// All data tables should render under 150ms target.
// ============================================================

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  createdAt: number;
  accessCount: number;
  lastAccessedAt: number;
}

// Cache categories with default TTLs (in milliseconds)
export const CACHE_TTL: Record<string, number> = {
  // Short-lived: frequently changing data (5 seconds)
  dashboard_kpi: 5_000,
  stock_summary: 5_000,
  notifications: 5_000,

  // Medium: reference data that changes occasionally (30 seconds)
  products: 30_000,
  customers: 30_000,
  suppliers: 30_000,
  employees: 30_000,
  bank_balances: 30_000,

  // Long-lived: rarely changing configuration data (5 minutes)
  categories: 300_000,
  brands: 300_000,
  departments: 300_000,
  godowns: 300_000,
  chart_of_accounts: 300_000,
  system_config: 300_000,
  invoice_templates: 300_000,
  number_formats: 300_000,

  // Static: almost never changes (15 minutes)
  payment_options: 900_000,
  card_types: 900_000,
  colors: 900_000,
  units: 900_000,
  segments: 900_000,
  capacities: 900_000,
  interest_percentages: 900_000,
};

const DEFAULT_TTL = 30_000; // 30 seconds
const MAX_CACHE_SIZE = 500; // Maximum number of entries (LRU eviction)
const CLEANUP_INTERVAL = 60_000; // Cleanup expired entries every 60 seconds

class MemoryCache {
  private cache = new Map<string, CacheEntry<any>>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Periodic cleanup of expired entries
    if (typeof window !== 'undefined') {
      this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL);
    }
  }

  /**
   * Get a cached value by key.
   * Returns undefined if not found or expired.
   */
  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    const now = Date.now();
    if (now > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    // Update access stats for LRU
    entry.accessCount++;
    entry.lastAccessedAt = now;

    return entry.value as T;
  }

  /**
   * Set a cached value with optional TTL override.
   * If the cache is full, evict the least recently used entry.
   */
  set<T>(key: string, value: T, ttlMs?: number): void {
    // LRU eviction if at capacity
    if (this.cache.size >= MAX_CACHE_SIZE && !this.cache.has(key)) {
      this.evictLRU();
    }

    const now = Date.now();
    this.cache.set(key, {
      value,
      expiresAt: now + (ttlMs ?? DEFAULT_TTL),
      createdAt: now,
      accessCount: 0,
      lastAccessedAt: now,
    });
  }

  /**
   * Get a value from cache, or fetch it using the provided function.
   * The fetcher is only called on cache miss.
   */
  async getOrFetch<T>(key: string, fetcher: () => Promise<T>, ttlMs?: number): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;

    const value = await fetcher();
    this.set(key, value, ttlMs);
    return value;
  }

  /**
   * Invalidate a specific cache key.
   */
  invalidate(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Invalidate all cache keys matching a prefix.
   */
  invalidatePrefix(prefix: string): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Invalidate all entries tagged with a category.
   */
  invalidateCategory(category: string): number {
    return this.invalidatePrefix(`${category}:`);
  }

  /**
   * Clear the entire cache.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics for monitoring.
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    categories: Record<string, { count: number; avgAge: number }>;
  } {
    let totalAccess = 0;
    const categories: Record<string, { count: number; totalAge: number }> = {};
    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      totalAccess += entry.accessCount;
      const cat = key.split(':')[0] || 'unknown';
      if (!categories[cat]) categories[cat] = { count: 0, totalAge: 0 };
      categories[cat].count++;
      categories[cat].totalAge += now - entry.createdAt;
    }

    const catStats: Record<string, { count: number; avgAge: number }> = {};
    for (const [cat, data] of Object.entries(categories)) {
      catStats[cat] = {
        count: data.count,
        avgAge: Math.round(data.totalAge / data.count),
      };
    }

    return {
      size: this.cache.size,
      maxSize: MAX_CACHE_SIZE,
      hitRate: totalAccess > 0 ? totalAccess / (totalAccess + this.cache.size) : 0,
      categories: catStats,
    };
  }

  /**
   * Remove expired entries.
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Evict the least recently used entry.
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessedAt < oldestTime) {
        oldestTime = entry.lastAccessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Destroy the cache and cleanup timers.
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.cache.clear();
  }
}

// Singleton cache instance
export const appCache = new MemoryCache();

/**
 * Helper to create a cache key with category prefix.
 * Format: "category:identifier"
 */
export function cacheKey(category: string, identifier: string): string {
  return `${category}:${identifier}`;
}

/**
 * Helper to get TTL for a category.
 */
export function getTTLForCategory(category: string): number {
  return CACHE_TTL[category] ?? DEFAULT_TTL;
}

/**
 * Warm up the cache by pre-fetching common reference data.
 * Called on app initialization.
 */
export async function warmCache(fetchFn: (path: string) => Promise<any>): Promise<void> {
  const warmupPaths = [
    { category: 'categories', path: '/api/categories' },
    { category: 'brands', path: '/api/brands' },
    { category: 'departments', path: '/api/departments' },
    { category: 'godowns', path: '/api/godowns' },
    { category: 'payment_options', path: '/api/payment-options' },
    { category: 'card_types', path: '/api/card-types' },
    { category: 'colors', path: '/api/colors' },
    { category: 'units', path: '/api/units' },
    { category: 'segments', path: '/api/segments' },
    { category: 'system_config', path: '/api/system-config' },
    { category: 'number_formats', path: '/api/number-formats' },
  ];

  await Promise.allSettled(
    warmupPaths.map(async ({ category, path }) => {
      try {
        const data = await fetchFn(path);
        const items = Array.isArray(data) ? data : data.data || data.configs || data.formats || data.templates || [];
        appCache.set(cacheKey(category, 'list'), items, getTTLForCategory(category));
      } catch {
        // Silently fail - cache will be populated on demand
      }
    })
  );
}
