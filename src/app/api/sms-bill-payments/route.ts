import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity } from '@/lib/api-security';

// GET /api/sms-bill-payments - List all SMS bill payments with relations
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'SmsBillPayments', 'GET');
  if (!security.authorized) return security.response;
  try {
    const payments = await db.smsBillPayment.findMany({
      include: {
        smsBill: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(payments);
  } catch (error) {
    console.error('Error fetching SMS bill payments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch SMS bill payments' },
      { status: 500 }
    );
  }
}

// POST /api/sms-bill-payments - Create SMS bill payment
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'SmsBillPayments', 'POST');
  if (!security.authorized) return security.response;
  try {
    const body = await request.json();
    const { smsBillId, amount, date, method, notes } = body;

    if (!smsBillId || amount === undefined || !date) {
      return NextResponse.json(
        { error: 'smsBillId, amount, and date are required' },
        { status: 400 }
      );
    }

    const result = await db.$transaction(async (tx) => {
      const payment = await tx.smsBillPayment.create({
        data: {
          smsBillId,
          amount,
          date: new Date(date),
          method: method || null,
          notes: notes || null,
        },
        include: {
          smsBill: true,
        },
      });

      // Update the SMS bill's paidAmount
      const smsBill = await tx.smsBill.findUnique({
        where: { id: smsBillId },
        include: { payments: true },
      });

      if (smsBill) {
        const totalPaid = smsBill.payments.reduce((sum, p) => sum + p.amount, 0);
        const newStatus = totalPaid >= smsBill.totalCost ? 'Paid' : 'Partial';

        await tx.smsBill.update({
          where: { id: smsBillId },
          data: {
            paidAmount: totalPaid,
            status: newStatus,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'SmsBillPayments',
          recordId: payment.id,
          recordLabel: `${payment.smsBill?.period || payment.id} - ${payment.amount}`,
          userId: 'system',
          userName: 'System',
          details: JSON.stringify({ smsBillId, amount, date, method }),
        },
      });

      return payment;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating SMS bill payment:', error);
    return NextResponse.json(
      { error: 'Failed to create SMS bill payment' },
      { status: 500 }
    );
  }
}
