# Task 3 — Products API Enhancement: Stock Threshold, SKU Status, Bulk Import Validation

## Agent: Products API Enhancement Agent
## Task ID: 3

## Summary
Enhanced the Products API with stock threshold computation, SKU status, and enhanced bulk import with duplicate validation.

## Changes Made

### File 1: `/src/app/api/products/route.ts`
- **GET handler**: Added 3 computed fields per product (currentStock, stockStatus, skuStatus)
- **GET handler**: Added `?stockStatus=` filter parameter
- **GET handler**: Added `?action=summary` endpoint with aggregated KPIs
- **POST handler (batch)**: Added within-batch duplicate SKU/barcode validation (409 with details)
- **POST handler**: Currency sanitization via safeFinancialRound (already existed, preserved)
- Used efficient `batchComputeStock()` helper with `db.stockEntry.groupBy()` for batch aggregation

### File 2: `/src/app/api/products/[id]/route.ts`
- **GET handler**: Added 3 computed fields (currentStock, stockStatus, skuStatus) for single product
- Used `db.stockEntry.aggregate()` for single product stock computation

## Key Design Decisions
- StockEntry model does NOT have `isActive` field — correctly excluded from where clauses
- Batch stock aggregation uses 2 groupBy queries (IN + OUT) instead of N×2 per product
- `computeSkuStatus()`: "No SKU" for both (barcode-only) and (neither) per spec
- `computeStockStatus()`: currentStock === 0 → "Out of Stock", <= reorderLevel → "Low Stock", else "In Stock"
- Summary `totalValue` = currentStock × costPrice (inventory valuation at cost)
- VAT Auditor masking on summary's categoryWiseSummary.totalValue

## Verification
- `bun run lint` passed with zero errors
- Dev server stable on localhost:3000
