# Task ID: 3 — Financial Statements Core Agent

## Task
Enhance THREE existing financial statement API routes to synthesize financial statements directly from ChartOfAccount and LedgerEntry tables, partitioned by companyId, with accounting equation enforcement.

## Work Completed

### File 1: /api/reports/trial-balance/route.ts (ENHANCED)
- **Fiscal Year Period Interlock**: Added `fiscalYearStatus` field that checks if query date range overlaps with any CLOSED fiscal year (from FiscalYear table). Returns array of closed FY metadata (id, name, startDate, endDate, status, closedAt).
- **COA-Driven Synthesis**: Added `coaBasedEntries` field that reads directly from ChartOfAccount.currentBalance, providing real-time cross-check against ledger-entry-based totals. Each entry includes code, name, classification, currentBalance, openingBalance, openingBalanceType.
- **Activity Log Module Update**: Changed from 'Acc-Trial-Balance' to 'Fin-Statements-Core'.
- **Accounting Equation Check**: Added `integrityWarning` field that appears when Total Debits ≠ Total Credits (imbalance ≥ 0.01). Includes message, totalDebits, totalCredits, and imbalance amount.

### File 2: /api/reports/profit-loss/route.ts (ENHANCED)
- **COA-Based Income Statement**: Added `coaBasedPL` section synthesizing from ChartOfAccount accounts where classification is 'Income', 'Revenue', 'Expense', or 'Expenses'. Includes revenue, expenses, netProfit, revenueBreakdown, expenseBreakdown.
- **Fiscal Year Context**: Added `fiscalYearContext` field with closed fiscal year metadata including netProfitClosed for each overlapping closed FY.
- **Activity Log Module Update**: Changed from 'Acc-Profit-Loss' to 'Fin-Statements-Core'.
- **Retained Earnings Account**: Added `retainedEarningsAccount` field that looks up the "Retained Earnings" COA node under Equity classification and returns its id, code, name, classification, currentBalance.

### File 3: /api/reports/balance-sheet/route.ts (ENHANCED — MOST CRITICAL)
- **COA-Driven Balance Sheet Synthesis**: Added `coaBasedBalanceSheet` section reading from ChartOfAccount by classification (Asset, Liability, Equity). Includes totalAssets, totalLiabilities, totalEquity, equityWithRetainedEarnings, runtimeNetProfit.
- **Accounting Equation Enforcement (CRITICAL)**: Full implementation verifying Assets = Liabilities + Equity (with Retained Earnings). Computes runtimeNetProfit from COA Revenue/Expense accounts, maps it as 'Retained Earnings (Current Period)' into Equity. Returns `accountingEquation` object with totalAssets, totalLiabilities, totalEquity, runtimeNetProfit, retainedEarningsCurrentPeriod, equityWithRetainedEarnings, totalLiabilitiesAndEquity, isBalanced, imbalance.
- **Equity Adjustment**: When imbalance detected, includes `equityAdjustment` with message, amount, and direction to guide correction.
- **Fiscal Year Context**: Added `fiscalYearContext` with all closed fiscal years and their netProfitClosed values.
- **Activity Log Module Update**: Changed from 'Acc-Balance-Sheet' to 'Fin-Statements-Core'.
- **COA Detailed Breakdown**: Added `coaAssetBreakdown`, `coaLiabilityBreakdown`, `coaEquityBreakdown` arrays showing each COA account with id, code, name, currentBalance, openingBalance, openingBalanceType for full transparency.

## Technical Details
- All COA queries are companyId-scoped
- All arithmetic uses safeFinancialAdd/safeFinancialSubtract/safeFinancialRound
- Existing transaction-based calculations preserved alongside new COA-based sections
- Module token for all activity logging: 'Fin-Statements-Core'
- Lint: ZERO errors
- Dev server: Stable, HTTP 200
