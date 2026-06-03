# Task 4-3b: Categories API Stage 4 Audit Fixes

## Summary
Rewrote both `/api/categories/route.ts` and `/api/categories/[id]/route.ts` with complete multi-tenant isolation and Stage 4 audit fixes.

## Changes Made

### `/api/categories/route.ts`
1. **GET** — Added tenant-aware filtering via `tenantFilter()` helper:
   - Admin users see all categories across tenants (empty filter)
   - Non-admin users only see categories where `companyId` matches their own (or null for global records)
   - Added `company` relation to the response include

2. **POST (single)** — Added:
   - `companyId: security.user.companyId || null` injected into the created record
   - Composite duplicate check: `findFirst({ where: { name, companyId } })` → returns 409 Conflict with the duplicate name
   - Preserved existing code auto-generation and auditLog

3. **POST (batchMode)** — Added:
   - `companyId: security.user.companyId || null` injected into each record
   - Empty optional fields (`description`, `parentCategoryId`) converted to null
   - Duplicate rows silently skipped (doesn't fail the entire batch) with skipped count/rows in response
   - `userActivityLog.create()` call with `actionType: 'IMPORT_CSV'`, `module: 'Categories-Config'`, and `fileName: 'categories-import.csv'`

### `/api/categories/[id]/route.ts`
1. **GET by ID** — Added:
   - `verifyTenantOwnership()` check after fetching the record
   - Admin bypass (can see all)
   - Returns 403 if tenant mismatch

2. **PUT** — Added:
   - `verifyTenantOwnership()` check before updating (403 if mismatch)
   - Duplicate name check excluding current record (`id: { not: id }`) scoped to same `companyId` → 409
   - Preserved existing circular reference prevention and auditLog

3. **DELETE** — Added:
   - `verifyTenantOwnership()` check before deleting (403 if mismatch)
   - Preserved existing FK checks (active products/children), null-out inactive children, and soft-delete
   - Preserved auditLog with added `companyId` in details

## Helper: `verifyTenantOwnership()`
- Centralized tenant isolation function used across GET/PUT/DELETE
- Admin users bypass the check (returns null = allowed)
- Non-admin users: record's `companyId` must match `security.user.companyId` (both null = global = allowed)
- Returns NextResponse(403) on mismatch

## Helper: `tenantFilter()`
- Used for list queries (GET all)
- Admin: returns `{}` (no filter, see all)
- Non-admin: returns `{ companyId: userCompanyId || null }`
