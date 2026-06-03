# Task 4 — Sales Return API Rewrite with AR Adjustment & COGS Reversal

## Agent: full-stack-developer
## Status: COMPLETED

## Summary
Rewrote both Sales Return API route files with full COGS reversal, AR adjustment, cumulative return validation, and CSV import with PapaParse.

## Files Modified
1. `/home/z/my-project/src/app/api/sales-returns/route.ts` — Full rewrite
2. `/home/z/my-project/src/app/api/sales-returns/[id]/route.ts` — Full rewrite

## Key Implementations

### GET /api/sales-returns
- Full relations: salesOrder→customer, customer, godown, company, lines→product
- Query filters: status, customerId, dateFrom, dateTo
- VAT Auditor masking via maskForVatAuditorFinancial
- Company isolation for non-admin users

### POST /api/sales-returns (Create)
- Validation: salesOrderId, customerId, date, lines (all required)
- Period-close lock check, idempotency via referenceKey
- Godown SUSPENDED status check
- COGS Reversal: looks up SalesOrderLine.costPrice, fallback to Product.costPrice
- Cumulative Return Validation: totalAlreadyReturned + new qty <= original order qty
- AR Adjustment: applyArAdjustment() — Dr/Cr balance logic with flip and OverLimit→Active toggle
- StockEntry creation (type=IN) for each line
- Auto-generated returnNo: SRT-XXXXX

### POST /api/sales-returns?import=true (CSV Import)
- PapaParse for CSV parsing
- Client Limit Validation: customerCode must exist and not be Frozen
- Incomplete Transaction ID Rejection: salesOrderId or invoiceNo required
- Product code cross-referencing, godown code validation
- Returns imported/failed/errors/fieldErrors

### GET /api/sales-returns/[id]
- Full relations with VAT Auditor masking

### PUT /api/sales-returns/[id]
- Status transition validation (Pending→Approved→Completed, or Rejected)
- Line modification only when Pending
- AR Adjustment Reversal on Rejected (reverseArAdjustment)
- Stock reversal on Rejected (OUT entries)
- Line update: old stock reversal + new stock creation + AR re-adjustment
- COGS reversal recalculation when lines change

### DELETE /api/sales-returns/[id]
- Soft delete with stock reversal (OUT for non-Rejected)
- AR Adjustment Reversal if arAdjustmentPosted and not Rejected

## Verification
- Lint passes cleanly (no errors)
- Dev server running without compilation errors
- API endpoint responds correctly (returns 401 for unauthenticated requests)
