# Task 3 — Accounting Reports Page Reconstruction

## Agent: full-stack-developer

## Work Summary
Completely rebuilt `/home/z/my-project/src/components/AccountingReportsPage.tsx` from 3 tabs (728 lines, simple export utils) to 5 tabs (~1050 lines, full executive export utils).

## What Was Done
1. Added **Chart of Accounts** tab — live CoA tree view from `/api/chart-of-accounts` with recursive expand/collapse, 5 stat cards, classification PieChart, search/filter
2. Added **Balance Sheet** tab — live from `/api/reports/balance-sheet` with financial ratios, composition PieCharts, receivables/payables breakdown tables, period close badge
3. Upgraded all PDF exports from `exportToPDFSimple` to full `exportToPDF` with ColumnDef, company branding (logo from `/api/company-branding`), financialFooter (4 signature blocks), systemNotice
4. Upgraded all CSV exports from `exportToCSVSimple` to full `exportToCSV` with ColumnDef type definitions, vatMaskedColumns, UTF-8 BOM
5. Enhanced existing tabs (Cash In Hand, Trial Balance, P&L) with stat cards, classification badges, additional charts
6. Implemented `initialTab` prop mapping for sidebar navigation
7. Maintained RBAC (SR/Dealer → 403), VAT Auditor masking, deep navy blue theme

## Files Modified
- `/home/z/my-project/src/components/AccountingReportsPage.tsx` — Complete rebuild

## Verification
- `bun run lint` passes cleanly
- Dev server running on port 3000 (HTTP 200)
