# Task 4 — Expense/Income Heads API Rewrite

## Agent: API Security Agent
## Task ID: 4

### Objective
Rewrite two API route files for Expense/Income Heads with multi-tenant companyId isolation, AuditLog module token "Fin-Expense-Head", and enhanced RBAC.

### Files Modified

1. **`/home/z/my-project/src/app/api/expense-income-heads/route.ts`** — Complete rewrite
2. **`/home/z/my-project/src/app/api/expense-income-heads/[id]/route.ts`** — Complete rewrite

### Changes Summary

#### File 1: `/api/expense-income-heads/route.ts`
| Method | Feature | Implementation |
|--------|---------|----------------|
| GET | Multi-tenant filter | `where: companyId ? { companyId, isActive: true } : { isActive: true }` |
| POST | CompanyId enforcement | `...(companyId && { companyId })` spread (null-safe) |
| POST | batchMode | `body.batchMode === true && Array.isArray(body.data)` → bulk create in $transaction |
| POST | AuditLog token | `module: 'Fin-Expense-Head'` (was 'ExpenseIncomeHeads') |
| POST | Batch audit | Single AuditLog with `recordId: 'BATCH'` and count summary |

#### File 2: `/api/expense-income-heads/[id]/route.ts`
| Method | Feature | Implementation |
|--------|---------|----------------|
| GET | Cross-tenant check | Pre-fetch record, `if (companyId && record.companyId && record.companyId !== companyId) return 404` |
| PUT | Cross-tenant validation | Same pattern as GET, plus companyId enforcement on update |
| PUT | AuditLog token | `module: 'Fin-Expense-Head'` |
| DELETE | Admin-only delete | `checkFinancialDeletePermission(security.user.role)` — 403 for non-admin |
| DELETE | Cross-tenant check | Same pattern before soft delete |
| DELETE | FK integrity | Checks `expense.count` and `income.count` for active references |
| DELETE | Soft delete | `isActive: false` (not hard delete) |
| DELETE | AuditLog token | `module: 'Fin-Expense-Head'` |

### Verification
- `bun run lint` passed with zero errors
- Dev server stable (HTTP 200 confirmed from dev.log)
- All routes follow Next.js 16 conventions (params as Promise, $transaction for atomicity)

### Previous Agent Context
- Read worklog.md (Tasks 1-3): Invoice engine audit, core re-engineering, batchMode additions
- Read api-security.ts: withApiSecurity, checkFinancialDeletePermission, ApiSecurityResult types
- Read Prisma schema: ExpenseIncomeHead model with companyId, isActive, expenses[], incomes[]
