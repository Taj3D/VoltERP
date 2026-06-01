// ============================================================
// IMMUTABLE SECURITY AUDIT TRAIL API — Phase 18
// Read-only endpoint with anti-tamper enforcement.
// UPDATE and DELETE on SecurityAuditTrail are permanently blocked.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity } from '@/lib/api-security';
import { blockAuditTrailMutation, logForensicAudit } from '@/lib/security-audit-trail';

// GET /api/security/audit-trail — Fetch paginated forensic audit entries
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'SecurityAuditTrail', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const companyId = security.user.companyId;
    const userRole = security.user.role;

    // Parse pagination
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)));

    // Parse filters
    const actionType = searchParams.get('actionType');
    const targetModel = searchParams.get('targetModel');
    const severity = searchParams.get('severity');
    const moduleToken = searchParams.get('moduleToken');
    const userId = searchParams.get('userId');
    const search = searchParams.get('search');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const branchId = searchParams.get('branchId');

    // Build where clause with multi-tenant isolation
    const where: Record<string, unknown> = {};
    if (userRole !== 'admin' && companyId) {
      where.companyId = companyId;
    } else if (companyId) {
      where.companyId = companyId;
    }

    if (actionType) where.actionType = actionType;
    if (targetModel) where.targetModel = targetModel;
    if (severity) where.severity = severity;
    if (moduleToken) where.moduleToken = moduleToken;
    if (userId) where.userId = userId;
    if (branchId) where.branchId = branchId;

    if (dateFrom || dateTo) {
      const createdAt: Record<string, unknown> = {};
      if (dateFrom) createdAt.gte = new Date(dateFrom);
      if (dateTo) createdAt.lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
      where.createdAt = createdAt;
    }

    if (search) {
      where.OR = [
        { userName: { contains: search } },
        { targetModel: { contains: search } },
        { targetRecordId: { contains: search } },
        { endpoint: { contains: search } },
        { moduleToken: { contains: search } },
        { ipAddress: { contains: search } },
      ];
    }

    const [logs, total] = await Promise.all([
      db.securityAuditTrail.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.securityAuditTrail.count({ where }),
    ]);

    // Parse JSON strings for previousState and newState
    const parsedLogs = logs.map((log) => ({
      ...log,
      previousState: log.previousState ? (() => { try { return JSON.parse(log.previousState); } catch { return log.previousState; } })() : null,
      newState: log.newState ? (() => { try { return JSON.parse(log.newState); } catch { return log.newState; } })() : null,
      diffSummary: log.diffSummary ? (() => { try { return JSON.parse(log.diffSummary); } catch { return log.diffSummary; } })() : null,
      metadata: log.metadata ? (() => { try { return JSON.parse(log.metadata); } catch { return log.metadata; } })() : null,
    }));

    return NextResponse.json({
      logs: parsedLogs,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error: any) {
    console.error('[SecurityAuditTrailAPI] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch security audit trail' }, { status: 500 });
  }
}

// POST — BLOCKED: SecurityAuditTrail is append-only, no manual creation via API
export async function POST(request: NextRequest) {
  const block = blockAuditTrailMutation();
  return NextResponse.json({ error: block.message }, { status: 403 });
}

// PUT — BLOCKED: SecurityAuditTrail is immutable
export async function PUT(request: NextRequest) {
  const block = blockAuditTrailMutation();
  return NextResponse.json({ error: block.message }, { status: 403 });
}

// DELETE — BLOCKED: SecurityAuditTrail is immutable
export async function DELETE(request: NextRequest) {
  const block = blockAuditTrailMutation();
  return NextResponse.json({ error: block.message }, { status: 403 });
}
