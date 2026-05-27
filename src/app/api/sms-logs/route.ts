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
    const { recipient, message, status, sentAt, cost, isActive } = body;

    if (!recipient || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: recipient, message' },
        { status: 400 }
      );
    }

    const item = await db.$transaction(async (tx) => {
      const record = await tx.smsLog.create({
        data: {
          recipient,
          message,
          status: status || 'Pending',
          sentAt: sentAt ? new Date(sentAt) : new Date(),
          cost: cost ?? 0,
          isActive: isActive ?? true,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'SmsLogs',
          recordId: record.id,
          recordLabel: record.recipient || record.id,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
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
