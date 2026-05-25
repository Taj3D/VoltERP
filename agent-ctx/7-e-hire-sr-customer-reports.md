# Task 7-e: Hire Sales, SR, and Customer Report Pages

## Summary
Implemented 19 new report page components in `/home/z/my-project/src/app/page.tsx` for Hire Sales, SR (Sales Representative), and Customer reporting.

## Pages Implemented

### Hire Sales Report Pages (5)
1. **InstallmentCollectionPage** (`installment-collection`) - Installment collection tracking with date range filter, search, summary cards (Total/Collected/Due), CSV+PDF export
2. **UpcomingInstallmentsPage** (`upcoming-installments`) - Installments due in next 30 days with summary cards (Total Due 30d/This Week/This Month), urgency badges, CSV export
3. **DefaultingCustomerPage** (`defaulting-customer`) - Customers with overdue installments, severity color coding (Red>30d, Orange>15d, Yellow>0d), search filter, CSV export
4. **DefaultCustomerSummaryPage** (`default-customer-summary`) - Summary cards (Total Defaulters/Total Overdue/Avg Days Overdue), pie chart of severity distribution, defaulter details table
5. **HireAccountDetailsPage** (`hire-account-details`) - Customer selector, full hire purchase schedule with payment progress bars, installment tracking

### SR Report Pages (8)
6. **SrWiseSalesReportPage** (`sr-wise-sales-report`) - SR/Employee selector, summary by SR (Total Sales/No. Orders/Avg Order Value), CSV export
7. **SrWiseSalesDetailsPage** (`sr-wise-sales-details`) - SR selector + date range, individual order details per SR
8. **SrWiseCustomerDuePage** (`sr-wise-customer-due`) - SR filter, customer dues attributed to each SR
9. **SrWiseCustomerSalesSummaryPage** (`sr-wise-customer-sales-summary`) - SR filter, customer sales summary under each SR
10. **SrVisitReportPage** (`sr-visit-report`) - Date range filter, SR visit/activity records from audit logs, CSV export
11. **SrWiseCustomerStatusPage** (`sr-wise-customer-status`) - SR filter, customer status (Active/Inactive/Due) per SR
12. **SrWiseCashCollectionPage** (`sr-wise-cash-collection`) - SR filter + date range, cash collections by SR, CSV export
13. **SrCommissionReportPage** (`sr-commission-report`) - SR filter + date range, commission calculation (5% rate), summary cards, CSV export

### Customer Report Pages (6)
14. **CustomerWiseSalesReportPage** (`customer-wise-sales-report`) - Customer filter + date range, all sales per customer, CSV export
15. **CategoryWiseCustomerDuePage** (`category-wise-customer-due`) - Category filter, customer dues grouped by product category
16. **CustomerLedgerReportPage** (`customer-ledger-report`) - Customer selector, all transactions with running balance (Debit/Credit/Balance), CSV export
17. **CustomerDueDateWisePage** (`customer-due-date-wise`) - Date range filter, customer dues as of date with oldest due tracking
18. **CustomerCashCollectionPage** (`customer-cash-collection`) - Customer filter + date range, cash collections by customer, CSV export
19. **CustomerLedgerSummaryPage** (`customer-ledger-summary`) - All customers with Opening/Total Sales/Total Payments/Closing Balance, search, CSV+PDF export

## Technical Details
- All pages follow existing report page patterns (PageHeader with icon, filters, responsive tables, dark mode compatible)
- Use ৳ for currency
- Loading and empty states
- Summary stat cards at top where appropriate
- CSV export on all pages, PDF export where applicable
- Data fetched from existing API endpoints: `/api/hire-sales`, `/api/sales-orders`, `/api/employees`, `/api/customers`, `/api/cash-collections`, `/api/categories`, `/api/audit-logs`
- All 19 page keys added to renderPage function
- React Compiler auto-optimized one component (DefaultingCustomerPage useMemo → direct computation)
- File grew from ~11,315 to ~18,275 lines

## Lint Result
✅ 0 errors, 0 warnings
