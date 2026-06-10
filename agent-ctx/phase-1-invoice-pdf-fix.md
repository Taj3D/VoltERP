# Phase 1 — Invoice PDF Engine Fix

## Task: Fix the PDF Invoice Engine Completely — All 12 Issues

### Files Modified
1. `src/app/api/sales-orders/invoice-pdf/route.ts` — Server-side PDF generation API
2. `src/lib/invoice-engine.ts` — Client-side invoice engine
3. `src/components/InventoryGroupPage.tsx` — handlePrintInvoice fixes
4. `src/components/SalesModulePage.tsx` — Added handlePrintInvoice + Printer button

### All 12 Issues Fixed
1. ✅ Company logo rendering (left + right) with data URL detection and format inference
2. ✅ Title changed to "Sales Invoice" (12pt bold centered)
3. ✅ Items table shows SL | Description | Qty | Unit Price | Amount
4. ✅ Customer details: Name, Code, Phone, Address shown in metadata grid
5. ✅ Bengali text fallback: "Thank You! Come Again." when non-ASCII detected
6. ✅ Date format: "12 Jun 2025" style consistently via fmtDate()
7. ✅ VAT number displayed when set in company profile (no template flag dependency)
8. ✅ Signature labels visible: Customer's Signature, Prepared By, Authorized By
9. ✅ No excessive white space — footer follows content flow
10. ✅ Pay In Word shows BDT amount in words with text wrapping
11. ✅ No redundant page info
12. ✅ System note changed to "This is a system generated invoice." (no contradiction)

### Key Fix Details
- Company branding API returns `{ company: {...} }` — must extract inner object
- InvoiceLineItem mapping fixed: `rate` → `unitPrice`, `total` → `amount`
- Template config: `showDescription: true`, `showVatNumber: true`, signature fields enabled
- SalesModulePage now has Printer button per row + handlePrintInvoice function

### Test PDF
- Generated at `public/test-invoice.pdf` (20KB)
- Verified: logo, title, items table, customer details, VAT, Pay In Word, signatures, system note
- `bun run lint` passes with zero errors
