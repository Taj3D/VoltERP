// ============================================================
// USERS CHANGE PASSWORD API — Consolidated with auth/change-password
// POST: Admin-only password change with withApiSecurity
// Redirects logic to use secure authentication instead of X-User-Email
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { withApiSecurity } from "@/lib/api-security";
import { logUserActivity } from "@/lib/activity-logger";
import { sanitizeError } from "@/lib/exception-sanitizer";
import { db } from "@/lib/db";

// Password complexity validation (matches auth/password route)
function validatePasswordComplexity(password: string): string | null {
  if (!password || typeof password !== "string") return "Password is required";
  if (password.length < 6) return "Password must be at least 6 characters long";
  if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter";
  if (!/[0-9]/.test(password)) return "Password must contain at least one number";
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/\?]/.test(password)) return "Password must contain at least one special character";
  return null;
}

// POST /api/users/change-password — Change user password (admin only)
export async function POST(req: NextRequest) {
  try {
    const security = await withApiSecurity(req, "AuditLogs", "POST");
    if (!security.authorized) return security.response;

    // ── RBAC INTERLOCK: Only ADMIN can change passwords ──
    if (security.user.role !== "admin") {
      await logUserActivity({
        action: "SECURITY_OVERRIDE",
        module: "Sys-Profile-Core",
        recordId: security.user.id,
        recordLabel: security.user.email,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          blockedAction: "PASSWORD_CHANGE_ATTEMPT",
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

    const body = await req.json();
    const { currentPassword, newPassword, confirmPassword } = body;

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Current password and new password are required" },
        { status: 400 }
      );
    }

    // Fetch user to verify current password
    const user = await db.user.findUnique({ where: { email: security.user.email } });
    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    if (user.password !== currentPassword) {
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 401 }
      );
    }

    // Validate password complexity
    const complexityError = validatePasswordComplexity(newPassword);
    if (complexityError) {
      return NextResponse.json({ error: complexityError }, { status: 400 });
    }

    // Verify confirmation if provided
    if (confirmPassword && newPassword !== confirmPassword) {
      return NextResponse.json(
        { error: "New password and confirmation do not match" },
        { status: 400 }
      );
    }

    // Update the password
    await db.user.update({
      where: { id: user.id },
      data: { password: newPassword },
    });

    // Audit the password change
    await logUserActivity({
      action: "UPDATE",
      module: "Auth-Password",
      recordId: user.id,
      recordLabel: user.email,
      userId: security.user.id,
      userName: security.user.name,
      details: JSON.stringify({
        action: "SELF_PASSWORD_CHANGE_SUCCESS",
        changedAt: new Date().toISOString(),
      }),
    });

    return NextResponse.json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    const sanitized = sanitizeError(error, "users-change-password");
    return NextResponse.json(
      { error: sanitized.userMessage, errorCode: sanitized.errorCode },
      { status: sanitized.statusCode }
    );
  }
}
