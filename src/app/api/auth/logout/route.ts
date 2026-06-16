// ============================================================
// AUTH LOGOUT API — JWT token revocation
// POST: Revokes the current access token (adds to blacklist)
// This prevents token reuse even before expiry
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { revokeToken, extractBearerToken, verifyToken } from "@/lib/jwt-utils";
import { logSystemAudit } from "@/lib/activity-logger";

export async function POST(req: NextRequest) {
  try {
    // Extract and revoke the access token
    const authHeader = req.headers.get("authorization");
    const bearerToken = extractBearerToken(authHeader);

    if (bearerToken) {
      await revokeToken(bearerToken);
    }

    // Log to SystemAuditLog for security tracking
    try {
      const decoded = bearerToken ? await verifyToken(bearerToken) : null;
      if (decoded?.valid && decoded.payload) {
        await logSystemAudit({
          actionType: 'LOGOUT',
          targetModel: 'User',
          targetRecordId: decoded.payload.userId,
          actorUserId: decoded.payload.userId,
          actorUserName: decoded.payload.name,
          metadata: JSON.stringify({ email: decoded.payload.email, role: decoded.payload.role }),
          companyId: decoded.payload.companyId || undefined,
        });
      }
    } catch { /* non-blocking */ }

    // Also revoke refresh token if provided in body
    try {
      const body = await req.json();
      if (body.refreshToken) {
        await revokeToken(body.refreshToken);
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
