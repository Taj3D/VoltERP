// ============================================================
// COA ACCOUNTS SEED — Phase 13
// Creates the 5 root Chart of Accounts nodes:
//   Assets, Liabilities, Equity, Revenue, Expenses
// Each with isRoot: true and parentId: null.
// Admin-only endpoint — uses withApiSecurity for RBAC.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';
import { db } from '@/lib/db';

/**
 * Root COA node definitions.
 * Each entry defines the code, name, and classification for a root COA node.
 * These are the top-level accounts in the Chart of Accounts hierarchy.
 */
const ROOT_COA_NODES = [
  {
    code: 'COA-ROOT-ASSET',
    name: 'Assets',
    classification: 'Asset',
    openingBalance: 0,
    openingBalanceType: 'Dr',
  },
  {
    code: 'COA-ROOT-LIABILITY',
    name: 'Liabilities',
    classification: 'Liability',
    openingBalance: 0,
    openingBalanceType: 'Cr',
  },
  {
    code: 'COA-ROOT-EQUITY',
    name: 'Equity',
    classification: 'Equity',
    openingBalance: 0,
    openingBalanceType: 'Cr',
  },
  {
    code: 'COA-ROOT-REVENUE',
    name: 'Revenue',
    classification: 'Revenue',
    openingBalance: 0,
    openingBalanceType: 'Cr',
  },
  {
    code: 'COA-ROOT-EXPENSE',
    name: 'Expenses',
    classification: 'Expense',
    openingBalance: 0,
    openingBalanceType: 'Dr',
  },
] as const;

// POST /api/coa-accounts-seed - Seed the 5 root COA nodes (admin-only)
export async function POST(request: NextRequest) {
  // RBAC: admin-only
  const security = await withApiSecurity(request, 'COAAccountsSeed', 'POST');
  if (!security.authorized) return security.response;

  // Only admin can seed root COA nodes
  if (security.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Access denied. Only Administrators can seed root Chart of Accounts nodes.' },
      { status: 403 }
    );
  }

  const companyId = security.user.companyId;

  try {
    const results: Array<{
      code: string;
      name: string;
      classification: string;
      isRoot: boolean;
      status: 'created' | 'already_exists';
      id?: string;
    }> = [];

    // Use $transaction for atomic creation
    await db.$transaction(async (tx) => {
      for (const node of ROOT_COA_NODES) {
        // Check if COA node already exists by unique code
        // If companyId is set, also scope the check to the same company
        const existingWhere: Record<string, unknown> = { code: node.code };
        if (companyId) {
          existingWhere.companyId = companyId;
        }

        const existing = await tx.chartOfAccount.findFirst({
          where: existingWhere,
          select: { id: true, code: true, name: true, classification: true, isRoot: true },
        });

        if (existing) {
          results.push({
            code: existing.code,
            name: existing.name,
            classification: existing.classification,
            isRoot: existing.isRoot,
            status: 'already_exists',
            id: existing.id,
          });
        } else {
          const created = await tx.chartOfAccount.create({
            data: {
              code: node.code,
              name: node.name,
              classification: node.classification,
              openingBalance: node.openingBalance,
              openingBalanceType: node.openingBalanceType,
              isRoot: true,
              parentAccountId: null,
              isActive: true,
              companyId: companyId || null,
            },
            select: { id: true, code: true, name: true, classification: true, isRoot: true },
          });

          results.push({
            code: created.code,
            name: created.name,
            classification: created.classification,
            isRoot: created.isRoot,
            status: 'created',
            id: created.id,
          });
        }
      }
    });

    const createdCount = results.filter((r) => r.status === 'created').length;
    const existingCount = results.filter((r) => r.status === 'already_exists').length;

    // Activity logging
    await logUserActivity({
      action: 'CREATE',
      module: 'Fin-Accounts-Core',
      recordLabel: 'COA-ROOT-SEED',
      userId: security.user.id,
      userName: security.user.name,
      details: JSON.stringify({
        action: 'coa_accounts_seed',
        createdCount,
        existingCount,
        companyId: companyId || null,
      }),
    });

    return NextResponse.json({
      message: `COA root seed complete: ${createdCount} created, ${existingCount} already existed`,
      nodes: results,
    });
  } catch (error) {
    console.error('[COA-ACCOUNTS-SEED] Error seeding root COA nodes:', error);
    return NextResponse.json(
      {
        error: 'Failed to seed root Chart of Accounts nodes',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
