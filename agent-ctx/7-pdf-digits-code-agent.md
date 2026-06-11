# Task 7-pdf-digits: Fix PDF Currency Digits — English Only

## Summary
Fixed all PDF generation code to guarantee English (Latin) digits (0-9) are used everywhere, never Bengali digits (০-৯).

## Changes
1. **number-format.ts**: Added `toEnglishDigits()` global helper function
2. **invoice-engine.ts**: Applied `toLatinDigits()` to `fmtCurrency()`, `fmtNumber()`, `fmtDate()`, and print date
3. **route.ts**: Applied `toLatinDigits()` to `fmtCurrency()`, `fmtDate()`, and print date
4. **MISReportEngine.tsx**: Replaced inline `toLatinDigits` with centralized import from `number-format.ts`
5. **export-utils.ts**: Applied `toLatinDigits()` to date formatting, timestamps, and re-exported `toEnglishDigits`

## Verification
- `bun run lint` passes with 0 errors
- Dev server running on port 3000 (HTTP 200)
