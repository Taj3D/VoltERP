# Task 12-4b/12-4c — SMS Automation API Routes

## Summary
Created two API route files for SMS Automation Config CRUD and Auto-SMS dispatch trigger, with full RBAC enforcement, multi-tenant isolation, VAT Auditor masking, activity logging, and credit balance protection.

## Files Created

### 1. `/src/app/api/sms-automation/route.ts`
- **GET** — Fetches active SmsAutomationConfig for current tenant; returns default (all toggles false) if none exists; applies VAT Auditor masking
- **POST** — Admin-only creation of SmsAutomationConfig with 4 boolean toggles; enforces `companyId: security.user.companyId` for multi-tenant isolation; logs activity with `Comm-SMS-Marketing` module token
- **PUT** — Admin-only update with upsert pattern (creates if not found); logs activity with `Comm-SMS-Marketing` module token

### 2. `/src/app/api/sms-automation/trigger/route.ts`
- **POST** — Internal server-to-server endpoint (no `withApiSecurity`)
- Validates `x-internal-api-call: true` header for authorization
- Validates triggerType, recipient (phone format), message, and companyId (verified against Company table)
- Maps trigger types to toggle fields: purchase→smsAlertOnPurchase, collection→smsAlertOnCollection, stock_receive→smsAlertOnStockReceive, hr_lifecycle→smsAlertOnHrLifecycle
- If toggle OFF: returns `{ dispatched: false, reason: "Trigger disabled" }`
- If toggle ON: computes SMS segments via `computeSmsSegments`, calculates cost from tenant's SmsSetting rates, creates SmsLog entry with `campaignName: "Auto-SMS: {triggerType}"`, updates `lastKnownCreditBalance`, logs with `AUTO_SMS_DISPATCH` action
- Credit balance shield: blocks dispatch if insufficient credits
- Returns `{ dispatched: true, smsLogId, cost, segmentCount, ... }`

## Files Modified

### `/src/lib/api-security.ts`
- Added `SmsAutomation: 'sms'` to MODULE_GROUP_MAP for RBAC group enforcement

## Testing
- `bun run lint` passes with no errors
- `bun run db:push` confirms database is in sync
- GET /api/sms-automation returns 401 (expected — requires auth header)
- POST /api/sms-automation/trigger returns 401 (expected — requires x-internal-api-call header)
