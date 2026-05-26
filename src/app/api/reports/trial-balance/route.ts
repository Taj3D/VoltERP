import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

// GET /api/reports/trial-balance - Enhanced with date range, COA classification, opening balances
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Reports', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    // Build date filter
    const dateFilter: Record<string, Date> = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);

    const where: Record<string, unknown> = { isActive: true };
    if (from || to) where.date = dateFilter;

    // Fetch ledger entries with chartOfAccount relation
    const ledgerEntries = await db.ledgerEntry.findMany({
      where,
      include: { chartOfAccount: true },
    });

    // Fetch all COA records for classification lookup AND opening balance seeding
    const coaRecords = await db.chartOfAccount.findMany({
      where: { isActive: true },
    });
    const coaMap = new Map(coaRecords.map((c) => [c.name, c.classification]));

    // Group by account and sum debits/credits
    const accountMap = new Map<
      string,
      {
        account: string;
        classification: string;
        totalDebit: number;
        totalCredit: number;
        openingDebit: number;
        openingCredit: number;
      }
    >();

    // STEP 1: Seed accountMap with COA opening balances
    // Dr opening → add to debit, Cr opening → add to credit
    for (const coa of coaRecords) {
      if (coa.openingBalance > 0) {
        const openDebit = coa.openingBalanceType === 'Dr' ? coa.openingBalance : 0;
        const openCredit = coa.openingBalanceType === 'Cr' ? coa.openingBalance : 0;
        accountMap.set(coa.name, {
          account: coa.name,
          classification: coa.classification,
          totalDebit: openDebit,
          totalCredit: openCredit,
          openingDebit: openDebit,
          openingCredit: openCredit,
        });
      }
    }

    // STEP 2: Add ledger entry totals on top of opening balances
    for (const entry of ledgerEntries) {
      // Determine classification: prefer from COA FK, then from COA name lookup, then default
      let classification = 'Unclassified';
      if (entry.chartOfAccount) {
        classification = entry.chartOfAccount.classification;
      } else if (coaMap.has(entry.account)) {
        classification = coaMap.get(entry.account)!;
      }

      const existing = accountMap.get(entry.account);
      if (existing) {
        existing.totalDebit += entry.debit;
        existing.totalCredit += entry.credit;
      } else {
        accountMap.set(entry.account, {
          account: entry.account,
          classification,
          totalDebit: entry.debit,
          totalCredit: entry.credit,
          openingDebit: 0,
          openingCredit: 0,
        });
      }
    }

    const entries = Array.from(accountMap.values()).sort((a, b) =>
      a.account.localeCompare(b.account)
    );

    // Calculate netBalance per account
    const entriesWithNet = entries.map((e) => ({
      ...e,
      netBalance: e.totalDebit - e.totalCredit,
    }));

    const grandTotalDebit = entries.reduce((sum, e) => sum + e.totalDebit, 0);
    const grandTotalCredit = entries.reduce((sum, e) => sum + e.totalCredit, 0);

    // Group by classification for summary
    const classificationSummary = new Map<
      string,
      { classification: string; totalDebit: number; totalCredit: number }
    >();
    for (const entry of entries) {
      const existing = classificationSummary.get(entry.classification);
      if (existing) {
        existing.totalDebit += entry.totalDebit;
        existing.totalCredit += entry.totalCredit;
      } else {
        classificationSummary.set(entry.classification, {
          classification: entry.classification,
          totalDebit: entry.totalDebit,
          totalCredit: entry.totalCredit,
        });
      }
    }

    // Bar chart data: top accounts by debit/credit
    const chartData = entriesWithNet
      .filter((e) => e.totalDebit > 0 || e.totalCredit > 0)
      .slice(0, 10)
      .map((e) => ({
        account: e.account.length > 15 ? e.account.substring(0, 15) + '…' : e.account,
        debit: e.totalDebit,
        credit: e.totalCredit,
      }));

    // Pie chart data: account balance distribution
    const pieData = entriesWithNet
      .filter((e) => Math.abs(e.netBalance) > 0)
      .map((e) => ({
        name: e.account.length > 20 ? e.account.substring(0, 20) + '…' : e.account,
        value: Math.abs(e.netBalance),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

    return NextResponse.json({
      entries: entriesWithNet,
      classificationSummary: Array.from(classificationSummary.values()),
      grandTotalDebit,
      grandTotalCredit,
      balanced: Math.abs(grandTotalDebit - grandTotalCredit) < 0.01,
      chartData,
      pieData: pieData.map((d, i) => ({ ...d, color: PIE_COLORS[i % PIE_COLORS.length] })),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    });
  } catch (error) {
    console.error('Error generating trial balance:', error);
    return NextResponse.json(
      { error: 'Failed to generate trial balance' },
      { status: 500 }
    );
  }
}
