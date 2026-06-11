# Task 9: Fix SalesModulePage.tsx Frontend Issues

## Agent: main
## Status: COMPLETED

## Summary

Applied 6 fixes to `src/components/SalesModulePage.tsx`:

1. **CSV Import buttons** - Replaced broken `doImportCSV` generic handler with `doImportSO` and `doImportSR` specific handlers. Added proper field definitions, `?import=true` API path, admin-only visibility. Removed Import from Hire Sales tab (no API).

2. **Date range filters for Hire Sales** - Added `hsDateFrom`/`hsDateTo` state, date inputs in filter bar, date filtering in `hsFiltered` useMemo, and `dateFrom`/`dateTo` query params in `loadHireSales`.

3. **Infinite re-render guard** - Added `loadingRef` (useRef) with concurrent fetch flags. Each loader checks/resets the flag to prevent duplicate fetches when filter changes trigger useEffect.

4. **Scrollable tables** - Added `max-h-[70vh] overflow-y-auto` to all three table containers.

5. **Print Invoice button** - Added Printer icon button in SO actions column that opens `/api/sales-orders/invoice-pdf?id=${item.id}` in new tab.

6. **Responsive design** - Changed table `min-w-[600px]` to `min-w-[800px]` for better horizontal scroll on mobile.

## Files Changed
- `src/components/SalesModulePage.tsx`
- `worklog.md` (appended task log)
