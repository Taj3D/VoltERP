# Task 6-a: Inventory Backend API Builder (Part 1)

## Agent: Inventory Backend API Builder

## Task: Create 5 backend API route files for Phase 10: Inventory Management — Part A

### Files Created

#### FILE 1: `/src/app/api/opening-stock/route.ts`
- **GET**: List opening stock entries filtered by `referenceType: 'OpeningStock'` with multi-tenant `companyId` isolation; includes product and batch relations; applies `maskFinancialArray` with extra fields `['costPrice', 'totalCost']` for VAT Auditor masking
- **POST**: Post Product Opening Stock with atomic CoA double-entry:
  - Required field validation: `productId`, `godownId`, `quantity`, `costPrice`
  - Numeric integrity: rejects zero, negative, NaN for quantity and costPrice (400)
  - Godown SUSPENDED check: returns 400 "Godown is SUSPENDED. Stock operations are blocked."
  - Period-close lock check via `checkPeriodClose`
  - XSS sanitization on `batchNumber`, `notes` using `input.replace(/<[^>]*>/g, '').trim()`
  - Inside `db.$transaction`:
    - Find or create `ProductStock` record for productId + godownId (upsert logic)
    - Create `StockEntry` with `type: "IN"`, `referenceType: "OpeningStock"`, `costPrice`, `totalCost = safeFinancialRound(quantity * costPrice)`
    - Create or update `BatchMaster` if `batchNumber` is provided; link stock entry to batch via `batchId`
    - Find or create `ChartOfAccount` sub-node under "Inventory Asset" (Asset classification) for this product
    - Find or create "Retained Earnings" account under Equity classification
    - Create LedgerEntry: **Debit** Inventory Asset sub-node (Dr = TotalCost, Cr = 0)
    - Create LedgerEntry: **Credit** Retained Earnings (Dr = 0, Cr = TotalCost)
    - Create `LedgerAutoPost` tracking record with `sourceType: 'OpeningStock'`
    - Update Product: `coaAccountId` = inventory node ID, `openingStock = safeFinancialAdd(product.openingStock, quantity)`
  - Activity log: module `Inv-Stock-Core`, action `CREATE`

#### FILE 2: `/src/app/api/batch-master/route.ts`
- **GET**: Multi-tenant filter by `companyId`; includes product, godown relations; filter by `status`, `productId`, `godownId` from query params; VAT Auditor masking on `costPrice`, `totalCost`, `salePrice`
- **POST**: Create batch master:
  - Required: `batchNumber`, `productId`, `quantity`, `costPrice`
  - Numeric integrity: rejects zero, negative, NaN for quantity and costPrice
  - Computes `totalCost = safeFinancialRound(quantity * costPrice)`
  - Godown SUSPENDED check if `godownId` provided
  - XSS sanitization on `batchNumber` string
  - Activity log: module `Inv-Stock-Core`, action `CREATE`

#### FILE 3: `/src/app/api/batch-master/[id]/route.ts`
- **GET**: Cross-tenant companyId validation (returns 404 on mismatch); VAT Auditor masking on `costPrice`, `totalCost`, `salePrice`
- **PUT**: Cross-tenant validation before update; recalculate `totalCost` if `quantity` or `costPrice` changes; Godown SUSPENDED check if changing `godownId`; XSS sanitization on `batchNumber`; activity log: module `Inv-Stock-Core`, action `UPDATE`
- **DELETE**: `checkFinancialDeletePermission` (admin only); cross-tenant validation; checks for active stock entries referencing the batch before deletion; soft delete (`isActive = false`); activity log: module `Inv-Stock-Core`, action `DELETE`

#### FILE 4: `/src/app/api/product-stock/route.ts`
- **GET**: Multi-tenant filter by `companyId`; includes product, godown relations; filter by `productId`, `godownId` from query params; VAT Auditor masking on `costPrice`, `totalValue`
- **POST**: Create/update product stock at a location:
  - Required: `productId`, `godownId`, `quantity`, `costPrice`
  - Numeric integrity: rejects zero, negative, NaN
  - Godown SUSPENDED check
  - Uses `db.productStock.upsert` on `@@unique([productId, godownId])`
  - Computes `totalValue = safeFinancialRound(quantity * costPrice)`
  - Activity log: module `Inv-Stock-Core`, action `CREATE`

#### FILE 5: `/src/app/api/product-stock/[id]/route.ts`
- **GET**: Cross-tenant companyId validation (returns 404 on mismatch); VAT Auditor masking on `costPrice`, `totalValue`
- **PUT**: Cross-tenant validation before update; recalculate `totalValue` if `quantity` or `costPrice` changes; Godown SUSPENDED check if changing `godownId`; activity log: module `Inv-Stock-Core`, action `UPDATE`
- **DELETE**: `checkFinancialDeletePermission` (admin only); cross-tenant validation; soft delete (`isActive = false`); activity log: module `Inv-Stock-Core`, action `DELETE`

### Implementation Details

- All routes use `import { db } from '@/lib/db'` for database access
- All routes use `withApiSecurity` from `@/lib/api-security` for RBAC enforcement
- All financial arithmetic uses `safeFinancialRound`, `safeFinancialAdd`, `safeFinancialSubtract`
- Next.js 16 params are `Promise<{ id: string }>` — handled with `const { id } = await params`
- Module token for all activity logs: `"Inv-Stock-Core"`
- All multi-tenant routes filter by `companyId` from `security.user.companyId`
- Cross-tenant validation on `[id]` routes returns 404 on companyId mismatch
- XSS sanitization: strips HTML tags using `input.replace(/<[^>]*>/g, '').trim()`
- Godown SUSPENDED check: before any stock operation, verifies `godown.status !== 'SUSPENDED'`
- CoA double-entry in opening-stock POST follows the exact pattern specified (Inventory Asset sub-node + Retained Earnings + LedgerAutoPost tracking)

### Verification
- `bun run lint` passed with ZERO errors
- Dev server running stable on localhost:3000 (HTTP 200)
