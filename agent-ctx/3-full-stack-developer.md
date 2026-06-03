# Task 3 — Hire Sales API Rewrite & Installment Payment API

## Agent: full-stack-developer
## Status: COMPLETED

## Summary
Rewrote all 3 Hire Sales API route files with complete production-ready code implementing COGS calculation, hire interest engine, declining balance installment amortization, real-time overdue detection, AR integration, stock reversal, and VAT Auditor masking.

## Files Modified/Created

### 1. `/home/z/my-project/src/app/api/hire-sales/route.ts` — REWRITTEN
- **GET**: companyId filter, isActive filter, company isolation, full relation includes (customer, godown, company, lines→product→category+brand, installments ordered by installmentNo asc), real-time overdue interest update, VAT Auditor masking
- **POST**: Validation, period-close lock, server-side line totals, COGS (Product.costPrice lookup), hire interest calculation (simple interest: balanceAmount * rate% * duration/12), declining balance installment schedule generation, credit limit protection, HIR-XXXXX auto-generation, stock safety verification, StockEntry OUT, AR integration (Dr balance + grandTotal, minus dp if down payment), audit log

### 2. `/home/z/my-project/src/app/api/hire-sales/[id]/route.ts` — REWRITTEN
- **GET**: Full relations with VAT Auditor masking, isActive guard
- **PUT**: Interest recalculation on parameter changes, installment regeneration (declining balance), status transitions (Cancelled → stock reversal + AR reversal), COGS recalculation
- **DELETE**: Soft delete with stock reversal (IN entries), AR adjustment (reverse Dr by grandTotal), auto-toggle creditStatus

### 3. `/home/z/my-project/src/app/api/hire-sales/installment-payment/route.ts` — NEW
- **POST**: Pay installment with full validation chain (hire sale existence → Active status → installment belongs → not Paid/WrittenOff → period lock), updates installment (paidAmount, paidDate, paymentRef, status=Paid/Partial), updates HireSales (totalPaid, outstandingBalance, currentStatus=Completed if 0), AR integration (Dr/Cr balance management with flip logic, auto-toggle OverLimit→Active), nextPaymentDate update, audit log
- **GET**: Installment schedule with real-time overdue computation (overdueDays, penaltyAmount, remainingAmount), summary stats, VAT Auditor masking

## Key Patterns Used
- `withApiSecurity(request, 'HireSales', method)` — RBAC enforcement
- `checkPeriodClose(date)` — Period lock guard
- `safeFinancialRound/Add/Subtract` — Floating-point safe financial math
- `maskForVatAuditor` — VAT Auditor masking for monetary fields
- `prisma.$transaction()` — Atomic operations
- `tx.auditLog.create()` — Audit trail
- Dynamic route params: `{ params: Promise<{ id: string }> }`

## Verification
- Lint passes cleanly
- Dev server running without errors
