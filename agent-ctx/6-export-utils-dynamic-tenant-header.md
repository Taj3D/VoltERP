# Task ID: 6 — Export Utils Dynamic Tenant Company Profile Header

## Agent
Export Utils Dynamic Tenant Header Agent

## Summary
Updated `/src/lib/export-utils.ts` to support dynamic tenant company profile branding in PDF headers and footers, replacing hardcoded "VoltERP — Electronics Mart IMS" company name and "NextGen Digital Studio — Electronics Mart IMS" footer.

## Changes Made

### 1. CompanyProfile Interface (new)
- Added at lines 41-51
- Fields: `name` (required), `address?`, `phone?`, `mobile?`, `email?`, `logo?` (Base64 data URL), `logoWidth?` (mm, default 30), `logoHeight?` (mm, default 20)

### 2. PDFOptions Interface (updated)
- Added `company?: CompanyProfile` field at line 78

### 3. drawCorporateHeader() (updated)
- Added `company?: CompanyProfile` parameter
- Dynamic company name: `company?.name || "VoltERP — Electronics Mart IMS"`
- Logo rendering via `doc.addImage()` when `company?.logo` provided
- Text offset shifts right after logo (logoWidth + 4mm gap)
- Company address below name in dimmer white
- Phone/mobile right-aligned below timestamp
- Email right-aligned below phone
- VAT Auditor badge repositioned to avoid overlap

### 4. drawFooter() (updated)
- Added `company?: CompanyProfile` parameter
- Dynamic copyright: `© {company.name || "VoltERP — Electronics Mart IMS"}`

### 5. exportToPDF() (updated)
- Destructures `company` from options
- Passes `company` to all 7 drawCorporateHeader/drawFooter call sites

### 6. exportToPDFSimple() (updated)
- Added `company?: CompanyProfile` parameter (after subtitle)
- Passes `company` to drawCorporateHeader and drawFooter

### 7. CSV Export/Import (unchanged)
- No changes needed — these functions don't generate PDFs

## Backward Compatibility
All changes are fully backward compatible. When `company` is not provided:
- Header defaults to "VoltERP — Electronics Mart IMS"
- Footer defaults to "VoltERP — Electronics Mart IMS"
- No logo rendered, no address/phone/email displayed

## Verification
- `bun run lint` → 0 errors, 0 warnings
