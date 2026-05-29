# Task 5 — SMS Frontend Rebuilder

## Task: Stage 11 — Rebuild SMSAnalyticsPage.tsx

### Summary
Complete rewrite of `/home/z/my-project/src/components/SMSAnalyticsPage.tsx` with all 12 mandatory changes from the Stage 11 specification.

### Changes Implemented

| # | Change | Status |
|---|--------|--------|
| A | Intl.NumberFormat('en-BD') for all financial/billing values | ✅ Done |
| B | Enterprise PDF Footer on ALL PDF exports | ✅ Done (4 handlers) |
| C | SMS Character Bounds Computation (Unicode-aware) | ✅ Done |
| D | Enhanced SMS Settings Form (6 new fields) | ✅ Done |
| E | Enhanced SMS Log Table (4 new columns) | ✅ Done |
| F | Enhanced SMS Bill Table (2 new columns) | ✅ Done |
| G | RBAC Privacy Locks (Dealer/SR/Admin/VAT Auditor) | ✅ Done |
| H | Empty Field Defaults (fmtEmpty helper) | ✅ Done |
| I | SMS Bill Payment Dialog Enhancement (reference field) | ✅ Done |
| J | Bulk SMS with batchMode API | ✅ Done |
| K | Manager Delete Restriction | ✅ Done |
| L | Export Column Definitions Update | ✅ Done |

### Key Implementation Details

1. **Intl.NumberFormat('en-BD')**: Created `bdCurrencyFmt` instance with `minimumFractionDigits: 2, maximumFractionDigits: 2`. Used in `fmtCurrency()` and `fmt()` for currency/number types.

2. **Enterprise PDF Footer**: All 4 PDF export handlers (`handleExportLogPDF`, `handleExportBillPDF`, `handleExportReportPDF`, `handleExportSettingsPDF`) include `financialFooter` with `preparedBy`, `checkedBy`, `authorizedBy`, `printedBy`.

3. **SMS Segment Computation**: `computeClientSmsSegments()` detects Unicode via `/[^\x00-\x7F]/` regex, sets `charsPerSegment` to 70 (Unicode) or 160 (Standard), computes `segmentCount`. Display shows char count, segments, type badge, and estimated cost.

4. **Settings Form**: Extended `settingsForm` state with `maskingName`, `maskingRegId`, `gatewayName`, `ratePerSms` (default 0.5), `unicodeRate` (default 0.8), `setupCost` (default 0).

5. **Log Table**: Added columns for `charCount`, `smsSegmentCount`, `isUnicode` (Unicode/Standard badge), `campaignName`.

6. **Bill Table**: Added `totalSegments` column, `outstanding` column (with VAT masking).

7. **RBAC**:
   - Dealer: "Access Restricted" card (early return after hooks)
   - SR: Settings and Billing tabs hidden; bulk mode toggle hidden; single SMS only
   - Admin-only: Settings edit/delete with Tooltip for non-admin
   - VAT Auditor: Extended masking to apiKey (•••••••• for non-admin), ratePerSms, unicodeRate, setupCost, all billing amounts, outstanding
   - Badge text: "Carrier costs, balance rates, API tokens, and billing statements masked for audit compliance."

8. **fmtEmpty**: Helper function for optional display fields (campaignName, gatewayName, maskingName, maskingRegId, reference, notes, method).

9. **Payment Dialog**: Added `reference` field to bill payment form.

10. **Bulk SMS**: Uses `batchMode: true` with `recipients` array in single POST request.

11. **Manager Delete**: Disabled delete button with Tooltip "Only administrators can delete bills" for non-admin roles.

12. **Export Columns**: `smsLogColumns` (9 cols), `smsBillColumns` (7 cols) with new fields. VAT masked columns updated: bills include `outstanding`.

### Bug Fix
- Fixed React hooks rules-of-hooks violation: Dealer early return moved after all hook declarations.

### Verification
- `bun run lint`: ZERO errors
- Dev server: stable, compiled successfully
