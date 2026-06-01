# Task 3 - CRM Profiles API Rewrite Agent

## Task: Complete rewrite of Customer API routes with PHASE 9 CRM Profiles directives

## Files Modified:
1. `/home/z/my-project/src/app/api/customers/route.ts` — COMPLETE rewrite
2. `/home/z/my-project/src/app/api/customers/[id]/route.ts` — COMPLETE rewrite

## Key Changes:

### DIRECTIVE 1: Multi-Tenant Collision Shields
- `sanitizeString()` — trim + strip HTML tags on all contact fields
- `nullIfEmpty()` — empty/whitespace strings → null
- Collision detection via `findFirst({ where: { companyId, [field]: sanitized, isActive: true } })` for:
  - phone
  - alternativePhone
  - email
  - nidNumber
- 409 response: "Counterparty Collision: This Mobile Number or Identity is already registered under an active profile."
- PUT excludes current record from collision check (`id: { not: id }`)

### DIRECTIVE 2: Opening Balance Integrity & Atomic COA Ledger Pointers
- `validateOpeningBalance()` — rejects non-numeric, spaces, raw negative numbers; only `/^\d+(\.\d+)?$/` accepted
- `mapOpeningBalanceType()` — DUE → "Dr", ADVANCE → "Cr"
- `safeFinancialRound()` on all financial calculations
- When openingBalance > 0, within `$transaction`:
  1. Create Customer profile
  2. Find or create "Accounts Receivable" parent COA node (Asset classification)
  3. Create child COA sub-node: `AR-CUS-{customerCode}`
  4. Link `customer.coaAccountId` to sub-node
  5. Find or create "Retained Earnings" COA node (Equity classification)
  6. Generate double-entry LedgerEntry with `referenceType: "CustomerOpeningBalance"`:
     - Dr (Due): Debit AR sub-node, Credit Retained Earnings
     - Cr (Advance): Credit AR sub-node, Debit Retained Earnings

### DIRECTIVE 3: Additional Requirements
- `withApiSecurity` from `@/lib/api-security` on all routes
- `safeFinancialRound` from `@/lib/api-security` for all financial calculations
- `logUserActivity` from `@/lib/activity-logger` with module token `"CRM-Profiles-Core"`
- GET: companyId filter for multi-tenant isolation
- GET: `maskForVatAuditor` for VAT Auditor (openingBalance + creditLimit) and SR (creditLimit only)
- DELETE: admin-only via `checkFinancialDeletePermission`
- PUT: cross-tenant validation
- batchMode support for CSV import in POST
- `validateImageFields` for profileImage, nidFrontImage, nidBackImage
- `nullIfEmpty` for empty strings → null
- Auto-generate CUS-XXXXX codes

## Verification:
- `bun run lint` — ZERO errors
- Both files follow project conventions (Next.js 16 params as Promise, $transaction for atomicity)
