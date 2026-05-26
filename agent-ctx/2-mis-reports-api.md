# Task ID: 2 - MIS Report Engine API Routes

## Agent: subagent
## Task: Build comprehensive MIS Report API at `/api/mis-reports/route.ts`

### Work Log

1. **Read project context**: Reviewed worklog.md (7+ phases), Prisma schema (926 lines, 30+ models), existing report routes (basic, sales, purchase, sr, customer-wise, hire-sales, bank, advance-search, profit-loss, trial-balance, cash-in-hand, balance-sheet, transfer)

2. **Analyzed schema constraints**: Identified that `HireInstallment` and `StockEntry` models do NOT have `isActive` fields (unlike most other models), which required careful query construction

3. **Created `/src/app/api/mis-reports/route.ts`** (~1500 lines) implementing 38 report subtypes across 9 report types:

   **Basic Reports (8):**
   - `employee-information`: Employee list with designation, department, joining date, phone, status
   - `product-information`: Product catalog with category, company, cost/sale prices, stock, reorder level (VAT mode masks costPrice, wholesalePrice, dealerPrice)
   - `stock-details`: Stock levels per product with godown, IN/OUT totals, current balance
   - `stock-summary`: Aggregated stock by category with total value (VAT mode masks value)
   - `stock-ledger`: Stock entries over time with reference types
   - `stock-qty`: Product quantities with LOW STOCK/OK reorder alerts
   - `stock-forecast-product`: Products below reorder level with forecasted needs (1.5x shortfall)
   - `stock-forecast-concern`: Stock by company with reorder indicators

   **Purchase Reports (7):**
   - `supplier-ledger`: Supplier transactions (PO, returns, cash deliveries) with running balance
   - `daily-purchase`: Daily purchase totals with supplier breakdown
   - `supplier-wise-purchase`: Purchases grouped by supplier with totals
   - `supplier-cash-delivery`: Cash deliveries to suppliers with payment details
   - `supplier-due`: Supplier outstanding balances (PO total - deliveries - returns)
   - `model-wise-purchase`: Purchases grouped by product/category with quantities
   - `vat-report`: VAT collected on purchases + sales with net VAT payable

   **Sales Reports (3):**
   - `daily-sales`: Daily sales totals with customer breakdown
   - `replacement-report`: Replacement orders with product details and reasons
   - `model-wise-sales`: Sales grouped by product/category with quantities

   **Hire Sales Reports (5):**
   - `installment-collection`: Paid installments with customer/product info
   - `upcoming-installment`: Pending installments with due dates
   - `defaulting-customer`: Customers with overdue installments (>30 days) with days overdue
   - `default-customer-summary`: Summary of defaulting customers with total overdue
   - `hire-account-details`: Hire sales accounts with balance, paid, remaining

   **SR Reports (8):**
   - `sr-wise-sales`: Sales grouped by SR (employees with SR designation)
   - `sr-wise-sales-details`: Detailed sales line items
   - `sr-wise-customer-due`: Customer outstanding grouped
   - `sr-wise-customer-summary`: Customer status (Has Due/Clear) per SR
   - `sr-visit-report`: Customer visits/interactions from audit logs
   - `sr-wise-customer-status`: Customer status (Active/Inactive) based on last order date
   - `sr-wise-cash-collection`: Cash collections by SR
   - `sr-commission-report`: 2% commission calculation based on SR sales

   **Customer Wise Reports (6):**
   - `customer-wise-sales`: Sales grouped by customer
   - `category-wise-customer-due`: Customer dues grouped by product category
   - `customer-ledger`: Customer transaction history with running balance (requires customerId)
   - `customer-due-report`: Outstanding customer balances
   - `customer-cash-collection`: Customer payment history
   - `customer-ledger-summary`: Summary per customer with totals

   **Management Reports (2):**
   - `expense-report`: Expenses grouped by head with totals
   - `management-report`: Combined dashboard with revenue, COGS, gross profit, operating expenses, net profit, profit margin, monthly breakdown

   **Bank Reports (2):**
   - `bank-transaction-report`: Bank transactions with deposits, withdrawals, transfers
   - `bank-balance-report`: Current bank balances with opening/deposits/withdrawals breakdown

   **Advance Search (1):**
   - Cross-module search by keyword across products, customers, suppliers, sales orders, purchase orders

4. **Key Technical Features**:
   - All queries use Prisma ORM with `db` from `@/lib/db`
   - Date range filtering (`from`, `to`) on all reports
   - Entity-specific filtering (supplierId, customerId, employeeId, bankId, categoryId, companyId, productId, godownId)
   - Sorting support (`sortField`, `sortOrder: asc|desc`)
   - Grouping support (`groupBy`) for aggregation
   - Summary calculations (totals, averages, counts)
   - Chart data generation for Recharts compatibility
   - Column definitions for dynamic table building
   - VAT Auditor mode: when `vatMode=true`, masks costPrice, profit margins, internal adjustments
   - Empty data handling: returns empty arrays with column definitions
   - Error handling: returns 400 for unknown report types with available types list

5. **Fixed schema compatibility issues**:
   - Removed `isActive: true` from `HireInstallment` queries (model doesn't have isActive field)
   - Removed `isActive: true` from `StockEntry` sub-queries and `stockEntry.findMany` (model doesn't have isActive field)

6. **Testing Results**: All 38 report subtypes tested successfully:
   - All return proper `title`, `columns`, `rows`, `summary`, `chartData` structure
   - Sorting works (tested desc on employee-information)
   - Grouping works (tested groupBy=department on employee-information)
   - VAT mode works (tested on product-information and management-report)
   - Advance search works (tested with keyword "Samsung" - found 3 products, 1 supplier)
   - Error handling works (unknown type returns 400 with available types list)
   - Customer ledger with invalid ID returns empty result gracefully

7. **Lint**: 0 errors, 0 warnings

### Stage Summary
- Created comprehensive MIS Report API with 38 report subtypes across 9 categories
- All queries use Prisma ORM with proper model compatibility
- Full feature support: date range, entity filters, sorting, grouping, summary, chart data
- VAT Auditor mode masks sensitive financial data
- Clean error handling with helpful error messages
- 0 lint errors, all 38 report types tested and working
