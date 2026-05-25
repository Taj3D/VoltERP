# Task 9 - Backend API Schema & Route Updates

## Agent: main
## Task: Update Prisma schema and create/update API routes to support new pages

### Changes Made

#### 1. Prisma Schema Updates (`prisma/schema.prisma`)
- **HireSales model**: Added new fields:
  - `duration` changed from `String?` to `Int @default(0)` — number of installments
  - `installmentAmount Float @default(0)` — amount per installment
  - `totalPaid Float @default(0)` — total amount paid so far
  - `currentStatus String @default("Active")` — payment status tracking
  - `nextPaymentDate DateTime?` — next payment due date
  - Kept existing `status` field for order status (separate from `currentStatus`)

- **Verified existing fields already present**:
  - `Liability.type` (String, default "received") and `Liability.paymentMethod` (String, optional) ✅
  - `OrderSheet.companyId` and `OrderSheet.customerId` with relations ✅
  - `Product` has proper relations to Category, Company, Godown, Segment ✅

#### 2. API Routes Updated

##### A. `/api/hire-sales/route.ts` — Updated
- GET: Added `status`, `customerId`, `currentStatus` query filter support
- POST: Added handling for new fields: `duration` (Int), `installmentAmount`, `totalPaid`, `currentStatus`, `nextPaymentDate`

##### B. `/api/hire-sales/[id]/route.ts` — Updated
- PUT: Added handling for new fields: `duration`, `installmentAmount`, `totalPaid`, `currentStatus`, `nextPaymentDate`

##### C. `/api/dashboard/route.ts` — Major update
- Returns comprehensive dashboard data:
  - `totalProducts`, `activeProducts` (was only active before)
  - `totalCustomers`, `activeCustomers` (was only active before)
  - `totalSuppliers`, `activeSuppliers` (was only active before)
  - `totalRevenue` (from completed sales orders)
  - `totalExpenses`, `totalIncome`, `totalPurchases`
  - `netProfit` (totalRevenue + totalIncome - totalPurchases - totalExpenses)
  - `recentActivities` from audit-logs (fallback to POs/SOs/stock entries if no audit logs)
  - `topSellingProducts` (top 5 by quantity from sales order lines)
  - `monthlySalesData` (last 6 months)
  - `monthlyPurchaseData` (last 6 months, separate from sales)
  - `lowStockProducts` (products where current stock <= reorderLevel)
  - `pendingOrders` (POs and SOs with Draft/Pending status)
  - `categoryDistribution` (products grouped by category for pie chart)

##### D. `/api/reports/route.ts` — New route created
- `?type=expense` — Expense report with byHead, byPayment, byMonth groupings
- `?type=income` — Income report with byHead, byPayment, byMonth groupings
- `?type=transaction-summary` — Summary of all transactions (sales, purchases, expenses, incomes, cash collections/deliveries, bank transactions)
- `?type=monthly-transaction` — Monthly breakdown of sales, purchases, expenses, incomes with net calculation

##### E. `/api/investments/route.ts` — New route created
- GET: List investment heads with optional `includeDetails=true` parameter
  - Simple mode: Returns investment heads with asset/liability counts
  - Details mode: Returns full investment heads with assets, liabilities, totals per head, and overall summary (grandTotalAssets, grandTotalLiabilities, grandNetValue)
- POST: Create new investment head (convenience alias for investment-heads)

##### F. Verified existing routes already meeting requirements:
- `/api/liabilities/route.ts` — Already supports GET with `?type=` filter and POST with type/paymentMethod ✅
- `/api/liabilities/[id]/route.ts` — Already exists with GET/PUT/DELETE ✅
- `/api/order-sheets/route.ts` — Already supports GET with `?companyId=`, `?customerId=`, `?status=` filters ✅
- `/api/order-sheets/[id]/route.ts` — Already exists with GET/PUT/DELETE ✅

### Bug Fix
- Fixed `monthlyMap.values()` → `Object.values(monthlyMap)` in `/api/reports/route.ts` (Record type doesn't have .values() method)

### Verification Results
- All 15+ API endpoints returning 200 status codes
- Dashboard returns all required fields (verified: totalProducts=15, activeProducts=15, totalCustomers=10, activeCustomers=10, totalSuppliers=5, activeSuppliers=5, etc.)
- All query parameter filters working (type, status, companyId, customerId, currentStatus)
- Lint passes with 0 errors
- db:push completed successfully

### Commands Run
- `bun run db:push` — Schema synced to database
- `npx prisma generate` — Regenerated Prisma client
- `bun run lint` — 0 errors
- curl tests for all endpoints — All returning 200
