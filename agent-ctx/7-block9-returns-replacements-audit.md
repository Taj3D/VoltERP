# Task ID: 7 — Block 9 Returns & Replacements Audit Directives

## Agent: Block 9 Returns & Replacements Audit Agent
## File: `/home/z/my-project/src/components/InventoryGroupPage.tsx`

## Changes Made

### State Variables Added (lines 375-406)
- `srSnapshot`, `prSnapshot`, `rplSnapshot` — snapshot rollback state
- `srExportingPDF`, `srExportingCSV`, `prExportingPDF`, `prExportingCSV`, `rplExportingPDF`, `rplExportingCSV` — per-tab export spin-locks
- Updated `rplLines` initial state to include `serialNumber`, `replacementSerialNumber`, `damagedStockGodownId`

### saveSr (lines 2695-2730)
- Added `setSrSnapshot([...srData])` before API call
- Added `restockingSurcharge` to lines payload
- Added validation loop for quantity > 0 and rate >= 0
- Added `logUserActivity('PROCESS_RETURN', 'SCM-Reverse-Logistics', ...)` on success
- Added rollback `setSrData(srSnapshot)` on failure + destructive toast

### savePr (lines 2921-2956)
- Same pattern as saveSr with `setPrSnapshot`, restockingSurcharge, validation, logging, rollback

### saveRpl (lines 3121-3156)
- Added `setRplSnapshot([...rplData])` before API call
- Extended lines payload with `serialNumber`, `replacementSerialNumber`, `damagedStockGodownId`
- Added validation loop for quantity > 0 and rate >= 0
- Added `logUserActivity('ISSUE_REPLACEMENT', 'SCM-Reverse-Logistics', ...)` on success
- Added rollback on failure

### renderSalesReturn (lines 2738-2862)
- Red banner when `!srForm.salesOrderId`
- "Restock Chg" column in line items table with input
- Save button: `disabled={srSaving || !srForm.salesOrderId}`, spin-lock text "Process Sales Return" / "Re-calculating Reverse Logistics Ledgers..."
- Export spin-locks wrapped in toolbar callbacks

### renderPurchaseReturn (lines 2972-3096)
- Red banner when `!prForm.purchaseOrderId`
- "Restock Chg" column in line items table with input
- Save button: `disabled={prSaving || !prForm.purchaseOrderId}`, spin-lock text "Authorize Purchase Return"
- Export spin-locks wrapped in toolbar callbacks

### renderReplacements (lines 3180-3312)
- Red banner when `!rplForm.salesOrderId` (Recommended, not Required)
- Replaced LineItemsGrid with custom Table including: Original Product, Serial/IMEI, Replacement Product, Replacement Serial, Qty, Rate, Damaged Stock Godown, Total, Remove
- "Add Line" button with Plus icon
- Dialog widened to max-w-4xl
- Save button: spin-lock text "Issue Replacement Voucher"
- Export spin-locks wrapped in toolbar callbacks

### Helper Functions Updated
- `loadSrProducts`: added restockingSurcharge: 0 to mapped lines
- `openSrCreate`: added restockingSurcharge: 0 to initial lines
- `openSrEdit`: added restockingSurcharge mapping from existing lines
- `loadPrProducts`: added restockingSurcharge: 0 to mapped lines
- `openPrCreate`: added restockingSurcharge: 0 to initial lines
- `openPrEdit`: added restockingSurcharge mapping from existing lines
- `openRplCreate`: added serialNumber, replacementSerialNumber, damagedStockGodownId to initial lines
- `openRplEdit`: added new fields mapping from existing lines

## Verification
- `npx eslint src/components/InventoryGroupPage.tsx` — zero errors
- `bun run lint` — only pre-existing start-server.js errors
- Dev server compiling successfully
