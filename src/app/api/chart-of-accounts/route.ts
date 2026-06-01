import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  maskForVatAuditorAccounting,
  maskAccountingArray,
  safeFinancialRound,
  safeFinancialAdd,
  safeFinancialSubtract,
  formatFinancialField,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';
import { detectCircularParent, calculateAccountBalance, generateNextCode } from '@/lib/accounting-utils';

// GET /api/chart-of-accounts - List all chart of accounts with multi-tenant isolation,
// safe sub-balances, VAT Auditor masking, and optional field placeholders
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'ChartOfAccounts', 'GET');
  if (!security.authorized) return security.response;

  const role = security.user.role;
  const companyId = security.user.companyId;

  try {
    // Multi-tenant filter: only show accounts for the user's company
    const whereClause: Record<string, unknown> = { isActive: true };
    if (companyId) {
      whereClause.companyId = companyId;
    }

    const accounts = await db.chartOfAccount.findMany({
      where: whereClause,
      include: {
        parentAccount: true,
        childAccounts: { where: { isActive: true } },
        _count: { select: { childAccounts: true, ledgerEntries: true } },
      },
      orderBy: { code: 'asc' },
    });

    // COA-002: Attach dynamic sub-balance to each account (companyId-aware + safe arithmetic)
    const accountsWithBalance = await Promise.all(
      accounts.map(async (account) => {
        // Pass companyId for multi-tenant ledger entry filtering
        const balance = await calculateAccountBalance(account.id, undefined, companyId);

        // Format parentAccount name — show "—" if null
        const parentAccountName = account.parentAccount
          ? account.parentAccount.name
          : formatFinancialField(null);

        return {
          ...account,
          parentAccountName,
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

    // Apply VAT Auditor accounting masking on each account record
    // maskForVatAuditorAccounting masks all monetary subBalance fields + openingBalance
    const masked = maskAccountingArray(accountsWithBalance as Record<string, unknown>[], role, [
      'openingBalance',
      'openingBalanceType',
    ]);

    return NextResponse.json(masked);
  } catch (error) {
    console.error('Error fetching chart of accounts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch chart of accounts' },
      { status: 500 }
    );
  }
}

// POST /api/chart-of-accounts - Create a chart of account with multi-tenant isolation,
// safe arithmetic, activity logging, and circular parent detection
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'ChartOfAccounts', 'POST');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const body = await request.json();
    const { name, classification, parentAccountId, openingBalance, openingBalanceType } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Phase 13 D1: Case-insensitive unique constraint on code scoped by companyId
    // Enforce absolute case-insensitive unique constraints for accounting nodes
    if (body.code) {
      const normalizedCode = body.code.trim().toUpperCase();
      const existingCodeWhere: Record<string, unknown> = {
        code: normalizedCode,
        isActive: true,
      };
      if (companyId) {
        existingCodeWhere.companyId = companyId;
      }
      const existingCode = await db.chartOfAccount.findFirst({ where: existingCodeWhere });
      if (existingCode) {
        return NextResponse.json(
          { error: `Account code "${normalizedCode}" already exists. Account codes must be unique within your company (case-insensitive).` },
          { status: 400 }
        );
      }
    }

    // COA-001: Circular parent detection
    if (parentAccountId) {
      // Verify parent account exists AND belongs to same company
      const parentWhere: Record<string, unknown> = { id: parentAccountId, isActive: true };
      if (companyId) {
        parentWhere.companyId = companyId;
      }
      const parentExists = await db.chartOfAccount.findFirst({ where: parentWhere });
      if (!parentExists) {
        return NextResponse.json(
          { error: 'Parent account not found, is inactive, or does not belong to your company' },
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

    // Safe arithmetic on opening balance
    const safeOpeningBalance = openingBalance !== undefined
      ? safeFinancialRound(Number(openingBalance))
      : 0;

    const result = await db.$transaction(async (tx) => {
      // COA-003: Use generateNextCode instead of count+1
      const code = await generateNextCode('chartOfAccount', 'COA-');

      const account = await tx.chartOfAccount.create({
        data: {
          code,
          name,
          classification: classification || 'Asset',
          parentAccountId: parentAccountId || null,
          openingBalance: safeOpeningBalance,
          openingBalanceType: openingBalanceType || 'Dr',
          // Multi-tenant: set companyId from authenticated user
          companyId: companyId || null,
        },
        include: {
          parentAccount: true,
          childAccounts: true,
          _count: { select: { childAccounts: true, ledgerEntries: true } },
        },
      });

      return account;
    });

    // Activity logging — module token "Acc-Chart-Of-Accounts"
    await logUserActivity({
      action: 'CREATE',
      module: 'Acc-Chart-Of-Accounts',
      recordId: result.id,
      recordLabel: `${result.code} - ${result.name}`,
      userId: security.user.id,
      userName: security.user.name,
      details: JSON.stringify({
        code: result.code,
        name,
        classification: classification || 'Asset',
        parentAccountId: parentAccountId || null,
        openingBalance: safeOpeningBalance,
        openingBalanceType: openingBalanceType || 'Dr',
        companyId: companyId || null,
      }),
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating chart of account:', error);
    return NextResponse.json(
      { error: 'Failed to create chart of account' },
      { status: 500 }
    );
  }
}
