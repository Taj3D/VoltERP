// ============================================================
// JWT UTILITY — Centralized token signing, verification, decoding
// Uses jsonwebtoken (industry-standard library)
//
// SECURITY:
// - HS256 algorithm (HMAC-SHA256)
// - Configurable expiry (default: 8h for access, 7d for refresh)
// - Secret from JWT_SECRET env var (fallback: dev-only key)
// - Token blacklisting support for logout
// - Backward compatible with x-user-email header during migration
// ============================================================

import jwt from "jsonwebtoken";

// ── Configuration ──

/** JWT secret key — MUST be set via environment variable in production */
const JWT_SECRET = process.env.JWT_SECRET || "emart-dev-jwt-secret-change-in-production-2024";
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

// ── In-memory token blacklist (for logout) ──

/** Set of revoked JWT IDs (JTI) — persists for server lifetime */
const revokedTokens = new Set<string>();

/** Map of JTI → expiry timestamp for cleanup */
const tokenExpiryMap = new Map<string, number>();

/** Clean up expired tokens from blacklist every 10 minutes */
setInterval(() => {
  const now = Date.now();
  for (const [jti, expiry] of tokenExpiryMap.entries()) {
    if (now > expiry) {
      revokedTokens.delete(jti);
      tokenExpiryMap.delete(jti);
    }
  }
}, 10 * 60 * 1000);

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
 * Checks signature, expiry, issuer, audience, and blacklist.
 *
 * @param token - The JWT string to verify
 * @param expectedType - Expected token type ('access' or 'refresh')
 * @returns Verification result with payload or error details
 */
export function verifyToken(
  token: string,
  expectedType: "access" | "refresh" = "access"
): TokenVerificationResult {
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

    // Check if token has been revoked (blacklisted)
    if (decoded.jti && revokedTokens.has(decoded.jti)) {
      return {
        valid: false,
        error: "Token has been revoked. Please log in again.",
      };
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
 * revokeToken — Adds a token to the blacklist by its JTI.
 * Used during logout to prevent reuse of the token even before expiry.
 *
 * @param token - The JWT string to revoke
 */
export function revokeToken(token: string): void {
  try {
    const decoded = jwt.decode(token) as jwt.JwtPayload & { jti?: string } | null;
    if (decoded?.jti) {
      revokedTokens.add(decoded.jti);
      // Store expiry for cleanup (convert exp to ms timestamp)
      const expiryMs = (decoded.exp || 0) * 1000;
      tokenExpiryMap.set(decoded.jti, expiryMs);
    }
  } catch {
    // Silently ignore — token may already be invalid
  }
}

/**
 * extractBearerToken — Extracts the JWT token from an Authorization header.
 * Supports both "Bearer <token>" and raw token formats.
 * Also supports the legacy "x-user-email" header for backward compatibility.
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
