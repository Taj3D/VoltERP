# Task 13-8: VAT Auditor Dashboard Masking Fix

## Summary
Fixed 3 issues in the home dashboard (`DashboardPage()` in ElectronicsMartApp.tsx) where VAT auditor was either hiding KPI cards instead of masking them, or not masking monetary values at all.

## Changes Made

### 1. KPI Cards — Hiding → Masking (lines 2208-2215)
- **Before**: `kpis.filter()` removed 3 cards (Today's Sales, Today's Purchase, Total Expenses) for VAT auditor
- **After**: `kpis.map()` shows all 8 cards; 4 monetary labels get `"N/A (Audit Mode)"` value
- **Added Bank Balance** to masked labels (was previously unmasked)

### 2. DashboardChart — VAT Auditor Conditional (lines 2112-2183)
- Added `useAuth()` hook for `isVatAuditor` detection
- Added `typeof m.sales === "number"` type guards to prevent string values breaking BarChart
- VAT auditor sees masked overlay instead of chart with financial data

### 3. Installments Table — Mask Monetary Values (lines 2374-2375)
- Masked `installmentAmount` and `defaultAmount` columns for VAT auditor

## File Modified
- `src/components/ElectronicsMartApp.tsx`

## Verification
- `bun run lint` — zero new errors (only pre-existing start-server.js require imports)
