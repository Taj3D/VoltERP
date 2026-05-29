---
Task ID: 6
Agent: Task-6-CashCollectionsDeliveries
Task: Rewrite 4 API route files for Cash Collections & Cash Deliveries with multi-tenant companyId isolation, safe financial arithmetic, logUserActivity module tokens, and enhanced RBAC

Work Log:
- Read /home/z/my-project/worklog.md (previous task records from Tasks 1-3)
- Read /home/z/my-project/src/lib/api-security.ts — confirmed all required exports exist:
  - withApiSecurity, checkPeriodClose, maskForVatAuditorFinancial, maskFinancialArray
  - checkFinancialDeletePermission, safeFinancialRound, safeFinancialAdd, safeFinancialSubtract
  - WRITE_DENY enforces SR blocked from CashDeliveries, Dealer blocked from all financial interfaces
- Read prisma/schema.prisma — confirmed CashCollection and CashDelivery models have companyId, chequeNo, voucherNo fields
- Read AuditLog model — confirmed structure (action, module, recordId, recordLabel, userId, userName, details)
- Read existing 4 route files to understand current patterns
- Read /api/expenses/route.ts and /api/expenses/[id]/route.ts for reference patterns

Changes Made (4 files rewritten):

1. /home/z/my-project/src/app/api/cash-collections/route.ts
   - GET: Added multi-tenant companyId filter, replaced manual maskForVatAuditor with maskFinancialArray
   - POST: Added companyId from security.user, chequeNo/voucherNo fields, safeFinancialRound on amount
   - POST: Bank balance INCREMENT uses safeFinancialAdd instead of Prisma increment
   - POST: AuditLog module changed from 'CashCollections' to 'Fin-Ledger-Transaction'
   - POST: Added batchMode support (body.batchMode === true with body.data array)
   - POST: Empty string defaults: chequeNo, voucherNo, description → null
   - Extracted createSingleCashCollection helper for reuse in batch/single mode

2. /home/z/my-project/src/app/api/cash-collections/[id]/route.ts
   - GET: Added cross-tenant companyId validation (returns 404 on mismatch)
   - GET: Replaced raw response with maskForVatAuditorFinancial
   - PUT: Added cross-tenant companyId validation
   - PUT: Bank reversal uses safeFinancialSubtract, bank re-entry uses safeFinancialAdd
   - PUT: Added full reversal ledger entries (4 entries: 2 reversal + 2 new) for proper double-entry
   - PUT: Added chequeNo, voucherNo field handling with nullIfEmpty
   - PUT: AuditLog module changed to 'Fin-Ledger-Transaction'
   - DELETE: Added checkFinancialDeletePermission (only admin can delete)
   - DELETE: Added cross-tenant companyId validation
   - DELETE: Bank reversal uses safeFinancialSubtract
   - DELETE: AuditLog module changed to 'Fin-Ledger-Transaction'

3. /home/z/my-project/src/app/api/cash-deliveries/route.ts
   - GET: Added multi-tenant companyId filter, replaced manual masking with maskFinancialArray
   - POST: Added companyId from security.user, chequeNo/voucherNo fields, safeFinancialRound on amount
   - POST: Pre-transaction bank balance validation BEFORE decrementing
   - POST: Re-validation inside transaction for consistency
   - POST: Bank balance DECREMENT uses safeFinancialSubtract instead of Prisma decrement
   - POST: AuditLog module changed from 'CashDeliveries' to 'Fin-Ledger-Transaction'
   - POST: Added batchMode support (body.batchMode === true with body.data array)
   - POST: Empty string defaults: chequeNo, voucherNo, description → null
   - Extracted createSingleCashDelivery helper for reuse in batch/single mode

4. /home/z/my-project/src/app/api/cash-deliveries/[id]/route.ts
   - GET: Added cross-tenant companyId validation (returns 404 on mismatch)
   - GET: Replaced raw response with maskForVatAuditorFinancial
   - PUT: Added cross-tenant companyId validation
   - PUT: Bank reversal uses safeFinancialAdd, bank decrement uses safeFinancialSubtract
   - PUT: Pre-transaction projected balance validation with safeFinancialAdd
   - PUT: Re-validation inside transaction for consistency
   - PUT: Added full reversal ledger entries (4 entries: 2 reversal + 2 new) for proper double-entry
   - PUT: Added chequeNo, voucherNo field handling with nullIfEmpty
   - PUT: AuditLog module changed to 'Fin-Ledger-Transaction'
   - DELETE: Added checkFinancialDeletePermission (only admin can delete)
   - DELETE: Added cross-tenant companyId validation
   - DELETE: Bank reversal uses safeFinancialAdd
   - DELETE: AuditLog module changed to 'Fin-Ledger-Transaction'

Verification:
- ESLint: PASS (zero errors)
- Dev server: Running on localhost:3000 (HTTP 200)
- RBAC enforcement verified: SR blocked from CashDeliveries by WRITE_DENY in api-security.ts
- Dealer blocked from both CashCollections and CashDeliveries by WRITE_DENY
- Manager can create/update but NOT delete (checkFinancialDeletePermission)
