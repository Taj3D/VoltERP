// ============================================================
// ACCOUNTING UTILITY FUNCTIONS
// Shared helpers for Chart of Accounts & General Ledger
// Stage 12: safeFinancialAdd/Subtract for all aggregations
// ============================================================

import { db } from '@/lib/db';
import { safeFinancialAdd, safeFinancialSubtract, safeFinancialRound } from '@/lib/api-security';

/**
 * COA-001: Detect circular parent references in the COA hierarchy.
 * Walks up the parent chain from `targetParentId` and checks if `accountId`
 * appears anywhere in the ancestry. If so, assigning `targetParentId` as
 * the parent of `accountId` would create a circular loop.
 *
 * @param accountId  - The account being updated (empty string for new accounts)
 * @param targetParentId - The proposed parentAccountId
 * @returns true if circular reference detected, false otherwise
 */
export async function detectCircularParent(
  accountId: string,
  targetParentId: string
): Promise<boolean> {
  // Self-reference: an account cannot be its own parent
  if (accountId && accountId === targetParentId) {
    return true;
  }

  // Walk up the parent chain from the target parent
  let currentId: string | null = targetParentId;
  const visited = new Set<string>();

  while (currentId) {
    // Cycle in the existing tree (shouldn't happen but guard against it)
    if (visited.has(currentId)) {
      return true;
    }
    visited.add(currentId);

    // If we reach the account being updated, it's circular
    if (accountId && currentId === accountId) {
      return true;
    }

    // Look up the parent of the current node
    const node = await db.chartOfAccount.findUnique({
      where: { id: currentId },
      select: { parentAccountId: true },
    });

    if (!node) break;
    currentId = node.parentAccountId;
  }

  return false;
}

/**
 * COA-002: Calculate the dynamic balance for a Chart of Account.
 * Recursively sums:
 *   - Own ledger entries (sum of debits - credits, adjusted by openingBalanceType)
 *   - All child account balances
 *
 * Returns an object with debitTotal, creditTotal, netBalance, and childBalance.
 */
export async function calculateAccountBalance(
  accountId: string,
  visited?: Set<string>,
  companyId?: string | null
): Promise<{
  ownDebit: number;
  ownCredit: number;
  ownNet: number;
  childDebit: number;
  childCredit: number;
  childNet: number;
  totalDebit: number;
  totalCredit: number;
  totalNet: number;
}> {
  // Guard against circular references at computation time
  const visitedSet = visited || new Set<string>();
  if (visitedSet.has(accountId)) {
    return {
      ownDebit: 0, ownCredit: 0, ownNet: 0,
      childDebit: 0, childCredit: 0, childNet: 0,
      totalDebit: 0, totalCredit: 0, totalNet: 0,
    };
  }
  visitedSet.add(accountId);

  // Get the account itself
  const account = await db.chartOfAccount.findUnique({
    where: { id: accountId },
    select: {
      openingBalance: true,
      openingBalanceType: true,
    },
  });

  // Get own ledger entries — STAGE 12: Filter by companyId if provided
  const ledgerWhere: Record<string, unknown> = { accountId, isActive: true };
  if (companyId) ledgerWhere.companyId = companyId;

  const ownEntries = await db.ledgerEntry.aggregate({
    where: ledgerWhere,
    _sum: { debit: true, credit: true },
  });

  const ownDebit = (ownEntries._sum.debit || 0);
  const ownCredit = (ownEntries._sum.credit || 0);
  const openingBalance = account?.openingBalance || 0;
  const openingType = account?.openingBalanceType || 'Dr';

  // Opening balance: Dr adds to debit side, Cr adds to credit side
  // STAGE 12: Use safeFinancialAdd for floating-point safety
  const adjustedOwnDebit = safeFinancialAdd(ownDebit, openingType === 'Dr' ? openingBalance : 0);
  const adjustedOwnCredit = safeFinancialAdd(ownCredit, openingType === 'Cr' ? openingBalance : 0);
  const ownNet = safeFinancialSubtract(adjustedOwnDebit, adjustedOwnCredit);

  // Get child accounts — STAGE 12: Filter by companyId if provided
  const childWhere: Record<string, unknown> = { parentAccountId: accountId, isActive: true };
  if (companyId) childWhere.companyId = companyId;

  const children = await db.chartOfAccount.findMany({
    where: childWhere,
    select: { id: true },
  });

  let childDebit = 0;
  let childCredit = 0;
  let childNet = 0;

  for (const child of children) {
    const childBalance = await calculateAccountBalance(child.id, visitedSet, companyId);
    childDebit = safeFinancialAdd(childDebit, childBalance.totalDebit);
    childCredit = safeFinancialAdd(childCredit, childBalance.totalCredit);
    childNet = safeFinancialAdd(childNet, childBalance.totalNet);
  }

  return {
    ownDebit: adjustedOwnDebit,
    ownCredit: adjustedOwnCredit,
    ownNet,
    childDebit,
    childCredit,
    childNet,
    totalDebit: safeFinancialAdd(adjustedOwnDebit, childDebit),
    totalCredit: safeFinancialAdd(adjustedOwnCredit, childCredit),
    totalNet: safeFinancialAdd(ownNet, childNet),
  };
}

/**
 * COA-003: Generate the next sequential code for a given prefix pattern.
 * Finds the latest code matching the pattern (e.g., COA-XXXXX) and increments.
 * This avoids duplicates that occur with count+1 when records are deleted.
 *
 * @param model - The Prisma model to query
 * @param prefix - The code prefix (e.g., 'COA-', 'LED-')
 * @returns The next sequential code string
 */
export async function generateNextCode(
  model: 'chartOfAccount' | 'ledgerEntry' | 'periodClose' | 'journalVoucher',
  prefix: string
): Promise<string> {
  // Map model names to their code fields and db accessors
  const modelConfig: Record<string, { codeField: string; dbModel: string }> = {
    chartOfAccount: { codeField: 'code', dbModel: 'chartOfAccount' },
    ledgerEntry: { codeField: 'entryCode', dbModel: 'ledgerEntry' },
    periodClose: { codeField: 'code', dbModel: 'periodClose' },
    journalVoucher: { codeField: 'voucherNo', dbModel: 'journalVoucher' },
  };

  const config = modelConfig[model];
  if (!config) {
    return `${prefix}00001`;
  }

  const { codeField, dbModel } = config;
  const latestRecord = await (db as any)[dbModel].findFirst({
    where: { [codeField]: { startsWith: prefix } },
    orderBy: { [codeField]: 'desc' },
    select: { [codeField]: true },
  });

  if (!latestRecord) {
    return `${prefix}00001`;
  }

  // Extract the numeric portion after the prefix
  const numericPart = latestRecord[codeField].replace(prefix, '');
  const lastNumber = parseInt(numericPart, 10) || 0;
  const nextNumber = lastNumber + 1;

  return `${prefix}${String(nextNumber).padStart(5, '0')}`;
}

/**
 * LED-001: Verify that total debits equal total credits across
 * all active ledger entries, optionally filtered by date range or reference.
 *
 * @param filters - Optional date range and reference filters
 * @returns Verification result with debit total, credit total, and balance status
 */
export async function verifyLedgerBalance(filters?: {
  from?: string;
  to?: string;
  reference?: string;
  referenceType?: string;
  companyId?: string | null;
}): Promise<{
  balanced: boolean;
  totalDebit: number;
  totalCredit: number;
  difference: number;
  entryCount: number;
}> {
  const where: Record<string, unknown> = { isActive: true };

  // STAGE 12: Multi-tenant isolation — filter by companyId
  if (filters?.companyId) {
    where.companyId = filters.companyId;
  }

  if (filters?.from || filters?.to) {
    const dateFilter: Record<string, Date> = {};
    if (filters.from) dateFilter.gte = new Date(filters.from);
    if (filters.to) dateFilter.lte = new Date(filters.to);
    where.date = dateFilter;
  }

  if (filters?.reference) {
    where.reference = filters.reference;
  }

  if (filters?.referenceType) {
    where.referenceType = filters.referenceType;
  }

  const [aggregateResult, countResult] = await Promise.all([
    db.ledgerEntry.aggregate({
      where,
      _sum: { debit: true, credit: true },
    }),
    db.ledgerEntry.count({ where }),
  ]);

  const totalDebit = aggregateResult._sum.debit || 0;
  const totalCredit = aggregateResult._sum.credit || 0;
  // STAGE 12: Use safeFinancialSubtract for floating-point-safe difference
  const difference = Math.abs(safeFinancialSubtract(totalDebit, totalCredit));

  return {
    balanced: safeFinancialRound(difference) < 0.01, // Allow floating-point tolerance
    totalDebit: safeFinancialRound(totalDebit),
    totalCredit: safeFinancialRound(totalCredit),
    difference: safeFinancialRound(difference),
    entryCount: countResult,
  };
}
