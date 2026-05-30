// ============================================================
// IN-MEMORY RATE LIMITER - Sliding window rate limiting
// Domain 20: System Audit Logs, Backups & Security Overhaul
// Prevents brute-force attacks by limiting failed authentication
// attempts per IP per endpoint within a sliding time window.
//
// Uses an in-memory Map (not database) for performance.
// State is lost on server restart — acceptable for rate limiting.
// ============================================================

interface RateLimitEntry {
  attempts: number;
  windowStart: number; // Unix timestamp in milliseconds
}

/** In-memory store for rate limit tracking. Key format: `${ipAddress}:${endpoint}` */
const rateLimitStore = new Map<string, RateLimitEntry>();

/** Sliding window duration in milliseconds (60 seconds) */
const WINDOW_DURATION_MS = 60_000;

/** Maximum failed attempts per IP per endpoint within the window */
const MAX_FAILED_ATTEMPTS = 5;

/**
 * checkRateLimit - Checks whether a request from the given IP to the
 * given endpoint is allowed under the rate limit policy.
 *
 * Sliding window of 60 seconds, max 5 failed attempts per IP per endpoint.
 *
 * @param ipAddress - Client IP address
 * @param endpoint - Target endpoint path (e.g., "/api/auth/login")
 * @returns Object with allowed flag, remaining attempts, and retry-after info
 */
export function checkRateLimit(
  ipAddress: string,
  endpoint: string
): { allowed: boolean; remainingAttempts: number; retryAfterSeconds: number } {
  const key = `${ipAddress}:${endpoint}`;
  const now = Date.now();

  const entry = rateLimitStore.get(key);

  // No entry exists — request is allowed
  if (!entry) {
    return {
      allowed: true,
      remainingAttempts: MAX_FAILED_ATTEMPTS,
      retryAfterSeconds: 0,
    };
  }

  // Window has expired — reset and allow
  if (now - entry.windowStart >= WINDOW_DURATION_MS) {
    rateLimitStore.delete(key);
    return {
      allowed: true,
      remainingAttempts: MAX_FAILED_ATTEMPTS,
      retryAfterSeconds: 0,
    };
  }

  // Within window — check attempt count
  if (entry.attempts >= MAX_FAILED_ATTEMPTS) {
    const elapsedMs = now - entry.windowStart;
    const remainingMs = WINDOW_DURATION_MS - elapsedMs;
    const retryAfterSeconds = Math.ceil(remainingMs / 1000);

    return {
      allowed: false,
      remainingAttempts: 0,
      retryAfterSeconds,
    };
  }

  // Under the limit — allowed
  return {
    allowed: true,
    remainingAttempts: MAX_FAILED_ATTEMPTS - entry.attempts,
    retryAfterSeconds: 0,
  };
}

/**
 * recordFailedAttempt - Increments the failed attempt counter for the
 * given IP+endpoint key. Creates the key if it doesn't exist.
 *
 * Should be called AFTER a failed authentication attempt.
 *
 * @param ipAddress - Client IP address
 * @param endpoint - Target endpoint path
 */
export function recordFailedAttempt(ipAddress: string, endpoint: string): void {
  const key = `${ipAddress}:${endpoint}`;
  const now = Date.now();

  const entry = rateLimitStore.get(key);

  if (!entry) {
    // Create new entry
    rateLimitStore.set(key, { attempts: 1, windowStart: now });
  } else {
    // Check if window has expired — if so, reset
    if (now - entry.windowStart >= WINDOW_DURATION_MS) {
      rateLimitStore.set(key, { attempts: 1, windowStart: now });
    } else {
      // Increment within current window
      entry.attempts += 1;
    }
  }
}

/**
 * resetRateLimit - Clears the rate limit for a successful authentication.
 * Should be called AFTER a successful login to reset the counter.
 *
 * @param ipAddress - Client IP address
 * @param endpoint - Target endpoint path
 */
export function resetRateLimit(ipAddress: string, endpoint: string): void {
  const key = `${ipAddress}:${endpoint}`;
  rateLimitStore.delete(key);
}

/**
 * getRateLimitStatus - Returns current rate limit status for UI countdown
 * display. Provides the attempt count, window start time, and locked status.
 *
 * @param ipAddress - Client IP address
 * @param endpoint - Target endpoint path
 * @returns Object with attempts, windowStart, and isLocked flag
 */
export function getRateLimitStatus(
  ipAddress: string,
  endpoint: string
): { attempts: number; windowStart: number; isLocked: boolean; retryAfterSeconds: number } {
  const key = `${ipAddress}:${endpoint}`;
  const now = Date.now();

  const entry = rateLimitStore.get(key);

  if (!entry) {
    return {
      attempts: 0,
      windowStart: 0,
      isLocked: false,
      retryAfterSeconds: 0,
    };
  }

  // Check if window has expired
  if (now - entry.windowStart >= WINDOW_DURATION_MS) {
    rateLimitStore.delete(key);
    return {
      attempts: 0,
      windowStart: 0,
      isLocked: false,
      retryAfterSeconds: 0,
    };
  }

  const isLocked = entry.attempts >= MAX_FAILED_ATTEMPTS;
  const elapsedMs = now - entry.windowStart;
  const remainingMs = WINDOW_DURATION_MS - elapsedMs;
  const retryAfterSeconds = isLocked ? Math.ceil(remainingMs / 1000) : 0;

  return {
    attempts: entry.attempts,
    windowStart: entry.windowStart,
    isLocked,
    retryAfterSeconds,
  };
}
