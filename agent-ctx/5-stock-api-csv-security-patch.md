# Task ID: 5 — Stock API & CSV Security Patch Agent

## Task
Patch the Stock API route to use `maskForVatAuditor()` instead of inline ternary operators, and add CSV injection mitigation enhancement.

## Files Modified

### 1. `/src/app/api/stock/route.ts`
- Added `maskForVatAuditor` to import from `@/lib/api-security`
- Removed `isVatAuditor` variable
- Removed inline ternary masking (costPrice, salePrice, stockValue)
- Added missing fields: `wholesalePrice`, `dealerPrice`, `openingStock`
- Applied `maskForVatAuditor(item, role, ['costPrice', 'salePrice', 'wholesalePrice', 'dealerPrice', 'stockValue', 'openingStock'])` to each stockReport item
- Role sourced from `security.user.role`

### 2. `/src/lib/export-utils.ts`
- Added `|` (pipe) to dangerous prefix characters in `escapeCSVField()`
- Added explanatory comment for pipe character addition

## Verification
- `bun run lint` → 0 errors
