# Task ID: 5 — Phase 12 StockTransfersPage Rewrite + DamageLogsPage

## Work Log

### File Modified
- `/home/z/my-project/src/components/ElectronicsMartApp.tsx`

### Changes Made

#### 1. Added Tooltip Import (line 38)
- Added `import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";`

#### 2. Added "damage-logs" Sidebar Item (line 370)
- Added `{ key: "damage-logs", label: "Damage Log", icon: AlertTriangle }` after the stock-transfers item

#### 3. Completely Rewrote StockTransfersPage (lines 5882-6354 replaced with ~550 lines)

**a) Intransit Valuation State Machine UI**
- Status badges: PENDING (yellow), IN_TRANSIT (blue), RECEIVED (green/completed), REJECTED (red)
- Action buttons per status:
  - PENDING: "Ship (→ In-Transit)" button (blue border)
  - IN_TRANSIT: "Mark Received ✓" button (green) + rejection reason input + "Reject ✗" button (red)
  - RECEIVED: Terminal state, shows "✓ Completed" badge
  - REJECTED: Terminal state, shows "✗ Rejected: [reason]" badge
- Status update uses API format: `shippingStatus: "IN_TRANSIT"` / `"RECEIVED"` / `"REJECTED"`
- For REJECTED, shows input field for rejection reason before submitting

**b) Spin-Lock Optimization**
- `statusUpdateLoading` state tracks which item's status button is loading
- When any shipping status action button is clicked:
  - Button freezes to disabled state
  - Shows RefreshCw animate-spin loader icon
  - Text changes to "Recalculating Logistical Asset Values & Shifting Intransit Batches..." (or "Recalculating..." for short button)
- When API returns, button state is restored

**c) logisticsSnapshot Rollback Protocol**
- Before each status transition API call, saves a snapshot of current data state
- If API call fails or times out, restores data from snapshot
- Prevents full-window blanking on errors

**d) Batch Number Field in Lines**
- Added optional "Batch No" text input field to each line item in create/edit form
- Initial line state includes `batchNumber: ""`
- Batch number included in line payload as `batchNumber: l.batchNumber || null`
- Shown in expanded row details

**e) Total Value Display**
- Shows `totalValue` in expanded row details (if available)
- Shows per-line `costPrice` and `totalCost` in expanded rows
- All values formatted with `Intl.NumberFormat("en-BD")`
- VAT Auditor sees "N/A (Audit Mode)" instead of values

**f) White-Label PDF Export**
- Replaced `exportToPDFSimple` with `exportToPDF` using `ExportColumnDef` interface
- Loads company profile from `/api/company-branding` for dynamic branding
- Includes `financialFooter` with Prepared By / Checked By / Authorized By + Printed By + ISO timestamp
- Column defs: Transfer No, From Godown, To Godown, Date, Status, Items, Qty, Value
- VAT masked columns: ["totalValue"]

**g) SUSPENDED Godown Indicator**
- When selecting godowns in form, if a godown has status "SUSPENDED", shows it as disabled with "(SUSPENDED)" label
- Shows a warning card if source or destination godown is SUSPENDED
- Create/Update button disabled when either godown is SUSPENDED
- In table rows, shows "(SUSPENDED)" badge next to suspended godown names

**h) Intl.NumberFormat for all financial figures**
- Uses `new Intl.NumberFormat("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })` for currency display
- Applied to totalValue, costPrice, totalCost in expanded rows

**Additional improvements:**
- Added 5 stat cards (Total, Pending, In-Transit, Received, Rejected)
- Admin-only delete with Tooltip for non-admin users
- Normalized status display (handles both "Pending"/"PENDING", "In-Transit"/"IN_TRANSIT" etc.)

#### 4. Created DamageLogsPage function (new, ~450 lines)

**a) Data Loading**
- GET from `/api/damage-logs`
- Includes product + godown relations in display

**b) Stats Cards (7 cards)**
- Total Damage Logs count
- Pending Approval count
- Total Loss Value (sum of totalLossValue)
- By Reason breakdown: BROKEN, EXPIRED, THEFT, MOISTURE counts

**c) Table with columns**
- Damage Code, Product Name, Godown, Quantity, Loss Cost Price, Total Loss Value, Reason (badge with color), Report Date, Status, Actions

**d) Create Dialog with fields**
- Product (select from products list)
- Godown (select from godowns list, show SUSPENDED status as disabled)
- Batch Number (optional text)
- Damage Quantity (number, must be > 0)
- Loss Cost Price (number, must be > 0)
- Reason (select: BROKEN, EXPIRED, THEFT, MOISTURE)
- Description (textarea, optional)
- Report Date (date input)

**e) Auto-calculate Total Loss Value = quantity * lossCostPrice**
- Displayed in summary card at bottom of form
- Shows calculation breakdown

**f) Spin-Lock on "Authorize Damage Write-Off" button**
- When clicked: disabled, RefreshCw animate-spin, text: "Recalculating Logistical Asset Values & Shifting Intransit Batches..."
- On success: toast + reload
- On failure: restore from logisticsSnapshot

**g) Flashing Pulsing Borders for Validation Errors**
- If damage quantity exceeds available stock (caught by 400 error from API), shows flashing red border animation on quantity input
- Uses `animate-pulse` class on red border: `className={quantityError ? "border-2 border-red-500 animate-pulse" : ""}`
- Shows error message below input

**h) Reason Badge Colors**
- BROKEN: orange
- EXPIRED: red
- THEFT: purple
- MOISTURE: blue

**i) White-Label PDF Export (same pattern as StockTransfersPage)**
- Uses `exportToPDF` with ColumnDef + company profile + financialFooter
- Column defs: Damage Code, Product, Godown, Quantity, Loss Cost Price, Total Loss Value, Reason, Report Date, Status
- VAT masked columns: ["lossCostPrice", "totalLossValue"]

**j) RBAC**
- Dealer: Access Restricted card (blocked entirely)
- SR: View-only (cannot create/edit/delete)
- VAT Auditor: lossCostPrice and totalLossValue masked to "N/A (Audit Mode)"

**k) Delete: Admin only with Tooltip for non-admin**
- Admin: normal delete button
- Non-admin: disabled delete button wrapped in Tooltip with "Only administrators can delete damage logs"

#### 5. Added Page Renderers (lines 6458-6459)
- `if (currentPage === "stock-transfers") return <StockTransfersPage />;`
- `if (currentPage === "damage-logs") return <DamageLogsPage />;`

#### 6. Added "damage-logs" to inventoryGroupKeys (line 6461)
- Added "damage-logs" to the Set for sidebar group membership

### Verification
- `bun run lint` passed with ZERO errors
- Dev server stable (HTTP 200, compiled successfully)
- All 24 feature checks passed
