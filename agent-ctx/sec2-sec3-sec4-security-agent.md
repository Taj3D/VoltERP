# Security Implementation Agent — Task sec2-sec3-sec4

## Summary
Implemented 3 security fixes for the VoltERP Next.js application:

### Fix 1: CSRF Protection
- Created `/src/lib/csrf.ts` — Token generation and verification (one-time-use, 1-hour expiry, 10-min cleanup)
- Created `/src/app/api/csrf-token/route.ts` — GET endpoint that returns CSRF tokens
- Updated `/src/lib/api-client.ts` — `apiFetch()` now fetches and includes CSRF tokens in `X-CSRF-Token` header for all POST/PUT/DELETE requests
- Created `/src/middleware.ts` — CSRF verification for write operations with log-only mode (CSRF_ENFORCE=true for strict)

### Fix 2: XSS/Input Sanitization
- Installed `isomorphic-dompurify@3.16.0`
- Created `/src/lib/sanitize.ts` — `sanitizeInput()` and `sanitizeObject()` functions that strip all HTML tags/attributes
- Updated `/src/lib/api-security.ts` — Added sanitization to `withApiSecurity()` for POST/PUT bodies, plus `getSanitizedBody()` helper

### Fix 3: Password bcrypt Migration
- Created `/src/app/api/auth/migrate-passwords/route.ts` — Migration endpoint using `needsRehash()` and `hashPassword()`
- Ran migration: All 6 passwords already bcrypt-hashed (verified `$2b$10$` prefix)

### Verification
- `bun run lint` — Zero errors
- Dev server running on port 3000 (HTTP 200)
- CSRF token endpoint working
- All passwords confirmed bcrypt-hashed
