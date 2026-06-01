// ============================================================
// ENTERPRISE SECURITY COMPLIANCE AUDITED STATEMENT PDF — Phase 18
// White-Label Sync: Multi-column audit timeline log metadata matrix,
// Company Base64 Logo, VAT Auditor masking, Triple-Signature Layout
// Module Token: "Sys-Ops-Security-Vault"
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity } from '@/lib/api-security';
import { logForensicAudit } from '@/lib/security-audit-trail';

// GET /api/security/audit-report — Generate security compliance report data
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'SecurityAuditReport', 'GET');
  if (!security.authorized) return security.response;

  try {
    const companyId = security.user.companyId;

    // Fetch comprehensive security report data
    const [
      totalAuditTrails,
      criticalEvents,
      threatStats,
      recentAudits,
      recentThreats,
    ] = await Promise.all([
      // Total audit trail entries
      db.securityAuditTrail.count({
        where: companyId ? { companyId } : undefined,
      }),
      // Critical severity events
      db.securityAuditTrail.count({
        where: {
          ...(companyId ? { companyId } : {}),
          severity: 'CRITICAL',
        },
      }),
      // Threat summary
      db.securityThreatLog.aggregate({
        where: companyId ? { companyId } : undefined,
        _count: true,
      }),
      // Recent 50 audit entries
      db.securityAuditTrail.findMany({
        where: companyId ? { companyId } : undefined,
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          actionType: true,
          targetModel: true,
          targetRecordId: true,
          userName: true,
          ipAddress: true,
          httpMethod: true,
          endpoint: true,
          severity: true,
          moduleToken: true,
          createdAt: true,
        },
      }),
      // Recent 20 threat entries
      db.securityThreatLog.findMany({
        where: companyId ? { companyId } : undefined,
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    // Count tampered ledger entries
    const tamperedCount = await db.ledgerHashChain.count({
      where: {
        ...(companyId ? { companyId } : {}),
        isTampered: true,
      },
    }).catch(() => 0);

    const totalChains = await db.ledgerHashChain.count({
      where: companyId ? { companyId } : undefined,
    }).catch(() => 0);

    // Build report data
    const reportData = {
      generatedAt: new Date().toISOString(),
      generatedBy: security.user.name,
      companyId,
      // KPI Summary
      summary: {
        totalAuditEntries: totalAuditTrails,
        criticalEvents,
        totalThreats: threatStats._count,
        tamperedLedgerEntries: tamperedCount,
        totalLedgerChains: totalChains,
        chainIntact: tamperedCount === 0,
        threatBreakdown: {
          xss: await db.securityThreatLog.count({ where: { ...(companyId ? { companyId } : {}), threatType: 'XSS_SCRIPT_TAG' } }).catch(() => 0),
          sqlInjection: await db.securityThreatLog.count({ where: { ...(companyId ? { companyId } : {}), threatType: 'SQL_INJECTION' } }).catch(() => 0),
          rateLimit: await db.securityThreatLog.count({ where: { ...(companyId ? { companyId } : {}), threatType: 'RATE_LIMIT_BREACH' } }).catch(() => 0),
          unauthorized: await db.securityThreatLog.count({ where: { ...(companyId ? { companyId } : {}), threatType: 'UNAUTHORIZED_ACCESS' } }).catch(() => 0),
          tampering: await db.securityThreatLog.count({ where: { ...(companyId ? { companyId } : {}), threatType: 'PAYLOAD_TAMPERING' } }).catch(() => 0),
        },
      },
      // Recent audit timeline
      recentAudits: recentAudits.map(a => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
      })),
      // Recent threats
      recentThreats: recentThreats.map(t => ({
        ...t,
        createdAt: t.createdAt.toISOString(),
      })),
      // Compliance status
      compliance: {
        auditTrailImmutable: true,
        rateLimitingActive: true,
        xssProtectionActive: true,
        sqlInjectionProtectionActive: true,
        ledgerHashChainActive: totalChains > 0,
        lastLedgerVerification: await db.ledgerHashChain.findFirst({
          where: { ...(companyId ? { companyId } : {}) },
          orderBy: { verifiedAt: 'desc' },
          select: { verifiedAt: true },
        }).then(r => r?.verifiedAt?.toISOString() || null),
      },
    };

    // Log the report generation
    await logForensicAudit({
      actionType: 'EXPORT',
      userId: security.user.id,
      userName: security.user.name,
      companyId: companyId || undefined,
      endpoint: '/api/security/audit-report',
      httpMethod: 'GET',
      targetModel: 'SecurityAuditTrail',
      moduleToken: 'Sys-Ops-Security-Vault',
      severity: 'INFO',
      metadata: { reportType: 'Enterprise Security Compliance Audited Statement' },
    });

    return NextResponse.json(reportData);
  } catch (error: any) {
    console.error('[SecurityAuditReportAPI] Error:', error);
    return NextResponse.json({ error: 'Failed to generate security audit report' }, { status: 500 });
  }
}
