import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, validateImageFields } from '@/lib/api-security';

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'InvestmentHeads', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';
    const type = searchParams.get('type');

    const where: Record<string, unknown> = {};
    if (!includeInactive) where.isActive = true;
    if (type) where.type = type;
    // Multi-tenant filtering: if authenticated user has a companyId, filter by it
    if (security.user.companyId) where.companyId = security.user.companyId;

    const items = await db.investmentHead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { assets: { where: { isActive: true } }, liabilities: { where: { isActive: true } } } },
      },
    });
    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch investment heads' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'InvestmentHeads', 'POST');
  if (!security.authorized) return security.response;
  try {
    const body = await request.json();
    if (!body.name || !body.name.trim()) {
      return NextResponse.json({ error: "Investment head name is required" }, { status: 400 });
    }
    const imgError = validateImageFields(body, ['profileImage', 'nidFrontImage', 'nidBackImage']);
    if (imgError) return NextResponse.json({ error: imgError }, { status: 400 });
    const item = await db.$transaction(async (tx) => {
      // Auto-generate code (collision-safe: findMany + Math.max)
      const allRecords = await tx.investmentHead.findMany({ select: { code: true } });
      let maxNum = 0;
      for (const r of allRecords) {
        const match = r.code?.match(/INVH-(\d+)/);
        if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
      }
      const code = `INVH-${String(maxNum + 1).padStart(5, '0')}`;

      const record = await tx.investmentHead.create({
        data: {
          code,
          name: body.name,
          description: body.description || null,
          type: body.type || 'Liability',
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
