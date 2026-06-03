# Task 13-7: FinancialAuditGroupPage.tsx Client-Side Fixes

## Agent: Financial Audit Group Page Fix Agent

## Summary
Applied 6 targeted surgical fixes to `/home/z/my-project/src/components/FinancialAuditGroupPage.tsx` without rewriting the file.

## Fixes Applied

### FIX 1: Data Loader Response Mapping
- **loadAging**: Changed from `res.products`/`res.bracketSummary` to `res.brackets?.flatMap(...)` / `res.brackets?.map(...)` to flatten bracket products with bracket labels
- **loadNotifications**: Changed from `res.records`/`res.stats` to `res.data` / `{ count, total, critical, warning, info }`
- **loadIntegrity**: Changed from `res.records`/`res.stats` to `res.logs` / computed stats from logs (passed/failed/warnings/healthScore)
- **loadLedger**: Added separate fetch to `/api/ledger-entries?action=verify-balance` for verification data

### FIX 2: RBAC ForbiddenPage for SR/Dealer
- Added `if (isSR || isDealer) return <ForbiddenPage .../>` to renderAgingTab, renderLifecycleTab, renderNotificationsIntegrityTab

### FIX 3: Admin-Only Action Buttons
- Wrapped Post Sales Order, Post Purchase Order, Run All Pending buttons with `userRole === "admin"` check
- Added `userRole === "admin"` to Reverse button condition

### FIX 4: Ledger API Call Methods
- Changed all 4 ledger auto-post calls from PUT with JSON body to POST with query params

### FIX 5: VAT Auditor Masking on KPI Cards
- Added `mask()` to all 9 monetary KPI values (was only 3 before)

### FIX 6: Dismiss Button Admin-Only
- Wrapped dismiss button with `userRole === "admin"` condition

## Verification
- `bun run lint`: Only pre-existing start-server.js errors, zero new errors
