# Task 4 — Invoice PDF Engine Builder

## Task
Create Dynamic Invoice PDF Engine (invoice-engine.ts) matching RenderReport.pdf layout structure

## Work Summary

Created `/src/lib/invoice-engine.ts` — a comprehensive, production-ready invoice PDF generation engine for VoltERP / Electronics Mart IMS.

### What was built

**7 Type Interfaces:**
- `InvoiceCompanyProfile` — 16 fields for company branding (name, address, logo, brandLogo, vatNumber, tradeLicense, etc.)
- `InvoiceTemplateConfig` — 28 toggle fields for dynamic layout control (show/hide any section or column)
- `InvoiceLineItem` — Invoice line items (sl, model, color, description, qty, mrp, discountAmt, unitPrice, amount)
- `InvoicePaymentDetail` — Payment method breakdown
- `InvoiceData` — 22 fields covering complete invoice data
- `InvoicePDFOptions` — Top-level options with company, template, invoice, VAT settings

**1 Core Function:**
- `exportInvoicePDF(options: InvoicePDFOptions): void` — Generates portrait A4 PDF matching RenderReport.pdf layout

**8 Helper Functions:**
1. `numberToWordsBDT()` — BDT format converter with Crore/Lakh/Thousand + Paisa support
2. `drawCompanyHeader()` — Logo, company name, address, mobile, separators, invoice title
3. `drawMetadataGrid()` — Two-column key:value layout with light background
4. `drawItemsTable()` — Dynamic columns via autoTable with navy header, proportional widths
5. `drawSummaryBlock()` — Three-section layout (discounts, totals, payment details)
6. `drawExtraFields()` — Pay/Due in words, remarks, barcode
7. `drawFooterSection()` — Thank you message, 4 signature lines, system notes
8. `drawContinuationHeader()` — Compact header for multi-page invoices

**Additional:**
- `generateSampleInvoiceData()` — Test helper with realistic sample data
- VAT Auditor masking + watermark support
- Multi-page item overflow handling (15 items per page)
- Currency: ৳ symbol, en-BD locale
- Date: "28 Apr 2026" format

### Verification
- `bun run lint` → 0 errors
- Uses same jsPDF + autoTable standalone pattern as export-utils.ts
- Client-side only (runs in browser)
