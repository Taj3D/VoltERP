# Phase 9: Stock API Critical Bug Fixes

## Task: Fix cross-tenant data leaks and financial calculation bugs in stock-details and stock API routes

### File 1: `/home/z/my-project/src/app/api/stock-details/route.ts`

**Bugs Fixed:**
1. **ZERO companyId isolation** — Added `companyId` filter to ALL database queries:
   - `products` query (summary branch)
   - `stockEntries` query (summary branch)
   - `product` lookup changed from `findUnique` to `findFirst` with `companyId`
   - `allProductEntries` single cached query (replaces 3 unscoped queries)

2. **Raw arithmetic → safe financial ops** — Replaced all raw `+`, `-`, `*` with:
   - `safeFinancialAdd` for all IN accumulations (stockMap, runningBal, currentBalance, totalIn, totalOut, totalQty)
   - `safeFinancialSubtract` for all OUT deductions (stockMap, runningBal, currentBalance)
   - `safeFinancialRound` for lineValue and stockValue calculations

3. **Triple stockEntry queries → single cached query** — Replaced 3 separate `db.stockEntry.findMany` calls with:
   - One query fetching all entries for the product (companyId-scoped, ASC ordered)
   - Running balance map computed from single result set
   - Current balance computed from same result set
   - Date filtering done in-memory for display entries
   - Reversed for DESC order display

4. **VAT Auditor masking** — Preserved intact (maskForVatAuditor calls unchanged)

### File 2: `/home/z/my-project/src/app/api/stock/route.ts`

**Bugs Fixed:**
1. **Cross-tenant stock data leak** — Added `companyId` filter to:
   - `stockEntries` query in GET
   - `allGodowns` query in GET
   - `batchMaster` query in GET

2. **POST product-tenant ownership** — Changed from `findUnique` to `findFirst` with `companyId` filter

3. **XSS vector** — Applied `stripHtml()` to `notes` field before storage

4. **Raw +/- in stock map** — Replaced with `safeFinancialAdd`/`safeFinancialSubtract` in:
   - Product total stock accumulation
   - Per-godown tracking
   - Weighted average cost tracking (totalCost, totalQty)
   - currentStock calculation
   - existingQty + openingStock

5. **generateAdjustmentRef scoped** — Added `companyId` parameter and filter to query

6. **computeCurrentStock** — Added `companyId` parameter, changed `findUnique` → `findFirst`, replaced raw reduce with safeFinancialAdd/Subtract loop, replaced `safeFinancialRound(a+b)` with `safeFinancialAdd(a,b)`

7. **computeStockByGodown** — Added `companyId` parameter, added filter to all 4 queries (stockEntries, openingStocks, godowns, product), replaced `delta` pattern with explicit IN/OUT branches using safeFinancialAdd/Subtract

### Imports Added
- `stock-details/route.ts`: `safeFinancialRound`, `safeFinancialAdd`, `safeFinancialSubtract`
- `stock/route.ts`: `stripHtml` (already had the safe financial ops)

### Verification
- Dev server log shows no compilation errors for stock routes
- All existing functionality preserved (VAT masking, period close, SUSPENDED checks, etc.)
