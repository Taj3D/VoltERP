import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, checkPeriodClose, maskForVatAuditor } from '@/lib/api-security';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Liabilities', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const item = await db.liability.findUnique({
      where: { id },
      include: { investmentHead: true },
    });
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const masked = maskForVatAuditor(item, security.user.role, ['amount']);
    return NextResponse.json(masked);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Liabilities', 'PUT');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const body = await request.json();

    if (body.date) {
      const periodLock = await checkPeriodClose(body.date);
      if (periodLock) return periodLock;
    }

    const item = await db.$transaction(async (tx) => {
      const record = await tx.liability.update({
        where: { id },
        data: {
          investmentHeadId: body.investmentHeadId,
          date: body.date ? new Date(body.date) : new Date(),
          amount: body.amount,
          type: body.type || undefined,
          paymentMethod: body.paymentMethod !== undefined ? body.paymentMethod : undefined,
          description: body.description || null,
          isActive: body.isActive ?? true,
        },
        include: { investmentHead: true },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'Liabilities',
          recordId: record.id,
          recordLabel: `${record.investmentHead?.name || record.id} - ৳${record.amount}`,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({ investmentHeadId: record.investmentHeadId, amount: record.amount, type: record.type }),
        },
      });

      return record;
    });
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Liabilities', 'DELETE');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    await db.$transaction(async (tx) => {
      const record = await tx.liability.findUnique({
        where: { id },
        include: { investmentHead: true },
      });
      if (!record) throw new Error('Not found');

      await tx.liability.update({
        where: { id },
        data: { isActive: false },
      });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'Liabilities',
          recordId: record.id,
          recordLabel: `${record.investmentHead?.name || record.id} - ৳${record.amount}`,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({ investmentHeadId: record.investmentHeadId, amount: record.amount, softDelete: true }),
        },
      });

      return record;
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
