import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/investments - List all investment heads with their assets and liabilities
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const includeDetails = searchParams.get('includeDetails') === 'true';

    if (includeDetails) {
      // Return investment heads with their related assets and liabilities
      const investmentHeads = await db.investmentHead.findMany({
        where: { isActive: true },
        include: {
          assets: {
            where: { isActive: true },
            orderBy: { date: 'desc' },
          },
          liabilities: {
            where: { isActive: true },
            include: { investmentHead: true },
            orderBy: { date: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Calculate totals per head
      const enriched = investmentHeads.map((head) => {
        const totalAssets = head.assets.reduce((sum, a) => sum + a.amount, 0);
        const totalLiabilities = head.liabilities.reduce((sum, l) => sum + l.amount, 0);
        const receivedLiabilities = head.liabilities
          .filter((l) => l.type === 'received')
          .reduce((sum, l) => sum + l.amount, 0);
        const payLiabilities = head.liabilities
          .filter((l) => l.type === 'pay')
          .reduce((sum, l) => sum + l.amount, 0);
        const netValue = totalAssets - totalLiabilities;

        return {
          ...head,
          totalAssets,
          totalLiabilities,
          receivedLiabilities,
          payLiabilities,
          netValue,
        };
      });

      // Overall totals
      const grandTotalAssets = enriched.reduce((sum, h) => sum + h.totalAssets, 0);
      const grandTotalLiabilities = enriched.reduce((sum, h) => sum + h.totalLiabilities, 0);
      const grandNetValue = grandTotalAssets - grandTotalLiabilities;

      return NextResponse.json({
        investmentHeads: enriched,
        summary: {
          totalHeads: enriched.length,
          grandTotalAssets,
          grandTotalLiabilities,
          grandNetValue,
        },
      });
    }

    // Simple list (same as investment-heads but with counts)
    const investmentHeads = await db.investmentHead.findMany({
      where: { isActive: true },
      include: {
        _count: {
          select: { assets: { where: { isActive: true } }, liabilities: { where: { isActive: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(investmentHeads);
  } catch (error) {
    console.error('Error fetching investments:', error);
    return NextResponse.json({ error: 'Failed to fetch investments' }, { status: 500 });
  }
}

// POST /api/investments - Create a new investment head (convenience alias)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const item = await db.$transaction(async (tx) => {
      return tx.investmentHead.create({
        data: {
          name: body.name,
          description: body.description || null,
          isActive: body.isActive ?? true,
        },
      });
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create investment head' }, { status: 500 });
  }
}
