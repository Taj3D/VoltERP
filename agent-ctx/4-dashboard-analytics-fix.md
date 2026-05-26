# Task 4 - Fix Dashboard Analytics API Routes

## Summary
Fixed 6 critical bugs across 2 API route files (`/api/dashboard-analytics/route.ts` and `/api/dashboard/route.ts`).

## Fixes Applied

### FIX 1: Inventory Value Calculation (3 locations → fixed in both files)
**Problem**: Code computed `SUM(costPrice) × SUM(openingStock)` instead of `SUM(costPrice × openingStock)`. Also, `Math.max(..., 1)` guard was wrong — if total stock is 0, inventory value should be 0, not costPrice × 1.

**Solution**: Replaced aggregate queries with `db.product.findMany({ where: { isActive: true }, select: { costPrice: true, openingStock: true } })` and computed `products.reduce((sum, p) => sum + Number(p.costPrice) * Number(p.openingStock), 0)`.

**Locations fixed**:
- `dashboard-analytics/route.ts` → `handleKPI()` (lines 91-95)
- `dashboard-analytics/route.ts` → `handleFinancialRatios()` (lines 335-349)
- `dashboard/route.ts` → main GET handler (lines 40-43, 206)

### FIX 2: lowStockCount Filter (both files)
**Problem**: `openingStock: { lte: 0 }` only counted products with zero or negative stock, not products below their reorder level.

**Solution**: Fetch all active products and filter in JS: `products.filter(p => Number(p.openingStock) <= Number(p.reorderLevel))`. This works around Prisma SQLite's lack of field-to-field comparison in `where`.

**Locations fixed**:
- `dashboard-analytics/route.ts` → `handleKPI()` line 76
- `dashboard/route.ts` → lowStockProducts query (lines 129-133, also removed broken `db.product.fields.reorderLevel` syntax)

### FIX 3: Bank Balance - currentBalance not openingBalance
**Problem**: `dashboard/route.ts` used `_sum: { openingBalance: true }` for bank balance, but should use `currentBalance` which reflects actual running balance after transactions.

**Solution**: Changed to `_sum: { currentBalance: true }` in both the aggregate query and the response mapping.

**Location fixed**: `dashboard/route.ts` lines 46, 207

### FIX 4: Revenue Filter - Exclude Cancelled not just Draft
**Problem**: `status: { not: 'Draft' }` included Cancelled orders in revenue calculations. Cancelled orders should be excluded.

**Solution**: Changed all revenue-related status filters to `{ notIn: ['Draft', 'Cancelled'] }` in both files. Also updated `dashboard/route.ts` from `{ in: ['Confirmed', 'Delivered'] }` to `{ notIn: ['Draft', 'Cancelled'] }` for consistency (includes Pending/Approved orders which are valid revenue).

**Locations fixed** (all instances in both files):
- `dashboard-analytics/route.ts`: handleKPI, handleMonthlyTrend, handleCategoryTurnover, handleFinancialRatios, handleTopPerformers, handlePaymentMix, handleReceivablesAging, calculateTotalReceivables, calculateTotalPayables
- `dashboard/route.ts`: confirmedSalesAgg, confirmedPurchasesAgg, salesLines, salesOrders, purchaseOrders

### FIX 5: Date Range Filtering
**Problem**: No date range query parameter support on dashboard-analytics API.

**Solution**: Added `startDate` and `endDate` query parameter parsing from URL search params. Created a `dateFilter()` helper that applies `gte`/`lte` date constraints to any base `where` clause. Passed `dateFilter` to all handler functions (handleKPI, handleMonthlyTrend, handleCategoryTurnover, handleFinancialRatios, handleTopPerformers, handlePaymentMix, handleReceivablesAging).

Usage: `/api/dashboard-analytics?type=kpi&startDate=2024-01-01&endDate=2024-12-31`

### FIX 6: Receivables Aging - Sort by Date for FIFO
**Problem**: Sales orders were not sorted, causing incorrect FIFO allocation of collections in the aging calculation.

**Solution**: Added `orderBy: { date: 'asc' }` to the sales orders query in `handleReceivablesAging()`, ensuring oldest orders are processed first for proper FIFO allocation.

**Location fixed**: `dashboard-analytics/route.ts` → `handleReceivablesAging()`

## Verification
- `bun run lint` → 0 errors, 0 warnings
- Dev server running cleanly on port 3000
