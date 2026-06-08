import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, validateImageFields } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// ============================================================
// GET /api/investments/[id] — Get single investment head
// Delegates to InvestmentHead model (investments = investment heads)
// ============================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'InvestmentHeads', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const item = await db.investmentHead.findUnique({
      where: { id },
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
        _count: { select: { assets: true, liabilities: true } },
      },
    });
    if (!item) {
      return NextResponse.json({ error: 'Investment not found' }, { status: 404 });
    }
    return NextResponse.json(item);
  } catch (error) {
    console.error('[Investments] GET /[id] error:', error);
    return NextResponse.json({ error: 'Failed to fetch investment' }, { status: 500 });
  }
}

// ============================================================
// PUT /api/investments/[id] — Update investment head
// Delegates to InvestmentHead model
// ============================================================

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'InvestmentHeads', 'PUT');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const body = await request.json();
    const imgError = validateImageFields(body, ['profileImage', 'nidFrontImage', 'nidBackImage']);
    if (imgError) return NextResponse.json({ error: imgError }, { status: 400 });

    const item = await db.$transaction(async (tx) => {
      const record = await tx.investmentHead.update({
        where: { id },
        data: {
          name: body.name,
          description: body.description !== undefined ? (body.description || null) : undefined,
          type: body.type,
          openingBalance: body.openingBalance !== undefined ? body.openingBalance : undefined,
          openingType: body.openingType !== undefined ? body.openingType : undefined,
          profileImage: body.profileImage !== undefined ? (body.profileImage || null) : undefined,
          nidFrontImage: body.nidFrontImage !== undefined ? (body.nidFrontImage || null) : undefined,
          nidBackImage: body.nidBackImage !== undefined ? (body.nidBackImage || null) : undefined,
          isActive: body.isActive !== undefined ? body.isActive : undefined,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
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

    await logUserActivity({
      action: 'UPDATE',
      module: 'Inv-Investment-Core',
      recordId: id,
      recordLabel: item.name || item.code || id,
      userId: security.user.id,
      userName: security.user.name,
      details: `Updated investment head ${item.code}`,
    });

    return NextResponse.json(item);
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return NextResponse.json({ error: 'Investment not found' }, { status: 404 });
    }
    console.error('[Investments] PUT /[id] error:', error);
    return NextResponse.json({ error: 'Failed to update investment' }, { status: 500 });
  }
}

// ============================================================
// DELETE /api/investments/[id] — Soft delete investment head
// Delegates to InvestmentHead model with FK check
// ============================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'InvestmentHeads', 'DELETE');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;

    const result = await db.$transaction(async (tx) => {
      const record = await tx.investmentHead.findUnique({ where: { id } });
      if (!record) throw new Error('Not found');

      // FK check: Check if investment head is referenced by active assets or liabilities
      const [activeAssets, activeLiabilities] = await Promise.all([
        tx.asset.count({ where: { investmentHeadId: id, isActive: true } }),
        tx.liability.count({ where: { investmentHeadId: id, isActive: true } }),
      ]);

      if (activeAssets > 0 || activeLiabilities > 0) {
        throw new Error(
          `Cannot delete: Investment Head is referenced by ${activeAssets} active asset(s) and ${activeLiabilities} active liabilit(y/ies)`
        );
      }

      await tx.investmentHead.update({
        where: { id },
        data: { isActive: false },
      });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'InvestmentHeads',
          recordId: record.id,
          recordLabel: record.name || record.code || record.id,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({ code: record.code, name: record.name, softDelete: true }),
        },
      });

      return record;
    });

    await logUserActivity({
      action: 'DELETE',
      module: 'Inv-Investment-Core',
      recordId: id,
      recordLabel: result.name || result.code || id,
      userId: security.user.id,
      userName: security.user.name,
      details: `Deleted investment head ${result.code}`,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.message?.startsWith('Cannot delete')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error?.message === 'Not found') {
      return NextResponse.json({ error: 'Investment not found' }, { status: 404 });
    }
    console.error('[Investments] DELETE /[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete investment' }, { status: 500 });
  }
}
