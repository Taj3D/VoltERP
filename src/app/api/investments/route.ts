import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, validateImageFields } from '@/lib/api-security';

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'InvestmentHeads', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { searchParams } = new URL(request.url);
    const transactionType = searchParams.get('type'); // 'asset' | 'liability' | null (all)
    const investmentHeadId = searchParams.get('investmentHeadId');
    const assetCategory = searchParams.get('assetCategory');
    const liabilityType = searchParams.get('liabilityType');
    const liabilityFlowType = searchParams.get('flowType'); // 'received' | 'pay'

    // Multi-tenant filter
    const companyFilter: any = {};
    if (security.user.companyId) companyFilter.companyId = security.user.companyId;

    // Specific investment head filter
    const headFilter: any = {};
    if (investmentHeadId) headFilter.investmentHeadId = investmentHeadId;

    const isVatAuditor = security.user.role === 'vat_auditor';

    const transactions: any[] = [];

    // Fetch Assets unless filtered to liabilities only
    if (!transactionType || transactionType === 'asset') {
      const assetWhere: any = { isActive: true, ...companyFilter, ...headFilter };
      if (assetCategory) assetWhere.assetCategory = assetCategory;

      const assets = await db.asset.findMany({
        where: assetWhere,
        include: {
          investmentHead: {
            select: { id: true, name: true, code: true },
          },
        },
        orderBy: { date: 'desc' },
      });

      for (const asset of assets) {
        transactions.push({
          id: asset.id,
          transactionType: 'asset',
          date: asset.date,
          amount: isVatAuditor ? 'N/A (Audit Mode)' : asset.amount,
          assetCategory: asset.assetCategory,
          description: asset.description,
          investmentHeadId: asset.investmentHeadId,
          investmentHeadName: asset.investmentHead?.name,
          investmentHeadCode: asset.investmentHead?.code,
          companyId: asset.companyId,
          createdAt: asset.createdAt,
        });
      }
    }

    // Fetch Liabilities unless filtered to assets only
    if (!transactionType || transactionType === 'liability') {
      const liabilityWhere: any = { isActive: true, ...companyFilter, ...headFilter };
      if (liabilityType) liabilityWhere.liabilityType = liabilityType;
      if (liabilityFlowType) liabilityWhere.type = liabilityFlowType;

      const liabilities = await db.liability.findMany({
        where: liabilityWhere,
        include: {
          investmentHead: {
            select: { id: true, name: true, code: true },
          },
        },
        orderBy: { date: 'desc' },
      });

      for (const liability of liabilities) {
        transactions.push({
          id: liability.id,
          transactionType: 'liability',
          date: liability.date,
          amount: isVatAuditor ? 'N/A (Audit Mode)' : liability.amount,
          type: liability.type, // 'received' or 'pay'
          liabilityType: liability.liabilityType, // 'SHORT_TERM' or 'LONG_TERM'
          description: liability.description,
          investmentHeadId: liability.investmentHeadId,
          investmentHeadName: liability.investmentHead?.name,
          investmentHeadCode: liability.investmentHead?.code,
          companyId: liability.companyId,
          createdAt: liability.createdAt,
        });
      }
    }

    // Sort combined results by date descending
    transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Summary
    const assetCount = transactions.filter((t) => t.transactionType === 'asset').length;
    const liabilityCount = transactions.filter((t) => t.transactionType === 'liability').length;
    const totalAssetAmount = isVatAuditor
      ? 'N/A (Audit Mode)'
      : transactions
          .filter((t) => t.transactionType === 'asset')
          .reduce((sum, t) => sum + (typeof t.amount === 'number' ? t.amount : 0), 0);
    const totalLiabilityAmount = isVatAuditor
      ? 'N/A (Audit Mode)'
      : transactions
          .filter((t) => t.transactionType === 'liability')
          .reduce((sum, t) => sum + (typeof t.amount === 'number' ? t.amount : 0), 0);

    return NextResponse.json({
      investments: transactions,
      summary: {
        totalTransactions: transactions.length,
        assetCount,
        liabilityCount,
        totalAssetAmount,
        totalLiabilityAmount,
      },
    });
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
