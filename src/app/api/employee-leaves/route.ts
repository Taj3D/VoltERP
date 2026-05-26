import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'EmployeeLeaves', 'GET');
  if (!security.authorized) return security.response;
  try {
    // SR: can view leaves but cannot approve/reject
    // Dealer: blocked at api-security level
    const items = await db.employeeLeave.findMany({
      orderBy: { createdAt: 'desc' },
      include: { employee: { include: { designation: true, department: true } } },
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
    const item = await db.$transaction(async (tx) => {
      // Auto-generate LEV-XXXXX code
      let leaveCode = body.leaveCode;
      if (!leaveCode) {
        const lastRecord = await tx.employeeLeave.findFirst({
          orderBy: { createdAt: 'desc' },
          select: { leaveCode: true },
        });
        let nextNum = 1;
        if (lastRecord?.leaveCode) {
          const match = lastRecord.leaveCode.match(/LEV-(\d+)/);
          if (match) nextNum = parseInt(match[1]) + 1;
        }
        leaveCode = `LEV-${String(nextNum).padStart(5, '0')}`;
      }

      // Calculate total days
      const fromDate = body.fromDate ? new Date(body.fromDate) : new Date();
      const toDate = body.toDate ? new Date(body.toDate) : new Date();
      const diffMs = toDate.getTime() - fromDate.getTime();
      const totalDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1);

      const record = await tx.employeeLeave.create({
        data: {
          leaveCode,
          employeeId: body.employeeId,
          leaveType: body.leaveType,
          fromDate,
          toDate,
          totalDays: body.totalDays || totalDays,
          reason: body.reason || null,
          status: body.status || 'Pending',
        },
        include: { employee: { include: { designation: true, department: true } } },
      });

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'EmployeeLeaves',
          recordId: record.id,
          recordLabel: `${record.leaveCode} - ${record.employee?.name || record.id} - ${record.leaveType}`,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ leaveCode: record.leaveCode, employeeId: record.employeeId, leaveType: record.leaveType, fromDate: record.fromDate, toDate: record.toDate, totalDays: record.totalDays }),
        },
      });

      return record;
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create employee leave' }, { status: 500 });
  }
}
