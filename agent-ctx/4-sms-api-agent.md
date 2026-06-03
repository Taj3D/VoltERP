# Task 4 — Block 12: SMS Service & Marketing Engines

## Agent: SMS API Rewrite Agent

## Summary

Rewrote all 8 existing SMS API routes and created 4 new routes for the SMS Service & Marketing Engines block. All routes now implement multi-tenant isolation via `security.user.companyId`, input validation with trimming, GSM 03.38 encoding detection, and proper campaign dispatch logic.

## Files Modified (8 rewrites)

1. **`/home/z/my-project/src/app/api/sms-settings/route.ts`** — Rewrote with:
   - GET: `companyId` filter with OR backward compat (`{ companyId }` or `{ companyId: null }`)
   - POST: Input trimming (`apiUrl`, `apiKey`, `senderId` trimmed, `\r\n` removed), validation (400 on empty), `creditBalanceLimit` field, `companyId` set on create
   - BatchMode support retained with companyId and trimming

2. **`/home/z/my-project/src/app/api/sms-settings/[id]/route.ts`** — Rewrote with:
   - All methods: `findAndVerifyOwnership()` helper that checks `record.companyId === security.user.companyId` (or allows if `record.companyId` is null for backward compat)
   - PUT: Same input trimming and validation as POST, `creditBalanceLimit` field

3. **`/home/z/my-project/src/app/api/sms-logs/route.ts`** — Rewrote with:
   - GET: `companyId` filter with OR backward compat
   - POST: `detectEncoding()` GSM 03.38 helper, `encodingType` and `smsUnits` auto-calculated, `campaignId` support, `companyId` set, recipient/message validation after trim
   - BatchMode: encoding detection per record, companyId set

4. **`/home/z/my-project/src/app/api/sms-logs/[id]/route.ts`** — Rewrote with:
   - All methods: `findAndVerifyOwnership()` helper for companyId verification
   - PUT: supports `encodingType`, `smsUnits`, `campaignId` fields

5. **`/home/z/my-project/src/app/api/sms-bills/route.ts`** — Rewrote with:
   - GET: `companyId` filter with OR backward compat
   - POST: `companyId` set on create, batchMode with companyId

6. **`/home/z/my-project/src/app/api/sms-bills/[id]/route.ts`** — Rewrote with:
   - All methods: `findAndVerifyOwnership()` helper for companyId verification

7. **`/home/z/my-project/src/app/api/sms-bill-payments/route.ts`** — Rewrote with:
   - GET: Filters payments by linked bill's companyId
   - POST: `verifyBillOwnership()` helper checks linked `smsBill.companyId` before creating payment
   - BatchMode: bill ownership verification per row

8. **`/home/z/my-project/src/app/api/sms-bill-payments/[id]/route.ts`** — Rewrote with:
   - All methods: `findAndVerifyPaymentOwnership()` checks linked bill's companyId
   - PUT: if `smsBillId` is changed, verifies new bill's ownership too

## Files Created (4 new routes)

9. **`/home/z/my-project/src/app/api/sms-campaigns/route.ts`** — New:
   - GET: List campaigns with companyId filter + OR backward compat
   - POST: Create campaign with required `campaignName`/`message`, optional filters (`filterZone`, `filterCustType`, `filterDueMin`, `filterDueMax`), `detectEncoding()` for `encodingType`/`smsUnitsPerMsg`, recipient count via customer query, companyId set

10. **`/home/z/my-project/src/app/api/sms-campaigns/[id]/route.ts`** — New:
    - GET/PUT/DELETE with `findAndVerifyOwnership()` companyId verification
    - PUT: Status transition validation (Draft→Queued→Dispatching→Completed/Failed)
    - DELETE: Prevents deleting Dispatching/Completed campaigns, unlinks SmsLog records first

11. **`/home/z/my-project/src/app/api/sms-campaigns/dispatch/route.ts`** — New:
    - POST: Accepts `{ campaignId }`, verifies ownership, loads active SmsSetting
    - Credit balance check: `creditBalanceLimit > 0 && estimatedCost > creditBalanceLimit` → 400
    - Fetches filtered customers, creates SmsLog per recipient with campaignId
    - Updates campaign status to Completed/Failed, stores dispatchLog as JSON

12. **`/home/z/my-project/src/app/api/sms-credit-balance/route.ts`** — New:
    - GET: Returns `{ available, used, remaining, creditBalanceLimit, configured }`
    - `used` = aggregate sum of `smsUnits` from SmsLog where companyId
    - `remaining` = `creditBalanceLimit - used` (min 0)

## Common Patterns Applied

- All routes import `withApiSecurity` from `@/lib/api-security`
- All GET queries use `{ OR: [{ companyId }, { companyId: null }] }` for backward compat when companyId exists
- All writes set `companyId: security.user.companyId`
- All `AuditLog` creation preserved inside `$transaction`
- `db` imported from `@/lib/db`
- `NextRequest`/`NextResponse` from `next/server`

## GSM 03.38 Detection

- Helper function `detectEncoding()` added in `sms-logs/route.ts`, `sms-campaigns/route.ts`, and `sms-campaigns/dispatch/route.ts`
- `GSM_0338_CHARS` character set covers the full GSM 03.38 alphabet including extended chars (€, {, }, [, ~, |, \)
- GSM = 160 chars/part, Unicode = 70 chars/part
- `smsUnits = Math.ceil(charCount / charsPerPart) || 1`

## Verification

- `npx eslint` on all 12 files: **zero errors**
- `bun run lint`: only pre-existing start-server.js errors
- Dev server: running cleanly, HTTP 200
