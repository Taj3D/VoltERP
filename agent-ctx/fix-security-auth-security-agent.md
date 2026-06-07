# Security Auth Fix - Task ID: fix-security-auth

## Summary
Fixed 5 critical security vulnerabilities in the VoltERP project, adding authentication to unprotected API routes and removing hardcoded credentials from the client bundle.

## Changes Made

### Fix 1: POS Barcode Route Auth + Price Masking
**File**: `src/app/api/pos/barcode/route.ts`
- Added `withApiSecurity` authentication check (module: `Products`, method: `GET`)
- Added role-based price masking using `maskForVatAuditor` with `fieldRoleRestrictions`:
  - `costPrice` and `wholesalePrice` masked for `sr`, `dealer`, and `vat_auditor` roles
  - `dealerPrice` masked for `sr` and `vat_auditor` roles
  - Stock entry `costPrice` also masked in nested stock array
- Admin and manager roles retain full visibility

### Fix 2: Staging Routes Auth (Admin-Only)
Added `withApiSecurity` + admin-only check to all 5 staging routes:
1. **`src/app/api/staging/seed-wipe/route.ts`** — Added auth, changed signature from `POST()` to `POST(request: NextRequest)`, admin-only check
2. **`src/app/api/staging/seed-engine/route.ts`** — Added auth import and security check at top of handler, admin-only check
3. **`src/app/api/staging/test-bed/route.ts`** — Added auth import and security check at top of handler, admin-only check
4. **`src/app/api/staging/test-logs/route.ts`** — Changed from `GET()` to `GET(request: NextRequest)`, added auth and admin-only check
5. **`src/app/api/staging/golden-handover/route.ts`** — Added auth import and security check at top of handler, admin-only check

All staging routes now use `SystemSettings` module with `POST`/`GET` method, and reject any non-admin user with 403.

### Fix 3: Seed Route Auth (Admin-Only)
**File**: `src/app/api/seed/route.ts`
- Changed from `POST()` to `POST(request: NextRequest)`
- Added `withApiSecurity` import and security check
- Added admin-only role check (403 for non-admin)

### Fix 4: Removed Client-Side Hardcoded Credentials
**File**: `src/components/ElectronicsMartApp.tsx`
- **Removed** the entire `ROLE_CREDENTIALS` object (5 username/password pairs: emart.amit/Test_123, emart.manager/Manager_123, emart.sr/SR_123, emart.dealer/Dealer_123, emart.vat/VAT_123)
- **Removed** the client-side fallback authentication block that validated passwords locally when the server was unreachable
- **Replaced** the catch block with a proper error toast: "Unable to connect to server. Please check your connection."
- Login now works **exclusively** through the server API (`/api/auth`)
- Removed all `cred?.` fallback references in the success path (displayName and role now come solely from server response)

### Fix 5: POS Routes Verification
**Verified** that all three POS routes already have `withApiSecurity`:
- `src/app/api/pos/checkout/route.ts` — Has `withApiSecurity(request, 'PosSale', 'POST')` ✓
- `src/app/api/pos/void/route.ts` — Has `withApiSecurity(request, 'PosSale', 'POST')` ✓
- `src/app/api/pos/sales/route.ts` — Has `withApiSecurity(request, 'PosSale', 'GET')` ✓

No changes needed for these routes.

## Security Impact
- **Before**: 8 API routes had zero authentication, allowing unauthenticated access to:
  - Product pricing data (cost prices, wholesale prices, dealer prices)
  - Database wipe capability (seed-wipe)
  - Demo data seeding (seed-engine)
  - Test data creation (test-bed)
  - Test log exposure (test-logs)
  - Data snapshot export (golden-handover)
  - Base seed data creation (seed)
  - Client bundle contained all 5 user passwords in plaintext
  
- **After**: All routes require authentication via `withApiSecurity`. Staging/seed routes require admin role. Sensitive pricing data is masked for non-admin/non-manager roles. Client bundle no longer contains any passwords.

## Verification
- Dev server responds with HTTP 200 on `/`
- TypeScript compilation: pre-existing errors in other files, no new errors introduced by these changes
- No Prisma schema modifications
