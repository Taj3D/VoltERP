import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  validateVatMode,
  maskAccountingReportForVatAuditor,
  safeFinancialAdd,
  safeFinancialSubtract,
  safeFinancialRound,
  formatFinancialField,
} from '@/lib/api-security';
import type { UserRole } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// GET /api/reports/trial-balance - Phase 14: COA-driven synthesis, fiscal year interlock, accounting equation enforcement
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'TrialBalance', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    // STAGE 12: VAT Auditor mode validation
    const rawVatMode = searchParams.get('vatMode') === 'true';
    const userRole = security.user.role as UserRole;
    const vatMode = validateVatMode(rawVatMode, userRole);

    // STAGE 12: Multi-tenant companyId isolation
    const companyId = security.user.companyId;

    // Build date filter
    const dateFilter: Record<string, Date> = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);

    const where: Record<string, unknown> = { isActive: true };
    if (companyId) where.companyId = companyId;
    if (from || to) where.date = dateFilter;

    // Fetch ledger entries with chartOfAccount relation
    const ledgerEntries = await db.ledgerEntry.findMany({
      where,
      include: { chartOfAccount: true },
    });

    // Fetch all COA records for classification lookup AND opening balance seeding
    // STAGE 12: Filter by companyId
    const coaWhere: Record<string, unknown> = { isActive: true };
    if (companyId) coaWhere.companyId = companyId;

    const coaRecords = await db.chartOfAccount.findMany({
      where: coaWhere,
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
    // STAGE 12: Use safeFinancialAdd for all accumulation
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
        existing.totalDebit = safeFinancialAdd(existing.totalDebit, entry.debit);
        existing.totalCredit = safeFinancialAdd(existing.totalCredit, entry.credit);
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

    // STAGE 12: Calculate netBalance per account with safe math
    const entriesWithNet = entries.map((e) => ({
      ...e,
      netBalance: safeFinancialSubtract(e.totalDebit, e.totalCredit),
    }));

    // STAGE 12: Use safeFinancialAdd for grand total accumulation
    let grandTotalDebit = 0;
    let grandTotalCredit = 0;
    for (const e of entries) {
      grandTotalDebit = safeFinancialAdd(grandTotalDebit, e.totalDebit);
      grandTotalCredit = safeFinancialAdd(grandTotalCredit, e.totalCredit);
    }

    // STAGE 12: Trial Balance Integrity — verify grandTotalDebit identically matches grandTotalCredit
    grandTotalDebit = safeFinancialRound(grandTotalDebit);
    grandTotalCredit = safeFinancialRound(grandTotalCredit);
    const balanced = safeFinancialSubtract(grandTotalDebit, grandTotalCredit) === 0;

    // PHASE 14: Accounting equation check — if debits ≠ credits, include integrityWarning
    const equationImbalance = safeFinancialSubtract(grandTotalDebit, grandTotalCredit);
    const integrityWarning =
      Math.abs(equationImbalance) >= 0.01
        ? {
            message: 'Trial Balance integrity check failed: Total Debits ≠ Total Credits',
            totalDebits: grandTotalDebit,
            totalCredits: grandTotalCredit,
            imbalance: equationImbalance,
          }
        : undefined;

    // Group by classification for summary
    // STAGE 12: Use safeFinancialAdd for classification summary accumulation
    const classificationSummary = new Map<
      string,
      { classification: string; totalDebit: number; totalCredit: number }
    >();
    for (const entry of entries) {
      const existing = classificationSummary.get(entry.classification);
      if (existing) {
        existing.totalDebit = safeFinancialAdd(existing.totalDebit, entry.totalDebit);
        existing.totalCredit = safeFinancialAdd(existing.totalCredit, entry.totalCredit);
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

    // STAGE 12: Apply formatFinancialField to null/undefined reference fields
    const formattedEntries = entriesWithNet.map((e) => ({
      ...e,
      account: formatFinancialField(e.account),
      classification: formatFinancialField(e.classification),
    }));

    // ─────────────────────────────────────────────────────────
    // PHASE 14: Fiscal Year Period Interlock
    // Check if the query date range falls within any CLOSED fiscal years
    // ─────────────────────────────────────────────────────────
    const fiscalYearWhere: Record<string, unknown> = { isActive: true, status: 'CLOSED' };
    if (companyId) fiscalYearWhere.companyId = companyId;

    const closedFiscalYears = await db.fiscalYear.findMany({
      where: fiscalYearWhere,
      orderBy: { startDate: 'asc' },
    });

    const fiscalYearStatus: Array<{
      id: string;
      name: string;
      startDate: string;
      endDate: string;
      status: string;
      closedAt: string | null;
    }> = [];

    const queryStartDate = from ? new Date(from) : null;
    const queryEndDate = to ? new Date(to) : null;

    for (const fy of closedFiscalYears) {
      // Check if query range overlaps with this closed fiscal year
      const fyStart = new Date(fy.startDate);
      const fyEnd = new Date(fy.endDate);
      let overlaps = false;

      if (queryStartDate && queryEndDate) {
        // Query range overlaps FY if: queryStart <= fyEnd && queryEnd >= fyStart
        overlaps = queryStartDate <= fyEnd && queryEndDate >= fyStart;
      } else if (queryStartDate) {
        // Only start date — check if it falls within this FY
        overlaps = queryStartDate >= fyStart && queryStartDate <= fyEnd;
      } else if (queryEndDate) {
        // Only end date — check if it falls within this FY
        overlaps = queryEndDate >= fyStart && queryEndDate <= fyEnd;
      } else {
        // No date filter — all closed FYs are relevant
        overlaps = true;
      }

      if (overlaps) {
        fiscalYearStatus.push({
          id: fy.id,
          name: fy.name,
          startDate: fy.startDate.toISOString(),
          endDate: fy.endDate.toISOString(),
          status: fy.status,
          closedAt: fy.closedAt ? fy.closedAt.toISOString() : null,
        });
      }
    }

    // ─────────────────────────────────────────────────────────
    // PHASE 14: COA-Driven Synthesis
    // Direct read from ChartOfAccount.currentBalance for real-time cross-check
    // ─────────────────────────────────────────────────────────
    const coaBasedEntries = coaRecords.map((coa) => ({
      code: coa.code,
      name: coa.name,
      classification: coa.classification,
      currentBalance: coa.currentBalance,
      openingBalance: coa.openingBalance,
      openingBalanceType: coa.openingBalanceType,
    }));

    // Build response data
    const responseData: Record<string, unknown> = {
      entries: formattedEntries,
      classificationSummary: Array.from(classificationSummary.values()).map((cs) => ({
        ...cs,
        classification: formatFinancialField(cs.classification),
      })),
      grandTotalDebit,
      grandTotalCredit,
      balanced,
      chartData,
      pieData: pieData.map((d, i) => ({ ...d, color: PIE_COLORS[i % PIE_COLORS.length] })),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      // PHASE 14 additions
      fiscalYearStatus,
      coaBasedEntries,
      ...(integrityWarning ? { integrityWarning } : {}),
    };

    // STAGE 12: Apply VAT Auditor deep masking
    if (vatMode) {
      const masked = maskAccountingReportForVatAuditor(responseData, userRole);
      return NextResponse.json(masked);
    }

    // PHASE 14: Activity logging with updated module token
    await logUserActivity({
      action: 'EXPORT',
      module: 'Fin-Statements-Core',
      userId: security.user.id,
      userName: security.user.name,
      details: 'Trial Balance report generated',
    });

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Error generating trial balance:', error);
    return NextResponse.json(
      { error: 'Failed to generate trial balance' },
      { status: 500 }
    );
  }
}
