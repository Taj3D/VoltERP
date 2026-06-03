# Task 2 — Order Sheet API Routes Rebuild

## Agent: Z.ai Code (Fullstack Developer)
## Date: 2025-06-02

## Task Summary
Rebuilt Order Sheet API Routes with live inventory integration, stock validation, fulfillment tracking, and CSV import.

## Files Rewritten

### 1. `/src/app/api/order-sheets/route.ts`
- **GET**: List all order sheets with filtering (companyId, customerId, status, fulfillmentStatus, orderType, godownId), multi-tenant isolation, VAT Auditor financial masking via `maskForVatAuditorFinancial`
- **POST** (standard): Create order sheet with:
  - `orderType` validation ("Company" requires `companyId`, "Customer" requires `customerId`)
  - Real-time stock validation via `validateStockAvailability` — queries `StockEntry` model with godownId filter
  - Returns 409 with `stockErrors` + `stockSnapshots` if ANY line has insufficient stock
  - Line-level financials: discountPercent → discountAmount, total computed via `safeFinancialRound`
  - Order-level financials: subTotal, discount, vatAmount, grandTotal computed from lines
  - Auto-generates `sheetNo` as `OS-XXXXX`
  - Snapshots `availableStock` at order time for audit trail
  - Sets `allocatedQuantity` = ordered quantity when Available, = min(currentStock, ordered) when Partial/Insufficient
  - Idempotency guard via `referenceKey`
  - Period close guard via `checkPeriodClose`
  - AuditLog + logUserActivity (module token: `Inv-OrderSheet-Pipeline`)
- **POST** (`?import=true`): CSV import with:
  - Accepts `Content-Type: text/csv` or JSON with `csvData` field
  - Required CSV headers: orderType, date, productId, quantity, rate
  - Optional: companyId, customerId, discountPercent
  - **CRITICAL**: Rejects any row referencing a `productId` not in the Product table
  - Returns granular diagnostics: `{ imported, failed, errors: [...], fieldErrors: [{row, field, message}] }`
  - Groups valid rows by orderType + company/customer + date, creates one OrderSheet per group

### 2. `/src/app/api/order-sheets/[id]/route.ts`
- **GET**: Single order sheet with full relations (company, customer, godown, paymentOption, lines with product), VAT Auditor masking
- **PUT**: Update with stock validation:
  - Validates stock for new lines if provided
  - On status change to "Confirmed" (`isConfirming`), re-validates stock even for existing lines (stock may have changed since draft)
  - Returns 409 if insufficient stock on confirm
  - Recomputes financials when lines change or discount/VAT percentages change
  - Updates `fulfillmentStatus` based on line stock statuses
  - Period close guard
  - Cannot modify cancelled orders
  - AuditLog + Activity logging
- **DELETE**: Soft delete with:
  - Cannot delete Confirmed/Processing/Completed orders
  - Period close guard
  - AuditLog + Activity logging

### 3. `/src/app/api/order-sheets/stock-check/route.ts` (NEW)
- **GET** endpoint for real-time stock availability checks
- Query params: `productId` (required), `godownId` (optional), `requestedQuantity` (optional)
- Returns: `{ productId, productName, productCode, currentStock, requestedQuantity, available, deficit, stockStatus, godownId }`
- Computes live stock from `product.openingStock + StockEntry.reduce(IN/OUT)`
- Enables frontend to check stock as user selects products

## Shared Patterns Used
- `withApiSecurity` from `@/lib/api-security` for all routes
- `db.$transaction()` for atomic operations
- `checkPeriodClose` before mutations
- `safeFinancialRound`, `safeFinancialAdd`, `safeFinancialSubtract` for all financial calculations
- `maskForVatAuditorFinancial` for GET responses
- `logUserActivity` with module token `"Inv-OrderSheet-Pipeline"`
- `AuditLog` entries for all mutations
- `params` typed as `Promise<{ id: string }>` — properly awaited

## Verification
- `bun run lint` — PASSED (zero errors)
- Dev server — Running on port 3000, no compilation errors
