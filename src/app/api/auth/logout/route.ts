// ============================================================
// AUTH LOGOUT API — JWT token revocation
// POST: Revokes the current access token (adds to blacklist)
// This prevents token reuse even before expiry
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { revokeToken, extractBearerToken } from "@/lib/jwt-utils";

export async function POST(req: NextRequest) {
  try {
    // Extract and revoke the access token
    const authHeader = req.headers.get("authorization");
    const bearerToken = extractBearerToken(authHeader);

    if (bearerToken) {
      revokeToken(bearerToken);
    }

    // Also revoke refresh token if provided in body
    try {
      const body = await req.json();
      if (body.refreshToken) {
        revokeToken(body.refreshToken);
      }
    } catch {
      // Body may be empty — that's fine
    }

    return NextResponse.json({
      success: true,
      message: "Logged out successfully. Token has been revoked.",
    });
  } catch (error) {
    console.error("Logout error:", error);
    // Even if revocation fails, still return success
    // The token will naturally expire
    return NextResponse.json({
      success: true,
      message: "Logged out successfully.",
    });
  }
}
