# Task 20-5: Company Customization — Verify & Enhance

## Audit Results

### 1. SystemSettingsGroupPage.tsx — Company Settings Tab ✅
- **All required fields present**: company name, logo upload (5MB max, base64), brand logo, address, phone, mobile, email, website, VAT number, trade license, invoice prefix, thank you message, system note
- **Logo upload**: Uses `ImageUploadField` component with 5MB max, base64 storage
- **Display options**: Logo width/height, show barcode, show pay in word
- **PDF header preview**: Shows live preview with logo, name, address, VAT
- **Admin-only editing**: `canMutateBranding = isAdmin && !isVatAuditor` — only admin can edit, others see "Read Only" badge
- **Save via `/api/company-branding`**: Correct endpoint, admin-only
- **No changes needed**

### 2. ProfileCenter.tsx — Company Info Tab 🔧 FIXED
**Gaps found and fixed:**
- **GAP 1**: "Edit Company Info" button was visible to ALL users regardless of role
  - **Fix**: Added `user?.role === "admin"` check — only admin sees Edit/Cancel/Save buttons
  - **Fix**: Added "Read Only" badge next to title for non-admin users
  - **Fix**: Added amber warning banner for non-admin users

- **GAP 2**: Logo upload/remove was available to all users
  - **Fix**: Logo upload controls (camera overlay, upload button, remove button) now only show for admin
  - **Fix**: Non-admin users see "No Logo" placeholder or existing logo without edit controls
  - **Fix**: File input `onChange` set to `undefined` for non-admin users

- **GAP 3**: Used `/api/companies/${companyInfo.id}` for updates (no admin-only restriction)
  - **Fix**: Changed `handleSaveCompanyInfo` to use `/api/company-branding` (admin-only)
  - **Fix**: Changed `handleCompanyLogoUpload` to use `/api/company-branding`
  - **Fix**: Changed all logo removal buttons (both in Profile tab and Company Info tab) to use `/api/company-branding`
  - **Fix**: Added admin role check in `handleSaveCompanyInfo` as client-side guard

### 3. /api/company-branding ✅
- **GET**: Returns `{ company: {...} }` with all branding fields (id, code, name, address, phone, mobile, email, logo, brandLogo, logoWidth, logoHeight, vatNumber, tradeLicense, invoicePrefix, thankYouMsg, systemNote, showBarcode, showPayInWord, website)
- **PUT**: Admin-only (`userRole !== 'admin'` returns 403), validates image fields, sanitizes text, updates all branding fields
- **No changes needed**

### 4. /api/companies/[id] 🔧 FIXED
- **GAP**: PUT endpoint allowed any user with Companies module access (including managers) to modify branding fields
- **Fix**: Added admin-only check when branding fields (name, address, phone, email, logo, brandLogo, mobile, website, vatNumber, tradeLicense, invoicePrefix, thankYouMsg, systemNote, showBarcode, showPayInWord, logoWidth, logoHeight) are present in the request body
- **Non-branding fields** (like `isActive`) can still be modified by managers for company management purposes

### 5. PDF Generation ✅
- **Invoice PDF** (`/api/sales-orders/invoice-pdf/route.ts`): Fetches company from DB directly, uses logo, brandLogo, name, address, phone, mobile, email, vatNumber, tradeLicense in PDF header
- **Invoice Engine** (`invoice-engine.ts`): Uses company logo and name in PDF header, all fields rendered correctly
- **Export Utils** (`export-utils.ts`): Uses company logo in general PDF headers via `CompanyProfile` interface
- **All PDFs use company branding from database** — no dummy/fallback data
- **No changes needed**

## Files Changed
1. `/home/z/my-project/src/components/ProfileCenter.tsx` — Admin-only Company Info editing, API endpoint migration
2. `/home/z/my-project/src/app/api/companies/[id]/route.ts` — Admin-only branding field protection

## Verification
- ✅ `bun run lint` passes cleanly (0 errors)
- ✅ Dev server running on port 3000 (HTTP 200)
- ✅ All `/api/companies/${id}` references removed from ProfileCenter
- ✅ All company updates now go through `/api/company-branding` (admin-only)
