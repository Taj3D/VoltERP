# Task 1+4+7: Backend API Fix Engineer

## Summary
Fixed and enhanced 3 API routes for the Electronics Mart IMS project.

## Files Modified
1. `src/app/api/auto-po/route.ts` - Fixed PO formula (avgDailySales × leadTime - currentStock + safetyStock), added VAT masking
2. `src/app/api/stock/route.ts` - Added godownId/categoryId/status query params, stockStatus field, VAT masking
3. `src/app/api/stock-details/route.ts` - Complete rewrite with 7-source movement trails, running balance, summary

## Key Decisions
- Auto PO: Uses 90-day rolling window for avgDailySales, 14-day lead time, reorderLevel as safety stock
- Stock API: stockStatus determined by comparing currentStock against reorderLevel
- Stock Details: Running balance computed from all-time entries (ascending), then mapped to filtered+descending result set for accuracy

## Lint Status
0 errors on all 3 modified files (pre-existing InventoryGroupPage.tsx parse error unrelated)

## Next Agent Notes
- The 3 API routes are ready for frontend integration
- `/api/stock` now accepts `godownId`, `categoryId`, `status` query params
- `/api/stock-details` requires `productId` for detailed trail; without it returns product summary list
- `/api/auto-po` response now includes `avgDailySales`, `leadTimeDays`, `safetyStock` fields
