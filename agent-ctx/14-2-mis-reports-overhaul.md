# Task 14-2: MIS Reports API Route Overhaul

## Summary
Complete overhaul of `/home/z/my-project/src/app/api/mis-reports/route.ts` enforcing 4 audit directives.

## Changes Made

### Files Modified
1. **`/home/z/my-project/src/app/api/mis-reports/route.ts`** — Complete rewrite (~2800 lines)
2. **`/home/z/my-project/src/lib/api-security.ts`** — RBAC access changes

### Directive 1: Multi-Tenant Isolation
- All 42 report functions now filter by `companyId` from `security.user.companyId`
- Nested includes also filter by companyId
- companyId comes from authenticated user, NOT from request params

### Directive 2: Safe Financial Arithmetic
- Added: `safeFinancialAdd()`, `safeFinancialSubtract()`, `safeFinancialRound()`
- All financial + operations replaced with `safeFinancialAdd`
- All financial - operations replaced with `safeFinancialSubtract`
- Running balance in supplierLedger/customerLedger uses safe arithmetic

### Directive 3: Intl.NumberFormat('en-BD') and Logging
- `fmt()` uses `Intl.NumberFormat('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })`
- `logMisActivity()` writes to `db.userActivityLog.create()`
- `getReportModuleToken()` maps report types to module tokens
- Empty strings replaced with "—" for optional fields
- maskVat applied to ALL financial values, not just costPrice/wholesalePrice/dealerPrice

### Directive 4: RBAC & VAT Masking
- api-security.ts updated: dealer can pass withApiSecurity for MISReports, sr already could
- dealer: Returns 403 "Access denied. Dealers do not have access to MIS Reports."
- sr: Only allows SR_ALLOWED_TYPES = ['sales', 'hire-sales', 'customer-wise', 'sr']
- vat_auditor: Forces vatMode=true, applies deepMaskFinancials to rows/summary, zeros chartData
- Admin/manager: Full access, no masking

## Verification
- ESLint: Zero errors on both modified files
- Dev server: No compilation errors
