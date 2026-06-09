import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, validateImageFields } from '@/lib/api-security';

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'InvestmentHeads', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { searchParams } = new URL(request.url);
    const includeDetails = searchParams.get('includeDetails') === 'true';
    const headType = searchParams.get('headType');

    const where: any = { isActive: true };
    if (headType) where.type = headType;
    // Multi-tenant filtering: if authenticated user has a companyId, filter by it
    if (security.user.companyId) where.companyId = security.user.companyId;

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
        // Balance formula: opening balance + additions (assets) - withdrawals (liabilities)
        const netValue = head.openingBalance + totalAssets - totalLiabilities;

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
      const grandOpeningBalances = isVatAuditor ? 'N/A (Audit Mode)' : investmentHeads.reduce((sum, h) => sum + h.openingBalance, 0);
      const grandNetValue = isVatAuditor ? 'N/A (Audit Mode)' : (typeof grandOpeningBalances === 'number' ? grandOpeningBalances : 0) + (typeof grandTotalAssets === 'number' ? grandTotalAssets : 0) - (typeof grandTotalLiabilities === 'number' ? grandTotalLiabilities : 0);

      return NextResponse.json({
        investmentHeads: enriched,
        summary: {
          totalHeads: enriched.length,
          grandOpeningBalances,
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
    const imgError = validateImageFields(body, ['profileImage', 'nidFrontImage', 'nidBackImage']);
    if (imgError) return NextResponse.json({ error: imgError }, { status: 400 });
    const item = await db.$transaction(async (tx) => {
      // Auto-generate code (collision-safe: findMany + Math.max)
      const allRecords = await tx.investmentHead.findMany({ select: { code: true } });
      let maxNum = 0;
      for (const r of allRecords) {
        const match = r.code?.match(/INV-(\d+)/);
        if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
      }
      const code = `INV-${String(maxNum + 1).padStart(5, '0')}`;

      const record = await tx.investmentHead.create({
        data: {
          code,
          name: body.name,
          description: body.description || null,
          type: body.type || 'Investment',
          openingBalance: body.openingBalance ?? 0,
          openingType: body.openingType || '',
          profileImage: body.profileImage || null,
          nidFrontImage: body.nidFrontImage || null,
          nidBackImage: body.nidBackImage || null,
          companyId: body.companyId || security.user.companyId || null,
          isActive: body.isActive ?? true,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'InvestmentHeads',
          recordId: record.id,
          recordLabel: record.name || record.code || record.id,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({ code: record.code, name: record.name, type: record.type }),
        },
      });

      return record;
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create investment head' }, { status: 500 });
  }
}
