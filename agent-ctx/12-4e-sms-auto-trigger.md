# Task 12-4e: SMS Auto-Trigger Helper + API Integration

## Summary

Created the `dispatchAutoSms` server-side helper function and integrated auto-SMS trigger hooks into 4 existing API routes.

## Files Created

1. **`/home/z/my-project/src/lib/sms-auto-trigger.ts`** — Core helper function
   - Exports `dispatchAutoSms()` async function
   - Parameters: `triggerType`, `recipient`, `message`, `companyId`, `userId`, `userName`, `referenceData`
   - Checks `SmsAutomationConfig` toggle for the trigger type + company
   - Computes SMS segments via `computeSmsSegments()`, calculates cost
   - Credit balance shield: skips dispatch if insufficient credits
   - Creates `SmsLog` entry with status "Pending"
   - Updates `lastKnownCreditBalance` on active `SmsSetting`
   - Logs activity via `logUserActivity()` with module `Comm-SMS-Marketing`
   - NEVER throws — all errors caught and returned as `{ dispatched: false, error }`

## Files Modified

2. **`/home/z/my-project/src/app/api/sales-orders/route.ts`**
   - Added `import { dispatchAutoSms } from '@/lib/sms-auto-trigger'`
   - Trigger: `purchase` (smsAlertOnPurchase)
   - After successful SalesOrder creation, fires `void dispatchAutoSms({...}).catch(() => {})`
   - Message: `Dear {name}, Invoice {invoiceNo} raised for {itemSummary}. Total: ৳{grandTotal}. Thank you.`
   - itemSummary: product names from order lines, limited to ~50 chars

3. **`/home/z/my-project/src/app/api/cash-collections/route.ts`**
   - Added `import { dispatchAutoSms } from '@/lib/sms-auto-trigger'`
   - Trigger: `collection` (smsAlertOnCollection)
   - After successful CashCollection creation (both single and batch mode), fires fire-and-forget SMS
   - Message: `Received with thanks: ৳{amount} via {paymentMethod} against Invoice/Account {collectionCode}. Thank you.`
   - paymentMethodName resolved from `result.paymentOption?.name || 'Cash'`

4. **`/home/z/my-project/src/app/api/purchase-orders/route.ts`**
   - Added `import { dispatchAutoSms } from '@/lib/sms-auto-trigger'`
   - Trigger: `stock_receive` (smsAlertOnStockReceive) — only when status is "Received" or "Delivered"
   - After successful PurchaseOrder creation with qualifying status, fires fire-and-forget SMS
   - Message: `Stock Received Alert: {itemSummary} safely delivered to Warehouse {godownName} against PO {poNumber}.`
   - godownName resolved from `result.godown?.name || 'Main Warehouse'`

5. **`/home/z/my-project/src/app/api/employees/route.ts`**
   - Added `import { dispatchAutoSms } from '@/lib/sms-auto-trigger'`
   - Trigger: `hr_lifecycle` (smsAlertOnHrLifecycle)
   - After successful Employee creation, fires fire-and-forget SMS
   - Message: `Welcome {name} to the team! Your official joining date is confirmed on {joiningDate}. Check your email for login credentials.`
   - joiningDate formatted with `toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })`

## Design Decisions

- **Fire-and-forget pattern**: All auto-SMS dispatches use `void dispatchAutoSms({...}).catch(() => {})` to ensure SMS failures NEVER block the primary transaction or response
- **Post-transaction placement**: SMS triggers are placed AFTER `db.$transaction()` commits, ensuring they only fire on successful commits
- **Batch mode support**: Cash collections batch mode also triggers individual SMS per created record
- **Conditional PO trigger**: Purchase orders only trigger SMS when `body.status` is "Received" or "Delivered"
- **Used existing `logUserActivity`**: Used `'CREATE'` action with module `'Comm-SMS-Marketing'` (staying within the existing action type union)

## Lint & Build

- `bun run lint` passes clean with no errors
- Dev server log shows no compilation errors
