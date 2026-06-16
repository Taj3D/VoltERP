// ============================================================
// BRANCH CRUD — List & Create
// GET  /api/branches — List all branches for the user's company
// POST /api/branches — Create a new branch
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, safeFinancialRound, type UserRole } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Branches', 'GET');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;
  const role = security.user.role as UserRole;

  try {
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get('branchId');

    const where: Record<string, unknown> = {
      isActive: true,
      ...(companyId ? { companyId } : {}),
    };

    // If specific branch requested, filter to it
    if (branchId) {
      where.id = branchId;
    }

    const branches = await db.branch.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        company: {
          select: { id: true, name: true, code: true },
        },
        _count: {
          select: { users: true, godowns: true },
        },
      },
    });

    return NextResponse.json(branches);
  } catch (error) {
    console.error('[Branches GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch branches' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Branches', 'POST');
  if (!security.authorized) return security.response;

  let companyId = security.user.companyId || null;

  try {
    const body = await request.json();

    // Allow explicit companyId in request body (e.g., for admin users)
    if (body.companyId) {
      companyId = body.companyId;
    }

    // Admin users may have companyId: null — auto-assign the first company
    if (!companyId) {
      const firstCompany = await db.company.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (firstCompany) {
        companyId = firstCompany.id;
      } else {
        return NextResponse.json(
          { error: 'No company found in the system. Please create a company first.' },
          { status: 400 }
        );
      }
    }

    // Validate required fields
    if (!body.name) {
      return NextResponse.json(
        { error: 'Branch name is required.' },
        { status: 400 }
      );
    }

    // Auto-generate branch code if not provided
    let code = body.code;
    if (!code) {
      const lastBranch = await db.branch.findFirst({
        where: { companyId },
        orderBy: { code: 'desc' },
        select: { code: true },
      });
      const lastNum = lastBranch?.code
        ? parseInt(lastBranch.code.replace(/\D/g, ''), 10) || 0
        : 0;
      code = `BR-${String(lastNum + 1).padStart(5, '0')}`;
    }

    // Check for duplicate code
    const existing = await db.branch.findUnique({ where: { code } });
    if (existing) {
      return NextResponse.json(
        { error: `Branch code "${code}" already exists.` },
        { status: 409 }
      );
    }

    const branch = await db.$transaction(async (tx) => {
      const record = await tx.branch.create({
        data: {
          code,
          name: body.name,
          address: body.address || null,
          phone: body.phone || null,
          email: body.email || null,
          managerName: body.managerName || null,
          companyId,
          status: body.status || 'ACTIVE',
          isHeadOffice: body.isHeadOffice ?? false,
          gstNumber: body.gstNumber || null,
          openingDate: body.openingDate ? new Date(body.openingDate) : null,
          isActive: body.isActive ?? true,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'Holding-Consolidation-Core',
          recordId: record.id,
          recordLabel: record.name || record.code,
          userId: security.user.id || 'system',
          userName: security.user.name || 'System',
          details: JSON.stringify({
            code: record.code,
            name: record.name,
            companyId,
            status: record.status,
            isHeadOffice: record.isHeadOffice,
          }),
        },
      });

      return record;
    });

    return NextResponse.json(branch, { status: 201 });
  } catch (error) {
    console.error('[Branches POST] Error:', error);
    return NextResponse.json({ error: 'Failed to create branch' }, { status: 500 });
  }
}
