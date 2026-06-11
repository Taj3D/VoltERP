# Task: Fix Critical Frontend Bugs in VoltERP Account Management Pages

## Summary

Fixed all 5 issues in each of the two files as specified:

### File 1: `/home/z/my-project/src/components/ExpensesIncomesPage.tsx`

1. **Missing DialogDescription in Create/Edit Dialog** - Added `<DialogDescription>` to the create/edit dialog's `<DialogHeader>` with contextual text based on whether editing or creating.

2. **Date range filtering** - Added `dateFrom`/`dateTo` state variables, date range input UI controls (Calendar icon + date inputs + Clear Filters button) in the toolbar, and date range filtering logic in the `filtered` useMemo. Also resets date filters on tab change.

3. **Chart of Account linking in Head form** - Added `chartOfAccounts` state and `loadChartOfAccounts` function. Added a CoA select field in the head inline form that filters by head type (Expense/Income). Updated `headForm` type to include `chartOfAccountId`. Included `chartOfAccountId` in head create/update payloads. Added CoA column to the heads table. Updated colSpan from 5 to 6.

4. **Ledger Posted stat card** - Replaced the "Approved" stat card with "Ledger Posted" stat card that counts `currentData.filter((d: any) => d.ledgerPosted).length`.

5. **Ledger details in expanded rows** - Added Ledger Posted status (with Yes/No badges), Debit Entry Code, and Credit Entry Code fields to the expanded row section.

### File 2: `/home/z/my-project/src/components/CashCollectionsDeliveriesPage.tsx`

1. **Date range filtering** - Added `dateFrom`/`dateTo` state variables, date range input UI controls in both Collections and Deliveries toolbars, and date range filtering logic in both `filteredColl` and `filteredDel` useMemo hooks.

2. **Company profile in PDF export** - Added `companyProfile` state and `loadCompanyProfile` function. Added `company: companyProfile` to both Cash Collections and Cash Deliveries PDF export calls.

3. **Fix auth to use reactive hook** - Replaced the `getAuthState()` function with a proper `useAuth()` hook (following the BankTransactionsPage.tsx pattern) that listens for `storage` and `auth-change` events and reactively updates the component.

4. **Ledger Posted stat card** - Replaced "Approved" stat card with "Ledger Posted" on both Collections and Deliveries tabs. Updated `collStats` and `delStats` useMemo to use `ledgerPosted` instead of `approved`.

5. **Chart of Account and ledger details in expanded rows** - Added CoA Account, Ledger Posted status (with Yes/No badges), Debit Entry Code, and Credit Entry Code fields to expanded rows for both Collections and Deliveries.

## Files Modified
- `src/components/ExpensesIncomesPage.tsx`
- `src/components/CashCollectionsDeliveriesPage.tsx`

## Verification
- No TypeScript errors in modified files
- Dev server running without compilation errors
