// ============================================================
// RATE LIMITER — Multi-tier in-memory rate limiting
//
// Two tiers:
// 1. FAILED AUTH RATE LIMIT — Strict (5 fails / 60s per IP per endpoint)
//    For login, password change, and other auth-sensitive endpoints.
//    Tracks FAILED attempts only — resets on success.
//
// 2. GENERAL API RATE LIMIT — Permissive (100 requests / 60s per IP)
//    For all API endpoints via withApiSecurity().
//    Tracks ALL requests — prevents abuse, scraping, DDoS.
//    Write operations (POST/PUT/DELETE) get a lower limit (30/60s).
//
// Uses in-memory Map (not database) for performance.
// State is lost on server restart — acceptable for rate limiting.
// Periodic cleanup every 5 minutes prevents memory leaks.
// ============================================================

// ─────────────────────────────────────────────────────────────
// TIER 1: FAILED AUTH RATE LIMIT (existing, unchanged)
// ─────────────────────────────────────────────────────────────

interface RateLimitEntry {
  attempts: number;
  windowStart: number; // Unix timestamp in milliseconds
}

const authRateLimitStore = new Map<string, RateLimitEntry>();

/** Auth rate limit: 60-second sliding window, max 5 failed attempts */
const AUTH_WINDOW_MS = 60_000;
const AUTH_MAX_ATTEMPTS = 5;

export function checkRateLimit(
  ipAddress: string,
  endpoint: string
): { allowed: boolean; remainingAttempts: number; retryAfterSeconds: number } {
  const key = `auth:${ipAddress}:${endpoint}`;
  const now = Date.now();
  const entry = authRateLimitStore.get(key);

  if (!entry) {
    return { allowed: true, remainingAttempts: AUTH_MAX_ATTEMPTS, retryAfterSeconds: 0 };
  }

  if (now - entry.windowStart >= AUTH_WINDOW_MS) {
    authRateLimitStore.delete(key);
    return { allowed: true, remainingAttempts: AUTH_MAX_ATTEMPTS, retryAfterSeconds: 0 };
  }

  if (entry.attempts >= AUTH_MAX_ATTEMPTS) {
    const remainingMs = AUTH_WINDOW_MS - (now - entry.windowStart);
    return { allowed: false, remainingAttempts: 0, retryAfterSeconds: Math.ceil(remainingMs / 1000) };
  }

  return { allowed: true, remainingAttempts: AUTH_MAX_ATTEMPTS - entry.attempts, retryAfterSeconds: 0 };
}

export function recordFailedAttempt(ipAddress: string, endpoint: string): void {
  const key = `auth:${ipAddress}:${endpoint}`;
  const now = Date.now();
  const entry = authRateLimitStore.get(key);

  if (!entry || now - entry.windowStart >= AUTH_WINDOW_MS) {
    authRateLimitStore.set(key, { attempts: 1, windowStart: now });
  } else {
    entry.attempts += 1;
  }
}

export function resetRateLimit(ipAddress: string, endpoint: string): void {
  authRateLimitStore.delete(`auth:${ipAddress}:${endpoint}`);
}

export function getRateLimitStatus(
  ipAddress: string,
  endpoint: string
): { attempts: number; windowStart: number; isLocked: boolean; retryAfterSeconds: number } {
  const key = `auth:${ipAddress}:${endpoint}`;
  const now = Date.now();
  const entry = authRateLimitStore.get(key);

  if (!entry || now - entry.windowStart >= AUTH_WINDOW_MS) {
    if (entry) authRateLimitStore.delete(key);
    return { attempts: 0, windowStart: 0, isLocked: false, retryAfterSeconds: 0 };
  }

  const isLocked = entry.attempts >= AUTH_MAX_ATTEMPTS;
  const retryAfterSeconds = isLocked ? Math.ceil((AUTH_WINDOW_MS - (now - entry.windowStart)) / 1000) : 0;

  return { attempts: entry.attempts, windowStart: entry.windowStart, isLocked, retryAfterSeconds };
}

// ─────────────────────────────────────────────────────────────
// TIER 2: GENERAL API RATE LIMIT (new)
// ─────────────────────────────────────────────────────────────

interface ApiRateLimitEntry {
  count: number;
  windowStart: number;
}

const apiRateLimitStore = new Map<string, ApiRateLimitEntry>();

/** General API rate limits per HTTP method
 *
 * Tuned for an enterprise ERP where a single dashboard load fires ~10 parallel
 * GETs (KPI, trend, category-turnover, stock-alerts, ratios, top-performers,
 * payment-mix, receivables-aging, dashboard, daily-trend) plus periodic polling
 * (notifications every 30s) plus module-page fetches (5-15 GETs per page click).
 * With 100/min we hit the ceiling during normal navigation. 500/min per IP gives
 * legitimate users a smooth experience while still blocking obvious abuse.
 */
const API_RATE_CONFIGS = {
  GET:    { windowMs: 60_000, maxRequests: 500 },  // 500 reads per minute per IP
  POST:   { windowMs: 60_000, maxRequests: 120 },  // 120 creates per minute
  PUT:    { windowMs: 60_000, maxRequests: 120 },  // 120 updates per minute
  DELETE: { windowMs: 60_000, maxRequests: 60 },   // 60 deletes per minute
} as const;

/**
 * checkApiRateLimit — Checks general API rate limit for a given IP + method.
 * Returns { allowed, retryAfterSeconds } — if not allowed, returns 429 info.
 *
 * @param ipAddress - Client IP address
 * @param method - HTTP method (GET, POST, PUT, DELETE)
 * @returns Whether the request is allowed and retry info if not
 */
export function checkApiRateLimit(
  ipAddress: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
): { allowed: boolean; retryAfterSeconds: number; limit: number; remaining: number } {
  const config = API_RATE_CONFIGS[method] || API_RATE_CONFIGS.GET;
  const key = `api:${ipAddress}:${method}`;
  const now = Date.now();

  let entry = apiRateLimitStore.get(key);

  // No entry or expired window — create new
  if (!entry || now - entry.windowStart >= config.windowMs) {
    entry = { count: 1, windowStart: now };
    apiRateLimitStore.set(key, entry);
    return { allowed: true, retryAfterSeconds: 0, limit: config.maxRequests, remaining: config.maxRequests - 1 };
  }

  // Within window — check count
  entry.count += 1;

  if (entry.count > config.maxRequests) {
    const remainingMs = config.windowMs - (now - entry.windowStart);
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(remainingMs / 1000),
      limit: config.maxRequests,
      remaining: 0,
    };
  }

  return {
    allowed: true,
    retryAfterSeconds: 0,
    limit: config.maxRequests,
    remaining: config.maxRequests - entry.count,
  };
}

/**
 * getClientIp — Extracts client IP from request headers.
 * Handles proxy headers (x-forwarded-for, x-real-ip) for reverse proxy setups.
 */
export function getClientIp(request: { headers: { get: (name: string) => string | null } }): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

// ─────────────────────────────────────────────────────────────
// PERIODIC CLEANUP — Prevent memory leaks from stale entries
// Runs every 5 minutes, removes entries older than 10 minutes
// ─────────────────────────────────────────────────────────────

const CLEANUP_INTERVAL_MS = 5 * 60_000; // 5 minutes
const MAX_AGE_MS = 10 * 60_000; // 10 minutes

let lastCleanup = Date.now();

function cleanupStaleEntries() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  // Clean auth store
  for (const [key, entry] of authRateLimitStore.entries()) {
    if (now - entry.windowStart > MAX_AGE_MS) {
      authRateLimitStore.delete(key);
    }
  }

  // Clean API store
  for (const [key, entry] of apiRateLimitStore.entries()) {
    if (now - entry.windowStart > MAX_AGE_MS) {
      apiRateLimitStore.delete(key);
    }
  }
}

// Run cleanup on import (lazy — only when rate limiter is actually used)
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupStaleEntries, CLEANUP_INTERVAL_MS).unref?.(); // Don't prevent process exit
}
