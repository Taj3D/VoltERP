import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'InterestPercentages', 'GET');
  if (!security.authorized) return security.response;
  try {
    const items = await db.interestPercentage.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch interest percentages' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'InterestPercentages', 'POST');
  if (!security.authorized) return security.response;
  try {
    const body = await request.json();
    const item = await db.$transaction(async (tx) => {
      const record = await tx.interestPercentage.create({
        data: {
          percentage: body.percentage,
          effectiveDate: body.effectiveDate ? new Date(body.effectiveDate) : new Date(),
          isActive: body.isActive ?? true,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'InterestPercentages',
          recordId: record.id,
          recordLabel: `${record.percentage}%` || record.id,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ percentage: record.percentage, effectiveDate: record.effectiveDate }),
        },
      });

      return record;
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create interest percentage' }, { status: 500 });
  }
}
