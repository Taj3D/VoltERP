# Financial Audit Module - API Routes Created

## Task: Create 4 new API route files for the Financial Audit Module

### Files Created

1. **`/src/app/api/financial-audit/fraud-detection/route.ts`**
   - GET endpoint returning live fraud detection analytics
   - Asset Valuation Metrics (book vs market value, >20% discrepancy = Valuation Risk)
   - Age Distribution Logs (6 brackets, >30% total value = Aging Risk)
   - Ledger Integrity Status (unbalanced entries, orphans, duplicate refs, missing auto-posts)
   - Anomaly Detection (negative margins, concentration risk, credit limit breaches, overdue suppliers)
   - Overall Health Score (0-100, weighted deduction system)
   - Module token: `Audit-Fraud-Detection`

2. **`/src/app/api/financial-audit/hire-purchase-report/route.ts`**
   - GET endpoint with query params: from, to, status, customerId
   - Hire purchase installment analysis per sale
   - Installment breakdown: paid/pending/overdue/writtenOff counts
   - Summary: totalOutstanding, totalOverdue, collectionRate, defaultRate
   - Monthly collection chart data
   - Module token: `Audit-Hire-Purchase`

3. **`/src/app/api/financial-audit/commission-report/route.ts`**
   - GET endpoint with query params: from, to, employeeId
   - SR commission analysis per employee
   - Commission = SRTargetSetup.commissionPercentage * totalRevenue / 100
   - Non-SR employee productivity metrics
   - Summary: totalCommissions, avgTargetAchievement, topPerformer
   - SR performance comparison chart data
   - Module token: `Audit-Commission`

4. **`/src/app/api/financial-audit/collection-matrix/route.ts`**
   - GET endpoint with query params: from, to, customerId
   - Customer collection matrix with openingBalance, totalInvoiced, totalCollected, totalReturned
   - Collection rate = totalCollected / totalInvoiced * 100
   - Aging of receivables: current, 1-30, 31-60, 61-90, 90+ days
   - Summary: totalReceivables, totalCollected, overallCollectionRate, averageDaysToCollect
   - Monthly collection trends chart data
   - Module token: `Audit-Collection`

### Compliance Checklist
- [x] `import { db } from '@/lib/db'` for database access
- [x] `import { withApiSecurity, safeFinancialAdd, safeFinancialSubtract, safeFinancialRound, maskForVatAuditor, maskDashboardForVatAuditor, type UserRole } from '@/lib/api-security'`
- [x] `import { logUserActivity } from '@/lib/activity-logger'` for audit logging
- [x] `import { NextRequest, NextResponse } from 'next/server'`
- [x] CompanyId isolation from `security.user.companyId`
- [x] All financial calculations use safeFinancialAdd/Subtract/Round
- [x] VAT auditor masking via `maskDashboardForVatAuditor`
- [x] Module tokens: Audit-Fraud-Detection, Audit-Hire-Purchase, Audit-Commission, Audit-Collection
- [x] ESLint passes
- [x] TypeScript type-check passes (no errors in new files)
