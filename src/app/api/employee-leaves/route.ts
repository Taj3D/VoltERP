import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'EmployeeLeaves', 'GET');
  if (!security.authorized) return security.response;
  try {
    const items = await db.employeeLeave.findMany({
      orderBy: { createdAt: 'desc' },
      include: { employee: true },
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
      const record = await tx.employeeLeave.create({
        data: {
          employeeId: body.employeeId,
          leaveType: body.leaveType,
          fromDate: body.fromDate ? new Date(body.fromDate) : new Date(),
          toDate: body.toDate ? new Date(body.toDate) : new Date(),
          reason: body.reason || null,
          status: body.status || 'Pending',
        },
        include: { employee: true },
      });

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'EmployeeLeaves',
          recordId: record.id,
          recordLabel: `${record.employee?.name || record.id} - ${record.leaveType}`,
          userId: 'system',
          userName: 'System',
          details: JSON.stringify({ employeeId: record.employeeId, leaveType: record.leaveType, fromDate: record.fromDate, toDate: record.toDate }),
        },
      });

      return record;
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create employee leave' }, { status: 500 });
  }
}
