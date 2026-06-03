import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// PUT /api/auth/password - Change password (Admin only)
// Admin can change their own password or reset any user's password
export async function PUT(req: NextRequest) {
  try {
    const userEmail = req.headers.get("x-user-email");
    if (!userEmail) {
      return NextResponse.json({ error: "Unauthorized: missing user email" }, { status: 401 });
    }

    // Verify the requesting user is an admin
    const requestingUser = await db.user.findUnique({ where: { email: userEmail } });
    if (!requestingUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (requestingUser.role !== "admin") {
      return NextResponse.json({ error: "Forbidden: only administrators can change passwords" }, { status: 403 });
    }

    const body = await req.json();
    const { currentPassword, newPassword, targetUserId } = body;

    // Case 1: Admin changing their own password
    if (!targetUserId || targetUserId === requestingUser.id) {
      if (!currentPassword || !newPassword) {
        return NextResponse.json({ error: "Current password and new password are required" }, { status: 400 });
      }

      // Validate current password against database
      if (requestingUser.password !== currentPassword) {
        return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
      }

      if (newPassword.length < 6) {
        return NextResponse.json({ error: "New password must be at least 6 characters" }, { status: 400 });
      }

      await db.user.update({
        where: { id: requestingUser.id },
        data: { password: newPassword },
      });

      // Log the password change
      try {
        await db.auditLog.create({
          data: {
            action: "UPDATE",
            module: "Auth",
            userId: requestingUser.id,
            userName: requestingUser.name,
            recordLabel: `Password changed for ${requestingUser.email}`,
          },
        });
      } catch { /* silent */ }

      return NextResponse.json({ success: true, message: "Password changed successfully" });
    }

    // Case 2: Admin resetting another user's password
    if (targetUserId) {
      if (!newPassword) {
        return NextResponse.json({ error: "New password is required" }, { status: 400 });
      }

      if (newPassword.length < 6) {
        return NextResponse.json({ error: "New password must be at least 6 characters" }, { status: 400 });
      }

      const targetUser = await db.user.findUnique({ where: { id: targetUserId } });
      if (!targetUser) {
        return NextResponse.json({ error: "Target user not found" }, { status: 404 });
      }

      await db.user.update({
        where: { id: targetUserId },
        data: { password: newPassword },
      });

      // Log the password reset
      try {
        await db.auditLog.create({
          data: {
            action: "UPDATE",
            module: "Auth",
            userId: requestingUser.id,
            userName: requestingUser.name,
            recordLabel: `Password reset for ${targetUser.email} by ${requestingUser.email}`,
          },
        });
      } catch { /* silent */ }

      return NextResponse.json({ success: true, message: `Password reset successfully for ${targetUser.name}` });
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  } catch (error) {
    console.error("Password change error:", error);
    return NextResponse.json({ error: "Failed to change password" }, { status: 500 });
  }
}
