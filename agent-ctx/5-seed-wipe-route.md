# Task 5 — Staging Seed Wipe Route

## Agent: Code Agent
## Task ID: 5
## Phase: 19 (VoltERP)

## Deliverable
Created `/home/z/my-project/src/app/api/staging/seed-wipe/route.ts`

## Summary
Implemented a POST endpoint that performs a clean wipe of all seeded commercial data from the database while preserving system configuration.

### Key Features
- **POST handler** that wipes 39 tables of transaction/commercial data
- **FK-safe deletion order**: 6 phases respecting foreign key constraints
  - Phase 1: Line items (PosSaleLine, SalesReturnLine, etc.)
  - Phase 2: Dependent records (ProductSerialTracking, LedgerHashChain, CashCollection, etc.)
  - Phase 3: Transaction headers (PosSale, SalesOrder, PurchaseOrder, etc.)
  - Phase 4: Master data (Customer, Supplier, Employee)
  - Phase 5: Stock & product data (StockEntry, ProductStock, BatchMaster, DamageLog, Product)
  - Phase 6: System/audit data (InterBranchTransfer, ConsolidationLog, Notification, etc.)
- **StagingTestLog entry** with testCode `STG-WIPE-{timestamp}`, testType `SEED_WIPE`, moduleToken `Sys-Staging-QA-Vault`
- **Records deleted tracking**: Each table's deletion count is tracked individually and summed
- **Execution time tracking**: Measured from start to completion
- **Post-wipe resets**:
  - ChartOfAccount.currentBalance → openingBalance
  - Bank.currentBalance → openingBalance
  - Godown.status → "ACTIVE"
- **Activity logging** via `logUserActivity` with module "Sys-Staging-QA-Vault"
- **Error handling**: Failed wipe creates a StagingTestLog with status "Failed" and logs the error
- **Transactional**: All deletes and resets run within a single `$transaction`

### Preserved Tables (37)
Company, Branch, Category, Color, Brand, Unit, Segment, Capacity, Department, Designation, Godown (reset status), Bank (reset balance), PaymentOption, CardType, CardTypeSetup, ExpenseIncomeHead, InterestPercentage, SRTargetSetup, ChartOfAccount (reset balance), PeriodClose, FiscalYear, SmsSetting, SmsLog, SmsBill, SmsBillPayment, SmsAutomationConfig, InvestmentHead, Asset, AssetDepreciation, Liability, SystemConfig, InvoiceTemplate, NumberFormat, User, SystemBackup

### Wiped Tables (39)
PosSaleLine, PosSale, SalesReturnLine, SalesReturn, PurchaseReturnLine, PurchaseReturn, ReplacementOrderLine, ReplacementOrder, HireInstallment, HireSalesLine, HireSales, SalesOrderLine, SalesOrder, PurchaseOrderLine, PurchaseOrder, OrderSheetLine, OrderSheet, StockTransferLine, StockTransfer, DamageLog, BatchMaster, ProductStock, StockEntry, VoucherLine, JournalVoucher, LedgerEntry, LedgerAutoPost, DataIntegrityLog, CashCollection, CashDelivery, BankTransaction, Expense, Income, Customer, Supplier, EmployeeLeave, Employee, Product, ProductSerialTracking, InterBranchTransfer, ConsolidationLog, Notification, SecurityAuditTrail, LedgerHashChain, SecurityThreatLog, RateLimitAttempt, StagingTestLog, AuditLog, SystemAuditLog

### Lint Status
✅ `bun run lint` passes with no errors
