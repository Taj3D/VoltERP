import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, checkPeriodClose } from '@/lib/api-security';

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Liabilities', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const headId = searchParams.get('headId');

    const where: any = { isActive: true };
    if (type) where.type = type;
    if (headId) where.investmentHeadId = headId;

    const items = await db.liability.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { investmentHead: true },
    });

    // VAT Auditor masking
    if (security.authorized && security.user.role === 'vat_auditor') {
      return NextResponse.json(items.map(item => ({
        ...item,
        amount: 'N/A (Audit Mode)',
      })));
    }

    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch liabilities' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Liabilities', 'POST');
  if (!security.authorized) return security.response;
  try {
    const body = await request.json();
    
    // Period close check
    if (body.date) {
      const periodLock = await checkPeriodClose(body.date);
      if (periodLock) return periodLock;
    }

    const item = await db.$transaction(async (tx) => {
      const record = await tx.liability.create({
        data: {
          investmentHeadId: body.investmentHeadId,
          date: body.date ? new Date(body.date) : new Date(),
          amount: body.amount,
          type: body.type || 'received',
          paymentMethod: body.paymentMethod || null,
          description: body.description || null,
          isActive: body.isActive ?? true,
        },
        include: { investmentHead: true },
      });

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'Liabilities',
          recordId: record.id,
          recordLabel: `${record.investmentHead?.name || record.id} - ৳${record.amount}`,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({ investmentHeadId: record.investmentHeadId, amount: record.amount, type: record.type, paymentMethod: record.paymentMethod }),
        },
      });

      return record;
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create liability' }, { status: 500 });
  }
}
