import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkRateLimit, RATE_LIMITS, getRateLimitKey, getClientIp } from "@/lib/rate-limit";

/**
 * Proxy middleware — handles CORS for preview panel AND rate limiting for API routes.
 *
 * 1. CORS: The preview panel loads from *.space-z.ai domains, which Next.js dev server
 *    blocks by default for /_next/* resources. This adds the necessary CORS and framing
 *    headers so the preview panel can load the app.
 *
 * 2. Rate Limiting: All /api/* routes are rate-limited per IP using a sliding window:
 *    - Auth endpoints (login, reset-password): 5 req/min per IP
 *    - Write endpoints (POST, PUT, DELETE): 60 req/min per IP
 *    - Read endpoints (GET): 100 req/min per IP
 *    Returns HTTP 429 with Retry-After header when limit exceeded.
 */
export function proxy(request: NextRequest) {
  const origin = request.headers.get("origin") || "";

  // ─────────────────────────────────────────────────────────────
  // RATE LIMITING — Apply to all API routes
  // ─────────────────────────────────────────────────────────────
  let rateLimitResult: { allowed: boolean; remaining: number; retryAfter?: number } | null = null;
  let rateLimitMax = 0;

  if (request.nextUrl.pathname.startsWith("/api/")) {
    const ip = getClientIp(request);
    const path = request.nextUrl.pathname;
    const method = request.method;

    // Determine rate limit tier based on path and method
    let config;
    if (path.includes("/auth/login") || path.includes("/auth/reset-password")) {
      config = RATE_LIMITS.auth;
    } else if (method === "POST" || method === "PUT" || method === "DELETE") {
      config = RATE_LIMITS.write;
    } else {
      config = RATE_LIMITS.read;
    }

    // Check rate limit using sliding window (single call — avoids double-counting)
    const key = getRateLimitKey(ip, path);
    rateLimitResult = checkRateLimit(key, config);
    rateLimitMax = config.maxRequests;

    // Return 429 if rate limit exceeded
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later.", retryAfter: rateLimitResult.retryAfter },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimitResult.retryAfter || 60),
            "X-RateLimit-Remaining": String(rateLimitResult.remaining),
            "X-RateLimit-Limit": String(rateLimitMax),
          },
        }
      );
    }
  }

  // ─────────────────────────────────────────────────────────────
  // CORS — Allow preview panel origins
  // ─────────────────────────────────────────────────────────────
  const isAllowedOrigin =
    origin.includes(".space-z.ai") ||
    origin.includes("localhost") ||
    origin.includes("127.0.0.1") ||
    origin.includes("embd-j.com");

  // Handle CORS preflight
  if (request.method === "OPTIONS" && isAllowedOrigin) {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // Build response — add CORS + rate limit headers
  const response = NextResponse.next();

  if (isAllowedOrigin) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("X-Frame-Options", "ALLOWALL");
  }

  // Add rate limit informational headers for API routes (reuse single check result)
  if (rateLimitResult) {
    response.headers.set("X-RateLimit-Remaining", String(rateLimitResult.remaining));
    response.headers.set("X-RateLimit-Limit", String(rateLimitMax));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logo.svg|robots.txt|guides).*)",
  ],
};
