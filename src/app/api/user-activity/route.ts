// ============================================================
// USER ACTIVITY API — Profile Center Activity Ledger
// GET: Returns paginated AuditLog entries for the current user
// filtered by EXPORT/IMPORT action types.
// Supports filtering by actionType and pagination.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { withApiSecurity } from "@/lib/api-security";
import { sanitizeError } from "@/lib/exception-sanitizer";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    // Enforce authentication and RBAC
    const security = await withApiSecurity(request, "AuditLogs", "GET");
    if (!security.authorized) return security.response;

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || security.user.id;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10)));
    const actionType = searchParams.get("actionType") || "ALL";

    // Build the where clause
    const where: Record<string, unknown> = {
      action: { in: ["EXPORT", "IMPORT"] },
    };

    // Filter by userId (only allow admin to query other users, others can only see their own)
    if (security.user.role !== "admin" && userId !== security.user.id) {
      return NextResponse.json(
        { error: "You can only view your own activity logs." },
        { status: 403 }
      );
    }

    // Try to match by userId (cuid) first, then by userName
    const userRecord = await db.user.findUnique({ where: { id: userId } });
    if (userRecord) {
      where.OR = [
        { userId: userId },
        { userName: userRecord.name },
      ];
    } else {
      // If not found by ID, try matching by name (for backward compat with older logs)
      where.userName = userId;
    }

    // Apply action type filter
    if (actionType !== "ALL") {
      switch (actionType) {
        case "PDF_EXPORT":
          where.details = { contains: "PDF" };
          where.action = "EXPORT";
          break;
        case "CSV_EXPORT":
          where.details = { contains: "CSV" };
          where.action = "EXPORT";
          break;
        case "CSV_IMPORT":
          where.action = "IMPORT";
          break;
      }
    }

    const skip = (page - 1) * pageSize;

    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        select: {
          id: true,
          action: true,
          module: true,
          recordId: true,
          recordLabel: true,
          userName: true,
          details: true,
          createdAt: true,
        },
      }),
      db.auditLog.count({ where }),
    ]);

    // Parse details JSON and determine action sub-type
    const enrichedLogs = logs.map((log) => {
      let parsedDetails: Record<string, unknown> = {};
      try {
        if (log.details) {
          parsedDetails = JSON.parse(log.details);
        }
      } catch {
        parsedDetails = { raw: log.details };
      }

      // Determine the specific action type
      let actionLabel = log.action;
      const detailsStr = log.details || "";
      if (log.action === "EXPORT") {
        if (detailsStr.includes("PDF")) {
          actionLabel = "PDF Export";
        } else if (detailsStr.includes("CSV")) {
          actionLabel = "CSV Export";
        } else {
          actionLabel = "Export";
        }
      } else if (log.action === "IMPORT") {
        actionLabel = "CSV Import";
      }

      return {
        id: log.id,
        action: log.action,
        actionLabel,
        module: log.module,
        recordId: log.recordId,
        recordLabel: log.recordLabel,
        userName: log.userName,
        details: parsedDetails,
        filename: (parsedDetails.filename as string) || (parsedDetails.fileName as string) || null,
        createdAt: log.createdAt,
      };
    });

    return NextResponse.json({
      logs: enrichedLogs,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    const sanitized = sanitizeError(error, "user-activity");
    return NextResponse.json(
      { error: sanitized.userMessage, errorCode: sanitized.errorCode },
      { status: sanitized.statusCode }
    );
  }
}
