# Task 5-7: Backend API Rewrite Agent — Block 10 Stock Transfer Routes

## Task: Rewrite stock transfer API routes for Block 10 directives

## Work Completed

### 1. /api/transfers/route.ts (POST handler rewritten)
- **Directive 1**: Added `quantity > 0` and `unitCost >= 0` validation — returns 400 on violation
- **Directive 1**: Moved stock availability check INSIDE `$transaction` block to prevent TOCTOU race conditions
- **Directive 1**: Stock check verifies at SPECIFIC source godown (not global stock)
- **Directive 1**: Included `unitCost` in line creation data (`unitCost ?? 0`)
- **Directive 4**: Changed AuditLog module from `'StockTransfers'` to `'SCM-Stock-Movement'`
- **Directive 4**: Added `UserActivityLog.create()` with module `'SCM-Stock-Movement'`
- **Preserved**: batchMode, cross-tenant safety, VAT masking, RBAC gates, period close checks

### 2. /api/transfers/[id]/route.ts (PUT/DELETE handlers rewritten)
- **Directive 1**: Added `quantity > 0` and `unitCost >= 0` validation in PUT
- **Directive 1**: Moved stock availability check INSIDE `$transaction` for line updates
- **Directive 1**: Included `unitCost` in processedLines mapping
- **Directive 2**: When shippingStatus → "Delivered", IN stock entries created atomically within same `$transaction`
- **Directive 4**: Changed AuditLog module to `'SCM-Stock-Movement'` for both PUT and DELETE
- **Directive 4**: Added `UserActivityLog.create()` for both PUT and DELETE inside `$transaction`

### 3. /api/stock/godown-balance/route.ts (NEW endpoint)
- `GET /api/stock/godown-balance?productId=xxx&godownId=yyy`
- Returns: `{ productId, godownId, godownName, availableStock, product: { name, productCode, costPrice } }`
- `availableStock = openingStock + (sum(IN) - sum(OUT))` at specific godown
- Multi-tenant isolated (companyId filter)
- Cross-tenant safety: verifies godown and product belong to user's company
- VAT Auditor masking on costPrice
- RBAC: Dealer blocked

## Key Architectural Change

The critical fix was moving the stock availability check from BEFORE the `$transaction` to INSIDE it. The previous code had a TOCTOU (Time-of-Check-Time-of-Use) race condition:

**Before (vulnerable)**:
```
1. Check stock balance (outside transaction) ← race window here
2. Start $transaction
3. Create transfer + OUT entries
4. Commit
```

**After (safe)**:
```
1. Start $transaction
2. Check stock balance (inside transaction) ← locked by transaction isolation
3. If insufficient, throw error → automatic rollback
4. Create transfer + OUT entries
5. Create AuditLog + UserActivityLog
6. Commit
```

## Lint Status
- Zero new lint errors (only pre-existing start-server.js require imports)
