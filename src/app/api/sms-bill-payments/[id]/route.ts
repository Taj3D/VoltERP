import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/sms-bill-payments/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await db.$transaction(async (tx) => {
      // Get the payment first to find the smsBillId for recalculation
      const payment = await tx.smsBillPayment.findUnique({
        where: { id },
      });

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
