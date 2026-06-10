# Task 14-9a: Account Module Bug Fixes

## Summary
Fixed 4 Account module bugs in VoltERP Phase 14.

## Bugs Fixed
1. **Cheque Clear crashes**: Added `generateLedgerEntryCode` helper + `entryCode` to all 6 `ledgerEntry.create()` calls in `cheques/[id]/route.ts`
2. **DELETE /api/expenses, /api/incomes 500**: Moved `logUserActivity` outside `$transaction()` to fire-and-forget pattern in `expenses/[id]/route.ts` and `incomes/[id]/route.ts` DELETE handlers
3. **COA accepts invalid classification**: Added `VALID_CLASSIFICATIONS` validation in `chart-of-accounts/route.ts` POST handler
4. **Expense with invalid headId returns raw Prisma error**: Added `headId` validation in `expenses/route.ts` and `incomes/route.ts` POST handlers + updated error status codes

## Files Changed
- `/home/z/my-project/src/app/api/cheques/[id]/route.ts`
- `/home/z/my-project/src/app/api/expenses/[id]/route.ts`
- `/home/z/my-project/src/app/api/incomes/[id]/route.ts`
- `/home/z/my-project/src/app/api/chart-of-accounts/route.ts`
- `/home/z/my-project/src/app/api/expenses/route.ts`
- `/home/z/my-project/src/app/api/incomes/route.ts`

## Verification
- `bun run lint` passes cleanly
- Dev server running on port 3000
