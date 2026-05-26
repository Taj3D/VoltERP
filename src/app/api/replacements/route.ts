import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity } from '@/lib/api-security';

// GET /api/replacements - List all replacement orders with relations
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Replacements', 'GET');
  if (!security.authorized) return security.response;
  try {
    const replacements = await db.replacementOrder.findMany({
      where: { isActive: true },
      include: {
        salesOrder: true,
        lines: {
          include: {
            product: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(replacements);
  } catch (error) {
    console.error('Error fetching replacements:', error);
    return NextResponse.json(
      { error: 'Failed to fetch replacements' },
      { status: 500 }
    );
  }
}

// POST /api/replacements - Create replacement order with lines
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Replacements', 'POST');
  if (!security.authorized) return security.response;
  try {
    const body = await request.json();
    const { salesOrderId, date, reason, lines } = body;

    if (!date || !lines || lines.length === 0) {
      return NextResponse.json(
        { error: 'date and lines are required' },
        { status: 400 }
      );
    }

    // Auto-generate replacementNo
    const lastReplacement = await db.replacementOrder.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { replacementNo: true },
    });

    let nextNum = 1;
    if (lastReplacement?.replacementNo) {
      const match = lastReplacement.replacementNo.match(/RPL-(\d+)/);
      if (match) {
        nextNum = parseInt(match[1], 10) + 1;
      }
    }
    const replacementNo = `RPL-${String(nextNum).padStart(5, '0')}`;

    const result = await db.$transaction(async (tx) => {
      const replacement = await tx.replacementOrder.create({
        data: {
          replacementNo,
          salesOrderId: salesOrderId || null,
          date: new Date(date),
          reason: reason || null,
          lines: {
            create: lines.map(
              (line: {
                productId: string;
                quantity: number;
                rate: number;
                total: number;
              }) => ({
                productId: line.productId,
                quantity: line.quantity,
                rate: line.rate,
                total: line.total,
              })
            ),
          },
        },
        include: {
          salesOrder: true,
          lines: { include: { product: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'Replacements',
          recordId: replacement.id,
          recordLabel: replacement.replacementNo || replacement.id,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ replacementNo, salesOrderId, lineCount: lines.length }),
        },
      });

      return replacement;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating replacement order:', error);
    return NextResponse.json(
      { error: 'Failed to create replacement order' },
      { status: 500 }
    );
  }
}
