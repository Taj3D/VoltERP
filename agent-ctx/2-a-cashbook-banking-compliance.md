# Task 2-a: Block 11 Compliance — Domain 17 & 18 (Cashbook & Banking)

## Summary
Fixed 5 API routes for Block 11 compliance covering Cashbook & Banking domains.

## Files Modified
1. `src/app/api/expenses/route.ts` — amount validation, head isActive, Cash-In-Hand balance
2. `src/app/api/incomes/route.ts` — amount validation, head isActive
3. `src/app/api/cash-collections/route.ts` — amount validation
4. `src/app/api/cash-deliveries/route.ts` — amount validation, Cash-In-Hand balance
5. `src/app/api/bank-transactions/route.ts` — same-bank block, couplingType, companyId filter

## Key Changes
- All financial routes now block negative/zero/null amounts with 400 response
- Expenses & Incomes validate headId references an active ExpenseIncomeHead
- Cash expenses & deliveries check Cash-In-Hand balance before proceeding
- Bank transactions block same-bank transfers server-side
- Audit logs include couplingType (CREDIT_IN, DEBIT_OUT, DEBIT_OUT/CREDIT_IN)
- Bank transactions GET filtered by companyId from withApiSecurity

## Verification
- `bun run lint` — zero new errors (only pre-existing start-server.js)
