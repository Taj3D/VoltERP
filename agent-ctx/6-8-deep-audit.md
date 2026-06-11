# Task 6-8: Deep Functional Audit of Basic Modules (Phases 6-8)

## Agent: Deep Audit Agent
## Date: 2026-03-05

## Scope
- Phase 6: Core Config (4 pages): Companies, Categories, Colors, Brands
- Phase 7: Products + Banks (3 pages): Units, Products, Banks  
- Phase 8: Structure (4 pages): Departments, Godowns, Segments, Capacities

## Bugs Found and Fixed (10 total)

### 1. Companies DELETE [id]: Missing "deactivated" message (HIGH)
- **File**: `src/app/api/companies/[id]/route.ts`
- **Bug**: DELETE response returned `{ success: true }` without a `message` field, inconsistent with other modules that return `{ success: true, message: '...deactivated successfully' }`. Also, the catch block said "Failed to delete" instead of "Failed to deactivate".
- **Fix**: Changed to `{ success: true, message: 'Company deactivated successfully' }` and "Failed to deactivate" in error response.

### 2. Banks DELETE [id]: Missing "deactivated" message (HIGH)
- **File**: `src/app/api/banks/[id]/route.ts`
- **Bug**: Same as companies — returned `{ success: true }` without message and "Failed to delete bank" in error.
- **Fix**: Changed to `{ success: true, message: 'Bank deactivated successfully' }` and "Failed to deactivate bank" in error.

### 3. Categories DELETE [id]: Missing "deactivated" message (HIGH)
- **File**: `src/app/api/categories/[id]/route.ts`
- **Bug**: Returned `{ success: true }` without message, and error said "Failed to delete category" / console.error said "Error deleting category".
- **Fix**: Changed to `{ success: true, message: 'Category deactivated successfully' }`, "Failed to deactivate category", "Error deactivating category".

### 4. Colors DELETE [id]: Missing "deactivated" message (HIGH)
- **File**: `src/app/api/colors/[id]/route.ts`
- **Bug**: Same pattern — no message, "delete" terminology in error response and console.
- **Fix**: Changed to `{ success: true, message: 'Color deactivated successfully' }`, "Failed to deactivate color", "Error deactivating color".

### 5. Products DELETE [id]: Missing "deactivated" message (HIGH)
- **File**: `src/app/api/products/[id]/route.ts`
- **Bug**: Returned `{ success: true }` without message, error said "Failed to delete product".
- **Fix**: Changed to `{ success: true, message: 'Product deactivated successfully' }`, "Failed to deactivate product".

### 6. Units DELETE [id]: Says "deleted" instead of "deactivated" (MEDIUM)
- **File**: `src/app/api/units/[id]/route.ts`
- **Bug**: Returned `{ success: true, message: 'Unit deleted successfully' }` — uses "deleted" for what is a soft-delete (deactivation).
- **Fix**: Changed to `'Unit deactivated successfully'`.

### 7. Brands DELETE [id]: Says "deleted" instead of "deactivated" (MEDIUM)
- **File**: `src/app/api/brands/[id]/route.ts`
- **Bug**: Returned `{ success: true, message: 'Brand deleted successfully' }` — same issue as units.
- **Fix**: Changed to `'Brand deactivated successfully'`.

### 8. Companies PUT [id]: Missing XSS sanitization on string fields (HIGH — SECURITY)
- **File**: `src/app/api/companies/[id]/route.ts`
- **Bug**: The PUT handler passed raw `body.name`, `body.address`, `body.phone`, `body.email`, etc. directly to the database without stripping HTML tags or collapsing whitespace. The POST handler already had `sanitizeText()`, but the PUT handler had NO sanitization at all. This is an XSS vulnerability — an attacker could inject `<script>` tags or HTML into company fields via the update endpoint.
- **Fix**: Added inline `sanitizeText()` function matching the POST route's pattern, sanitized all 11 string fields (name, address, phone, email, mobile, website, vatNumber, tradeLicense, invoicePrefix, thankYouMsg, systemNote) before passing to the database, and added validation to reject empty names after sanitization.

### 9. Products POST/PUT: Missing XSS sanitization for `unit`, `sku`, `barcode` fields (MEDIUM — SECURITY)
- **Files**: `src/app/api/products/route.ts`, `src/app/api/products/[id]/route.ts`
- **Bug**: Both the POST and PUT handlers sanitized `name`, `sizeCapacity`, and `imeiNumber` but did NOT sanitize `unit`, `sku`, or `barcode` fields. While `sku` and `barcode` are typically codes, `unit` is a free-text field (e.g., "pcs", "kg") that could contain HTML injection. `sku` and `barcode` could also contain malicious content if not properly validated.
- **Fix**: Added `sanitizeText()` calls for `body.unit`, `body.sku`, and `body.barcode` in both POST single-record mode and PUT handler.

### 10. BasicModulesGroupPage + StructureModulePage: Incorrect colSpan for loading/empty table states (MEDIUM — UI)
- **Files**: `src/components/BasicModulesGroupPage.tsx`, `src/components/StructureModulePage.tsx`
- **Bug**: 
  - BasicModulesGroupPage: Loading/empty state `colSpan` was hardcoded to `config.columns.length + 2`, which is only correct when `canMutate=true` (adds Actions column). When `canMutate=false` (VAT Auditor, SR, Dealer), the colSpan is 1 too many, causing a rendering mismatch.
  - StructureModulePage: colSpan was `config.columns.length + (canMutate ? 3 : 1)`, which overcounts by 1 for non-godown modules when `canMutate=true` (accounts for Toggle column that only exists for godowns, not departments/segments/capacities).
- **Fix**: 
  - BasicModulesGroupPage: Changed to `config.columns.length + 1 + (canMutate ? 1 : 0)` — `1` for `#` column + `1` for Actions column (only when canMutate).
  - StructureModulePage: Changed to `config.columns.length + 1 + (canMutate && config.key === "godowns" ? 2 : canMutate ? 1 : 0)` — accounts for `#` column + conditional Toggle (godowns only) + Actions.

## Files Modified
- `src/app/api/companies/[id]/route.ts` — Deactivated message in DELETE, XSS sanitization in PUT
- `src/app/api/banks/[id]/route.ts` — Deactivated message in DELETE
- `src/app/api/categories/[id]/route.ts` — Deactivated message in DELETE
- `src/app/api/colors/[id]/route.ts` — Deactivated message in DELETE
- `src/app/api/products/[id]/route.ts` — Deactivated message in DELETE, XSS sanitization for unit/sku/barcode in PUT
- `src/app/api/products/route.ts` — XSS sanitization for unit/sku/barcode in POST
- `src/app/api/units/[id]/route.ts` — "deleted" → "deactivated" in DELETE message
- `src/app/api/brands/[id]/route.ts` — "deleted" → "deactivated" in DELETE message
- `src/components/BasicModulesGroupPage.tsx` — Fixed colSpan for loading/empty states
- `src/components/StructureModulePage.tsx` — Fixed colSpan for loading/empty states
