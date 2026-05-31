// ============================================================
// AUTH RESET PASSWORD API — Admin-only password reset
// POST: Allows admin users to reset passwords for any user
// Uses withApiSecurity for RBAC enforcement
// Creates AuditLog entry with module "Auth-Password-Reset"
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { withApiSecurity } from "@/lib/api-security";
import { logUserActivity } from "@/lib/activity-logger";
import { sanitizeError } from "@/lib/exception-sanitizer";
import { db } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    // Enforce authentication and RBAC via withApiSecurity
    const security = await withApiSecurity(request, "Auth", "POST");
    if (!security.authorized) return security.response;

    // Only admin role can reset passwords
    if (security.user.role !== "admin") {
      return NextResponse.json(
        { error: "Access denied. Only administrators can reset user passwords." },
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
      targetUser = await db.user.findUnique({
        where: { id: security.user.id },
      });
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

    // Update the password
    await db.user.update({
      where: { id: targetUser.id },
      data: { password: newPassword },
    });

    // Create audit log entry
    await logUserActivity({
      action: "UPDATE",
      module: "Auth-Password-Reset",
      recordId: targetUser.id,
      recordLabel: targetUser.email,
      userId: security.user.id,
      userName: security.user.name,
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
