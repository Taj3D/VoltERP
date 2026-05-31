# Task ID: 2 — DamageLog API Routes with Atomic Double-Entry Asset Write-Off

## Agent: DamageLog API Builder

## Work Log

### File 1: `/api/damage-logs/route.ts` (NEW — complete implementation)

**GET handler:**
- `withApiSecurity(request, 'DamageLogs', 'GET')` — RBAC enforcement
- Dealer: blocked entirely (403) — custom role check after withApiSecurity
- SR: read-only access (handled by withApiSecurity + custom write blocks)
- Multi-tenant filter: `where: { isActive: true, ...(companyId ? { companyId } : {}) }`
- Includes: `product`, `godown` relations
- Applies `maskFinancialArray()` with extra fields `['lossCostPrice', 'totalLossValue', 'quantity']` for VAT Auditor masking

**POST handler:**
- Dealer: blocked entirely (403) — custom role check
- SR: blocked from writes (403) — custom role check
- Validates required fields: `productId`, `godownId`, `quantity` (> 0, numeric only — blocks zero/negative/NaN), `lossCostPrice` (> 0), `reason` (must be one of: BROKEN, EXPIRED, THEFT, MOISTURE)
- Godown SUSPENDED check — if status === 'SUSPENDED', blocks with 403 Forbidden
- Period-close lock check via `checkPeriodClose(transactionDate)`
- Validates quantity against available physical stock in `ProductStock` — fails with 400 if input quantity exceeds location balance
- If `batchNumber` provided, validates against `BatchMaster` — fails with 400 if batch quantity insufficient
- Generates `damageCode` as DMG-XXXXX (5-digit zero-padded auto-increment)
- Atomic `$transaction` with 7 steps:
  1. Create DamageLog record
  2. Decrement ProductStock.quantity by damage qty (using `safeFinancialSubtract`)
  3. Decrement ProductStock.totalValue by totalLossValue (using `safeFinancialSubtract`)
  4. If batchNumber provided, decrement BatchMaster.quantity and BatchMaster.totalCost (using `safeFinancialSubtract`)
  5. Create StockEntry type="OUT" for audit trail
  6. Post double-entry ledger pair:
     - Debit: Find ChartOfAccount where name contains "Inventory Loss" or "Wastage" under Expense classification
     - Credit: Find ChartOfAccount where name contains "Inventory Asset" under Asset classification
     - Create two LedgerEntry records
  7. Create AuditLog with module: 'Inv-Logistics-Core'
- Activity logging via `logUserActivity()` with module 'Inv-Logistics-Core' after transaction

### File 2: `/api/damage-logs/[id]/route.ts` (NEW — complete implementation)

**GET handler:**
- `{ params }: { params: Promise<{ id: string }> }` — Next.js 16 pattern with `const { id } = await params;`
- Dealer: blocked entirely (403)
- Cross-tenant companyId validation (returns 404 on mismatch)
- Applies `maskFinancialArray()` with extra fields for VAT Auditor masking

**PUT handler:**
- Dealer: blocked entirely (403)
- SR: blocked from writes (403)
- Cross-tenant companyId validation before any modification
- damageCode is immutable — returns 400 if attempted to change
- Period-close lock check
- If quantity is being changed, re-validates against stock (accounts for reversal of old write-off)
- Validates godown SUSPENDED status if godownId is changing
- Validates batch stock if batchNumber is changing
- Reason validation (must be one of VALID_REASONS if provided)
- Reverse old stock effects, apply new ones (within $transaction):
  1. Reverse old ProductStock: add back old quantity and totalValue (using `safeFinancialAdd`)
  2. Reverse old BatchMaster: add back old batch quantity and totalCost (using `safeFinancialAdd`)
  3. Apply new ProductStock decrement (using `safeFinancialSubtract`)
  4. Apply new BatchMaster decrement (using `safeFinancialSubtract`)
  5. Create reversal StockEntry (IN) for old write-off
  6. Create new StockEntry (OUT) for updated write-off
  7. Create 4 ledger entries: 2 reversal + 2 new (full double-entry reversal + re-entry)
  8. Update DamageLog record (damageCode immutable, totalLossValue always recalculated)
  9. AuditLog with module: 'Inv-Logistics-Core'
- Activity logging via `logUserActivity()` with module 'Inv-Logistics-Core'

**DELETE handler:**
- Dealer: blocked entirely (403)
- `checkFinancialDeletePermission(role)` — only admin can delete
- Cross-tenant companyId validation before soft delete
- Period-close lock check
- Reverse stock effects within $transaction:
  1. Reverse ProductStock: add back quantity and totalValue (using `safeFinancialAdd`)
  2. Reverse BatchMaster: add back batch quantity and totalCost (using `safeFinancialAdd`)
  3. Create reversal StockEntry (IN) for audit trail
  4. Create 2 reversal ledger entries (Credit old debit, Debit old credit)
  5. Soft delete (isActive = false)
  6. AuditLog with module: 'Inv-Logistics-Core'
- Activity logging via `logUserActivity()` with module 'Inv-Logistics-Core'

## Verification
- `bun run lint` passed with ZERO errors
- Dev server running on localhost:3000 (HTTP 200)
- Both files follow project conventions:
  - Next.js 16 params as Promise
  - $transaction for atomicity
  - safeFinancialRound/Add/Subtract for all arithmetic
  - maskFinancialArray for VAT Auditor masking
  - checkFinancialDeletePermission for admin-only delete
  - logUserActivity with module 'Inv-Logistics-Core'

## Imports Used from api-security
- `withApiSecurity` — RBAC enforcement
- `checkPeriodClose` — period lock check
- `safeFinancialRound` — uniform financial rounding
- `safeFinancialSubtract` — safe decrement for stock values
- `safeFinancialAdd` — safe increment for stock reversals
- `checkFinancialDeletePermission` — admin-only delete enforcement
- `maskForVatAuditor` — imported (available for single-record masking)
- `maskFinancialArray` — array-level VAT Auditor masking

## Imports Used from activity-logger
- `logUserActivity` — activity stream logging with module token 'Inv-Logistics-Core'
