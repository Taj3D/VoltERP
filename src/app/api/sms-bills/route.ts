import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity } from '@/lib/api-security';

// GET /api/sms-bills - List all SMS bills with relations
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'SmsBills', 'GET');
  if (!security.authorized) return security.response;
  try {
    const smsBills = await db.smsBill.findMany({
      include: {
        payments: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(smsBills);
  } catch (error) {
    console.error('Error fetching SMS bills:', error);
    return NextResponse.json(
      { error: 'Failed to fetch SMS bills' },
      { status: 500 }
    );
  }
}

// POST /api/sms-bills - Create SMS bill
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'SmsBills', 'POST');
  if (!security.authorized) return security.response;
  try {
    const body = await request.json();
    const { period, totalSms, totalCost, paidAmount, status } = body;

    if (!period) {
      return NextResponse.json(
        { error: 'period is required' },
        { status: 400 }
      );
    }

    const result = await db.$transaction(async (tx) => {
      const smsBill = await tx.smsBill.create({
        data: {
          period,
          totalSms: totalSms || 0,
          totalCost: totalCost || 0,
          paidAmount: paidAmount || 0,
          status: status || 'Unpaid',
        },
        include: {
          payments: true,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'SmsBills',
          recordId: smsBill.id,
          recordLabel: smsBill.period || smsBill.id,
          userId: 'system',
          userName: 'System',
          details: JSON.stringify({ period, totalSms, totalCost, status: smsBill.status }),
        },
      });

      return smsBill;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating SMS bill:', error);
    return NextResponse.json(
      { error: 'Failed to create SMS bill' },
      { status: 500 }
    );
  }
}
