# Task 2 — Financial Double-Entry Linkage for Assets API

## Summary
Rewrote `/api/assets/route.ts` to add full financial double-entry ledger posting within the same Prisma transaction as asset creation.

## What Changed
- **Added `safeFinancialAdd` import** — was missing from the original import list
- **Created `findOrCreateAssetCoa()`** — locates or creates the appropriate Asset COA node (Fixed Assets or Current Assets) based on `assetCategory`
- **Created `findOrCreateEquityCoa()`** — locates or creates the Equity COA node for the credit side
- **Enhanced `createSingleAsset()`** with 6-step double-entry pipeline:
  1. Insert Asset record (unchanged from original)
  2. Find/create Asset COA + Equity COA
  3. Generate sequential LED-XXXXX codes
  4. Create two LedgerEntry records (debit Asset, credit Equity)
  5. Update both COA currentBalance values using safeFinancialAdd
  6. Create LedgerAutoPost tracking record (LAP-XXXXX, sourceType: "Asset", status: "Posted")
- **Batch mode** inherits all double-entry logic automatically since it calls `createSingleAsset()` per item
- **Removed old partial posting** — the original code only posted a single Equity credit for Fixed Assets, with no debit pair, no COA balance updates, and no LedgerAutoPost

## Preserved Functionality
- VAT Auditor masking (GET and POST responses)
- Period close check (single mode)
- Idempotency guard
- Investment Head validation
- Fixed Asset depreciation field validation
- Audit logging (AuditLog + logUserActivity)
- Batch mode support

## Verification
- Lint: clean
- Dev server: running on port 3000
- API route: responds with auth challenge (expected for unauthenticated request)
