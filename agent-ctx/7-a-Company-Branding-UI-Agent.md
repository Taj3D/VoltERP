# Task 7-a: Company Branding UI Agent

## Task
Add Company Branding sub-tab to SystemSettingsGroupPage

## Changes Made
- File: `/home/z/my-project/src/components/SystemSettingsGroupPage.tsx`
  - Added `CompanyBranding` interface (lines 178-197)
  - Added icon imports: `ImageIcon, Globe, Phone, Smartphone, FileCheck, MessageSquare, StickyNote, LayoutTemplate, Barcode, Ruler` (line 10-11)
  - Added `companySubTab` state to `CompanySettingsTab` (line 244)
  - Wrapped existing CompanySettingsTab content in inner `<Tabs>` with two sub-tabs: "System Configuration" and "Company Branding" (lines 430-530)
  - Created `CompanyBrandingSubTab` component (lines 539-1055) with:
    - Fetch from `/api/company-branding` on mount
    - No company profile found state
    - Company Identity card (name, logo, brand logo, dimensions)
    - Contact Information card (address, phone, mobile, website, email)
    - Business & Tax Information card (VAT number, trade license, invoice prefix)
    - Invoice Customization card (thank you message, system note, show barcode, show pay in word)
    - Save via PUT `/api/companies/[id]`
    - VAT Auditor read-only view with masking

## Lint Status
- Zero new lint errors
- Only pre-existing start-server.js errors remain
