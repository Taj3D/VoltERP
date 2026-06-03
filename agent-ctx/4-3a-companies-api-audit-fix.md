# Task 4-3a: Companies API Audit Fixes

## Summary
Rewrote both company API route files with Stage 4 audit fixes for RBAC, tenant isolation, duplicate name checking, null-safe batch handling, and activity logging.

## Files Modified

### `/home/z/my-project/src/app/api/companies/route.ts`
**Changes:**
1. **GET** — Tenant isolation: admin sees all companies; non-admin sees only their own company (filtered by `security.user.companyId`). Returns empty list if user has no company assigned.
2. **POST single** — RBAC gate: returns 403 if `role !== 'admin'`. Added case-insensitive duplicate name check (returns 409 Conflict). Kept existing image validation (`validateImageFields`) and code auto-generation (`COM-XXXXX`).
3. **POST batchMode** — RBAC gate: returns 403 if `role !== 'admin'`. Added null-safe handling for optional string fields (converts `''` and `undefined` to `null`). Added duplicate name check per row. Added `db.userActivityLog.create()` call for import activity logging.

### `/home/z/my-project/src/app/api/companies/[id]/route.ts`
**Changes:**
1. **GET by ID** — Tenant isolation: non-admin users get 403 if requested `id` does not match `security.user.companyId`.
2. **PUT** — RBAC gate: returns 403 if `role !== 'admin'`. Added case-insensitive duplicate name check excluding current record (returns 409 Conflict). Kept image validation.
3. **DELETE** — RBAC gate: returns 403 if `role !== 'admin'`. Kept existing FK checks (active products/order sheets) and soft-delete pattern.

## Key Design Decisions
- Company IS the tenant entity, so no `companyId` assignment is needed on Company records (they ARE the tenant)
- For batchMode, no `companyId` field is set — Company model has no `companyId` column
- Audit log user references changed from `security.user?.id || 'system'` to `security.user.id` (always available after auth check)
- Added 404 handling for DELETE when record not found

## Lint Status
- Only pre-existing errors in `start-server.js` (unrelated to this task)
- No errors in the modified files
