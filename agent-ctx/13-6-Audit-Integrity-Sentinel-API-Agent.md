# Task 13-6: Audit-Integrity-Sentinel API Agent Work Record

## Task
Fix TWO API route files with multi-tenant companyId isolation, admin-only dismiss, and activity logging.

## Files Modified
1. `/home/z/my-project/src/app/api/notifications/route.ts` — Complete rewrite
2. `/home/z/my-project/src/app/api/data-integrity/route.ts` — Complete rewrite

## Key Changes

### notifications/route.ts
- **CompanyId isolation**: All queries use `const cf = companyId ? { companyId } : {};` + `...cf` pattern
- **Admin-only dismiss**: Only admin can set `isDismissed=true`; manager limited to `mark-read`; SR/Dealer/VAT Auditor fully blocked
- **Activity logging**: `logSentinelActivity()` helper creates AuditLog entries with module "Audit-Integrity-Sentinel"
- **VAT masking**: Extended `VAT_MASKED_MODULES` to include 'Stock'; enhanced `maskVatInMessage()` regex
- **Generate isolation**: All 7 generation queries (products, installments, integrityLogs, periodCloses, ledgerEntries, customers, stockTransfers) filter by companyId

### data-integrity/route.ts
- **CompanyId isolation**: All queries filtered by `...cf`; all created records set companyId
- **Manager RBAC**: View-only (cannot run checks); admin-only for system monitoring
- **Activity logging**: Sentinel logging on GET view and POST run-check
- **Null fallbacks**: "No System Anomalies Found" for empty results

## Verification
- `npx eslint` on both files: zero errors
- `bun run lint`: only pre-existing start-server.js errors
- Dev server: HTTP 200

## Worklog
Appended to `/home/z/my-project/worklog.md` with Task ID 13-6
