# Task 3 — Purchase Return API Routes Rewrite with Full Ledger Constraints

## Agent: Subagent (full-stack-developer)

## Summary

Rewrote both Purchase Return API route files with complete production-ready code implementing AP ledger integration, COGS reversal, inventory realignment, and CSV import validation.

## Files Modified

1. `/home/z/my-project/src/app/api/purchase-returns/route.ts` — Complete rewrite
2. `/home/z/my-project/src/app/api/purchase-returns/[id]/route.ts` — Complete rewrite
3. `/home/z/my-project/worklog.md` — Appended work record

## Key Implementation Details

### /api/purchase-returns/route.ts
- **GET**: Query params (status, supplierId, dateFrom, dateTo, apPosted), full relation includes with product→category+brand, VAT Auditor masking via maskFinancialArray, company isolation
- **POST (handleCreate)**: Full validation chain (purchaseOrderId, supplierId, date, lines), period-close lock, referenceKey idempotency (409), PO existence + non-Cancelled check, supplier Frozen rejection (403), godown SUSPENDED check, server-side line totals, COGS reversal (quantity × Product.costPrice), inventory realignment (computeCurrentStock → availableStock snapshot + StockEntry OUT), cumulative return validation, auto PRT-XXXXX/DN-XXXXX, AP ledger adjustment (Cr reduction, Dr/Cr flip, OverLimit toggle), audit + activity logs
- **POST (handleCsvImport)**: PapaParse, negative quantity rejection, supplier Frozen validation, productCode/godownCode/poNumber cross-referencing, grouped by purchaseOrderId+date, full COGS/stock/AP per group

### /api/purchase-returns/[id]/route.ts
- **GET**: Full relations, isActive check (410 Gone), VAT Auditor masking
- **PUT**: Status transitions (Pending→Approved→Completed, Rejected), line modification only on Pending, cumulative return validation excluding self, COGS recalculation, AP reversal on Rejected (reverseApAdjustment + IN stock entries), line update handling (reverse old OUT via IN, create new OUT, reverse+apply AP), company isolation
- **DELETE**: Soft delete with stock reversal (IN for non-Rejected), AP reversal if posted, set apAdjustmentPosted=false + stockRealignPosted=false, OverLimit→Active toggle

### Shared Helpers (duplicated in both files for self-containment)
- `computePRLineFinancials`, `generateReturnNo`, `generateDebitNoteCode`, `computeCurrentStock`, `applyApAdjustment`, `reverseApAdjustment`

## Verification
- `bun run lint` passes cleanly (zero errors)
- Dev server running without errors related to purchase-returns routes
