# Task ID: 2 — Notification API Rebuilder

## Summary
Enhanced `/src/app/api/notifications/route.ts` with 3 new auto-generate triggers, improved GET handler, extended VAT masking.

## Changes Made

### File: `/src/app/api/notifications/route.ts`
Complete rewrite (~430 lines) with:

1. **BalanceMismatch** auto-generate trigger — LedgerEntry date-grouped debit/credit balance check, Critical severity, Admin/Manager only
2. **CreditLimitExceeded** auto-generate trigger — Customer Dr balance > creditLimit check, Warning severity, Admin/Manager only
3. **TransferDelay** auto-generate trigger — StockTransfer In-Transit > 3 days check, Warning severity, all roles
4. **GET `all=true`** query param — returns both read and unread notifications (no isRead filter)
5. **countOnly severity breakdown** — returns `{ count, critical, warning, info }` 
6. **VAT masking extended** — `VAT_MASKED_MODULES` now includes 'HireSales' alongside Ledger/Financial/PeriodClose

## Verification
- `bun run lint`: 0 errors
- Dev server compiles without errors
- All 7 notification types in audit log details
