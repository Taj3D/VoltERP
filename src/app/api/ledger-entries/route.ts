import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity } from '@/lib/api-security';
import { generateNextCode, verifyLedgerBalance } from '@/lib/accounting-utils';

// Helper: Check if a date falls within a locked period
async function isPeriodLocked(date: Date): Promise<boolean> {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  const lockedPeriod = await db.periodClose.findFirst({
    where: { periodMonth: month, periodYear: year, isLocked: true },
  });
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

    // LED-001: Double-entry balance verification endpoint
    if (action === 'verify-balance') {
      const from = searchParams.get('from') || undefined;
      const to = searchParams.get('to') || undefined;
      const reference = searchParams.get('reference') || undefined;
      const referenceType = searchParams.get('referenceType') || undefined;

      const result = await verifyLedgerBalance({ from, to, reference, referenceType });
      return NextResponse.json(result);
    }

    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const account = searchParams.get('account');
    const accountId = searchParams.get('accountId');
    const referenceType = searchParams.get('referenceType');

    const where: Record<string, unknown> = { isActive: true };

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
    return NextResponse.json(ledgerEntries);
  } catch (error) {
    console.error('Error fetching ledger entries:', error);
    return NextResponse.json({ error: 'Failed to fetch ledger entries' }, { status: 500 });
  }
}

// POST /api/ledger-entries - Create a ledger entry
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'LedgerEntries', 'POST');
  if (!security.authorized) return security.response;
  try {
    const body = await request.json();
    const { date, account, particulars, debit, credit, reference, referenceType, accountId } = body;

    if (!date || !account) {
      return NextResponse.json({ error: 'date and account are required' }, { status: 400 });
    }

    // Double-entry validation: either debit or credit must be > 0, not both
    const d = Number(debit) || 0;
    const c = Number(credit) || 0;
    if (d > 0 && c > 0) {
      return NextResponse.json(
        { error: 'Double-entry violation: an entry cannot have both debit and credit > 0' },
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

    // Period lock validation
    const locked = await isPeriodLocked(new Date(date));
    if (locked) {
      return NextResponse.json(
        { error: 'Cannot create entry: date falls within a locked period' },
        { status: 403 }
      );
    }

    // Validate accountId if provided
    if (accountId) {
      const coa = await db.chartOfAccount.findUnique({ where: { id: accountId, isActive: true } });
      if (!coa) {
        return NextResponse.json(
          { error: 'Chart of account not found for the given accountId' },
          { status: 400 }
        );
      }
    }

    const result = await db.$transaction(async (tx) => {
      // COA-003: Use generateNextCode instead of count+1
      const entryCode = await generateNextCode('ledgerEntry', 'LED-');

      const ledgerEntry = await tx.ledgerEntry.create({
        data: {
          entryCode,
          date: new Date(date),
          account,
          particulars: particulars || null,
          debit: d,
          credit: c,
          reference: reference || null,
          referenceType: referenceType || null,
          accountId: accountId || null,
        },
        include: { chartOfAccount: true },
      });

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'LedgerEntries',
          recordId: ledgerEntry.id,
          recordLabel: ledgerEntry.entryCode,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify(body),
        },
      });

      return ledgerEntry;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating ledger entry:', error);
    return NextResponse.json({ error: 'Failed to create ledger entry' }, { status: 500 });
  }
}
