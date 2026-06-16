// ============================================================
// CSRF PROTECTION — Cross-Site Request Forgery token management
//
// Generates and verifies CSRF tokens tied to sessions (user IDs).
// Tokens are reusable within their validity period (1 hour) to
// support concurrent and sequential requests without race conditions.
// Expired tokens are cleaned up every 10 minutes to prevent memory leaks.
//
// USAGE:
// - Token is generated on login and included in the login response
// - Token can also be fetched via GET /api/csrf-token
// - Frontend includes token in X-CSRF-Token header for POST/PUT/DELETE
// - withApiSecurity() verifies the token for state-changing requests
//
// ENFORCEMENT MODE (strict — default):
// - If X-CSRF-Token header is present → verified strictly (block if invalid)
// - If X-CSRF-Token header is absent → BLOCKED (returns 403)
// - Set CSRF_ENFORCE=false env var to enable transitional mode (warning-only)
// ============================================================

import { randomBytes } from 'crypto';

// CSRF token generation and verification
const TOKEN_LENGTH = 32;
const TOKEN_EXPIRY = 60 * 60 * 1000; // 1 hour
const MAX_TOKEN_USES = 100;

interface CsrfTokenEntry {
  token: string;
  createdAt: number;
  uses: number;
}

// ── Global store — persists across Next.js hot reloads ──
const globalForCsrf = globalThis as unknown as {
  __csrfTokenStore: Map<string, CsrfTokenEntry> | undefined;
  __csrfCleanupStarted: boolean | undefined;
};

const tokenStore: Map<string, CsrfTokenEntry> = globalForCsrf.__csrfTokenStore ?? new Map();
globalForCsrf.__csrfTokenStore = tokenStore;

// Cleanup expired tokens every 10 minutes (only start once)
if (!globalForCsrf.__csrfCleanupStarted && typeof setInterval !== 'undefined') {
  globalForCsrf.__csrfCleanupStarted = true;
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of tokenStore.entries()) {
      if (now - entry.createdAt > TOKEN_EXPIRY) {
        tokenStore.delete(key);
      }
    }
  }, 600000).unref?.(); // Don't prevent process exit
}

/**
 * generateCsrfToken — Creates a new CSRF token for the given session.
 * The token is stored in-memory and can be verified multiple times
 * within its validity period (1 hour, up to MAX_TOKEN_USES verifications).
 *
 * @param sessionId - Unique session identifier (typically user ID)
 * @returns The generated CSRF token string
 */
export function generateCsrfToken(sessionId: string): string {
  const token = randomBytes(TOKEN_LENGTH).toString('hex');
  tokenStore.set(`${sessionId}:${token}`, { token, createdAt: Date.now(), uses: 0 });
  return token;
}

/**
 * verifyCsrfToken — Verifies a CSRF token for the given session.
 * Tokens are reusable within their validity period and use limit.
 * Returns true if the token is valid, false otherwise.
 *
 * @param sessionId - Unique session identifier (typically user ID)
 * @param token - The CSRF token to verify
 * @returns true if the token is valid and not expired
 */
export function verifyCsrfToken(sessionId: string, token: string): boolean {
  const entry = tokenStore.get(`${sessionId}:${token}`);
  if (!entry) return false;
  if (Date.now() - entry.createdAt > TOKEN_EXPIRY) {
    tokenStore.delete(`${sessionId}:${token}`);
    return false;
  }
  if (entry.uses >= MAX_TOKEN_USES) {
    tokenStore.delete(`${sessionId}:${token}`);
    return false;
  }
  // Token is valid — increment use count (reusable within limits)
  entry.uses += 1;
  return true;
}

/**
 * isCsrfEnforced — Checks if strict CSRF enforcement is enabled.
 * When true (default), requests without a valid CSRF token are blocked.
 * When false (transitional mode), missing tokens are allowed with a warning log.
 *
 * Controlled by CSRF_ENFORCE environment variable:
 * - CSRF_ENFORCE not set  → true (enforced, secure default)
 * - CSRF_ENFORCE=true     → true (enforced)
 * - CSRF_ENFORCE=false    → false (transitional, warning-only)
 */
export function isCsrfEnforced(): boolean {
  return process.env.CSRF_ENFORCE !== 'false';
}
