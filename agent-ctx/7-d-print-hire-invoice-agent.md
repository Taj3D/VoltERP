# Task 7-d: Print Hire Invoice PDF Agent

## Task
Add a "Print Invoice PDF" button to the Hire Sales section in ElectronicsMartApp.tsx, similar to what was added for Sales Orders.

## Work Completed

### Changes to `/home/z/my-project/src/components/ElectronicsMartApp.tsx`

1. **Added state variable** (line ~3482):
   - `const [printingHireInvoiceId, setPrintingHireInvoiceId] = useState<string | null>(null);`

2. **Added `handlePrintHireInvoice` function** (lines ~3711-3851):
   - Fetches company branding from `/api/company-branding`
   - Fetches Hire Receipt template from `/api/invoice-templates?templateType=Hire Receipt`
   - Maps hire sale data to InvoiceData with `invoiceType: "Hire Receipt"`
   - Maps downPayment as paidAmount, balanceAfterDP as currentDue
   - Includes installment details in remarks when installments exist
   - Calls `exportInvoicePDF()` with filename `HireInvoice-${invoiceNo}.pdf`

3. **Added "Print Invoice" toolbar button** (lines ~3873-3877):
   - Placed after Export PDF button, before Create Hire Sale button
   - RBAC-gated: visible only for admin/manager roles
   - Shows RefreshCw spinner while printing
   - Prints the first filtered hire sale

4. **Added Printer icon button in table rows** (lines ~3951-3955):
   - Placed before Edit button in each row's action column
   - RBAC-gated: visible only for admin/manager roles
   - Shows per-row spinner while printing
   - Calls `handlePrintHireInvoice(item)` on click

### Changes to `/home/z/my-project/worklog.md`
- Added Task 7-d section with complete work log and stage summary

## Verification
- Ran `npx eslint src/components/ElectronicsMartApp.tsx` — zero errors
- Pre-existing lint errors in start-server.js only (not related to this change)
- All existing functionality preserved
