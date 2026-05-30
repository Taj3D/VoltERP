import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  validateImageFields,
  checkFinancialDeletePermission,
  safeFinancialRound,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

const AUDIT_MODULE = 'Inv-Asset-Ledger';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'InvestmentHeads', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const companyId = security.user.companyId;

    const item = await db.investmentHead.findUnique({
      where: { id },
      include: {
        _count: { select: { assets: true, liabilities: true } },
      },
    });

    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Cross-tenant validation
    if (companyId && item.companyId && item.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'InvestmentHeads', 'PUT');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const companyId = security.user.companyId;
    const body = await request.json();

    // Validate financial fields
    if (body.openingBalance !== undefined && body.openingBalance !== null && Number(body.openingBalance) < 0) {
      return NextResponse.json({ error: 'openingBalance must be >= 0' }, { status: 400 });
    }
    if (body.sharePercentage !== undefined && body.sharePercentage !== null) {
      const sp = Number(body.sharePercentage);
      if (sp <= 0 || sp > 100) {
        return NextResponse.json({ error: 'sharePercentage must be > 0 and <= 100' }, { status: 400 });
      }
    }
    if (body.capitalValue !== undefined && body.capitalValue !== null) {
      const cv = Number(body.capitalValue);
      if (cv <= 0) {
        return NextResponse.json({ error: 'capitalValue must be > 0' }, { status: 400 });
      }
    }

    const imgError = validateImageFields(body, ['profileImage', 'nidFrontImage', 'nidBackImage']);
    if (imgError) return NextResponse.json({ error: imgError }, { status: 400 });

    const item = await db.$transaction(async (tx) => {
      // Cross-tenant validation
      const existing = await tx.investmentHead.findUnique({ where: { id } });
      if (!existing) throw new Error('Not found');
      if (companyId && existing.companyId && existing.companyId !== companyId) {
        throw new Error('Cross-tenant access denied');
      }

      const record = await tx.investmentHead.update({
        where: { id },
        data: {
          name: body.name,
          description: body.description !== undefined ? (body.description || null) : undefined,
          type: body.type,
          openingBalance: body.openingBalance !== undefined ? safeFinancialRound(Number(body.openingBalance)) : undefined,
          openingType: body.openingType !== undefined ? body.openingType : undefined,
          sharePercentage: body.sharePercentage !== undefined && body.sharePercentage !== null
            ? safeFinancialRound(Number(body.sharePercentage))
            : body.sharePercentage === null ? null : undefined,
          capitalValue: body.capitalValue !== undefined && body.capitalValue !== null
            ? safeFinancialRound(Number(body.capitalValue))
            : body.capitalValue === null ? null : undefined,
          profileImage: body.profileImage !== undefined ? (body.profileImage || null) : undefined,
          nidFrontImage: body.nidFrontImage !== undefined ? (body.nidFrontImage || null) : undefined,
          nidBackImage: body.nidBackImage !== undefined ? (body.nidBackImage || null) : undefined,
          isActive: body.isActive !== undefined ? body.isActive : undefined,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: AUDIT_MODULE,
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
      module: AUDIT_MODULE,
      recordId: item.id,
      recordLabel: item.name || item.code || item.id,
      userId: security.user.id,
      userName: security.user.name,
      details: `Updated investment head: ${item.name || item.code}`,
    });

    return NextResponse.json(item);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Not found') return NextResponse.json({ error: 'Not found' }, { status: 404 });
      if (error.message === 'Cross-tenant access denied') return NextResponse.json({ error: 'Not found' }, { status: 404 });
      if (error.message.includes('must be')) return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'InvestmentHeads', 'DELETE');
  if (!security.authorized) return security.response;

  // Admin-only delete
  const deleteCheck = checkFinancialDeletePermission(security.user.role);
  if (deleteCheck) return deleteCheck;

  try {
    const { id } = await params;
    const companyId = security.user.companyId;

    await db.$transaction(async (tx) => {
      const record = await tx.investmentHead.findUnique({ where: { id } });
      if (!record) throw new Error('Not found');

      // Cross-tenant validation
      if (companyId && record.companyId && record.companyId !== companyId) {
        throw new Error('Cross-tenant access denied');
      }

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
          module: AUDIT_MODULE,
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
      module: AUDIT_MODULE,
      recordId: id,
      recordLabel: id,
      userId: security.user.id,
      userName: security.user.name,
      details: `Soft-deleted investment head: ${id}`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Not found') return NextResponse.json({ error: 'Not found' }, { status: 404 });
      if (error.message === 'Cross-tenant access denied') return NextResponse.json({ error: 'Not found' }, { status: 404 });
      if (error.message.startsWith('Cannot delete')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
