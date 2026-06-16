// ============================================================
// USERS API — List all users (admin-only for password reset)
// GET: Returns list of active users with id, email, name, role
// Used by ProfileCenter for admin password reset functionality
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { withApiSecurity } from "@/lib/api-security";
import { sanitizeError } from "@/lib/exception-sanitizer";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const security = await withApiSecurity(request, "UserProfile", "GET");
    if (!security.authorized) return security.response;

    // Only admin can list all users
    if (security.user.role !== "admin") {
      return NextResponse.json(
        { error: "Access denied. Only administrators can list all users." },
        { status: 403 }
      );
    }

    const users = await db.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        photo: true,
        phone: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(users);
  } catch (error) {
    const sanitized = sanitizeError(error, "users-list");
    return NextResponse.json(
      { error: sanitized.userMessage, errorCode: sanitized.errorCode },
      { status: sanitized.statusCode }
    );
  }
}
