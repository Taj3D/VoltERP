# Task 2-api-fixes — API Fix Agent Work Record

## Summary
Fixed 6 issues in Investment module API routes.

## Changes Made

### Fix 1: Asset financial validations (POST /api/assets/route.ts)
- Added validations: amount > 0, purchaseValue >= 0, salvageValue >= 0, usefulLifeMonths >= 0
- Added active InvestmentHead verification (checks existence AND isActive)
- All return 400 with clear error messages

### Fix 2: netBookValue recalculation (PUT /api/assets/[id]/route.ts)
- Changed `netBookValue: body.purchaseValue !== undefined ? netBookValue : undefined` to `netBookValue`
- Always recalculates and updates regardless of which field changed

### Fix 3: Audit log for investments POST (/api/investments/route.ts)
- Added auditLog.create() inside $transaction matching investment-heads pattern
- Module: 'InvestmentHeads', includes recordId, recordLabel, userId, userName, details

### Fix 4: CSV template phantom fields (/api/investments/csv-template/route.ts)
- Heads: Removed "Share Percentage", "Capital Value". Added Code, Is Active, Profile Image, NID images, Company ID
- Assets: Removed "Asset Sub-Category", "Location Tag", "Depreciation Rate". Added Is Active, Company ID

### Fix 5: companyId filtering on GET
- investment-heads GET: Added `if (security.user.companyId) where.companyId = security.user.companyId`
- investments GET: Added same filter

### Fix 6: companyId on POST
- investment-heads POST: Added `companyId: body.companyId || security.user.companyId || null`
- investments POST: Added same logic

## Files Changed
1. src/app/api/assets/route.ts
2. src/app/api/assets/[id]/route.ts
3. src/app/api/investments/route.ts
4. src/app/api/investments/csv-template/route.ts
5. src/app/api/investment-heads/route.ts

## Verification
- Dev server HTTP 200 ✅
- bun run lint passes ✅
- No TypeScript errors ✅
