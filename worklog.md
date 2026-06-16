# VoltERP Master Audit & Enhancement Plan

## Session: 2026-06-16 — Deep Audit & International Standard Enhancement

### Project Status: RUNNING (localhost:3000)
**Production URL**: https://volterp-app.vercel.app/
**GitHub Repo**: https://github.com/Taj3D/VoltERP

---

## Current State Assessment

### Architecture
- Next.js 16 App Router with TypeScript
- 111 API routes, 36 component files
- Monolith component: ElectronicsMartApp.tsx (6423 lines)
- Prisma ORM with Turso (libSQL) database
- JWT authentication with bcrypt password hashing
- 5 RBAC roles: admin, manager, sr, dealer, vat_auditor

### What Works
- Login with all 5 roles
- Dashboard with real data
- Basic CRUD on GenericModulePage
- Profile with photo/NID upload, company logo
- Change Password: Admin-only (correct)
- SMS service basic functionality
- Chart of Accounts & Ledger
- Financial audit pages
- MIS Report engine

### Key Issues Found (Phase 1 Audit)

1. **GenericModulePage lacks PDF/CSV Export/Import** — Most CRUD pages don't have export/import buttons
2. **GenericReportPage needs export enhancement** — Reports need proper PDF/CSV export
3. **Employee form missing image upload** — No photo, NID front/back upload in create/edit form
4. **Customer form missing image upload** — Same as employee
5. **Investment Head form missing NID/logo upload** — Schema has fields but form doesn't expose them
6. **SMS auto-trigger incomplete** — No auto SMS on purchase receive, godown receive, employee join
7. **Company logo not in PDF headers** — PDF exports don't include company branding
8. **PDF digit formatting** — Bengali/English number mixing possible
9. **Sidebar collapse doesn't persist well** — Need to verify
10. **Role badge display** — Header shows email, but no role badge visible in header
11. **Profile page needs enhancement** — Full edit with all fields, export tracking per user
12. **Many MIS report pages are generic** — May have dummy/placeholder content

---

## 20-Phase Master Plan

### Phase 1: ✅ Initial Browser Audit
- Login with all 5 roles
- Verify role display, header info, navigation
- Check Profile page functionality
- Test sidebar collapse/expand

### Phase 2: Profile Center Enhancement
- Add full photo upload (5MB limit)
- Add NID front/back upload (5MB limit)
- Add all profile fields editable
- Add company logo upload with URL
- Add export tracking (PDF/CSV counts per user)
- Verify Profile data loads correctly for each role

### Phase 3: Security Deep Audit
- Verify bcrypt password hashing works
- Check JWT token handling
- Verify CSRF protection
- Check httpOnly cookie usage
- Audit auth middleware

### Phase 4: Password Change Restrictions
- Only Admin can change passwords (already done)
- Remove Change Password menu for non-admin roles
- Admin can reset other users' passwords from Profile

### Phase 5: SMS Auto-Trigger Enhancement
- Auto SMS on customer purchase (with on/off toggle)
- Auto SMS on payment receive (with on/off toggle)
- Auto SMS on godown stock receive (with on/off toggle)
- Auto SMS on employee join/exam date (with on/off toggle)
- Add toggle settings in SMS Service Setting page

### Phase 6: Image Upload System
- Employee: photo, NID front/back, all 5MB limit
- Customer: photo, NID front/back
- Investment Head: photo, NID front/back
- Supplier: photo, NID front/back, logo
- Company: brand logo upload

### Phase 7: Company Branding in PDFs
- Company name + logo in PDF headers
- Editable company settings
- Logo on print/PDF exports
- Company name on invoices

### Phase 8: PDF/CSV Export/Import on All Pages
- Add Export PDF button to GenericModulePage
- Add Import CSV button to GenericModulePage
- Add Export CSV button to GenericModulePage
- Add export buttons to GenericReportPage
- Fix PDF digit formatting (English only)

### Phase 9: Basic Modules Audit
- Companies, Categories, Colors, Brands, Units, Products, Banks
- Test create/edit/delete for each
- Verify form fields match schema

### Phase 10: Structure & Operations Audit
- Departments, Godowns, Interest%, Segments, Capacities
- SR Targets, Payment Options, CardTypes
- Test all CRUD operations

### Phase 11: Staff & CRM Audit
- Designations, Employees, Employee Leaves
- Customers, Suppliers
- Verify image upload works in forms

### Phase 12: Inventory Audit
- Order Sheets, Purchase Orders, Sales Orders
- Hire Sales, Returns, Replacements
- Stock, Transfers, Batches, Valuation

### Phase 13: Account Management Audit
- Expenses, Incomes, Cash Collections/Deliveries
- Bank Transactions
- Verify double-entry ledger posting

### Phase 14: Accounting Reports Audit
- Chart of Accounts, Cash in Hand, Trial Balance
- P&L, Balance Sheet & Period Close

### Phase 15: Financial Audit & MIS Report Audit
- All financial audit sub-pages
- All MIS report sub-pages
- Verify data accuracy

### Phase 16: System Settings Audit
- Company Settings, Invoice Templates, Number Formats
- Audit Trail Viewer, Performance & Cache

### Phase 17: Responsive Design Fix
- Sidebar collapse/expand fix
- Page scrolling fix
- Mobile layout verification

### Phase 18: Performance Optimization
- Loading speed improvement
- Code splitting
- Caching enhancement

### Phase 19: Comprehensive Bug Fix
- Fix all bugs found during audit phases

### Phase 20: Final Full-System Verification
- All roles, all pages, all features end-to-end

---

## Execution Priority
Phase 1 (audit) → Phase 8 (PDF/CSV on all pages) → Phase 5 (SMS auto-trigger) → Phase 6 (Image upload) → Phase 2 (Profile) → Phase 7 (Company branding) → Phase 17 (Responsive) → Phase 9-16 (Module audits) → Phase 19 (Bug fixes) → Phase 20 (Final verification)

---
Task ID: 5
Agent: SMS Auto-Trigger Enhancement Agent
Task: Enhanced SMS auto-trigger with on/off toggles

Work Log:
- Updated SmsAutomationConfig schema in prisma/schema.prisma to add 4 new toggle fields: autoSmsOnPaymentReceive, autoSmsOnGodownReceive, autoSmsOnEmployeeJoin, autoSmsOnEmployeeExam
- Ran db:push to sync schema changes with database
- Updated sms-auto-trigger.ts: Expanded triggerType union to include new types (payment_received, purchase_order_received, employee_joined, employee_exam_date), updated toggleMap to map new triggers to their config fields, added 4 new template builder functions (buildPaymentReceivedSms, buildGodownReceiveSms, buildEmployeeJoinSms, buildEmployeeExamSms)
- Updated sms-event-hooks.ts: Expanded EventType union with new types (PaymentReceived, PurchaseOrderReceived, EmployeeJoined, EmployeeExamDate), updated eventTypeToConfigField mapping, added 4 new trigger functions (triggerPaymentReceivedSms, triggerPurchaseOrderReceivedSms, triggerEmployeeJoinedSms, triggerEmployeeExamDateSms)
- Updated sms-automation-config/route.ts: Added new toggle fields to GET response and fallback defaults
- Updated sms-automation/route.ts: Added new toggle fields to DEFAULT_AUTOMATION_CONFIG, POST handler (create), and PUT handler (upsert/update)
- Updated sms-automation/trigger/route.ts: Added new trigger types to TRIGGER_TOGGLE_MAP
- Updated SMSAnalyticsPage.tsx: Replaced 4 legacy toggles with 5 expanded toggles (Customer Purchase, Payment Receive, Godown Receive, Employee Join, Employee Exam), added teal color support for Exam toggle, updated PUT request body to include all 8 toggle fields
- Updated cash-collections/route.ts POST handler: Added triggerPaymentReceivedSms call alongside existing triggerFinancialCollectionSms
- Updated purchase-orders/receive/route.ts POST handler: Added triggerPurchaseOrderReceivedSms call with item summary and godown name lookup
- Updated employees/route.ts POST handler: Added triggerEmployeeJoinedSms call with designation name lookup alongside existing triggerHRLifecycleSms
- Verified all changes with bun run lint (no errors) and TypeScript compilation check (no new errors in modified files)

Stage Summary:
- Added 4 new granular SMS auto-trigger toggles with on/off support (autoSmsOnPaymentReceive, autoSmsOnGodownReceive, autoSmsOnEmployeeJoin, autoSmsOnEmployeeExam)
- Existing legacy toggles (autoSmsOnPurchase, autoSmsOnReceipt, autoSmsOnStockReceive, autoSmsOnEmployeeEvent) preserved for backward compatibility
- All new triggers check their respective toggle before sending SMS
- UI updated with 5 visible toggle cards replacing the original 4, now showing granular control
- API hooks integrated into sales-orders, cash-collections, purchase-orders/receive, and employees routes
- Files modified: prisma/schema.prisma, src/lib/sms-auto-trigger.ts, src/lib/sms-event-hooks.ts, src/app/api/sms-automation-config/route.ts, src/app/api/sms-automation/route.ts, src/app/api/sms-automation/trigger/route.ts, src/components/SMSAnalyticsPage.tsx, src/app/api/cash-collections/route.ts, src/app/api/purchase-orders/receive/route.ts, src/app/api/employees/route.ts

---
Task ID: 6
Agent: Image Upload Enhancement Agent
Task: Added image upload to Employee, Customer, Investment Head, Supplier forms

Work Log:
- Read existing ImageUploadField component at src/components/erp/ui/ImageUploadField.tsx - already supports drag-and-drop, preview, replace, remove, and 5MB limit
- Read FieldDef interface in ElectronicsMartApp.tsx - already includes "image" type in union
- Read Prisma schema - all image fields already exist: Employee (photo, nidFrontImage, nidBackImage), Customer (profileImage, nidFrontImage, nidBackImage), InvestmentHead (profileImage, nidFrontImage, nidBackImage), Supplier (profileImage, nidFrontImage, nidBackImage, logoUrl)
- Verified InvestmentGroupPage.tsx already has full ImageUploadField support for Investment Heads
- Added image type rendering case in GenericModulePage form rendering (ElectronicsMartApp.tsx ~line 921) - renders ImageUploadField with 5MB limit and toast error handling
- Updated openCreate defaults to set image fields to null instead of empty string
- Updated openEdit defaults to set image fields to null instead of empty string when no value exists
- Added image fields to SIDEBAR_CONFIG form field definitions:
  - Employees: photo, nidFrontImage, nidBackImage (type: "image")
  - Customers: profileImage, nidFrontImage, nidBackImage (type: "image")
  - Suppliers: profileImage, nidFrontImage, nidBackImage, logoUrl (type: "image")
- Enhanced expanded row display in GenericModulePage to show image thumbnails for base64 data URLs instead of raw strings
- Added GIF support to ImageUploadField (ACCEPTED_TYPES, file input accept, error message, and hint text)
- Fixed suppliers API route (POST): Added logoUrl to validateImageFields call, changed logoUrl from stripHtml to nullIfEmpty to preserve base64 data
- Fixed suppliers API route (PUT /[id]): Added logoUrl to validateImageFields call, changed logoUrl from stripHtml to nullIfEmpty, added nullIfEmpty function definition
- Verified all API routes (employees, customers, investment-heads, suppliers) properly handle base64 image data in both POST and PUT operations
- Ran bun run lint - all checks pass with no errors

Stage Summary:
- All 4 forms now support image upload: Employee (photo + NID front/back), Customer (profile + NID front/back), Investment Head (profile + NID front/back), Supplier (profile + NID front/back + logo)
- ImageUploadField component enhanced with GIF format support (now accepts JPEG, PNG, GIF, WebP)
- GenericModulePage now renders type: "image" fields using ImageUploadField with drag-and-drop, preview, replace, and remove capabilities
- Expanded table rows show image thumbnails instead of raw base64 strings
- API routes properly validate image sizes (5MB limit via validateImageFields) and preserve base64 data without HTML stripping
- Files modified: src/components/ElectronicsMartApp.tsx, src/components/erp/ui/ImageUploadField.tsx, src/app/api/suppliers/route.ts, src/app/api/suppliers/[id]/route.ts

---
Task ID: 7
Agent: Company Branding & PDF Digit Formatting Agent
Task: Added company branding (logo + name) to all PDF exports and fixed PDF digit formatting

Work Log:
- Read existing code: export-utils.ts, invoice-engine.ts, number-format.ts, company-branding-cache.ts, company-branding API route, companies API routes, SystemSettingsGroupPage.tsx, ElectronicsMartApp.tsx
- Verified company-branding API route already exists at /api/company-branding with GET and PUT handlers
- Verified company-branding-cache.ts already provides loadCompanyProfile(), getCachedCompanyProfile(), clearCompanyProfileCache()
- Verified SystemSettingsGroupPage already has full editable company settings with ImageUploadField for logo/brandLogo
- Identified core problem: exportToPDF, exportToPDFSimple, and exportAuditReportPDF were not auto-loading company profile when the `company` parameter was not provided — most callers (50+ locations) don't pass company at all
- Modified export-utils.ts: Added import of loadCompanyProfile and getCachedCompanyProfile from company-branding-cache
- Modified exportToPDF: Added auto-load company profile from branding cache when `company` option is not provided (checks cache first, then fetches from API)
- Modified exportToPDFSimple: Added same auto-load logic for company profile
- Modified exportAuditReportPDF: Added same auto-load logic for company profile
- Fixed JPEG format detection in drawCorporateHeader: Changed from hardcoded `data:image/png;base64,` to auto-detect JPEG from base64 header (`/9j/` prefix = JPEG, `iVBOR` = PNG) — this fixes logo rendering for the uploaded JPEG logo
- Fixed brand logo format detection with same JPEG/PNG auto-detection
- Modified invoice-engine.ts: Added import of getCachedCompanyProfile, added auto-load from cache when company is not provided or incomplete (merges cached data as fallback)
- Fixed JPEG format detection in drawCompanyHeader for both logo and brand logo
- Fixed JPEG format detection in server-side invoice-pdf route.ts for both logo and brand logo
- Added clearCompanyProfileCache import and call in SystemSettingsGroupPage.tsx after saving company branding — ensures next PDF export fetches fresh data
- Fixed toLatinDigits wrapping in SystemSettingsGroupPage fmt() function for currency, date, and number types — prevents any possible Bengali digit leakage in PDF data
- Fixed toLatinDigits wrapping in ElectronicsMartApp.tsx for the Total Inventory Value summary row in product PDF export
- Seeded company record in database with Electronics Mart logo from upload/logo.jpeg (base64 data URL, ~96KB) and full company details (name, address, phone, mobile, email, website, vatNumber, tradeLicense, invoicePrefix, thankYouMsg, systemNote)
- Verified all changes with bun run lint — no errors

Stage Summary:
- ALL PDF exports now automatically include company logo + name + address + phone + email + VAT/trade license in the header
- This applies to: exportToPDF (50+ call sites), exportToPDFSimple (20+ call sites), exportAuditReportPDF (2 call sites), and exportInvoicePDF (2 call sites)
- No changes required to any caller — the auto-load mechanism transparently injects company branding
- JPEG format detection fixed across all PDF generation code (export-utils.ts, invoice-engine.ts, invoice-pdf route.ts) — previously hardcoded to PNG, which would fail for JPEG logos
- Company branding cache cleared automatically when admin saves company settings
- PDF digit formatting reinforced with toLatinDigits() wrappers in SystemSettingsGroupPage and ElectronicsMartApp
- Company seeded in database with full branding data including logo from upload/logo.jpeg
- Files modified: src/lib/export-utils.ts, src/lib/invoice-engine.ts, src/app/api/sales-orders/invoice-pdf/route.ts, src/components/SystemSettingsGroupPage.tsx, src/components/ElectronicsMartApp.tsx

---
Task ID: 2+3
Agent: Profile Center Enhancement + Security Audit Agent
Task: Phase 2 (Profile Center Enhancement) and Phase 3 (Security Deep Audit)

Work Log:
- Read worklog.md and all relevant source files to understand current state
- **Part A: Profile Center Enhancement**
  - Added `designation` field to User model in prisma/schema.prisma (String?, nullable)
  - Ran `db:push` to sync schema changes with database
  - Updated `/api/auth/profile` GET handler to include `designation` in select clause
  - Updated `/api/auth/profile` PUT handler to accept, validate, and persist `designation` field
  - Updated `/api/auth/me` GET handler to include `designation` in select clause
  - Updated `/api/users/profile` GET handler to return `designation` in response
  - Updated `/api/users/profile` PUT handler to accept and save `designation` field
  - Verified photo upload works via PUT to /api/auth/profile with base64 photo (5MB limit)
  - Verified voter ID images upload/save correctly via PUT to /api/auth/profile with voterIdFront/voterIdBack
  - Verified company info tab allows editing all fields (name, address, phone, email, mobile, website, vatNumber, tradeLicense, logo) via /api/company-branding (admin-only)
  - Verified export tracking tab shows server-side counters from User model (pdfExports, csvImports, csvExports)
  - Enhanced `/api/auth/telemetry` POST handler to increment User model counters (pdfExports/csvExports/csvImports) on every export/import action, with cache invalidation
  - Confirmed role badge is already hidden per user request (comments in ProfileCenter.tsx lines 1356-1357, 1362)
- **Part B: Security Deep Audit**
  - Audited JWT implementation (jwt-utils.ts): HS256, 8h access/7d refresh, token blacklisting via DB, production JWT_SECRET check — PASS
  - Audited CSRF implementation (csrf.ts): In-memory token store, transitional mode, cryptographically secure — ACCEPTABLE for API-based architecture
  - Audited API auth patterns (api-security.ts): Pure JWT Bearer token auth, no X-User-Email fallback — PASS
  - Identified httpOnly cookie gap: tokens stored in localStorage, not httpOnly cookies — DOCUMENTED as medium-severity finding
  - Fixed X-User-Email usage in card-type-setups routes: removed broken `logActivity` helper that used X-User-Email header for server-to-server calls (dead code — /api/user-activity has no POST handler, and the routes already had proper tx.auditLog.create audit logging)
  - Documented frontend X-User-Email headers as harmless (server ignores them for auth, JWT-only)
  - Created comprehensive security audit report at /home/z/my-project/agent-ctx/2+3-security-audit.md
- Ran `bun run lint` — all checks pass with no errors
- Verified TypeScript compilation — no new errors in modified files

Stage Summary:
- **Profile Center**: All profile fields (name, phone, address, designation, photo, voter ID front/back) are now editable and persisted to server. Company info tab allows full editing (admin-only). Export counters increment in User model on every PDF/CSV export/import action.
- **Security Audit**: JWT auth is production-ready, bcrypt password hashing with auto-migration works correctly, CSRF is in acceptable transitional mode, httpOnly cookies are the only medium-severity gap (documented for future improvement).
- Files modified: prisma/schema.prisma, src/app/api/auth/profile/route.ts, src/app/api/auth/me/route.ts, src/app/api/auth/telemetry/route.ts, src/app/api/users/profile/route.ts, src/app/api/card-type-setups/route.ts, src/app/api/card-type-setups/[id]/route.ts
- Files created: /home/z/my-project/agent-ctx/2+3-security-audit.md

---
Task ID: 17
Agent: Responsive Design Fix Agent
Task: Fix sidebar collapse/expand, page scrolling, and mobile/PC responsive design issues

Work Log:
- Read worklog.md and analyzed the full ElectronicsMartApp.tsx sidebar implementation (6400+ lines)
- Identified 4 key issues:
  1. Sidebar collapse/expand: When collapsed, clicking a group icon navigated instead of expanding — confusing UX causing "sidebar doesn't expand back" perception
  2. Desktop sidebar wrapper `<div className="hidden md:contents">` could cause rendering issues with fixed-positioned sidebar in some browsers
  3. Main content area had `style={{ overflowX: 'clip' }}` inline style (poor browser support for `overflow-x: clip`) and inner div had `overflow-hidden` which could interfere with scrolling
  4. Mobile Sheet sidebar used `bg-sidebar` CSS variable while desktop sidebar used hardcoded `bg-[#0a1628]` — potential color mismatch
- **Fix 1: Sidebar collapse/expand behavior** — Changed group button onClick handler so that when sidebar is collapsed, clicking any group icon calls `onToggle()` to expand the sidebar instead of navigating. This directly addresses the reported "সাইড বার ছোট কলে বড় হয়না" issue.
- **Fix 2: Removed `hidden md:contents` wrapper** — Replaced the problematic `<div className="hidden md:contents">` wrapper around the desktop sidebar with direct rendering. Added `hidden md:flex` class directly to the sidebar `<aside>` element (when not embedded), which is more reliable for fixed-positioned elements. The sidebar now handles its own responsive visibility.
- **Fix 3: Main content scrolling** — Replaced `style={{ overflowX: 'clip' }}` with Tailwind class `overflow-x-hidden` on the `<main>` element. Removed `overflow-hidden` from the inner content div (changed to just `min-w-0` for flex min-width safety). This ensures proper vertical scrolling in the main content area.
- **Fix 4: Mobile Sheet sidebar color consistency** — Changed Sheet sidebar from `bg-sidebar border-sidebar-border` to `bg-[#0a1628] dark:bg-[#060e1a] border-white/10` to match the desktop sidebar colors exactly.
- **Fix 5: Collapsed sidebar active indicator** — Enhanced the active group indicator when sidebar is collapsed: made the dot larger (w-1.5 h-1.5 instead of w-1 h-1), added a blue glow shadow, and added a subtle blue background highlight (`bg-blue-500/15 text-blue-300`) to the active group's icon button.
- **Fix 6: Sidebar group title always visible** — Changed the `title` attribute on group buttons from conditional (`collapsed ? group.label : undefined`) to always show (`group.label`), providing tooltip on hover in both states.
- Verified all module pages (GenericModulePage, ProductsPage, StockPage, DashboardAnalyticsPage, SalesModulePage, AccountManagementPage, InventoryGroupPage, PersonnelCRMGroupPage, FinancialAuditGroupPage, MISReportEngine, etc.) have proper overflow handling with `overflow-x-auto` on tables and `overflow-y-auto` with max-height on scrollable areas.
- Verified mobile responsive design: Sheet sidebar works correctly, header has mobile menu button, tables have horizontal scroll, forms use `max-w-[95vw]` on mobile, footer has `margin-left: 0 !important` on mobile via CSS.
- Ran `bun run lint` — all checks pass with no errors
- Dev server confirmed running and responding (HTTP 200)

Stage Summary:
- Sidebar collapse/expand now works correctly: clicking any group icon when collapsed expands the sidebar instead of navigating to a page
- Desktop sidebar wrapper changed from `hidden md:contents` div to direct rendering with `hidden md:flex` on the aside element — more reliable for fixed-positioned sidebars
- Main content scrolling fixed: replaced `overflowX: 'clip'` inline style with `overflow-x-hidden` Tailwind class, removed `overflow-hidden` from inner content div
- Mobile Sheet sidebar colors now match desktop sidebar exactly
- Collapsed sidebar shows enhanced active group indicator (larger dot + blue glow + background highlight)
- All module pages verified for proper responsive overflow handling
- Files modified: src/components/ElectronicsMartApp.tsx
