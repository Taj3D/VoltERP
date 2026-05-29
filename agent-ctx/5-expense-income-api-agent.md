# Task 5 - Expense/Income API Rewrite Agent

## Task
Rewrite 4 API route files for Expenses & Incomes with multi-tenant companyId isolation, safe financial arithmetic, Fin-Ledger-Transaction audit token, and enhanced RBAC.

## Files Modified
1. `/home/z/my-project/src/app/api/expenses/route.ts` - Complete rewrite
2. `/home/z/my-project/src/app/api/expenses/[id]/route.ts` - Complete rewrite
3. `/home/z/my-project/src/app/api/incomes/route.ts` - Complete rewrite
4. `/home/z/my-project/src/app/api/incomes/[id]/route.ts` - Complete rewrite
5. `/home/z/my-project/worklog.md` - Appended work log entry

## Key Changes Summary

### Multi-tenant Isolation
- GET routes filter by `companyId` from `security.user.companyId`
- /id routes cross-tenant validate: pre-fetch record, return 404 if companyId mismatch

### Safe Financial Arithmetic
- All amount parsing uses `safeFinancialRound()` instead of `parseFloat()`
- Bank balance decrement (expenses): `safeFinancialSubtract(currentBalance, amount)`
- Bank balance increment (incomes): `safeFinancialAdd(currentBalance, amount)`
- Bank balance reversal in PUT/DELETE: uses appropriate safe function
- No raw Prisma `increment`/`decrement` operations

### VAT Auditor Masking
- GET /api/expenses & /api/incomes: `maskFinancialArray()` on array responses
- GET /api/expenses/[id] & /api/incomes/[id]: `maskForVatAuditorFinancial()` on single record

### RBAC Delete Restriction
- DELETE routes call `checkFinancialDeletePermission(role)` — only admin can delete
- Returns 403 for non-admin roles attempting delete

### AuditLog Module Token
- All AuditLog entries use `module: 'Fin-Ledger-Transaction'` (was 'Expenses'/'Incomes')
- Includes `type: 'Expense'` or `type: 'Income'` in details JSON for differentiation

### New Fields
- `companyId`, `chequeNo`, `voucherNo` accepted in POST/PUT
- Empty string defaults: `chequeNo`, `voucherNo`, `description` → null

### BatchMode Support
- POST routes support `body.batchMode === true` with `body.data` array
- Extracted `createSingleExpense` and `createSingleIncome` helpers for shared logic

### Double-Entry Ledger
- Expenses: Dr: expense head, Cr: cash/bank
- Incomes: Cr: income head, Dr: cash/bank
- PUT: Full reversal (4 entries: 2 reversal + 2 new) for proper double-entry

## Verification
- `bun run lint` passed with zero errors
- Dev server stable on localhost:3000 (HTTP 200)
