# Task 7-f: Management Report and Bank Report Pages

## Summary
Implemented 9 new page components in `/home/z/my-project/src/app/page.tsx` for the Management Report and Bank Report sections.

## Pages Implemented

### Management Report Pages:
1. **ExpenseReportPage** (`expense-report`) - Expense report with date range + head filters, bar chart by category, summary cards (Total Expenses, Highest Category, Daily Average)
2. **ProductWiseBenefitPage** (`product-wise-benefit`) - Product profit analysis with cost/sale/margin/benefit columns, sortable by margin or benefit, bar chart of top 10 products
3. **IncomeReportPage** (`income-report`) - Income report with date range + head filters, bar chart by source, summary cards (Total Income, Highest Source, Daily Average)
4. **AdjustmentReportPage** (`adjustment-report`) - Stock adjustment entries with date filters, IN/OUT summary cards, color-coded type badges
5. **TransactionSummaryPage** (`transaction-summary`) - All transaction summary with income/expense/bank cards, income vs expense comparison bar chart
6. **MonthlyTransactionPage** (`monthly-transaction`) - Month/year selector, pie chart of expense categories, area chart of daily income vs expense, combined transaction table
7. **ShowroomAnalysisPage** (`showroom-analysis`) - Godown/showroom performance with sales/stock/revenue columns, performance % with progress bars, revenue vs stock bar chart

### Bank Report Pages:
8. **BankTransactionReportPage** (`bank-transaction-report`) - Bank transaction list with date/bank filters, deposit/withdrawal/net summary cards
9. **BankLedgerPage** (`bank-ledger`) - Bank ledger with running balance, bank selector, opening balance row, debit/credit/balance columns

## Implementation Pattern
All pages follow the existing report patterns:
- `page-enter` animation class on root div
- `PageHeader` component with icon
- Filter cards (date range, dropdowns)
- Summary stat cards with colored icon backgrounds
- Responsive tables with dark mode styling
- CSV/PDF export buttons
- Loading and empty states
- ৳ currency symbol
- Uses existing API endpoints (`/api/expenses`, `/api/incomes`, `/api/bank-transactions`, `/api/expense-income-heads`, `/api/products`, `/api/sales-orders`, `/api/stock-entries`, `/api/stock`, `/api/godowns`, `/api/banks`)

## Changes Made
- Added 9 page components (lines ~15390-16810)
- Updated `renderPage` function with 9 new page routing entries

## Lint Results
✅ Lint passes with 0 errors (only a BABEL deoptimization note for file size)
