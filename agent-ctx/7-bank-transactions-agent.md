# Task 7 — Bank Transactions API Rewrite

## Agent: Bank Transactions API Agent
## Status: COMPLETED

## Summary
Rewrote two Bank Transactions API route files with multi-tenant companyId isolation, safe financial arithmetic, Fin-Bank-Settlement audit token, and enhanced RBAC.

## Files Modified
1. `/home/z/my-project/src/app/api/bank-transactions/route.ts` — Complete rewrite (GET + POST)
2. `/home/z/my-project/src/app/api/bank-transactions/[id]/route.ts` — Complete rewrite (GET + PUT + DELETE)

## Key Changes

### Multi-tenant Isolation
- GET: Filters by `companyId` from `security.user.companyId`
- POST: Creates records with `companyId` from authenticated user
- /id routes: Cross-tenant validation — pre-fetch record, return 404 if companyId mismatch
- Bank lookups scoped by companyId: `findFirst({ where: { id, ...bankCompanyFilter, isActive: true } })`

### Safe Financial Arithmetic
- All bank balance calculations use `safeFinancialAdd`, `safeFinancialSubtract`, `safeFinancialRound`
- Replaced raw `+`/`-` operators and Prisma `increment`/`decrement` with explicit safe arithmetic
- Running balance computed as `safeFinancialAdd/Subtract(bank.currentBalance, amount)`

### VAT Auditor Masking
- GET (list): `maskFinancialArray()` applied to all records
- GET (single): `maskForVatAuditorFinancial()` applied
- Masks: amount, runningBalance, accountNo, chequeNo, voucherNo, referenceNo, depositorName

### Manager Delete Restriction
- DELETE route calls `checkFinancialDeletePermission(role)` — only admin can delete financial posts

### New Fields
- `chequeNo`, `depositorName`, `referenceNo` — stored with `nullIfEmpty()` helper (null if empty string)

### AuditLog Module Token
- All AuditLog entries use `module: 'Fin-Bank-Settlement'` (was `'BankTransactions'`)

### RBAC
- SR and Dealer blocked from BankTransactions by `WRITE_DENY` and `MODULE_DENY` (enforced by `withApiSecurity`)

### Transfer Logic
- Source: type="Transfer", bank balance decremented with `safeFinancialSubtract`
- Target: type="Deposit", bank balance incremented with `safeFinancialAdd`, paired transaction created with same `companyId`
- Both transactions get companyId

## Verification
- `bun run lint` — zero errors
