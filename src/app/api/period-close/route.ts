import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity } from '@/lib/api-security';

// GET /api/period-close - List all period close records with canModify flag
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'PeriodClose', 'GET');
  if (!security.authorized) return security.response;
  try {
    const periods = await db.periodClose.findMany({
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
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'PeriodClose', 'POST');
  if (!security.authorized) return security.response;
  try {
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

    // Check if period is already locked (unique constraint on periodMonth + periodYear)
    const existing = await db.periodClose.findUnique({
      where: { periodMonth_periodYear: { periodMonth: month, periodYear: year } },
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

      // Use upsert to prevent duplicate records for same month/year
      const periodClose = await tx.periodClose.upsert({
        where: { periodMonth_periodYear: { periodMonth: month, periodYear: year } },
        update: {
          closeDate: new Date(),
          closedBy: closedBy || null,
          isLocked: true,
          notes: notes || null,
        },
        create: {
          code,
          periodMonth: month,
          periodYear: year,
          closeDate: new Date(),
          closedBy: closedBy || null,
          isLocked: true,
          notes: notes || null,
        },
      });

      // Create AuditLog entry
      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'PeriodClose',
          recordId: periodClose.id,
          recordLabel: `${periodClose.code} - ${month}/${year}`,
          details: JSON.stringify({
            code: periodClose.code,
            periodMonth: month,
            periodYear: year,
            closedBy,
            isLocked: true,
          }),
        },
      });

      return { ...periodClose, canModify: false };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating period close:', error);
    const message = error instanceof Error ? error.message : 'Failed to create period close';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
