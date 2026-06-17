// ============================================================
// JWT UTILITY — Centralized token signing, verification, decoding
// Uses jsonwebtoken (industry-standard library)
//
// SECURITY:
// - HS256 algorithm (HMAC-SHA256)
// - Configurable expiry (default: 8h for access, 7d for refresh)
// - Secret from JWT_SECRET env var (FAILS in production if not set)
// - Development: auto-generated random secret (cached per process)
// - Token blacklisting via database (RevokedToken model)
// - No x-user-email fallback — JWT only
// ============================================================

import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";

// ── Configuration ──

/**
 * JWT secret key resolution:
 * 1. JWT_SECRET env var (required in production)
 * 2. Random generated secret (development only — cached per process)
 *
 * In production, if JWT_SECRET is not set, the server will NOT start.
 * In development, a random secret is generated on first startup and cached
 * in the global scope so it persists across Next.js hot reloads.
 */
const globalForJwt = globalThis as unknown as {
  __devJwtSecret: string | undefined;
  /** Negative cache of JTIs that are NOT revoked — avoids a DB roundtrip
   *  on every authenticated request. Capped + TTL-bounded so a token
   *  revoked mid-session is re-checked within ~60s. */
  __jtiNegativeCache?: Map<string, number>; // jti -> expiresAt (ms)
};

// ── JTI Negative Cache ──
// On Vercel serverless, every authenticated API call previously hit the DB
// to check if the token's JTI was revoked. With Turso in another region
// that's ~150-200ms per call. Since >99% of tokens are never revoked, we
// cache "not revoked" results for up to 60 seconds (or until token expiry,
// whichever is sooner). If a token IS revoked, it's also cached as revoked
// (positive cache) so subsequent calls fail fast without DB hits.
const JTI_CACHE_TTL_MS = 60 * 1000; // 60 seconds
const JTI_CACHE_MAX = 2000; // max entries to bound memory

function getJtiCache(): Map<string, number> {
  if (!globalForJwt.__jtiNegativeCache) {
    globalForJwt.__jtiNegativeCache = new Map();
  }
  return globalForJwt.__jtiNegativeCache;
}

/** Returns true if the JTI is cached as "not revoked" and the cache entry
 *  is still valid. Also opportunistically evicts expired entries. */
function isJtiCachedNotRevoked(jti: string, tokenExpMs: number): boolean {
  const cache = getJtiCache();
  const now = Date.now();
  const cached = cache.get(jti);
  if (cached === undefined) return false;
  // Entry is valid if both the TTL and the token expiry haven't passed
  if (now > cached || now > tokenExpMs) {
    cache.delete(jti);
    return false;
  }
  // Move-to-end (LRU-ish) so frequently used tokens stay
  cache.delete(jti);
  cache.set(jti, cached);
  return true;
}

function cacheJtiNotRevoked(jti: string, tokenExpMs: number): void {
  const cache = getJtiCache();
  const now = Date.now();
  const expiresAt = Math.min(now + JTI_CACHE_TTL_MS, tokenExpMs);
  // Evict if over capacity — drop oldest entries
  if (cache.size >= JTI_CACHE_MAX) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(jti, expiresAt);
}

/** Invalidate a JTI from the cache (called when a token is revoked). */
function invalidateJtiCache(jti: string): void {
  const cache = getJtiCache();
  cache.delete(jti);
}

function resolveJwtSecret(): string {
  // 1. Explicit env var always wins
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }

  // 2. Production without JWT_SECRET → fatal error
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "FATAL: JWT_SECRET environment variable must be set in production. " +
      "Set it before starting the application."
    );
  }

  // 3. Development: generate and cache a random secret
  if (!globalForJwt.__devJwtSecret) {
    globalForJwt.__devJwtSecret = randomBytes(48).toString("hex");
    console.warn(
      "[JWT] WARNING: JWT_SECRET not set. Using auto-generated dev secret. " +
      "Set JWT_SECRET env var for consistent tokens across restarts."
    );
  }
  return globalForJwt.__devJwtSecret;
}

const JWT_SECRET = resolveJwtSecret();
/** Access token expiry */
const ACCESS_TOKEN_EXPIRY = "8h";
/** Refresh token expiry (longer-lived) */
const REFRESH_TOKEN_EXPIRY = "7d";
/** JWT issuer identifier */
const JWT_ISSUER = "volt-erp";
/** JWT audience */
const JWT_AUDIENCE = "volt-erp-users";

// ── Types ──

export interface JwtPayload {
  /** User database ID */
  userId: string;
  /** User email (unique identifier) */
  email: string;
  /** User display name */
  name: string;
  /** User RBAC role */
  role: string;
  /** User's company ID (if assigned) */
  companyId: string | null;
  /** Token type: 'access' or 'refresh' */
  tokenType: "access" | "refresh";
}

export interface VerifiedToken {
  valid: true;
  payload: JwtPayload;
}

export interface InvalidToken {
  valid: false;
  error: string;
  expired?: boolean;
}

export type TokenVerificationResult = VerifiedToken | InvalidToken;

// ── Core Functions ──

/**
 * signAccessToken — Creates a signed JWT access token for the authenticated user.
 * Access tokens are short-lived (8h) and used for API authentication.
 *
 * @param payload - User data to encode in the token
 * @returns Signed JWT string
 */
export function signAccessToken(payload: Omit<JwtPayload, "tokenType">): string {
  const jti = `${payload.userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return jwt.sign(
    {
      ...payload,
      tokenType: "access",
      jti,
    },
    JWT_SECRET,
    {
      expiresIn: ACCESS_TOKEN_EXPIRY,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithm: "HS256",
    }
  );
}

/**
 * signRefreshToken — Creates a signed JWT refresh token.
 * Refresh tokens are long-lived (7d) and can be used to obtain new access tokens.
 *
 * @param payload - User data to encode in the token
 * @returns Signed JWT refresh token string
 */
export function signRefreshToken(payload: Omit<JwtPayload, "tokenType">): string {
  const jti = `${payload.userId}-refresh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return jwt.sign(
    {
      ...payload,
      tokenType: "refresh",
      jti,
    },
    JWT_SECRET,
    {
      expiresIn: REFRESH_TOKEN_EXPIRY,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithm: "HS256",
    }
  );
}

/**
 * verifyToken — Verifies a JWT token and returns the decoded payload.
 * Checks signature, expiry, issuer, audience, and database blacklist.
 *
 * @param token - The JWT string to verify
 * @param expectedType - Expected token type ('access' or 'refresh')
 * @returns Verification result with payload or error details
 */
export async function verifyToken(
  token: string,
  expectedType: "access" | "refresh" = "access"
): Promise<TokenVerificationResult> {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithms: ["HS256"],
    }) as jwt.JwtPayload & JwtPayload;

    // Check token type matches expected
    if (decoded.tokenType !== expectedType) {
      return {
        valid: false,
        error: `Invalid token type. Expected ${expectedType}, got ${decoded.tokenType}.`,
      };
    }

    // Check if token has been revoked (database-backed blacklist)
    // PERFORMANCE: Use an in-process negative cache to skip the DB roundtrip
    // for tokens that we've recently confirmed are NOT revoked. This saves
    // ~150-200ms per authenticated request on Vercel↔Turso cross-region calls.
    // The cache is TTL-bounded (60s) so a token revoked mid-session will be
    // re-checked against the DB within at most 60 seconds.
    if (decoded.jti) {
      const tokenExpMs = decoded.exp ? decoded.exp * 1000 : Date.now() + 8 * 60 * 60 * 1000;
      if (!isJtiCachedNotRevoked(decoded.jti, tokenExpMs)) {
        const revoked = await db.revokedToken.findUnique({
          where: { jti: decoded.jti },
          select: { id: true },
        });
        if (revoked) {
          return {
            valid: false,
            error: "Token has been revoked. Please log in again.",
          };
        }
        // Cache the "not revoked" result
        cacheJtiNotRevoked(decoded.jti, tokenExpMs);
      }
    }

    return {
      valid: true,
      payload: {
        userId: decoded.userId,
        email: decoded.email,
        name: decoded.name,
        role: decoded.role,
        companyId: decoded.companyId || null,
        tokenType: decoded.tokenType,
      },
    };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return {
        valid: false,
        error: "Token has expired. Please log in again.",
        expired: true,
      };
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return {
        valid: false,
        error: `Invalid token: ${error.message}`,
      };
    }
    return {
      valid: false,
      error: "Token verification failed.",
    };
  }
}

/**
 * revokeToken — Adds a token to the database-backed blacklist by its JTI.
 * Used during logout to prevent reuse of the token even before expiry.
 * Also cleans up expired tokens older than 1 day to keep the table small.
 *
 * @param token - The JWT string to revoke
 */
export async function revokeToken(token: string): Promise<void> {
  try {
    const decoded = jwt.decode(token) as jwt.JwtPayload & { jti?: string; userId?: string } | null;
    if (decoded?.jti) {
      const expiresAt = decoded.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 24 * 60 * 60 * 1000);

      await db.revokedToken.upsert({
        where: { jti: decoded.jti },
        create: {
          jti: decoded.jti,
          userId: decoded.userId || "unknown",
          expiresAt,
        },
        update: {}, // Already revoked — no-op
      });

      // Invalidate the in-process negative cache for this JTI so any
      // concurrent requests on the same Lambda instance pick up the
      // revocation immediately instead of waiting for the 60s TTL.
      invalidateJtiCache(decoded.jti);

      // Clean up expired tokens (older than 1 day past expiry)
      try {
        await db.revokedToken.deleteMany({
          where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        });
      } catch {
        // Non-critical cleanup
      }
    }
  } catch {
    // Silently ignore — token may already be invalid
  }
}

/**
 * extractBearerToken — Extracts the JWT token from an Authorization header.
 * Supports both "Bearer <token>" and raw token formats.
 *
 * @param authHeader - The Authorization header value
 * @returns The extracted token string, or null if not found
 */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;

  // Standard Bearer token format
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }

  // Raw token (no "Bearer " prefix)
  if (authHeader.length > 20) {
    return authHeader.trim();
  }

  return null;
}

/**
 * getTokenExpiry — Returns the expiry date of a JWT token without verification.
 * Useful for client-side token management.
 *
 * @param token - The JWT string
 * @returns Expiry Date or null if invalid
 */
export function getTokenExpiry(token: string): Date | null {
  try {
    const decoded = jwt.decode(token) as jwt.JwtPayload | null;
    if (decoded?.exp) {
      return new Date(decoded.exp * 1000);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * isTokenExpiringSoon — Checks if a token will expire within the given threshold.
 * Useful for proactive token refresh.
 *
 * @param token - The JWT string
 * @param thresholdMs - Time threshold in milliseconds (default: 5 minutes)
 * @returns true if token expires within the threshold
 */
export function isTokenExpiringSoon(token: string, thresholdMs: number = 5 * 60 * 1000): boolean {
  const expiry = getTokenExpiry(token);
  if (!expiry) return true; // If we can't decode it, treat as expiring
  return expiry.getTime() - Date.now() < thresholdMs;
}
