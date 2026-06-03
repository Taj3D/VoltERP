# Task 6-3a: Department & Godown API Route Builder

## Work Log

### Context Review
- Read worklog.md for prior context (Tasks 1-10, Stages 1-13)
- Read api-security.ts for withApiSecurity, all RBAC utilities, and security types
- Read activity-logger.ts for logUserActivity API with module tokens
- Read Prisma schema for Department (code, companyId, name, description, designations[], employees[]) and Godown (code, companyId, name, address, phone, inCharge, status, capacityValue, capacityUnit, products[], purchaseOrders[], salesOrders[], etc.) models
- Read all 4 existing route files for baseline code

### File 1: /api/departments/route.ts (COMPLETE rewrite)
- GET: Multi-tenant filter `where: { isActive: true, ...(companyId ? { companyId } : {}) }`
- GET: Includes `_count: { select: { employees: true, designations: true } }`
- POST: `sanitizeText()` on `name` and `description` fields
- POST: Rejects empty `name` after sanitization with 400 "Department name is required"
- POST: Auto-generates code as `DEPT-XXXXX` inside `$transaction`
- POST: Case-insensitive duplicate check: exact match via `findFirst`, plus manual lowercased comparison for SQLite (no `mode: 'insensitive'` support)
- POST: Creates with `companyId` from `security.user.companyId`
- POST: Activity log via `logUserActivity` with module `"Sys-Structure-Matrix"`
- POST: `batchMode` support — if `body.batchMode === true` and `body.data` is array, creates multiple records in single `$transaction`
- POST: Batch mode skips invalid entries and duplicates instead of failing entire batch
- Error handling with `error instanceof Error` pattern; 409 for duplicate names

### File 2: /api/departments/[id]/route.ts (COMPLETE rewrite)
- GET: Cross-tenant validation — pre-fetch record, if `companyId && record.companyId && record.companyId !== companyId` return 404
- GET: Includes `_count: { select: { employees: true, designations: true } }`
- PUT: Cross-tenant validation before any modification
- PUT: `sanitizeText()` on `name` and `description`, reject empty name with 400
- PUT: Case-insensitive duplicate check if name is being changed (excludes self from check)
- PUT: Activity log with module `"Sys-Structure-Matrix"`, includes `updatedFields`
- DELETE: FK check for active designations and employees (preserved from original)
- DELETE: Cross-tenant validation before soft delete
- DELETE: Activity log with module `"Sys-Structure-Matrix"`, includes `softDelete: true`
- All catch blocks use `error instanceof Error` pattern with specific error routing

### File 3: /api/godowns/route.ts (COMPLETE rewrite)
- GET: Multi-tenant filter `where: { isActive: true, ...(companyId ? { companyId } : {}) }`
- GET: Includes `_count: { select: { products: true } }`
- POST: `sanitizeText()` on `name`, `address`, `inCharge`, `phone`
- POST: Rejects empty `name` with 400 "Godown/Warehouse name is required"
- POST: Rejects empty `address` with 400 "Godown/Warehouse address is required"
- POST: Auto-generates code as `WH-XXXXX` inside `$transaction`
- POST: Multi-tenant code uniqueness: `findFirst({ where: { companyId, code } })` — if exists, increments counter in while loop
- POST: Sets `status: "ACTIVE"` by default
- POST: Validates `capacityValue`: must be >= 0, rejects negative with 400 "Capacity value must be zero or greater"
- POST: Creates with `companyId` from `security.user.companyId`
- POST: Activity log with module `"Sys-Structure-Matrix"`
- POST: `batchMode` support — processes array, skips invalid entries, single audit log entry
- Error handling with `error instanceof Error` pattern

### File 4: /api/godowns/[id]/route.ts (COMPLETE rewrite)
- GET: Cross-tenant validation — pre-fetch, return 404 on companyId mismatch
- GET: Includes `_count: { select: { products: true } }`
- PUT: Cross-tenant validation before any modification
- PUT: `sanitizeText()` on all text inputs (name, address, inCharge, phone)
- PUT: If `status` changed to `"SUSPENDED"` from `"ACTIVE"`, logs `statusChangeDetail: "EMERGENCY CLOSURE ACTIVATED"`
- PUT: If `status` changed from `"SUSPENDED"` to `"ACTIVE"`, logs `statusChangeDetail: "WAREHOUSE REACTIVATED"`
- PUT: Validates `capacityValue` if being updated: must be >= 0
- PUT: Activity log with module `"Sys-Structure-Matrix"`, includes `previousStatus`, `statusChangeDetail`
- DELETE: FK check for products, POs, SOs, hire sales, sales returns, transfers from/to (preserved from original)
- DELETE: Cross-tenant validation before soft delete
- DELETE: Activity log with module `"Sys-Structure-Matrix"`, includes `softDelete: true`
- All catch blocks use `error instanceof Error` pattern

### Verification
- `bun run lint` passed with ZERO errors
- Dev server stable on localhost:3000 (HTTP 200)

## Stage Summary
- 4 API route files completely rewritten with Phase 6 requirements
- Multi-tenant companyId isolation on all GET/POST/PUT/DELETE operations
- Cross-tenant validation on all individual (`[id]`) routes
- Auto-code generation: DEPT-XXXXX for departments, WH-XXXXX for godowns
- Text sanitization with HTML tag stripping, whitespace normalization
- Case-insensitive duplicate name checking (manual lowercased for SQLite)
- Godown status transition logging: "EMERGENCY CLOSURE ACTIVATED" / "WAREHOUSE REACTIVATED"
- Capacity validation (>= 0) on create and update
- batchMode support on both POST routes
- Activity logging via `logUserActivity` with module token `"Sys-Structure-Matrix"`
- All `error instanceof Error` patterns in catch blocks
