# Task 2-ui-fixes: InvestmentGroupPage Component Fixes

## Agent: Code Agent
## Status: COMPLETED

## Summary
Applied 6 fixes to `/home/z/my-project/src/components/InvestmentGroupPage.tsx`:

1. **Fix 1**: Added `referenceKey` to `saveInvestEntry` liability branch for idempotent guard
2. **Fix 2**: Added `companyId` to `saveHeads`, `saveAsset`, `saveInvestEntry` payloads + Company dropdown in heads form
3. **Fix 3**: Added Aging, Overdue, AP Status columns to both Liability Receive and Liability Pay tables
4. **Fix 4**: Responsive design improvements — stat card grids, responsive column hiding, dialog widths
5. **Fix 5**: Aging bucket auto-calculation in `saveLiab` based on loan date + duration
6. **Fix 6**: Removed unused `Clock` import

## Verification
- `bun run lint` passes cleanly
- No TypeScript errors in dev.log
- Prisma schema confirms all new fields exist
