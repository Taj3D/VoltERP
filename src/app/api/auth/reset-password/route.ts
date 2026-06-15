// ============================================================
// AUTH RESET PASSWORD API — Admin-only password reset
// POST: Allows admin users to reset passwords for any user
// Uses withApiSecurity for RBAC enforcement
// Creates AuditLog entry with module "Auth-Password-Reset"
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { withApiSecurity, invalidateUserCache } from "@/lib/api-security";
import { logUserActivity } from "@/lib/activity-logger";
import { sanitizeError } from "@/lib/exception-sanitizer";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password-utils";

export async function POST(request: NextRequest) {
  try {
    // Use "UserProfile" module (accessible by all authenticated users, admin check below)
    const security = await withApiSecurity(request, "UserProfile", "POST");
    if (!security.authorized) return security.response;

    // Resolve the actual admin user from DB
    const adminUser = await db.user.findUnique({ where: { email: security.user.email } });
    if (!adminUser) {
      return NextResponse.json({ error: "Admin user not found." }, { status: 404 });
    }

    // Only admin role can reset passwords — strict RBAC interlock
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
          blockedAction: "PASSWORD_RESET_ATTEMPT",
          attemptedByRole: security.user.role,
          blockedAt: new Date().toISOString(),
          reason: "Privilege escalation blocked — only ADMIN role can modify passwords",
        }),
      }).catch(() => {}); // Non-blocking audit

      return NextResponse.json(
        {
          error: "403 Forbidden: Privilege Escalation Blocked",
          errorCode: "PRIVILEGE_ESCALATION_BLOCKED",
          message: `Role '${security.user.role}' is not authorized to modify passwords. Only ADMIN role has this privilege.`,
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { targetUserId, newPassword, adminUserId } = body;

    // Validate required fields
    if (!targetUserId || !newPassword) {
      return NextResponse.json(
        { error: "Target user ID and new password are required." },
        { status: 400 }
      );
    }

    // Validate password length
    if (typeof newPassword !== "string" || newPassword.length < 6) {
      return NextResponse.json(
        { error: "New password must be at least 6 characters long." },
        { status: 400 }
      );
    }

    // Resolve target user — support "self" for admin's own password
    let targetUser;
    if (targetUserId === "self") {
      targetUser = adminUser;
    } else {
      targetUser = await db.user.findUnique({
        where: { id: targetUserId },
      });
    }

    if (!targetUser) {
      return NextResponse.json(
        { error: "Target user not found." },
        { status: 404 }
      );
    }

    if (!targetUser.isActive) {
      return NextResponse.json(
        { error: "Cannot reset password for an inactive user." },
        { status: 400 }
      );
    }

    // Hash the new password before storing
    const hashedNewPassword = await hashPassword(newPassword);

    // Update the password
    await db.user.update({
      where: { id: targetUser.id },
      data: { password: hashedNewPassword },
    });

    // Invalidate cached user so next request fetches fresh data
    invalidateUserCache(targetUser.id);

    // Create audit log entry
    await logUserActivity({
      action: "UPDATE",
      module: "Auth-Password-Reset",
      recordId: targetUser.id,
      recordLabel: targetUser.email,
      userId: adminUser.id,
      userName: adminUser.name,
      details: JSON.stringify({
        targetUserEmail: targetUser.email,
        targetUserRole: targetUser.role,
        resetBy: security.user.email,
        resetAt: new Date().toISOString(),
      }),
    });

    return NextResponse.json({
      success: true,
      message: `Password reset successfully for ${targetUser.email}`,
    });
  } catch (error) {
    const sanitized = sanitizeError(error, "auth-reset-password");
    return NextResponse.json(
      { error: sanitized.userMessage, errorCode: sanitized.errorCode },
      { status: sanitized.statusCode }
    );
  }
}
