# Task 13-4: Stage 13 Audit API Route Rewrite

## Agent
Stage 13 Audit API Route Builder

## Task
Rewrite Ledger Auto-Post and Data Integrity API routes with full Stage 13 compliance

## Files Modified
1. `/home/z/my-project/src/app/api/ledger-auto-post/route.ts` — Complete rewrite
2. `/home/z/my-project/src/app/api/data-integrity/route.ts` — Complete rewrite

## Key Changes

### Ledger Auto-Post
- `withApiSecurity` module changed from `LedgerEntries` to `LedgerAutoPost`
- `companyId: security.user.companyId` added to all LedgerEntry, LedgerAutoPost, ChartOfAccount creates
- `findOrCreateAccount` now accepts and applies companyId parameter
- `checkAutoPostAdminPermission` enforced on all POST actions (admin-only triggers)
- `maskForVatAuditor` (from api-security) replaces inline `maskForVat` helper — masks `amount` field
- `safeFinancialRound/Add/Subtract` used for all amount calculations and accumulations
- `logUserActivity` with module `Audit-AutoPost-Engine` replaces raw `db.auditLog.create`
- `runAllPending`: Each order posting wrapped in individual try/catch (defensive transaction fallback)
- GET allows admin+manager viewing; SR/Dealer blocked by MODULE_DENY

### Data Integrity
- `withApiSecurity` module changed from `LedgerEntries` to `DataIntegrityLog`
- `companyId: security.user.companyId` added to all DataIntegrityLog creates
- GET filtered by companyId
- `maskForVatAuditor` masks `discrepancy`, `expectedValue`, `actualValue`
- All 4 integrity checks scoped by companyId:
  - LedgerBalance: passes companyId to verifyLedgerBalance()
  - StockReconciliation: filters Product by companyId
  - AccountConsistency: filters LedgerEntry and ChartOfAccount by companyId
  - VATReconciliation: filters via line.product.companyId relation
- `safeFinancialRound/Add/Subtract` for all numeric calculations
- `logUserActivity` with module `Audit-Integrity-Sentinel`
- SR/Dealer: 403, VAT Auditor: read-only

## Verification
- `bun run lint` — ZERO errors
- Dev server stable on localhost:3000 (HTTP 200)

