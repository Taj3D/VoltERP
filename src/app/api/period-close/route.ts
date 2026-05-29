import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity, checkPeriodClosePermission } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// GET /api/period-close - List all period close records for the user's company
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'PeriodClose', 'GET');
  if (!security.authorized) return security.response;

  try {
    const companyId = security.user.companyId;

    const periods = await db.periodClose.findMany({
      where: {
        ...(companyId ? { companyId } : {}),
      },
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
    });

    // Add canModify boolean flag per record (true if not locked)
    const result = periods.map((period) => ({
      ...period,
      canModify: !period.isLocked,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching period close records:', error);
    return NextResponse.json(
      { error: 'Failed to fetch period close records' },
      { status: 500 }
    );
  }
}

// POST /api/period-close - Create period close with auto-code and validation
// ADMIN-ONLY: Only administrators can close accounting periods
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'PeriodClose', 'POST');
  if (!security.authorized) return security.response;

  // ADMIN-ONLY CHECK: Only admin can close periods
  const permissionCheck = checkPeriodClosePermission(security.user.role);
  if (permissionCheck) return permissionCheck;

  try {
    const companyId = security.user.companyId;
    const body = await request.json();
    const { periodMonth, periodYear, closedBy, notes } = body;

    if (!periodMonth || !periodYear) {
      return NextResponse.json(
        { error: 'periodMonth and periodYear are required' },
        { status: 400 }
      );
    }

    const month = parseInt(String(periodMonth));
    const year = parseInt(String(periodYear));

    if (month < 1 || month > 12) {
      return NextResponse.json(
        { error: 'periodMonth must be between 1 and 12' },
        { status: 400 }
      );
    }

    // MANUAL DUPLICATE CHECK within the same companyId
    // The @@unique([periodMonth, periodYear]) constraint doesn't include companyId,
    // so we must manually check for duplicates within the same tenant.
    const existing = await db.periodClose.findFirst({
      where: {
        periodMonth: month,
        periodYear: year,
        ...(companyId ? { companyId } : {}),
      },
    });

    if (existing?.isLocked) {
      return NextResponse.json(
        { error: 'Cannot close a period that is already locked' },
        { status: 400 }
      );
    }

    const result = await db.$transaction(async (tx) => {
      // Auto-generate code as BAL-XXXXX (5-digit zero-padded)
      const lastPeriod = await tx.periodClose.findFirst({
        orderBy: { code: 'desc' },
        select: { code: true },
      });

      let nextNum = 1;
      if (lastPeriod?.code) {
        const match = lastPeriod.code.match(/BAL-(\d+)/);
        if (match) {
          nextNum = parseInt(match[1], 10) + 1;
        }
      }
      const code = `BAL-${String(nextNum).padStart(5, '0')}`;

      let periodClose;

      if (existing) {
        // Update existing unlocked record (re-close the period)
        periodClose = await tx.periodClose.update({
          where: { id: existing.id },
          data: {
            closeDate: new Date(),
            closedBy: closedBy || null,
            isLocked: true,
            notes: notes || null,
            ...(companyId && { companyId }),
          },
        });
      } else {
        // Create new period close record with companyId
        periodClose = await tx.periodClose.create({
          data: {
            code,
            periodMonth: month,
            periodYear: year,
            closeDate: new Date(),
            closedBy: closedBy || null,
            isLocked: true,
            notes: notes || null,
            ...(companyId && { companyId }),
          },
        });
      }

      return { ...periodClose, canModify: false };
    });

    // Activity logging (non-blocking, outside transaction)
    await logUserActivity({
      action: 'CREATE',
      module: 'Acc-Period-Close',
      recordId: result.id,
      recordLabel: `${result.code} - ${month}/${year}`,
      userId: security.user.id,
      userName: security.user.name,
      details: JSON.stringify({
        code: result.code,
        periodMonth: month,
        periodYear: year,
        closedBy,
        isLocked: true,
        companyId: companyId || null,
      }),
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating period close:', error);
    const message = error instanceof Error ? error.message : 'Failed to create period close';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
