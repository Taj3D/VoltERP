# Task 11: Reduce page.tsx file size by converting report pages to reportConfigs

## Summary
Successfully converted 13 simple report page functions into `reportConfigs` entries, reducing the file from **15,764 lines** to **14,029 lines** (a reduction of **1,735 lines** / 11%). File size went from ~1MB to 804KB.

## What was done

### 1. Added 13 new reportConfig entries
Each function was analyzed and its logic (filters, columns, summary cards, transform data, CSV/PDF export) was captured as a compact `reportConfig` entry:

| Page | Config Key | Lines Removed | Notes |
|------|-----------|---------------|-------|
| StockDetailsReportPage | stock-details-report | 154 | entryType filter with hardcoded options |
| StockSummaryReportPage | stock-summary-report | 152 | Flattened grouped-by-category display to single table |
| StockLedgerPage | stock-ledger | 147 | Running balance computed in transformData |
| StockQuantityReportPage | stock-quantity-report | 147 | Color-coded status badges via column render |
| StockForecastProductPage | stock-forecast-product | 145 | Forecast logic in transformData |
| StockForecastConcernPage | stock-forecast-concern | 153 | Grouped aggregation in transformData |
| DailyPurchaseReportPage | daily-purchase-report | 192 | Flattened grouped-by-supplier display |
| VatReportPage | vat-report | 246 | Combined two tables (sales+purchases) into one |
| DailySalesReportPage | daily-sales-report | 192 | Flattened grouped-by-customer display |
| ProductWiseBenefitPage | product-wise-benefit | 140 | Includes chartConfig for bar chart |
| ShowroomAnalysisPage | showroom-analysis | 129 | Performance % with progress bars, chartConfig |
| BankTransactionReportPage | bank-transaction-report | 117 | Bank filter from API data |
| BankLedgerPage | bank-ledger | 151 | Running balance computed in transformData |

### 2. Removed 13 function definitions
Deleted the full function bodies (totaling ~2,064 lines of JSX/TS code).

### 3. Removed 13 renderPage if-check lines
Removed explicit `if (currentPage === "xxx") return <XxxPage />;` lines from the `renderPage` function, since these pages are now handled by the `reportConfigs` lookup at the bottom of `renderPage`.

### 4. Added XCircle import
The stock-quantity-report config uses `XCircle` which wasn't previously imported. Added it to the lucide-react import.

## Design Decisions

### Flattened grouped displays
Pages like DailyPurchaseReportPage, DailySalesReportPage, and StockSummaryReportPage originally displayed data in grouped cards (e.g., POs grouped by supplier in separate cards). These were converted to flat table views with all records in a single table. The summary cards still capture the aggregate data (total purchases, total items, number of suppliers, etc.).

### Combined VAT tables
VatReportPage originally had two separate cards/tables (one for sales, one for purchases). The config combines both into a single table with a "Type" column (Sales/Purchase) to distinguish them.

### Running balance in transformData
StockLedgerPage and BankLedgerPage compute running balances. This logic was moved into the `transformData` function of the reportConfig, computing the balance sequentially through sorted entries.

## Pages NOT converted (and why)
- **TransactionSummaryPage** - No data table, only summary cards + income/expense comparison chart. GenericReportPage always renders a table.
- **MonthlyTransactionPage** - Uses PieChart and AreaChart, which GenericReportPage doesn't support (only BarChart).
- These remain as separate function definitions.

## Lint Results
- **0 errors, 0 warnings** (BABEL note about file size > 500KB is informational only)

## Dev Server
- Running normally on port 3000
- All API endpoints responding with 200
- No compilation errors
