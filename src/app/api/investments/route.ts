import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'InvestmentHeads', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { searchParams } = new URL(request.url);
    const includeDetails = searchParams.get('includeDetails') === 'true';
    const headType = searchParams.get('headType');

    const where: any = { isActive: true };
    if (headType) where.type = headType;

    if (includeDetails) {
      const investmentHeads = await db.investmentHead.findMany({
        where,
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

      const isVatAuditor = security.authorized && security.user.role === 'vat_auditor';

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
          totalAssets: isVatAuditor ? 'N/A (Audit Mode)' : totalAssets,
          totalLiabilities: isVatAuditor ? 'N/A (Audit Mode)' : totalLiabilities,
          receivedLiabilities: isVatAuditor ? 'N/A (Audit Mode)' : receivedLiabilities,
          payLiabilities: isVatAuditor ? 'N/A (Audit Mode)' : payLiabilities,
          netValue: isVatAuditor ? 'N/A (Audit Mode)' : netValue,
          assets: isVatAuditor ? head.assets.map(a => ({ ...a, amount: 'N/A (Audit Mode)' })) : head.assets,
          liabilities: isVatAuditor ? head.liabilities.map(l => ({ ...l, amount: 'N/A (Audit Mode)' })) : head.liabilities,
        };
      });

      const grandTotalAssets = isVatAuditor ? 'N/A (Audit Mode)' : enriched.reduce((sum, h) => sum + (typeof h.totalAssets === 'number' ? h.totalAssets : 0), 0);
      const grandTotalLiabilities = isVatAuditor ? 'N/A (Audit Mode)' : enriched.reduce((sum, h) => sum + (typeof h.totalLiabilities === 'number' ? h.totalLiabilities : 0), 0);
      const grandNetValue = isVatAuditor ? 'N/A (Audit Mode)' : enriched.reduce((sum, h) => sum + (typeof h.netValue === 'number' ? h.netValue : 0), 0);

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

    const investmentHeads = await db.investmentHead.findMany({
      where,
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

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'InvestmentHeads', 'POST');
  if (!security.authorized) return security.response;
  try {
    const body = await request.json();
    const item = await db.$transaction(async (tx) => {
      const count = await tx.investmentHead.count();
      const code = `INV-${String(count + 1).padStart(5, '0')}`;

      return tx.investmentHead.create({
        data: {
          code,
          name: body.name,
          description: body.description || null,
          type: body.type || 'Investment',
          openingBalance: body.openingBalance ?? 0,
          openingType: body.openingType || '',
          isActive: body.isActive ?? true,
        },
      });
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create investment head' }, { status: 500 });
  }
}
