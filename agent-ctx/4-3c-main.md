# Task 4-3c: Rewrite 6 API Route Files for Colors, Brands, and Units with Stage 4 Audit Fixes

## Agent: main
## Status: COMPLETED

## Summary
Rewrote all 6 API route files implementing multi-tenant isolation (companyId), duplicate name+companyId checks (409 Conflict), batchMode CSV import with companyId injection + null-safe handling + activity logging, and companyId ownership verification on GET/PUT/DELETE.

## Files Created/Modified

### 1. `/home/z/my-project/src/app/api/colors/route.ts`
- **GET**: Filter by `companyId: security.user.companyId || null`, include `_count: { select: { products: true } }`
- **POST single**: Inject `companyId`, duplicate check on name+companyId → 409, auditLog
- **POST batchMode**: Inject companyId, null-safe handling (colorCode → null for missing), activity logging via `UserActivityLog`

### 2. `/home/z/my-project/src/app/api/colors/[id]/route.ts`
- **GET by ID**: Verify companyId matches (403 if mismatch, unless admin)
- **PUT**: Verify companyId ownership, duplicate name check excluding self → 409
- **DELETE**: Verify companyId ownership, keep FK check (products), soft-delete

### 3. `/home/z/my-project/src/app/api/brands/route.ts`
- **GET**: Filter by companyId
- **POST single**: Inject companyId, duplicate name+companyId check → 409, code auto-gen (BRN-)
- **POST batchMode**: Inject companyId, null-safe (description → null), activity logging

### 4. `/home/z/my-project/src/app/api/brands/[id]/route.ts`
- **GET by ID** (NEW): companyId verification
- **PUT**: Verify companyId ownership, duplicate check, auditLog
- **DELETE**: Verify companyId ownership, FK check (products), soft-delete, auditLog

### 5. `/home/z/my-project/src/app/api/units/route.ts`
- **GET**: Filter by companyId
- **POST single**: Inject companyId, duplicate name+companyId check → 409, code auto-gen (UNT-)
- **POST batchMode**: Inject companyId, null-safe (symbol → null, description → null), activity logging

### 6. `/home/z/my-project/src/app/api/units/[id]/route.ts`
- **GET by ID** (NEW): companyId verification
- **PUT**: Verify companyId ownership, duplicate check, auditLog
- **DELETE**: Verify companyId ownership, soft-delete, auditLog

### Supporting Changes
- **`/home/z/my-project/src/lib/db.ts`**: Updated PRISMA_SCHEMA_VERSION to `v4-color-brand-unit-companyId`, added cache invalidation checks for color/brand/unit companyId fields
- **`/home/z/my-project/src/lib/api-security.ts`**: Added `Brands: 'basic-modules'` and `Units: 'basic-modules'` to MODULE_GROUP_MAP

## Key Patterns Implemented

### Tenant Isolation Pattern
```typescript
const userCompanyId = security.user.companyId || null;
// GET list: filter by companyId
// GET by ID: verify after fetch, 403 if mismatch (unless admin)
```

### Duplicate Check Pattern
```typescript
const existing = await tx.xxx.findFirst({
  where: { name: body.name, companyId: userCompanyId },
});
if (existing) throw new Error(`A ${moduleName} with name "${body.name}" already exists in your company`);
// Returns 409 Conflict
```

### Activity Logging Pattern (CSV Import)
```typescript
await db.userActivityLog.create({
  data: {
    userId: security.user.id,
    userName: security.user.name,
    actionType: 'IMPORT_CSV',
    module: 'Colors-Config', // or 'Brands-Config' or 'Units-Config'
    fileName: 'colors-import.csv',
    details: JSON.stringify({ imported: results.length, failed: errors.length }),
  },
});
```

## Lint Results
All 6 route files + supporting files pass ESLint with zero errors.

## Database
Schema already has companyId fields on Color, Brand, Unit models. `bun run db:push` confirmed in sync.
