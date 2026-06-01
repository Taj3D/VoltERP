// ============================================================
// COA LOGISTICS SEED — Phase 12
// Creates logistics-specific Chart of Accounts nodes required for:
//   - In-transit valuation state machine (COA-INV-TRANSIT)
//   - Damage write-off double-entry (COA-INV-LOSS)
//   - Inventory asset tracking (COA-INV-ASSET)
// Admin-only endpoint — uses withApiSecurity for RBAC.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';
import { db } from '@/lib/db';

/**
 * Logistics COA node definitions.
 * Each entry defines the code, name, and classification for a COA node
 * that the intransit valuation state machine and damage write-off
 * double-entry journal depends on.
 */
const LOGISTICS_COA_NODES = [
  {
    code: 'COA-INV-ASSET',
    name: 'Inventory Asset',
    classification: 'Asset',
    openingBalance: 0,
    openingBalanceType: 'Dr',
  },
  {
    code: 'COA-INV-TRANSIT',
    name: 'Inventory In-Transit',
    classification: 'Asset',
    openingBalance: 0,
    openingBalanceType: 'Dr',
  },
  {
    code: 'COA-INV-LOSS',
    name: 'Inventory Loss / Wastage',
    classification: 'Expense',
    openingBalance: 0,
    openingBalanceType: 'Dr',
  },
] as const;

export async function POST(request: NextRequest) {
  // ── RBAC: admin-only ──
  const security = await withApiSecurity(request, 'ChartOfAccounts', 'POST');
  if (!security.authorized) return security.response;

  // Only admin can seed logistics COA nodes
  if (security.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Access denied. Only Administrators can seed logistics Chart of Accounts nodes.' },
      { status: 403 }
    );
  }

  try {
    const results: Array<{
      code: string;
      name: string;
      classification: string;
      status: 'created' | 'already_exists';
      id?: string;
    }> = [];

    for (const node of LOGISTICS_COA_NODES) {
      // Check if COA node already exists by unique code
      const existing = await db.chartOfAccount.findUnique({
        where: { code: node.code },
        select: { id: true, code: true, name: true, classification: true },
      });

      if (existing) {
        results.push({
          code: existing.code,
          name: existing.name,
          classification: existing.classification,
          status: 'already_exists',
          id: existing.id,
        });
      } else {
        const created = await db.chartOfAccount.create({
          data: {
            code: node.code,
            name: node.name,
            classification: node.classification,
            openingBalance: node.openingBalance,
            openingBalanceType: node.openingBalanceType,
            isActive: true,
          },
          select: { id: true, code: true, name: true, classification: true },
        });

        results.push({
          code: created.code,
          name: created.name,
          classification: created.classification,
          status: 'created',
          id: created.id,
        });
      }
    }

    const createdCount = results.filter((r) => r.status === 'created').length;
    const existingCount = results.filter((r) => r.status === 'already_exists').length;

    return NextResponse.json({
      message: `Logistics COA seed complete: ${createdCount} created, ${existingCount} already existed`,
      nodes: results,
    });
  } catch (error) {
    console.error('[COA-LOGISTICS-SEED] Error seeding logistics COA nodes:', error);
    return NextResponse.json(
      {
        error: 'Failed to seed logistics Chart of Accounts nodes',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
