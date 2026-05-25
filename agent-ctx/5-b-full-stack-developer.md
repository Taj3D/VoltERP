# Task 5-b: Add new features and pages

## Agent: full-stack-developer
## Status: COMPLETED

## Changes Made

### 1. User Profile Page
- Added `"user-profile"` to PageKey type
- Added User Profile navigation item to Management sidebar section
- Created `UserProfilePage` component (~230 lines) with:
  - User avatar with initials in gradient circle
  - Name, email, role display
  - Change password form (UI with validation)
  - Theme selector (Light/Dark/System) using next-themes
  - Language selector (English/বাংলা) with localStorage
  - Session info display (browser/OS detection)
- Added route in renderPage function

### 2. GenericModulePage Import Enhancement
- Added `handleDownloadTemplate` function for CSV template generation
- Added `handleImportFile` function (refactored from direct import)
- Changed onImport to open import dialog (`setImportOpen(true)`)
- Added import Dialog with:
  - Step-by-step instructions
  - Download Template button
  - Upload CSV File button
  - Column headers display

### 3. Dashboard API Enhancement
- `/api/dashboard/route.ts` now returns:
  - `recentActivities`: last 10 from POs, SOs, stock entries (sorted by date)
  - `topSellingProducts`: top 5 by quantity from SalesOrderLines
  - `monthlySalesData`: last 6 months from sales/purchase orders
- DashboardPage updated to use real API data with fallbacks

### 4. ProductsPage Enhancement
- Added `categoryFilter` and `stockFilter` state
- Category filter dropdown with product counts per category
- Stock status filter (All/In Stock/Low Stock/Out of Stock)
- Color-coded stock values (red=0, amber<=reorder, normal)
- Category-colored product code icons
- Filter summary and clear filters button

### 5. StockDetailsPage Enhancement
- Added `entryTypeFilter` and `allStockEntries` state
- Summary cards: Total IN (green), Total OUT (red), Total TRANSFER (blue)
- Entry type filter dropdown
- Enhanced visual indicators:
  - IN: green row bg + green badge + ArrowDownRight icon
  - OUT: red row bg + red badge + ArrowUpRight icon
  - TRANSFER: blue row bg + blue badge + ArrowRightLeft icon
- Clear filters button

### 6. Bug Fixes
- Fixed `/api/stock-entries/route.ts`: removed invalid `godown` include (no relation defined in schema), fixed `code` to `productCode`

## Verification
- Lint: 0 errors
- All APIs returning 200
- Dev server running without errors
