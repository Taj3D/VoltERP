# Task: Liability-Frontend — Reconstruct Liability Module Frontend

## Summary
Rebuilt all 3 Liability tabs (Receive, Pay, Report) in InvestmentGroupPage.tsx with AP Sync status, aging buckets, chart visualization, enhanced exports, and payment validation.

## Key Changes
1. **New State & Constants**: `apAgingData`, `apAgingLoading`, `AGING_BUCKET_COLORS`, `AP_STATUS_COLORS`
2. **AP Sync Loader**: `loadApAgingData()` called on liability-receive and liability-pay tab activation
3. **Liability Receive Tab**: 5 summary cards (added AP Synced Rate), 11-column table (added AP Status, Aging, Due Date, Overdue), enhanced PDF export
4. **Liability Pay Tab**: Same enhancement pattern, plus payment validation against outstanding balance
5. **Liability Report Tab**: 7 summary cards (added AP Synced %, Overdue Count), aging buckets section with stacked bar, PieChart + BarChart, enhanced per-head table with AP Status and Aging columns
6. **Form Dialogs**: Added Due Date field and AP Sync "Will be synced on save" indicator
7. **Export Columns**: liabExportColumns expanded to 10 cols, reportExportColumns to 8 cols, liabImportFields to 8 fields
8. **API**: Created `/api/liabilities/ap-sync/route.ts`

## Files Modified
- `src/components/InvestmentGroupPage.tsx`
- `src/app/api/liabilities/ap-sync/route.ts` (NEW)

## Lint
Clean ✅ | Dev Server Running ✅ | No other tabs modified ✅
