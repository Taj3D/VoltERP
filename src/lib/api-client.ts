/**
 * Shared API Client for VoltERP
 *
 * Canonical apiFetch with:
 * - JWT Bearer token from singleton authState
 * - Auto-refresh on 401 (expired token)
 * - Retry after successful refresh
 * - Force logout on persistent 401
 * - Client-side LRU memory cache for GET requests (apiFetchCached)
 * - Automatic cache invalidation on write operations
 *
 * All component files should import apiFetch from here
 * instead of defining their own inline copies.
 */

// ============================================================
// TYPES
// ============================================================

export type UserRole = "admin" | "manager" | "sr" | "dealer" | "vat_auditor";

export interface AuthUser {
  name: string;
  email: string;
  role: UserRole;
  displayName: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiry: number | null; // epoch ms when access token expires
  csrfToken: string | null; // CSRF token from login (reusable within validity period)
}

// ============================================================
// SINGLETON AUTH STATE
// ============================================================

export let authState: AuthState = {
  isAuthenticated: false,
  user: null,
  accessToken: null,
  refreshToken: null,
  tokenExpiry: null,
  csrfToken: null,
};

export let authListeners: Array<() => void> = [];

// ── JWT Token Auto-Refresh ──
// Proactively refreshes the access token 5 minutes before expiry
// Prevents unexpected logouts during active sessions
let refreshTimerRef: ReturnType<typeof setTimeout> | null = null;

export function scheduleTokenRefresh() {
  // Clear any existing refresh timer
  if (refreshTimerRef) {
    clearTimeout(refreshTimerRef);
    refreshTimerRef = null;
  }

  if (!authState.refreshToken || !authState.tokenExpiry) return;

  const now = Date.now();
  const expiresAt = authState.tokenExpiry;
  const refreshThreshold = 5 * 60 * 1000; // 5 minutes before expiry

  const timeUntilRefresh = expiresAt - now - refreshThreshold;

  if (timeUntilRefresh <= 0) {
    // Token already within refresh window or expired — refresh immediately
    performTokenRefresh();
    return;
  }

  // Schedule refresh for 5 minutes before expiry
  refreshTimerRef = setTimeout(() => {
    performTokenRefresh();
  }, timeUntilRefresh);
}

async function performTokenRefresh() {
  if (!authState.refreshToken) return;

  try {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: authState.refreshToken }),
    });

    if (!res.ok) {
      // Refresh token expired — force re-login
      authState = { isAuthenticated: false, user: null, accessToken: null, refreshToken: null, tokenExpiry: null, csrfToken: null };
      localStorage.removeItem("ems_auth");
      authListeners.forEach(l => l());
      return;
    }

    const data = await res.json();

    // Decode new access token to get expiry
    let tokenExpiry: number | null = null;
    try {
      const payload = JSON.parse(atob(data.accessToken.split(".")[1]));
      tokenExpiry = payload.exp * 1000;
    } catch {}

    authState = {
      ...authState,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken || authState.refreshToken,
      tokenExpiry,
    };
    localStorage.setItem("ems_auth", JSON.stringify(authState));
    authListeners.forEach(l => l());

    // Schedule next refresh
    scheduleTokenRefresh();
  } catch {
    // Network error — don't force logout, just skip this refresh cycle
    // Will retry on next scheduled interval or on next API call
  }
}

// ============================================================
// HELPER: Set auth state (used by useAuth login/logout)
// ============================================================

export function setAuthState(newState: AuthState) {
  authState = newState;
  localStorage.setItem("ems_auth", JSON.stringify(authState));
  authListeners.forEach(l => l());
}

export function clearAuthState() {
  // Clear refresh timer
  if (refreshTimerRef) {
    clearTimeout(refreshTimerRef);
    refreshTimerRef = null;
  }
  authState = { isAuthenticated: false, user: null, accessToken: null, refreshToken: null, tokenExpiry: null, csrfToken: null };
  localStorage.removeItem("ems_auth");
  authListeners.forEach(l => l());
}

// ============================================================
// HELPER: Initialize auth state from localStorage
// ============================================================

export function initAuthState() {
  const stored = localStorage.getItem("ems_auth");
  if (stored) {
    try {
      const parsed = JSON.parse(stored);

      // ── Stale Session Migration ──
      // If the stored session has no JWT access token (pre-Phase 3 session),
      // force a clean re-login instead of proceeding with broken auth
      if (parsed.isAuthenticated && !parsed.accessToken) {
        clearAuthState();
        return;
      }

      // ── Expired Token Check ──
      // If the access token has already expired and no refresh token, force re-login
      if (parsed.tokenExpiry && parsed.tokenExpiry < Date.now() && !parsed.refreshToken) {
        clearAuthState();
        return;
      }

      authState = parsed;

      // If token is expired but we have a refresh token, try refreshing immediately
      if (parsed.tokenExpiry && parsed.tokenExpiry < Date.now() && parsed.refreshToken) {
        performTokenRefresh();
      } else {
        // Schedule proactive refresh for valid token
        scheduleTokenRefresh();
      }

      authListeners.forEach(l => l());
    } catch {
      // Corrupted localStorage — clear and force re-login
      clearAuthState();
    }
  }
}

// ============================================================
// CSRF TOKEN CACHE
// ============================================================

/**
 * getCsrfToken — Returns the cached CSRF token from login or fetches a new one.
 * The token from login is reusable within its validity period (1 hour).
 * Falls back to fetching from /api/csrf-token if no cached token is available.
 */
async function getCsrfToken(): Promise<string | null> {
  // Prefer token from login response (already cached in authState)
  if (authState.csrfToken) {
    return authState.csrfToken;
  }

  // Fallback: fetch a new token from the server
  if (!authState.accessToken) return null;
  try {
    const res = await fetch("/api/csrf-token", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authState.accessToken}`,
      },
    });
    if (res.ok) {
      const data = await res.json();
      // Cache in auth state for reuse
      authState = { ...authState, csrfToken: data.csrfToken };
      return data.csrfToken;
    }
  } catch {
    // CSRF token fetch failed — continue without it (log-only mode)
  }
  return null;
}

// ============================================================
// CLIENT-SIDE RESPONSE CACHE
// ============================================================

import { appCache, cacheKey, getTTLForCategory } from '@/lib/cache-utils';

/**
 * Extract a cache category from an API path.
 * E.g. "/api/products" → "products", "/api/sms-settings/123" → "sms-settings"
 */
function pathToCategory(path: string): string {
  const match = path.match(/^\/api\/([^/?#]+)/);
  return match ? match[1] : 'unknown';
}

/**
 * Build a cache key for a given API path.
 * Includes the full path (with query string) to differentiate filtered queries.
 */
function buildCacheKey(path: string, category: string): string {
  return cacheKey(category, path);
}

/**
 * Invalidate cache entries for a given path prefix.
 * Called automatically after write operations, or manually via apiBustCache().
 *
 * @param path - The API path prefix to invalidate (e.g. "/api/products")
 * @returns Number of cache entries invalidated
 */
export function apiBustCache(path: string): number {
  const category = pathToCategory(path);
  // Invalidate both the specific category prefix and the exact path key
  const count = appCache.invalidatePrefix(`${category}:`);
  return count;
}

// ============================================================
// CANONICAL apiFetch (uncached — backward compatible)
// ============================================================

export async function apiFetch(path: string, opts?: RequestInit & { cachePrefix?: string; bustCache?: boolean }): Promise<any> {
  // Server-side RBAC: send JWT Bearer token in Authorization header
  const authHeaders: Record<string, string> = { "Content-Type": "application/json" };
  if (authState.accessToken) {
    authHeaders["Authorization"] = `Bearer ${authState.accessToken}`;
  }

  // ── CSRF Token for Write Operations ──
  // For POST/PUT/DELETE requests, include a CSRF token in the X-CSRF-Token header.
  // The token is sourced from login response (cached in authState) or fetched on-demand.
  // Tokens are reusable within their 1-hour validity period.
  const method = (opts?.method || "GET").toUpperCase();
  const isWriteOp = method === "POST" || method === "PUT" || method === "DELETE";

  if (isWriteOp && authState.accessToken) {
    const csrfToken = await getCsrfToken();
    if (csrfToken) {
      authHeaders["X-CSRF-Token"] = csrfToken;
    }
  }

  // ── Cache busting on write operations ──
  // After a successful write, invalidate the relevant cache entries
  // so subsequent GET requests fetch fresh data.
  const category = opts?.cachePrefix || pathToCategory(path);

  if (opts?.bustCache || isWriteOp) {
    // Bust cache before the request for writes (data will change)
    appCache.invalidatePrefix(`${category}:`);
    // Also bust related categories for common relationships
    if (category === 'products') {
      appCache.invalidatePrefix('product-stock:');
      appCache.invalidatePrefix('stock:');
    } else if (category === 'sales-orders') {
      appCache.invalidatePrefix('dashboard_kpi:');
      appCache.invalidatePrefix('stock:');
    } else if (category === 'purchase-orders') {
      appCache.invalidatePrefix('dashboard_kpi:');
      appCache.invalidatePrefix('stock:');
    }
  }

  const res = await fetch(path, { headers: { ...authHeaders, ...opts?.headers as Record<string, string> }, ...opts });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    // If 401 with expired token, try to refresh once before forcing logout
    if (res.status === 401 && authState.refreshToken && err.expired) {
      try {
        const refreshRes = await fetch("/api/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: authState.refreshToken }),
        });
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          let tokenExpiry: number | null = null;
          try {
            const payload = JSON.parse(atob(data.accessToken.split(".")[1]));
            tokenExpiry = payload.exp * 1000;
          } catch {}
          authState = {
            ...authState,
            accessToken: data.accessToken,
            refreshToken: data.refreshToken || authState.refreshToken,
            tokenExpiry,
          };
          localStorage.setItem("ems_auth", JSON.stringify(authState));
          authListeners.forEach(l => l());
          scheduleTokenRefresh();

          // Retry the original request with new token
          const retryHeaders: Record<string, string> = { "Content-Type": "application/json", "Authorization": `Bearer ${data.accessToken}` };
          const retryRes = await fetch(path, { headers: { ...retryHeaders, ...opts?.headers as Record<string, string> }, ...opts });
          if (!retryRes.ok) {
            const retryErr = await retryRes.json().catch(() => ({ error: retryRes.statusText }));
            if (retryRes.status === 401) {
              // Even after refresh, still 401 — force logout
              clearAuthState();
            }
            throw new Error(retryErr.error || "Request failed");
          }
          return retryRes.json();
        }
      } catch (retryError) {
        // Refresh failed — fall through to logout
      }
    }
    // If 401 without refresh possibility, force logout (session expired)
    if (res.status === 401) {
      clearAuthState();
    }
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

// ============================================================
// CACHED apiFetchCached — checks cache first, falls back to network
// ============================================================

export interface CachedFetchOptions extends RequestInit {
  /** Cache category prefix (auto-detected from path if omitted) */
  cachePrefix?: string;
  /** Custom TTL in milliseconds (uses category default if omitted) */
  cacheTtl?: number;
  /** Force bypass cache and always fetch from network */
  forceRefresh?: boolean;
}

/**
 * Cached GET request — checks the client-side LRU cache first.
 * On cache miss, performs a network request via apiFetch and stores the result.
 *
 * Only works for GET requests (method is forced to GET).
 * For write operations, use apiFetch() which auto-busts the cache.
 *
 * @example
 * // Simple cached fetch (auto-detects category & TTL)
 * const products = await apiFetchCached("/api/products")
 *
 * // With custom cache prefix and TTL
 * const data = await apiFetchCached("/api/products?category=tv", {
 *   cachePrefix: "products",
 *   cacheTtl: 60_000, // 1 minute
 * })
 *
 * // Force refresh (bypass cache)
 * const fresh = await apiFetchCached("/api/products", { forceRefresh: true })
 */
export async function apiFetchCached(path: string, opts?: CachedFetchOptions): Promise<any> {
  const category = opts?.cachePrefix || pathToCategory(path);
  const key = buildCacheKey(path, category);
  const ttl = opts?.cacheTtl ?? getTTLForCategory(category);

  // Check cache first (unless forceRefresh is set)
  if (!opts?.forceRefresh) {
    const cached = appCache.get<any>(key);
    if (cached !== undefined) {
      return cached;
    }
  }

  // Cache miss — fetch from network (force GET method)
  const fetchOpts: RequestInit & { cachePrefix?: string } = {
    ...opts,
    method: 'GET',
  };
  // Remove our custom options before passing to apiFetch
  delete (fetchOpts as Record<string, unknown>).cacheTtl;
  delete (fetchOpts as Record<string, unknown>).forceRefresh;
  delete fetchOpts.cachePrefix;

  const data = await apiFetch(path, fetchOpts);

  // Store in cache
  appCache.set(key, data, ttl);

  return data;
}
