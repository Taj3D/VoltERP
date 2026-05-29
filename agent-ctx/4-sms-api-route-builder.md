# Task ID: 4 — SMS API Route Builder

## Agent: SMS API Route Builder
## Task: Stage 11 — Rebuild all 8 SMS API routes

## Work Log:
- Read worklog.md for prior context (Tasks 1-10)
- Read api-security.ts for all SMS-specific helpers (maskForVatAuditorSms, maskSmsArray, checkSmsSettingsWritePermission, computeSmsSegments, SMS_VAT_MASKED_FIELDS, safeFinancialRound/Add/Subtract, formatFinancialField)
- Read activity-logger.ts for logUserActivity API
- Read Prisma schema for SmsSetting, SmsLog, SmsBill, SmsBillPayment models
- Read all 8 existing SMS API route files to understand current patterns
- Rebuilt /api/sms-settings/route.ts with companyId isolation, checkSmsSettingsWritePermission, maskSmsArray, SMS-Gateway-Dispatch token
- Rebuilt /api/sms-settings/[id]/route.ts with cross-tenant validation, admin-only write, VAT masking, SMS-Gateway-Dispatch token
- Rebuilt /api/sms-logs/route.ts with computeSmsSegments, bulk mode (SMS-Campaign-Marketing), single mode (SMS-Gateway-Dispatch), cost computation
- Rebuilt /api/sms-logs/[id]/route.ts with cross-tenant validation, segment recomputation on message update, VAT masking
- Rebuilt /api/sms-bills/route.ts with companyId isolation, safeFinancialRound/Subtract for outstanding, SMS-Billing-Settle token, maskSmsArray
- Rebuilt /api/sms-bills/[id]/route.ts with cross-tenant validation, checkFinancialDeletePermission on DELETE, safe arithmetic, SMS-Billing-Settle token
- Rebuilt /api/sms-bill-payments/route.ts with tenant filtering via SmsBill relation, safeFinancialAdd for totalPaid, SMS-Billing-Settle token
- Rebuilt /api/sms-bill-payments/[id]/route.ts with cross-tenant via smsBill.companyId, checkFinancialDeletePermission, safe arithmetic, SMS-Billing-Settle token
- Lint check: ZERO errors

## Stage Summary:
- All 8 SMS API route files completely rebuilt
- Multi-tenant companyId isolation on all GET/POST/PUT/DELETE operations
- Cross-tenant validation on all [id] routes (returns 404 on mismatch)
- RBAC enforced: checkSmsSettingsWritePermission (admin-only) for SmsSettings mutations
- RBAC enforced: checkFinancialDeletePermission (admin-only) for SmsBills/SmsBillPayments DELETE
- SR can dispatch individual SMS (not blocked by WRITE_DENY for SmsLogs)
- Activity logging with proper module tokens: SMS-Gateway-Dispatch, SMS-Campaign-Marketing, SMS-Billing-Settle
- VAT Auditor masking via maskForVatAuditorSms/maskSmsArray on all GET responses
- SMS character computation via computeSmsSegments on SmsLogs POST
- Safe financial arithmetic via safeFinancialRound/Add/Subtract on all amount calculations
- Empty field defaults via formatFinancialField on optional string fields
