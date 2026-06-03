# Task: Enhanced Purchase Order and Auto-PO Sections Rewrite

## Summary
Successfully rewrote the Purchase Order and Auto-PO sections in `/home/z/my-project/src/components/InventoryGroupPage.tsx` with enhanced API capabilities.

## Changes Made

### 1. Icon Imports (line 8-10)
- Added `Inbox` and `CheckSquare` to lucide-react imports

### 2. Purchase Order State Variables (lines 300-316)
- Replaced existing PO state with enhanced versions
- Added `poReceiveDialog`, `poReceiveForm`, `poReceiveSaving` for receiving functionality
- Added `poViewDetail` for expanded line item view dialog
- Added `poExpandedRows` (Set<string>) for expandable PO rows
- Added `poStatusFilter` and `poReceivingFilter` for filter dropdowns
- Changed default PO status from "Pending" to "Draft"
- Added `expectedDate` field to poForm

### 3. Auto-PO State Variables (lines 318-327)
- Added `autoPoSummary` for the summary object from API
- Added `autoPoGroupedBySupplier` for grouped data
- Added `autoPoUrgencyFilter` and `autoPoSupplierFilter` for filter dropdowns

### 4. loadAutoPo Function (lines 443-463)
- Enhanced to send `supplierId` and `urgency` query params
- Now handles API response with `{ items, summary, groupedBySupplier }` structure
- Falls back to flat array for backward compatibility

### 5. Purchase Order Section (lines 1874-2367)
- Added `RECEIVING_BADGE` color map for Unreceived/Partially Received/Fully Received
- Enhanced `poColumns` with `receivingStatus` and `fulfillmentStatus` columns
- `poFiltered` now applies status and receiving filters in addition to search
- `poStats` enhanced with fulfillment stats (pending, partial, fulfilled)
- `openPoCreate` uses Draft status and includes expectedDate
- `openPoEdit` populates receivedQuantity/pendingQuantity from lines
- `savePo` sends discountPercent instead of discount amount, uses vatPercentage, includes referenceKey for idempotency, defaults to "Draft" on creation
- Added `openPoReceive` - validates PO status, builds receivedItems from lines
- Added `savePoReceive` - calls /api/purchase-orders/receive with per-line quantities
- Added `doExportPOCorporatePDF` - exports with company branding, systemNotice, financialFooter
- Added `togglePoExpand` for expandable rows
- `renderPurchaseOrder` enhanced with:
  - 6 stat cards (Total, Pending/Draft, Fulfilled, Partial, Completed, Total Value)
  - Status and receiving filter dropdowns in toolbar
  - Expandable rows showing line items with received/pending quantities
  - Receiving status badges (Unreceived/Partially Received/Fully Received)
  - Fulfillment status badges (Pending/Partial/Fulfilled)
  - "Receive" button for Confirmed/Partially Received POs
  - "View Detail" button opening PO detail dialog
  - PO Create/Edit dialog with expectedDate and Notes fields
  - PO Receive dialog with per-line quantity input
  - PO Detail View dialog showing all line items with stock status
  - Corporate PDF export and CSV export

### 6. Auto-PO Section (lines 2374-2613)
- Added `URGENCY_BADGE` color map for critical/low/normal
- Enhanced `autoPoColumns` with urgency, supplierName, brand, godown columns
- `autoPoFiltered` includes supplier name search
- `autoPoStats` uses autoPoSummary if available, falls back to computed stats
- `generateAutoPo` groups selected items by supplier, creates separate POs per supplier via POST /api/auto-po
- `renderAutoPo` enhanced with:
  - 5 stat cards (Critical, Low Stock, Normal, Total Suggestions, Est. Cost)
  - Urgency filter dropdown (All, Critical, Low, Normal)
  - Supplier filter dropdown
  - Formula explanation card with urgency definitions
  - Supplier Grouped View table (when data available)
  - Select-all checkbox in table header
  - Urgency badges per row (Critical=red, Low=amber, Normal=blue)
  - Row highlighting for critical/low urgency
  - "Generate PO by Supplier" button
  - Enhanced CSV/PDF export with supplier/brand/godown data

## Verification
- ESLint: Passed with no errors
- Dev server: Running without compilation errors
