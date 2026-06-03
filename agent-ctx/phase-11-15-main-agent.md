# Phase 11-15: Deep Audit of Staff, CRM, Inventory, Sales, and Stock Modules

## Task ID: phase-11-15
## Agent: Main Agent
## Status: COMPLETE

## Summary of Work Done

### Phase 11: Staff Module (Designations, Employees, Employee Leave)
- **API endpoints verified**: designations, employees, employee-leaves, leave-allocations all return valid data
- **CRUD operations verified**: All 4 modules have working CREATE, READ, UPDATE, DELETE with tx parameter in logUserActivity
- **BUG FIXED: Code auto-generation collision** - designations, employees, employee-leaves used `findFirst({ orderBy: { createdAt: 'desc' } })` which could return non-matching codes (e.g., AUDIT-001) causing the regex to fail and nextNum to default to 1, colliding with existing DSG-00001/EMP-00001/LEV-00001. Fixed with `findMany()` + `Math.max()` approach.
- **Export/Import buttons verified**: All tabs in PersonnelCRMGroupPage have CSV, PDF, Import CSV
- **VAT Auditor masking**: salaryBandMin, salaryBandMax, baseSalary all masked ✅
- **SMS auto-triggers**: HRLifecycle fires on employee creation ✅

### Phase 12: Customers & Suppliers Module
- **API endpoints verified**: customers, suppliers both return valid data with computed balances
- **BUG FIXED: Code auto-generation collision** - Same `findFirst()` pattern fixed with `findMany()` + `Math.max()` for CUS-XXXXX and SUP-XXXXX
- **Export/Import buttons verified**: All tabs have CSV, PDF, Import CSV
- **VAT Auditor masking**: openingBalance, creditLimit, computedCurrentBalance, computedCreditUtilization all masked ✅
- **SR masking**: creditLimit masked for SR role ✅

### Phase 13: Inventory Module
- **API endpoints verified**: order-sheets, purchase-orders, auto-po all return valid data
- **BUG FIXED: Code auto-generation collision** - order-sheets generateSheetNo() used `findFirst()`. Fixed with `findMany()` + `Math.max()` for OS-XXXXX
- **BUG FIXED: Missing Import CSV on Purchase Orders** - Added Import CSV button (admin-only) after PDF button
- **Export/Import buttons verified**: All tabs have CSV, PDF; Import added where needed
- **VAT Auditor masking**: subTotal, discount, vatAmount, grandTotal, costPrice, wholesalePrice all masked ✅
- **SMS auto-triggers**: InventoryIngestion fires on PO receiving ✅

### Phase 14: Sales Module
- **API endpoints verified**: sales-orders, hire-sales, sales-returns all return valid data
- **BUG FIXED: Missing Import CSV on Hire Sales** - Added Import CSV button (admin-only) after PDF button
- **Export/Import buttons verified**: All 3 tabs have CSV, PDF, Import CSV
- **VAT Auditor masking**: All financial fields masked in exports and table cells ✅
- **SMS auto-triggers**: SalesConfirmation fires on sales order creation ✅

### Phase 15: Stock Module
- **API endpoints verified**: stock, stock-details, transfers, opening-stock, batches, valuation all return valid data
- **BUG FIXED: Missing Import CSV on Stock Overview** - Added Import CSV button (admin-only) using /api/opening-stock endpoint
- **BUG FIXED: Missing Import CSV on Opening Stock** - Added Import CSV button (admin-only)
- **BUG FIXED: Missing Import CSV on Batch Master** - Added Import CSV button (admin-only)
- **BUG FIXED: VAT Auditor valuation aggregates NOT masked** - `maskForVatAuditor(response, role, [...])` was called on top-level response but totalInventoryValue/totalSaleValue/totalPotentialProfit were nested inside `response.aggregates`. Added separate masking for the nested aggregates object.
- **Export/Import buttons verified**: All tabs have CSV, PDF; Import added where needed
- **VAT Auditor masking**: costPrice, salePrice, stockValue, valuationPerUnit, totalValue, batchValue, etc. all masked ✅

## Files Modified
- src/app/api/designations/route.ts (code auto-generation fix: findMany + Math.max)
- src/app/api/employees/route.ts (code auto-generation fix: findMany + Math.max)
- src/app/api/employee-leaves/route.ts (code auto-generation fix: findMany + Math.max)
- src/app/api/customers/route.ts (code auto-generation fix: findMany + Math.max)
- src/app/api/suppliers/route.ts (code auto-generation fix: findMany + Math.max)
- src/app/api/order-sheets/route.ts (generateSheetNo fix: findMany + Math.max)
- src/app/api/valuation/route.ts (VAT Auditor aggregate masking fix)
- src/components/InventoryGroupPage.tsx (added Import CSV on Purchase Orders)
- src/components/SalesModulePage.tsx (added Import CSV on Hire Sales)
- src/components/StockModulePage.tsx (added Import CSV on Stock Overview, Opening Stock, Batch Master)

## Bugs Found & Fixed (8 total)
1. Designation code auto-generation collision (CRITICAL - caused 500 errors on POST)
2. Employee code auto-generation collision
3. Employee-leave code auto-generation collision
4. Customer code auto-generation collision
5. Supplier code auto-generation collision
6. Order-sheet code auto-generation collision
7. Missing Import CSV on 5 module pages (Purchase Orders, Hire Sales, Stock Overview, Opening Stock, Batch Master)
8. VAT Auditor valuation aggregates not masked (totalInventoryValue, totalSaleValue, totalPotentialProfit)
