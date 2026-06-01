// ============================================================
// CONSOLIDATED STATEMENT ENGINE
// GET  /api/consolidation/statements — Generate consolidated financial statements
// POST /api/consolidation/statements — Save consolidation log
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  safeFinancialRound,
  safeFinancialAdd,
  safeFinancialSubtract,
  type UserRole,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

interface BranchFinancials {
  branchId: string;
  branchName: string;
  revenue: number;
  cogs: number;
  expenses: number;
  assets: number;
  liabilities: number;
}

interface EliminationEntry {
  description: string;
  amount: number;
}

interface ConsolidatedResult {
  totalRevenue: number;
  totalCOGS: number;
  totalExpenses: number;
  totalAssets: number;
  totalLiabilities: number;
  eliminationAmount: number;
  netRevenue: number;
  grossProfit: number;
  grossProfitMargin: number;
  netProfit: number;
  netProfitMargin: number;
}

/**
 * Compute branch-level financials for a given branch within a fiscal period.
 */
async function computeBranchFinancials(
  branchId: string,
  periodStart: Date,
  periodEnd: Date,
  companyId: string
): Promise<BranchFinancials> {
  const branch = await db.branch.findUnique({
    where: { id: branchId },
    select: { id: true, name: true },
  });

  const branchName = branch?.name || 'Unknown Branch';

  // Get branch godowns
  const branchGodowns = await db.godown.findMany({
    where: { branchId, isActive: true },
    select: { id: true },
  });
  const branchGodownIds = branchGodowns.map((g) => g.id);

  // Revenue: Sales Orders + POS Sales for this branch's godowns
  const salesOrders = await db.salesOrder.findMany({
    where: {
      companyId,
      isActive: true,
      status: { in: ['Confirmed', 'Delivered'] },
      date: { gte: periodStart, lte: periodEnd },
      ...(branchGodownIds.length > 0 ? { godownId: { in: branchGodownIds } } : {}),
    },
    select: { grandTotal: true },
  });

  const posSales = await db.posSale.findMany({
    where: {
      companyId,
      isActive: true,
      status: { in: ['Completed', 'Refunded'] },
      date: { gte: periodStart, lte: periodEnd },
      ...(branchGodownIds.length > 0 ? { godownId: { in: branchGodownIds } } : {}),
    },
    select: { grandTotal: true },
  });

  const revenue = safeFinancialRound(
    [...salesOrders, ...posSales].reduce(
      (sum, order) => safeFinancialAdd(sum, order.grandTotal || 0),
      0
    )
  );

  // COGS: Stock entries OUT for sales in the period from branch godowns
  const stockOutEntries = await db.stockEntry.findMany({
    where: {
      companyId,
      isActive: true,
      type: 'OUT',
      date: { gte: periodStart, lte: periodEnd },
      referenceType: { in: ['SalesOrder', 'PosSale'] },
      ...(branchGodownIds.length > 0 ? { godownId: { in: branchGodownIds } } : {}),
    },
    select: { totalCost: true },
  });

  const cogs = safeFinancialRound(
    stockOutEntries.reduce(
      (sum, entry) => safeFinancialAdd(sum, entry.totalCost || 0),
      0
    )
  );

  // Operating Expenses for this branch
  const expenses = await db.expense.findMany({
    where: {
      companyId,
      isActive: true,
      date: { gte: periodStart, lte: periodEnd },
    },
    select: { amount: true },
  });

  const totalExpenses = safeFinancialRound(
    expenses.reduce(
      (sum, exp) => safeFinancialAdd(sum, exp.amount || 0),
      0
    )
  );

  // Assets: Inventory Valuation + Bank Balances for branch godowns
  let inventoryValue = 0;
  if (branchGodownIds.length > 0) {
    const productStocks = await db.productStock.findMany({
      where: {
        isActive: true,
        godownId: { in: branchGodownIds },
      },
      select: { totalValue: true },
    });
    inventoryValue = safeFinancialRound(
      productStocks.reduce(
        (sum, ps) => safeFinancialAdd(sum, ps.totalValue || 0),
        0
      )
    );
  }

  // Bank balances (company-wide since banks are not branch-specific in current schema)
  const banks = await db.bank.findMany({
    where: { companyId, isActive: true },
    select: { currentBalance: true },
  });
  const bankBalance = safeFinancialRound(
    banks.reduce(
      (sum, b) => safeFinancialAdd(sum, b.currentBalance || 0),
      0
    )
  );

  const totalAssets = safeFinancialAdd(inventoryValue, bankBalance);

  // Liabilities: AR + AP
  // Accounts Receivable (customers with Dr balance)
  const customers = await db.customer.findMany({
    where: { companyId, isActive: true },
    select: { openingBalance: true, openingBalanceType: true },
  });
  const ar = safeFinancialRound(
    customers
      .filter((c) => c.openingBalanceType === 'Dr')
      .reduce((sum, c) => safeFinancialAdd(sum, c.openingBalance || 0), 0)
  );

  // Accounts Payable (suppliers with Cr balance)
  const suppliers = await db.supplier.findMany({
    where: { companyId, isActive: true },
    select: { openingBalance: true, openingBalanceType: true },
  });
  const ap = safeFinancialRound(
    suppliers
      .filter((s) => s.openingBalanceType === 'Cr')
      .reduce((sum, s) => safeFinancialAdd(sum, s.openingBalance || 0), 0)
  );

  const totalLiabilities = safeFinancialAdd(ar, ap);

  return {
    branchId,
    branchName,
    revenue,
    cogs,
    expenses: totalExpenses,
    assets: totalAssets,
    liabilities: totalLiabilities,
  };
}

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'AccountingReports', 'GET');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  if (!companyId) {
    return NextResponse.json(
      { error: 'Company ID is required.' },
      { status: 400 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // "TrialBalance" | "ProfitAndLoss" | "BalanceSheet"
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const branchIdsParam = searchParams.get('branchIds');

    if (!type || !['TrialBalance', 'ProfitAndLoss', 'BalanceSheet'].includes(type)) {
      return NextResponse.json(
        { error: 'Statement type must be one of: TrialBalance, ProfitAndLoss, BalanceSheet' },
        { status: 400 }
      );
    }

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'startDate and endDate are required query parameters.' },
        { status: 400 }
      );
    }

    const periodStart = new Date(startDate);
    const periodEnd = new Date(endDate);

    if (isNaN(periodStart.getTime()) || isNaN(periodEnd.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date format for startDate or endDate.' },
        { status: 400 }
      );
    }

    // Get branches to include
    const allBranches = await db.branch.findMany({
      where: { companyId, isActive: true },
      select: { id: true, name: true, status: true },
    });

    // Determine included branch IDs
    let includedBranchIds: string[];
    if (branchIdsParam) {
      includedBranchIds = branchIdsParam.split(',').filter((id) =>
        allBranches.some((b) => b.id === id)
      );
    } else {
      // Default: all active branches
      includedBranchIds = allBranches.map((b) => b.id);
    }

    // Identify suspended branches (excluded from consolidation)
    const suspendedBranches = allBranches
      .filter((b) => b.status === 'SUSPENDED' && includedBranchIds.includes(b.id))
      .map((b) => b.id);

    // Only include non-suspended branches
    const activeIncludedBranchIds = includedBranchIds.filter(
      (id) => !suspendedBranches.includes(id)
    );

    // 1. Compute branch-level financials
    const branchFinancials: BranchFinancials[] = [];
    for (const branchId of activeIncludedBranchIds) {
      const financials = await computeBranchFinancials(
        branchId,
        periodStart,
        periodEnd,
        companyId
      );
      branchFinancials.push(financials);
    }

    // 2. Identify inter-branch elimination entries
    const completedTransfers = await db.interBranchTransfer.findMany({
      where: {
        companyId,
        isActive: true,
        status: 'Completed',
        createdAt: { gte: periodStart, lte: periodEnd },
        fromBranchId: { in: activeIncludedBranchIds },
        toBranchId: { in: activeIncludedBranchIds },
      },
      include: {
        fromBranch: { select: { name: true } },
        toBranch: { select: { name: true } },
      },
    });

    const eliminations: EliminationEntry[] = [];
    let totalEliminationAmount = 0;

    for (const transfer of completedTransfers) {
      const eliminationAmount =
        transfer.transferType === 'STOCK'
          ? transfer.totalValue
          : transfer.fundAmount;

      eliminations.push({
        description: `Inter-Branch Transfer from ${transfer.fromBranch.name} to ${transfer.toBranch.name} (${transfer.transferNo})`,
        amount: safeFinancialRound(eliminationAmount),
      });

      totalEliminationAmount = safeFinancialAdd(totalEliminationAmount, eliminationAmount);
    }

    // 3. Compute consolidated totals
    const totalRevenue = branchFinancials.reduce(
      (sum, b) => safeFinancialAdd(sum, b.revenue), 0
    );
    const totalCOGS = branchFinancials.reduce(
      (sum, b) => safeFinancialAdd(sum, b.cogs), 0
    );
    const totalExpenses = branchFinancials.reduce(
      (sum, b) => safeFinancialAdd(sum, b.expenses), 0
    );
    const totalAssets = branchFinancials.reduce(
      (sum, b) => safeFinancialAdd(sum, b.assets), 0
    );
    const totalLiabilities = branchFinancials.reduce(
      (sum, b) => safeFinancialAdd(sum, b.liabilities), 0
    );

    // Subtract elimination amounts (to prevent double-counting)
    const netRevenue = safeFinancialSubtract(totalRevenue, totalEliminationAmount);
    const grossProfit = safeFinancialSubtract(netRevenue, totalCOGS);
    const grossProfitMargin = netRevenue > 0 ? safeFinancialRound((grossProfit / netRevenue) * 100) : 0;
    const netProfit = safeFinancialSubtract(grossProfit, totalExpenses);
    const netProfitMargin = netRevenue > 0 ? safeFinancialRound((netProfit / netRevenue) * 100) : 0;

    const consolidated: ConsolidatedResult = {
      totalRevenue: safeFinancialRound(totalRevenue),
      totalCOGS: safeFinancialRound(totalCOGS),
      totalExpenses: safeFinancialRound(totalExpenses),
      totalAssets: safeFinancialRound(totalAssets),
      totalLiabilities: safeFinancialRound(totalLiabilities),
      eliminationAmount: safeFinancialRound(totalEliminationAmount),
      netRevenue: safeFinancialRound(netRevenue),
      grossProfit: safeFinancialRound(grossProfit),
      grossProfitMargin: safeFinancialRound(grossProfitMargin),
      netProfit: safeFinancialRound(netProfit),
      netProfitMargin: safeFinancialRound(netProfitMargin),
    };

    // Return structured response
    return NextResponse.json({
      type,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      branches: branchFinancials,
      eliminations,
      consolidated,
      suspendedBranches,
    });
  } catch (error) {
    console.error('[Consolidation GET] Error:', error);
    return NextResponse.json({ error: 'Failed to generate consolidated statement' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'AccountingReports', 'POST');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  if (!companyId) {
    return NextResponse.json(
      { error: 'Company ID is required.' },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();

    if (!body.statementType || !['TrialBalance', 'ProfitAndLoss', 'BalanceSheet'].includes(body.statementType)) {
      return NextResponse.json(
        { error: 'statementType must be one of: TrialBalance, ProfitAndLoss, BalanceSheet' },
        { status: 400 }
      );
    }

    if (!body.periodStart || !body.periodEnd) {
      return NextResponse.json(
        { error: 'periodStart and periodEnd are required.' },
        { status: 400 }
      );
    }

    if (!body.branchIds || !Array.isArray(body.branchIds) || body.branchIds.length === 0) {
      return NextResponse.json(
        { error: 'branchIds must be a non-empty array.' },
        { status: 400 }
      );
    }

    // Auto-generate consolidationNo (CON-XXXXX format)
    const lastLog = await db.consolidationLog.findFirst({
      where: { companyId },
      orderBy: { consolidationNo: 'desc' },
      select: { consolidationNo: true },
    });
    const lastNum = lastLog?.consolidationNo
      ? parseInt(lastLog.consolidationNo.replace('CON-', ''), 10) || 0
      : 0;
    const consolidationNo = `CON-${String(lastNum + 1).padStart(5, '0')}`;

    const log = await db.$transaction(async (tx) => {
      const record = await tx.consolidationLog.create({
        data: {
          consolidationNo,
          companyId,
          branchIds: body.branchIds.join(','),
          periodStart: new Date(body.periodStart),
          periodEnd: new Date(body.periodEnd),
          statementType: body.statementType,
          status: body.status || 'Generated',
          totalRevenue: safeFinancialRound(body.totalRevenue || 0),
          totalCOGS: safeFinancialRound(body.totalCOGS || 0),
          totalExpenses: safeFinancialRound(body.totalExpenses || 0),
          totalAssets: safeFinancialRound(body.totalAssets || 0),
          totalLiabilities: safeFinancialRound(body.totalLiabilities || 0),
          eliminationAmount: safeFinancialRound(body.eliminationAmount || 0),
          eliminationCount: body.eliminationCount || 0,
          eliminationDetails: body.eliminationDetails
            ? JSON.stringify(body.eliminationDetails)
            : null,
          generatedBy: security.user.id,
          generatedByName: security.user.name,
          reviewedBy: body.reviewedBy || null,
          approvedBy: body.approvedBy || null,
          isActive: true,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'Holding-Consolidation-Core',
          recordId: record.id,
          recordLabel: record.consolidationNo,
          userId: security.user.id || 'system',
          userName: security.user.name || 'System',
          details: JSON.stringify({
            consolidationNo,
            statementType: body.statementType,
            branchCount: body.branchIds.length,
            totalRevenue: body.totalRevenue,
            totalCOGS: body.totalCOGS,
            eliminationAmount: body.eliminationAmount,
          }),
        },
      });

      return record;
    });

    return NextResponse.json(log, { status: 201 });
  } catch (error) {
    console.error('[Consolidation POST] Error:', error);
    return NextResponse.json({ error: 'Failed to save consolidation log' }, { status: 500 });
  }
}
