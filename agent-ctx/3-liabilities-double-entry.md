# Task 3: Financial Double-Entry Linkage for Liabilities Route

## Task Description
Rewrite `/api/liabilities/route.ts` to add full Financial Double-Entry Linkage within the same Prisma transaction.

## What Was Done

### Code Changes
- **File**: `src/app/api/liabilities/route.ts`
- Complete rewrite of the `createSingleLiability()` function with a 6-step double-entry pipeline

### New Helper Functions
1. **`resolveCashBankCoaAccount()`** — Resolves Cash/Bank Asset COA with payment method awareness:
   - "Bank Transfer" / "Cheque" → prefers Bank-named Asset COA
   - Other methods → prefers Cash-named Asset COA
   - Falls back to the other type, then any active Asset COA
   
2. **`resolveLiabilityCoaAccount()`** — Resolves Liability classification COA for the company

3. **`generateLedgerEntryCode()`** — Sequential LED-XXXXX code generation

4. **`generateLapCode()`** — Sequential LAP-XXXXX code generation

### Double-Entry Logic
- **"received" type**: DEBIT Cash/Bank (asset increase), CREDIT Liability (liability increase)
- **"pay" type**: DEBIT Liability (liability decrease), CREDIT Cash/Bank (asset decrease)

### Pipeline Steps (within same Prisma transaction)
1. Verify Investment Head (unchanged)
2. Insert Liability record (unchanged)
3. Find COA accounts (Liability + Cash/Bank)
4. Create two LedgerEntry records (debit/credit pair)
5. Update both COA accounts' currentBalance
6. Create LedgerAutoPost tracking record

### Preserved Functionality
- VAT auditor masking
- Period close check
- Audit logging
- Investment Head validation
- Batch mode support (inherits double-entry via same function)
- Graceful skip if COA accounts not found

## Quality
- Lint: Clean (no errors)
- Dev server: Running
