import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity } from '@/lib/api-security';
import { detectCircularParent, calculateAccountBalance } from '@/lib/accounting-utils';

// GET /api/chart-of-accounts/[id]
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'ChartOfAccounts', 'GET');
  if (!security.authorized) return security.response;
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
    if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // COA-002: Attach dynamic sub-balance
    const balance = await calculateAccountBalance(account.id);
    const accountWithBalance = {
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

    return NextResponse.json(accountWithBalance);
  } catch (error) {
    console.error('Error fetching chart of account:', error);
    return NextResponse.json({ error: 'Failed to fetch chart of account' }, { status: 500 });
  }
}

// PUT /api/chart-of-accounts/[id]
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'ChartOfAccounts', 'PUT');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, classification, parentAccountId, openingBalance, openingBalanceType, isActive } = body;

    const existing = await db.chartOfAccount.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // COA-001: Circular parent detection on parentAccountId change
    if (parentAccountId !== undefined && parentAccountId) {
      // Self-reference check: cannot set parent to self
      if (parentAccountId === id) {
        return NextResponse.json(
          { error: 'Circular parent reference: an account cannot be its own parent.' },
          { status: 400 }
        );
      }

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

      // Walk up the parent chain to detect circular reference
      const isCircular = await detectCircularParent(id, parentAccountId);
      if (isCircular) {
        return NextResponse.json(
          { error: 'Circular parent reference detected. Assigning this parent would create a loop in the account hierarchy.' },
          { status: 400 }
        );
      }
    }

    const result = await db.$transaction(async (tx) => {
      const account = await tx.chartOfAccount.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(classification !== undefined && { classification }),
          ...(parentAccountId !== undefined && { parentAccountId: parentAccountId || null }),
          ...(openingBalance !== undefined && { openingBalance }),
          ...(openingBalanceType !== undefined && { openingBalanceType }),
          ...(isActive !== undefined && { isActive }),
        },
        include: {
          parentAccount: true,
          childAccounts: true,
          _count: { select: { childAccounts: true, ledgerEntries: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'ChartOfAccounts',
          recordId: account.id,
          recordLabel: `${account.code} - ${account.name}`,
          details: JSON.stringify(body),
        },
      });

      return account;
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating chart of account:', error);
    return NextResponse.json({ error: 'Failed to update chart of account' }, { status: 500 });
  }
}

// DELETE /api/chart-of-accounts/[id]
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'ChartOfAccounts', 'DELETE');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const existing = await db.chartOfAccount.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Check if account has active child accounts
    const activeChildren = await db.chartOfAccount.count({
      where: { parentAccountId: id, isActive: true },
    });
    if (activeChildren > 0) {
      return NextResponse.json(
        { error: `Cannot deactivate: account has ${activeChildren} active child account(s). Remove or reassign children first.` },
        { status: 400 }
      );
    }

    await db.$transaction(async (tx) => {
      await tx.chartOfAccount.update({ where: { id }, data: { isActive: false } });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'ChartOfAccounts',
          recordId: id,
          recordLabel: `${existing.code} - ${existing.name}`,
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting chart of account:', error);
    return NextResponse.json({ error: 'Failed to delete chart of account' }, { status: 500 });
  }
}
