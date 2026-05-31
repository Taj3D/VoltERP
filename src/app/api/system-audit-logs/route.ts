// ============================================================
// SYSTEM AUDIT LOGS API — Domain 20: System Audit Logs, Backups & Security Overhaul
// Read-only endpoint for fetching system audit logs with
// multi-tenant companyId isolation, RBAC enforcement, and
// paginated results with JSON-parsed previousState/newState.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';
import { sanitizeError } from '@/lib/exception-sanitizer';
import { db } from '@/lib/db';

// GET /api/system-audit-logs — Fetch paginated system audit logs
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'AuditLogs', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const companyId = security.user.companyId;
    const userRole = security.user.role;

    // Parse pagination params
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)));

    // Parse filter params
    const actionType = searchParams.get('actionType');
    const targetModel = searchParams.get('targetModel');
    const search = searchParams.get('search');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    // Build where clause with multi-tenant isolation
    // Admin sees all companies' logs, others only their own
    const where: Record<string, unknown> = {};

    if (userRole !== 'admin' && companyId) {
      where.companyId = companyId;
    }

    // Apply filters
    if (actionType) {
      where.actionType = actionType;
    }

    if (targetModel) {
      where.targetModel = targetModel;
    }

    // Search across actorUserId, targetModel, targetRecordId, metadata
    if (search) {
      where.OR = [
        { actorUserId: { contains: search } },
        { targetModel: { contains: search } },
        { targetRecordId: { contains: search } },
        { metadata: { contains: search } },
        { userAgent: { contains: search } },
        { ipAddress: { contains: search } },
      ];
    }

    // Date range filter
    if (dateFrom || dateTo) {
      const createdAt: Record<string, unknown> = {};
      if (dateFrom) {
        createdAt.gte = new Date(dateFrom);
      }
      if (dateTo) {
        createdAt.lte = new Date(dateTo);
      }
      where.createdAt = createdAt;
    }

    // Execute query with pagination
    const [logs, total] = await Promise.all([
      db.systemAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.systemAuditLog.count({ where }),
    ]);

    // Parse JSON strings for previousState and newState
    const parsedLogs = logs.map((log) => ({
      ...log,
      previousState: log.previousState ? JSON.parse(log.previousState) : null,
      newState: log.newState ? JSON.parse(log.newState) : null,
    }));

    // Log user activity with Sec-Audit-Overhaul module token
    await logUserActivity({
      action: 'EXPORT',
      module: 'Sec-Audit-Overhaul',
      userId: security.user.id,
      userName: security.user.name,
      details: JSON.stringify({
        action: 'view-audit-logs',
        page,
        pageSize,
        total,
        filters: { actionType, targetModel, search, dateFrom, dateTo },
      }),
    });

    return NextResponse.json({
      logs: parsedLogs,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    const sanitized = sanitizeError(error, 'system-audit-logs GET');
    return NextResponse.json(
      { error: sanitized.userMessage, errorCode: sanitized.errorCode },
      { status: sanitized.statusCode }
    );
  }
}
