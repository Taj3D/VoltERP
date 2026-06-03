# Agent Context: Task 3c — Returns & Replacements Multi-Tenant Isolation

## Task Summary
Rewrote 6 API route files + updated api-security.ts with absolute multi-tenant isolation, RBAC, and VAT Auditor masking.

## Files Modified
1. `src/lib/api-security.ts` — Removed SalesReturns from dealer MODULE_DENY; Added Replacements to sr WRITE_DENY
2. `src/app/api/sales-returns/route.ts` — Full rewrite with multi-tenant, RBAC, VAT masking
3. `src/app/api/sales-returns/[id]/route.ts` — Full rewrite with multi-tenant, RBAC, VAT masking
4. `src/app/api/purchase-returns/route.ts` — Full rewrite with multi-tenant, RBAC, VAT masking
5. `src/app/api/purchase-returns/[id]/route.ts` — Full rewrite with multi-tenant, RBAC, VAT masking
6. `src/app/api/replacements/route.ts` — Full rewrite with multi-tenant, RBAC, VAT masking
7. `src/app/api/replacements/[id]/route.ts` — Full rewrite with multi-tenant, RBAC, VAT masking

## Key Design Decisions
- Two-layer RBAC: `withApiSecurity()` for coarse access + route-level checks for nuanced per-role-per-method rules
- Cross-tenant records return 404 (not 403) to avoid information leakage
- Auto-generated codes (returnNo, replacementNo, debitNoteCode) scoped to company via `where: { companyId }` in findFirst
- VAT Auditor masking uses `maskForVatAuditor()` from api-security.ts with custom field lists per module
- Currency safety: `Math.round(value * 100) / 100` on all financial calculations
- StockEntry records always include `companyId: userCompanyId`
