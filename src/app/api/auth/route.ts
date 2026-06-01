// ============================================================
// AUTH LOGIN API — Domain 20: Rate-Limited Authentication
// POST: Authenticate user with brute-force rate limiting
// (>5 failed attempts in 60s sliding window → 429 Too Many Requests)
// Auto-seeds default RBAC users on first request.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkRateLimit, recordFailedAttempt, resetRateLimit } from "@/lib/rate-limiter";
import { sanitizeError } from "@/lib/exception-sanitizer";

// Default credentials for all 5 RBAC roles
const DEFAULT_USERS = [
  { email: "emart.amit", name: "Amit Sharma", password: "Test_123", role: "admin", isActive: true },
  { email: "emart.manager", name: "Rajesh Kumar", password: "Manager_123", role: "manager", isActive: true },
  { email: "emart.sr", name: "Suresh Roy", password: "SR_123", role: "sr", isActive: true },
  { email: "emart.dealer", name: "Mizan Ahmed", password: "Dealer_123", role: "dealer", isActive: true },
  { email: "emart.vat", name: "Kamal Hossain", password: "VAT_123", role: "vat_auditor", isActive: true },
];

/**
 * Extract client IP address from request headers.
 * Checks X-Forwarded-For, X-Real-IP, then falls back to "unknown".
 */
function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  return "unknown";
}

export async function POST(req: NextRequest) {
  const endpoint = "/api/auth/login";
  const clientIp = getClientIp(req);

  try {
    // ============================================================
    // RATE LIMIT CHECK — Before processing any credentials
    // Sliding window: 5 failed attempts per 60 seconds per IP
    // ============================================================
    const rateLimitResult = checkRateLimit(clientIp, endpoint);

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          error: "Too many failed login attempts. Please try again later.",
          errorCode: "RATE_LIMITED",
          retryAfterSeconds: rateLimitResult.retryAfterSeconds,
          remainingAttempts: 0,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimitResult.retryAfterSeconds),
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }

    const body = await req.json();
    const email = body.email || body.username;
    const password = body.password;

    if (!email || !password) {
      return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
    }

    // Auto-seed all default users if they don't exist
    for (const userData of DEFAULT_USERS) {
      const existing = await db.user.findUnique({ where: { email: userData.email } });
      if (!existing) {
        try {
          await db.user.create({ data: userData });
        } catch (e) {
          console.error(`Auto-seed user ${userData.email} failed:`, e);
        }
      }
    }

    // Now look up the user
    const user = await db.user.findUnique({ where: { email } });

    if (!user || !user.isActive) {
      // Record failed attempt for rate limiting
      recordFailedAttempt(clientIp, endpoint);
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Simple password check (in production, use bcrypt)
    if (user.password !== password) {
      // Record failed attempt for rate limiting
      recordFailedAttempt(clientIp, endpoint);

      // Get updated rate limit status to inform client of remaining attempts
      const updatedRateLimit = checkRateLimit(clientIp, endpoint);

      return NextResponse.json(
        {
          error: "Invalid credentials",
          remainingAttempts: updatedRateLimit.remainingAttempts,
        },
        {
          status: 401,
          headers: {
            "X-RateLimit-Remaining": String(updatedRateLimit.remainingAttempts),
          },
        }
      );
    }

    // ============================================================
    // SUCCESSFUL LOGIN — Reset rate limit counter
    // ============================================================
    resetRateLimit(clientIp, endpoint);

    // Log the login
    try {
      await db.auditLog.create({
        data: {
          action: "LOGIN",
          module: "Auth",
          userId: user.id,
          userName: user.name,
          recordLabel: user.email,
        },
      });
    } catch {}

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,           // Clean display name from DB (never raw username)
      role: user.role,
      profileImage: user.profileImage,  // Base64 avatar for UI rendering
      phone: user.phone,                // Contact number
      designation: user.designation,    // Job title
    });
  } catch (error) {
    const sanitized = sanitizeError(error, "auth-login");
    return NextResponse.json(
      { error: sanitized.userMessage, errorCode: sanitized.errorCode },
      { status: sanitized.statusCode }
    );
  }
}
