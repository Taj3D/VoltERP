# Task 7-5: Employee Leaves API — Tenant Isolation & Security Fixes

## Summary
Fixed both employee-leaves API route files to enforce multi-tenant isolation, leave balance validation, VAT auditor masking, and correct audit log module naming.

## Files Modified

### 1. `/home/z/my-project/src/app/api/employee-leaves/route.ts`
- **GET**: Added `where: { companyId: security.user.companyId || undefined }` for tenant filtering
- **GET**: Added VAT Auditor masking — `totalDays` field masked to `"N/A (Audit Mode)"` for `vat_auditor` role
- **POST (single)**: Added employee tenant verification — checks `employee.companyId` matches `security.user.companyId` before creating leave
- **POST (single)**: Added `companyId: security.user.companyId || null` to create data
- **POST (single)**: Added leave balance validation with annual limits: Casual=10, Sick=14, Annual=18, Maternity=120
- **POST (single)**: Changed auditLog module from `'EmployeeLeaves'` to `'HR-Leave-Management'`
- **POST (single)**: Added specific error handling for tenant mismatch (403) and balance exceeded (400)
- **POST (batch)**: Added `companyId: security.user.companyId || null` to each batch record's data

### 2. `/home/z/my-project/src/app/api/employee-leaves/[id]/route.ts`
- **GET**: Added cross-tenant ownership check after fetching item — returns 403 if `item.companyId !== security.user.companyId`
- **GET**: Added VAT Auditor masking on `totalDays` field
- **PUT**: Added ownership check before update — returns 403 on companyId mismatch
- **PUT**: Added employee tenant verification when `employeeId` changes
- **PUT**: Changed auditLog module from `'EmployeeLeaves'` to `'HR-Leave-Management'`
- **DELETE**: Added ownership check before delete — returns 403 on companyId mismatch
- **DELETE**: Changed auditLog module from `'EmployeeLeaves'` to `'HR-Leave-Management'`

## Key Patterns Used
- Ownership check: `if (security.user.companyId && item.companyId && item.companyId !== security.user.companyId)` — allows access if either is null
- Employee tenant verification: checks `employee.companyId` against `security.user.companyId` inside transaction
- Leave balance: Uses `tx.employeeLeave.aggregate()` with year-bounded date range filter
- VAT masking: Uses `maskForVatAuditor(item, role, ['totalDays'])` helper from `@/lib/api-security`

## Lint & Server
- ESLint: Only pre-existing errors in `start-server.js` (not related to our changes)
- Dev server: Running normally, no compilation errors
