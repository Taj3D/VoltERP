# Task 15-3: Consolidate duplicate toLatinDigits() and ensure English digits everywhere

## Summary
Consolidated the duplicate `toLatinDigits()` function from `clipboard-utils.ts` into the canonical implementation in `number-format.ts`.

## Changes Made

### 1. Exported `toLatinDigits` from `number-format.ts`
- Changed `function toLatinDigits` to `export function toLatinDigits` (line 14)
- This makes the canonical implementation available for import by other modules

### 2. Removed duplicate in `clipboard-utils.ts`
- Removed the local `toLatinDigits()` function (old lines 11-14)
- Added import: `import { toLatinDigits } from "./number-format";`
- Kept existing `import { ColumnDef } from "./export-utils";`

### 3. Searched for other `toLatinDigits` implementations
- Grep across all `/home/z/my-project/src` files
- **Result**: Only two files had the function — `number-format.ts` (now canonical+exported) and `clipboard-utils.ts` (now importing)
- No other local implementations found

### 4. Searched for Bengali locale usage (`bn-BD`, `bn-IN`, `bn`)
- Grep across all `/home/z/my-project/src` files
- **Result**: Only found in `page.tsx.bak` (a backup file, not active code)
- No active files use Bengali locale strings
- All active code uses `en-US` or `en-GB` locale for `Intl.NumberFormat` / `toLocaleString`

## Verification
- `bun run lint` passes with zero errors
- Dev server running on port 3000, no compilation errors
- Only one `toLatinDigits` definition remains (in `number-format.ts`)
- Only one import of `toLatinDigits` exists (in `clipboard-utils.ts`)

## Files Changed
1. `/home/z/my-project/src/lib/number-format.ts` — Added `export` keyword to `toLatinDigits`
2. `/home/z/my-project/src/lib/clipboard-utils.ts` — Removed duplicate function, added import from `./number-format`
