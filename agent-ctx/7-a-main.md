# Task 7-a: Update Sidebar Navigation and PageKey Types

## Summary
Updated the PageKey type and sidebarGroups array in `/home/z/my-project/src/app/page.tsx` to include ALL missing modules.

## Changes Made

### 1. PageKey Type (lines 42-78)
Added 45 new page keys:
- `liability-received`, `liability-pay`, `liability-report`
- `company-order-sheet`, `customer-order-sheet`, `order-sheet-report`
- `employee-info`, `product-info`, `stock-details-report`, `stock-summary-report`
- `stock-ledger`, `stock-quantity-report`, `stock-forecast-product`, `stock-forecast-concern`
- `supplier-ledger`, `daily-purchase-report`, `supplier-wise-purchase`, `supplier-cash-delivery`
- `suppliers-due-report`, `model-wise-purchase`, `vat-report`
- `daily-sales-report`, `replacement-report`, `model-wise-sales`
- `installment-collection`, `upcoming-installments`, `defaulting-customer`
- `default-customer-summary`, `hire-account-details`
- `sr-wise-sales-report`, `sr-wise-sales-details`, `sr-wise-customer-due`
- `sr-wise-customer-sales-summary`, `sr-visit-report`, `sr-wise-customer-status`
- `sr-wise-cash-collection`, `sr-commission-report`
- `customer-wise-sales-report`, `category-wise-customer-due`, `customer-ledger-report`
- `customer-due-date-wise`, `customer-cash-collection`, `customer-ledger-summary`
- `expense-report`, `product-wise-benefit`, `income-report`, `adjustment-report`
- `transaction-summary`, `monthly-transaction`, `showroom-analysis`
- `bank-transaction-report`, `bank-ledger`

### 2. Sidebar Navigation (lines 90-283)
Replaced entire sidebarGroups array with full structure containing 13 groups:
1. **Dashboard** - 1 item
2. **Investment** - 6 items (added Liability Received, Liability Pay, Liability Report)
3. **Basic Setup** - 14 items (moved Products here as 4th item, changed SR Targets icon to Target)
4. **Staff** - 3 items (changed Designations icon to Award)
5. **Customers & Suppliers** - 2 items
6. **Inventory** - 14 items (added Company Order Sheet, Customer Order Sheet, Order Sheet Report; updated labels)
7. **Accounts** - 6 items (updated labels to singular forms)
8. **SMS Service** - 7 items (reordered: Inbox first, updated labels)
9. **Accounting Reports** - 4 items (updated labels)
10. **MIS Report** - 43 items (massive expansion with all stock/purchase/sales/hire/SR/customer reports)
11. **Management Report** - 7 items (NEW group: expense/income/adjustment/transaction reports)
12. **Bank Report** - 4 items (NEW group: bank/transfer reports separated from old Management group)
13. **System** - 3 items (NEW group: advance search, audit log, user profile separated from old Management group)

### 3. Products Group Removed
The standalone "Products" group was removed. Products is now the 4th item in "Basic Setup".

## Lint Result
✅ `bun run lint` passed with 0 errors (only a BABEL note about file size > 500KB, which is expected)
