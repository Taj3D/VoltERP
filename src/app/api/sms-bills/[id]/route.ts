import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity } from '@/lib/api-security';

// GET /api/sms-bills/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'SmsBills', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const smsBill = await db.smsBill.findUnique({
      where: { id },
      include: {
        payments: true,
      },
    });

    if (!smsBill) {
      return NextResponse.json(
        { error: 'SMS bill not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(smsBill);
  } catch (error) {
    console.error('Error fetching SMS bill:', error);
    return NextResponse.json(
      { error: 'Failed to fetch SMS bill' },
      { status: 500 }
    );
  }
}

// PUT /api/sms-bills/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'SmsBills', 'PUT');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const body = await request.json();
    const { period, totalSms, totalCost, paidAmount, status } = body;

    const result = await db.$transaction(async (tx) => {
      const smsBill = await tx.smsBill.update({
        where: { id },
        data: {
          ...(period && { period }),
          ...(totalSms !== undefined && { totalSms }),
          ...(totalCost !== undefined && { totalCost }),
          ...(paidAmount !== undefined && { paidAmount }),
          ...(status && { status }),
        },
        include: {
          payments: true,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'SmsBills',
          recordId: smsBill.id,
          recordLabel: smsBill.period || smsBill.id,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ period: smsBill.period, status: smsBill.status, totalCost: smsBill.totalCost }),
        },
      });

      return smsBill;
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating SMS bill:', error);
    return NextResponse.json(
      { error: 'Failed to update SMS bill' },
      { status: 500 }
    );
  }
}

// DELETE /api/sms-bills/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'SmsBills', 'DELETE');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;

    await db.$transaction(async (tx) => {
      const record = await tx.smsBill.findUnique({ where: { id } });
      if (!record) throw new Error('Not found');

      // SmsBill has no isActive field - perform hard delete with audit log
      await tx.smsBillPayment.deleteMany({
        where: { smsBillId: id },
      });

      await tx.smsBill.delete({
        where: { id },
      });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'SmsBills',
          recordId: record.id,
          recordLabel: record.period || record.id,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ period: record.period, totalCost: record.totalCost, hardDelete: true }),
        },
      });

      return record;
    });

    return NextResponse.json({ message: 'SMS bill deleted successfully' });
  } catch (error) {
    console.error('Error deleting SMS bill:', error);
    return NextResponse.json(
      { error: 'Failed to delete SMS bill' },
      { status: 500 }
    );
  }
}
