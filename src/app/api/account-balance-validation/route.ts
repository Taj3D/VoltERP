// ============================================================
// Account Balance Validation API — Double-Entry Integrity Check
// Ensures total debits equal total credits across all ledger entries
// Module Token: Fin-Balance-Validation
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity, safeFinancialRound, safeFinancialAdd } from '@/lib/api-security';

// GET /api/account-balance-validation — Verify double-entry integrity
// Query params: dateFrom, dateTo, companyId, referenceType
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'AccountBalanceValidation', 'GET');
  if (!security.authorized) return security.response;

  const { role, companyId } = security.user;

  try {
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const referenceType = searchParams.get('referenceType');

    // Build where clause
    const whereClause: Record<string, unknown> = {
      isActive: true,
      ...(companyId ? { companyId } : {}),
      ...(referenceType ? { referenceType } : {}),
    };

    if (dateFrom || dateTo) {
      whereClause.date = {};
      if (dateFrom) (whereClause.date as Record<string, unknown>).gte = new Date(dateFrom);
      if (dateTo) (whereClause.date as Record<string, unknown>).lte = new Date(dateTo);
    }

    // Fetch all matching ledger entries
    const entries = await db.ledgerEntry.findMany({
      where: whereClause,
      select: {
        debit: true,
        credit: true,
        referenceType: true,
        reference: true,
      },
      orderBy: { date: 'asc' },
    });

    // Fetch COA opening balances to include in the balance check
    // (Trial Balance includes opening balances, so this check should too)
    const coaWhere: Record<string, unknown> = { isActive: true };
    if (companyId) coaWhere.companyId = companyId;

    const coaRecords = await db.chartOfAccount.findMany({
      where: coaWhere,
      select: { openingBalance: true, openingBalanceType: true },
    });

    // Aggregate totals
    let totalDebits = 0;
    let totalCredits = 0;

    // Add COA opening balances first (Dr → debit, Cr → credit)
    for (const coa of coaRecords) {
      if (coa.openingBalance > 0) {
        if (coa.openingBalanceType === 'Dr') {
          totalDebits = safeFinancialAdd(totalDebits, coa.openingBalance);
        } else {
          totalCredits = safeFinancialAdd(totalCredits, coa.openingBalance);
        }
      }
    }

    // Per referenceType breakdown
    const typeBreakdown: Record<string, { count: number; totalDebit: number; totalCredit: number; difference: number; isBalanced: boolean }> = {};

    for (const entry of entries) {
      totalDebits = safeFinancialAdd(totalDebits, entry.debit || 0);
      totalCredits = safeFinancialAdd(totalCredits, entry.credit || 0);

      const rt = entry.referenceType || 'Unknown';
      if (!typeBreakdown[rt]) {
        typeBreakdown[rt] = { count: 0, totalDebit: 0, totalCredit: 0, difference: 0, isBalanced: false };
      }
      typeBreakdown[rt].count++;
      typeBreakdown[rt].totalDebit = safeFinancialAdd(typeBreakdown[rt].totalDebit, entry.debit || 0);
      typeBreakdown[rt].totalCredit = safeFinancialAdd(typeBreakdown[rt].totalCredit, entry.credit || 0);
    }

    // Compute differences
    const difference = safeFinancialRound(totalDebits - totalCredits);
    const isBalanced = Math.abs(difference) < 0.01;

    // Compute per-type differences
    for (const rt of Object.keys(typeBreakdown)) {
      const bd = typeBreakdown[rt];
      bd.difference = safeFinancialRound(bd.totalDebit - bd.totalCredit);
      bd.isBalanced = Math.abs(bd.difference) < 0.01;
    }

    const result = {
      isBalanced,
      totalDebits: safeFinancialRound(totalDebits),
      totalCredits: safeFinancialRound(totalCredits),
      difference,
      entryCount: entries.length,
      typeBreakdown,
      checkedAt: new Date().toISOString(),
      filters: {
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        referenceType: referenceType || null,
        companyId: companyId || null,
      },
    };

    // VAT Auditor masking
    if (role === 'vat_auditor') {
      return NextResponse.json({
        ...result,
        totalDebits: 'N/A (Audit Mode)',
        totalCredits: 'N/A (Audit Mode)',
        difference: 'N/A (Audit Mode)',
        typeBreakdown: Object.fromEntries(
          Object.entries(typeBreakdown).map(([k, v]) => [k, {
            ...v,
            totalDebit: 'N/A (Audit Mode)',
            totalCredit: 'N/A (Audit Mode)',
            difference: 'N/A (Audit Mode)',
          }])
        ),
        vatAuditMode: true,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error validating account balance:', error);
    return NextResponse.json(
      { error: 'Failed to validate account balance' },
      { status: 500 }
    );
  }
}
