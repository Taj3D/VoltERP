# Task 5-7: API Bug Fix Agent (Companies, Godowns)

## Summary
Fixed 3 bugs in Companies and Godowns API routes.

## Bugs Fixed

### Bug #1: Companies batch mode missing `logo` field
- **File:** `src/app/api/companies/route.ts`
- **Fix:** Added `logo: item.logo || null,` to batch mode `tx.company.create()` data object

### Bug #2: Godowns API missing duplicate name check
- **File:** `src/app/api/godowns/route.ts`
- **Single mode:** Case-insensitive duplicate check throws error
- **Batch mode:** Case-insensitive duplicate check skips silently

### Bug #3: Godowns code generation uses inefficient count+while loop
- **File:** `src/app/api/godowns/route.ts`
- **Both modes:** Replaced `count() + while` with `findMany + Math.max` pattern
- **Catch block:** Added `already exists` error handling (409 status)

## Lint
- `bun run lint` — PASSED with zero errors
