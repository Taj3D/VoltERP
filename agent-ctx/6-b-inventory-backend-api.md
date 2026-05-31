# Task 6-b: Inventory Backend API Builder (Part 2)

## Task: Phase 10 — Inventory Management API Routes (Part A)

### Files Created/Updated

#### FILE 1: `/home/z/my-project/src/app/api/stock-valuation/route.ts` (NEW)
- **GET** — Perpetual Stock Valuation Engine supporting FIFO and Weighted Average methods
- FIFO Implementation:
  - Gets all IN-type StockEntry records ordered by date ASC (earliest first)
  - Gets total OUT quantity per product
  - Consumes OUT quantity from earliest IN entries first (FIFO layer consumption)
  - Remaining IN entries = current stock layers with their respective costPrices
  - Total Value = sum of (remainingQty * layerCostPrice) for each layer using safeFinancialRound/Add
  - Average Cost = Total Value / Total Remaining Qty
  - Returns layers array with date, quantity, costPrice, totalCost, batchNumber
- Weighted Average Implementation:
  - Gets all IN-type StockEntry records, computes total IN quantity and total cost
  - Net Quantity = Total IN Qty - Total OUT Qty (using safeFinancialSubtract)
  - Weighted Average Cost = Total Cost IN / Total IN Qty (using safeFinancialRound)
  - Total Value = Net Quantity * Weighted Average Cost
- Query params: method (optional, defaults to product.valuationMethod or "FIFO"), productId, godownId
- Multi-tenant filter by security.user.companyId
- Godown SUSPENDED validation via validateGodownActive helper
- Batch number resolution: looks up BatchMaster records for IN entries with batchId
- VAT Auditor masking: totalValue, averageCost, costPrice, totalCost at product level + layer-level costPrice/totalCost
- Activity log: `logUserActivity({ action: 'EXPORT', module: 'Inv-Stock-Core', ... })`

#### FILE 2: `/home/z/my-project/src/app/api/godowns/route.ts` (COMPLETE REWRITE)
- **GET** — List godowns with multi-tenant filter: `where: { isActive: true, ...(companyId ? { companyId } : {}) }`
  - Includes `_count: { select: { products: true, productStocks: true } }`
  - VAT Auditor masking applied for consistency
  - Activity log for export operations
- **POST** — Create godown:
  - XSS sanitization on name, address, inCharge via sanitizeString helper
  - Duplicate name check within same company (409 Conflict)
  - Sets companyId from security.user.companyId
  - Default status to "ACTIVE"
  - Activity log: `logUserActivity({ action: 'CREATE', module: 'Inv-Stock-Core', ... })`

#### FILE 3: `/home/z/my-project/src/app/api/godowns/[id]/route.ts` (COMPLETE REWRITE)
- **GET** — Get single godown:
  - Cross-tenant companyId validation (returns 404 on mismatch)
  - Includes productStocks count in _count
  - VAT Auditor masking applied
- **PUT** — Update godown:
  - Cross-tenant validation before modification
  - XSS sanitization on text fields
  - SUSPENDED status check: When setting status to "SUSPENDED":
    - Checks for active ProductStock entries with quantity > 0
    - Checks for pending stock transfers (PENDING/IN_TRANSIT)
    - Returns 400 with detailed error message if blocks found
  - Valid status values: "ACTIVE", "SUSPENDED"
  - Activity log: `logUserActivity({ action: 'UPDATE', module: 'Inv-Stock-Core', ... })`
- **DELETE** — Soft-delete godown:
  - checkFinancialDeletePermission (admin only)
  - Cross-tenant validation
  - FK check for active ProductStock entries with quantity > 0
  - FK check for products, POs, SOs, hire sales, returns, transfers
  - Soft delete (isActive = false)
  - Activity log: `logUserActivity({ action: 'DELETE', module: 'Inv-Stock-Core', ... })`

#### FILE 4: `/home/z/my-project/src/app/api/stock/route.ts` (COMPLETE REWRITE)
- **GET** — Enhanced stock calculation with location-wise breakdown:
  - Kept existing stock calculation logic (stock movements from StockEntry)
  - All arithmetic uses safeFinancialRound/Add/Subtract (no raw +/-)
  - Multi-tenant filter by companyId on products, stock entries, product stocks, and batch masters
  - Godown status flagging: locations include `isSuspended` boolean for SUSPENDED godowns
  - ProductStock data for location-wise breakdown:
    - Each location entry: godownId, godownName, quantity, costPrice, totalValue, alertLevel, isSuspended
    - Fallback: if no ProductStock records exist but product has godownId, creates single location entry
  - Batch summary per product:
    - activeBatches: count of BatchMaster records with status "Active"
    - nearestExpiry: earliest future expiry date from active batches (ISO date string or null)
    - expiredBatches: count of BatchMaster records with status "Expired"
  - VAT Auditor masking: costPrice, salePrice, wholesalePrice, dealerPrice, stockValue, openingStock, totalValue
  - Location-level masking: costPrice and totalValue masked for VAT Auditor
  - Activity log: `logUserActivity({ action: 'EXPORT', module: 'Inv-Stock-Core', ... })`
  - Query params: godownId, categoryId, status, productId

### Shared Helpers (defined in each file as specified)
- `sanitizeString(input: string): string` — XSS sanitization, strips HTML tags and trims
- `validateGodownActive(tx, godownId, companyId?)` — Checks godown exists, is active, and not SUSPENDED

### Verification
- `bun run lint` passed with ZERO errors
- Dev server stable on localhost:3000 (HTTP 200)
- All 4 files follow project conventions (Next.js 16 params as Promise, $transaction for atomicity)
- All financial arithmetic uses safeFinancialRound/Add/Subtract
- All activity logs use module token 'Inv-Stock-Core'
- All multi-tenant routes filter by companyId from security.user.companyId
- All [id] routes have cross-tenant validation
