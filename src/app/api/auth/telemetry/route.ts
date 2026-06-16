// ============================================================
// AUTH TELEMETRY API — Export/Import Action Telemetry
// POST: Logs export/import actions to the AuditLog table
// AND increments the corresponding counter (pdfExports,
// csvExports, csvImports) in the User model for server-side
// tracking. Every PDF export, CSV export, and CSV import
// across ALL modules triggers this endpoint to append
// metadata, timestamp, and target module to the user's
// live profile activity logs.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { withApiSecurity, invalidateUserCache } from "@/lib/api-security";
import { logUserActivity } from "@/lib/activity-logger";
import { sanitizeError } from "@/lib/exception-sanitizer";
import { db } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const security = await withApiSecurity(request, "AuditLogs", "POST");
    if (!security.authorized) return security.response;

    const body = await request.json();
    const { actionType, module, filename, recordCount, details } = body;

    // Validate action type
    const validActionTypes = ["PDF_EXPORT", "CSV_EXPORT", "CSV_IMPORT"];
    if (!actionType || !validActionTypes.includes(actionType)) {
      return NextResponse.json(
        { error: `Invalid actionType. Must be one of: ${validActionTypes.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate module name
    if (!module || typeof module !== "string") {
      return NextResponse.json(
        { error: "Module name is required." },
        { status: 400 }
      );
    }

    // Map telemetry action type to AuditLog action enum
    const auditAction = actionType === "CSV_IMPORT" ? "IMPORT" : "EXPORT";

    // Build details JSON
    const telemetryDetails = JSON.stringify({
      actionType,
      module,
      filename: filename || null,
      recordCount: recordCount || null,
      additionalDetails: details || null,
      timestamp: new Date().toISOString(),
      userEmail: security.user.email,
      userRole: security.user.role,
    });

    // Create AuditLog entry with module token for fine-grained tracking
    await logUserActivity({
      action: auditAction as "EXPORT" | "IMPORT",
      module: `Telemetry-${module}`,
      recordId: security.user.id,
      recordLabel: filename || `${actionType} from ${module}`,
      userId: security.user.id,
      userName: security.user.name,
      details: telemetryDetails,
    });

    // ── Increment the corresponding counter in the User model ──
    // This provides server-side tracking of export/import counts per user
    try {
      const counterField = actionType === "PDF_EXPORT"
        ? "pdfExports"
        : actionType === "CSV_EXPORT"
          ? "csvExports"
          : "csvImports";

      await db.user.update({
        where: { id: security.user.id },
        data: { [counterField]: { increment: 1 } },
      });

      // Invalidate cached user so next request reflects the new counter
      invalidateUserCache(security.user.id);
    } catch (counterError) {
      // Non-critical: log but don't fail the telemetry request
      console.warn(`Failed to increment ${actionType} counter for user ${security.user.email}:`, counterError);
    }

    return NextResponse.json({
      success: true,
      message: "Telemetry logged successfully.",
      telemetry: {
        actionType,
        module,
        filename,
        loggedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    const sanitized = sanitizeError(error, "auth-telemetry");
    return NextResponse.json(
      { error: sanitized.userMessage, errorCode: sanitized.errorCode },
      { status: sanitized.statusCode }
    );
  }
}
