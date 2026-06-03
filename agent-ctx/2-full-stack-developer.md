# Task 2 — Sales Order API Routes Rewrite

## Agent: full-stack-developer
## Status: COMPLETED

## Summary
Rewrote all 3 Sales Order API route files with COGS calculation, AR ledger integration, credit limit protection, and CSV import with client limit validation.

## Files Modified/Created

### 1. `/home/z/my-project/src/app/api/sales-orders/route.ts` — REWRITTEN
- **GET**: Query params (status, customerId, godownId, dateFrom, dateTo, arPosted, srId), full relation includes (customer, godown, paymentOption, company, sr with designation, lines with product including category+brand), VAT Auditor masking, company isolation
- **POST (handleCreate)**: Full validation, period-close lock, idempotency check (referenceKey), credit limit protection (Frozen/OverLimit with ৳ formatting), COGS calculation (per-line Product.costPrice → cogsAmount, grossProfit; order-level cogsTotal, profitMargin), stock safety verification, auto-generate invoiceNo SO-XXXXX, StockEntry OUT creation, AR Ledger Integration (Customer.currentBalance Dr/Cr update with auto OverLimit toggle), arPosted=true, audit + activity logs
- **POST ?import=true (handleCsvImport)**: PapaParse CSV parsing, customerCode/productCode cross-referencing, client credit limit validation before batch insertion, groups by customerId+date, full COGS + stock + AR per group, returns imported/failed/errors

### 2. `/home/z/my-project/src/app/api/sales-orders/[id]/route.ts` — REWRITTEN
- **GET**: Single sales order with full relations, isActive check (410 Gone), VAT Auditor masking
- **PUT**: Status transitions (Draft→Confirmed→Delivered→Completed→Cancelled), COGS recalculation on line changes, stock safety check, stock reversal on Cancel (IN entries), AR adjustment on Cancel (computeArReversal + OverLimit→Active toggle)
- **DELETE**: Soft delete with stock reversal (IN entries) for non-Cancelled orders, AR adjustment reversal, OverLimit→Active toggle, audit + activity logs

### 3. `/home/z/my-project/src/app/api/sales-orders/cogs/route.ts` — NEW
- **GET**: COGS aggregation engine with query params (dateFrom, dateTo, customerId, productId, companyId)
- Returns: { totalCOGS, totalRevenue, totalGrossProfit, averageMargin, breakdown: [{ productId, productName, totalQtySold, totalRevenue, totalCOGS, grossProfit, margin }], filters, orderCount }
- Filters: status NOT IN (Draft, Cancelled), isActive=true, date range, customer, product, company
- Uses safeFinancialRound/Add, VAT Auditor masking via maskForVatAuditorAccounting

## Key Patterns Used
- `db` from `@/lib/db`
- `withApiSecurity`, `checkPeriodClose`, `maskForVatAuditorFinancial`, `safeFinancialRound/Add/Subtract` from `@/lib/api-security`
- `logUserActivity` from `@/lib/activity-logger`
- `prisma.$transaction()` for atomic operations
- Audit log: `tx.auditLog.create({ data: { action, module: 'SalesOrders', ... } })`
- Currency formatting: `new Intl.NumberFormat('en-BD', { minimumFractionDigits: 2 }).format(value)`
- Params type: `{ params: Promise<{ id: string }> }` for Next.js 16 dynamic routes

## Lint & Dev Server
- Lint passes cleanly (no errors)
- Dev server running without errors
