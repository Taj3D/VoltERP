# Task ID: Liability-Backend
# Agent: Liability Backend Agent

## Task
Reconstruct the Liability Module backend with Accounts Payable Sync and enhanced CSV processing

## Work Summary
- Enhanced `/api/liabilities/route.ts` with aging verification, AP sync status tracking, and transactional batch mode with pre-validation
- Created `/api/liabilities/ap-sync/route.ts` as a new AP aging data endpoint
- Enhanced `/api/liabilities/[id]/route.ts` PUT handler with aging recalculation and balance verification

## Key Changes

### /api/liabilities/route.ts
- Added `computeAgingBucket()` and `computeOverdueDays()` helpers
- Added `getHeadOutstandingBalance()` helper for outstanding balance calculation
- Enhanced `createSingleLiability()` with:
  - "received" type: auto-set dueDate = date + 30 days, compute agingBucket + overdueDays
  - "pay" type: verify payment against outstanding balance, throw error if exceeds
  - Set apSyncStatus = "Synced" on successful double-entry, "Failed" on COA resolution failure
  - Set apLedgerReference = debit entry code (e.g., "LED-00042")
- Created `handleBatchMode()` with strict pre-validation:
  - Validates ALL rows BEFORE processing ANY
  - Required field checks, negative amount rejection, InvestmentHead verification
  - Payment vs outstanding balance check for "pay" type
  - Returns 400 with validationErrors array on any failure

### /api/liabilities/ap-sync/route.ts (NEW)
- GET endpoint with withApiSecurity()
- Returns agingSummary, totalOutstanding, per-head breakdown, syncStatusSummary
- Only includes "received" type liabilities for aging
- Cross-tenant filtering by companyId

### /api/liabilities/[id]/route.ts
- PUT handler accepts agingBucket, apSyncStatus, dueDate
- Auto-recalculates aging bucket and overdue days on amount/date changes
- Verifies payment against outstanding balance when updating to "pay" type
- Excludes current record from balance calculation to avoid double-counting

## Lint Status
Clean ✅

## API Status
All endpoints returning 401 (auth required) ✅
