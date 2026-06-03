// ============================================================
// VoltERP — ACCOUNTING EXPORT API
// Executive-level structured data endpoint for PDF/CSV export engine.
// Provides company branding, structured columns/rows, summary totals,
// financial footer signature blocks, and system disclaimers.
// Supports 5 report types: Cash-in-Hand, Trial Balance, Profit & Loss,
// Balance Sheet, and Chart of Accounts.
// Stage 12: Multi-tenant, safe math, VAT auditor masking, RBAC, activity log
// ============================================================

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
import { sanitizeCurrencyValue } from '@/lib/export-utils';
import { calculateAccountBalance } from '@/lib/accounting-utils';

// ============================================================
// TYPES
// ============================================================

type ReportType = 'cash-in-hand' | 'trial-balance' | 'profit-loss' | 'balance-sheet' | 'chart-of-accounts';
type ExportFormat = 'pdf-data' | 'csv-data';
type ColumnType = 'text' | 'currency' | 'number' | 'date' | 'percent';

interface ExportColumn {
  key: string;
  label: string;
  type: ColumnType;
}

interface CompanyProfile {
  name: string;
  address: string;
  phone: string;
  mobile: string;
  email: string;
  website: string;
  logo: string | null;
  brandLogo: string | null;
  logoWidth: number;
  logoHeight: number;
  vatNumber: string | null;
  tradeLicense: string | null;
}

interface FinancialFooter {
  preparedBy: string;
  checkedBy: string;
  authorizedBy: string;
  approvedBy: string;
  printedBy: string;
}

interface ExportResponse {
  columns: ExportColumn[];
  rows: Record<string, unknown>[];
  summary: Record<string, unknown>;
  company: CompanyProfile;
  reportTitle: string;
  subtitle: string;
  systemNotice: string;
  financialFooter: FinancialFooter;
  reportType: ReportType;
  format: ExportFormat;
  generatedAt: string;
}

// ============================================================
// VALID REPORT TYPES
// ============================================================

const VALID_REPORT_TYPES: ReportType[] = [
  'cash-in-hand',
  'trial-balance',
  'profit-loss',
  'balance-sheet',
  'chart-of-accounts',
];

// ============================================================
// HELPER: Format date for display
// ============================================================

function formatDateForSubtitle(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

// ============================================================
// HELPER: Build period subtitle string
// ============================================================

function buildPeriodSubtitle(from: string | null, to: string | null, asOf: string | null, reportType: ReportType): string {
  if (reportType === 'balance-sheet' && asOf) {
    return `As of: ${formatDateForSubtitle(asOf)}`;
  }
  if (from && to) {
    return `Period: ${formatDateForSubtitle(from)} - ${formatDateForSubtitle(to)}`;
  }
  if (from) {
    return `From: ${formatDateForSubtitle(from)}`;
  }
  if (to) {
    return `Up to: ${formatDateForSubtitle(to)}`;
  }
  return 'All Time';
}

// ============================================================
// HELPER: Fetch company profile for branding
// ============================================================

async function fetchCompanyProfile(companyId: string | null): Promise<CompanyProfile> {
  const where: Record<string, unknown> = { isActive: true };
  if (companyId) where.id = companyId;

  const company = await db.company.findFirst({
    where,
    orderBy: { createdAt: 'asc' },
    select: {
      name: true,
      address: true,
      phone: true,
      mobile: true,
      email: true,
      website: true,
      logo: true,
      brandLogo: true,
      logoWidth: true,
      logoHeight: true,
      vatNumber: true,
      tradeLicense: true,
    },
  });

  if (!company) {
    return {
      name: 'VoltERP — Electronics Mart IMS',
      address: '',
      phone: '',
      mobile: '',
      email: '',
      website: '',
      logo: null,
      brandLogo: null,
      logoWidth: 30,
      logoHeight: 20,
      vatNumber: null,
      tradeLicense: null,
    };
  }

  return {
    name: company.name || 'VoltERP — Electronics Mart IMS',
    address: company.address || '',
    phone: company.phone || '',
    mobile: company.mobile || '',
    email: company.email || '',
    website: company.website || '',
    logo: company.logo || null,
    brandLogo: company.brandLogo || null,
    logoWidth: company.logoWidth || 30,
    logoHeight: company.logoHeight || 20,
    vatNumber: company.vatNumber || null,
    tradeLicense: company.tradeLicense || null,
  };
}

// ============================================================
// HELPER: Build financial footer signature block
// ============================================================

function buildFinancialFooter(displayName: string): FinancialFooter {
  return {
    preparedBy: displayName,
    checkedBy: '',
    authorizedBy: '',
    approvedBy: '',
    printedBy: displayName,
  };
}

// ============================================================
// REPORT: Cash-in-Hand
// ============================================================

async function generateCashInHandReport(
  companyId: string | null,
  from: string | null,
  to: string | null
): Promise<{ columns: ExportColumn[]; rows: Record<string, unknown>[]; summary: Record<string, unknown> }> {
  const columns: ExportColumn[] = [
    { key: 'bankName', label: 'Bank / Cash', type: 'text' },
    { key: 'accountNo', label: 'Account No', type: 'text' },
    { key: 'openingBalance', label: 'Opening Balance', type: 'currency' },
    { key: 'deposits', label: 'Deposits', type: 'currency' },
    { key: 'withdrawals', label: 'Withdrawals', type: 'currency' },
    { key: 'income', label: 'Income', type: 'currency' },
    { key: 'expense', label: 'Expense', type: 'currency' },
    { key: 'collections', label: 'Collections', type: 'currency' },
    { key: 'deliveries', label: 'Deliveries', type: 'currency' },
    { key: 'currentBalance', label: 'Current Balance', type: 'currency' },
  ];

  // Build date filters
  const dateFilterBT: Record<string, Date> = {};
  const dateFilterExp: Record<string, unknown> = {};
  const dateFilterInc: Record<string, unknown> = {};
  const dateFilterCC: Record<string, unknown> = {};
  const dateFilterCD: Record<string, unknown> = {};

  if (from) {
    dateFilterBT.gte = new Date(from);
    dateFilterExp.date = { gte: new Date(from) };
    dateFilterInc.date = { gte: new Date(from) };
    dateFilterCC.date = { gte: new Date(from) };
    dateFilterCD.date = { gte: new Date(from) };
  }
  if (to) {
    dateFilterBT.lte = new Date(to);
    const existingExp = dateFilterExp.date as Record<string, Date> || {};
    dateFilterExp.date = { ...existingExp, lte: new Date(to) };
    const existingInc = dateFilterInc.date as Record<string, Date> || {};
    dateFilterInc.date = { ...existingInc, lte: new Date(to) };
    const existingCC = dateFilterCC.date as Record<string, Date> || {};
    dateFilterCC.date = { ...existingCC, lte: new Date(to) };
    const existingCD = dateFilterCD.date as Record<string, Date> || {};
    dateFilterCD.date = { ...existingCD, lte: new Date(to) };
  }

  const bankWhere: Record<string, unknown> = { isActive: true };
  if (companyId) bankWhere.companyId = companyId;

  const banks = await db.bank.findMany({
    where: bankWhere,
    include: {
      bankTransactions: {
        where: from || to ? { date: dateFilterBT } : undefined,
      },
      expenses: {
        where: {
          isActive: true,
          status: 'Approved',
          ...(from || to ? dateFilterExp : {}),
          ...(companyId ? { companyId } : {}),
        },
      },
      incomes: {
        where: {
          isActive: true,
          status: 'Approved',
          ...(from || to ? dateFilterInc : {}),
          ...(companyId ? { companyId } : {}),
        },
      },
      cashCollections: {
        where: {
          isActive: true,
          status: 'Approved',
          ...(from || to ? dateFilterCC : {}),
          ...(companyId ? { companyId } : {}),
        },
      },
      cashDeliveries: {
        where: {
          isActive: true,
          status: 'Approved',
          ...(from || to ? dateFilterCD : {}),
          ...(companyId ? { companyId } : {}),
        },
      },
    },
  });

  const rows: Record<string, unknown>[] = [];
  let totalOpeningBalance = 0;
  let totalDeposits = 0;
  let totalWithdrawals = 0;
  let totalIncome = 0;
  let totalExpense = 0;
  let totalCollections = 0;
  let totalDeliveries = 0;
  let totalCurrentBalance = 0;

  for (const bank of banks) {
    let deposits = 0;
    for (const t of bank.bankTransactions.filter((t) => t.type === 'Deposit')) {
      deposits = safeFinancialAdd(deposits, t.amount);
    }
    let withdrawals = 0;
    for (const t of bank.bankTransactions.filter((t) => t.type === 'Withdraw')) {
      withdrawals = safeFinancialAdd(withdrawals, t.amount);
    }
    let bankIncome = 0;
    for (const i of bank.incomes) {
      bankIncome = safeFinancialAdd(bankIncome, i.amount);
    }
    let bankExpense = 0;
    for (const e of bank.expenses) {
      bankExpense = safeFinancialAdd(bankExpense, e.amount);
    }
    let collections = 0;
    for (const c of bank.cashCollections) {
      collections = safeFinancialAdd(collections, c.amount);
    }
    let deliveries = 0;
    for (const d of bank.cashDeliveries) {
      deliveries = safeFinancialAdd(deliveries, d.amount);
    }

    const currentBalance = safeFinancialRound(
      bank.openingBalance + deposits - withdrawals + bankIncome - bankExpense + collections - deliveries
    );

    rows.push({
      bankName: formatFinancialField(bank.bankName),
      accountNo: formatFinancialField(bank.accountNo),
      openingBalance: sanitizeCurrencyValue(bank.openingBalance),
      deposits: sanitizeCurrencyValue(deposits),
      withdrawals: sanitizeCurrencyValue(withdrawals),
      income: sanitizeCurrencyValue(bankIncome),
      expense: sanitizeCurrencyValue(bankExpense),
      collections: sanitizeCurrencyValue(collections),
      deliveries: sanitizeCurrencyValue(deliveries),
      currentBalance: sanitizeCurrencyValue(currentBalance),
    });

    totalOpeningBalance = safeFinancialAdd(totalOpeningBalance, bank.openingBalance);
    totalDeposits = safeFinancialAdd(totalDeposits, deposits);
    totalWithdrawals = safeFinancialAdd(totalWithdrawals, withdrawals);
    totalIncome = safeFinancialAdd(totalIncome, bankIncome);
    totalExpense = safeFinancialAdd(totalExpense, bankExpense);
    totalCollections = safeFinancialAdd(totalCollections, collections);
    totalDeliveries = safeFinancialAdd(totalDeliveries, deliveries);
    totalCurrentBalance = safeFinancialAdd(totalCurrentBalance, currentBalance);
  }

  // Cash income/expense not linked to any bank
  const cashOption = await db.paymentOption.findFirst({
    where: { name: 'Cash', isActive: true },
  });

  let cashIncome = 0;
  let cashExpense = 0;

  if (cashOption) {
    const cashIncomes = await db.income.aggregate({
      where: {
        paymentOptionId: cashOption.id,
        isActive: true,
        ...(from || to ? dateFilterInc : {}),
        ...(companyId ? { companyId } : {}),
      },
      _sum: { amount: true },
    });
    const cashExpenses = await db.expense.aggregate({
      where: {
        paymentOptionId: cashOption.id,
        isActive: true,
        ...(from || to ? dateFilterExp : {}),
        ...(companyId ? { companyId } : {}),
      },
      _sum: { amount: true },
    });
    cashIncome = cashIncomes._sum.amount || 0;
    cashExpense = cashExpenses._sum.amount || 0;
  }

  // Add cash row
  rows.push({
    bankName: 'Cash (Unbanked)',
    accountNo: '—',
    openingBalance: 0,
    deposits: 0,
    withdrawals: 0,
    income: sanitizeCurrencyValue(cashIncome),
    expense: sanitizeCurrencyValue(cashExpense),
    collections: 0,
    deliveries: 0,
    currentBalance: sanitizeCurrencyValue(safeFinancialSubtract(cashIncome, cashExpense)),
  });

  // All cash collections/deliveries totals
  const ccWhere: Record<string, unknown> = { isActive: true, status: 'Approved', ...(from || to ? dateFilterCC : {}) };
  if (companyId) ccWhere.companyId = companyId;

  const cdWhere: Record<string, unknown> = { isActive: true, status: 'Approved', ...(from || to ? dateFilterCD : {}) };
  if (companyId) cdWhere.companyId = companyId;

  const allCashCollections = await db.cashCollection.aggregate({ where: ccWhere, _sum: { amount: true } });
  const allCashDeliveries = await db.cashDelivery.aggregate({ where: cdWhere, _sum: { amount: true } });

  const totalCashInHand = safeFinancialRound(
    totalOpeningBalance +
    totalDeposits -
    totalWithdrawals +
    cashIncome -
    cashExpense +
    (allCashCollections._sum.amount || 0) -
    (allCashDeliveries._sum.amount || 0)
  );

  const summary = {
    totalOpeningBalance: sanitizeCurrencyValue(totalOpeningBalance),
    totalDeposits: sanitizeCurrencyValue(totalDeposits),
    totalWithdrawals: sanitizeCurrencyValue(totalWithdrawals),
    totalIncome: sanitizeCurrencyValue(totalIncome),
    totalExpense: sanitizeCurrencyValue(totalExpense),
    totalCollections: sanitizeCurrencyValue(allCashCollections._sum.amount || 0),
    totalDeliveries: sanitizeCurrencyValue(allCashDeliveries._sum.amount || 0),
    totalCashInHand: sanitizeCurrencyValue(totalCashInHand),
    bankCount: banks.length,
  };

  return { columns, rows, summary };
}

// ============================================================
// REPORT: Trial Balance
// ============================================================

async function generateTrialBalanceReport(
  companyId: string | null,
  from: string | null,
  to: string | null
): Promise<{ columns: ExportColumn[]; rows: Record<string, unknown>[]; summary: Record<string, unknown> }> {
  const columns: ExportColumn[] = [
    { key: 'account', label: 'Account', type: 'text' },
    { key: 'classification', label: 'Classification', type: 'text' },
    { key: 'openingDebit', label: 'Opening Dr', type: 'currency' },
    { key: 'openingCredit', label: 'Opening Cr', type: 'currency' },
    { key: 'totalDebit', label: 'Total Debit', type: 'currency' },
    { key: 'totalCredit', label: 'Total Credit', type: 'currency' },
    { key: 'netBalance', label: 'Net Balance', type: 'currency' },
  ];

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

  // Fetch all COA records for classification lookup and opening balance seeding
  const coaWhere: Record<string, unknown> = { isActive: true };
  if (companyId) coaWhere.companyId = companyId;

  const coaRecords = await db.chartOfAccount.findMany({ where: coaWhere });
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

  // Seed with opening balances
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

  // Add ledger entry totals
  for (const entry of ledgerEntries) {
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

  const entries = Array.from(accountMap.values()).sort((a, b) => a.account.localeCompare(b.account));

  const rows = entries.map((e) => ({
    account: formatFinancialField(e.account),
    classification: formatFinancialField(e.classification),
    openingDebit: sanitizeCurrencyValue(e.openingDebit),
    openingCredit: sanitizeCurrencyValue(e.openingCredit),
    totalDebit: sanitizeCurrencyValue(e.totalDebit),
    totalCredit: sanitizeCurrencyValue(e.totalCredit),
    netBalance: sanitizeCurrencyValue(safeFinancialSubtract(e.totalDebit, e.totalCredit)),
  }));

  // Grand totals
  let grandTotalDebit = 0;
  let grandTotalCredit = 0;
  for (const e of entries) {
    grandTotalDebit = safeFinancialAdd(grandTotalDebit, e.totalDebit);
    grandTotalCredit = safeFinancialAdd(grandTotalCredit, e.totalCredit);
  }
  grandTotalDebit = safeFinancialRound(grandTotalDebit);
  grandTotalCredit = safeFinancialRound(grandTotalCredit);
  const balanced = safeFinancialSubtract(grandTotalDebit, grandTotalCredit) === 0;

  // Classification summary
  const classificationSummary = new Map<string, { classification: string; totalDebit: number; totalCredit: number }>();
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

  const summary = {
    grandTotalDebit: sanitizeCurrencyValue(grandTotalDebit),
    grandTotalCredit: sanitizeCurrencyValue(grandTotalCredit),
    balanced,
    accountCount: entries.length,
    classificationSummary: Array.from(classificationSummary.values()).map((cs) => ({
      classification: formatFinancialField(cs.classification),
      totalDebit: sanitizeCurrencyValue(cs.totalDebit),
      totalCredit: sanitizeCurrencyValue(cs.totalCredit),
    })),
  };

  return { columns, rows, summary };
}

// ============================================================
// REPORT: Profit & Loss
// ============================================================

async function generateProfitLossReport(
  companyId: string | null,
  from: string | null,
  to: string | null
): Promise<{ columns: ExportColumn[]; rows: Record<string, unknown>[]; summary: Record<string, unknown> }> {
  const columns: ExportColumn[] = [
    { key: 'category', label: 'Category', type: 'text' },
    { key: 'head', label: 'Head / Item', type: 'text' },
    { key: 'amount', label: 'Amount', type: 'currency' },
  ];

  // Build date filters
  const dateFilterSO: Record<string, Date> = {};
  const dateFilterIncome: Record<string, unknown> = {};
  const dateFilterExpense: Record<string, unknown> = {};

  if (from) {
    dateFilterSO.gte = new Date(from);
    dateFilterIncome.date = { gte: new Date(from) };
    dateFilterExpense.date = { gte: new Date(from) };
  }
  if (to) {
    dateFilterSO.lte = new Date(to);
    if (dateFilterIncome.date) {
      (dateFilterIncome.date as Record<string, Date>).lte = new Date(to);
    } else {
      dateFilterIncome.date = { lte: new Date(to) };
    }
    if (dateFilterExpense.date) {
      (dateFilterExpense.date as Record<string, Date>).lte = new Date(to);
    } else {
      dateFilterExpense.date = { lte: new Date(to) };
    }
  }

  const salesWhere: Record<string, unknown> = { status: { notIn: ['Draft', 'Cancelled'] }, isActive: true };
  if (from || to) salesWhere.date = dateFilterSO;

  const incomeWhere: Record<string, unknown> = {
    isActive: true,
    status: { notIn: ['Draft', 'Cancelled'] },
    ...dateFilterIncome,
    ...(companyId ? { companyId } : {}),
  };
  const expenseWhere: Record<string, unknown> = {
    isActive: true,
    status: { notIn: ['Draft', 'Cancelled'] },
    ...dateFilterExpense,
    ...(companyId ? { companyId } : {}),
  };

  const [confirmedSales, allIncomes, allExpenses] = await Promise.all([
    db.salesOrder.findMany({
      where: salesWhere,
      include: { lines: { include: { product: { select: { costPrice: true } } } } },
    }),
    db.income.findMany({
      where: incomeWhere,
      include: { head: true },
    }),
    db.expense.findMany({
      where: expenseWhere,
      include: { head: true },
    }),
  ]);

  // Calculate values
  let salesRevenue = 0;
  for (const s of confirmedSales) {
    salesRevenue = safeFinancialAdd(salesRevenue, s.grandTotal);
  }
  let totalOtherIncome = 0;
  for (const i of allIncomes) {
    totalOtherIncome = safeFinancialAdd(totalOtherIncome, i.amount);
  }
  const revenue = safeFinancialAdd(salesRevenue, totalOtherIncome);

  let costOfGoods = 0;
  for (const so of confirmedSales) {
    for (const line of so.lines) {
      const costPrice = line.product?.costPrice || 0;
      costOfGoods = safeFinancialAdd(costOfGoods, line.quantity * costPrice);
    }
  }

  const grossProfit = safeFinancialSubtract(revenue, costOfGoods);
  const grossProfitMargin = revenue > 0 ? safeFinancialRound((grossProfit / revenue) * 100) : 0;

  let operatingExpenses = 0;
  for (const e of allExpenses) {
    operatingExpenses = safeFinancialAdd(operatingExpenses, e.amount);
  }

  const netProfit = safeFinancialSubtract(grossProfit, operatingExpenses);
  const netProfitMargin = revenue > 0 ? safeFinancialRound((netProfit / revenue) * 100) : 0;

  // Build rows
  const rows: Record<string, unknown>[] = [];

  // Revenue section
  rows.push({ category: 'REVENUE', head: 'Sales Revenue', amount: sanitizeCurrencyValue(salesRevenue) });
  rows.push({ category: 'REVENUE', head: 'Other Income', amount: sanitizeCurrencyValue(totalOtherIncome) });
  rows.push({ category: 'REVENUE', head: 'Total Revenue', amount: sanitizeCurrencyValue(revenue) });

  // COGS section
  rows.push({ category: 'COST OF GOODS SOLD', head: 'Cost of Goods Sold', amount: sanitizeCurrencyValue(costOfGoods) });

  // Gross Profit
  rows.push({ category: 'GROSS PROFIT', head: 'Gross Profit', amount: sanitizeCurrencyValue(grossProfit) });

  // Operating Expenses by head
  const expenseByHead = new Map<string, { head: string; amount: number; count: number }>();
  for (const expense of allExpenses) {
    const headName = expense.head?.name || 'Uncategorized';
    const existing = expenseByHead.get(headName);
    if (existing) {
      existing.amount = safeFinancialAdd(existing.amount, expense.amount);
      existing.count += 1;
    } else {
      expenseByHead.set(headName, { head: headName, amount: expense.amount, count: 1 });
    }
  }

  for (const [, detail] of expenseByHead) {
    rows.push({ category: 'OPERATING EXPENSES', head: detail.head, amount: sanitizeCurrencyValue(detail.amount) });
  }
  rows.push({ category: 'OPERATING EXPENSES', head: 'Total Operating Expenses', amount: sanitizeCurrencyValue(operatingExpenses) });

  // Net Profit
  rows.push({ category: 'NET PROFIT', head: 'Net Profit', amount: sanitizeCurrencyValue(netProfit) });

  // Income by head detail
  const incomeByHead = new Map<string, { head: string; amount: number; count: number }>();
  for (const income of allIncomes) {
    const headName = income.head?.name || 'Uncategorized';
    const existing = incomeByHead.get(headName);
    if (existing) {
      existing.amount = safeFinancialAdd(existing.amount, income.amount);
      existing.count += 1;
    } else {
      incomeByHead.set(headName, { head: headName, amount: income.amount, count: 1 });
    }
  }

  const summary = {
    revenue: sanitizeCurrencyValue(revenue),
    salesRevenue: sanitizeCurrencyValue(salesRevenue),
    otherIncome: sanitizeCurrencyValue(totalOtherIncome),
    costOfGoods: sanitizeCurrencyValue(costOfGoods),
    grossProfit: sanitizeCurrencyValue(grossProfit),
    grossProfitMargin: sanitizeCurrencyValue(grossProfitMargin),
    operatingExpenses: sanitizeCurrencyValue(operatingExpenses),
    netProfit: sanitizeCurrencyValue(netProfit),
    netProfitMargin: sanitizeCurrencyValue(netProfitMargin),
    incomeDetails: Array.from(incomeByHead.values()).map((d) => ({
      head: formatFinancialField(d.head),
      amount: sanitizeCurrencyValue(d.amount),
      count: d.count,
    })),
    expenseDetails: Array.from(expenseByHead.values()).map((d) => ({
      head: formatFinancialField(d.head),
      amount: sanitizeCurrencyValue(d.amount),
      count: d.count,
    })),
  };

  return { columns, rows, summary };
}

// ============================================================
// REPORT: Balance Sheet
// ============================================================

async function generateBalanceSheetReport(
  companyId: string | null,
  asOf: string | null
): Promise<{ columns: ExportColumn[]; rows: Record<string, unknown>[]; summary: Record<string, unknown> }> {
  const columns: ExportColumn[] = [
    { key: 'section', label: 'Section', type: 'text' },
    { key: 'item', label: 'Item', type: 'text' },
    { key: 'amount', label: 'Amount', type: 'currency' },
  ];

  const asOfDate = asOf ? new Date(asOf) : new Date();

  // === ASSETS ===
  const productWhere: Record<string, unknown> = { isActive: true };
  if (companyId) productWhere.companyId = companyId;

  const products = await db.product.findMany({
    where: productWhere,
    select: { costPrice: true, openingStock: true },
  });

  let stockValue = 0;
  for (const p of products) {
    stockValue = safeFinancialAdd(stockValue, p.costPrice * p.openingStock);
  }

  // Bank balances
  const bankWhere: Record<string, unknown> = { isActive: true };
  if (companyId) bankWhere.companyId = companyId;

  const banks = await db.bank.findMany({
    where: bankWhere,
    include: {
      bankTransactions: { where: asOf ? { date: { lte: asOfDate } } : undefined },
      expenses: {
        where: { isActive: true, status: 'Approved', ...(asOf ? { date: { lte: asOfDate } } : {}), ...(companyId ? { companyId } : {}) },
      },
      incomes: {
        where: { isActive: true, status: 'Approved', ...(asOf ? { date: { lte: asOfDate } } : {}), ...(companyId ? { companyId } : {}) },
      },
      cashCollections: {
        where: { isActive: true, status: 'Approved', ...(asOf ? { date: { lte: asOfDate } } : {}), ...(companyId ? { companyId } : {}) },
      },
      cashDeliveries: {
        where: { isActive: true, status: 'Approved', ...(asOf ? { date: { lte: asOfDate } } : {}), ...(companyId ? { companyId } : {}) },
      },
    },
  });

  let bankBalance = 0;
  for (const bank of banks) {
    let deposits = 0;
    for (const t of bank.bankTransactions.filter((t) => t.type === 'Deposit')) {
      deposits = safeFinancialAdd(deposits, t.amount);
    }
    let withdrawals = 0;
    for (const t of bank.bankTransactions.filter((t) => t.type === 'Withdraw')) {
      withdrawals = safeFinancialAdd(withdrawals, t.amount);
    }
    let bankIncome = 0;
    for (const i of bank.incomes) bankIncome = safeFinancialAdd(bankIncome, i.amount);
    let bankExpense = 0;
    for (const e of bank.expenses) bankExpense = safeFinancialAdd(bankExpense, e.amount);
    let collections = 0;
    for (const c of bank.cashCollections) collections = safeFinancialAdd(collections, c.amount);
    let deliveries = 0;
    for (const d of bank.cashDeliveries) deliveries = safeFinancialAdd(deliveries, d.amount);

    const currentBal = safeFinancialRound(
      bank.openingBalance + deposits - withdrawals + bankIncome - bankExpense + collections - deliveries
    );
    bankBalance = safeFinancialAdd(bankBalance, currentBal);
  }

  // Customer receivables
  const customers = await db.customer.findMany({
    where: { isActive: true },
    include: {
      salesOrders: {
        where: { status: { notIn: ['Draft', 'Cancelled'] }, isActive: true, ...(asOf ? { date: { lte: asOfDate } } : {}) },
      },
      hireSales: {
        where: { status: { notIn: ['Draft', 'Cancelled'] }, isActive: true, ...(asOf ? { date: { lte: asOfDate } } : {}) },
      },
      cashCollections: {
        where: { isActive: true, ...(asOf ? { date: { lte: asOfDate } } : {}), ...(companyId ? { companyId } : {}) },
      },
      salesReturns: {
        where: { isActive: true, ...(asOf ? { date: { lte: asOfDate } } : {}) },
      },
    },
  });

  let totalReceivables = 0;
  let customerAdvances = 0;

  for (const customer of customers) {
    let totalSales = 0;
    for (const so of customer.salesOrders) totalSales = safeFinancialAdd(totalSales, so.grandTotal);
    let totalHireSales = 0;
    for (const hs of customer.hireSales) totalHireSales = safeFinancialAdd(totalHireSales, hs.grandTotal);
    let totalCollections = 0;
    for (const c of customer.cashCollections) totalCollections = safeFinancialAdd(totalCollections, c.amount);
    let totalReturns = 0;
    for (const r of customer.salesReturns) totalReturns = safeFinancialAdd(totalReturns, r.grandTotal);

    const balance = safeFinancialSubtract(
      safeFinancialAdd(safeFinancialAdd(customer.openingBalance, totalSales), totalHireSales),
      safeFinancialAdd(totalCollections, totalReturns)
    );

    if (balance >= 0) {
      totalReceivables = safeFinancialAdd(totalReceivables, balance);
    } else {
      customerAdvances = safeFinancialAdd(customerAdvances, Math.abs(balance));
    }
  }

  const totalCurrentAssets = safeFinancialAdd(bankBalance, totalReceivables);
  const totalAssets = safeFinancialAdd(stockValue, totalCurrentAssets);

  // === LIABILITIES ===
  const suppliers = await db.supplier.findMany({
    where: { isActive: true },
    include: {
      purchaseOrders: {
        where: { status: { notIn: ['Draft', 'Cancelled'] }, isActive: true, ...(asOf ? { date: { lte: asOfDate } } : {}) },
      },
      cashDeliveries: {
        where: { isActive: true, ...(asOf ? { date: { lte: asOfDate } } : {}), ...(companyId ? { companyId } : {}) },
      },
      purchaseReturns: {
        where: { isActive: true, ...(asOf ? { date: { lte: asOfDate } } : {}) },
      },
    },
  });

  let totalPayables = 0;
  let supplierAdvances = 0;

  for (const supplier of suppliers) {
    let totalPurchases = 0;
    for (const po of supplier.purchaseOrders) totalPurchases = safeFinancialAdd(totalPurchases, po.grandTotal);
    let totalDeliveries = 0;
    for (const d of supplier.cashDeliveries) totalDeliveries = safeFinancialAdd(totalDeliveries, d.amount);
    let totalReturns = 0;
    for (const r of supplier.purchaseReturns) totalReturns = safeFinancialAdd(totalReturns, r.grandTotal);

    const balance = safeFinancialSubtract(
      safeFinancialAdd(supplier.openingBalance, totalPurchases),
      safeFinancialAdd(totalDeliveries, totalReturns)
    );

    if (balance >= 0) {
      totalPayables = safeFinancialAdd(totalPayables, balance);
    } else {
      supplierAdvances = safeFinancialAdd(supplierAdvances, Math.abs(balance));
    }
  }

  // Equity (P&L)
  const [confirmedSalesWithLines, allIncomes, allExpenses] = await Promise.all([
    db.salesOrder.findMany({
      where: { status: { notIn: ['Draft', 'Cancelled'] }, isActive: true, ...(asOf ? { date: { lte: asOfDate } } : {}) },
      include: { lines: { include: { product: { select: { costPrice: true } } } } },
    }),
    db.income.aggregate({
      where: { isActive: true, status: { notIn: ['Draft', 'Cancelled'] }, ...(asOf ? { date: { lte: asOfDate } } : {}), ...(companyId ? { companyId } : {}) },
      _sum: { amount: true },
    }),
    db.expense.aggregate({
      where: { isActive: true, status: { notIn: ['Draft', 'Cancelled'] }, ...(asOf ? { date: { lte: asOfDate } } : {}), ...(companyId ? { companyId } : {}) },
      _sum: { amount: true },
    }),
  ]);

  let salesTotal = 0;
  for (const s of confirmedSalesWithLines) salesTotal = safeFinancialAdd(salesTotal, s.grandTotal);
  const equityRevenue = safeFinancialAdd(salesTotal, allIncomes._sum.amount || 0);

  let equityCOGS = 0;
  for (const so of confirmedSalesWithLines) {
    for (const line of so.lines) {
      const costPrice = line.product?.costPrice || 0;
      equityCOGS = safeFinancialAdd(equityCOGS, line.quantity * costPrice);
    }
  }

  const equityOperatingExpenses = allExpenses._sum.amount || 0;
  const retainedEarnings = safeFinancialSubtract(safeFinancialSubtract(equityRevenue, equityCOGS), equityOperatingExpenses);

  const totalAssetsWithAdvances = safeFinancialAdd(totalAssets, supplierAdvances);
  const totalLiabilities = safeFinancialAdd(
    safeFinancialAdd(totalPayables, customerAdvances),
    Math.max(retainedEarnings, 0)
  );

  // Build rows
  const rows: Record<string, unknown>[] = [];

  // ASSETS
  rows.push({ section: 'ASSETS', item: 'Fixed Assets', amount: '' });
  rows.push({ section: 'ASSETS', item: 'Stock / Inventory', amount: sanitizeCurrencyValue(stockValue) });
  rows.push({ section: 'ASSETS', item: 'Current Assets', amount: '' });
  rows.push({ section: 'ASSETS', item: 'Bank Balance', amount: sanitizeCurrencyValue(bankBalance) });
  rows.push({ section: 'ASSETS', item: 'Receivables', amount: sanitizeCurrencyValue(totalReceivables) });
  rows.push({ section: 'ASSETS', item: 'Supplier Advances', amount: sanitizeCurrencyValue(supplierAdvances) });
  rows.push({ section: 'ASSETS', item: 'Total Current Assets', amount: sanitizeCurrencyValue(totalCurrentAssets) });
  rows.push({ section: 'ASSETS', item: 'Total Assets', amount: sanitizeCurrencyValue(totalAssetsWithAdvances) });

  // LIABILITIES
  rows.push({ section: 'LIABILITIES', item: 'Current Liabilities', amount: '' });
  rows.push({ section: 'LIABILITIES', item: 'Payables', amount: sanitizeCurrencyValue(totalPayables) });
  rows.push({ section: 'LIABILITIES', item: 'Customer Advances', amount: sanitizeCurrencyValue(customerAdvances) });
  rows.push({ section: 'LIABILITIES', item: 'Equity / Retained Earnings', amount: sanitizeCurrencyValue(Math.max(retainedEarnings, 0)) });
  rows.push({ section: 'LIABILITIES', item: 'Total Liabilities + Equity', amount: sanitizeCurrencyValue(totalLiabilities) });

  // Ratios
  const currentRatio = totalPayables > 0 ? safeFinancialRound(totalCurrentAssets / totalPayables) : 0;
  const debtToEquity = retainedEarnings > 0 ? safeFinancialRound(totalLiabilities / retainedEarnings) : 0;

  const balanced = safeFinancialSubtract(
    safeFinancialRound(totalAssetsWithAdvances),
    safeFinancialRound(totalLiabilities)
  ) === 0;

  const summary = {
    totalAssets: sanitizeCurrencyValue(totalAssetsWithAdvances),
    totalLiabilities: sanitizeCurrencyValue(totalLiabilities),
    stockValue: sanitizeCurrencyValue(stockValue),
    bankBalance: sanitizeCurrencyValue(bankBalance),
    receivables: sanitizeCurrencyValue(totalReceivables),
    payables: sanitizeCurrencyValue(totalPayables),
    retainedEarnings: sanitizeCurrencyValue(retainedEarnings),
    currentRatio: sanitizeCurrencyValue(currentRatio),
    debtToEquity: sanitizeCurrencyValue(debtToEquity),
    balanced,
  };

  return { columns, rows, summary };
}

// ============================================================
// REPORT: Chart of Accounts
// ============================================================

async function generateChartOfAccountsReport(
  companyId: string | null
): Promise<{ columns: ExportColumn[]; rows: Record<string, unknown>[]; summary: Record<string, unknown> }> {
  const columns: ExportColumn[] = [
    { key: 'code', label: 'Code', type: 'text' },
    { key: 'name', label: 'Account Name', type: 'text' },
    { key: 'classification', label: 'Classification', type: 'text' },
    { key: 'parentAccount', label: 'Parent Account', type: 'text' },
    { key: 'openingBalance', label: 'Opening Balance', type: 'currency' },
    { key: 'openingBalanceType', label: 'Dr/Cr', type: 'text' },
    { key: 'ownDebit', label: 'Own Debit', type: 'currency' },
    { key: 'ownCredit', label: 'Own Credit', type: 'currency' },
    { key: 'ownNet', label: 'Own Net', type: 'currency' },
    { key: 'totalDebit', label: 'Total Debit', type: 'currency' },
    { key: 'totalCredit', label: 'Total Credit', type: 'currency' },
    { key: 'totalNet', label: 'Total Net', type: 'currency' },
    { key: 'childCount', label: 'Children', type: 'number' },
  ];

  const whereClause: Record<string, unknown> = { isActive: true };
  if (companyId) whereClause.companyId = companyId;

  const accounts = await db.chartOfAccount.findMany({
    where: whereClause,
    include: {
      parentAccount: true,
      childAccounts: { where: { isActive: true } },
      _count: { select: { childAccounts: true } },
    },
    orderBy: { code: 'asc' },
  });

  // Calculate dynamic sub-balances
  const accountsWithBalance = await Promise.all(
    accounts.map(async (account) => {
      const balance = await calculateAccountBalance(account.id, undefined, companyId);
      const parentAccountName = account.parentAccount
        ? account.parentAccount.name
        : formatFinancialField(null);

      return {
        code: account.code,
        name: account.name,
        classification: account.classification,
        parentAccount: parentAccountName,
        openingBalance: sanitizeCurrencyValue(account.openingBalance),
        openingBalanceType: account.openingBalanceType,
        ownDebit: sanitizeCurrencyValue(balance.ownDebit),
        ownCredit: sanitizeCurrencyValue(balance.ownCredit),
        ownNet: sanitizeCurrencyValue(balance.ownNet),
        totalDebit: sanitizeCurrencyValue(balance.totalDebit),
        totalCredit: sanitizeCurrencyValue(balance.totalCredit),
        totalNet: sanitizeCurrencyValue(balance.totalNet),
        childCount: account._count.childAccounts,
      };
    })
  );

  // Classification summary
  const classificationSummary = new Map<string, { count: number; totalDebit: number; totalCredit: number; totalNet: number }>();
  for (const account of accountsWithBalance) {
    const cls = account.classification;
    const existing = classificationSummary.get(cls);
    if (existing) {
      existing.count += 1;
      existing.totalDebit = safeFinancialAdd(existing.totalDebit, sanitizeCurrencyValue(account.totalDebit));
      existing.totalCredit = safeFinancialAdd(existing.totalCredit, sanitizeCurrencyValue(account.totalCredit));
      existing.totalNet = safeFinancialAdd(existing.totalNet, sanitizeCurrencyValue(account.totalNet));
    } else {
      classificationSummary.set(cls, {
        count: 1,
        totalDebit: sanitizeCurrencyValue(account.totalDebit),
        totalCredit: sanitizeCurrencyValue(account.totalCredit),
        totalNet: sanitizeCurrencyValue(account.totalNet),
      });
    }
  }

  const summary = {
    totalAccounts: accounts.length,
    classificationSummary: Array.from(classificationSummary.entries()).map(([classification, data]) => ({
      classification,
      count: data.count,
      totalDebit: sanitizeCurrencyValue(data.totalDebit),
      totalCredit: sanitizeCurrencyValue(data.totalCredit),
      totalNet: sanitizeCurrencyValue(data.totalNet),
    })),
  };

  return { columns, rows: accountsWithBalance, summary };
}

// ============================================================
// MAIN HANDLER: GET /api/reports/accounting-export
// ============================================================

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'TrialBalance', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);

    // Parse and validate report type
    const reportTypeParam = searchParams.get('reportType') || 'trial-balance';
    if (!VALID_REPORT_TYPES.includes(reportTypeParam as ReportType)) {
      return NextResponse.json(
        { error: `Invalid reportType "${reportTypeParam}". Must be one of: ${VALID_REPORT_TYPES.join(', ')}` },
        { status: 400 }
      );
    }
    const reportType = reportTypeParam as ReportType;

    // Parse format
    const formatParam = searchParams.get('format') || 'pdf-data';
    if (formatParam !== 'pdf-data' && formatParam !== 'csv-data') {
      return NextResponse.json(
        { error: `Invalid format "${formatParam}". Must be "pdf-data" or "csv-data"` },
        { status: 400 }
      );
    }
    const format = formatParam as ExportFormat;

    // Parse date filters
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const asOf = searchParams.get('asOf');

    // VAT Auditor mode
    const rawVatMode = searchParams.get('vatMode') === 'true';
    const userRole = security.user.role as UserRole;
    const vatMode = validateVatMode(rawVatMode, userRole);

    // Multi-tenant companyId isolation
    const companyId = security.user.companyId;

    // Fetch company profile for branding
    const company = await fetchCompanyProfile(companyId);

    // Generate report data based on type
    let reportData: { columns: ExportColumn[]; rows: Record<string, unknown>[]; summary: Record<string, unknown> };

    switch (reportType) {
      case 'cash-in-hand':
        reportData = await generateCashInHandReport(companyId, from, to);
        break;
      case 'trial-balance':
        reportData = await generateTrialBalanceReport(companyId, from, to);
        break;
      case 'profit-loss':
        reportData = await generateProfitLossReport(companyId, from, to);
        break;
      case 'balance-sheet':
        reportData = await generateBalanceSheetReport(companyId, asOf);
        break;
      case 'chart-of-accounts':
        reportData = await generateChartOfAccountsReport(companyId);
        break;
      default:
        return NextResponse.json(
          { error: `Unsupported report type: ${reportType}` },
          { status: 400 }
        );
    }

    // Build report title and subtitle
    const reportTitles: Record<ReportType, string> = {
      'cash-in-hand': 'Cash in Hand',
      'trial-balance': 'Trial Balance',
      'profit-loss': 'Profit & Loss Statement',
      'balance-sheet': 'Balance Sheet',
      'chart-of-accounts': 'Chart of Accounts',
    };

    const reportTitle = `${reportTitles[reportType]} — ${company.name}`;
    const subtitle = buildPeriodSubtitle(from, to, asOf, reportType);

    const systemNotice = 'This is a system-generated report from VoltERP — Electronics Mart IMS. No manual signature or seal is required unless explicitly stated.';

    const financialFooter = buildFinancialFooter(security.user.displayName || security.user.name);

    // Build response
    const responseData: ExportResponse = {
      columns: reportData.columns,
      rows: reportData.rows,
      summary: reportData.summary,
      company,
      reportTitle,
      subtitle,
      systemNotice,
      financialFooter,
      reportType,
      format,
      generatedAt: new Date().toISOString(),
    };

    // Apply VAT Auditor deep masking
    if (vatMode) {
      const masked = maskAccountingReportForVatAuditor(
        responseData as unknown as Record<string, unknown>,
        userRole
      );
      // Preserve structured fields that should not be masked
      masked.reportTitle = reportTitle;
      masked.subtitle = subtitle;
      masked.systemNotice = systemNotice;
      masked.reportType = reportType;
      masked.format = format;
      masked.generatedAt = responseData.generatedAt;
      // Preserve financialFooter structure
      masked.financialFooter = financialFooter;
      // Preserve company non-monetary fields
      masked.company = {
        ...company,
        vatNumber: company.vatNumber,
        tradeLicense: company.tradeLicense,
      };

      return NextResponse.json(masked);
    }

    // Activity logging
    await logUserActivity({
      action: 'EXPORT',
      module: 'Acc-Accounting-Export',
      userId: security.user.id,
      userName: security.user.name,
      details: `Accounting export generated: ${reportTitles[reportType]} (${format})`,
    });

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Error generating accounting export:', error);
    return NextResponse.json(
      { error: 'Failed to generate accounting export' },
      { status: 500 }
    );
  }
}
