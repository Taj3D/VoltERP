# Task ID: 3 — Stock Transfers API Rewrite (Phase 12: Intransit Valuation State Machine)

## Agent: Transfer State Machine Engineer

## Task: Rewrite Stock Transfers API routes with Intransit Valuation State Machine and godown SUSPENDED interlock

### Work Log

- Read worklog.md for prior context (Tasks 1-13)
- Read api-security.ts for withApiSecurity, checkPeriodClose, checkFinancialDeletePermission, safeFinancialRound/Add/Subtract
- Read activity-logger.ts for logUserActivity API with module token 'Inv-Logistics-Core'
- Read Prisma schema: StockTransfer, StockTransferLine, ProductStock, BatchMaster, StockEntry, Godown, ChartOfAccount, LedgerEntry models
- Read existing /api/transfers/route.ts (199 lines) and /api/transfers/[id]/route.ts (342 lines)

---

### File 1: `/api/transfers/route.ts` (COMPLETE rewrite)

**GET (List):**
- Multi-tenant companyId filter: `where: { companyId, isActive: true }` when user has companyId
- Includes: fromGodown, toGodown, company, lines (with product)
- Ordered by createdAt desc

**POST (Create):**
- Required fields validation: fromGodownId, toGodownId, date, lines (non-empty array)
- Validates fromGodownId !== toGodownId (400 if same)
- **EMERGENCY SUSPENDED INTERLOCK**: Checks BOTH source and destination Godown status. If either is "SUSPENDED", returns 403: "Transfer blocked: Source/Destination Godown is SUSPENDED. All stock operations are frozen for this warehouse."
- Also validates both godowns exist and are active
- Period-close lock check via `checkPeriodClose(date)`
- Line-level validation:
  - quantity > 0 enforced per line
  - ProductStock availability check at source godown via `productId_godownId` unique lookup
  - Batch preservation: if batchNumber provided, validates batch exists at source godown and has sufficient quantity
  - Cost price lookup from ProductStock for intransit valuation
  - Each line stores costPrice and totalCost (quantity × costPrice) using safeFinancialRound
  - Total quantities computed with safeFinancialAdd
- Creates transfer with `shippingStatus = "PENDING"` (draft state)
- **Does NOT deduct stock** — stock is only deducted when shipped (IN_TRANSIT transition in PUT)
- Auto-generates transferNo as TRN-XXXXX (5-digit zero-padded)
- AuditLog via `logUserActivity` with module `'Inv-Logistics-Core'`

---

### File 2: `/api/transfers/[id]/route.ts` (COMPLETE rewrite)

**GET (Single Record):**
- Cross-tenant companyId validation: returns 404 if companyId mismatch
- Includes: fromGodown, toGodown, company, lines (with product)

**PUT — INTRANSIT VALUATION STATE MACHINE (CRITICAL):**

Implements 3 forward transitions with blocked backward transitions:

1. **PENDING → IN_TRANSIT (SHIP action):**
   - Re-checks both source AND destination godown are not SUSPENDED (403 if either is)
   - Re-validates stock availability inside transaction for consistency
   - Deducts stock from Source Warehouse:
     - Decrements `ProductStock.quantity` at source godown with safeFinancialSubtract
     - Updates `ProductStock.totalValue` (quantity × costPrice)
   - Batch handling:
     - Decrements `BatchMaster.quantity` if batchNumber provided
     - Sets batch status to "Exhausted" if quantity reaches 0
   - Creates `StockEntry type="OUT"` at source godown with referenceType="Transfer"
   - **Shifts asset value to In-Transit CoA:**
     - Debit: ChartOfAccount "Inventory In-Transit" (increase intransit asset)
     - Credit: ChartOfAccount "Inventory Asset" (reduce inventory asset)
     - Creates paired LedgerEntry records with auto-generated LED-XXXXX codes
   - Sets `shippedAt = now()`
   - Updates `totalValue` from sum of line totalCost
   - Updates shippingStatus = "IN_TRANSIT", status = "In-Transit"

2. **IN_TRANSIT → RECEIVED (RECEIVE action):**
   - Atomically moves stock into Destination Warehouse:
     - Increments `ProductStock.quantity` at destination (creates if not exists)
     - Calculates weighted average costPrice at destination
     - Creates `ProductStock` record at destination if it doesn't exist
   - Batch handling:
     - Increments `BatchMaster` at destination if batchNumber provided
     - Creates batch at destination if it doesn't exist
   - Creates `StockEntry type="IN"` at destination godown
   - **Move CoA:**
     - Debit: "Inventory Asset" (increase asset at destination)
     - Credit: "Inventory In-Transit" (reduce intransit asset)
     - Creates paired LedgerEntry records
   - Sets `deliveredAt = now()`
   - Updates shippingStatus = "RECEIVED", status = "Received"

3. **IN_TRANSIT → REJECTED (REJECT action):**
   - Returns stock to Source Warehouse:
     - Increments `ProductStock.quantity` back at source godown with safeFinancialAdd
     - Creates `ProductStock` at source if missing (safety net)
     - Increments `BatchMaster.quantity` back if batchNumber
     - Creates batch at source if missing (handles exhausted/deleted batches)
     - Reactivates batch status to "Active"
   - Creates `StockEntry type="IN"` at source godown (return)
   - **Reverse CoA:**
     - Credit: "Inventory Asset" (restore asset at source)
     - Debit: "Inventory In-Transit" (clear intransit asset)
     - Creates paired LedgerEntry records
   - Sets `rejectedAt = now()`, stores `rejectionReason`
   - Requires rejectionReason (400 if missing)
   - Updates shippingStatus = "REJECTED", status = "Rejected"

4. **BLOCKED transitions:**
   - RECEIVED → any previous status: BLOCKED (400 error)
   - REJECTED → any previous status: BLOCKED (400 error)
   - IN_TRANSIT → PENDING: BLOCKED (400 error)

**All state transitions execute within atomic `$transaction`.**

**Helper functions:**
- `generateLedgerCode(tx)`: Auto-generates LED-XXXXX entry codes
- `findCoAAccount(tx, namePattern, companyId)`: Finds ChartOfAccount by name pattern, company-scoped first then global fallback

**DELETE (Admin-only soft delete):**
- `checkFinancialDeletePermission(role)` — only admin can delete
- Cross-tenant companyId validation
- Period-close lock check
- Cannot delete RECEIVED transfers (final state, 400 error)
- **If IN_TRANSIT state**: Reverses all stock effects before soft-deleting:
  - Returns stock to source warehouse (ProductStock increment)
  - Returns batch quantities (BatchMaster increment, reactivates status)
  - Creates StockEntry type="IN" reversal entries
  - Reverses CoA: Credit "Inventory Asset", Debit "Inventory In-Transit"
- **If PENDING state**: Just soft-deletes (no stock was deducted)
- AuditLog via `logUserActivity` with module `'Inv-Logistics-Core'`

**Error handling:**
- Thrown errors from `$transaction` are caught and mapped to appropriate HTTP status codes:
  - SUSPENDED → 403
  - Insufficient stock → 400
  - Invalid transition → 400

---

### Verification
- `bun run lint` passed with ZERO errors
- Dev server stable on localhost:3000 (HTTP 200, no compilation errors)
- Both files follow project conventions (Next.js 16 params as Promise, $transaction for atomicity)

### Stage Summary
- 2 API route files rewritten with complete Intransit Valuation State Machine
- Godown SUSPENDED interlock on POST (create) and SHIP transition (PENDING → IN_TRANSIT)
- All 3 forward transitions implemented with full stock movement, CoA ledger entries, and batch preservation
- All backward transitions blocked (RECEIVED/REJECTED → any, IN_TRANSIT → PENDING)
- All stock calculations use safeFinancialRound/Add/Subtract (no raw +/-)
- Admin-only DELETE with automatic IN_TRANSIT stock reversal
- Cross-tenant companyId validation on all single-record operations
- AuditLog module token: 'Inv-Logistics-Core'
