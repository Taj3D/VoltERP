# Task 3-4: Asset Module Frontend - Asset Ledger Interface

## Agent: full-stack-developer

## Summary
Rebuilt the InvestmentGroupPage.tsx component to implement the Asset Module audit with:
1. New "Asset Ledger" tab with combined tracking matrix, charts, and export
2. Ledger Sync indicators on Fixed Asset and Current Asset tables
3. assetSubCategory and locationTag support across forms, tables, exports, imports
4. Enhanced CSV import validation for negative monetary values
5. API backend support for new fields

## Key Changes

### InvestmentGroupPage.tsx (Frontend)
- Added Recharts imports and new Lucide icons
- Added `ledgerSyncStatus` state + loader (fetches from `/api/ledger-auto-post?sourceType=Asset`)
- Added Asset Ledger filter states
- New Asset Ledger tab with IIFE rendering: summary cards, filter bar, combined table, Recharts BarChart, PDF/CSV export
- Fixed Asset table: added Sub-Category, Location, Ledger Status columns
- Current Asset table: added Sub-Category, Location, Ledger Status columns
- Fixed Asset form: added assetSubCategory Select + locationTag Input
- Current Asset form: added assetSubCategory Select + locationTag Input
- Export columns and import fields updated with new fields
- Enhanced handleImportCSV with negative monetary value validation

### API Backend
- `/api/assets/route.ts`: Added assetSubCategory and locationTag to createSingleAsset
- `/api/assets/[id]/route.ts`: Added assetSubCategory and locationTag to PUT handler

## Lint Status: Clean
## Dev Server: Running on port 3000
