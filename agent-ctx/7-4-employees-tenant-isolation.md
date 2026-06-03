# Task 7-4: Employee API Tenant Isolation Fix

## Summary
Updated both Employee API route files to enforce multi-tenant isolation, composite duplicate checking, VAT Auditor/SR masking, and audit log module naming.

## Files Modified

### 1. `/src/app/api/employees/route.ts`
**Changes:**
- **GET**: Added `companyId: security.user.companyId || undefined` to `where` clause for tenant filtering
- **GET VAT masking**: 
  - `vat_auditor`: masks `baseSalary`, `nidNumber`, `tinNumber`, `bankName`, `bankAccountNo` on employee + `salaryBandMin`, `salaryBandMax` on nested designation
  - `sr`: masks `baseSalary` to "N/A (Restricted)" using `fieldRoleRestrictions`
- **POST (single)**: 
  - Added composite duplicate check for `email + companyId` before create
  - Added `companyId: security.user.companyId || null` to create data
  - Changed auditLog module from `'Employees'` to `'HR-Staff-Directory'`
  - Added 409 error handling for duplicate email
- **POST (batch)**: 
  - Added `companyId: security.user.companyId || null` to each batch record
  - Added per-row `email + companyId` duplicate check (skip row on conflict, add to errors)
  - Added batch audit log with module `'HR-Staff-Directory'`

### 2. `/src/app/api/employees/[id]/route.ts`
**Changes:**
- **GET**: Added ownership verification after fetch (`item.companyId !== security.user.companyId` → 403)
- **GET VAT masking**: Same pattern as list route (vat_auditor masks 5 fields + designation bands; sr masks baseSalary)
- **PUT**: Added pre-check ownership verification before update; changed auditLog module to `'HR-Staff-Directory'`
- **DELETE**: Added ownership verification inside transaction; changed auditLog module to `'HR-Staff-Directory'`; added 403 handling for "Access denied" error

## Patterns Applied
- Company ID ownership check: `if (security.user.companyId && item.companyId && item.companyId !== security.user.companyId)`
- Composite duplicate check: `findFirst({ where: { email, companyId } })` before create
- VAT Auditor nested masking: separate `maskForVatAuditor` call for designation sub-object
- SR field-specific masking: `maskForVatAuditor(item, role, ['baseSalary'], { baseSalary: ['sr'] })`
- Audit module: `'HR-Staff-Directory'` (not `'Employees'`)

## Lint Status
- No new lint errors introduced (pre-existing `start-server.js` errors only)
- Dev server running without compilation errors
