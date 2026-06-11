# Task 12: Fix bugs in SMS Service Module

## Agent: SMS Service Auditor
## Date: 2026-03-05
## Status: ✅ COMPLETE

## Summary
Audited the entire SMS Service Module (SMSAnalyticsPage.tsx + 20+ API routes + auto-SMS engine) and fixed 8 bugs across 5 files.

## Bugs Fixed:
1. **CRITICAL**: SmsSetting Prisma schema missing `lastKnownCreditBalance` and `creditBalanceLimit` fields - caused runtime errors in auto-SMS dispatch and gateway balance API
2. **CRITICAL**: sms-credit-balance route referenced non-existent `smsUnits` field (should be `smsSegmentCount`)
3. **CRITICAL**: sms-campaigns/dispatch route referenced 10+ non-existent Prisma fields - complete rewrite needed
4. **HIGH**: Inbox Import CSV button visible to VAT Auditor
5. **HIGH**: Inbox "Add Entry" button visible to VAT Auditor
6. **HIGH**: Campaign "New Campaign" button visible to VAT Auditor
7. **HIGH**: Campaign Import CSV + Launch/Cancel buttons visible to VAT Auditor
8. **HIGH**: Bill edit/payment actions visible to VAT Auditor (should be read-only)

## Files Modified:
- `prisma/schema.prisma` — Added lastKnownCreditBalance + creditBalanceLimit to SmsSetting
- `src/app/api/sms-credit-balance/route.ts` — Fixed smsUnits→smsSegmentCount, added VAT masking
- `src/app/api/sms-campaigns/dispatch/route.ts` — Complete rewrite with correct field names
- `src/components/SMSAnalyticsPage.tsx` — VAT Auditor role restrictions on 7 buttons/actions
- `src/lib/export-utils.ts` — Added 9 SMS fields to VAT_MASKED_COLUMNS

## Lint: ✅ Passes clean
