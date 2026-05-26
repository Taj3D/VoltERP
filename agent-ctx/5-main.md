# Task 5 - Fix Critical Bugs in Electronics Mart IMS Basic Module API Routes

**Agent**: main
**Task ID**: 5

## Summary

Applied 5 critical fixes across 26 basic module API routes (52 files total: 26 main routes + 26 [id] routes).

## Fixes Applied

### FIX 1: Add isActive Filter to ALL Basic Module GET Routes
- Added `where: { isActive: true }` (or merged with existing where) to all 26 GET handlers
- For models without `isActive` field (SmsBill, SmsBillPayment, EmployeeLeave), kept original query without isActive filter
- For models with existing where clauses (Liabilities with type filter, OrderSheets with companyId/customerId/status filters), merged `isActive: true` into the existing where object

### FIX 2: Convert Hard DELETE to Soft DELETE for Basic Modules
- Changed all DELETE handlers from `db.model.delete()` to `db.model.update({ data: { isActive: false } })`
- Added FK reference checks before soft-deleting. If the record is referenced by active records in other tables, returns 400 error with descriptive message
- FK checks implemented per model:
  - **Company**: checks active Products and OrderSheets
  - **Category**: checks active Products and active child Categories
  - **Color**: checks active Products
  - **Bank**: checks active BankTransactions, Expenses, Incomes, CashCollections, CashDeliveries
  - **Department**: checks active Designations and Employees
  - **Godown**: checks active Products, PurchaseOrders, SalesOrders, HireSales, SalesReturns, StockTransfers (from/to)
  - **Segment**: checks active Products
  - **PaymentOption**: checks active CardTypeSetups, Expenses, Incomes, SalesOrders, CashCollections, CashDeliveries
  - **CardType**: checks active CardTypeSetups
  - **Employee**: checks active SRTargets and EmployeeLeaves
  - **Designation**: checks active Employees
  - **InvestmentHead**: checks active Assets and Liabilities
  - **Product**: checks active transaction lines (PO, SO, Transfer, Hire, Replacement, SalesReturn, PurchaseReturn)
- For models without `isActive` field (SmsBill, SmsBillPayment, EmployeeLeave), kept hard delete but added audit logging
- For models with no FK references (Capacity, CardTypeSetup, InterestPercentage, SRTargetSetup, Asset, Liability, SmsSetting, SmsLog), simple soft-delete without FK check

### FIX 3: Add Audit Logging to Basic Module API Routes
- Added `db.auditLog.create()` calls in all POST (CREATE), PUT (UPDATE), and DELETE handlers
- Pattern follows the specified template with action, module, recordId, recordLabel, userId, userName, details
- All mutations remain wrapped in `db.$transaction()` (already were for most, confirmed all)
- Module names used: Companies, Categories, Colors, Banks, Departments, Godowns, Segments, Capacities, PaymentOptions, CardTypes, CardTypeSetup, InterestPercentages, SRTargets, Employees, Designations, EmployeeLeaves, InvestmentHeads, Assets, Liabilities, OrderSheets, Replacements, SmsBills, SmsBillPayments, SmsSettings, SmsLogs, Products

### FIX 4: Bank currentBalance on Creation
- In `/api/banks/route.ts` POST handler, added `currentBalance: openingBalance` so when a bank is created with openingBalance=100000, currentBalance is also set to 100000
- Previously, currentBalance was defaulting to 0 regardless of openingBalance

### FIX 5: Category Circular Reference Prevention
- In `/api/categories/[id]/route.ts` PUT handler, added circular reference detection before updating parentCategoryId
- Algorithm: traverse the parent chain starting from the proposed new parent, checking if the current category ID appears in the chain
- Returns 400 error with descriptive message if a cycle would be created
- Also prevents self-reference (setting a category as its own parent)

## Files Modified (52 total)

### Main route.ts files (26):
- src/app/api/companies/route.ts
- src/app/api/categories/route.ts
- src/app/api/colors/route.ts
- src/app/api/banks/route.ts
- src/app/api/departments/route.ts
- src/app/api/godowns/route.ts
- src/app/api/segments/route.ts
- src/app/api/capacities/route.ts
- src/app/api/payment-options/route.ts
- src/app/api/card-types/route.ts
- src/app/api/card-type-setup/route.ts
- src/app/api/interest-percentages/route.ts
- src/app/api/sr-targets/route.ts
- src/app/api/employees/route.ts
- src/app/api/designations/route.ts
- src/app/api/employee-leaves/route.ts
- src/app/api/investment-heads/route.ts
- src/app/api/assets/route.ts
- src/app/api/liabilities/route.ts
- src/app/api/order-sheets/route.ts
- src/app/api/replacements/route.ts
- src/app/api/sms-bills/route.ts
- src/app/api/sms-bill-payments/route.ts
- src/app/api/sms-settings/route.ts
- src/app/api/sms-logs/route.ts
- src/app/api/products/route.ts

### [id]/route.ts files (26):
- src/app/api/companies/[id]/route.ts
- src/app/api/categories/[id]/route.ts
- src/app/api/colors/[id]/route.ts
- src/app/api/banks/[id]/route.ts
- src/app/api/departments/[id]/route.ts
- src/app/api/godowns/[id]/route.ts
- src/app/api/segments/[id]/route.ts
- src/app/api/capacities/[id]/route.ts
- src/app/api/payment-options/[id]/route.ts
- src/app/api/card-types/[id]/route.ts
- src/app/api/card-type-setup/[id]/route.ts
- src/app/api/interest-percentages/[id]/route.ts
- src/app/api/sr-targets/[id]/route.ts
- src/app/api/employees/[id]/route.ts
- src/app/api/designations/[id]/route.ts
- src/app/api/employee-leaves/[id]/route.ts
- src/app/api/investment-heads/[id]/route.ts
- src/app/api/assets/[id]/route.ts
- src/app/api/liabilities/[id]/route.ts
- src/app/api/order-sheets/[id]/route.ts
- src/app/api/replacements/[id]/route.ts
- src/app/api/sms-bills/[id]/route.ts
- src/app/api/sms-bill-payments/[id]/route.ts
- src/app/api/sms-settings/[id]/route.ts
- src/app/api/sms-logs/[id]/route.ts
- src/app/api/products/[id]/route.ts

## Verification
- `bun run lint` — 0 errors, 0 warnings
- Dev server running successfully on port 3000
