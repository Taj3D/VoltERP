// ============================================================
// SERVER-SIDE SMS SETTINGS CACHE
// Caches active SmsSetting records in memory with a 5-minute TTL.
// Eliminates redundant db.smsSetting.findFirst() calls across
// 12+ API routes that all query the same settings.
// ============================================================

import { db } from '@/lib/db';

// ── Types ──

interface CachedSmsSetting {
  setting: any; // SmsSetting record from Prisma
  expiresAt: number; // epoch ms
}

// ── Cache Storage ──

const SMS_SETTINGS_TTL = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, CachedSmsSetting>();

// ── Cleanup timer (runs every 5 minutes to prune expired entries) ──

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function startCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of cache.entries()) {
      if (now > entry.expiresAt) {
        cache.delete(key);
      }
    }
  }, SMS_SETTINGS_TTL);
}

// Start cleanup on module load (server-side only)
if (typeof window === 'undefined') {
  startCleanup();
}

// ── Cache Key Builder ──

function buildCacheKey(companyId: string | null | undefined): string {
  return companyId ? `sms-settings:${companyId}` : 'sms-settings:global';
}

// ── Public API ──

/**
 * Get the active SmsSetting for a given company, using in-memory cache.
 * Falls back to a database query on cache miss.
 *
 * @param companyId - The company ID to filter by (null/undefined for global settings)
 * @returns The active SmsSetting record, or null if none exists
 */
export async function getCachedSmsSettings(companyId: string | null | undefined): Promise<any> {
  const key = buildCacheKey(companyId);
  const now = Date.now();

  // Check cache
  const cached = cache.get(key);
  if (cached && now <= cached.expiresAt) {
    return cached.setting;
  }

  // Cache miss — fetch from database
  const where: Record<string, unknown> = { isActive: true };
  if (companyId) {
    where.companyId = companyId;
  }

  const setting = await db.smsSetting.findFirst({
    where,
    orderBy: { createdAt: 'desc' },
  });

  // Store in cache (even if null, to avoid repeated DB queries for missing settings)
  cache.set(key, {
    setting,
    expiresAt: now + SMS_SETTINGS_TTL,
  });

  return setting;
}

/**
 * Invalidate the SMS settings cache.
 * Call this after any SMS settings mutation (create, update, delete).
 *
 * @param companyId - If provided, only invalidates that company's cache.
 *                    If omitted, clears the entire SMS settings cache.
 */
export function invalidateSmsSettingsCache(companyId?: string | null): void {
  if (companyId) {
    const key = buildCacheKey(companyId);
    cache.delete(key);
    // Also invalidate the global key in case the setting affects global queries
    cache.delete('sms-settings:global');
  } else {
    // Clear all SMS settings cache entries
    cache.clear();
  }
}

/**
 * Get cache statistics for monitoring/debugging.
 */
export function getSmsSettingsCacheStats(): {
  size: number;
  entries: Array<{ key: string; expiresAt: number; isExpired: boolean }>;
} {
  const now = Date.now();
  const entries = Array.from(cache.entries()).map(([key, entry]) => ({
    key,
    expiresAt: entry.expiresAt,
    isExpired: now > entry.expiresAt,
  }));

  return {
    size: cache.size,
    entries,
  };
}
