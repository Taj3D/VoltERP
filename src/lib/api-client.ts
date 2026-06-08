/**
 * Shared API Client for VoltERP
 *
 * Canonical apiFetch with:
 * - JWT Bearer token from singleton authState
 * - Auto-refresh on 401 (expired token)
 * - Retry after successful refresh
 * - Force logout on persistent 401
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
      authState = { isAuthenticated: false, user: null, accessToken: null, refreshToken: null, tokenExpiry: null };
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
  authState = { isAuthenticated: false, user: null, accessToken: null, refreshToken: null, tokenExpiry: null };
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
// CANONICAL apiFetch
// ============================================================

export async function apiFetch(path: string, opts?: RequestInit): Promise<any> {
  // Server-side RBAC: send JWT Bearer token in Authorization header
  const authHeaders: Record<string, string> = { "Content-Type": "application/json" };
  if (authState.accessToken) {
    authHeaders["Authorization"] = `Bearer ${authState.accessToken}`;
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
