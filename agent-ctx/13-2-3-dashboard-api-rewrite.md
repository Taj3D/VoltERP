# Task 13-2-3: Dashboard & DashboardAnalytics API Rewrite

## Agent: Dashboard API Rewrite Agent
## Task: STAGE 13 — Rewrite Dashboard & DashboardAnalytics API routes with full compliance

### Work Completed

1. **Prisma Schema Updates** (9 models + Company model):
   - Added `companyId`, `company` relation, and `@@index([companyId])` to:
     Customer, Supplier, SalesOrder, PurchaseOrder, HireSales, SalesReturn, PurchaseReturn, SRTargetSetup, PaymentOption
   - Added opposite relation fields to Company model for all 9

2. **`/api/dashboard/route.ts`** (complete rewrite):
   - All queries filtered by `companyFilter = security.user.companyId ? { companyId } : {}`
   - `safeFinancialAdd/Subtract/Round` for all financial arithmetic
   - `maskDashboardForVatAuditor(responseData, security.user.role)` for deep recursive VAT masking
   - `logUserActivity({ action: 'EXPORT', module: 'Audit-Dashboard-KPI', ... })`

3. **`/api/dashboard-analytics/route.ts`** (complete rewrite):
   - All 8 handlers accept `companyFilter` parameter
   - `calculateTotalReceivables/Payables` accept `companyFilter`
   - `safeFinancialAdd/Subtract/Round` throughout
   - `maskDashboardForVatAuditor` for KPI, financial-ratios, receivables-aging, top-performers, monthly-trend, category-turnover
   - `logUserActivity` with module 'Audit-Dashboard-KPI' for 6 analytics types

### Verification
- `bun run lint` — ZERO errors
- `bun run db:push` — schema synced
- Dev server: HTTP 200, `/api/dashboard` returns 200
