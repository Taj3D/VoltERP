// ============================================================
// CONSOLIDATION LOG VIEWER — List all consolidation logs
// GET /api/consolidation/logs — List consolidation logs for the user's company
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, type UserRole } from '@/lib/api-security';

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'AccountingReports', 'GET');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { searchParams } = new URL(request.url);
    const statementType = searchParams.get('statementType');
    const status = searchParams.get('status');

    const where: Record<string, unknown> = {
      isActive: true,
      ...(companyId ? { companyId } : {}),
      ...(statementType ? { statementType } : {}),
      ...(status ? { status } : {}),
    };

    const logs = await db.consolidationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        company: {
          select: { id: true, name: true, code: true },
        },
      },
    });

    // Enrich with branch names
    const enriched = await Promise.all(
      logs.map(async (log) => {
        const branchIdList = log.branchIds.split(',').filter(Boolean);
        const branches = await db.branch.findMany({
          where: { id: { in: branchIdList }, isActive: true },
          select: { id: true, name: true, code: true },
        });
        return {
          ...log,
          branchNames: branches.map((b) => b.name),
        };
      })
    );

    return NextResponse.json(enriched);
  } catch (error) {
    console.error('[ConsolidationLogs GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch consolidation logs' }, { status: 500 });
  }
}
