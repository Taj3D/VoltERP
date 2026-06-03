# Task 2: Accounting Export API Endpoint

## Agent: accounting-export-api

## Task
Build new `/api/reports/accounting-export` endpoint for executive-level accounting export data with company branding for PDF/CSV exports.

## Work Completed

### File Created
- `/home/z/my-project/src/app/api/reports/accounting-export/route.ts` (~620 lines)

### Implementation Details

**Endpoint**: `GET /api/reports/accounting-export`

**Query Parameters**:
- `reportType`: "cash-in-hand" | "trial-balance" | "profit-loss" | "balance-sheet" | "chart-of-accounts"
- `from`: date filter start
- `to`: date filter end
- `asOf`: point-in-time for balance sheet
- `vatMode`: boolean for VAT auditor masking
- `format`: "pdf-data" | "csv-data"

**Response Structure** (ExportResponse):
```typescript
{
  columns: Array<{ key, label, type: "text"|"currency"|"number"|"date"|"percent" }>,
  rows: Array<Record<string, unknown>>,
  summary: Record<string, unknown>,
  company: CompanyProfile,
  reportTitle: string,
  subtitle: string,
  systemNotice: string,
  financialFooter: { preparedBy, checkedBy, authorizedBy, approvedBy, printedBy },
  reportType: string,
  format: string,
  generatedAt: string
}
```

**Report Types**:

1. **Cash-in-Hand**: Bank-by-bank breakdown with opening balance, deposits, withdrawals, income, expense, collections, deliveries, current balance. Includes unbanked cash row and aggregate totals.

2. **Trial Balance**: Account-level debit/credit with opening balance seeding from COA, classification grouping, grand total verification (balanced check).

3. **Profit & Loss**: Revenue (sales + other income), COGS, gross profit/margin, operating expenses by head, net profit/margin. Categorized rows for PDF rendering.

4. **Balance Sheet**: Assets (stock, bank balance, receivables, supplier advances), Liabilities (payables, customer advances, equity/retained earnings), financial ratios (current ratio, debt-to-equity), balance verification.

5. **Chart of Accounts**: Full account listing with dynamic sub-balances (ownDebit, ownCredit, ownNet, totalDebit, totalCredit, totalNet), parent account, classification summary.

**Security & Patterns**:
- withApiSecurity for RBAC (accounting-report group)
- validateVatMode + maskAccountingReportForVatAuditor for VAT auditor mode
- safeFinancialAdd/Subtract/Round for all calculations
- sanitizeCurrencyValue for clean numeric output
- logUserActivity with module 'Acc-Accounting-Export'
- Multi-tenant: companyId filter on all queries
- Company branding from db.company.findFirst()

**Verification**:
- Lint passes cleanly
- Endpoint returns 401 for unauthenticated requests (correct behavior)
