# Task 3 — Staging Seed Engine API Route

## Task
Create `/home/z/my-project/src/app/api/staging/seed-engine/route.ts` — a comprehensive commercial data seeder API.

## What was built
A 1399-line POST handler that generates a complete ERP ecosystem scoped by `companyId`:

### Data Generated
| Entity | Count | Notes |
|--------|-------|-------|
| COA Accounts | 21 | 5 root + 16 sub-accounts (Assets/Liabilities/Equity/Revenue/Expenses hierarchy) |
| Categories | 8 | Electronics, Mobile, Computer, Accessories, Home Appliance, Networking, Security, Power Solution |
| Colors | 8 | Black, White, Blue, Red, Silver, Gold, Gray, Green |
| Brands | 12 | Samsung, LG, Sony, Dell, HP, Lenovo, Xiaomi, TP-Link, Hikvision, APC, Huawei, Razer |
| Units | 3 | Pieces, Kilograms, Meters |
| Segments | 3 | Retail, Wholesale, Corporate |
| Departments | 6 | Sales, Purchase, Accounts, IT, Warehouse, HR |
| Designations | 10 | With grade levels and salary bands |
| Employees | 10 | With full details |
| Users | 12 | 5 RBAC roles (admin×2, manager×2, accountant×2, sales_rep×3, warehouse×2, purchmgr×1) |
| Godowns | 5 | 4 ACTIVE + 1 SUSPENDED ("Old Depot - Mirpur") |
| Banks | 3 | Dutch-Bangla, BRAC, City Bank |
| Payment Options | 5 | Cash, Card, bKash, Nagad, Bank Transfer |
| Expense Heads | 7 | Rent, Utilities, Salary, Transport, Marketing, Maintenance, Office Supplies |
| Income Heads | 4 | Sales Revenue, Interest Income, Service Charge, Commission |
| Products | 55 | Across all 8 categories with COA mapping to Inventory Asset |
| ProductStock | ~220 | Each product × each active godown combination |
| Customers | 22 | 12 B2B Dealers + 10 B2C Regular, with COA mapping and credit limits |
| Suppliers | 22 | With COA mapping to Accounts Payable and ledger tracking |
| Purchase Orders | 25 | Chronological over 6 months with lines, stock entries, ledger pairs |
| Sales Orders | 35 | Chronological with lines, stock entries, COGS + revenue ledger pairs |
| POS Sales | 30 | With receipt lines, stock entries, cash/card/MFS split, ledger pairs |
| Journal Vouchers | 15 | CASH_RECEIPT/PAYMENT, BANK_RECEIPT/PAYMENT types with voucher lines + ledger pairs |
| Expenses | 8 | With ledger pairs (Dr Expense / Cr Cash/Bank) |
| Incomes | 5 | With ledger pairs (Dr Cash/Bank / Cr Other Income) |
| Ledger Entries | 200+ | Double-entry pairs for every transaction |
| StagingTestLog | 1 | testCode: `STG-SEED-{timestamp}`, testType: `SEED_ENGINE`, moduleToken: `Sys-Staging-QA-Vault` |

### Key Features
- **`?force=true`** query param to wipe and re-seed existing data
- **`?companyId=xxx`** required query param for multi-tenant scoping
- **Chronological integrity**: All transactions progress from 6 months ago to present
- **Double-entry bookkeeping**: Every transaction creates balanced ledger pairs
- **COA balance tracking**: Running balances updated incrementally on each transaction
- **Accounting equation validation**: Computes Assets = Liabilities + Equity, reports discrepancy
- **Inventory cross-reference**: Validates COA Inventory Asset balance vs ProductStock total values
- **Activity logging**: Uses `logUserActivity` with module `Sys-Staging-QA-Vault`

### Technical Details
- Uses `db` from `@/lib/db` with `$transaction` for atomicity
- 2-minute transaction timeout for large data volume
- Proper error handling with StagingTestLog status updates
- ESLint clean — no lint errors
