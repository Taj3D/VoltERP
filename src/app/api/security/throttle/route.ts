// ============================================================
// ENTERPRISE API RATE LIMITING ENGINE — Phase 18
// Sliding-window token bucket backed by in-memory pool.
// If an IP or User Token fires more than 60 requests per minute,
// instantly freeze their connection and return 429 Too Many Requests
// with a security-alert notification payload.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';
import { logForensicAudit } from '@/lib/security-audit-trail';
import { logSecurityThreat } from '@/lib/payload-sanitizer';

// ============================================================
// IN-MEMORY TOKEN BUCKET RATE LIMITER
// Enterprise-grade: Per-IP + Per-User sliding window
// 60 requests per minute per identity
// ============================================================

interface TokenBucket {
  tokens: number;
  lastRefill: number; // Unix timestamp in ms
  blocked: boolean;
  blockedUntil: number; // Unix timestamp in ms
  totalRequests: number;
  totalBlocked: number;
}

const TOKEN_BUCKETS = new Map<string, TokenBucket>();

const MAX_TOKENS = 60;        // Max requests per minute
const REFILL_RATE = 1000;     // 1 token per 1000ms (60 tokens per 60s)
const BLOCK_DURATION = 60000; // 60 second block when rate exceeded

function getBucket(key: string): TokenBucket {
  let bucket = TOKEN_BUCKETS.get(key);
  if (!bucket) {
    bucket = {
      tokens: MAX_TOKENS,
      lastRefill: Date.now(),
      blocked: false,
      blockedUntil: 0,
      totalRequests: 0,
      totalBlocked: 0,
    };
    TOKEN_BUCKETS.set(key, bucket);
  }
  return bucket;
}

function refillTokens(bucket: TokenBucket): void {
  const now = Date.now();
  const elapsed = now - bucket.lastRefill;
  const tokensToAdd = Math.floor(elapsed / REFILL_RATE);
  if (tokensToAdd > 0) {
    bucket.tokens = Math.min(MAX_TOKENS, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
  }
}

export function checkEnterpriseRateLimit(
  identifier: string
): { allowed: boolean; remainingTokens: number; retryAfterMs: number; isBlocked: boolean } {
  const bucket = getBucket(identifier);
  const now = Date.now();

  // Check if currently blocked
  if (bucket.blocked && now < bucket.blockedUntil) {
    bucket.totalBlocked++;
    const retryAfterMs = bucket.blockedUntil - now;
    return {
      allowed: false,
      remainingTokens: 0,
      retryAfterMs,
      isBlocked: true,
    };
  }

  // Unblock if block duration has passed
  if (bucket.blocked && now >= bucket.blockedUntil) {
    bucket.blocked = false;
    bucket.blockedUntil = 0;
  }

  // Refill tokens
  refillTokens(bucket);

  bucket.totalRequests++;

  // Check if tokens available
  if (bucket.tokens > 0) {
    bucket.tokens--;
    return {
      allowed: true,
      remainingTokens: bucket.tokens,
      retryAfterMs: 0,
      isBlocked: false,
    };
  }

  // Rate limit exceeded — block the identifier
  bucket.blocked = true;
  bucket.blockedUntil = now + BLOCK_DURATION;
  bucket.totalBlocked++;

  return {
    allowed: false,
    remainingTokens: 0,
    retryAfterMs: BLOCK_DURATION,
    isBlocked: true,
  };
}

/**
 * Get rate limit stats for all tracked identities
 */
function getRateLimitStats(): {
  totalIdentities: number;
  blockedIdentities: number;
  topConsumers: Array<{ identifier: string; requests: number; blocked: number }>;
} {
  let blockedCount = 0;
  const consumers: Array<{ identifier: string; requests: number; blocked: number }> = [];

  for (const [identifier, bucket] of TOKEN_BUCKETS.entries()) {
    if (bucket.blocked) blockedCount++;
    consumers.push({
      identifier: identifier.length > 30 ? identifier.substring(0, 30) + '...' : identifier,
      requests: bucket.totalRequests,
      blocked: bucket.totalBlocked,
    });
  }

  consumers.sort((a, b) => b.requests - a.requests);

  return {
    totalIdentities: TOKEN_BUCKETS.size,
    blockedIdentities: blockedCount,
    topConsumers: consumers.slice(0, 20),
  };
}

// GET /api/security/throttle — Get rate limit status and stats
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'ThrottleRate', 'GET');
  if (!security.authorized) return security.response;

  try {
    const stats = getRateLimitStats();

    // Also check the specific IP if provided
    const { searchParams } = new URL(request.url);
    const checkIp = searchParams.get('ip');
    const checkUser = searchParams.get('user');

    let specificStatus = null;
    if (checkIp) {
      const result = checkEnterpriseRateLimit(checkIp);
      specificStatus = { identifier: checkIp, ...result };
    }
    if (checkUser) {
      const result = checkEnterpriseRateLimit(`user:${checkUser}`);
      specificStatus = { identifier: `user:${checkUser}`, ...result };
    }

    return NextResponse.json({
      stats,
      specificStatus,
      config: {
        maxRequestsPerMinute: MAX_TOKENS,
        blockDurationMs: BLOCK_DURATION,
        algorithm: 'Token Bucket (Sliding Window)',
      },
    });
  } catch (error: any) {
    console.error('[ThrottleAPI] Error:', error);
    return NextResponse.json({ error: 'Failed to get rate limit stats' }, { status: 500 });
  }
}

// POST /api/security/throttle — Check and enforce rate limit for a request
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const identifier = body.identifier; // IP address or user token
    const endpoint = body.endpoint || 'unknown';

    if (!identifier) {
      return NextResponse.json(
        { error: 'identifier (IP or user token) is required' },
        { status: 400 }
      );
    }

    const result = checkEnterpriseRateLimit(identifier);

    if (!result.allowed) {
      // Log the rate limit breach
      await logSecurityThreat({
        threatType: 'RATE_LIMIT_BREACH',
        ipAddress: identifier,
        endpoint,
        httpMethod: body.httpMethod || 'POST',
        payload: JSON.stringify({ identifier, endpoint }),
        blockedAction: `Rate limit exceeded: ${MAX_TOKENS} requests/minute. Connection frozen for ${Math.ceil(result.retryAfterMs / 1000)}s.`,
        severity: 'HIGH',
      });

      await logForensicAudit({
        actionType: 'RATE_LIMIT_TRIGGERED',
        userId: body.userId,
        userName: body.userName,
        companyId: body.companyId,
        ipAddress: identifier,
        endpoint,
        httpMethod: body.httpMethod || 'POST',
        moduleToken: 'Sys-Ops-Security-Vault',
        severity: 'WARNING',
        metadata: {
          remainingTokens: result.remainingTokens,
          retryAfterMs: result.retryAfterMs,
        },
      });

      return NextResponse.json(
        {
          error: '429 Too Many Requests',
          message: `Rate limit exceeded. You have made more than ${MAX_TOKENS} requests in the past minute. Your connection has been frozen for security purposes.`,
          retryAfterMs: result.retryAfterMs,
          retryAfterSeconds: Math.ceil(result.retryAfterMs / 1000),
          securityAlert: true,
        },
        { status: 429 }
      );
    }

    return NextResponse.json({
      allowed: true,
      remainingTokens: result.remainingTokens,
      maxTokens: MAX_TOKENS,
      resetInMs: Math.ceil((MAX_TOKENS - result.remainingTokens) * REFILL_RATE),
    });
  } catch (error: any) {
    console.error('[ThrottleAPI] Check error:', error);
    return NextResponse.json({ error: 'Rate limit check failed' }, { status: 500 });
  }
}
