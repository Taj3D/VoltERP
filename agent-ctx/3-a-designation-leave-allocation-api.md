# Task 3-a: Designation & Leave Allocation API Agent

## Task
Rewrite Designation API routes and create Leave Allocation API routes with Phase 8 requirements.

## Files Produced
1. `/home/z/my-project/src/app/api/designations/route.ts` — COMPLETE rewrite
2. `/home/z/my-project/src/app/api/designations/[id]/route.ts` — COMPLETE rewrite
3. `/home/z/my-project/src/app/api/leave-allocations/route.ts` — NEW FILE
4. `/home/z/my-project/src/app/api/leave-allocations/[id]/route.ts` — NEW FILE

## Key Implementation Details

### Designation Routes
- Multi-tenant companyId filtering on GET (both list and single)
- Cross-tenant validation on GET/PUT/DELETE for /id route
- VAT Auditor masking on salaryBandMin, salaryBandMax fields
- safeFinancialRound on salary band values
- AuditLog module: 'HR-Personnel-Core' (NOT 'Designations')
- Admin-only delete with FK check for active employees
- Soft delete (isActive=false)
- batchMode support on POST for CSV import

### Leave Allocation Routes
- New API routes for LeaveAllocation model
- Multi-tenant companyId filtering on GET
- Include employee with designation and department relations
- No VAT Auditor masking (leave allocations are not financial)
- Validate allocatedDays > 0
- Compute remainingDays = allocatedDays - usedDays
- Duplicate check: same employee+leaveType+year within same company
- Prevent usedDays > allocatedDays on update
- Admin-only hard delete
- batchMode support on POST for CSV import

## Lint Status
- `bun run lint` passed with ZERO errors
