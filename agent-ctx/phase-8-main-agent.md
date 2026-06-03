# Phase 8: Basic Modules Deep Audit - Work Record

## Task ID: phase-8
## Agent: Main Agent
## Status: COMPLETED

## Summary
Deep audit of Basic Modules (Companies, Categories, Colors, Brands, Units, Products, Banks) with 7 bugs fixed.

## Bugs Found & Fixed

1. **BUG: `en-IN` locale in `fmt()` and `fmtCurrency()`** — BasicModulesGroupPage.tsx lines 41, 51 used `en-IN` locale for currency formatting. Changed to `en-US` for consistency with Phase 2/3 currency digit fix.

2. **BUG: `en-IN` locale in ProductsPage** — ElectronicsMartApp.tsx lines 256, 1248 used `en-IN` for Intl.NumberFormat and toLocaleString. Changed to `en-US`.

3. **CRITICAL BUG: `mode: 'insensitive'` with `equals` crashes SQLite** — Categories, Colors, Brands, Units API routes used Prisma's `{ equals: value, mode: 'insensitive' }` which is NOT supported by SQLite (only PostgreSQL). This caused ALL CREATE operations on these modules to crash with Prisma invocation errors. Fixed by replacing with `findMany()` + JavaScript `toLowerCase()` comparison for case-insensitive matching.

4. **BUG: Companies API missing unique name check** — The companies POST endpoint didn't check for duplicate company names. Added SQLite-compatible case-insensitive duplicate name check.

5. **BUG: Companies API missing batchMode support** — Unlike categories/colors/brands/units, companies didn't support `batchMode` for CSV import. Added batchMode support.

6. **BUG: Companies API code auto-generation collision** — All basic modules used `findFirst({ orderBy: { createdAt: 'desc' } })` to get the last code and increment, but this could collide with soft-deleted records. Fixed by using `findMany()` + `Math.max()` across ALL records (including soft-deleted) to find the true maximum code number.

7. **BUG: PDF financialFooter for core modules used `userRole` instead of `displayName`** — Core modules (companies, categories, colors, brands, units, banks) used `userRole` for `preparedBy` and `printedBy` in PDF exports, while structural/operational modules used `displayName`. Fixed to consistently use `authUser?.displayName || authUser?.name || userRole`.

8. **BUG: Bank API transaction timeout** — Bank creation with CoA auto-mapping exceeded Prisma's default 5-second transaction timeout. Added `{ timeout: 15000 }` to the `$transaction` call.

## Files Modified
- src/components/BasicModulesGroupPage.tsx (en-IN→en-US, financialFooter fix)
- src/components/ElectronicsMartApp.tsx (en-IN→en-US)
- src/app/api/categories/route.ts (SQLite-compatible unique check, code generation fix)
- src/app/api/categories/[id]/route.ts (SQLite-compatible unique check)
- src/app/api/colors/route.ts (SQLite-compatible unique check)
- src/app/api/colors/[id]/route.ts (SQLite-compatible unique check)
- src/app/api/brands/route.ts (SQLite-compatible unique check)
- src/app/api/brands/[id]/route.ts (SQLite-compatible unique check)
- src/app/api/units/route.ts (SQLite-compatible unique check)
- src/app/api/units/[id]/route.ts (SQLite-compatible unique check)
- src/app/api/companies/route.ts (full rewrite: text sanitizer, unique check, batchMode, code generation fix)
- src/app/api/banks/route.ts (transaction timeout fix)

## Verified Working
- Companies: GET ✅, POST ✅, PUT ✅, DELETE ✅, duplicate name check ✅, batchMode ✅
- Categories: GET ✅, POST ✅, PUT ✅, DELETE ✅, duplicate name check ✅
- Colors: GET ✅, POST ✅, PUT ✅, DELETE ✅, duplicate name/colorCode check ✅
- Brands: GET ✅, POST ✅, duplicate name check ✅
- Units: GET ✅, POST ✅, duplicate name/code check ✅
- Products: GET ✅, POST ✅, PUT ✅, DELETE ✅ (in ElectronicsMartApp.tsx)
- Banks: GET ✅, POST ✅ (with timeout fix)
- Export CSV/PDF/Import CSV buttons: All 7 sub-pages in BasicModulesGroupPage ✅, Products page ✅
- Form validation: Required fields validated on all forms ✅
- PDF footer: Uses displayName for all modules ✅
