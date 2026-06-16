import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  maskForVatAuditorAccounting,
  safeFinancialRound,
  safeFinancialAdd,
  safeFinancialSubtract,
  formatFinancialField,
  stripHtml,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';
import { detectCircularParent, calculateAccountBalance } from '@/lib/accounting-utils';

// GET /api/chart-of-accounts/[id] - Get single chart of account with cross-tenant validation,
// safe sub-balances, VAT Auditor masking, and optional field placeholders
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'ChartOfAccounts', 'GET');
  if (!security.authorized) return security.response;

  const role = security.user.role;
  const companyId = security.user.companyId;

  try {
    const { id } = await params;
    const account = await db.chartOfAccount.findUnique({
      where: { id },
      include: {
        parentAccount: true,
        childAccounts: { where: { isActive: true } },
        _count: { select: { childAccounts: true, ledgerEntries: true } },
      },
    });

    if (!account) {
      return NextResponse.json({ error: 'Chart of account not found' }, { status: 404 });
    }

    // Cross-tenant validation: if user has a companyId, the record must match
    if (companyId && account.companyId && account.companyId !== companyId) {
      return NextResponse.json({ error: 'Chart of account not found' }, { status: 404 });
    }

    // COA-002: Attach dynamic sub-balance (companyId-aware + safe arithmetic)
    const balance = await calculateAccountBalance(account.id, undefined, companyId);

    // Format parentAccount name — show "—" if null
    const parentAccountName = account.parentAccount
      ? account.parentAccount.name
      : formatFinancialField(null);

    const accountWithBalance = {
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

    // Apply VAT Auditor accounting masking
    const maskedItem = maskForVatAuditorAccounting(
      accountWithBalance as Record<string, unknown>,
      role
    );

    return NextResponse.json(maskedItem);
  } catch (error) {
    console.error('Error fetching chart of account:', error);
    return NextResponse.json(
      { error: 'Failed to fetch chart of account' },
      { status: 500 }
    );
  }
}

// PUT /api/chart-of-accounts/[id] - Update with cross-tenant validation,
// safe arithmetic, activity logging, and circular parent detection
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'ChartOfAccounts', 'PUT');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;
    const body = await request.json();
    let { name, classification, parentAccountId, openingBalance, openingBalanceType, isActive } = body;

    // XSS protection: strip HTML from text fields
    if (name) name = stripHtml(String(name));
    if (classification) classification = stripHtml(String(classification));
    if (openingBalanceType) openingBalanceType = stripHtml(String(openingBalanceType));

    // Fetch existing record
    const existing = await db.chartOfAccount.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Chart of account not found' }, { status: 404 });
    }

    // Cross-tenant validation: if user has a companyId, the record must match
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Chart of account not found' }, { status: 404 });
    }

    // COA-001: Circular parent detection on parentAccountId change
    if (parentAccountId !== undefined && parentAccountId) {
      // Self-reference check: cannot set parent to self
      if (parentAccountId === id) {
        return NextResponse.json(
          { error: 'Circular parent reference: an account cannot be its own parent.' },
          { status: 400 }
        );
      }

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

      // Walk up the parent chain to detect circular reference
      const isCircular = await detectCircularParent(id, parentAccountId);
      if (isCircular) {
        return NextResponse.json(
          { error: 'Circular parent reference detected. Assigning this parent would create a loop in the account hierarchy.' },
          { status: 400 }
        );
      }
    }

    // Safe arithmetic on opening balance if provided
    const safeOpeningBalance = openingBalance !== undefined
      ? safeFinancialRound(Number(openingBalance))
      : undefined;

    const result = await db.$transaction(async (tx) => {
      const account = await tx.chartOfAccount.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(classification !== undefined && { classification }),
          ...(parentAccountId !== undefined && { parentAccountId: parentAccountId || null }),
          ...(safeOpeningBalance !== undefined && { openingBalance: safeOpeningBalance }),
          ...(openingBalanceType !== undefined && { openingBalanceType }),
          ...(isActive !== undefined && { isActive }),
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
      action: 'UPDATE',
      module: 'Acc-Chart-Of-Accounts',
      recordId: id,
      recordLabel: `${existing.code} - ${existing.name}`,
      userId: security.user.id,
      userName: security.user.name,
      details: JSON.stringify({
        code: existing.code,
        updatedFields: {
          ...(name !== undefined && { name }),
          ...(classification !== undefined && { classification }),
          ...(parentAccountId !== undefined && { parentAccountId }),
          ...(safeOpeningBalance !== undefined && { openingBalance: safeOpeningBalance }),
          ...(openingBalanceType !== undefined && { openingBalanceType }),
          ...(isActive !== undefined && { isActive }),
        },
        companyId: companyId || null,
      }),
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating chart of account:', error);
    return NextResponse.json(
      { error: 'Failed to update chart of account' },
      { status: 500 }
    );
  }
}

// DELETE /api/chart-of-accounts/[id] - Soft delete with cross-tenant validation,
// child account FK check, and activity logging
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'ChartOfAccounts', 'DELETE');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;

    // Fetch existing record
    const existing = await db.chartOfAccount.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Chart of account not found' }, { status: 404 });
    }

    // Cross-tenant validation: if user has a companyId, the record must match
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Chart of account not found' }, { status: 404 });
    }

    // Check if account has active child accounts (scoped by companyId)
    const childWhere: Record<string, unknown> = { parentAccountId: id, isActive: true };
    if (companyId) {
      childWhere.companyId = companyId;
    }
    const activeChildren = await db.chartOfAccount.count({ where: childWhere });
    if (activeChildren > 0) {
      return NextResponse.json(
        { error: `Cannot deactivate: account has ${activeChildren} active child account(s). Remove or reassign children first.` },
        { status: 400 }
      );
    }

    // Check if account has active ledger entries (excluding auto-generated opening balance entries)
    const nonOpeningLedgerCount = await db.ledgerEntry.count({
      where: { accountId: id, isActive: true, reference: { not: `COA-OPENING-${existing.code}` } },
    });
    if (nonOpeningLedgerCount > 0) {
      return NextResponse.json(
        { error: `Cannot deactivate: account has ${nonOpeningLedgerCount} active ledger entries. This account is in active use.` },
        { status: 400 }
      );
    }

    await db.$transaction(async (tx) => {
      // Soft delete the account
      await tx.chartOfAccount.update({ where: { id }, data: { isActive: false } });

      // COA-004: Also soft-delete all opening balance ledger entries for this account:
      // 1. The contra "Opening Balance Equity" entries (reference = COA-OPENING-{code})
      // 2. The account's own opening balance entries (reference = COA-OPENING-{code})
      if (existing.openingBalance > 0) {
        await tx.ledgerEntry.updateMany({
          where: {
            reference: `COA-OPENING-${existing.code}`,
            isActive: true,
          },
          data: { isActive: false },
        });
      }
    });

    // Activity logging — module token "Acc-Chart-Of-Accounts"
    await logUserActivity({
      action: 'DELETE',
      module: 'Acc-Chart-Of-Accounts',
      recordId: id,
      recordLabel: `${existing.code} - ${existing.name}`,
      userId: security.user.id,
      userName: security.user.name,
      details: JSON.stringify({
        softDelete: true,
        code: existing.code,
        name: existing.name,
        classification: existing.classification,
        companyId: companyId || null,
      }),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting chart of account:', error);
    return NextResponse.json(
      { error: 'Failed to delete chart of account' },
      { status: 500 }
    );
  }
}
