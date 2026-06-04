# Task 2: RBAC & Auth System Deep Audit

## Agent: Deep Audit Agent (Phase 1 — RBAC & Auth)
## Date: 2026-06-03

## Summary
Executed Phase 1 of the 20-phase deep audit — RBAC & Auth System. Found 7 issues, fixed all 7. All 5 role logins verified working correctly with proper displayName returned.

## Issues Found & Fixed

### 1. Auth API Missing `displayName` Field (CRITICAL)
**File:** `src/app/api/auth/route.ts`
**Problem:** The POST response returned `{ id, email, name, role }` but NOT `displayName`. The frontend had to fall back to `serverUser.name || cred?.displayName || username` which was fragile.
**Fix:** Added `displayName: user.name` to the API response. Now returns `{ id, email, name, displayName, role }`.

### 2. ROLE_CREDENTIALS Names Out of Sync with Database (HIGH)
**File:** `src/components/ElectronicsMartApp.tsx` (lines 123-129)
**Problem:** The `ROLE_CREDENTIALS` map had outdated display names that didn't match the actual database:
- Manager: "Rajesh Kumar" → DB has "Rakib Hasan"
- SR: "Suresh Roy" → DB has "Kamal Hossain"
- Dealer: "Mizan Ahmed" → DB has "Rahim Uddin"
- VAT: "Kamal Hossain" → DB has "Kashem Miah"
**Fix:** Updated ROLE_CREDENTIALS to match database names. Also updated DEFAULT_USERS in the auth route.

### 3. Auth State `name` Field Set to Username Instead of DisplayName (CRITICAL)
**File:** `src/components/ElectronicsMartApp.tsx` (line 210)
**Problem:** The login function set `name: username` (e.g., "emart.amit") instead of the display name. While `displayName` was set correctly, the `name` field was used for avatar initials in some places, causing "E" instead of "A" for "Amit Sharma".
**Fix:** Changed `name: username` to `name: resolvedDisplayName` where `resolvedDisplayName = serverUser.displayName || serverUser.name || cred?.displayName || username`. Also fixed the client-side fallback.

### 4. AppHeader Avatar Used `user.name` Instead of `user.displayName` (HIGH)
**File:** `src/components/erp/layout/AppHeader.tsx` (line 647)
**Problem:** Avatar initial was `{user?.name?.charAt(0).toUpperCase()}` which showed "E" for "emart.amit" instead of "A" for "Amit Sharma".
**Fix:** Changed to `{(user?.displayName || user?.name)?.charAt(0).toUpperCase() || "U"}`.

### 5. `/api/auth/profile` Route Broken — References Non-Existent Fields (CRITICAL)
**File:** `src/app/api/auth/profile/route.ts`
**Problem:** The route referenced `designation`, `profileImage`, and `branchId` fields that don't exist in the User Prisma model. This caused a runtime crash (500 error) on every request.
**Fix:** Complete rewrite of the route:
- Removed `designation` references (field doesn't exist in User model)
- Changed `profileImage` → `photo` (correct field name)
- Removed `branchId` from select (field doesn't exist)
- Updated photo size validation from 2MB → 5MB (7MB base64 limit)
- Added `address`, `pdfExports`, `csvImports`, `csvExports` fields

### 6. `/api/users/profile` Photo Size Validation Too Restrictive (MEDIUM)
**File:** `src/app/api/users/profile/route.ts` (line 59)
**Problem:** `photo.length > 5 * 1024 * 1024` checked the base64 string length against 5MB, but a 5MB raw file becomes ~6.7MB in base64. This would reject valid 4-5MB files.
**Fix:** Changed to `photo.length > 7 * 1024 * 1024` to accommodate 5MB raw files with base64 overhead.

### 7. Profile Page Missing Company Logo Display & Search/Breadcrumb (LOW)
**File:** `src/components/ElectronicsMartApp.tsx`
**Problem:** ProfilePage had no company logo display. Also, "My Profile" was not in the search items list, and the breadcrumb didn't handle the "profile" page.
**Fix:**
- Added `companyLogo` and `companyName` state to ProfilePage
- Added company branding fetch on profile load
- Added company logo + name display in the left card below join date
- Added `{ key: "profile", label: "My Profile", group: "Account" }` to search items
- Updated `currentGroupLabel` to handle `"profile"` page

## Verified Working ✅

### Login API Tests (all 5 roles)
| Role | Email | displayName | role |
|------|-------|-------------|------|
| Admin | emart.amit | Amit Sharma | admin |
| Manager | emart.manager | Rakib Hasan | manager |
| SR | emart.sr | Kamal Hossain | sr |
| Dealer | emart.dealer | Rahim Uddin | dealer |
| VAT Auditor | emart.vat | Kashem Miah | vat_auditor |

### Change Password RBAC
- Non-admin (Manager) attempt → 403 "Forbidden: only administrators can change passwords" ✅
- Admin-only enforced both client-side (UI guard) and server-side (API 403) ✅

### Auth Profile API
- `/api/auth/profile` GET now returns correct User fields (was broken before) ✅
- Photo validation: 5MB raw file limit, 7MB base64 string limit ✅

### AppHeader
- Shows `user?.displayName || user?.name || "User"` in header text ✅
- Avatar initial uses `displayName` (not email/username) ✅
- User menu: Profile, Change Password (admin only), Switch Role, Log off ✅
- No "emart.amit", "emart.manager" etc. visible anywhere ✅

### ProfilePage
- Photo upload with 5MB max validation, JPEG/PNG/WebP ✅
- Export activity tracking (pdfExports, csvImports, csvExports counters) ✅
- Company logo display (NEW) ✅
- Editable personal details (name, phone, address) ✅
- Email shown but read-only ✅
- Role shown but managed by admin ✅

## Lint Check
- `bun run lint -- --ignore-pattern start-server.js` — PASSED with zero errors
- Pre-existing errors in `start-server.js` are not related to this audit

## Files Modified (5 files)
1. `src/app/api/auth/route.ts` — Added `displayName` to response, synced DEFAULT_USERS names
2. `src/app/api/auth/profile/route.ts` — Complete rewrite: removed non-existent fields, fixed photo validation
3. `src/app/api/users/profile/route.ts` — Fixed photo size validation (5MB→7MB base64 limit)
4. `src/components/erp/layout/AppHeader.tsx` — Fixed avatar initial to use displayName
5. `src/components/ElectronicsMartApp.tsx` — Fixed ROLE_CREDENTIALS names, login name field, profile company logo, search/breadcrumb for profile

## Security Notes (for future phases)
- Passwords are stored in plain text (not bcrypt) — noted but not changed in this audit
- No JWT tokens used — session managed via localStorage + X-User-Email header
- These are acceptable for the current demo/development setup but should be addressed before production
