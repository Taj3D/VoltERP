// ============================================================
// AUTH PASSWORD API — Admin password change & reset
// PUT: Admin changes own password or resets another user's password
// Uses withApiSecurity for proper authentication
// Only ADMIN role can change passwords (RBAC enforced)
// All attempts are audited
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { withApiSecurity } from "@/lib/api-security";
import { logUserActivity } from "@/lib/activity-logger";
import { sanitizeError } from "@/lib/exception-sanitizer";
import { db } from "@/lib/db";
import { verifyPassword, hashPassword } from "@/lib/password-utils";

// Password complexity validation
function validatePasswordComplexity(password: string): string | null {
  if (!password || typeof password !== "string") return "Password is required";
  if (password.length < 6) return "Password must be at least 6 characters long";
  if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter";
  if (!/[0-9]/.test(password)) return "Password must contain at least one number";
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/\?]/.test(password)) return "Password must contain at least one special character";
  return null;
}

export async function PUT(req: NextRequest) {
  try {
    const security = await withApiSecurity(req, "UserProfile", "PUT");
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
    const { currentPassword, newPassword, confirmPassword, targetUserId } = body;

    // ── Case 1: Admin changing their own password ──
    if (!targetUserId || targetUserId === security.user.id) {
      if (!currentPassword || !newPassword) {
        return NextResponse.json(
          { error: "Current password and new password are required." },
          { status: 400 }
        );
      }

      // Verify confirmation password matches
      if (confirmPassword !== undefined && newPassword !== confirmPassword) {
        return NextResponse.json(
          { error: "New password and confirmation do not match." },
          { status: 400 }
        );
      }

      // Fetch user to verify current password
      const user = await db.user.findUnique({ where: { email: security.user.email } });
      if (!user) {
        return NextResponse.json({ error: "User not found." }, { status: 404 });
      }

      // ── Secure password verification (supports both hashed & legacy plain-text) ──
      const currentPasswordValid = await verifyPassword(currentPassword, user.password);
      if (!currentPasswordValid) {
        return NextResponse.json(
          { error: "Current password is incorrect." },
          { status: 401 }
        );
      }

      // Validate password complexity
      const complexityError = validatePasswordComplexity(newPassword);
      if (complexityError) {
        return NextResponse.json({ error: complexityError }, { status: 400 });
      }

      // Hash the new password before storing
      const hashedNewPassword = await hashPassword(newPassword);

      await db.user.update({
        where: { id: user.id },
        data: { password: hashedNewPassword },
      });

      await logUserActivity({
        action: "UPDATE",
        module: "Sys-Profile-Core",
        recordId: security.user.id,
        recordLabel: security.user.email,
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
    }

    // ── Case 2: Admin resetting another user's password ──
    if (targetUserId) {
      if (!newPassword) {
        return NextResponse.json(
          { error: "New password is required for reset." },
          { status: 400 }
        );
      }

      // Validate password complexity
      const complexityError = validatePasswordComplexity(newPassword);
      if (complexityError) {
        return NextResponse.json({ error: complexityError }, { status: 400 });
      }

      const targetUser = await db.user.findUnique({ where: { id: targetUserId } });
      if (!targetUser) {
        return NextResponse.json({ error: "Target user not found." }, { status: 404 });
      }

      // Hash the new password before storing
      const hashedNewPassword = await hashPassword(newPassword);

      await db.user.update({
        where: { id: targetUserId },
        data: { password: hashedNewPassword },
      });

      await logUserActivity({
        action: "UPDATE",
        module: "Sys-Profile-Core",
        recordId: targetUserId,
        recordLabel: targetUser.email,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          action: "ADMIN_PASSWORD_RESET",
          resetFor: targetUser.email,
          resetBy: security.user.email,
          resetAt: new Date().toISOString(),
        }),
      });

      return NextResponse.json({
        success: true,
        message: `Password reset successfully for ${targetUser.name}`,
      });
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  } catch (error) {
    const sanitized = sanitizeError(error, "auth-password");
    return NextResponse.json(
      { error: sanitized.userMessage, errorCode: sanitized.errorCode },
      { status: sanitized.statusCode }
    );
  }
}
