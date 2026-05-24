import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PrismaClient } from "@prisma/client";

function getAuditDb() {
  if (typeof (db as any).auditLog !== "undefined") return db;
  // Cached PrismaClient is stale, create fresh one
  return new PrismaClient();
}

export async function GET(req: NextRequest) {
  try {
    const auditDb = getAuditDb();
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
      auditDb.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      auditDb.auditLog.count({ where }),
    ]);

    // Get unique modules and actions for filters
    const modules = await auditDb.auditLog.findMany({
      select: { module: true },
      distinct: ["module"],
      orderBy: { module: "asc" },
    });
    const actions = await auditDb.auditLog.findMany({
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
  try {
    const body = await req.json();
    const log = await auditDb.auditLog.create({
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
