# Task 6: Critical Frontend Fixes in Electronics Mart IMS

## Summary
Applied all 15 frontend bug fixes to `/home/z/my-project/src/app/page.tsx`. Lint passes with 0 errors, dev server compiles successfully.

## Fixes Applied

### FIX 1: Search RBAC Filtering (HIGH)
- Added `hasAccess` and `hasItemAccess` filtering to the `searchItems` useMemo in `AppLayout`
- Filter groups by `hasAccess(group.key)`, filter items within groups by `hasItemAccess(user?.role, item.key)`
- Added `hasAccess` to the `useAuth()` destructuring in `AppLayout`
- Added dependency on `[hasAccess, user]` for the useMemo

### FIX 2: Code Field Immutable in Edit Mode (MEDIUM)
- Changed condition from `field.key === "code" && !editItem` to `field.key === "code"`
- Code field is now read-only in BOTH create and edit modes (it's auto-generated)

### FIX 3: Stock Page Category Column Fix (HIGH)
- Changed `item.categoryName` to `item.category` in StockPage table cell
- API returns `category` not `categoryName`

### FIX 4: StockDetails Product Name Fix (HIGH)
- Changed `item.productId` to `item.product?.name || item.productId`
- Previously showed raw UUID; now shows product name when available

### FIX 5: GenericModulePage Export Uses visibleColumns (HIGH)
- Changed `exportCSV` and `exportPDF` functions to use `visibleColumns` instead of `columns`
- VAT Auditor can no longer export hidden cost/margin columns

### FIX 6: Add Missing Companies Form Fields (MEDIUM)
- Added `address` (textarea, not required), `phone` (text, not required), `email` (email, not required) to companies formFields in SIDEBAR_CONFIG

### FIX 7: Add currentBalance Column to Banks (MEDIUM)
- Added `{ key: "currentBalance", label: "Current Balance", type: "currency" }` column
- Added `{ key: "isActive", label: "Status", type: "boolean" }` column

### FIX 8: Add Missing MIS Report Keys (MEDIUM)
- Added 8 missing keys to `misReportKeys` Set:
  - "product-wise-benefit", "income-report", "adjustment-report", "transaction-summary"
  - "monthly-transaction", "showroom-analysis", "bank-ledger-report", "transfer-report"

### FIX 9: Fix Audit Logs Page Empty Data (CRITICAL)
- Changed `res.data || []` to `res.data || res.logs || []` in GenericModulePage's loadData
- Now handles audit-logs API response format `{ logs, total, modules, actions }`

### FIX 10: Add "replacements" to Dealer ITEM_ACCESS_DENIED (MEDIUM)
- Added "replacements" to the dealer denied items array in ITEM_ACCESS_DENIED

### FIX 11: Fix DashboardChart to Use dashboard-analytics API (HIGH)
- Replaced 12 separate API calls (6 months × sales + purchases) with single call to `/api/dashboard-analytics?type=monthly-trend&months=6`
- Component signature changed from `DashboardChart({ stats })` to `DashboardChart()`
- Uses returned `res.data` directly for chart data

### FIX 12: Fix DashboardPage Field Name Mismatches (HIGH)
- `stats.todaySales` → `stats.todaysSales || 0`
- `stats.todayPurchase` → `stats.todaysPurchases || 0`
- `stats.totalBankBalance` → `stats.cashBalance || 0`
- `stats.lowStockItems` → `stats.lowStockProducts?.length || 0`
- Aligned with `/api/dashboard` response format

### FIX 13: Add VAT AUDIT MODE Banner to GenericModulePage (LOW)
- Added amber banner at top of GenericModulePage when `isVatAuditor` is true
- Shows "VAT AUDIT MODE — Internal margins hidden" with Lock icon

### FIX 14: Frontend Auto-Code for Categories (MEDIUM)
- Categories now use "CAT-NNN" format (e.g., CAT-001, CAT-002)
- Other modules continue using "NNNNN" 5-digit padded format
- Parses existing codes with regex `/CAT-(\d+)/` to find next number

### FIX 15: Add Cross-Module Click-Through Navigation (HIGH)
- Added `onNavigate` optional prop to PurchaseOrdersPage, SalesOrdersPage, HireSalesPage, SalesReturnsPage, PurchaseReturnsPage
- Pass `onNavigate={(page) => setCurrentPage(page)}` from renderPage
- Made customer names clickable (navigate to 'customers') in SalesOrdersPage, HireSalesPage, SalesReturnsPage
- Made supplier names clickable (navigate to 'suppliers') in PurchaseOrdersPage, PurchaseReturnsPage
- Clickable names styled with `cursor-pointer text-blue-600 hover:underline`

## Verification
- `bun run lint`: 0 errors, 0 warnings
- Dev server compiles and runs successfully on port 3000
- All existing functionality preserved
