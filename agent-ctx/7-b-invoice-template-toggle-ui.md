# Task 7-b: Invoice Template Toggle UI Agent

## Summary
Added dynamic layout toggle controls to the InvoiceTemplatesTab editor dialog in SystemSettingsGroupPage.tsx.

## Changes Made

### File: `/home/z/my-project/src/components/SystemSettingsGroupPage.tsx`

1. **Icon Imports** — Added `Table2`, `UserCheck`, `Type` to lucide-react imports (line 11)

2. **InvoiceTemplate Interface** — Extended with 27 boolean toggle fields and 3 string fields:
   - Header: showLogo, showBrandLogo, showMobile, showAddress, showVatNumber, showTradeLicense
   - Metadata: showCustomerCode, showPrevDue, showTotalDue, showRemindDate
   - Table Columns: showModel, showColor, showDescription, showMRP, showDiscountAmt, showUnitPrice
   - Summary: showDiscountPct, showPPDiscount, showAdjustment, showDeliveryCost, showPaymentDetails
   - Footer: showCustomerSignature, showPreparedBy, showCheckedBy, showAuthorizedBy, showPrintedBy, showSalesPerson, showPrintDate
   - Custom: companyName, termsAndConditions, customFooterNote

3. **editorData State** — Extended with all 30 toggle/string fields with sensible defaults

4. **openEditor()** — Updated to populate toggle values from template object using nullish coalescing

5. **Editor Dialog** — Restructured from 2-column layout to tabbed 3-tab layout:
   - Tab 1: "HTML/CSS Editor" — existing textarea editors
   - Tab 2: "Live Preview" — existing iframe preview  
   - Tab 3: "Layout Settings" — 6 categorized card sections with toggle switches

6. **handleSaveEditor** — Already sends all editorData via spread operator, so toggle values included automatically

## Lint Status
- Only pre-existing errors remain (CompanyBrandingSubTab undefined, start-server.js require imports)
- Zero new lint errors introduced
