# Task 1: Universal B2B PDF Engine — Auto-fetch Company Profile

## Agent
PDF Company Profile Auto-Fetch Agent

## Task
Modify export-utils.ts so all PDF exports automatically use the company profile from `/api/company-branding` instead of the hardcoded fallback "VoltERP — Electronics Mart IMS".

## Approach
Module-level cache pattern — zero changes to any caller needed.

## Changes Made

### 1. src/lib/export-utils.ts
- Added `_companyCache`, `_companyCacheTime`, `COMPANY_CACHE_TTL` module-level variables
- Added `setCompanyProfileCache()`, `getCompanyProfileCache()`, `resolveCompany()` helper functions
- Modified `drawCorporateHeader()`: all `company?.` references → `resolved?.` (using `resolveCompany(company)`)
- Modified `drawFooter()`: `(company || _companyCache)?.name` as fallback
- Modified `exportToPDF()`: `const company = resolveCompany(options.company)` instead of destructuring
- Modified `exportToPDFSimple()`: `const resolvedCompany = resolveCompany(company)` at top

### 2. src/components/ElectronicsMartApp.tsx
- Added `setCompanyProfileCache` to import from `@/lib/export-utils`
- Added `useEffect` in `ElectronicsMartApp()` that fetches `/api/company-branding` on mount and calls `setCompanyProfileCache()`

## Verification
- `npx eslint src/lib/export-utils.ts` — zero errors
- `npx eslint src/components/ElectronicsMartApp.tsx` — zero errors
- `bun run lint` — only pre-existing start-server.js errors
- Dev server compiled successfully

## Key Design Decisions
- Cache is module-level, not React state, so it persists across renders
- 5-minute TTL for auto-refresh
- Stale cache still returned after TTL (better than no data)
- Explicit `options.company` param always takes priority over cache
- If cache empty AND no explicit param, hardcoded fallback "VoltERP — Electronics Mart IMS" used
- Fire-and-forget fetch on mount — never blocks app startup or PDF exports
