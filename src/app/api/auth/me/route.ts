// ============================================================
// AUTH ME API — Alias for /api/auth/profile
// GET: Retrieve current user's profile data
// Re-uses the same logic as the profile route
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { withApiSecurity } from "@/lib/api-security";
import { sanitizeError } from "@/lib/exception-sanitizer";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const security = await withApiSecurity(request, "AuditLogs", "GET");
    if (!security.authorized) return security.response;

    const user = await db.user.findUnique({
      where: { email: security.user.email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        companyId: true,
        photo: true,
        voterIdFront: true,
        voterIdBack: true,
        phone: true,
        address: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        pdfExports: true,
        csvImports: true,
        csvExports: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found." },
        { status: 404 }
      );
    }

    return NextResponse.json(user);
  } catch (error) {
    const sanitized = sanitizeError(error, "auth-me-get");
    return NextResponse.json(
      { error: sanitized.userMessage, errorCode: sanitized.errorCode },
      { status: sanitized.statusCode }
    );
  }
}
