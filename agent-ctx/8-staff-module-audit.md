# Task 8: Staff Module + PersonnelCRMGroupPage Deep Audit

## Agent: Code Auditor
## Date: 2026-03-05
## Status: ✅ COMPLETE

## Summary
Deep audit of PersonnelCRMGroupPage.tsx (6 tabs: Designations, Employees, Employee Leaves, Leave Allocations, Customers, Suppliers) and all associated API routes.

## Bugs Found and Fixed (6 total):

1. **Delete toast says "Deleted" instead of "Deactivated" for soft-delete modules (HIGH)** — Fixed in PersonnelCRMGroupPage.tsx handleDelete
2. **Missing `logo` field on Customer and Supplier (HIGH)** — Added to schema, frontend formFields, and all 4 API routes
3. **Employee Leave totalDays not auto-calculated from date range on frontend (MEDIUM)** — Added calculation in handleSave
4. **Employee DOB future date validation missing in handleSave (MEDIUM)** — Added explicit future date check
5. **Customer/Supplier credit limit and opening balance negative value validation (MEDIUM)** — Added frontend + server-side validation
6. **Customer/Supplier API missing negative value validation (MEDIUM)** — Added to customers/route.ts and suppliers/route.ts

## Files Modified:
- src/components/PersonnelCRMGroupPage.tsx
- prisma/schema.prisma
- src/app/api/customers/route.ts
- src/app/api/customers/[id]/route.ts
- src/app/api/suppliers/route.ts
- src/app/api/suppliers/[id]/route.ts

## Verified Working:
- All 6 tabs load data correctly
- CRUD operations functional on all tabs
- VAT Auditor masking on financial columns
- SR salary masking on employees
- SR credit limit masking on customers
- Import CSV, Export CSV, Export PDF buttons work
- financialFooter on all PDF exports
- printedBy uses displayName
- Image upload 5MB max with JPEG/PNG/WebP validation
- XSS sanitization on all string inputs
- RBAC: Dealer hidden from HR+suppliers, SR blocked from suppliers
- Lint passes clean
