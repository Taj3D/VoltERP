import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Units', 'PUT');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const body = await request.json();
    const record = await db.unit.update({
      where: { id },
      data: {
        name: body.name,
        symbol: body.symbol || null,
        description: body.description || null,
        isActive: body.isActive,
      },
    });

    await db.auditLog.create({
      data: {
        action: 'UPDATE',
        module: 'Units',
        recordId: record.id,
        recordLabel: record.name || record.code,
        userId: security.user?.id || 'system',
        userName: security.user?.name || 'System',
        details: JSON.stringify({ code: record.code, name: record.name }),
      },
    });

    return NextResponse.json(record);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update unit' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Units', 'DELETE');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const record = await db.unit.update({
      where: { id },
      data: { isActive: false },
    });

    await db.auditLog.create({
      data: {
        action: 'DELETE',
        module: 'Units',
        recordId: record.id,
        recordLabel: record.name || record.code,
        userId: security.user?.id || 'system',
        userName: security.user?.name || 'System',
        details: JSON.stringify({ code: record.code, softDelete: true }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete unit' }, { status: 500 });
  }
}
