import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity } from '@/lib/api-security';
import { detectCircularParent, calculateAccountBalance, generateNextCode } from '@/lib/accounting-utils';

// GET /api/chart-of-accounts - List all chart of accounts with sub-balances
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'ChartOfAccounts', 'GET');
  if (!security.authorized) return security.response;
  try {
    const accounts = await db.chartOfAccount.findMany({
      where: { isActive: true },
      include: {
        parentAccount: true,
        childAccounts: { where: { isActive: true } },
        _count: { select: { childAccounts: true, ledgerEntries: true } },
      },
      orderBy: { code: 'asc' },
    });

    // COA-002: Attach dynamic sub-balance to each account
    const accountsWithBalance = await Promise.all(
      accounts.map(async (account) => {
        const balance = await calculateAccountBalance(account.id);
        return {
          ...account,
          subBalance: {
            ownDebit: balance.ownDebit,
            ownCredit: balance.ownCredit,
            ownNet: balance.ownNet,
            childDebit: balance.childDebit,
            childCredit: balance.childCredit,
            childNet: balance.childNet,
            totalDebit: balance.totalDebit,
            totalCredit: balance.totalCredit,
            totalNet: balance.totalNet,
          },
        };
      })
    );

    return NextResponse.json(accountsWithBalance);
  } catch (error) {
    console.error('Error fetching chart of accounts:', error);
    return NextResponse.json({ error: 'Failed to fetch chart of accounts' }, { status: 500 });
  }
}

// POST /api/chart-of-accounts - Create a chart of account
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'ChartOfAccounts', 'POST');
  if (!security.authorized) return security.response;
  try {
    const body = await request.json();
    const { name, classification, parentAccountId, openingBalance, openingBalanceType } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // COA-001: Circular parent detection
    if (parentAccountId) {
      // Verify parent account exists
      const parentExists = await db.chartOfAccount.findUnique({
        where: { id: parentAccountId, isActive: true },
      });
      if (!parentExists) {
        return NextResponse.json(
          { error: 'Parent account not found or is inactive' },
          { status: 400 }
        );
      }

      // Check for circular reference (self-reference is impossible for new accounts
      // since we don't have an ID yet, but we still check for ancestor loops)
      const isCircular = await detectCircularParent('', parentAccountId);
      if (isCircular) {
        return NextResponse.json(
          { error: 'Circular parent reference detected. Cannot assign this parent account.' },
          { status: 400 }
        );
      }
    }

    const result = await db.$transaction(async (tx) => {
      // COA-003: Use generateNextCode instead of count+1
      const code = await generateNextCode('chartOfAccount', 'COA-');

      const account = await tx.chartOfAccount.create({
        data: {
          code,
          name,
          classification: classification || 'Asset',
          parentAccountId: parentAccountId || null,
          openingBalance: openingBalance || 0,
          openingBalanceType: openingBalanceType || 'Dr',
        },
        include: {
          parentAccount: true,
          childAccounts: true,
          _count: { select: { childAccounts: true, ledgerEntries: true } },
        },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'ChartOfAccounts',
          recordId: account.id,
          recordLabel: `${account.code} - ${account.name}`,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify(body),
        },
      });

      return account;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating chart of account:', error);
    return NextResponse.json({ error: 'Failed to create chart of account' }, { status: 500 });
  }
}
