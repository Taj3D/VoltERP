import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  checkPeriodClose,
  safeFinancialRound,
  safeFinancialAdd,
  safeFinancialSubtract,
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
 * Helper: Resolve the appropriate Cash/Bank COA account for a liability transaction.
 *
 * Resolution priority:
 * 1. If paymentMethod is "Bank Transfer" or "Cheque", prefer a Bank-named Asset COA account.
 * 2. Otherwise, prefer a Cash-named Asset COA account.
 * 3. If the preferred account is not found, fall back to any active Asset COA account for the company.
 */
async function resolveCashBankCoaAccount(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  paymentMethod: string | null,
  companyId: string | null
): Promise<{ id: string; code: string; name: string; currentBalance: number } | null> {
  const isBankPayment = paymentMethod === 'Bank Transfer' || paymentMethod === 'Cheque';

  // Step 1: Try preferred account based on payment method
  if (isBankPayment) {
    const bankAccount = await tx.chartOfAccount.findFirst({
      where: {
        classification: 'Asset',
        isActive: true,
        name: { contains: 'Bank' },
        ...(companyId ? { companyId } : {}),
      },
    });
    if (bankAccount) return bankAccount;
  } else {
    const cashAccount = await tx.chartOfAccount.findFirst({
      where: {
        classification: 'Asset',
        isActive: true,
        name: { contains: 'Cash' },
        ...(companyId ? { companyId } : {}),
      },
    });
    if (cashAccount) return cashAccount;
  }

  // Step 2: Fallback — try the other type (Bank -> Cash, Cash -> Bank)
  if (isBankPayment) {
    const cashAccount = await tx.chartOfAccount.findFirst({
      where: {
        classification: 'Asset',
        isActive: true,
        name: { contains: 'Cash' },
        ...(companyId ? { companyId } : {}),
      },
    });
    if (cashAccount) return cashAccount;
  } else {
    const bankAccount = await tx.chartOfAccount.findFirst({
      where: {
        classification: 'Asset',
        isActive: true,
        name: { contains: 'Bank' },
        ...(companyId ? { companyId } : {}),
      },
    });
    if (bankAccount) return bankAccount;
  }

  // Step 3: Final fallback — any active Asset COA account
  const anyAssetAccount = await tx.chartOfAccount.findFirst({
    where: {
      classification: 'Asset',
      isActive: true,
      ...(companyId ? { companyId } : {}),
    },
  });
  return anyAssetAccount;
}

/**
 * Helper: Resolve the appropriate Liability COA account for a liability transaction.
 *
 * Resolution priority:
 * 1. Any active Liability classification COA account for the company.
 * 2. If none found, returns null (double-entry posting will be skipped gracefully).
 */
async function resolveLiabilityCoaAccount(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  companyId: string | null
): Promise<{ id: string; code: string; name: string; currentBalance: number } | null> {
  const liabilityAccount = await tx.chartOfAccount.findFirst({
    where: {
      classification: 'Liability',
      isActive: true,
      ...(companyId ? { companyId } : {}),
    },
  });
  return liabilityAccount;
}

/**
 * Helper: Generate the next sequential entry code for LedgerEntry (LED-XXXXX format)
 */
async function generateLedgerEntryCode(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]
): Promise<string> {
  const lastEntry = await tx.ledgerEntry.findFirst({
    orderBy: { entryCode: 'desc' },
    select: { entryCode: true },
  });
  let nextNum = 1;
  if (lastEntry?.entryCode) {
    const match = lastEntry.entryCode.match(/LED-(\d+)/);
    if (match) {
      nextNum = parseInt(match[1], 10) + 1;
    }
  }
  return `LED-${String(nextNum).padStart(5, '0')}`;
}

/**
 * Helper: Generate the next sequential code for LedgerAutoPost (LAP-XXXXX format)
 */
async function generateLapCode(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]
): Promise<string> {
  const lastAutoPost = await tx.ledgerAutoPost.findFirst({
    orderBy: { code: 'desc' },
    select: { code: true },
  });
  let nextNum = 1;
  if (lastAutoPost?.code) {
    const match = lastAutoPost.code.match(/LAP-(\d+)/);
    if (match) {
      nextNum = parseInt(match[1], 10) + 1;
    }
  }
  return `LAP-${String(nextNum).padStart(5, '0')}`;
}

/**
 * Helper: Create a single liability with full validation and double-entry ledger posting
 *
 * Double-entry logic:
 * - "received" type: DEBIT Cash/Bank (asset increase), CREDIT Liability (liability increase)
 * - "pay" type:      DEBIT Liability (liability decrease), CREDIT Cash/Bank (asset decrease)
 */
async function createSingleLiability(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  body: Record<string, unknown>,
  companyId: string | null,
  security: { user: { id: string; name: string; role: string } }
) {
  const investmentHeadId = body.investmentHeadId as string;
  if (!investmentHeadId) throw new Error('investmentHeadId is required');

  // ── Step 1: Check Investment Head isActive ──
  const head = await tx.investmentHead.findUnique({ where: { id: investmentHeadId } });
  if (!head || !head.isActive) {
    throw new Error('Action Blocked: Chosen Investment Head is inactive or archived.');
  }

  // Amount must be > 0
  const amount = Number(body.amount);
  if (!amount || amount <= 0) {
    throw new Error('Amount must be > 0');
  }

  const safeAmount = safeFinancialRound(amount);
  const liabilityType = (body.type as string) || 'received';
  const paymentMethod = (body.paymentMethod as string) || null;
  const liabilityDate = body.date ? new Date(body.date as string) : new Date();

  // ── Step 2: Insert the Liability record ──
  const record = await tx.liability.create({
    data: {
      investmentHeadId,
      date: liabilityDate,
      amount: safeAmount,
      type: liabilityType,
      paymentMethod,
      description: (body.description as string) || null,
      ...(companyId && { companyId }),
      isActive: body.isActive !== undefined ? Boolean(body.isActive) : true,
    },
    include: { investmentHead: true },
  });

  // ── Step 3: Find the appropriate Chart of Accounts nodes ──
  const liabilityCoa = await resolveLiabilityCoaAccount(tx, companyId);
  const cashBankCoa = await resolveCashBankCoaAccount(tx, paymentMethod, companyId);

  // Only proceed with double-entry if BOTH accounts are found
  if (liabilityCoa && cashBankCoa) {
    // Determine debit/credit accounts based on liability type
    let debitCoa: { id: string; code: string; name: string; currentBalance: number };
    let creditCoa: { id: string; code: string; name: string; currentBalance: number };

    if (liabilityType === 'received') {
      // "received": DEBIT Cash/Bank (asset increase), CREDIT Liability (liability increase)
      debitCoa = cashBankCoa;
      creditCoa = liabilityCoa;
    } else {
      // "pay": DEBIT Liability (liability decrease), CREDIT Cash/Bank (asset decrease)
      debitCoa = liabilityCoa;
      creditCoa = cashBankCoa;
    }

    // ── Step 4: Create two LedgerEntry records (debit/credit pair) ──
    const debitEntryCode = await generateLedgerEntryCode(tx);
    const creditEntryCode = await generateLedgerEntryCode(tx);

    const headName = head.name || investmentHeadId;
    const particulars = liabilityType === 'received'
      ? `Liability received - ${headName}`
      : `Liability payment - ${headName}`;

    await tx.ledgerEntry.create({
      data: {
        entryCode: debitEntryCode,
        date: liabilityDate,
        accountId: debitCoa.id,
        account: debitCoa.name,
        particulars,
        debit: safeAmount,
        credit: 0,
        reference: record.id,
        referenceType: 'Liability',
        ...(companyId && { companyId }),
      },
    });

    await tx.ledgerEntry.create({
      data: {
        entryCode: creditEntryCode,
        date: liabilityDate,
        accountId: creditCoa.id,
        account: creditCoa.name,
        particulars,
        debit: 0,
        credit: safeAmount,
        reference: record.id,
        referenceType: 'Liability',
        ...(companyId && { companyId }),
      },
    });

    // ── Step 5: Update both COA accounts' currentBalance ──
    if (liabilityType === 'received') {
      // Cash/Bank COA currentBalance += amount (asset increase via debit)
      await tx.chartOfAccount.update({
        where: { id: cashBankCoa.id },
        data: { currentBalance: safeFinancialAdd(cashBankCoa.currentBalance, safeAmount) },
      });
      // Liability COA currentBalance += amount (liability increase via credit)
      await tx.chartOfAccount.update({
        where: { id: liabilityCoa.id },
        data: { currentBalance: safeFinancialAdd(liabilityCoa.currentBalance, safeAmount) },
      });
    } else {
      // Liability COA currentBalance -= amount (liability decrease via debit)
      await tx.chartOfAccount.update({
        where: { id: liabilityCoa.id },
        data: { currentBalance: safeFinancialSubtract(liabilityCoa.currentBalance, safeAmount) },
      });
      // Cash/Bank COA currentBalance -= amount (asset decrease via credit)
      await tx.chartOfAccount.update({
        where: { id: cashBankCoa.id },
        data: { currentBalance: safeFinancialSubtract(cashBankCoa.currentBalance, safeAmount) },
      });
    }

    // ── Step 6: Create a LedgerAutoPost tracking record ──
    const lapCode = await generateLapCode(tx);

    await tx.ledgerAutoPost.create({
      data: {
        code: lapCode,
        sourceType: 'Liability',
        sourceId: record.id,
        sourceCode: record.id,
        debitEntryId: debitEntryCode,
        creditEntryId: creditEntryCode,
        debitAccount: debitCoa.code,
        creditAccount: creditCoa.code,
        amount: safeAmount,
        postingDate: liabilityDate,
        status: 'Posted',
        postedBy: security.user.id,
        ...(companyId && { companyId }),
      },
    });
  }

  return record;
}
