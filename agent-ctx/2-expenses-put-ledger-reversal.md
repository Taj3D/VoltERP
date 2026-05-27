# Task 2: Expenses PUT Ledger Reversal Engineer

## Task
Patch the Expenses PUT [id] handler to add balanced double-entry ledger reversal + re-entry (Dr = Cr), and add VAT masking to GET handler.

## Changes Made

### File: `/src/app/api/expenses/[id]/route.ts`

**GET handler:**
- Added `maskForVatAuditor` import from `@/lib/api-security`
- Extracted role from `security.user.role` after authorization
- Applied `maskForVatAuditor(expense, role, ['amount'])` before returning — VAT auditors see "N/A (Audit Mode)" for amount field

**PUT handler — 6-step transaction flow:**
1. Reverse old bank balance (existing, unchanged)
2. **NEW** — Old ledger reversal entries (only if `oldStatus === 'Approved'`):
   - Cr: [old head name] with OLD amount — reverses original debit
   - Dr: [old cash/bank account name] with OLD amount — reverses original credit
   - Both with `reference: existing.expenseCode`, `referenceType: 'Expense'`, `particulars: 'Reversal: Expense update'`
3. Apply new bank balance (existing, unchanged)
4. **NEW** — New ledger entries (only if `newStatus === 'Approved'`):
   - Dr: [new head name] with NEW amount
   - Cr: [new cash/bank account name] with NEW amount
   - Both with `reference: existing.expenseCode`, `referenceType: 'Expense'`, `particulars: description || 'Expense updated'`
5. Update the expense record (existing, unchanged)
6. Audit log (enhanced with `previousHeadId`, `newHeadId`, `ledgerReversalCreated`, `ledgerNewEntriesCreated`)

**Additional changes:**
- Added `headId` to existing expense fetch `select` clause (was missing — needed for resolving old head name)
- Added `oldHeadId` and `newHeadId` tracking variables
- Added `expenseDate` variable for consistent date across all ledger entries

## Verification
- `bun run lint` → 0 errors, 0 warnings
- Dev server running on port 3000, HTTP 200 confirmed
