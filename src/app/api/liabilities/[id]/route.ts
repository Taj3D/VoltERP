import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  checkPeriodClose,
  checkFinancialDeletePermission,
  safeFinancialRound,
  maskForVatAuditorFinancial,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

const AUDIT_MODULE = 'Inv-Asset-Ledger';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Liabilities', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const companyId = security.user.companyId;

    const item = await db.liability.findUnique({
      where: { id },
      include: { investmentHead: true },
    });

    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Cross-tenant validation
    if (companyId && item.companyId && item.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const masked = maskForVatAuditorFinancial(
      item as unknown as Record<string, unknown>,
      security.user.role
    );

    return NextResponse.json(masked);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Liabilities', 'PUT');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const companyId = security.user.companyId;
    const body = await request.json();

    // Period close check
    if (body.date) {
      const periodLock = await checkPeriodClose(body.date);
      if (periodLock) return periodLock;
    }

    const item = await db.$transaction(async (tx) => {
      // Cross-tenant validation
      const existing = await tx.liability.findUnique({ where: { id } });
      if (!existing) throw new Error('Not found');
      if (companyId && existing.companyId && existing.companyId !== companyId) {
        throw new Error('Cross-tenant access denied');
      }

      // Check Investment Head isActive if changing head
      if (body.investmentHeadId && body.investmentHeadId !== existing.investmentHeadId) {
        const head = await tx.investmentHead.findUnique({ where: { id: body.investmentHeadId } });
        if (!head || !head.isActive) {
          throw new Error('Action Blocked: Chosen Investment Head is inactive or archived.');
        }
      }

      // Amount must be > 0 if provided
      if (body.amount !== undefined && Number(body.amount) <= 0) {
        throw new Error('Amount must be > 0');
      }

      const record = await tx.liability.update({
        where: { id },
        data: {
          investmentHeadId: body.investmentHeadId || undefined,
          date: body.date ? new Date(body.date as string) : undefined,
          amount: body.amount !== undefined ? safeFinancialRound(Number(body.amount)) : undefined,
          type: body.type || undefined,
          paymentMethod: body.paymentMethod !== undefined ? body.paymentMethod : undefined,
          description: body.description !== undefined ? (body.description || null) : undefined,
          isActive: body.isActive !== undefined ? body.isActive : undefined,
        },
        include: { investmentHead: true },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: AUDIT_MODULE,
          recordId: record.id,
          recordLabel: `${record.investmentHead?.name || record.id} - ৳${record.amount}`,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            investmentHeadId: record.investmentHeadId,
            amount: record.amount,
            type: record.type,
          }),
        },
      });

      return record;
    });

    await logUserActivity({
      action: 'UPDATE',
      module: AUDIT_MODULE,
      recordId: item.id,
      recordLabel: `${item.investmentHead?.name || item.id} - ৳${item.amount}`,
      userId: security.user.id,
      userName: security.user.name,
      details: `Updated liability: ${item.investmentHead?.name || item.id} - ৳${item.amount}`,
    });

    return NextResponse.json(item);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Not found') return NextResponse.json({ error: 'Not found' }, { status: 404 });
      if (error.message === 'Cross-tenant access denied') return NextResponse.json({ error: 'Not found' }, { status: 404 });
      if (error.message.startsWith('Action Blocked:') || error.message.includes('must be')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Liabilities', 'DELETE');
  if (!security.authorized) return security.response;

  // Admin-only delete
  const deleteCheck = checkFinancialDeletePermission(security.user.role);
  if (deleteCheck) return deleteCheck;

  try {
    const { id } = await params;
    const companyId = security.user.companyId;

    await db.$transaction(async (tx) => {
      const record = await tx.liability.findUnique({
        where: { id },
        include: { investmentHead: true },
      });
      if (!record) throw new Error('Not found');

      // Cross-tenant validation
      if (companyId && record.companyId && record.companyId !== companyId) {
        throw new Error('Cross-tenant access denied');
      }

      await tx.liability.update({
        where: { id },
        data: { isActive: false },
      });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: AUDIT_MODULE,
          recordId: record.id,
          recordLabel: `${record.investmentHead?.name || record.id} - ৳${record.amount}`,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            investmentHeadId: record.investmentHeadId,
            amount: record.amount,
            softDelete: true,
          }),
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
      details: `Soft-deleted liability: ${id}`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Not found') return NextResponse.json({ error: 'Not found' }, { status: 404 });
      if (error.message === 'Cross-tenant access denied') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
