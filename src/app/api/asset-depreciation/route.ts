import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  safeFinancialRound,
  safeFinancialSubtract,
  safeFinancialAdd,
  maskFinancialArray,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

const AUDIT_MODULE = 'Inv-Asset-Ledger';

const DEPRECIATION_MASKED_FIELDS = [
  'depreciationAmount',
  'accumulatedDepreciation',
  'netBookValue',
];

// ============================================================
// HELPER: Find or create Depreciation Expense COA account
// ============================================================
async function findOrCreateDepreciationExpenseCoa(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  companyId: string | null
): Promise<{ id: string; code: string; name: string; currentBalance: number }> {
  // Step 1: Try to find an existing Depreciation Expense COA
  let depCoa = await tx.chartOfAccount.findFirst({
    where: {
      classification: 'Expense',
      isActive: true,
      name: { contains: 'Depreciation' },
      ...(companyId ? { companyId } : {}),
    },
  });

  // Step 2: Try any Expense COA
  if (!depCoa) {
    depCoa = await tx.chartOfAccount.findFirst({
      where: {
        classification: 'Expense',
        isActive: true,
        ...(companyId ? { companyId } : {}),
      },
    });
  }

  // Step 3: Try without company filter
  if (!depCoa && companyId) {
    depCoa = await tx.chartOfAccount.findFirst({
      where: {
        classification: 'Expense',
        isActive: true,
        companyId: null,
        name: { contains: 'Depreciation' },
      },
    });
  }

  // Step 4: Create one if nothing exists
  if (!depCoa) {
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

    depCoa = await tx.chartOfAccount.create({
      data: {
        code: coaCode,
        name: 'Depreciation Expense',
        classification: 'Expense',
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
    id: depCoa.id,
    code: depCoa.code,
    name: depCoa.name,
    currentBalance: depCoa.currentBalance,
  };
}

// ============================================================
// HELPER: Find or create Accumulated Depreciation COA account
// (Contra-asset account under Asset classification)
// ============================================================
async function findOrCreateAccumDepCoa(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  companyId: string | null
): Promise<{ id: string; code: string; name: string; currentBalance: number }> {
  // Step 1: Try to find an existing Accumulated Depreciation COA
  let accDepCoa = await tx.chartOfAccount.findFirst({
    where: {
      classification: 'Asset',
      isActive: true,
      name: { contains: 'Accumulated Depreciation' },
      ...(companyId ? { companyId } : {}),
    },
  });

  // Step 2: Try with just "Accum" keyword
  if (!accDepCoa) {
    accDepCoa = await tx.chartOfAccount.findFirst({
      where: {
        classification: 'Asset',
        isActive: true,
        name: { contains: 'Accum' },
        ...(companyId ? { companyId } : {}),
      },
    });
  }

  // Step 3: Try without company filter
  if (!accDepCoa && companyId) {
    accDepCoa = await tx.chartOfAccount.findFirst({
      where: {
        classification: 'Asset',
        isActive: true,
        name: { contains: 'Accumulated Depreciation' },
        companyId: null,
      },
    });
  }

  // Step 4: Create one if nothing exists
  if (!accDepCoa) {
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

    accDepCoa = await tx.chartOfAccount.create({
      data: {
        code: coaCode,
        name: 'Accumulated Depreciation',
        classification: 'Asset',
        openingBalance: 0,
        openingBalanceType: 'Cr', // Contra-asset: credit nature
        currentBalance: 0,
        isRoot: false,
        isActive: true,
        ...(companyId ? { companyId } : {}),
      },
    });
  }

  return {
    id: accDepCoa.id,
    code: accDepCoa.code,
    name: accDepCoa.name,
    currentBalance: accDepCoa.currentBalance,
  };
}

// ============================================================
// HELPER: Post double-entry ledger for depreciation
// DEBIT Depreciation Expense (expense increase)
// CREDIT Accumulated Depreciation (contra-asset increase)
// ============================================================
async function postDepreciationLedger(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  scheduleId: string,
  assetName: string,
  depreciationAmount: number,
  periodDate: Date,
  companyId: string | null
): Promise<void> {
  if (depreciationAmount <= 0) return;

  const safeAmount = safeFinancialRound(depreciationAmount);

  // Resolve COA accounts
  const depExpenseCoa = await findOrCreateDepreciationExpenseCoa(tx, companyId);
  const accumDepCoa = await findOrCreateAccumDepCoa(tx, companyId);

  // Generate sequential LED-XXXXX codes
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

  const particulars = `Asset depreciation: ${assetName} - Period ${periodDate.toISOString().slice(0, 7)}`;

  // DEBIT Depreciation Expense (expense increase via debit)
  const debitEntry = await tx.ledgerEntry.create({
    data: {
      entryCode: ledgerCode1,
      date: periodDate,
      accountId: depExpenseCoa.id,
      account: depExpenseCoa.name,
      particulars,
      debit: safeAmount,
      credit: 0,
      reference: scheduleId,
      referenceType: 'Depreciation',
      ...(companyId ? { companyId } : {}),
      isActive: true,
    },
  });

  // CREDIT Accumulated Depreciation (contra-asset increase via credit)
  const creditEntry = await tx.ledgerEntry.create({
    data: {
      entryCode: ledgerCode2,
      date: periodDate,
      accountId: accumDepCoa.id,
      account: accumDepCoa.name,
      particulars,
      debit: 0,
      credit: safeAmount,
      reference: scheduleId,
      referenceType: 'Depreciation',
      ...(companyId ? { companyId } : {}),
      isActive: true,
    },
  });

  // Update COA balances
  // Depreciation Expense: debit nature, increase on debit
  await tx.chartOfAccount.update({
    where: { id: depExpenseCoa.id },
    data: { currentBalance: safeFinancialAdd(depExpenseCoa.currentBalance, safeAmount) },
  });

  // Accumulated Depreciation: credit nature (contra-asset), increase on credit
  await tx.chartOfAccount.update({
    where: { id: accumDepCoa.id },
    data: { currentBalance: safeFinancialAdd(accumDepCoa.currentBalance, safeAmount) },
  });

  // Create LedgerAutoPost tracking record
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
      sourceType: 'Depreciation',
      sourceId: scheduleId,
      sourceCode: scheduleId,
      debitEntryId: debitEntry.id,
      creditEntryId: creditEntry.id,
      debitAccount: depExpenseCoa.code,
      creditAccount: accumDepCoa.code,
      amount: safeAmount,
      postingDate: periodDate,
      status: 'Posted',
      ...(companyId ? { companyId } : {}),
    },
  });
}

// ============================================================
// GET: Fetch depreciation schedules
// ============================================================
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Assets', 'GET');
  if (!security.authorized) return security.response;

  try {
    const companyId = security.user.companyId;
    const { searchParams } = new URL(request.url);
    const assetId = searchParams.get('assetId');
    const periodDateFrom = searchParams.get('periodDateFrom');
    const periodDateTo = searchParams.get('periodDateTo');

    const where: Record<string, unknown> = {
      isActive: true,
    };

    if (assetId) where.assetId = assetId;

    if (periodDateFrom || periodDateTo) {
      where.periodDate = {
        ...(periodDateFrom ? { gte: new Date(periodDateFrom) } : {}),
        ...(periodDateTo ? { lte: new Date(periodDateTo) } : {}),
      };
    }

    if (companyId) {
      where.asset = { companyId };
    }

    const items = await db.assetDepreciation.findMany({
      where,
      orderBy: { periodDate: 'desc' },
      include: {
        asset: {
          include: { investmentHead: true },
        },
      },
    });

    // VAT Auditor masking
    const masked = maskFinancialArray(
      items as unknown as Record<string, unknown>[],
      security.user.role,
      DEPRECIATION_MASKED_FIELDS
    );

    return NextResponse.json(masked);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch depreciation schedules' }, { status: 500 });
  }
}

// ============================================================
// POST: Create depreciation schedule with double-entry ledger posting
// ============================================================
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Assets', 'POST');
  if (!security.authorized) return security.response;

  try {
    const body = await request.json();
    const companyId = security.user.companyId;

    const assetId = body.assetId as string;
    if (!assetId) return NextResponse.json({ error: 'assetId is required' }, { status: 400 });

    const periodDate = body.periodDate ? new Date(body.periodDate as string) : new Date();

    const item = await db.$transaction(async (tx) => {
      // Get the asset
      const asset = await tx.asset.findUnique({
        where: { id: assetId },
        include: { investmentHead: true },
      });

      if (!asset) throw new Error('Asset not found');

      // Cross-tenant validation
      if (companyId && asset.companyId && asset.companyId !== companyId) {
        throw new Error('Cross-tenant access denied');
      }

      // Only Fixed Assets can have depreciation
      if (asset.assetCategory !== 'Fixed') {
        throw new Error('Depreciation only applies to Fixed Assets. Current Assets bypass depreciation.');
      }

      // Validate Fixed Asset depreciation parameters
      if (!asset.usefulLifeMonths || asset.usefulLifeMonths <= 0) {
        throw new Error('Asset usefulLifeMonths must be > 0 to calculate depreciation');
      }

      if (asset.salvageValue >= asset.purchaseValue) {
        throw new Error('Asset salvageValue must be < purchaseValue to calculate depreciation');
      }

      // Check if asset is fully depreciated
      if (asset.netBookValue <= asset.salvageValue) {
        throw new Error('Asset is fully depreciated. Net Book Value has reached Salvage Value.');
      }

      // Calculate monthly depreciation: (purchaseValue - salvageValue) / usefulLifeMonths
      const depreciationAmount = safeFinancialRound(
        safeFinancialSubtract(asset.purchaseValue, asset.salvageValue) / asset.usefulLifeMonths
      );

      // Update running totals
      const newAccumulatedDepreciation = safeFinancialRound(
        asset.accumulatedDepreciation + depreciationAmount
      );
      const newNetBookValue = safeFinancialSubtract(asset.purchaseValue, newAccumulatedDepreciation);

      // Ensure netBookValue doesn't go below salvageValue
      const finalNetBookValue = newNetBookValue < asset.salvageValue ? asset.salvageValue : newNetBookValue;
      const finalAccumulatedDepreciation = safeFinancialSubtract(asset.purchaseValue, finalNetBookValue);

      // Actual depreciation amount for this period (may be less if clamped to salvage)
      const actualDepreciation = safeFinancialSubtract(finalAccumulatedDepreciation, asset.accumulatedDepreciation);

      // Check if depreciation already exists for this asset+period
      const periodStart = new Date(periodDate.getFullYear(), periodDate.getMonth(), 1);
      const periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0, 23, 59, 59);

      const existingSchedule = await tx.assetDepreciation.findFirst({
        where: {
          assetId,
          periodDate: {
            gte: periodStart,
            lte: periodEnd,
          },
          isActive: true,
        },
      });

      if (existingSchedule) {
        throw new Error(`Depreciation already exists for this asset in period ${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, '0')}`);
      }

      // Create depreciation schedule entry
      const schedule = await tx.assetDepreciation.create({
        data: {
          assetId,
          periodDate,
          depreciationAmount: safeFinancialRound(actualDepreciation),
          accumulatedDepreciation: safeFinancialRound(finalAccumulatedDepreciation),
          netBookValue: safeFinancialRound(finalNetBookValue),
          method: body.method || 'StraightLine',
          notes: (body.notes as string) || null,
          isActive: true,
        },
      });

      // Update the Asset's running totals
      await tx.asset.update({
        where: { id: assetId },
        data: {
          accumulatedDepreciation: safeFinancialRound(finalAccumulatedDepreciation),
          netBookValue: safeFinancialRound(finalNetBookValue),
        },
      });

      // ── Double-entry ledger posting for depreciation ──
      // DEBIT Depreciation Expense (expense increase)
      // CREDIT Accumulated Depreciation (contra-asset increase)
      await postDepreciationLedger(
        tx,
        schedule.id,
        asset.investmentHead?.name || asset.id,
        actualDepreciation,
        periodDate,
        companyId
      );

      // AuditLog
      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: AUDIT_MODULE,
          recordId: schedule.id,
          recordLabel: `Depreciation: ${asset.investmentHead?.name || asset.id} - Period ${periodDate.toISOString().slice(0, 7)}`,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            assetId,
            depreciationAmount: actualDepreciation,
            accumulatedDepreciation: finalAccumulatedDepreciation,
            netBookValue: finalNetBookValue,
            periodDate: periodDate.toISOString(),
            ledgerPosted: true,
          }),
        },
      });

      return { ...schedule, ledgerPosted: true };
    });

    await logUserActivity({
      action: 'CREATE',
      module: AUDIT_MODULE,
      recordId: item.id,
      recordLabel: `Depreciation schedule for asset ${assetId}`,
      userId: security.user.id,
      userName: security.user.name,
      details: `Created depreciation schedule for asset ${assetId} with double-entry ledger posting`,
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Cross-tenant access denied') return NextResponse.json({ error: 'Not found' }, { status: 404 });
      if (error.message.includes('only applies to') || error.message.includes('must be') || error.message.includes('already exists') || error.message.includes('fully depreciated')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    return NextResponse.json({ error: 'Failed to create depreciation schedule', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
