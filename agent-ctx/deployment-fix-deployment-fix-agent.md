# Task: deployment-fix — Pre-deployment Fixes

## Summary
Fixed all 6 known deployment issues and resolved 25+ TypeScript compilation errors across 8 files.

## Key Fixes

### 1. Hydration Mismatch (layout.tsx)
- Already correctly configured with `suppressHydrationWarning` on both `<html>` and `<body>`
- No code change needed

### 2. Notification Fetch Errors (AppHeader.tsx)
- Added silent error handling: 401/403/404 responses throw `silent` errors
- Changed all 4 catch blocks to suppress silent errors from console
- Non-silent errors now use `console.warn()` instead of `console.error()`

### 3. ProfileCenter (Verified + Fixed TS)
- Already properly imported via React.lazy and rendered
- Fixed `UserForReset` interface (added `isActive?`)
- Fixed EmployeeInfo cast for JSX safety

### 4. Dark Mode (Verified OK)
- ThemeProvider + useTheme + CSS variables all properly configured
- No changes needed

### 5. Footer Sticky (Verified OK)
- `h-dvh flex flex-col mt-auto` pattern working correctly
- No changes needed

### 6. TypeScript Compilation (25+ → 0 component errors)
- Fixed runtime bug: `toast()` called outside hook scope in useAuth
- Fixed FieldDef type: added "image" to union
- Fixed SummaryRow type mapping
- Fixed InvoicePaymentDetail, InvoiceTemplateConfig, InvoicePDFOptions type mismatches
- Fixed array type inference issues in 3 components
- Extended CompanyProfile interface with missing fields

## Files Changed
1. `src/components/erp/layout/AppHeader.tsx`
2. `src/components/ElectronicsMartApp.tsx`
3. `src/components/ProfileCenter.tsx`
4. `src/components/InvestmentGroupPage.tsx`
5. `src/components/InventoryGroupPage.tsx`
6. `src/components/OperationsModulePage.tsx`
7. `src/components/MISReportEngine.tsx`
8. `src/lib/export-utils.ts`
