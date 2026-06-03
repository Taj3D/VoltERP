# Task 7-3: HR-Designations Multi-Tenant Isolation

## Summary
Updated both designation API route files to enforce multi-tenant isolation, composite duplicate checks, and proper audit logging module name.

## Changes Made

### `/src/app/api/designations/route.ts`
1. **GET**: Added `companyId: security.user.companyId || undefined` to the `where` clause for tenant-scoped filtering
2. **POST (single)**:
   - Added composite duplicate check (`name + companyId`) before creation within the transaction
   - Added `companyId: security.user.companyId || null` to the create data
   - Changed auditLog module from `'Designations'` to `'HR-Designations'`
   - Added 409 error handling for duplicate name errors
3. **POST (batch)**:
   - Added `companyId: security.user.companyId || null` to each batch record's data
   - Added composite duplicate check for each row before creating
   - Added batch audit log with module `'HR-Designations'`
4. **VAT masking**: Kept existing `salaryBandMin`, `salaryBandMax` masking for `vat_auditor` role

### `/src/app/api/designations/[id]/route.ts`
1. **GET**: Added ownership verification — checks `item.companyId !== security.user.companyId`, returns 403 on mismatch (allows access if either companyId is null)
2. **PUT**: Added ownership verification before updating, added `companyId: security.user.companyId || null` to update data, changed auditLog module to `'HR-Designations'`
3. **DELETE**: Added ownership verification within the transaction, changed auditLog module to `'HR-Designations'`, added 403 error handling for ownership mismatch
4. **VAT masking**: Kept existing masking on GET

## Patterns Used
- `withApiSecurity(request, 'Designations', 'GET')` — module name stays `'Designations'` for RBAC map lookup
- Audit log uses `'HR-Designations'` module name
- Ownership check: `if (security.user.companyId && item.companyId && item.companyId !== security.user.companyId)` — returns 403
- Composite duplicate: `findFirst({ where: { name, companyId } })` — throws error with 409 response
