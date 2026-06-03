# Phase 1 - Authentication & User System Overhaul

## Task ID: phase-1
## Agent: Main Agent

## Summary
Completed all Phase 1 tasks: fixed login display bug, built full Profile page, created real password change API with Admin-only RBAC.

## Changes Made

### 1. LOGIN DISPLAY BUG FIX
- **File**: `src/components/ElectronicsMartApp.tsx`
  - Changed `ROLE_CREDENTIALS` displayNames from ugly "emart.amit (Admin)" style to proper human names:
    - "emart.amit" -> "Amit Sharma"
    - "emart.manager" -> "Manager User"
    - "emart.sr" -> "Sales Representative"
    - "emart.dealer" -> "Dealer User"
    - "emart.vat" -> "VAT Auditor"
  - Updated login flow to prefer `serverUser.name` (from DB) over `cred.displayName` for displayName, so the DB name always takes priority
- **File**: `src/components/erp/layout/AppHeader.tsx`
  - Removed role badge (Badge component with ROLE_COLORS/ROLE_LABELS) from header user menu button
  - Removed VAT AUDIT badge from header user menu button
  - Added `onProfile` prop to AppHeader interface and component
  - Changed Profile button in user dropdown to call `onProfile?.()` instead of just closing the menu
  - Restricted "Change Password" menu item to Admin role only (`user?.role === "admin"`)
  - Added "profile" page breadcrumb handling

### 2. SIDEBAR ROLE BADGE REMOVAL
- **File**: `src/components/ElectronicsMartApp.tsx`
  - Removed VAT AUDIT MODE badge from sidebar user section (bottom of sidebar)

### 3. PROFILE PAGE
- **File**: `src/components/ElectronicsMartApp.tsx` (new `ProfilePage` component)
  - Full profile page with:
    - Avatar/photo upload (base64, max 2MB)
    - Personal info display: Name, Email, Phone, Address, Role, Join Date
    - Edit mode for name, phone, address fields (email and role are read-only)
    - Export activity tracking: PDF exports, CSV imports, CSV exports counters
    - Save button calls PUT /api/users/profile
    - On save, updates displayName in localStorage auth state and triggers auth listeners
- **Routing**: Added `if (currentPage === "profile") return <ProfilePage />;` in renderPage()
- **Navigation**: Added `onProfile={() => navigate("profile")}` to AppHeader props

### 4. API ROUTES
- **File**: `src/app/api/users/profile/route.ts` (NEW)
  - GET: Fetches user profile by X-User-Email header, returns all user fields including new phone, address, photo, pdfExports, csvImports, csvExports
  - PUT: Updates user profile (name, phone, address, photo) with validation
  - Logs profile updates to audit log

- **File**: `src/app/api/auth/password/route.ts` (NEW)
  - PUT: Admin-only password change API
  - Case 1: Admin changing own password - validates currentPassword against DB, requires newPassword >= 6 chars
  - Case 2: Admin resetting another user's password (via targetUserId) - no currentPassword needed
  - Returns 403 Forbidden for non-admin users
  - Logs password changes to audit log

### 5. CHANGE PASSWORD PAGE RBAC FIX
- **File**: `src/components/ElectronicsMartApp.tsx` (ChangePasswordPage component)
  - Added admin-only guard: shows "Access Denied" with ShieldCheck icon for non-admin users
  - Replaced hardcoded "Test_123" check with real API call to PUT /api/auth/password
  - Removed mock `setTimeout` delay, now uses real fetch with proper error handling

### 6. PRISMA SCHEMA UPDATE
- **File**: `prisma/schema.prisma`
  - Added to User model:
    - `phone String?` - User phone number
    - `address String?` - User address
    - `photo String?` - Profile photo (base64 or URL)
    - `pdfExports Int @default(0)` - Count of PDF exports
    - `csvImports Int @default(0)` - Count of CSV imports
    - `csvExports Int @default(0)` - Count of CSV exports
  - Ran `bun run db:push` successfully
  - Incremented PRISMA_SCHEMA_VERSION to 3 in `src/lib/db.ts`

## Lint Status
- `bun run lint` passed with zero errors

## Notes
- The auth API already returns `name` from DB (e.g., "Amit Sharma"), so after login the displayName is now the real name from the database
- The ROLE_CREDENTIALS fallback is only used when server is unreachable
- Profile page updates the auth state displayName in localStorage so header reflects name changes immediately
- Non-admin users cannot see "Change Password" in the dropdown, and if they somehow navigate to it, they see an "Access Denied" message
