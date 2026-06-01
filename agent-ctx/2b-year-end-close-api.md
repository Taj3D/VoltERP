# Task 2b: Year-End Close API Route

## Summary
Created the Year-End Close automation endpoint at `/api/fiscal-years/[id]/close/route.ts`.

## File Created
- `/home/z/my-project/src/app/api/fiscal-years/[id]/close/route.ts` (350+ lines)

## Key Implementation Details
- POST only, admin-only (double-checked via withApiSecurity + explicit role check)
- Loads FiscalYear by ID with cross-tenant companyId validation
- Verifies status === "OPEN" before proceeding
- Inside $transaction:
  - Identifies nominal accounts (Income, Revenue, Expense, Expenses classifications)
  - Calculates cumulative balances from LedgerEntry within fiscal year date range
  - Finds or creates "Retained Earnings" Equity COA node
  - Generates closing journal voucher (YC- prefix, type: JOURNAL, status: Posted)
  - Creates VoucherLine records for each closing entry
  - Posts to ledger via postVoucherToLedger helper (referenceType: 'YearEndClose')
  - Explicitly zeroes nominal account currentBalances
  - Updates FiscalYear to CLOSED with all closing metadata
- Activity logging with module 'Fin-Statements-Core'
- All arithmetic uses safeFinancialRound/Add/Subtract
- Lint: zero errors
- Dev server: HTTP 200
