# VoltERP Deployment Worklog

## Project Overview
- **Project**: VoltERP - Enterprise-grade Inventory Management System
- **GitHub**: https://github.com/Taj3D/VoltERP (Public)
- **Vercel**: https://volterp-app.vercel.app (Production)
- **Turso DB**: libsql://volterp-db-taj3d.aws-ap-northeast-1.turso.io
- **Stack**: Next.js 16, TypeScript, Prisma ORM, Turso (libSQL), Tailwind CSS, shadcn/ui

---

## Task ID: 1
## Agent: Main Agent
## Task: Check current project state and verify previous work

### Work Log:
- Read existing .env configuration (local SQLite: file:./db/custom.db)
- Verified GitHub repo exists at Taj3D/VoltERP with recent commits
- Verified Vercel project exists (volterp-app, ID: prj_5DmP7hiRaI35xGbJQQAqtUMX9PLn)
- Found Vercel deployment had wrong DIRECT_URL (file:./db/direct.db instead of Turso URL)
- Found Prisma schema used DIRECT_URL for both url and directUrl fields

### Stage Summary:
- GitHub upload: ✅ Complete
- Vercel project: ✅ Exists but needs env var fixes
- Turso database: ✅ Has all 92 tables and 361 indexes already pushed
- Local dev server: ✅ Running on port 3000

---

## Task ID: 2
## Agent: Main Agent
## Task: Fix Vercel env vars and update Prisma schema for Turso

### Work Log:
- Deleted wrong DIRECT_URL (file:./db/direct.db) from Vercel
- Added correct DIRECT_URL (libsql://volterp-db-taj3d.aws-ap-northeast-1.turso.io) to Vercel
- Deleted and re-added DATABASE_URL with correct Turso URL on Vercel
- Deleted and re-added DATABASE_AUTH_TOKEN with correct Turso JWT on Vercel
- Updated prisma/schema.prisma: url uses DATABASE_URL, directUrl uses DIRECT_URL
- Updated .env.example with DIRECT_URL documentation
- Ran `npx prisma generate` successfully
- Committed changes and pushed to GitHub (commit 42a86b5)
- Vercel auto-deployment triggered and completed (READY, PROMOTED)

### Stage Summary:
- Vercel env vars: ✅ All correct (DATABASE_URL, DATABASE_AUTH_TOKEN, DIRECT_URL, JWT_SECRET)
- Prisma schema: ✅ Updated for Turso adapter pattern
- Vercel deployment: ✅ Live at volterp-app.vercel.app
- Turso connection test: ✅ Connected, 5 users found, auth token working
- Main page: ✅ Returns HTTP 200
- Auth API: ✅ Working (returns "Invalid credentials" for wrong login)

---

## Task ID: 3
## Agent: Main Agent
## Task: Final end-to-end verification

### Work Log:
- Verified https://volterp-app.vercel.app/ returns 200
- Verified /api/db-test returns: {"status":"connected","dbType":"Turso (libSQL)","prismaUserCount":5}
- Verified /api/auth POST returns proper auth response
- Verified local dev server still working on localhost:3000

### Stage Summary:
- **ALL 3 STEPS OF MASTER PLAN COMPLETE:**
  1. ✅ GitHub: Taj3D/VoltERP (public, code pushed)
  2. ✅ Turso: Schema pushed, 92 tables, 361 indexes, connection verified
  3. ✅ Vercel: volterp-app.vercel.app (deployed with Turso connection)

---

## Current Project Status

### Deployment URLs:
- **Production**: https://volterp-app.vercel.app
- **GitHub**: https://github.com/Taj3D/VoltERP
- **Turso DB**: libsql://volterp-db-taj3d.aws-ap-northeast-1.turso.io

### Environment Configuration:
| Variable | Local | Vercel |
|----------|-------|--------|
| DATABASE_URL | file:./db/custom.db | libsql://volterp-db-taj3d...turso.io |
| DIRECT_URL | file:./db/custom.db | libsql://volterp-db-taj3d...turso.io |
| DATABASE_AUTH_TOKEN | (not set) | (encrypted Turso JWT) |
| JWT_SECRET | emart-dev-jwt-secret... | (encrypted production secret) |

### Known Issues:
- /api/system-health returns 500 on Vercel (likely auth middleware issue, not database)
- Local dev uses SQLite, Vercel uses Turso - data is not synced between environments

---

## Task ID: 1-a
## Agent: Fix Agent
## Task: Profile Page Fixes, Role Display, Password Restriction

### Work Log:

#### Fix 1: Profile Page - Full User Info with Edit Capability
- Extended `ProfileUser` interface to include `voterIdFront`, `voterIdBack`, `pdfExports`, `csvImports`, `csvExports`
- Added state variables: `editVoterIdFront`, `editVoterIdBack`, `voterIdFrontInputRef`, `voterIdBackInputRef`, `serverCounters`
- Added `handleVoterIdUpload()` handler for front/back Voter ID image uploads with file validation
- Added `handleSaveVoterIdImages()` handler to persist Voter ID images to `/api/auth/profile`
- Updated `loadProfileFromServer()` to load `voterIdFront`, `voterIdBack`, `pdfExports`, `csvImports`, `csvExports` from server
- Added **Export/Import Counters Card** showing server-side `pdfExports`, `csvExports`, `csvImports` with color-coded cards
- Added **Voter ID Images Card** with front/back image upload UI, preview, camera overlay, remove buttons

#### Fix 2: Role Display - Show User EMAIL Instead of Role Name
- Updated `AppHeader.tsx`: Avatar now shows `user.email.charAt(0)`, header button shows `user.email` as text label
- Updated `AppHeader.tsx`: User menu now shows `user.email` as primary (font-mono), `displayName/name` as secondary
- Updated `ElectronicsMartApp.tsx`: Sidebar user section shows `user.email` instead of `displayName/name`
- Updated `ElectronicsMartApp.tsx`: Collapsed sidebar avatar tooltip and initial use `user.email`
- Updated `ProfileCenter.tsx`: Removed `emart.` from `RAW_USERNAME_PATTERNS` so emails like `emart.amit` are not masked
- Updated `ProfileCenter.tsx`: `getInitials()` now uses email (first 2 chars) instead of displayName
- Updated admin password reset table to show email in user name column instead of `getSafeDisplayName(u.name)`

#### Fix 3: Password Change Restriction - Admin Only
- **Profile Tab**: "Change My Password" card now wrapped in `{user.role === ROLES.ADMIN && (...)}` — completely hidden for non-admin users (previously showed 403 card)
- **Password Security Tab**: `TabsTrigger` for "admin-reset" now wrapped in `{user.role === ROLES.ADMIN && (...)}` — tab not visible to non-admin users
- **Password Security Tab Content**: Changed `TabsContent` to be wrapped in `{user.role === ROLES.ADMIN && (...)}` — entire tab content hidden for non-admin (removed the 403 Access Denied card that was shown to non-admin)
- **APIs**: Already enforce admin-only — no changes needed to `/api/auth/change-password` and `/api/auth/reset-password`
- **AppHeader**: Already only shows "Change Password" menu item for admin — no changes needed
- **ChangePasswordPage**: Already checks admin role — no changes needed

### Files Modified:
- `src/components/ProfileCenter.tsx` — Major changes (Voter ID uploads, export counters, password UI restriction, email display)
- `src/components/erp/layout/AppHeader.tsx` — Header shows user email as primary display
- `src/components/ElectronicsMartApp.tsx` — Sidebar shows user email
- `worklog.md` — This entry

### Lint Status:
- All modified files pass ESLint (0 errors, 0 warnings)
- Pre-existing lint error in `src/lib/db.ts` (unrelated to this task)

---

## Task ID: 1-b
## Agent: Fix Agent
## Task: PDF Digit Fix, Sidebar Resize, Module Pages Scroll

### Work Log:

#### Fix 1: PDF Digit Fix — Bengali/English Digit Mixing

**Root Cause**: The `sanitizeCurrencyValue()` function in `export-utils.ts` was REMOVING Bengali digits instead of CONVERTING them. When a value like "১২৩৪.৫৬" (1234.56 in Bengali) passed through, the Bengali digits were stripped leaving ".56", which then parsed as 0.56 — completely wrong currency amounts in PDFs.

**Changes Made**:

1. **`src/lib/export-utils.ts`** — `sanitizeCurrencyValue()`:
   - Changed Bengali digit regex from REMOVE to CONVERT: `raw.replace(/[\u09E6-\u09EF]/g, d => String(d.charCodeAt(0) - 0x09E6 + 0x0030))`
   - Now "১২৩৪.৫৬" correctly becomes "1234.56" instead of ".56"
   - Verified `numberToTakaWords()` already outputs English-only words
   - Verified `formatBDT()` already delegates to `fmtCurrency()` with `toLatinDigits()` pass
   - Verified `formatCellValue()` already wraps dates with `toLatinDigits()`
   - Verified PDF header/footer timestamps already use `toLatinDigits()`

2. **`src/components/ElectronicsMartApp.tsx`** — `fmt()` and `fmtDate()`:
   - Added `toLatinDigits` import from `@/lib/number-format`
   - Wrapped `fmt()` date formatting with `toLatinDigits()`
   - Wrapped `fmtDate()` with `toLatinDigits()`
   - Wrapped profile "Joined" date with `toLatinDigits()`
   - Wrapped dashboard clock `toLocaleDateString()` and `toLocaleTimeString()` with `toLatinDigits()`

3. **`src/components/erp/layout/AppHeader.tsx`**:
   - Added `toLatinDigits` import from `@/lib/number-format`
   - Wrapped `formatRelativeTime()` date output with `toLatinDigits()`

4. **`src/lib/clipboard-utils.ts`**:
   - Wrapped date `toLocaleDateString()` with `toLatinDigits()`

5. **`src/components/InvestmentGroupPage.tsx`**:
   - Added `toLatinDigits` import from `@/lib/number-format`
   - Wrapped `fmt()` currency and date formatting with `toLatinDigits()`
   - Wrapped `fmtDate()` with `toLatinDigits()`
   - Wrapped `fmtCurrency()` with `toLatinDigits()`
   - Wrapped activity log `toLocaleString()` with `toLatinDigits()`

6. **`src/components/POSTerminalPage.tsx`**:
   - Added `toLatinDigits` import from `@/lib/number-format`
   - Wrapped `receiptDate` with `toLatinDigits()`
   - Wrapped sale time `toLocaleTimeString()` with `toLatinDigits()`

7. **`src/components/SystemSettingsGroupPage.tsx`**:
   - Added `toLatinDigits` import from `@/lib/number-format`
   - Wrapped `Number(count).toLocaleString('en-US')` with `toLatinDigits()`

#### Fix 2: Sidebar Resize Issue

**Root Cause**: When the sidebar was collapsed to `w-16` (64px), the header area had `p-4` (16px) padding on each side, leaving only 32px for the expand button which was `w-11` (44px). The button was being clipped by `overflow-hidden`.

**Changes Made**:

1. **`src/components/ElectronicsMartApp.tsx`** — Sidebar component:
   - Changed header padding from fixed `p-4` to dynamic `${collapsed ? "p-2" : "p-4"}` — reduced padding when collapsed to fit the expand button
   - Reduced expand button from `w-11 h-11` to `w-10 h-10` and icon from `w-5 h-5` to `w-4 h-4` for better fit in the 64px collapsed sidebar

2. **`src/components/ElectronicsMartApp.tsx`** — AppLayout:
   - Added `onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}` prop to `<AppHeader>` — allows desktop users to toggle sidebar from the header

3. **`src/components/erp/layout/AppHeader.tsx`**:
   - Added desktop sidebar toggle button (Menu icon, `hidden md:flex`) that calls `onToggleSidebar`
   - Shows only when `onToggleSidebar` prop is provided
   - Positioned next to the mobile menu button for consistent UX
   - Title/aria-label dynamically shows "Expand sidebar" or "Collapse sidebar" based on current state

#### Fix 3: Module Pages Scroll

**Analysis**: The main content area already has `overflow-y-auto` which should enable scrolling. The root container has `overflow-hidden` which is correct (prevents body-level double scroll). The `flex-1 min-h-0` on `<main>` combined with `overflow-y-auto` enables independent scrolling of the content area.

**Changes Made**:

1. **`src/components/ElectronicsMartApp.tsx`** — Footer:
   - Added `shrink-0` class to footer to prevent it from being compressed when content is tall, ensuring the footer always stays at the bottom and the main content scrolls independently

### Files Modified:
- `src/lib/export-utils.ts` — Critical: sanitizeCurrencyValue() now converts Bengali digits instead of removing
- `src/lib/clipboard-utils.ts` — Date formatting wrapped with toLatinDigits
- `src/components/ElectronicsMartApp.tsx` — fmt/fmtDate wrapped with toLatinDigits, sidebar padding fix, header toggle prop, footer shrink-0
- `src/components/erp/layout/AppHeader.tsx` — Added toLatinDigits import, desktop sidebar toggle button, formatRelativeTime fix
- `src/components/InvestmentGroupPage.tsx` — All formatting functions wrapped with toLatinDigits
- `src/components/POSTerminalPage.tsx` — Receipt date/time wrapped with toLatinDigits
- `src/components/SystemSettingsGroupPage.tsx` — Key record counts wrapped with toLatinDigits
- `worklog.md` — This entry

### Lint Status:
- All modified files pass ESLint (0 errors, 0 warnings)
- Pre-existing lint error in `src/lib/db.ts` (unrelated to this task)

---

## Task ID: 4b
## Agent: Fix Agent
## Task: Fix empty employee names in the database and update with proper data

### Work Log:

#### Step 1: Authentication
- Obtained auth token via `POST /api/auth` with credentials `emart.amit` / `Test_123`
- Token successfully retrieved (JWT, admin role)

#### Step 2: Checked Current Employees
- Fetched all employees via `GET /api/employees`
- Found 3 employees:
  - **EMP-00005**: name='Rahim Uddin' ✅ (already had data)
  - **EMP-00004**: name='' ❌ (empty), phone=null, gender=null
  - **EMP-00003**: name='' ❌ (empty), phone=null, gender=null

#### Step 3: Investigated API Route
- Examined `src/app/api/employees/[id]/route.ts`
- API only supports GET, PUT, DELETE (no PATCH method)
- The `[id]` parameter expects the database CUID, not the employee code
- Database IDs: EMP-00003 → `cmq697xm5002ajf63zvjmx9mg`, EMP-00004 → `cmq69j2rp0006jfwr0zmyajhk`

#### Step 4: Updated Employees via PUT
- **EMP-00003** (id: `cmq697xm5002ajf63zvjmx9mg`):
  - `PUT /api/employees/cmq697xm5002ajf63zvjmx9mg`
  - Updated: name="Kamal Hossain", phone="01711223344", gender="Male"
  - Response: 200 OK, all fields correctly updated

- **EMP-00004** (id: `cmq69j2rp0006jfwr0zmyajhk`):
  - `PUT /api/employees/cmq69j2rp0006jfwr0zmyajhk`
  - Updated: name="Fatima Begum", phone="01799887766", gender="Female"
  - Response: 200 OK, all fields correctly updated

#### Step 5: Verification
- Fetched all employees again to confirm updates
- Results:
  - EMP-00003: name='Kamal Hossain', phone='01711223344', gender='Male' ✅
  - EMP-00004: name='Fatima Begum', phone='01799887766', gender='Female' ✅
  - EMP-00005: name='Rahim Uddin', phone='01712345678', gender='Male' ✅

### Files Modified:
- None (database-only updates via API)

### Stage Summary:
- ✅ Auth token obtained successfully
- ✅ Empty employee names identified (EMP-00003, EMP-00004)
- ✅ PATCH not supported; used PUT instead with database CUID as identifier
- ✅ EMP-00003 updated to "Kamal Hossain" (phone: 01711223344, gender: Male)
- ✅ EMP-00004 updated to "Fatima Begum" (phone: 01799887766, gender: Female)
- ✅ All employee records now have proper names and data

---

## Task ID: 4c
## Agent: Fix Agent
## Task: Fix /api/investments endpoint — return transactions instead of duplicate investment heads

### Problem:
The `/api/investments` endpoint was returning the same data as `/api/investment-heads` (InvestmentHead category records). It should return individual investment transactions (Assets and Liabilities), not the head categories.

### Root Cause:
The GET handler in `src/app/api/investments/route.ts` was querying `db.investmentHead.findMany()` — identical to what `/api/investment-heads` does. This made the two endpoints duplicates.

### Changes Made:

**`src/app/api/investments/route.ts`** — Complete GET handler rewrite:

1. **New GET handler** now queries `db.asset.findMany()` and `db.liability.findMany()` separately, then combines results into a unified `investments` array with a `transactionType` field (`'asset'` or `'liability'`).

2. **Asset transaction fields**: id, transactionType, date, amount, assetCategory, description, investmentHeadId, investmentHeadName, investmentHeadCode, companyId, createdAt

3. **Liability transaction fields**: id, transactionType, date, amount, type (receive/pay), liabilityType (SHORT_TERM/LONG_TERM), description, investmentHeadId, investmentHeadName, investmentHeadCode, companyId, createdAt

4. **Query parameters supported**:
   - `type` — filter by `'asset'` or `'liability'` (returns all if omitted)
   - `investmentHeadId` — filter by specific investment head
   - `assetCategory` — filter assets by category (e.g., "Fixed", "Current")
   - `liabilityType` — filter liabilities by type (e.g., "SHORT_TERM", "LONG_TERM")
   - `flowType` — filter liabilities by flow type ("received" or "pay")

5. **Multi-tenant filtering**: Preserved companyId-based filtering from the original implementation.

6. **VAT Auditor masking**: Amount fields are masked with `'N/A (Audit Mode)'` for `vat_auditor` role.

7. **Summary object**: Returns totalTransactions, assetCount, liabilityCount, totalAssetAmount, totalLiabilityAmount.

8. **Combined sort**: All transactions sorted by date descending.

9. **POST handler**: Unchanged — still creates InvestmentHead records.

### Test Results:
- `GET /api/investments` returns combined list of assets and liabilities with `transactionType` field
- `GET /api/investments?type=asset` returns only asset transactions
- `GET /api/investments?type=liability` returns only liability transactions
- Auth and RBAC working correctly
- Response includes investment head name and code for each transaction

### Files Modified:
- `src/app/api/investments/route.ts` — Complete GET handler rewrite to return Asset + Liability transactions

### Lint Status:
- Modified file passes ESLint (0 errors, 0 warnings)
- Pre-existing lint error in `src/lib/db.ts` (unrelated to this task)
