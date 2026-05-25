# Task 7-b: Implement Investment and Inventory Page Components

## Summary
Implemented 6 new page components for the Electronics Mart IMS project and updated supporting backend APIs.

## Changes Made

### 1. Prisma Schema Updates (`prisma/schema.prisma`)
- Added `type` field (default: "received") and `paymentMethod` field to `Liability` model
- Added `companyId` and `customerId` optional fields to `OrderSheet` model
- Added `company` and `customer` relations to `OrderSheet`
- Added `orderSheets` reverse relations to `Company` and `Customer` models
- Ran `bun run db:push` to sync schema with database

### 2. API Updates

#### `/api/liabilities/route.ts`
- Updated GET to accept `?type=received` or `?type=pay` query parameter for filtering
- Updated POST to accept `type` and `paymentMethod` fields

#### `/api/liabilities/[id]/route.ts`
- Updated PUT to handle `type` and `paymentMethod` fields

#### `/api/order-sheets/route.ts`
- Updated GET to accept `?companyId=`, `?customerId=`, `?status=` query parameters
- Updated POST to accept `companyId` and `customerId` fields
- Added `company` and `customer` includes in all queries

#### `/api/order-sheets/[id]/route.ts`
- Updated PUT to handle `companyId` and `customerId` fields
- Added `company` and `customer` includes

### 3. New Page Components (in `src/app/page.tsx`)

#### LiabilityReceivedPage
- Page key: "liability-received"
- Summary cards: This Month received, All Time received, Pending count
- CRUD table with date, liability head, amount (৳), notes columns
- Add/Edit dialog with investment head selector
- CSV export

#### LiabilityPayPage
- Page key: "liability-pay"
- Summary cards: Paid This Month, Total Outstanding, Next Payment Due
- CRUD table with date, liability head, amount, payment method (badge), notes
- Add/Edit dialog with payment method selector (Cash/Bank Transfer/Cheque/Mobile Banking/Other)
- CSV export

#### LiabilityReportPage
- Page key: "liability-report"
- Summary cards: Total Received, Total Paid, Balance
- Date range filter (from/to with clear button)
- Summary table by liability head: Head | Total Amount | Received | Paid | Balance
- Bar chart showing Received vs Paid distribution (using Recharts)
- CSV and PDF export

#### CompanyOrderSheetPage
- Page key: "company-order-sheet"
- Company selector dropdown at top
- Summary cards: Total Orders, Pending, Completed
- Table with rowspan merging: Order No | Company | Product | Quantity | Status | Date
- CSV export

#### CustomerOrderSheetPage
- Page key: "customer-order-sheet"
- Customer selector dropdown at top
- Summary cards: Total Orders, Pending, Fulfilled
- Table with rowspan merging: Order No | Customer | Product | Quantity | Status | Date
- CSV export

#### OrderSheetReportPage
- Page key: "order-sheet-report"
- Date range filter
- Summary stats (4 cards): Total, Fulfilled, Pending, Cancelled
- Summary table by Company: Company | Total Orders | Completed | Pending | Total Amount
- Summary table by Customer: Customer | Total Orders | Completed | Pending | Total Amount
- Bar chart showing order trends by month (Total/Completed/Pending)
- CSV and PDF export

### 4. renderPage Function Update
Added 6 new page rendering conditions before the `moduleConfigs` fallback:
```typescript
if (currentPage === "liability-received") return <LiabilityReceivedPage />;
if (currentPage === "liability-pay") return <LiabilityPayPage />;
if (currentPage === "liability-report") return <LiabilityReportPage />;
if (currentPage === "company-order-sheet") return <CompanyOrderSheetPage />;
if (currentPage === "customer-order-sheet") return <CustomerOrderSheetPage />;
if (currentPage === "order-sheet-report") return <OrderSheetReportPage />;
```

### 5. Pre-existing Lint Fixes
- Fixed `useMemo` memoization error in `HireSalesReportPage` by moving date computation inside the memo
- Fixed `useMemo` memoization error in `DefaultingCustomerPage` by converting to direct computation (React Compiler handles memoization)

## Verification
- ✅ Lint passes with 0 errors (after clearing eslint cache)
- ✅ Dev server running normally
- ✅ All new API endpoints functional
- ✅ All 6 pages accessible via sidebar navigation
