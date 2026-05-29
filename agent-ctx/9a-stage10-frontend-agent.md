# Task 9a — Stage 10 Frontend Agent Work Record

## Task
Update ExpensesIncomesPage component with Stage 10 requirements

## Files Modified
- `/home/z/my-project/src/components/ExpensesIncomesPage.tsx` — Complete update with all 6 requirements
- `/home/z/my-project/worklog.md` — Appended work log entry

## Summary of Changes

1. **Intl.NumberFormat('en-BD')**: Created `bdCurrencyFmt` formatter instance, updated `fmt()` to use it for currency and number types
2. **VAT Auditor Masking**: Extended masking to chequeNo, voucherNo, bank name, bank account number; added `maskIfVatAuditor()` helper
3. **New Form Fields**: Added chequeNo and voucherNo to formData state, Create/Edit dialog, handleSave payload, openEdit pre-population, CSV import
4. **Enterprise PDF Footer**: Switched from `exportToPDFSimple` to `exportToPDF` with `financialFooter` option and `companyProfile` from /api/company-branding
5. **Manager Delete Restriction**: Added `isAdmin` check, `deleteDisabled()` helper, Tooltip-wrapped disabled delete buttons with "Only administrators can delete financial posts" message, orange manager restriction banner
6. **Empty Field Defaults**: chequeNo, voucherNo, description show "—" when null/empty in expanded detail view; added Bank Account row

## Verification
- `bun run lint` — PASSED (zero errors)
- Dev server — HTTP 200, stable
