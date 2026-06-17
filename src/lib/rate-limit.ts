// ============================================================
// RATE LIMIT — In-memory sliding window rate limiter
//
// Used by Next.js middleware (src/middleware.ts) to enforce
// per-IP rate limits on all API routes BEFORE they reach handlers.
//
// Three tiers:
// 1. AUTH endpoints (login, reset-password): 5 req/min per IP
// 2. WRITE endpoints (POST, PUT, DELETE): 60 req/min per IP
// 3. READ endpoints (GET): 100 req/min per IP
//
// Uses a true sliding window (individual timestamps) for accuracy.
// Cleanup runs every 60 seconds to prevent memory leaks.
// ============================================================

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// ─────────────────────────────────────────────────────────────
// PERIODIC CLEANUP — Remove expired entries every 60 seconds
// ─────────────────────────────────────────────────────────────

if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      // Remove timestamps older than 60 seconds (longest window)
      entry.timestamps = entry.timestamps.filter(t => now - t < 60_000);
      // Delete entries with no remaining timestamps
      if (entry.timestamps.length === 0) {
        store.delete(key);
      }
    }
  }, 60_000).unref?.(); // Don't prevent process exit
}

// ─────────────────────────────────────────────────────────────
// RATE LIMIT CONFIGURATION
// ─────────────────────────────────────────────────────────────

export interface RateLimitConfig {
  windowMs: number;    // Time window in milliseconds
  maxRequests: number; // Max requests per window
}

export const RATE_LIMITS = {
  /** Auth endpoints — strict limit to prevent brute force */
  auth: { windowMs: 60_000, maxRequests: 10 },
  /** Write operations (POST, PUT, DELETE) */
  write: { windowMs: 60_000, maxRequests: 120 },
  /** General read (GET) — tuned for ERP dashboards that fire ~10 parallel GETs */
  read: { windowMs: 60_000, maxRequests: 500 },
} as const;

// ─────────────────────────────────────────────────────────────
// CORE RATE LIMIT CHECK — Sliding window algorithm
// ─────────────────────────────────────────────────────────────

/**
 * checkRateLimit — Checks if a request is allowed based on sliding window.
 *
 * @param key - Composite key (e.g., "ip:path") for rate limit bucket
 * @param config - Rate limit configuration (window + max)
 * @returns Result with allowed status, remaining quota, and retry-after if limited
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; retryAfter?: number } {
  const now = Date.now();
  let entry = store.get(key);

  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Filter out timestamps outside the sliding window
  entry.timestamps = entry.timestamps.filter(t => now - t < config.windowMs);

  // Check if limit exceeded
  if (entry.timestamps.length >= config.maxRequests) {
    const oldestInWindow = entry.timestamps[0];
    const retryAfter = Math.ceil((oldestInWindow + config.windowMs - now) / 1000);
    return { allowed: false, remaining: 0, retryAfter: Math.max(retryAfter, 1) };
  }

  // Record this request
  entry.timestamps.push(now);
  return { allowed: true, remaining: config.maxRequests - entry.timestamps.length };
}

// ─────────────────────────────────────────────────────────────
// KEY GENERATION
// ─────────────────────────────────────────────────────────────

/**
 * getRateLimitKey — Generates a composite key for the rate limit bucket.
 * Uses IP + path to allow different limits per endpoint.
 *
 * @param ip - Client IP address
 * @param path - Request path (used to segment buckets)
 * @returns Composite key string
 */
export function getRateLimitKey(ip: string, path: string): string {
  return `${ip}:${path}`;
}

/**
 * getClientIp — Extracts client IP from Next.js request headers.
 * Handles proxy headers (x-forwarded-for, x-real-ip) for reverse proxy setups.
 */
export function getClientIp(request: { headers: { get: (name: string) => string | null } }): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}
