// ============================================================
// SECURITY THREAT LOG API — Phase 18
// Read-only endpoint for viewing XSS, SQL injection,
// rate limit breach, and unauthorized access threat logs
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity } from '@/lib/api-security';

// GET /api/security/threats — Fetch security threat logs
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'SecurityThreats', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const companyId = security.user.companyId;
    const userRole = security.user.role;

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)));

    const threatType = searchParams.get('threatType');
    const severity = searchParams.get('severity');
    const resolved = searchParams.get('resolved');
    const ipAddress = searchParams.get('ipAddress');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    const where: Record<string, unknown> = {};
    if (userRole !== 'admin' && companyId) {
      where.companyId = companyId;
    }

    if (threatType) where.threatType = threatType;
    if (severity) where.severity = severity;
    if (resolved !== null && resolved !== undefined && resolved !== '') {
      where.resolved = resolved === 'true';
    }
    if (ipAddress) where.ipAddress = { contains: ipAddress };

    if (dateFrom || dateTo) {
      const createdAt: Record<string, unknown> = {};
      if (dateFrom) createdAt.gte = new Date(dateFrom);
      if (dateTo) createdAt.lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
      where.createdAt = createdAt;
    }

    const [threats, total] = await Promise.all([
      db.securityThreatLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.securityThreatLog.count({ where }),
    ]);

    // Compute threat summary stats
    const stats = {
      total,
      xssCount: await db.securityThreatLog.count({ where: { ...where, threatType: 'XSS_SCRIPT_TAG' } }),
      sqlInjectionCount: await db.securityThreatLog.count({ where: { ...where, threatType: 'SQL_INJECTION' } }),
      rateLimitCount: await db.securityThreatLog.count({ where: { ...where, threatType: 'RATE_LIMIT_BREACH' } }),
      unauthorizedCount: await db.securityThreatLog.count({ where: { ...where, threatType: 'UNAUTHORIZED_ACCESS' } }),
      unresolvedCount: await db.securityThreatLog.count({ where: { ...where, resolved: false } }),
    };

    return NextResponse.json({
      threats,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      stats,
    });
  } catch (error: any) {
    console.error('[SecurityThreatsAPI] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch security threat logs' }, { status: 500 });
  }
}
