# Task 7-c: Print Invoice PDF Button

## Summary
Added "Print Invoice PDF" button to the Sales Orders section in ElectronicsMartApp.tsx that uses the invoice-engine.ts to generate dynamic invoice PDFs.

## Changes Made

### File: `/home/z/my-project/src/components/ElectronicsMartApp.tsx`

1. **Imports (lines 51-52)**: Added `exportInvoicePDF`, `numberToWordsBDT` and type imports from `@/lib/invoice-engine`

2. **State & RBAC (lines 2808-2811)**: 
   - Added `isAdminOrManager` check (admin || manager)
   - Added `printingInvoiceId` state for per-row loading spinner

3. **handlePrintInvoice function (lines 3016-3149)**:
   - Fetches company branding from `/api/company-branding`
   - Fetches invoice templates from `/api/invoice-templates?templateType=Invoice`
   - Maps sales order to InvoiceData with all fields
   - Calls `exportInvoicePDF()` with company, template, invoice, filename

4. **Toolbar button (lines 3174-3178)**: "Print Invoice" button with Printer icon, admin/manager only

5. **Row action button (lines 3250-3254)**: Small Printer icon per-row, admin/manager only, with spinner

## APIs Used
- GET `/api/company-branding` → InvoiceCompanyProfile
- GET `/api/invoice-templates?templateType=Invoice` → InvoiceTemplateConfig

## Lint Status
Zero new lint errors in modified file.
