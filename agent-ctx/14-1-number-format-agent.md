# Task 14-1: Centralize Number Formatting — Bengali Digit Prevention

## Summary
Created a centralized number formatting utility (`/src/lib/number-format.ts`) that GUARANTEES Latin digits (0-9) in all environments, and replaced all duplicate formatters across 13 component files, 2 API routes, and the export-utils module.

## What Was Done

### 1. Created `/src/lib/number-format.ts`
- `fmtCurrency(value)` — 2 decimal places with grouping
- `fmtNumber(value)` — General number with grouping
- `fmtDecimal(value, decimals)` — Custom decimal places
- `fmtBDT(value)` — Tk. prefixed currency
- `fmtSafeCurrency(value)` / `fmtSafeNumber(value)` — Null-safe formatters
- All functions include Bengali-to-Latin digit replacement pass

### 2. Updated 13 Component Files
Each file: removed local `Intl.NumberFormat` declaration, imported from `@/lib/number-format`, updated `fmt`/`fmtCurrency`/`fmtNumber` functions to delegate to centralized utility.

### 3. Fixed API Routes
- `notifications/route.ts`: 3 bare `.toLocaleString()` → `fmtNumber()`
- `credit-check/route.ts`: 4 `.toLocaleString('en-US', ...)` → `fmtCurrency()`

### 4. Updated export-utils.ts
- Replaced `bdtFormatter` with delegation to `fmtCurrency`
- Updated `formatCellValue` and `formatSanitizedCurrency` to use `fmtCurrency` directly

## Verification
- `bun run lint` passes cleanly
- Dev server running on port 3000
- Module tested: produces correct Latin digit output

## Follow-up Needed
- 8 additional component files still use local `Intl.NumberFormat` (not in task scope)
- `_deprecated/` folder files not updated
