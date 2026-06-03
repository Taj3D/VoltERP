import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, safeFinancialAdd, safeFinancialSubtract } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

const nullIfEmpty = (v: string | undefined | null) => (!v || !v.trim()) ? null : v.trim();

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'EmployeeLeaves', 'GET');
  if (!security.authorized) return security.response;

  try {
    const companyId = security.user.companyId;

    const items = await db.employeeLeave.findMany({
      where: {
        ...(companyId ? { companyId, isActive: true } : { isActive: true }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        employee: {
          include: {
            designation: true,
            department: true,
            leaveAllocations: true,
          },
        },
      },
    });

    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch employee leaves' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'EmployeeLeaves', 'POST');
  if (!security.authorized) return security.response;

  try {
    const body = await request.json();
    const companyId = security.user.companyId;

    // ── Phase 8: Validate input parameters ──

    // 1. Leave Days must be positive
    if (!body.totalDays || Number(body.totalDays) <= 0) {
      return NextResponse.json({ error: 'Leave Days must be a positive number' }, { status: 400 });
    }

    // 2. End Date >= Start Date
    const fromDate = body.fromDate ? new Date(body.fromDate) : new Date();
    const toDate = body.toDate ? new Date(body.toDate) : new Date();

    if (toDate < fromDate) {
      return NextResponse.json({ error: 'End Date must be greater than or equal to Start Date' }, { status: 400 });
    }

    // ── Phase 8: Concurrency-locked transaction ──
    const item = await db.$transaction(async (tx) => {
      // Auto-generate LEV-XXXXX code
      let leaveCode = body.leaveCode;
      if (!leaveCode) {
        const allRecords = await tx.employeeLeave.findMany({ select: { leaveCode: true } });
        let nextNum = 1;
        for (const r of allRecords) {
          const match = r.leaveCode?.match(/LEV-(\d+)/);
          if (match) nextNum = Math.max(nextNum, parseInt(match[1]) + 1);
        }
        leaveCode = `LEV-${String(nextNum).padStart(5, '0')}`;
      }

      // ── Phase 8: Check LeaveAllocation for balance validation ──
      const currentYear = new Date().getFullYear();
      const allocation = await tx.leaveAllocation.findFirst({
        where: {
          employeeId: body.employeeId,
          leaveType: body.leaveType,
          year: currentYear,
          isActive: true,
        },
      });

      if (allocation) {
        // Use safeFinancialSubtract for balance computation
        const remainingAfter = safeFinancialSubtract(allocation.remainingDays, Number(body.totalDays));
        if (remainingAfter < 0) {
          throw new Error('Transaction Blocked: Insufficient accumulated leave balance.');
        }
      }

      // Calculate total days from dates
      const diffMs = toDate.getTime() - fromDate.getTime();
      const calculatedDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1);

      // Create the leave record
      const record = await tx.employeeLeave.create({
        data: {
          leaveCode,
          employeeId: body.employeeId,
          leaveType: body.leaveType,
          fromDate,
          toDate,
          totalDays: Number(body.totalDays) || calculatedDays,
          reason: nullIfEmpty(body.reason),
          status: body.status || 'Pending',
          ...(companyId && { companyId }),
        },
        include: {
          employee: {
            include: {
              designation: true,
              department: true,
              leaveAllocations: true,
            },
          },
        },
      });

      // ── Phase 8: If leave is created with status "Approved", update allocation ──
      if (allocation && body.status === 'Approved') {
        await tx.leaveAllocation.update({
          where: { id: allocation.id },
          data: {
            usedDays: safeFinancialAdd(allocation.usedDays, Number(body.totalDays)),
            remainingDays: safeFinancialSubtract(allocation.remainingDays, Number(body.totalDays)),
          },
        });
      }

      // Activity log with module: 'HR-Personnel-Core'
      await logUserActivity({
          tx: tx,
        action: 'CREATE',
        module: 'HR-Personnel-Core',
        recordId: record.id,
        recordLabel: `${record.leaveCode} - ${record.employee?.name || record.id} - ${record.leaveType}`,
        userId: security.user?.id,
        userName: security.user?.name || security.user?.email,
        details: JSON.stringify({
          leaveCode: record.leaveCode,
          employeeId: record.employeeId,
          leaveType: record.leaveType,
          fromDate: record.fromDate,
          toDate: record.toDate,
          totalDays: record.totalDays,
          status: record.status,
        }),
      });

      return record;
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error: any) {
    // ── Phase 8: Race-condition protection — return 422 when balance insufficient ──
    if (error?.message?.includes('Transaction Blocked')) {
      return NextResponse.json(
        { error: 'Transaction Blocked: Insufficient accumulated leave balance.' },
        { status: 422 }
      );
    }
    if (error?.message?.includes('cannot be before') || error?.message?.includes('End Date')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create employee leave' }, { status: 500 });
  }
}
