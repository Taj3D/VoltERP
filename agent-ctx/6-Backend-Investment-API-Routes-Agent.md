# Task 6: Backend Investment API Routes Agent

## Summary
Rewrote all 8 Investment Module API route files with strict validation, safe financial arithmetic, multi-tenant isolation, and audit logging.

## Files Modified/Created
1. `/api/investment-heads/route.ts` — Complete rewrite with companyId filter, financial field validation, batchMode, AuditLog 'Inv-Asset-Ledger'
2. `/api/investment-heads/[id]/route.ts` — Complete rewrite with cross-tenant validation, checkFinancialDeletePermission, logUserActivity
3. `/api/assets/route.ts` — Complete rewrite with idempotency guard, Fixed/Current Asset validation, depreciation auto-calculation, batchMode, Equity ledger auto-post
4. `/api/assets/[id]/route.ts` — Complete rewrite with depreciation recalculation on update, cross-tenant validation
5. `/api/liabilities/route.ts` — Complete rewrite with Investment Head isActive check, batchMode, maskFinancialArray
6. `/api/liabilities/[id]/route.ts` — Complete rewrite with cross-tenant validation, checkFinancialDeletePermission
7. `/api/asset-depreciation/route.ts` — NEW route for depreciation schedule generation
8. `/api/asset-depreciation/[id]/route.ts` — NEW route for single depreciation entry management

## Key Directives Enforced
- Investment Heads Validation: Block negative/zero/null for investmentAmount, sharePercentage, capitalValue
- Fixed vs Current Asset Architecture: Strict classification toggle, Current assets bypass depreciation
- Idempotent Asset Creation: idempotencyKey guard prevents duplicate capital asset allocation
- Safe Financial Arithmetic: All calculations use safeFinancialRound/Add/Subtract
- Activity Logging: logUserActivity with module 'Inv-Asset-Ledger' for all create/update/delete
- Multi-tenant Isolation: companyId filter on GET, cross-tenant validation on /id routes
- Admin-only Delete: checkFinancialDeletePermission on all DELETE routes

## Verification
- `bun run lint` passed with ZERO errors
