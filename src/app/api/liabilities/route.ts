import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  checkPeriodClose,
  safeFinancialRound,
  maskFinancialArray,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

const AUDIT_MODULE = 'Inv-Asset-Ledger';

const LIABILITY_MASKED_FIELDS = ['amount'];

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Liabilities', 'GET');
  if (!security.authorized) return security.response;

  try {
    const companyId = security.user.companyId;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const headId = searchParams.get('headId');

    const where: Record<string, unknown> = {
      isActive: true,
      ...(companyId ? { companyId } : {}),
    };
    if (type) where.type = type;
    if (headId) where.investmentHeadId = headId;

    const items = await db.liability.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { investmentHead: true },
    });

    // VAT Auditor masking
    const masked = maskFinancialArray(
      items as unknown as Record<string, unknown>[],
      security.user.role,
      LIABILITY_MASKED_FIELDS
    );

    return NextResponse.json(masked);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch liabilities' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Liabilities', 'POST');
  if (!security.authorized) return security.response;

  try {
    const body = await request.json();
    const companyId = security.user.companyId;

    // ── Batch mode support ──
    if (body.batchMode && Array.isArray(body.data)) {
      const results = await db.$transaction(async (tx) => {
        const created: unknown[] = [];
        for (const item of body.data) {
          const record = await createSingleLiability(tx, item, companyId, security);
          created.push(record);
        }

        await tx.auditLog.create({
          data: {
            action: 'CREATE',
            module: AUDIT_MODULE,
            recordId: 'BATCH',
            recordLabel: `Batch: ${created.length} liabilities`,
            userId: security.user.id,
            userName: security.user.name,
            details: JSON.stringify({ count: created.length, batchMode: true }),
          },
        });

        return created;
      });

      await logUserActivity({
        action: 'CREATE',
        module: AUDIT_MODULE,
        recordId: 'BATCH',
        recordLabel: `Batch: ${results.length} liabilities`,
        userId: security.user.id,
        userName: security.user.name,
        details: `Created ${results.length} liabilities in batch`,
      });

      return NextResponse.json(results, { status: 201 });
    }

    // ── Single mode ──
    // Period close check
    if (body.date) {
      const periodLock = await checkPeriodClose(body.date);
      if (periodLock) return periodLock;
    }

    const item = await db.$transaction(async (tx) => {
      const record = await createSingleLiability(tx, body, companyId, security);

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: AUDIT_MODULE,
          recordId: record.id,
          recordLabel: `${record.investmentHead?.name || record.id} - ৳${record.amount}`,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            investmentHeadId: record.investmentHeadId,
            amount: record.amount,
            type: record.type,
            paymentMethod: record.paymentMethod,
          }),
        },
      });

      return record;
    });

    await logUserActivity({
      action: 'CREATE',
      module: AUDIT_MODULE,
      recordId: item.id,
      recordLabel: `${item.investmentHead?.name || item.id} - ৳${item.amount}`,
      userId: security.user.id,
      userName: security.user.name,
      details: `Created liability: ${item.investmentHead?.name || item.id} - ৳${item.amount}`,
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.startsWith('Action Blocked:') || error.message.includes('must be')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    return NextResponse.json({ error: 'Failed to create liability' }, { status: 500 });
  }
}

/**
 * Helper: Create a single liability with full validation
 */
async function createSingleLiability(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  body: Record<string, unknown>,
  companyId: string | null,
  security: { user: { id: string; name: string; role: string } }
) {
  const investmentHeadId = body.investmentHeadId as string;
  if (!investmentHeadId) throw new Error('investmentHeadId is required');

  // Check Investment Head isActive
  const head = await tx.investmentHead.findUnique({ where: { id: investmentHeadId } });
  if (!head || !head.isActive) {
    throw new Error('Action Blocked: Chosen Investment Head is inactive or archived.');
  }

  // Amount must be > 0
  const amount = Number(body.amount);
  if (!amount || amount <= 0) {
    throw new Error('Amount must be > 0');
  }

  const record = await tx.liability.create({
    data: {
      investmentHeadId,
      date: body.date ? new Date(body.date as string) : new Date(),
      amount: safeFinancialRound(amount),
      type: (body.type as string) || 'received',
      paymentMethod: (body.paymentMethod as string) || null,
      description: (body.description as string) || null,
      ...(companyId && { companyId }),
      isActive: body.isActive !== undefined ? Boolean(body.isActive) : true,
    },
    include: { investmentHead: true },
  });

  return record;
}
