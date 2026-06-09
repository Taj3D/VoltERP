// ============================================================
// CSRF PROTECTION — Cross-Site Request Forgery token management
//
// Generates and verifies one-time-use CSRF tokens tied to sessions.
// Tokens expire after 1 hour. Expired tokens are cleaned up every
// 10 minutes to prevent memory leaks.
//
// USAGE:
// - Frontend fetches a token via GET /api/csrf-token
// - Frontend includes token in X-CSRF-Token header for POST/PUT/DELETE
// - Middleware verifies the token before passing request to handler
// ============================================================

import { randomBytes } from 'crypto';

// CSRF token generation and verification
const TOKEN_LENGTH = 32;
const TOKEN_EXPIRY = 60 * 60 * 1000; // 1 hour

interface CsrfTokenEntry {
  token: string;
  createdAt: number;
}

// In-memory store for CSRF tokens (per session)
const tokenStore = new Map<string, CsrfTokenEntry>();

// Cleanup expired tokens every 10 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of tokenStore.entries()) {
      if (now - entry.createdAt > TOKEN_EXPIRY) {
        tokenStore.delete(key);
      }
    }
  }, 600000).unref?.(); // Don't prevent process exit
}

export function generateCsrfToken(sessionId: string): string {
  const token = randomBytes(TOKEN_LENGTH).toString('hex');
  tokenStore.set(`${sessionId}:${token}`, { token, createdAt: Date.now() });
  return token;
}

export function verifyCsrfToken(sessionId: string, token: string): boolean {
  const entry = tokenStore.get(`${sessionId}:${token}`);
  if (!entry) return false;
  if (Date.now() - entry.createdAt > TOKEN_EXPIRY) {
    tokenStore.delete(`${sessionId}:${token}`);
    return false;
  }
  // Token is valid — one-time use, delete after verification
  tokenStore.delete(`${sessionId}:${token}`);
  return true;
}
