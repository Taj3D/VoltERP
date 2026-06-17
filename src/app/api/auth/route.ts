import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword, hashPassword, needsRehash } from "@/lib/password-utils";
import { checkRateLimit, recordFailedAttempt, resetRateLimit } from "@/lib/rate-limiter";
import { signAccessToken, signRefreshToken } from "@/lib/jwt-utils";
import { generateCsrfToken } from "@/lib/csrf";
import { logSystemAudit } from "@/lib/activity-logger";

// Default credentials for all 5 RBAC roles
const DEFAULT_USERS = [
  { email: "emart.amit", name: "Amit Sharma", password: "Test_123", role: "admin", isActive: true },
  { email: "emart.manager", name: "Rakib Hasan", password: "Manager_123", role: "manager", isActive: true },
  { email: "emart.sr", name: "Kamal Hossain", password: "SR_123", role: "sr", isActive: true },
  { email: "emart.dealer", name: "Rahim Uddin", password: "Dealer_123", role: "dealer", isActive: true },
  { email: "emart.vat", name: "Kashem Miah", password: "VAT_123", role: "vat_auditor", isActive: true },
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = body.email || body.username;
    const password = body.password;

    if (!email || !password) {
      return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
    }

    // ── Rate limiting: Check before processing ──
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("x-real-ip")
      || "unknown";
    const rateLimitResult = checkRateLimit(clientIp, "/api/auth/login");

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          error: `Too many failed attempts. Please try again in ${rateLimitResult.retryAfterSeconds} seconds.`,
          retryAfter: rateLimitResult.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimitResult.retryAfterSeconds) },
        }
      );
    }

    // Auto-seed all default users if they don't exist (DEV ONLY — disabled in production)
    // In production, users must be created via the admin panel or database seeding script
    if (process.env.NODE_ENV !== 'production') {
      for (const userData of DEFAULT_USERS) {
        const existing = await db.user.findUnique({ where: { email: userData.email } });
        if (!existing) {
          try {
            // Hash the default password before storing
            const hashedPassword = await hashPassword(userData.password);
            await db.user.create({
            data: {
              email: userData.email,
              name: userData.name,
              password: hashedPassword,
              role: userData.role,
              isActive: userData.isActive,
            },
          });
        } catch (e) {
          console.error(`Auto-seed user ${userData.email} failed:`, e);
        }
      }
    }
    } // end NODE_ENV !== 'production'

    // Now look up the user
    const user = await db.user.findUnique({ where: { email } });

    if (!user || !user.isActive) {
      recordFailedAttempt(clientIp, "/api/auth/login");
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // ── Secure password verification (bcrypt only) ──
    const passwordValid = await verifyPassword(password, user.password);

    if (!passwordValid) {
      recordFailedAttempt(clientIp, "/api/auth/login");
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // ── Auto-migration: Re-hash passwords that need upgrading ──
    // This handles edge cases like different bcrypt cost factors.
    // For plaintext passwords, use the /api/auth/migrate-passwords admin endpoint.
    if (needsRehash(user.password)) {
      try {
        const hashedPassword = await hashPassword(password);
        await db.user.update({
          where: { id: user.id },
          data: { password: hashedPassword },
        });
      } catch (rehashError) {
        // Non-critical: log but don't block login
        console.warn(`Failed to re-hash password for ${user.email}:`, rehashError);
      }
    }

    // Reset rate limit on successful login
    resetRateLimit(clientIp, "/api/auth/login");

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
    } catch (e) { console.warn("Failed to log user activity:", e); }

    // Log to SystemAuditLog for security tracking
    await logSystemAudit({
      actionType: 'LOGIN',
      targetModel: 'User',
      targetRecordId: user.id,
      actorUserId: user.id,
      actorUserName: user.name,
      ipAddress: clientIp,
      userAgent: req.headers.get('user-agent') || undefined,
      companyId: user.companyId || undefined,
      metadata: JSON.stringify({ email: user.email, role: user.role }),
    }).catch(() => {});

    // ── Issue JWT tokens ──
    const accessToken = signAccessToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
    });

    const refreshToken = signRefreshToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
    });

    // ── Generate CSRF token for this session ──
    // Tied to user ID — required for POST/PUT/DELETE requests as defense-in-depth
    const csrfToken = generateCsrfToken(user.id);

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      displayName: user.name,
      role: user.role,
      accessToken,
      refreshToken,
      csrfToken,
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
