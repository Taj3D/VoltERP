import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  checkPeriodClose,
  safeFinancialRound,
  safeFinancialAdd,
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

// ============================================================
// HELPER: Find or create the appropriate Asset COA account
// ============================================================
async function findOrCreateAssetCoa(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  assetCategory: string,
  companyId: string | null
): Promise<{ id: string; code: string; name: string; currentBalance: number }> {
  const isFixedAsset = assetCategory === 'Fixed';
  const searchKeyword = isFixedAsset ? 'Fixed' : 'Current';
  const defaultAccountName = isFixedAsset ? 'Fixed Assets' : 'Current Assets';

  // Step 1: Try to find an existing COA with classification "Asset" whose name contains the keyword
  let assetCoa = await tx.chartOfAccount.findFirst({
    where: {
      classification: 'Asset',
      isActive: true,
      name: { contains: searchKeyword },
      ...(companyId ? { companyId } : {}),
    },
  });

  // Step 2: If not found by name, try to find a child of a root COA with the keyword
  if (!assetCoa) {
    const rootAsset = await tx.chartOfAccount.findFirst({
      where: {
        classification: 'Asset',
        isRoot: true,
        isActive: true,
        name: { contains: searchKeyword },
        ...(companyId ? { companyId } : {}),
      },
    });

    if (rootAsset) {
      assetCoa = await tx.chartOfAccount.findFirst({
        where: {
          classification: 'Asset',
          isActive: true,
          parentAccountId: rootAsset.id,
          ...(companyId ? { companyId } : {}),
        },
        orderBy: { createdAt: 'asc' },
      });
    }
  }

  // Step 3: If still not found, try any root Asset COA and use it directly
  if (!assetCoa) {
    assetCoa = await tx.chartOfAccount.findFirst({
      where: {
        classification: 'Asset',
        isActive: true,
        name: { contains: searchKeyword },
      },
    });
  }

  // Step 4: Create one if nothing exists
  if (!assetCoa) {
    // Generate a unique code
    const lastCoa = await tx.chartOfAccount.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { code: true },
    });
    let nextCoaNum = 1;
    if (lastCoa?.code) {
      const match = lastCoa.code.match(/COA-(\d+)/);
      if (match) nextCoaNum = parseInt(match[1], 10) + 1;
    }
    const coaCode = `COA-${String(nextCoaNum).padStart(5, '0')}`;

    assetCoa = await tx.chartOfAccount.create({
      data: {
        code: coaCode,
        name: defaultAccountName,
        classification: 'Asset',
        openingBalance: 0,
        openingBalanceType: 'Dr',
        currentBalance: 0,
        isRoot: false,
        isActive: true,
        ...(companyId ? { companyId } : {}),
      },
    });
  }

  return {
    id: assetCoa.id,
    code: assetCoa.code,
    name: assetCoa.name,
    currentBalance: assetCoa.currentBalance,
  };
}

// ============================================================
// HELPER: Find or create the Equity COA account
// ============================================================
async function findOrCreateEquityCoa(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  companyId: string | null
): Promise<{ id: string; code: string; name: string; currentBalance: number }> {
  // Step 1: Find existing Equity COA
  let equityCoa = await tx.chartOfAccount.findFirst({
    where: {
      classification: 'Equity',
      isActive: true,
      ...(companyId ? { companyId } : {}),
    },
  });

  // Step 2: If not found with company filter, try without (global equity account)
  if (!equityCoa && companyId) {
    equityCoa = await tx.chartOfAccount.findFirst({
      where: {
        classification: 'Equity',
        isActive: true,
        companyId: null,
      },
    });
  }

  // Step 3: Create one if nothing exists
  if (!equityCoa) {
    const lastCoa = await tx.chartOfAccount.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { code: true },
    });
    let nextCoaNum = 1;
    if (lastCoa?.code) {
      const match = lastCoa.code.match(/COA-(\d+)/);
      if (match) nextCoaNum = parseInt(match[1], 10) + 1;
    }
    const coaCode = `COA-${String(nextCoaNum).padStart(5, '0')}`;

    equityCoa = await tx.chartOfAccount.create({
      data: {
        code: coaCode,
        name: 'Owner Equity',
        classification: 'Equity',
        openingBalance: 0,
        openingBalanceType: 'Cr',
        currentBalance: 0,
        isRoot: false,
        isActive: true,
        ...(companyId ? { companyId } : {}),
      },
    });
  }

  return {
    id: equityCoa.id,
    code: equityCoa.code,
    name: equityCoa.name,
    currentBalance: equityCoa.currentBalance,
  };
}

/**
 * Helper: Create a single asset with full validation + double-entry ledger posting
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

  // ── Step 1: Insert the Asset record ──
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

  // ── Step 2: Find the appropriate Chart of Accounts nodes ──
  const assetCoa = await findOrCreateAssetCoa(tx, assetCategory, companyId);
  const equityCoa = await findOrCreateEquityCoa(tx, companyId);

  // ── Step 3: Generate LedgerEntry codes ──
  const lastLedger = await tx.ledgerEntry.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { entryCode: true },
  });
  let nextLedgerNum = 1;
  if (lastLedger?.entryCode) {
    const match = lastLedger.entryCode.match(/LED-(\d+)/);
    if (match) nextLedgerNum = parseInt(match[1], 10) + 1;
  }
  const ledgerCode1 = `LED-${String(nextLedgerNum).padStart(5, '0')}`;
  const ledgerCode2 = `LED-${String(nextLedgerNum + 1).padStart(5, '0')}`;

  const roundedAmount = safeFinancialRound(amount);
  const assetDate = record.date;
  const headName = record.investmentHead?.name || record.id;
  const sourceRef = idempotencyKey || record.id;

  // ── Step 4: Create two LedgerEntry records (debit/credit pair) ──

  // DEBIT the Asset COA account (increase asset)
  const debitEntry = await tx.ledgerEntry.create({
    data: {
      entryCode: ledgerCode1,
      date: assetDate,
      accountId: assetCoa.id,
      account: assetCoa.name,
      particulars: `Asset capital allocation: ${headName}`,
      debit: roundedAmount,
      credit: 0,
      reference: sourceRef,
      referenceType: 'Asset',
      ...(companyId ? { companyId } : {}),
      isActive: true,
    },
  });

  // CREDIT the Equity COA account (increase equity/capital)
  const creditEntry = await tx.ledgerEntry.create({
    data: {
      entryCode: ledgerCode2,
      date: assetDate,
      accountId: equityCoa.id,
      account: equityCoa.name,
      particulars: `Asset capital source: ${headName}`,
      debit: 0,
      credit: roundedAmount,
      reference: sourceRef,
      referenceType: 'Asset',
      ...(companyId ? { companyId } : {}),
      isActive: true,
    },
  });

  // ── Step 5: Update both COA accounts' currentBalance ──
  // Asset COA: debit nature account, increase on debit
  const newAssetBalance = safeFinancialAdd(assetCoa.currentBalance, roundedAmount);
  await tx.chartOfAccount.update({
    where: { id: assetCoa.id },
    data: { currentBalance: newAssetBalance },
  });

  // Equity COA: credit nature account, increase on credit
  const newEquityBalance = safeFinancialAdd(equityCoa.currentBalance, roundedAmount);
  await tx.chartOfAccount.update({
    where: { id: equityCoa.id },
    data: { currentBalance: newEquityBalance },
  });

  // ── Step 6: Create a LedgerAutoPost tracking record ──
  const lastLap = await tx.ledgerAutoPost.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { code: true },
  });
  let nextLapNum = 1;
  if (lastLap?.code) {
    const match = lastLap.code.match(/LAP-(\d+)/);
    if (match) nextLapNum = parseInt(match[1], 10) + 1;
  }
  const lapCode = `LAP-${String(nextLapNum).padStart(5, '0')}`;

  await tx.ledgerAutoPost.create({
    data: {
      code: lapCode,
      sourceType: 'Asset',
      sourceId: record.id,
      sourceCode: sourceRef,
      debitEntryId: debitEntry.id,
      creditEntryId: creditEntry.id,
      debitAccount: assetCoa.code,
      creditAccount: equityCoa.code,
      amount: roundedAmount,
      postingDate: assetDate,
      status: 'Posted',
      ...(companyId ? { companyId } : {}),
    },
  });

  return record;
}
