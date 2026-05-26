import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'SmsSettings', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const item = await db.smsSetting.findUnique({ where: { id } });
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch SMS setting' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'SmsSettings', 'PUT');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const body = await request.json();
    const item = await db.$transaction(async (tx) => {
      const record = await tx.smsSetting.update({
        where: { id },
        data: {
          apiUrl: body.apiUrl,
          apiKey: body.apiKey,
          senderId: body.senderId,
          isActive: body.isActive ?? true,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
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
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update SMS setting' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'SmsSettings', 'DELETE');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    await db.$transaction(async (tx) => {
      const record = await tx.smsSetting.findUnique({ where: { id } });
      if (!record) throw new Error('Not found');

      // SmsSetting has no external FK references, safe to soft-delete
      await tx.smsSetting.update({
        where: { id },
        data: { isActive: false },
      });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'SmsSettings',
          recordId: record.id,
          recordLabel: record.senderId || record.apiUrl || record.id,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ apiUrl: record.apiUrl, senderId: record.senderId, softDelete: true }),
        },
      });

      return record;
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete SMS setting' }, { status: 500 });
  }
}
