# Task ID: 6-3b
# Agent: Segment & Capacity API Route Builder

## Task: Rewrite 4 API route files for Segment and Capacity modules with Phase 6 requirements

### Work Log:

#### Context Review:
- Read worklog.md (Tasks 1-13) for prior work context
- Read api-security.ts for withApiSecurity, checkFinancialDeletePermission, safeFinancialRound/Add/Subtract
- Read activity-logger.ts for logUserActivity API (module token: "Sys-Structure-Matrix")
- Read Prisma schema: Segment has companyId, code, products[]; Capacity has companyId, code, capacityValue, capacityUnit (no FK references)
- Read existing route files (4 files) — basic CRUD without multi-tenant, sanitization, or auto-code

#### File 1: /api/segments/route.ts (COMPLETE rewrite)
- GET: Multi-tenant filter `where: { isActive: true, ...(companyId ? { companyId } : {}) }`
- GET: Include `_count: { select: { products: true } }`
- POST: `sanitizeText()` on name and description — strips HTML/XSS, normalizes whitespace
- POST: Reject empty name after sanitization with 400 "Segment name is required"
- POST: Auto-generate code as `SEG-XXXXX` inside `$transaction`
- POST: Duplicate check within company scope: `findFirst({ where: { companyId, name: sanitizedName, isActive: true } })` — if exists, returns 409 "DUPLICATE_NAME: A segment with this name already exists in your company"
- POST: Creates with companyId from `security.user.companyId`
- POST: Activity log via `logUserActivity` with module `"Sys-Structure-Matrix"`
- POST: batchMode support — if `body.batchMode === true && Array.isArray(body.data)`, creates multiple records in `$transaction` with per-item duplicate checks and auto-codes
- POST: Batch mode uses `logUserActivity` with action: 'IMPORT'
- Error handling with `error instanceof Error` pattern — 409 for DUPLICATE_NAME, 500 for general

#### File 2: /api/segments/[id]/route.ts (COMPLETE rewrite)
- GET: Cross-tenant validation — pre-fetch record, if `companyId && record.companyId && record.companyId !== companyId` → 404
- GET: Include `_count: { select: { products: true } }`
- PUT: Cross-tenant validation before any modification
- PUT: Sanitize all text inputs (name, description) with `sanitizeText()`
- PUT: Reject empty name after sanitization with 400
- PUT: Duplicate name check within company scope if name is changing
- PUT: Activity log with `"Sys-Structure-Matrix"`
- PUT: Enforce companyId on update with `...(companyId && { companyId })`
- DELETE: FK check for active products — `product.count({ where: { segmentId: id, isActive: true } })` — if > 0, throw error
- DELETE: Cross-tenant validation before soft delete
- DELETE: Activity log with `"Sys-Structure-Matrix"`
- DELETE: Error handling with `error instanceof Error && error.message.startsWith('Cannot delete')` → 400
- All handlers use Next.js 16 `params: Promise<{ id: string }>` pattern

#### File 3: /api/capacities/route.ts (COMPLETE rewrite)
- GET: Multi-tenant filter `where: { isActive: true, ...(companyId ? { companyId } : {}) }`
- POST: Sanitize all text inputs (name, description, capacityUnit)
- POST: Reject empty name after sanitization with 400 "Capacity name is required"
- POST: Auto-generate code as `CAP-XXXXX` inside `$transaction`
- POST: **CRITICAL**: Validate `capacityValue` — must be a positive number > 0. Reject negative, zero, or alphabetic entries with 400: "Capacity value must be a positive number greater than zero"
- POST: Validate capacityUnit if provided — must be a valid measurement unit string after sanitization (empty string → null)
- POST: Duplicate name check within company scope — if exists, returns 409 "DUPLICATE_NAME: A capacity with this name already exists in your company"
- POST: Creates with companyId from `security.user.companyId`
- POST: Activity log via `logUserActivity` with module `"Sys-Structure-Matrix"`
- POST: batchMode support — same pattern as segments, with per-item validation for name and capacityValue
- Error handling with `error instanceof Error` pattern

#### File 4: /api/capacities/[id]/route.ts (COMPLETE rewrite)
- GET: Cross-tenant validation — same pattern as segments
- PUT: Cross-tenant validation before any modification
- PUT: Sanitize all text inputs (name, description, capacityUnit)
- PUT: Reject empty name after sanitization with 400
- PUT: **CRITICAL**: If `capacityValue` is being updated, validate it must be > 0. Reject with 400 if negative or zero.
- PUT: Duplicate name check within company scope if name is changing
- PUT: Activity log with `"Sys-Structure-Matrix"`
- PUT: Enforce companyId on update
- DELETE: Safe to soft-delete (no FK references — Capacity model has no dependent models)
- DELETE: Cross-tenant validation before soft delete
- DELETE: Activity log with `"Sys-Structure-Matrix"`
- DELETE: Error handling with `error instanceof Error` pattern

### Verification:
- `bun run lint` passed with ZERO errors
- Dev server stable (HTTP 200)
- All routes follow project conventions (Next.js 16 params as Promise, $transaction for atomicity, withApiSecurity for RBAC, logUserActivity for audit)

### Stage Summary:
- 4 API route files completely rewritten with Phase 6 requirements
- Multi-tenant companyId isolation on all GET/POST/PUT/DELETE
- Cross-tenant validation on all individual routes
- Auto-code generation: SEG-XXXXX for segments, CAP-XXXXX for capacities
- Text sanitization with HTML/XSS stripping on all text inputs
- Duplicate name check within company scope
- capacityValue validation (> 0) on create and update
- Activity logging with module token "Sys-Structure-Matrix"
- batchMode support for CSV import on both POST routes
- FK check on segment DELETE (active products), safe soft-delete on capacity DELETE
