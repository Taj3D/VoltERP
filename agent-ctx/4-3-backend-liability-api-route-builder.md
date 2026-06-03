# Task 4-3-backend: Phase 4 Backend Liability API Route Builder

## Agent: Phase 4 Backend Liability API Route Builder

## Summary
Complete rewrite of both Liability API route files implementing all 4 Phase 4 directives: multi-tenant isolation, atomic double-entry ledger with ChartOfAccount/LedgerAutoPost, financial safety (safeFinancialRound/Add/Subtract), and VAT Auditor masking.

## Files Modified

### 1. `/home/z/my-project/src/app/api/liabilities/route.ts` (Complete Rewrite)

**GET:**
- Multi-tenant filter: `where: { isActive: true, ...(companyId ? { companyId } : {}) }`
- Filter by `type`, `headId` (investmentHeadId), `liabilityType` from query params
- Includes investmentHead relation
- Dynamic `outstandingBalance` computation per head (SUM received - SUM pay)
- VAT Auditor masking via `maskFinancialArray()` with extra fields `['amount', 'principalAmount', 'interestRate', 'outstandingBalance']`

**POST (Liability Receive - type="received"):**
- Validates: amount > 0, principalAmount > 0, interestRate >= 0, loanDurationMonths >= 0
- Deactivated Head Shield: blocks if investmentHead.isActive === false
- Idempotent Double-Click Guard: if referenceKey exists and matches, returns existing record (200)
- Atomic $transaction:
  1. Creates Liability record with `outstandingBalance = principalAmount`
  2. Increments bank.currentBalance via safeFinancialAdd if bankId provided
  3. Creates CREDIT_IN LedgerEntry (account = "Cash/Bank", referenceType = "LiabilityReceive")
  4. Creates DEBIT LedgerEntry (account = head.name, referenceType = "LiabilityReceive")
  5. Finds or creates ChartOfAccount under "Liability" classification
  6. Creates LedgerAutoPost record
  7. AuditLog with module 'Fin-Liability-Core'
- All financial amounts go through safeFinancialRound()
- nullIfEmpty on paymentMethod, bankId, voucherNo, chequeNo, referenceKey, description

**POST (Liability Pay - type="pay"):**
- Validates: amount > 0
- Zero Balance Protection: computes SUM received - SUM pay for head, blocks if payment > outstanding
- Deactivated Head Shield: same as receive
- Idempotent Double-Click Guard: same referenceKey check
- Pre-validates bank balance >= payment amount if bankId provided
- Atomic $transaction:
  1. Creates Liability record with type="pay", outstandingBalance = 0
  2. Decrements bank.currentBalance via safeFinancialSubtract if bankId provided
  3. Creates DEBIT_OUT LedgerEntry (account = head.name, referenceType = "LiabilityPay")
  4. Creates CREDIT LedgerEntry (account = "Cash/Bank", referenceType = "LiabilityPay")
  5. Finds or creates ChartOfAccount under "Liability" classification
  6. Creates LedgerAutoPost record
  7. AuditLog with module 'Fin-Liability-Core'

**POST batchMode:**
- If `body.batchMode === true` and `body.data` is an array, processes each item in sequence within single transaction
- Single AuditLog entry with recordId='BATCH'

### 2. `/home/z/my-project/src/app/api/liabilities/[id]/route.ts` (Complete Rewrite)

**GET:**
- Fetches by id with investmentHead included
- Cross-tenant validation: if companyId mismatch → 404
- Applies maskForVatAuditorFinancial() for VAT Auditor masking

**PUT:**
- Cross-tenant validation before modification
- Period close check
- Deactivated Head Shield: if investmentHeadId changes, verifies new head is active
- For type="received" edits: recalculates outstandingBalance from principalAmount
- For type="pay" edits: re-validates zero balance protection (outstanding must not go negative)
- Pre-validates bank balance for pay edits
- Atomic $transaction with 6 steps:
  1. Reverse old bank balance impact (safeFinancialAdd for pay, safeFinancialSubtract for receive)
  2. Create 2 reversal ledger entries
  3. Apply new bank balance impact
  4. Create 2 new ledger entries with ChartOfAccount linkage
  5. Update the liability record
  6. AuditLog with module 'Fin-Liability-Core'

**DELETE:**
- checkFinancialDeletePermission(role) — only admin can delete
- Cross-tenant validation
- Period close check
- Soft delete (isActive = false)
- Reverses bank balance impact if bankId existed
- AuditLog with module 'Fin-Liability-Core'

## Shared Helper Functions (defined in both files)
- `nullIfEmpty(val)` — converts empty/whitespace strings to null
- `generateLedgerEntryCode(tx)` — auto-generates LED-XXXXX codes
- `generateAutoPostCode(tx)` — auto-generates LAP-XXXXX codes
- `findOrCreateLiabilityAccount(tx, headName, companyId)` — finds or creates ChartOfAccount under "Liability" classification

## Verification
- ESLint: ✅ No errors
- Dev server: ✅ Running without issues
- API endpoint: Returns 401 for unauthenticated requests (correct RBAC enforcement)
