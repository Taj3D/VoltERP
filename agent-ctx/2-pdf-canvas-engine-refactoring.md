# Task ID: 2 — PDF Canvas Engine Refactoring Agent

## Task: Phase 11 — Refactor Global PDF Canvas Engine in export-utils.ts

## Summary

Refactored `/home/z/my-project/src/lib/export-utils.ts` by adding new types, drawing functions, and an invoice export orchestrator. All existing code preserved intact.

## Changes Made

### File: `/home/z/my-project/src/lib/export-utils.ts`
- **Lines**: 1200 → 1839 (+639 lines)
- **Lint**: PASS (zero errors)

### New Exported Types (4)
1. `InvoiceMetadata` — Two-column metadata matrix fields (documentNo, counterpartyCode, counterpartyName, etc.)
2. `PaymentBreakdown` — Payment type breakdown (cash, bank, mfs, card)
3. `LegalFooterConfig` — Legal compliance footer (legalText, greetingText)
4. `InvoicePDFOptions` — Extends PDFOptions with metadata, paymentBreakdown, legalFooter

### New Exported Functions (4)
1. `drawMetadataMatrix(doc, metadata, startY, pageWidth, margin, company?)` — Renders two-column grid with #f8f9fa background
2. `drawPaymentSummaryBlock(doc, breakdown, startY, pageWidth, margin, company?)` — Renders payment sub-table (only if any amount > 0)
3. `drawLegalComplianceFooter(doc, config, pageWidth, pageHeight, margin, company?)` — Italic 6pt gray legal text + greeting
4. `exportInvoicePDF(options)` — Orchestrator: header → metadata → table → payment → legal → footer → save

### New Internal Helper (1)
- `invoiceCurrencyFmt(value, company?)` — Formats with `company?.currencySymbol || "৳"`

### Preserved Functions (ALL)
- `exportToPDF`, `exportToPDFSimple`, `exportToCSV`, `exportToCSVSimple`, `importFromCSV`
- `drawCorporateHeader`, `drawFooter`, `fixPageXOfY`
- `formatCellValue`, `escapeCSVField`, `getVisibleColumns`, `calculateColumnWidths`
- `VAT_MASKED_COLUMNS`, `isVatMasked`, `getVatMaskedKeys`
