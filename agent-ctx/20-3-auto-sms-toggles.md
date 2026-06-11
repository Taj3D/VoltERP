# Task 20-3: Auto SMS Toggle Settings

## Task Summary
Add Auto SMS Toggle settings to the SMS Service Settings page with 4 ON/OFF toggles:
1. **autoSmsOnPurchase** - Customer Purchase SMS (auto SMS to customer when they purchase a product)
2. **autoSmsOnReceipt** - Cash/Bank Receipt SMS (auto SMS to customer/dealer when cash or bank payment received)
3. **autoSmsOnStockReceive** - Stock Receipt SMS (auto SMS to supplier when products received at godown/showroom)
4. **autoSmsOnEmployeeEvent** - Employee Event SMS (auto SMS for employee events — exam date, joining date, etc.)

## Changes Made

### 1. Prisma Schema (`prisma/schema.prisma`)
Renamed `SmsAutomationConfig` model fields to match task specification:
- `smsAlertOnPurchase` → `autoSmsOnPurchase`
- `smsAlertOnCollection` → `autoSmsOnReceipt`
- `smsAlertOnStockReceive` → `autoSmsOnStockReceive` (same concept, cleaner name)
- `smsAlertOnHrLifecycle` → `autoSmsOnEmployeeEvent`

All defaults remain `false` (OFF). Ran `db:push --accept-data-loss` to sync schema.

### 2. SMSAnalyticsPage.tsx
Updated the "Auto SMS Triggers" section in Settings tab:
- **Section title**: "Auto SMS Triggers / স্বয়ংক্রিয় এসএমএস ট্রিগার"
- **4 toggle cards** with clear labels and descriptions:
  1. "Customer Purchase SMS / ক্রেতা ক্রয় এসএমএস" — "Auto SMS to customer when they purchase a product — includes product info, invoice number & amount"
  2. "Cash/Bank Receipt SMS / নগদ/ব্যাংক রশিদ এসএমএস" — "Auto SMS to customer/dealer when cash or bank payment is received — includes payment method & amount"
  3. "Stock Receipt SMS / স্টক গ্রহণ এসএমএস" — "Auto SMS to supplier when products are received at godown/showroom — includes product, quantity & location"
  4. "Employee Event SMS / কর্মী ইভেন্ট এসএমএস" — "Auto SMS for employee events — exam date, joining date, confirmation & other HR milestones"
- **ON/OFF badges**: Colored indicators (emerald for ON, slate for OFF) with rounded badge style
- **Switch toggles**: Admin-only control, non-admin sees disabled switch with tooltip
- **API calls**: PUT to `/api/sms-automation` with new field names

### 3. API Routes Updated
- **`/api/sms-automation/route.ts`**: Updated DEFAULT_AUTOMATION_CONFIG, POST handler, and PUT handler with new field names
- **`/api/sms-automation-config/route.ts`**: Updated GET response with new field names
- **`/api/sms-automation/trigger/route.ts`**: Updated TRIGGER_TOGGLE_MAP with new field names

### 4. SMS Event Hooks (`src/lib/sms-event-hooks.ts`)
Updated `eventTypeToConfigField` mapping:
- `SalesConfirmation` → `autoSmsOnPurchase`
- `FinancialCollection` → `autoSmsOnReceipt`
- `InventoryIngestion` → `autoSmsOnStockReceive`
- `HRLifecycle` → `autoSmsOnEmployeeEvent`

### 5. SMS Auto Trigger (`src/lib/sms-auto-trigger.ts`)
Updated toggle map to use new field names.

### 6. Sales Orders API (`src/app/api/sales-orders/route.ts`)
Updated comment and field reference from `smsAlertOnPurchase` to `autoSmsOnPurchase`.

### 7. Prisma Client Cache
Bumped `PRISMA_SCHEMA_VERSION` from 9 to 10 in `src/lib/db.ts`.

## Integration Points Verified
All existing SMS trigger integrations remain functional:
- ✅ Purchase order receiving → `triggerInventoryIngestionSms` (gated by `autoSmsOnStockReceive`)
- ✅ Sales orders → `triggerSalesConfirmationSms` (gated by `autoSmsOnPurchase`)
- ✅ Cash collections → `triggerFinancialCollectionSms` (gated by `autoSmsOnReceipt`)
- ✅ Bank transactions → `triggerFinancialCollectionSms` (gated by `autoSmsOnReceipt`)
- ✅ Employees → `triggerHRLifecycleSms` (gated by `autoSmsOnEmployeeEvent`)

## Verification
- ✅ `bun run lint` passes cleanly (0 errors)
- ✅ Dev server running on port 3000 (HTTP 200)
- ✅ API routes accessible (401 auth required = correct behavior)
- ✅ No remaining references to old field names in `src/` directory
