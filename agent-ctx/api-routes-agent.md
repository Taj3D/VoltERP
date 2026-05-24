# Task: Create 14 API Route Files for Electronics Mart Inventory Management System

## Summary
Created all 14 API route files under `/home/z/my-project/src/app/api/reports/` and `/home/z/my-project/src/app/api/seed/`. All endpoints are functional, pass lint checks, and have proper error handling.

## Files Created

### 1. `/api/reports/cash-in-hand/route.ts` (GET)
- Calculates cash in hand by summing: bank openingBalance + deposits - withdrawals + cash income - cash expenses + cash collections - cash deliveries
- Returns breakdown by bank and total summary

### 2. `/api/reports/trial-balance/route.ts` (GET)
- Generates trial balance from LedgerEntry table
- Groups by account, sums debits and credits
- Returns entries array, grand totals, and balanced boolean

### 3. `/api/reports/profit-loss/route.ts` (GET)
- Revenue = confirmed SalesOrder grandTotals + all Incomes
- COGS = confirmed PurchaseOrder grandTotals
- Gross/Net Profit calculations with margin percentages
- Returns incomeDetails and expenseDetails grouped by head

### 4. `/api/reports/balance-sheet/route.ts` (GET)
- Assets: stock value + bank balances + customer receivables
- Liabilities: supplier payables + equity (net profit)
- Returns balanced boolean

### 5. `/api/reports/basic/route.ts` (GET)
- Key metrics: salesToday, purchaseToday, stockValue, cashBalance, receivables, payables
- Top 10 products by revenue
- Monthly sales for last 12 months

### 6. `/api/reports/purchase/route.ts` (GET)
- Accepts query params: supplierId, dateFrom, dateTo, productId
- Returns filtered purchase orders with product-wise summary

### 7. `/api/reports/sales/route.ts` (GET)
- Accepts query params: customerId, dateFrom, dateTo, productId
- Returns sales orders with profit margin calculations per order and per product

### 8. `/api/reports/hire-sales/route.ts` (GET)
- Returns all hire sales with Active/Returned status and outstanding amounts

### 9. `/api/reports/sr/route.ts` (GET)
- Returns SR performance with target amount, achieved amount, achievement %

### 10. `/api/reports/customer-wise/route.ts` (GET)
- Accepts customerId query param
- Returns customer ledger with all sales, returns, collections, current balance

### 11. `/api/reports/bank/route.ts` (GET)
- Accepts bankId query param
- Returns bank book with opening balance, all transactions, current balance

### 12. `/api/reports/transfer/route.ts` (GET)
- Accepts dateFrom, dateTo query params
- Returns stock transfers with godown-wise summary

### 13. `/api/reports/advance-search/route.ts` (GET)
- Accepts q (query string) param
- Searches across products, customers, suppliers, POs, SOs

### 14. `/api/seed/route.ts` (POST)
- Seeds database with sample data using db.$transaction()
- Checks if data already exists (returns "Already seeded" if so)
- Creates: 5 categories, 5 colors, 3 companies, 3 godowns, 3 departments, 5 designations, 5 employees, 5 payment options, 3 card types, 5 customers, 3 suppliers, 10 products, 3 expense/income heads each, 3 banks, 2 segments
- Also creates sample transactions (POs, SOs, expenses, incomes, bank transactions, etc.)

## Testing Results
- All 14 endpoints tested successfully via curl
- Lint passes with 0 errors, 0 warnings
- Proper error handling with try/catch and appropriate HTTP status codes

## Notes
- SQLite doesn't support `mode: 'insensitive'` for contains filter - removed from advance-search
- Used `Record<string, unknown>` instead of `any` for dynamic where clauses to satisfy lint
- All Prisma queries use the shared `db` client from `@/lib/db`
