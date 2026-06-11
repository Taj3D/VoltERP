# Task 10: Fix bugs in InventoryGroupPage and ReturnReplacementModulePage

## Agent: Code Auditor
## Date: 2026-03-05

## Summary
Audited InventoryGroupPage.tsx, ReturnReplacementModulePage.tsx, and 6 API routes for Phase 10 (Inventory Module - Order Sheets + PO + Auto PO). Found and fixed 6 bugs. All API routes verified working with proper validation.

## Bugs Fixed:

### InventoryGroupPage.tsx
1. **`doExportPDF` helper missing `financialFooter`, `printedBy`, `company`** (CRITICAL) — Added financialFooter with all 4 signature blocks, company profile, and printedBy using auth.user?.displayName
2. **Transfer form save missing validation** (HIGH) — Added required field checks, same-godown check, and valid line items check

### ReturnReplacementModulePage.tsx
3. **Import CSV button uses `isAdmin` instead of `canCreate && !isVatAuditor`** (HIGH) — Changed to allow manager import + explicit VAT Auditor exclusion
4. **PDF exports missing complete financialFooter signature blocks** (HIGH) — Added preparedBy, checkedBy, authorizedBy to both PR and RPL PDF exports
5. **Replacement form missing quantity > 0 validation** (MEDIUM) — Added explicit validation before saving

### export-utils.ts
6. **Missing Inventory Module fields in VAT_MASKED_COLUMNS** (MEDIUM) — Added 7 fields: cogsReversal, hireCharge, estimatedCost, stockValue, originalCostTotal, replacementCostTotal, adjustmentAmount

## API Routes Verified (all working, no fixes needed):
- /api/order-sheets — Full stock validation, financial computation, period close guard
- /api/purchase-orders — Credit freeze, credit limit, godown SUSPENDED, stock entries
- /api/purchase-orders/receive — Atomic receiving with status transition
- /api/auto-po — Threshold engine, primary supplier derivation, urgency classification
- /api/purchase-returns — COGS reversal, cumulative validation, AP adjustment
- /api/replacements — Financial Adjustment Engine, stock adjustment, ledger adjustments

## Lint: Passes clean
## Dev Server: Running on port 3000
