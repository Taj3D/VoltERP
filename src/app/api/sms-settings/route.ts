import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'SmsSettings', 'GET');
  if (!security.authorized) return security.response;
  try {
    const items = await db.smsSetting.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch SMS settings' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'SmsSettings', 'POST');
  if (!security.authorized) return security.response;
  try {
    const body = await request.json();
    const item = await db.$transaction(async (tx) => {
      const record = await tx.smsSetting.create({
        data: {
          apiUrl: body.apiUrl,
          apiKey: body.apiKey,
          senderId: body.senderId,
          isActive: body.isActive ?? true,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'SmsSettings',
          recordId: record.id,
          recordLabel: record.senderId || record.apiUrl || record.id,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ apiUrl: record.apiUrl, senderId: record.senderId }),
        },
      });

      return record;
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create SMS setting' }, { status: 500 });
  }
}
