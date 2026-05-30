import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  checkPeriodClose,
  safeFinancialRound,
  safeFinancialSubtract,
  maskForVatAuditor,
  maskFinancialArray,
  maskForVatAuditorFinancial,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

const AUDIT_MODULE = 'Inv-Asset-Ledger';

const INVESTMENT_ASSET_MASKED_FIELDS = [
  'amount',
  'purchaseValue',
  'salvageValue',
  'depreciationRate',
  'accumulatedDepreciation',
  'netBookValue',
];

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Assets', 'GET');
  if (!security.authorized) return security.response;

  try {
    const companyId = security.user.companyId;
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const headType = searchParams.get('headType');

    const where: Record<string, unknown> = {
      isActive: true,
      ...(companyId ? { companyId } : {}),
    };
    if (category) where.assetCategory = category;
    if (headType) where.investmentHead = { type: headType };

    const items = await db.asset.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        investmentHead: true,
        depreciationSchedules: {
          where: { isActive: true },
          orderBy: { periodDate: 'desc' },
        },
      },
    });

    // VAT Auditor masking
    const masked = maskFinancialArray(
      items as unknown as Record<string, unknown>[],
      security.user.role,
      INVESTMENT_ASSET_MASKED_FIELDS
    );

    return NextResponse.json(masked);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch assets' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Assets', 'POST');
  if (!security.authorized) return security.response;

  try {
    const body = await request.json();
    const companyId = security.user.companyId;

    // ── Batch mode support ──
    if (body.batchMode && Array.isArray(body.data)) {
      const results = await db.$transaction(async (tx) => {
        const created: unknown[] = [];
        for (const item of body.data) {
          const record = await createSingleAsset(tx, item, companyId, security);
          created.push(record);
        }

        await tx.auditLog.create({
          data: {
            action: 'CREATE',
            module: AUDIT_MODULE,
            recordId: 'BATCH',
            recordLabel: `Batch: ${created.length} assets`,
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
        recordLabel: `Batch: ${results.length} assets`,
        userId: security.user.id,
        userName: security.user.name,
        details: `Created ${results.length} assets in batch`,
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
      const record = await createSingleAsset(tx, body, companyId, security);

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
            category: record.assetCategory,
            date: record.date,
            purchaseValue: record.purchaseValue,
            netBookValue: record.netBookValue,
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
      details: `Created asset: ${item.investmentHead?.name || item.id} - ৳${item.amount}`,
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.startsWith('Action Blocked:') || error.message.includes('must be') || error.message.includes('Idempotency')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    return NextResponse.json({ error: 'Failed to create asset', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

/**
 * Helper: Create a single asset with full validation
 */
async function createSingleAsset(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  body: Record<string, unknown>,
  companyId: string | null,
  security: { user: { id: string; name: string; role: string } }
) {
  const investmentHeadId = body.investmentHeadId as string;
  if (!investmentHeadId) throw new Error('investmentHeadId is required');

  // Check Investment Head exists AND isActive
  const head = await tx.investmentHead.findUnique({ where: { id: investmentHeadId } });
  if (!head || !head.isActive) {
    throw new Error('Action Blocked: Chosen Investment Head is inactive or archived.');
  }

  // Amount must be > 0
  const amount = Number(body.amount);
  if (!amount || amount <= 0) {
    throw new Error('Amount must be > 0');
  }

  const assetCategory = (body.assetCategory as string) || 'Fixed';
  const isFixedAsset = assetCategory === 'Fixed';

  let purchaseValue = 0;
  let salvageValue = 0;
  let usefulLifeMonths = 0;
  let depreciationRate = 0;
  let netBookValue = 0;
  let accumulatedDepreciation = 0;
  let monthlyDepreciation = 0;

  if (isFixedAsset) {
    purchaseValue = Number(body.purchaseValue);
    salvageValue = Number(body.salvageValue ?? 0);
    usefulLifeMonths = Number(body.usefulLifeMonths ?? 0);
    depreciationRate = Number(body.depreciationRate ?? 0);

    // Validate Fixed Asset mandatory fields
    if (!purchaseValue || purchaseValue <= 0) {
      throw new Error('purchaseValue must be > 0 for Fixed Assets');
    }
    if (salvageValue < 0) {
      throw new Error('salvageValue must be >= 0 for Fixed Assets');
    }
    if (salvageValue >= purchaseValue) {
      throw new Error('salvageValue must be < purchaseValue for Fixed Assets');
    }
    if (!usefulLifeMonths || usefulLifeMonths <= 0) {
      throw new Error('usefulLifeMonths must be > 0 for Fixed Assets');
    }
    if (depreciationRate < 0) {
      throw new Error('depreciationRate must be >= 0 for Fixed Assets');
    }

    purchaseValue = safeFinancialRound(purchaseValue);
    salvageValue = safeFinancialRound(salvageValue);
    depreciationRate = safeFinancialRound(depreciationRate);

    // Auto-calculate: netBookValue = purchaseValue (initial), accumulatedDepreciation = 0
    netBookValue = purchaseValue;
    accumulatedDepreciation = 0;

    // Monthly depreciation = (purchaseValue - salvageValue) / usefulLifeMonths
    monthlyDepreciation = safeFinancialRound(safeFinancialSubtract(purchaseValue, salvageValue) / usefulLifeMonths);
  } else {
    // Current Asset: bypass depreciation, use amount directly
    purchaseValue = safeFinancialRound(amount);
    netBookValue = safeFinancialRound(amount);
    accumulatedDepreciation = 0;
  }

  // Idempotency guard
  const idempotencyKey = body.idempotencyKey as string | undefined;
  if (idempotencyKey) {
    const existing = await tx.asset.findUnique({ where: { idempotencyKey } });
    if (existing) {
      throw new Error(`Idempotency: Duplicate asset creation blocked. Existing asset ID: ${existing.id}`);
    }
  }

  const record = await tx.asset.create({
    data: {
      investmentHeadId,
      date: body.date ? new Date(body.date as string) : new Date(),
      amount: safeFinancialRound(amount),
      assetCategory,
      purchaseValue,
      salvageValue,
      usefulLifeMonths,
      depreciationRate,
      accumulatedDepreciation,
      netBookValue,
      idempotencyKey: idempotencyKey || null,
      description: (body.description as string) || null,
      ...(companyId && { companyId }),
      isActive: body.isActive !== undefined ? Boolean(body.isActive) : true,
    },
    include: { investmentHead: true },
  });

  // Auto-post to Chart of Accounts (Equity node)
  if (isFixedAsset) {
    const equityAccount = await tx.chartOfAccount.findFirst({
      where: {
        classification: 'Equity',
        isActive: true,
        ...(companyId ? { companyId } : {}),
      },
    });

    if (equityAccount) {
      await tx.ledgerEntry.create({
        data: {
          accountCode: equityAccount.code,
          accountId: equityAccount.id,
          date: record.date,
          debit: 0,
          credit: safeFinancialRound(amount),
          description: `Asset capital allocation: ${record.investmentHead?.name || record.id}`,
          referenceType: 'Asset',
          referenceId: record.id,
          companyId: companyId || null,
        },
      });
    }
  }

  return record;
}
