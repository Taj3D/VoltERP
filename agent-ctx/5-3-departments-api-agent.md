# Task 5-3: Departments API Module

## Summary
Completely rewrote both Departments API route files with full multi-tenant isolation, composite duplicate checks, RBAC enforcement, and activity logging.

## Files Modified
1. `/src/app/api/departments/route.ts` — GET (multi-tenant, VAT masking) + POST (RBAC, composite dup, activity logging)
2. `/src/app/api/departments/[id]/route.ts` — GET by ID (cross-tenant) + PUT (RBAC, composite dup, activity) + DELETE (admin-only, soft delete, activity)

## Key Implementation Details
- **Multi-tenant**: All queries filter by `security.user.companyId`; all mutations set companyId from authenticated user
- **Composite duplicate**: `name + companyId` uniqueness check before CREATE and on name change during UPDATE → 409 Conflict
- **RBAC**: POST/PUT require admin|manager (sr/dealer → 403); DELETE requires admin only (manager → 403)
- **VAT masking**: _count.employees and _count.designations → "N/A (Audit Mode)" for vat_auditor
- **Activity logging**: Fire-and-forget POST to /api/user-activity with module "Department-Setup"
- **Soft delete**: DELETE sets isActive=false with FK constraint check on active designations/employees

## Lint Status
Zero new errors on both files.
