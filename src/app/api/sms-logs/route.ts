import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'SmsLogs', 'GET');
  if (!security.authorized) return security.response;
  try {
    const items = await db.smsLog.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch SMS logs' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'SmsLogs', 'POST');
  if (!security.authorized) return security.response;
  try {
    const body = await request.json();
    const item = await db.$transaction(async (tx) => {
      const record = await tx.smsLog.create({
        data: {
          recipient: body.recipient,
          message: body.message,
          status: body.status || 'Pending',
          sentAt: body.sentAt ? new Date(body.sentAt) : new Date(),
          cost: body.cost ?? 0,
          isActive: body.isActive ?? true,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'SmsLogs',
          recordId: record.id,
          recordLabel: record.recipient || record.id,
          userId: 'system',
          userName: 'System',
          details: JSON.stringify({ recipient: record.recipient, status: record.status, cost: record.cost }),
        },
      });

      return record;
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create SMS log' }, { status: 500 });
  }
}
