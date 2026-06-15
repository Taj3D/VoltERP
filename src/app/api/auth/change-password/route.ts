// ============================================================
// AUTH CHANGE PASSWORD API — Self-service password change
// POST: Allows ONLY admin users to change their own password
// Any non-admin role receives 403 Forbidden: Privilege Escalation Blocked
// All attempts (both successful and blocked) are audited
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { withApiSecurity, invalidateUserCache } from "@/lib/api-security";
import { logUserActivity } from "@/lib/activity-logger";
import { sanitizeError } from "@/lib/exception-sanitizer";
import { db } from "@/lib/db";
import { verifyPassword, hashPassword } from "@/lib/password-utils";

export async function POST(request: NextRequest) {
  try {
    // Use "UserProfile" module (accessible by all authenticated users, admin check below)
    const security = await withApiSecurity(request, "UserProfile", "POST");
    if (!security.authorized) return security.response;

    // ── RBAC INTERLOCK: Only ADMIN can change passwords ──
    // MANAGER, SR, DEALER, VAT_AUDITOR → 403 Forbidden
    if (security.user.role !== "admin") {
      // Audit the blocked privilege escalation attempt
      await logUserActivity({
        action: "SECURITY_OVERRIDE",
        module: "Sys-Profile-Core",
        recordId: security.user.id,
        recordLabel: security.user.email,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          blockedAction: "SELF_PASSWORD_CHANGE_ATTEMPT",
          attemptedByRole: security.user.role,
          blockedAt: new Date().toISOString(),
          reason: "Privilege escalation blocked — only ADMIN role can change passwords",
        }),
      }).catch(() => {});

      return NextResponse.json(
        {
          error: "403 Forbidden: Privilege Escalation Blocked",
          errorCode: "PRIVILEGE_ESCALATION_BLOCKED",
          message: `Role '${security.user.role}' is not authorized to change passwords. Only ADMIN role has this privilege.`,
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { currentPassword, newPassword, confirmPassword } = body;

    // Validate required fields
    if (!currentPassword || !newPassword || !confirmPassword) {
      return NextResponse.json(
        { error: "Current password, new password, and confirmation are required." },
        { status: 400 }
      );
    }

    // ── Password complexity validation ──
    // Must match the complexity rules in /api/auth/password/route.ts
    if (typeof newPassword !== "string" || newPassword.length < 6) {
      return NextResponse.json(
        { error: "New password must be at least 6 characters long." },
        { status: 400 }
      );
    }
    if (!/[A-Z]/.test(newPassword)) {
      return NextResponse.json(
        { error: "New password must contain at least one uppercase letter." },
        { status: 400 }
      );
    }
    if (!/[0-9]/.test(newPassword)) {
      return NextResponse.json(
        { error: "New password must contain at least one number." },
        { status: 400 }
      );
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/\?]/.test(newPassword)) {
      return NextResponse.json(
        { error: "New password must contain at least one special character." },
        { status: 400 }
      );
    }

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { error: "New password and confirmation do not match." },
        { status: 400 }
      );
    }

    // Fetch the current user from DB to verify current password
    const user = await db.user.findUnique({
      where: { email: security.user.email },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found." },
        { status: 404 }
      );
    }

    // ── Secure password verification (supports both hashed & legacy plain-text) ──
    const currentPasswordValid = await verifyPassword(currentPassword, user.password);
    if (!currentPasswordValid) {
      // Audit failed password verification
      await logUserActivity({
        action: "UPDATE",
        module: "Sys-Profile-Core",
        recordId: security.user.id,
        recordLabel: security.user.email,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          action: "PASSWORD_CHANGE_FAILED",
          reason: "Current password verification failed",
          attemptedAt: new Date().toISOString(),
        }),
      }).catch(() => {});

      return NextResponse.json(
        { error: "Current password is incorrect." },
        { status: 401 }
      );
    }

    // Hash the new password before storing
    const hashedNewPassword = await hashPassword(newPassword);

    // Update the password
    await db.user.update({
      where: { id: user.id },
      data: { password: hashedNewPassword },
    });

    // Invalidate cached user so next request fetches fresh data
    invalidateUserCache(user.id);

    // Audit the successful password change
    await logUserActivity({
      action: "UPDATE",
      module: "Sys-Profile-Core",
      recordId: user.id,
      recordLabel: user.email,
      userId: security.user.id,
      userName: security.user.name,
      details: JSON.stringify({
        action: "SELF_PASSWORD_CHANGE_SUCCESS",
        changedAt: new Date().toISOString(),
      }),
    });

    return NextResponse.json({
      success: true,
      message: "Password changed successfully.",
    });
  } catch (error) {
    const sanitized = sanitizeError(error, "auth-change-password");
    return NextResponse.json(
      { error: sanitized.userMessage, errorCode: sanitized.errorCode },
      { status: sanitized.statusCode }
    );
  }
}
