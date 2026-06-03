# Task 13-4/13-5: Multi-Tenant API Hardening

## Summary
Fixed two API route files with multi-tenant companyId isolation, RBAC enforcement, VAT Auditor masking, and activity logging.

## Files Modified
1. `/home/z/my-project/src/app/api/inventory-aging/route.ts` — Complete rewrite
2. `/home/z/my-project/src/app/api/product-lifecycle/route.ts` — Complete rewrite

## Key Changes

### inventory-aging/route.ts
- **companyId isolation**: `const cf = companyId ? { companyId } : {};` applied to `db.product.findMany()` and `db.stockEntry.findFirst()`
- **RBAC**: Explicit 403 for SR and Dealer roles (MODULE_DENY for system monitoring)
- **VAT masking**: costPrice, totalValue, bracket totalValue, summary totalValue all return 'N/A (Audit Mode)'
- **Activity logging**: `db.auditLog.create()` with module "Audit-Inventory-Aging" on every GET (non-blocking)
- **Null fallbacks**: Empty data returns "No System Anomalies Found" for totalValue, "—" for averageAge/oldestAge/category/brand

### product-lifecycle/route.ts
- **companyId isolation**: `...cf` added to GET list, GET lookup, batch POST; ownership verification on PUT
- **RBAC**: Explicit 403 for SR and Dealer (MODULE_DENY); VAT Auditor read-only with masking
- **VAT masking**: Uses `maskForVatAuditor()` from api-security.ts for costPrice and salePrice
- **Activity logging**: Module changed to "Audit-Product-Lifecycle"; added batch IMPORT audit log
- **companyId inheritance**: `recordCompanyId = product.companyId || security.user.companyId` on POST create

## Lint Status
- `bun run lint` — only pre-existing start-server.js require-import errors
- `npx eslint` on both files — clean, zero errors
