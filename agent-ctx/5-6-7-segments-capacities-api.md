# Task 5-6-7 — Segments & Capacities API Agent

## Summary
Rewrote 4 API route files for Segments and Capacities modules with full multi-tenant isolation, composite duplicate checks, RBAC enforcement, and activity logging.

## Files Modified
1. `/src/app/api/segments/route.ts` — GET (companyId filter, _count, company include, VAT masking) + POST (RBAC, companyId injection, composite dup check → 409, auditLog, activity "Segment-Setup", batch mode)
2. `/src/app/api/segments/[id]/route.ts` — GET (companyId ownership verify, VAT masking) + PUT (RBAC, companyId verify, name+companyId dup check → 409, auditLog, activity) + DELETE (RBAC admin-only, companyId verify, FK check, soft delete, auditLog, activity)
3. `/src/app/api/capacities/route.ts` — GET (companyId filter, company include, VAT masking, displayValue computed field with Intl.NumberFormat('en-BD')) + POST (RBAC, companyId injection, composite dup check → 409, auditLog, activity "Capacity-Config", batch mode with displayValue)
4. `/src/app/api/capacities/[id]/route.ts` — GET (companyId ownership verify, VAT masking, displayValue) + PUT (RBAC, companyId verify, name+companyId dup check → 409, auditLog, activity, displayValue) + DELETE (RBAC admin-only, companyId verify, soft delete, auditLog, activity)

## Key Patterns Applied
- **Multi-tenant isolation**: All GET filters by `security.user.companyId`; all [id] routes verify ownership
- **Composite duplicate checks**: `findFirst({ where: { name, companyId } })` before CREATE and UPDATE (excluding self on UPDATE)
- **RBAC**: POST/PUT = admin|manager (sr/dealer → 403); DELETE = admin only
- **Activity logging**: Fire-and-forget `logActivity()` with module tokens "Segment-Setup" / "Capacity-Config"
- **VAT auditor masking**: `maskForVatAuditor()` applied on response data
- **AuditLog**: All CUD operations within `$transaction` with before/after details
- **Capacity displayValue**: Regex replacement on numeric parts using `Intl.NumberFormat('en-BD')`

## Verification
- `npx eslint` on all 4 files: zero errors
- `bun run lint`: only pre-existing start-server.js errors
- Dev server: HTTP 200, stable
