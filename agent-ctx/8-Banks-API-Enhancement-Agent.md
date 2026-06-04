# Task ID: 8 — Banks API Enhancement Agent

## Summary
Added batch mode support and duplicate account number check to the Banks API POST handler.

## Changes Made

### File: `src/app/api/banks/route.ts`

**Enhancement #1 — Batch Mode Support (lines 94-193)**
- Added `batchMode` detection right after `request.json()` parsing
- Triggered when `body.batchMode === true && Array.isArray(body.data)`
- Processes each item in `body.data` inside a `db.$transaction` for atomicity
- Per-item validation: HTML stripping, required field checks, bank type validation, negative balance check, duplicate account number check
- COA auto-mapping identical to single mode (Assets → Liquid/Cash Equivalents → bank-specific node)
- Invalid items and duplicates are silently skipped (not erroring the whole batch)
- Single audit log entry with action 'IMPORT', recordId 'BATCH'
- Returns `{ success: true, count, data }` with HTTP 201

**Enhancement #2 — Duplicate Account Number Check in Single Mode (lines 220-233)**
- Added `db.bank.findFirst` check after opening balance validation, before the transaction
- Checks for existing active bank with same `accountNo` within the same `companyId`
- Returns HTTP 409 with descriptive error message on duplicate
- Prevents creating duplicate bank accounts with the same account number within a company

## Lint Check
- `bun run lint` — PASSED with zero errors
