# Task ID 5 — SMS Service & Marketing Engines (Block 12, Domain 19)

## Agent: SMS Analytics Rewrite Agent

## Work Summary

Complete rewrite of `/home/z/my-project/src/components/SMSAnalyticsPage.tsx` implementing all 4 Block 12 directives.

### Directives Implemented

#### Directive 1 — SMS Gateway Configuration Security
- **Input trimming on save**: `apiUrl.replace(/[\r\n]/g, "").trim()`, `apiKey.replace(/[\r\n]/g, "").trim()`, `senderId.replace(/[\r\n]/g, "").trim()` in `saveSettings()`
- **creditBalanceLimit field**: Added to settings form state, settings dialog (number input), and settings list cards
- **Credit Balance Alert indicator**: Yellow warning badge shown on settings card when `creditBalanceLimit` is set and > 0

#### Directive 2 — GSM 03.38 Character Count Engine & Campaign Balance Shield
- **GSM_0338_CHARS constant**: Full GSM 03.38 character set defined at module level
- **detectSmsEncoding() function**: Returns `{ encoding, charsPerPart, smsUnits, charCount }` — detects GSM vs Unicode, calculates SMS units
- **Character Count Info Card** in Send SMS tab: Shows Total Characters, Detected Encoding (colored badge), SMS Units Per Recipient, Max Chars Per Part, Recipients, Total SMS Units, Estimated Total Cost, and character progress bar
- **Campaign Balance Shield**: Before dispatching, calculates `totalRequired = recipientCount * smsUnits * costPerMessage`, compares against `availableCredits`. If insufficient, BLOCKS dispatch button with red warning banner "Action Blocked: Insufficient SMS API credits. Required: X, Available: Y"
- **Credit Balance Fetch**: `fetchCreditBalance()` useCallback fetching `/api/sms-credit-balance`, called on mount
- **Credit Balance Card** in Send SMS sidebar showing Available/Used credits

#### Directive 3 — Duplicate Campaign Trigger Prevention & Audience Filtering
- **Dispatch button locks instantly**: `isLoading={true}` on click, button text changes to "Dispatching SMS Queue via Gateway..." with `animate-spin` Loader2 icon
- **smsSnapshot state**: Before dispatch, saves `{ recipient, message, costPerMessage, sendMode }` — on API failure, restores form from snapshot with destructive toast
- **NEW Campaigns tab** with:
  - Campaign name input
  - Campaign message textarea with GSM 03.38 character counter
  - Audience Filter section: Zone dropdown (populated from `/api/customers?select=area`), Customer Type dropdown (Retail/Wholesale/Dealer), Due Balance Range (min/max number inputs)
  - "Preview Recipients" button fetching filtered count from `/api/customers?select=count`
  - Display: "Estimated Recipients: N, SMS Units Per Recipient: M, Total SMS Units: N×M"
  - "Launch Bulk Campaign" button with double-hit guard (disabled while dispatching, Loader2 spinner)
  - Campaign History sidebar showing launched campaigns with status badges
- **Audience filtering**: Zones fetched from `/api/customers?select=area` on mount; `previewRecipients()` useCallback builds query params from filters

#### Directive 4 — Activity Logging
- **logSmsActivity() helper**: Defined at module level — reads `ems_auth` from localStorage, POSTs to `/api/user-activity` with `{ actionType, module, details, fileName }`
- **Logging calls**:
  - `logSmsActivity("EXPORT_PDF", "Comm-SMS-Marketing", ...)` in all PDF export handlers (Log, Bill, Bill Payment)
  - `logSmsActivity("EXPORT_CSV", "Comm-SMS-Marketing", ...)` in all CSV export handlers (Log, Bill, Bill Payment)
  - `logSmsActivity("IMPORT_CSV", "Comm-SMS-Marketing", ...)` in all CSV import handlers (Log, Bill, Bill Payment)
  - `logSmsActivity("DISPATCH", "Comm-SMS-Marketing", ...)` when dispatching single/bulk SMS
  - `logSmsActivity("CAMPAIGN", "Comm-SMS-Marketing", ...)` when creating/launching campaign

### Tabs Structure (7 tabs → 6 rendered)
1. **Dashboard** — existing KPIs, charts, report (kept unchanged)
2. **SMS Log** — existing table, filters, export/import (kept unchanged)
3. **SMS Billing** — existing bills, payments (kept unchanged)
4. **Send SMS** — ENHANCED with GSM 03.38 counter + balance shield + snapshot restore
5. **Campaigns** — NEW bulk campaign builder with audience filtering
6. **Settings** — ENHANCED with creditBalanceLimit + input trimming + credit balance alert

### New State Variables Added
- `smsSnapshot`, `creditBalance`, `campaigns`, `campaignName`, `campaignMessage`, `filterZone`, `filterCustType`, `filterDueMin`, `filterDueMax`, `estimatedRecipients`, `previewLoading`, `campaignDispatching`, `zones`, `exportPdfLoading`, `exportCsvLoading`

### New Imports Added
- `Loader2`, `Users`, `Megaphone`, `Filter`, `Eye`, `ShieldAlert`, `Zap` from lucide-react

### Verification
- `bun run lint` — only pre-existing errors in start-server.js (2 require-import warnings), zero new errors
- Dev server compiles successfully (200 responses confirmed)
- File: 2221 lines (up from 1722 lines)
