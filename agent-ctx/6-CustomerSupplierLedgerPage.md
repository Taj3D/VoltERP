# Task ID: 6 — CustomerSupplierLedgerPage Component

## Agent: subagent

## Task: Build Customer & Supplier Ledger Report component for Electronics Mart IMS

## Work Log

- Read worklog.md for project context (Phase 7 complete, 80+ module pages, 5-role RBAC, Deep Navy Blue theme)
- Read existing component patterns from AccountingReportsPage.tsx and ChartOfAccountsLedgerPage.tsx
- Read existing `/api/ledger-reports/route.ts` — confirmed all 6 endpoints exist: customer, supplier, customer-summary, supplier-summary, customer-aging, supplier-aging
- Created `/home/z/my-project/src/components/CustomerSupplierLedgerPage.tsx` (~1050 lines)

### Component Features:
1. **Header**: Title with FileText icon, VAT AUDIT MODE badge, Triple Utility Bundle (Import CSV, Export CSV, Export PDF)
2. **Three Tabs**: Customer Ledger, Supplier Ledger, Aging Analysis
3. **RBAC**:
   - Dealer: 403 Forbidden for entire component (full-page Lock card)
   - SR: Can access Customer tab, 403 for Supplier tab (Lock card inline)
   - VAT Auditor: Amber "VAT AUDIT MODE" badge, creditUtilization masked as "N/A (Audit Mode)"
   - Admin/Manager: Full access
4. **Customer Ledger Tab**:
   - Filter panel: Customer Select, From/To dates, Generate Statement button, Individual/Summary toggle
   - Individual view: Customer Info Card, Transaction Table with running balance (Opening Balance row, transactions sorted by date, Closing Balance row), Aging Summary Card with colored badges, Credit Utilization Progress bar
   - Summary view: Sortable table (click headers to sort), red rows for over-credit-limit customers, utilization progress bars
5. **Supplier Ledger Tab**:
   - Same structure as Customer tab but for supplier data
   - Filter panel: Supplier Select, From/To dates, Generate Statement, Individual/Summary toggle
   - Individual view: Supplier Info Card, Transaction Table with running balance, Aging Summary, Credit Utilization
   - Summary view: Sortable table with Code, Name, Purchases, Deliveries, Returns, Balance, Credit Limit
6. **Aging Analysis Tab**:
   - Entity Type toggle: Customer / Supplier
   - From/To date inputs, Generate button
   - Stat cards: Total Outstanding, Current, 31-60d, 61-90d, 90+d
   - Aging table with colored badges per bucket (green/yellow/orange/red)
   - Click row to drill down (expand entity details)
   - Stacked BarChart showing aging distribution per entity
   - PieChart showing total aging distribution
7. **Export**: CSV and PDF exports with landscape orientation, corporate header
8. **Styling**: Deep Navy Blue (#0a1628, #132240, #2563eb), text-slate-900 dark:text-white, Day/Night compatible
9. **Credit Utilization**: Progress bar with green (<70%), yellow (70-90%), red (>90%) coloring
10. **Aging Badges**: green (Current), yellow (31-60), orange (61-90), red (90+)
11. **All amounts**: ৳ currency format
12. **Tables**: max-h-[55vh] overflow-y-auto with custom scrollbar styling
13. **Card chart headers**: bg-[#132240] dark:bg-[#0a1628] with white text
14. **PIE_COLORS**: ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"]
15. **No hardcoded mock data** — all data fetched from API

### Lint Result:
- `bun run lint` → 0 errors, 0 warnings

### Dev Server:
- Running successfully on port 3000, no errors

## Stage Summary
- Complete CustomerSupplierLedgerPage.tsx component (~1050 lines)
- Full RBAC: Dealer=403 all, SR=403 supplier tab, VAT Auditor=masking+badge, Admin/Manager=full access
- All 3 tabs functional: Customer Ledger, Supplier Ledger, Aging Analysis
- Individual statements with running balance, aging summary, credit utilization
- Summary views with sortable columns and color coding
- Aging charts: Stacked BarChart + PieChart using Recharts
- Triple Utility Bundle: Import CSV, Export CSV, Export PDF
- Lint clean, dev server running
