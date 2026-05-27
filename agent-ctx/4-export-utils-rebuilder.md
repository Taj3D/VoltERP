# Task 4: Export Utils Rebuilder

## Task
Rebuild the shared document generation utility at `/src/lib/export-utils.ts` — fix broken Export PDF, validate CSV Import/Export pipelines, enhance VAT Auditor masking.

## Key Changes Made

### 1. jsPDF + autoTable v5 Integration
- `applyPlugin(jsPDF)` confirmed at module level
- Replaced `(doc as any).internal.getNumberOfPages?.()` with `doc.getNumberOfPages()` (proper jsPDF v4 API)
- `(doc as any).autoTable()` pattern works correctly after plugin registration

### 2. Enhanced PDF Engine
- Added `summaryRows` in PDFOptions (SummaryRow[] with custom styling)
- Added `customHeader` callback option for per-page custom drawing
- Two-pass Page X of Y: `{total}` placeholder then `fixPageXOfY()` writes correct total
- Refactored into shared `drawCorporateHeader()`, `drawFooter()`, `fixPageXOfY()` functions
- `calculateColumnWidths()` for column bounds tracking (minCellWidth/maxCellWidth)

### 3. CSV Export Fix
- UTF-8 BOM always injected
- `escapeCSVField(value, isNumeric)`: pure numeric values not quoted
- Properly escapes commas, double quotes, line breaks, ৳ (U+09F3)

### 4. CSV Import Fix
- `stripBOM()` strips UTF-8 BOM from first header
- Header-level validation: required columns checked before processing
- Batch commit: groups of 10 (configurable `batchSize`) for bulk insert
- Falls back to individual inserts if batch fails
- Row-level `fieldErrors` array in ImportResult
- Email/date format validation

### 5. VAT Auditor Masking
- `VAT_MASKED_COLUMNS` expanded from 12 to 29 entries
- "N/A (Audit Mode)" in both PDF and CSV output
- VAT masking checked with highest priority in `formatCellValue()`

### 6. Simple Export Overloads
- Both `exportToPDFSimple` and `exportToCSVSimple` use shared rendering functions

## Verification
- Lint: 0 errors, 0 warnings
- Dev server: Compiled successfully
