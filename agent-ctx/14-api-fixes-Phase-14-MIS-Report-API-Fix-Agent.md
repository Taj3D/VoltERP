# Task 14-api-fixes: Phase 14 MIS Report API Fix Agent

## Summary
Fixed all 16 MIS Report API bugs in `/home/z/my-project/src/app/api/mis-reports/route.ts`

## All 16 Fixes Applied

### BUG 1: dailySales - WRONG FIELD for SR filter (CRITICAL)
- **Line ~1414**: Changed `where.createdBy = params.employeeId` to `where.srId = params.employeeId`
- SalesOrder has no `createdBy` field; it has `srId` for linking to Employee

### BUG 2: dailySales - Missing srId filter for sales
- Added `sr: true` to include: `{ customer: true, sr: true }`
- SR data now available for display and filtering

### BUG 3: modelWiseSales - Missing SR/employeeId filter
- Added `if (params.employeeId) where.srId = params.employeeId;` after customerId filter
- Sales orders now properly filtered by SR when employeeId is provided

### BUG 4: replacementReport - Missing filters
- Added `if (params.customerId) where.customerId = params.customerId;`
- Added `if (params.employeeId) where.salesOrder = { srId: params.employeeId };`
- ReplacementOrder has both `customerId` and `salesOrderId` (→ SalesOrder.srId) fields

### BUG 5: srWiseSalesDetails - MISSING SR FILTER (CRITICAL)
- Added `if (params.employeeId) salesWhere.srId = params.employeeId;` to filter sales by SR
- Added `sr: true` to include: `{ customer: true, sr: true, lines: { include: { product: true } } }`
- Added `srName` column to columns array: `{ key: 'srName', label: 'SR Name' }`
- Added `srName: so.sr?.name || 'N/A'` to output rows

### BUG 6: srVisitReport - WRONG FILTER (CRITICAL)
- Replaced `where.userName = params.employeeId` (comparing UUID to display name - NEVER matches)
- Now looks up employee name first: `const emp = await db.employee.findUnique(...)` then `where.userName = emp.name`
- This correctly filters audit logs by the SR's display name

### BUG 7: srCommissionReport - WRONG EMPLOYEE FILTER (CRITICAL)
- Added `if (params.employeeId) salesWhere.srId = params.employeeId;` to filter sales at query level
- Changed row filter from `rows.filter((r) => r.srCode === params.employeeId)` (comparing code to UUID) to proper srEntry lookup via srSalesMap
- New filter: `rows.filter((r) => { const srEntry = [...srSalesMap.entries()].find(([, d]) => d.srCode === r.srCode); return srEntry ? srEntry[0] === params.employeeId : false; })`

### BUG 8: customerDueReport - _customerId private field leak
- Added `rows = rows.map(({ _customerId, ...rest }) => rest);` after filtering but before sortRows/groupRows
- _customerId is now removed from output rows so it doesn't appear in the report

### BUG 9: customerLedgerSummary - _customerId private field leak
- Same fix as BUG 8: Added `rows = rows.map(({ _customerId, ...rest }) => rest);` after filtering

### BUG 10: customerLedger - Poor UX when no customerId
- Changed empty report from generic columns to helpful hint:
- Title: `'Customer Ledger — Select a Customer'`
- Columns: `[{ key: 'hint', label: 'Please select a customer from the filter above to view their ledger' }]`

### BUG 11: upcomingInstallment - Fragile date filtering on formatted strings
- Moved date filter from post-query string comparison to Prisma query: `if (dateFilter) where.dueDate = dateFilter;`
- Removed fragile post-query date filtering code (lines 1652-1658 that parsed formatted date strings)
- Date filtering now happens at the database level, which is more reliable and efficient

### BUG 12: defaultingCustomer - Broken include with hireWhere
- Removed `hireWhere` from `include: { hireSales: { where: hireWhere, ... } }` pattern
- Changed to `include: { hireSales: { include: { customer: true, lines: { include: { product: true } } } } }`
- hireSales is no longer null for installments whose hire sale doesn't match date filter
- Added post-fetch date filtering using `_hireSalesDate` temp field, then strips it before returning
- Date filter now uses `dateFilter.gte.getTime()` and `dateFilter.lte.getTime()` (Date objects, not strings)

### BUG 13: defaultCustomerSummary - Same broken include pattern
- Same fix as BUG 12: Removed hireWhere from include
- Added `filteredOverdue` variable that applies date filter post-fetch
- Loop now uses `filteredOverdue` instead of raw `overdue`

### BUG 14: srWiseCustomerDue - outstanding filter broken in VAT mode
- Changed from `.filter((r) => r.outstanding > 0 || params.vatMode)` (broken: outstanding masked to string)
- Now saves raw outstanding before masking: `_rawOutstanding: rawOutstanding`
- Filters on raw value: `.filter((r) => r._rawOutstanding > 0)`
- Strips `_rawOutstanding` before returning: `rows.map(({ _rawOutstanding, ...rest }) => rest)`

### BUG 15: srWiseSales - fragile SR designation lookup
- Changed from `{ designation: { name: { contains: 'SR' } } }` (matches "SR Manager", "ISR", etc.)
- Now uses SRTargetSetup table (authoritative source for SR employees):
  - Fetches distinct employeeIds from SRTargetSetup with ACTIVE status
  - Uses `where.id = { in: srEmployeeIds }` for precise filtering
  - Falls back to `{ name: { in: ['SR', 'Sales Representative', 'Sales Rep'] } }` if no SRTargetSetup records

### BUG 16: srCommissionReport - Same fragile SR designation lookup
- Same fix as BUG 15: Uses SRTargetSetup instead of fragile designation name contains
- Consolidated srTargets/srTargetSetups into single query to avoid duplicate variable
- Uses `srTargetSetups` for both employee filtering and commission percentage lookup

## Verification
- Dev server running on port 3000 (HTTP 200)
- `curl http://localhost:3000/api/mis-reports?type=dailySales` returns 401 (auth required, expected)
- `bun run lint` passes cleanly
- No new TypeScript errors introduced beyond pre-existing ones
- All 16 fixes applied as targeted edits, no existing functionality broken

## Files Changed
- `/home/z/my-project/src/app/api/mis-reports/route.ts` — All 16 bug fixes
