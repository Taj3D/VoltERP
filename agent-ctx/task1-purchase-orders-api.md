# Task 1: Purchase Order API Routes Rewrite

## Summary
Rewriting both `/api/purchase-orders/route.ts` and `/api/purchase-orders/[id]/route.ts` with comprehensive business logic.

## Key Changes
- Full query param support (status, supplierId, godownId, fulfillmentStatus, receivingStatus, dateFrom, dateTo)
- Company isolation for non-admin users
- Dealer & SR blocked from PO access
- VAT Auditor financial masking
- Draft POs do NOT create stock entries; only Confirmed/Received do
- Supplier credit limit protection (Frozen block, OverLimit auto-toggle)
- Stock availability snapshots on each line
- CSV Import with supplierCode/productCode cross-referencing
- Status transitions with stock entry creation on Confirm
- Stock reversal on delete of Confirmed/Received POs
- Full audit & activity logging
- Idempotency via referenceKey
- safeFinancialRound for all financial calculations
