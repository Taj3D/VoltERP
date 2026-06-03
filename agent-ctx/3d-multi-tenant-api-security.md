# Task 3d - Multi-Tenant API Security Agent (Stage 9)

## Task
Rewrite 6 Stock/Transfer API Routes with Absolute Multi-Tenant Isolation, RBAC, and VAT Auditor Masking

## Files Modified
1. `/home/z/my-project/src/app/api/stock/route.ts` — Complete rewrite with multi-tenant isolation
2. `/home/z/my-project/src/app/api/stock-details/route.ts` — Complete rewrite with multi-tenant isolation
3. `/home/z/my-project/src/app/api/stock-entries/route.ts` — Complete rewrite with multi-tenant isolation + RBAC gates
4. `/home/z/my-project/src/app/api/transfers/route.ts` — Complete rewrite with multi-tenant + cross-tenant safety
5. `/home/z/my-project/src/app/api/transfers/[id]/route.ts` — Complete rewrite with multi-tenant + cross-tenant safety
6. `/home/z/my-project/src/app/api/auto-po/route.ts` — Complete rewrite with multi-tenant isolation
7. `/home/z/my-project/src/lib/db.ts` — Updated cache invalidation version + added companyId checks

## Key Changes Summary

### Multi-Tenant Isolation
- All GET queries filter by `security.user.companyId`
- Products: `where: { companyId: security.user.companyId, isActive: true }`
- StockEntries: `where: { companyId: security.user.companyId }`
- StockTransfers: `where: { companyId: security.user.companyId, isActive: true }`
- All POST/PUT operations set `companyId: security.user.companyId` on created records
- GET by [id] uses findFirst with companyId filter — returns 404 if cross-tenant

### RBAC Gates
- **Dealer**: Stock read-only ✓, StockTransfers completely blocked (403) ✓, AutoPO completely blocked (403) ✓, StockEntries cannot POST (403) ✓
- **SR**: Stock read-only ✓, StockEntries cannot POST (403) ✓, StockTransfers cannot create/modify (403) ✓, AutoPO completely blocked (403) ✓
- **VAT Auditor**: All cost/margin/stock-value fields masked with "N/A (Audit Mode)"

### Cross-Tenant Safety (Transfers)
- Both fromGodownId and toGodownId verified to belong to user's companyId
- All products in transfer lines verified to belong to user's companyId
- Prevents Company A user from transferring stock to Company B's godown

### VAT Auditor Masking
- Stock: costPrice, salePrice, wholesalePrice, dealerPrice, stockValue, openingStock
- StockDetails: costPrice, salePrice, stockValue on product; costPrice, lineValue on entries
- Transfers: costPrice, salePrice, wholesalePrice, dealerPrice on product lines
- AutoPO: costPrice, estimatedCost

### Currency Safety
- All financial calculations use `Math.round(... * 100) / 100`

### Preserved Functionality
- Audit log creation, period close lock check, TRN-XXXXX auto-generation
- Stock locking pattern (OUT from source immediately, IN on Delivered)
- State flow: Pending → In-Transit → Delivered (no backward transitions)
- Batch import mode, soft-delete pattern, running balance calculation

## Verification
- `bun run lint` — zero new errors
- All 6 routes tested with curl for admin, dealer, SR, VAT auditor roles
- Cross-tenant transfer attack verified to be blocked (403)
- Dev server recompiled without errors
