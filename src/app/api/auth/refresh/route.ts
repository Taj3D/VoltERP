// ============================================================
// AUTH REFRESH API — JWT token refresh
// POST: Exchanges a valid refresh token for a new access token
// Prevents users from being logged out during active sessions
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { verifyToken, signAccessToken, signRefreshToken } from "@/lib/jwt-utils";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { refreshToken } = body;

    if (!refreshToken) {
      return NextResponse.json(
        { error: "Refresh token is required." },
        { status: 400 }
      );
    }

    // Verify the refresh token
    const tokenResult = await verifyToken(refreshToken, "refresh");

    if (!tokenResult.valid) {
      return NextResponse.json(
        { error: tokenResult.error, expired: tokenResult.expired || false },
        { status: tokenResult.expired ? 401 : 403 }
      );
    }

    // Verify user still exists and is active
    const user = await db.user.findUnique({
      where: { id: tokenResult.payload.userId },
      select: { id: true, email: true, name: true, role: true, isActive: true, companyId: true },
    });

    if (!user || !user.isActive) {
      return NextResponse.json(
        { error: "User account is inactive or has been deactivated." },
        { status: 401 }
      );
    }

    // Issue new tokens
    const newAccessToken = signAccessToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
    });

    const newRefreshToken = signRefreshToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
    });

    return NextResponse.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    console.error("Token refresh error:", error);
    return NextResponse.json(
      { error: "Token refresh failed." },
      { status: 500 }
    );
  }
}
