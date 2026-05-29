import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  safeFinancialRound,
  maskAccountingArray,
} from '@/lib/api-security';
import { generateNextCode, verifyLedgerBalance } from '@/lib/accounting-utils';
import { logUserActivity } from '@/lib/activity-logger';

// Helper: Check if a date falls within a locked period (scoped by companyId)
async function isPeriodLocked(
  date: Date,
  companyId: string | null
): Promise<boolean> {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  const where: Record<string, unknown> = {
    periodMonth: month,
    periodYear: year,
    isLocked: true,
  };
  // STAGE 12: Scope period lock check to the user's company
  if (companyId) {
    where.companyId = companyId;
  }
  const lockedPeriod = await db.periodClose.findFirst({ where });
  return !!lockedPeriod;
}

// GET /api/ledger-entries - List all ledger entries with optional filters
// LED-001: Supports ?action=verify-balance for double-entry verification
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'LedgerEntries', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const companyId = security.user.companyId;

    // LED-001: Double-entry balance verification endpoint
    if (action === 'verify-balance') {
      const from = searchParams.get('from') || undefined;
      const to = searchParams.get('to') || undefined;
      const reference = searchParams.get('reference') || undefined;
      const referenceType = searchParams.get('referenceType') || undefined;

      // STAGE 12: Pass companyId for multi-tenant isolation
      const result = await verifyLedgerBalance({
        from,
        to,
        reference,
        referenceType,
        companyId,
      });
      return NextResponse.json(result);
    }

    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const account = searchParams.get('account');
    const accountId = searchParams.get('accountId');
    const referenceType = searchParams.get('referenceType');

    // STAGE 12: Multi-tenant isolation — filter by companyId
    const where: Record<string, unknown> = { isActive: true };
    if (companyId) {
      where.companyId = companyId;
    }

    if (from || to) {
      const dateFilter: Record<string, Date> = {};
      if (from) dateFilter.gte = new Date(from);
      if (to) dateFilter.lte = new Date(to);
      where.date = dateFilter;
    }
    if (account) {
      where.account = { contains: account, mode: 'insensitive' };
    }
    if (accountId) {
      where.accountId = accountId;
    }
    if (referenceType) {
      where.referenceType = referenceType;
    }

    const ledgerEntries = await db.ledgerEntry.findMany({
      where,
      include: { chartOfAccount: true },
      orderBy: { date: 'desc' },
    });

    // STAGE 12: VAT Auditor masking — apply maskAccountingArray for vat_auditor role
    const responseData =
      security.user.role === 'vat_auditor'
        ? maskAccountingArray(ledgerEntries, security.user.role)
        : ledgerEntries;

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Error fetching ledger entries:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ledger entries' },
      { status: 500 }
    );
  }
}

// POST /api/ledger-entries - Create a ledger entry
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'LedgerEntries', 'POST');
  if (!security.authorized) return security.response;
  try {
    const body = await request.json();
    const {
      date,
      account,
      particulars,
      debit,
      credit,
      reference,
      referenceType,
      accountId,
    } = body;
    const companyId = security.user.companyId;

    if (!date || !account) {
      return NextResponse.json(
        { error: 'date and account are required' },
        { status: 400 }
      );
    }

    // Double-entry validation: either debit or credit must be > 0, not both
    const d = Number(debit) || 0;
    const c = Number(credit) || 0;
    if (d > 0 && c > 0) {
      return NextResponse.json(
        {
          error: 'Double-entry violation: an entry cannot have both debit and credit > 0',
        },
        { status: 400 }
      );
    }
    if (d === 0 && c === 0) {
      return NextResponse.json(
        { error: 'Either debit or credit must be greater than 0' },
        { status: 400 }
      );
    }

    // Negative value validation
    if (d < 0 || c < 0) {
      return NextResponse.json(
        { error: 'Debit and credit values must be non-negative' },
        { status: 400 }
      );
    }

    // Period lock validation — STAGE 12: scoped by companyId
    const locked = await isPeriodLocked(new Date(date), companyId);
    if (locked) {
      return NextResponse.json(
        { error: 'Cannot create entry: date falls within a locked period' },
        { status: 403 }
      );
    }

    // Validate accountId if provided
    if (accountId) {
      const coa = await db.chartOfAccount.findUnique({
        where: { id: accountId, isActive: true },
      });
      if (!coa) {
        return NextResponse.json(
          { error: 'Chart of account not found for the given accountId' },
          { status: 400 }
        );
      }
    }

    // STAGE 12: Safe math — round debit/credit values
    const safeDebit = safeFinancialRound(d);
    const safeCredit = safeFinancialRound(c);

    const result = await db.$transaction(async (tx) => {
      // COA-003: Use generateNextCode instead of count+1
      const entryCode = await generateNextCode('ledgerEntry', 'LED-');

      const ledgerEntry = await tx.ledgerEntry.create({
        data: {
          entryCode,
          date: new Date(date),
          account,
          particulars: particulars || null,
          debit: safeDebit,
          credit: safeCredit,
          reference: reference || null,
          referenceType: referenceType || null,
          accountId: accountId || null,
          // STAGE 12: Multi-tenant isolation — set companyId
          ...(companyId && { companyId }),
        },
        include: { chartOfAccount: true },
      });

      return ledgerEntry;
    });

    // STAGE 12: Activity logging — module token 'Acc-Chart-Of-Accounts'
    await logUserActivity({
      action: 'CREATE',
      module: 'Acc-Chart-Of-Accounts',
      recordId: result.id,
      recordLabel: result.entryCode,
      userId: security.user?.id,
      userName: security.user?.name,
      details: JSON.stringify(body),
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating ledger entry:', error);
    return NextResponse.json(
      { error: 'Failed to create ledger entry' },
      { status: 500 }
    );
  }
}
