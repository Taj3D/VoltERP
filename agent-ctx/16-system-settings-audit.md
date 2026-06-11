# Task 16: Fix bugs in System Settings + White-labeling

## Agent: Code Auditor
## Date: 2026-03-05
## Status: COMPLETE

## Summary
Audited all 5 tabs of SystemSettingsGroupPage.tsx, all company branding/white-labeling APIs, and all listed API routes. Found and fixed 4 bugs in the system settings module, plus 1 blocking lint error in an unrelated file.

## Bugs Fixed (4 + 1 lint blocker):

1. **CompanyData interface missing `binNumber` and `bankDetails`** — Interface didn't include these fields even though Prisma model, API, and UI all supported them
2. **loadCompany not mapping `website`, `binNumber`, `bankDetails`** — Website hardcoded to null, binNumber and bankDetails not mapped at all from API response
3. **Company Branding API missing `website`** — GET select, PUT update data, PUT sanitization, and response objects all missing website
4. **Company Branding Cache not cleared after save** — Other components would use stale cached branding data after admin saves changes
5. **MISReportEngine.tsx missing JSX closing brace** — Parsing error blocking lint

## Files Modified:
- `src/components/SystemSettingsGroupPage.tsx`
- `src/app/api/company-branding/route.ts`
- `src/components/MISReportEngine.tsx`

## Lint Status: PASSING ✅
