import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withApiSecurity } from '@/lib/api-security';

export async function GET(req: NextRequest) {
  const security = await withApiSecurity(req, 'AuditLogs', 'GET');
  if (!security.authorized) return security.response;
  try {
    const url = new URL(req.url);
    const moduleFilter = url.searchParams.get("module");
    const action = url.searchParams.get("action");
    const search = url.searchParams.get("search");
    const limit = parseInt(url.searchParams.get("limit") || "100");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    const where: Record<string, unknown> = {};
    if (moduleFilter && moduleFilter !== "all") where.module = moduleFilter;
    if (action && action !== "all") where.action = action;
    if (search) {
      where.OR = [
        { recordLabel: { contains: search } },
        { userName: { contains: search } },
        { details: { contains: search } },
        { module: { contains: search } },
      ];
    }

    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.auditLog.count({ where }),
    ]);

    // Get unique modules and actions for filters
    const modules = await db.auditLog.findMany({
      select: { module: true },
      distinct: ["module"],
      orderBy: { module: "asc" },
    });
    const actions = await db.auditLog.findMany({
      select: { action: true },
      distinct: ["action"],
      orderBy: { action: "asc" },
    });

    return NextResponse.json({
      logs,
      total,
      modules: modules.map(m => m.module),
      actions: actions.map(a => a.action),
    });
  } catch (error) {
    console.error("Audit logs GET error:", error);
    return NextResponse.json({ error: "Failed to fetch audit logs" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const security = await withApiSecurity(req, 'AuditLogs', 'POST');
  if (!security.authorized) return security.response;
  try {
    const body = await req.json();
    const log = await db.auditLog.create({
      data: {
        action: body.action,
        module: body.module,
        recordId: body.recordId,
        recordLabel: body.recordLabel,
        userId: body.userId,
        userName: body.userName,
        details: body.details,
        ip: body.ip,
      },
    });
    return NextResponse.json(log, { status: 201 });
  } catch (error) {
    console.error("Audit log POST error:", error);
    return NextResponse.json({ error: "Failed to create audit log" }, { status: 500 });
  }
}
