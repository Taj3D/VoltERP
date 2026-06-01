import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  validateImageFields,
  safeFinancialRound,
  safeFinancialAdd,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

const AUDIT_MODULE = 'Inv-Asset-Ledger';

// ============================================================
// HELPER: Find or create a COA account based on InvestmentHead type
// Liability type → Liability COA classification
// Asset type → Asset COA classification
// Investment type → Equity COA classification
// ============================================================
async function findOrCreateInvestmentHeadCoa(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  headType: string,
  companyId: string | null
): Promise<{ id: string; code: string; name: string; currentBalance: number }> {
  let classification: string;
  let searchKeyword: string;
  let defaultAccountName: string;
  let balanceType: string;

  switch (headType) {
    case 'Asset':
      classification = 'Asset';
      searchKeyword = 'Asset';
      defaultAccountName = 'Investment Assets';
      balanceType = 'Dr';
      break;
    case 'Investment':
      classification = 'Equity';
      searchKeyword = 'Equity';
      defaultAccountName = 'Owner Equity';
      balanceType = 'Cr';
      break;
    case 'Liability':
    default:
      classification = 'Liability';
      searchKeyword = 'Liability';
      defaultAccountName = 'Investment Liabilities';
      balanceType = 'Cr';
      break;
  }

  // Step 1: Try to find an existing COA matching the classification and keyword
  let coaAccount = await tx.chartOfAccount.findFirst({
    where: {
      classification,
      isActive: true,
      name: { contains: searchKeyword },
      ...(companyId ? { companyId } : {}),
    },
  });

  // Step 2: Try any COA with the classification (without name filter)
  if (!coaAccount) {
    coaAccount = await tx.chartOfAccount.findFirst({
      where: {
        classification,
        isActive: true,
        ...(companyId ? { companyId } : {}),
      },
    });
  }

  // Step 3: Try without company filter (global account)
  if (!coaAccount && companyId) {
    coaAccount = await tx.chartOfAccount.findFirst({
      where: {
        classification,
        isActive: true,
        companyId: null,
      },
    });
  }

  // Step 4: Create one if nothing exists
  if (!coaAccount) {
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

    coaAccount = await tx.chartOfAccount.create({
      data: {
        code: coaCode,
        name: defaultAccountName,
        classification,
        openingBalance: 0,
        openingBalanceType: balanceType,
        currentBalance: 0,
        isRoot: false,
        isActive: true,
        ...(companyId ? { companyId } : {}),
      },
    });
  }

  return {
    id: coaAccount.id,
    code: coaAccount.code,
    name: coaAccount.name,
    currentBalance: coaAccount.currentBalance,
  };
}

// ============================================================
// HELPER: Find or create the contra COA account (Cash/Bank for Liability, Equity for Asset)
// When an Investment Head is created with openingBalance:
//   - Liability type: DEBIT Cash/Bank, CREDIT Liability COA
//   - Asset type: DEBIT Asset COA, CREDIT Equity COA
//   - Investment type: DEBIT Cash/Bank, CREDIT Equity COA
// ============================================================
async function findOrCreateContraCoa(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  headType: string,
  companyId: string | null
): Promise<{ id: string; code: string; name: string; currentBalance: number }> {
  // For Liability and Investment types, contra is Cash/Bank (Asset classification)
  // For Asset type, contra is Equity
  if (headType === 'Asset') {
    // Find or create Equity COA
    let equityCoa = await tx.chartOfAccount.findFirst({
      where: {
        classification: 'Equity',
        isActive: true,
        ...(companyId ? { companyId } : {}),
      },
    });

    if (!equityCoa && companyId) {
      equityCoa = await tx.chartOfAccount.findFirst({
        where: { classification: 'Equity', isActive: true, companyId: null },
      });
    }

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
      equityCoa = await tx.chartOfAccount.create({
        data: {
          code: `COA-${String(nextCoaNum).padStart(5, '0')}`,
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

  // For Liability and Investment types, contra is Cash/Bank (Asset classification)
  // Try to find Cash or Bank account first
  let cashBankCoa = await tx.chartOfAccount.findFirst({
    where: {
      classification: 'Asset',
      isActive: true,
      name: { contains: 'Cash' },
      ...(companyId ? { companyId } : {}),
    },
  });

  if (!cashBankCoa) {
    cashBankCoa = await tx.chartOfAccount.findFirst({
      where: {
        classification: 'Asset',
        isActive: true,
        name: { contains: 'Bank' },
        ...(companyId ? { companyId } : {}),
      },
    });
  }

  if (!cashBankCoa) {
    cashBankCoa = await tx.chartOfAccount.findFirst({
      where: {
        classification: 'Asset',
        isActive: true,
        ...(companyId ? { companyId } : {}),
      },
    });
  }

  if (!cashBankCoa && companyId) {
    cashBankCoa = await tx.chartOfAccount.findFirst({
      where: { classification: 'Asset', isActive: true, companyId: null },
    });
  }

  if (!cashBankCoa) {
    const lastCoa = await tx.chartOfAccount.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { code: true },
    });
    let nextCoaNum = 1;
    if (lastCoa?.code) {
      const match = lastCoa.code.match(/COA-(\d+)/);
      if (match) nextCoaNum = parseInt(match[1], 10) + 1;
    }
    cashBankCoa = await tx.chartOfAccount.create({
      data: {
        code: `COA-${String(nextCoaNum).padStart(5, '0')}`,
        name: 'Cash in Hand',
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
    id: cashBankCoa.id,
    code: cashBankCoa.code,
    name: cashBankCoa.name,
    currentBalance: cashBankCoa.currentBalance,
  };
}

// ============================================================
// HELPER: Post double-entry ledger for Investment Head opening balance
// ============================================================
async function postInvestmentHeadLedger(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  headId: string,
  headName: string,
  headType: string,
  openingBalance: number,
  companyId: string | null
): Promise<void> {
  if (openingBalance <= 0) return; // No ledger posting for zero balance

  const safeAmount = safeFinancialRound(openingBalance);

  // Resolve COA accounts
  const primaryCoa = await findOrCreateInvestmentHeadCoa(tx, headType, companyId);
  const contraCoa = await findOrCreateContraCoa(tx, headType, companyId);

  // Determine debit/credit based on head type
  let debitCoa: typeof primaryCoa;
  let creditCoa: typeof contraCoa;

  switch (headType) {
    case 'Liability':
      // DEBIT Cash/Bank (asset increase), CREDIT Liability (liability increase)
      debitCoa = contraCoa; // Cash/Bank
      creditCoa = primaryCoa; // Liability
      break;
    case 'Asset':
      // DEBIT Asset (asset increase), CREDIT Equity (equity increase)
      debitCoa = primaryCoa; // Asset
      creditCoa = contraCoa; // Equity
      break;
    case 'Investment':
      // DEBIT Cash/Bank (asset increase), CREDIT Equity (equity/capital increase)
      debitCoa = contraCoa; // Cash/Bank
      creditCoa = primaryCoa; // Equity
      break;
    default:
      // Default: same as Liability
      debitCoa = contraCoa;
      creditCoa = primaryCoa;
  }

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

  const now = new Date();
  const particulars = `${headType} head opening balance: ${headName}`;

  // Create DEBIT entry
  const debitEntry = await tx.ledgerEntry.create({
    data: {
      entryCode: ledgerCode1,
      date: now,
      accountId: debitCoa.id,
      account: debitCoa.name,
      particulars,
      debit: safeAmount,
      credit: 0,
      reference: headId,
      referenceType: 'InvestmentHead',
      ...(companyId ? { companyId } : {}),
      isActive: true,
    },
  });

  // Create CREDIT entry
  const creditEntry = await tx.ledgerEntry.create({
    data: {
      entryCode: ledgerCode2,
      date: now,
      accountId: creditCoa.id,
      account: creditCoa.name,
      particulars,
      debit: 0,
      credit: safeAmount,
      reference: headId,
      referenceType: 'InvestmentHead',
      ...(companyId ? { companyId } : {}),
      isActive: true,
    },
  });

  // Update COA balances
  // Debit nature account (Asset/Cash): increase on debit
  await tx.chartOfAccount.update({
    where: { id: debitCoa.id },
    data: { currentBalance: safeFinancialAdd(debitCoa.currentBalance, safeAmount) },
  });

  // Credit nature account (Liability/Equity): increase on credit
  await tx.chartOfAccount.update({
    where: { id: creditCoa.id },
    data: { currentBalance: safeFinancialAdd(creditCoa.currentBalance, safeAmount) },
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
      sourceType: 'InvestmentHead',
      sourceId: headId,
      sourceCode: headId,
      debitEntryId: debitEntry.id,
      creditEntryId: creditEntry.id,
      debitAccount: debitCoa.code,
      creditAccount: creditCoa.code,
      amount: safeAmount,
      postingDate: now,
      status: 'Posted',
      ...(companyId ? { companyId } : {}),
    },
  });
}

// ============================================================
// HELPER: Create a single Investment Head with double-entry ledger posting
// ============================================================
async function createSingleInvestmentHead(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  item: Record<string, any>,
  companyId: string | null,
  security: { user: { id: string; name: string; role: string } }
) {
  const imgError = validateImageFields(item, ['profileImage', 'nidFrontImage', 'nidBackImage']);
  if (imgError) throw new Error(imgError);

  // Validate financial fields
  if (item.openingBalance !== undefined && item.openingBalance !== null && Number(item.openingBalance) < 0) {
    throw new Error('openingBalance must be >= 0');
  }
  if (item.sharePercentage !== undefined && item.sharePercentage !== null) {
    const sp = Number(item.sharePercentage);
    if (sp <= 0 || sp > 100) {
      throw new Error('sharePercentage must be > 0 and <= 100');
    }
  }
  if (item.capitalValue !== undefined && item.capitalValue !== null) {
    const cv = Number(item.capitalValue);
    if (cv <= 0) {
      throw new Error('capitalValue must be > 0');
    }
  }

  const count = await tx.investmentHead.count();
  const code = `INVH-${String(count + 1).padStart(5, '0')}`;
  const headType = item.type || 'Liability';
  const openingBalance = item.openingBalance !== undefined ? safeFinancialRound(Number(item.openingBalance)) : 0;

  const record = await tx.investmentHead.create({
    data: {
      code,
      name: item.name,
      description: item.description || null,
      type: headType,
      openingBalance,
      openingType: item.openingType || '',
      sharePercentage: item.sharePercentage !== undefined && item.sharePercentage !== null ? safeFinancialRound(Number(item.sharePercentage)) : null,
      capitalValue: item.capitalValue !== undefined && item.capitalValue !== null ? safeFinancialRound(Number(item.capitalValue)) : null,
      profileImage: item.profileImage || null,
      nidFrontImage: item.nidFrontImage || null,
      nidBackImage: item.nidBackImage || null,
      isActive: item.isActive ?? true,
      ...(companyId && { companyId }),
    },
  });

  // ── Double-entry ledger posting for opening balance ──
  if (openingBalance > 0) {
    await postInvestmentHeadLedger(
      tx,
      record.id,
      record.name,
      headType,
      openingBalance,
      companyId
    );
  }

  return record;
}

// ============================================================
// GET: Fetch investment heads
// ============================================================
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'InvestmentHeads', 'GET');
  if (!security.authorized) return security.response;

  try {
    const companyId = security.user.companyId;

    const items = await db.investmentHead.findMany({
      where: {
        isActive: true,
        ...(companyId ? { companyId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { assets: true, liabilities: true } },
      },
    });

    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch investment heads' }, { status: 500 });
  }
}

// ============================================================
// POST: Create investment head(s) with double-entry ledger posting
// ============================================================
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'InvestmentHeads', 'POST');
  if (!security.authorized) return security.response;

  try {
    const body = await request.json();
    const companyId = security.user.companyId;

    // ── Batch mode support (CSV Import) with transactional validation ──
    if (body.batchMode && Array.isArray(body.data)) {
      // Pre-validation: check ALL rows before processing ANY
      // If any row fails validation, reject the entire import file
      const validationErrors: Array<{ row: number; field: string; message: string }> = [];

      for (let i = 0; i < body.data.length; i++) {
        const item = body.data[i];

        // Required field validation
        if (!item.name || String(item.name).trim() === '') {
          validationErrors.push({
            row: i + 1,
            field: 'name',
            message: 'Name is required',
          });
        }

        // Negative monetary value validation
        if (item.openingBalance !== undefined && item.openingBalance !== null && Number(item.openingBalance) < 0) {
          validationErrors.push({
            row: i + 1,
            field: 'openingBalance',
            message: `Negative value ${Number(item.openingBalance)} not allowed for openingBalance`,
          });
        }
        if (item.sharePercentage !== undefined && item.sharePercentage !== null) {
          const sp = Number(item.sharePercentage);
          if (sp <= 0 || sp > 100) {
            validationErrors.push({
              row: i + 1,
              field: 'sharePercentage',
              message: `Invalid sharePercentage ${sp}: must be > 0 and <= 100`,
            });
          }
        }
        if (item.capitalValue !== undefined && item.capitalValue !== null) {
          const cv = Number(item.capitalValue);
          if (cv <= 0) {
            validationErrors.push({
              row: i + 1,
              field: 'capitalValue',
              message: `Invalid capitalValue ${cv}: must be > 0`,
            });
          }
        }

        // Image validation
        const imgError = validateImageFields(item, ['profileImage', 'nidFrontImage', 'nidBackImage']);
        if (imgError) {
          validationErrors.push({
            row: i + 1,
            field: 'image',
            message: imgError,
          });
        }

        // Unmapped company identifier validation
        if (item.companyId && companyId && item.companyId !== companyId) {
          validationErrors.push({
            row: i + 1,
            field: 'companyId',
            message: `Unmapped company identifier: ${item.companyId} does not match authenticated user's company`,
          });
        }
      }

      // If ANY validation errors, reject entire import (transactional rollback)
      if (validationErrors.length > 0) {
        return NextResponse.json({
          error: `Import rejected: ${validationErrors.length} validation error(s). Entire import file rolled back.`,
          validationErrors,
          imported: 0,
          failed: body.data.length,
        }, { status: 400 });
      }

      // All rows validated — proceed with Prisma transactional insert
      const results = await db.$transaction(async (tx) => {
        const created: unknown[] = [];
        for (const item of body.data) {
          const record = await createSingleInvestmentHead(tx, item, companyId, security);
          created.push(record);
        }

        await tx.auditLog.create({
          data: {
            action: 'IMPORT',
            module: AUDIT_MODULE,
            recordId: 'BATCH',
            recordLabel: `Batch Import: ${created.length} investment heads`,
            userId: security.user.id,
            userName: security.user.name,
            details: JSON.stringify({ count: created.length, batchMode: true, source: 'csv_import' }),
          },
        });

        return created;
      });

      await logUserActivity({
        action: 'IMPORT',
        module: AUDIT_MODULE,
        recordId: 'BATCH',
        recordLabel: `Batch Import: ${results.length} investment heads`,
        userId: security.user.id,
        userName: security.user.name,
        details: `Imported ${results.length} investment heads via CSV`,
      });

      return NextResponse.json({
        imported: results.length,
        failed: 0,
        data: results,
      }, { status: 201 });
    }

    // ── Single mode ──
    const item = await db.$transaction(async (tx) => {
      const record = await createSingleInvestmentHead(tx, body, companyId, security);

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: AUDIT_MODULE,
          recordId: record.id,
          recordLabel: record.name || record.code || record.id,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({ code: record.code, name: record.name, type: record.type, openingBalance: record.openingBalance }),
        },
      });

      return record;
    });

    await logUserActivity({
      action: 'CREATE',
      module: AUDIT_MODULE,
      recordId: item.id,
      recordLabel: item.name || item.code || item.id,
      userId: security.user.id,
      userName: security.user.name,
      details: `Created investment head: ${item.name || item.code} (Opening: ৳${item.openingBalance})`,
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('must be') || error.message.startsWith('Image')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    return NextResponse.json({ error: 'Failed to create investment head' }, { status: 500 });
  }
}
