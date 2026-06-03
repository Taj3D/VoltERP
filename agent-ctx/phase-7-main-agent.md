# Phase 7: Investment Module Deep Audit

## Agent: Main Agent
## Task ID: phase-7
## Status: COMPLETE

## Summary
Deep audit of the Investment Module (InvestmentGroupPage.tsx, ~2,520 lines) covering 7 sub-pages and 6+ API endpoints.

## Bugs Found & Fixed (4 total)

1. **en-IN locale → en-US** in `fmt()`, `fmtCurrency()`, and outstanding balance display (3 occurrences)
2. **Investment Heads API only returned active heads** — Added `?includeInactive=true` param so Deactivated Head Shield banner works
3. **Outstanding balance missing opening balance** (CRITICAL) — Fixed across 4 files: front-end memo + server GET + server POST + server PUT. Now: `outstanding = opening + received - paid`
4. **Missing Import CSV on Investment tab** — Added button to Tab 2

## Files Modified
- `src/components/InvestmentGroupPage.tsx`
- `src/app/api/investment-heads/route.ts`
- `src/app/api/liabilities/route.ts`
- `src/app/api/liabilities/[id]/route.ts`

## Verification
- All CRUD operations tested via curl
- All calculation formulas verified consistent
- All export buttons verified on every sub-page
- Lint: Clean pass
