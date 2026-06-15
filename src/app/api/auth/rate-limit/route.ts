// ============================================================
// AUTH RATE LIMIT STATUS API — Domain 20: System Audit Logs, Backups & Security Overhaul
// GET endpoint for checking rate limit status (used by frontend
// countdown display). Returns attempt count, locked status, and
// retry-after seconds for a given IP + endpoint combination.
//
// SECURITY: Requires authentication via withApiSecurity to
// prevent unauthenticated reconnaissance of rate limit state.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getRateLimitStatus } from '@/lib/rate-limiter';
import { withApiSecurity } from '@/lib/api-security';

// GET /api/auth/rate-limit — Check rate limit status for UI countdown
export async function GET(request: NextRequest) {
  // Require authentication to prevent unauthenticated reconnaissance
  // NOTE: Cannot use 'Auth' module — it's in AUTH_EXEMPT_MODULES which bypasses all auth checks
  const security = await withApiSecurity(request, 'UserProfile', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);

    const ipAddress = searchParams.get('ipAddress');
    const endpoint = searchParams.get('endpoint');

    if (!ipAddress || !endpoint) {
      return NextResponse.json(
        { error: 'Both ipAddress and endpoint query parameters are required.' },
        { status: 400 }
      );
    }

    const status = getRateLimitStatus(ipAddress, endpoint);

    return NextResponse.json({
      attempts: status.attempts,
      isLocked: status.isLocked,
      retryAfterSeconds: status.retryAfterSeconds,
    });
  } catch (error) {
    console.error('[RateLimitAPI] Error checking rate limit status:', error);
    return NextResponse.json(
      { error: 'Failed to check rate limit status.' },
      { status: 500 }
    );
  }
}
