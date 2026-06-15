import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withApiSecurity, type UserRole, stripHtml } from '@/lib/api-security';

export async function GET(req: NextRequest) {
  const security = await withApiSecurity(req, 'AuditLogs', 'GET');
  if (!security.authorized) return security.response;
  try {
    const userRole = security.user.role as UserRole;
    const isVatAuditor = userRole === 'vat_auditor';

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

    // VAT Auditor: mask details containing financial data
    const maskedLogs = logs.map((log: any) => {
      if (isVatAuditor && log.details) {
        const lower = (log.details as string).toLowerCase();
        const containsFinancialData =
          lower.includes('profit') ||
          lower.includes('margin') ||
          lower.includes('costprice') ||
          lower.includes('wholesaleprice') ||
          lower.includes('dealerprice') ||
          lower.includes('writeoff');
        
        if (containsFinancialData) {
          return { ...log, details: 'N/A (Audit Mode)' };
        }
      }
      return log;
    });

    return NextResponse.json({
      logs: maskedLogs,
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

  // Restrict audit log creation to admin only (audit logs should be system-generated)
  if (security.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Only administrators can create audit log entries' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const { action, module, recordId, recordLabel, userId, userName, details, ip } = body;

    if (!action || !module) {
      return NextResponse.json(
        { error: 'Missing required fields: action, module' },
        { status: 400 }
      );
    }

    const log = await db.auditLog.create({
      data: {
        action,
        module,
        recordId: recordId ? stripHtml(recordId) : undefined,
        recordLabel: recordLabel ? stripHtml(recordLabel) : undefined,
        userId: userId || security.user?.id || 'system',
        userName: userName ? stripHtml(userName) : (security.user?.name || 'System'),
        details: details ? stripHtml(details) : undefined,
        ip: ip ? stripHtml(ip) : undefined,
      },
    });
    return NextResponse.json(log, { status: 201 });
  } catch (error) {
    console.error("Audit log POST error:", error);
    return NextResponse.json({ error: "Failed to create audit log" }, { status: 500 });
  }
}
