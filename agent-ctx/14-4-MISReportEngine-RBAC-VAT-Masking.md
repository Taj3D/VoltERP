# Task 14-4: MIS Report Engine — Refined RBAC & Enhanced VAT Masking

## Agent
MIS Report Engine RBAC & VAT Masking Agent

## Task
Update MISReportEngine.tsx with refined RBAC for SR role, enhanced VAT auditor masking, PDF printedBy, and empty cell display.

## Changes Made

### 1. SR_ALLOWED_TABS Constant
- Added `SR_ALLOWED_TABS: ReportCategoryKey[] = ["sales", "hire-sales", "customer-wise", "sr"]`
- Located after ReportCategoryKey type definition

### 2. RBAC Refinement
- Replaced blanket `if (isSR || isDealer)` 403 with separate logic
- Dealer: `if (isDealer)` → full 403 page (unchanged)
- SR: Now sees all tabs, but 5 are disabled (basic, purchase, management, bank, advance-search)
- Added `hasTabAccess` useMemo, `isTabDisabled` useCallback, `handleTabClick` useCallback
- All hooks placed before early returns to satisfy React hooks rules

### 3. SR Tab Visibility
- Disabled tabs: `opacity-50 cursor-not-allowed` + `disabled` prop on TabsTrigger
- onValueChange intercepts tab changes for disabled tabs
- Toast: "Access denied. Sales Representatives can only access Sales and Customer reports."
- SR badge in header: "SR — Limited Access"

### 4. SR Per-Tab 403 Message
- When SR accesses blocked tab, 403 card shown with specific allowed tabs listed
- Report results and empty state gated by `hasTabAccess`

### 5. Enhanced VAT Auditor Masking (Table Cells)
- Changed from selective masking (cost/margin/profit/internal) to ALL currency columns
- `const isMasked = isVatAuditor && ct === "currency"`

### 6. Enhanced VAT Auditor Masking (Charts)
- Chart-level note: "Chart values masked in Audit Mode" with Eye icon
- Chart data zeroed for VAT auditor rendering (keeps labels)
- Tooltip shows "N/A (Audit Mode)"

### 7. Enhanced VAT Auditor Masking (Grand Total)
- All financial columns masked for VAT auditor in grand total row
- Amber italic text on dark header

### 8. PDF printedBy
- `printedBy: user?.displayName || user?.name` added to exportToPDF options

### 9. Empty Cell Display
- `fmt()` now checks `v === ""` → returns "—"
- Table cell text also checks null/undefined/empty string → "—"

## Verification
- `npx eslint src/components/MISReportEngine.tsx` — zero errors
- Dev server compiles clean (HTTP 200)
- React hooks order satisfied
