import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity } from '@/lib/api-security';

// GET /api/sms-bill-payments/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'SmsBillPayments', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const payment = await db.smsBillPayment.findUnique({
      where: { id },
      include: {
        smsBill: true,
      },
    });

    if (!payment) {
      return NextResponse.json(
        { error: 'SMS bill payment not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(payment);
  } catch (error) {
    console.error('Error fetching SMS bill payment:', error);
    return NextResponse.json(
      { error: 'Failed to fetch SMS bill payment' },
      { status: 500 }
    );
  }
}

// PUT /api/sms-bill-payments/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'SmsBillPayments', 'PUT');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const body = await request.json();
    const { smsBillId, amount, date, method, notes } = body;

    const result = await db.$transaction(async (tx) => {
      const payment = await tx.smsBillPayment.update({
        where: { id },
        data: {
          ...(smsBillId && { smsBillId }),
          ...(amount !== undefined && { amount }),
          ...(date && { date: new Date(date) }),
          ...(method !== undefined && { method }),
          ...(notes !== undefined && { notes }),
        },
        include: {
          smsBill: true,
        },
      });

      // Recalculate the SMS bill's paidAmount
      if (payment.smsBillId) {
        const smsBill = await tx.smsBill.findUnique({
          where: { id: payment.smsBillId },
          include: { payments: true },
        });

        if (smsBill) {
          const totalPaid = smsBill.payments.reduce((sum, p) => sum + p.amount, 0);
          const newStatus = totalPaid >= smsBill.totalCost ? 'Paid' : totalPaid > 0 ? 'Partial' : 'Unpaid';

          await tx.smsBill.update({
            where: { id: smsBill.id },
            data: {
              paidAmount: totalPaid,
              status: newStatus,
            },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'SmsBillPayments',
          recordId: payment.id,
          recordLabel: `${payment.smsBill?.period || payment.id} - ${payment.amount}`,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ smsBillId: payment.smsBillId, amount: payment.amount }),
        },
      });

      return payment;
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating SMS bill payment:', error);
    return NextResponse.json(
      { error: 'Failed to update SMS bill payment' },
      { status: 500 }
    );
  }
}

// DELETE /api/sms-bill-payments/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'SmsBillPayments', 'DELETE');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;

    await db.$transaction(async (tx) => {
      // Get the payment first to find the smsBillId for recalculation
      const payment = await tx.smsBillPayment.findUnique({
        where: { id },
      });

      // SmsBillPayment has no isActive field - perform hard delete with audit log
      await tx.smsBillPayment.delete({
        where: { id },
      });

      // Recalculate the SMS bill's paidAmount
      if (payment?.smsBillId) {
        const smsBill = await tx.smsBill.findUnique({
          where: { id: payment.smsBillId },
          include: { payments: true },
        });

        if (smsBill) {
          const totalPaid = smsBill.payments.reduce((sum, p) => sum + p.amount, 0);
          const newStatus = totalPaid >= smsBill.totalCost ? 'Paid' : totalPaid > 0 ? 'Partial' : 'Unpaid';

          await tx.smsBill.update({
            where: { id: smsBill.id },
            data: {
              paidAmount: totalPaid,
              status: newStatus,
            },
          });
        }
      }

      if (payment) {
        await tx.auditLog.create({
          data: {
            action: 'DELETE',
            module: 'SmsBillPayments',
            recordId: payment.id,
            recordLabel: `${payment.smsBillId} - ${payment.amount}`,
            userId: security.user?.id || 'system',
            userName: security.user?.name || 'System',
            details: JSON.stringify({ smsBillId: payment.smsBillId, amount: payment.amount, hardDelete: true }),
          },
        });
      }

      return payment;
    });

    return NextResponse.json({ message: 'SMS bill payment deleted successfully' });
  } catch (error) {
    console.error('Error deleting SMS bill payment:', error);
    return NextResponse.json(
      { error: 'Failed to delete SMS bill payment' },
      { status: 500 }
    );
  }
}
