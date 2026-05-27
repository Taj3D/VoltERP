# Task 3: SystemSettingsGroupPage — GROUP 6

**Status**: COMPLETED

## Deliverable
- File: `/home/z/my-project/src/components/SystemSettingsGroupPage.tsx`
- Lines: 1,579
- Lint: 0 errors

## Component Structure
- 4 tabs: Company Settings, Invoice Templates, Number Formats, Performance & Caching
- Full RBAC (SR/Dealer → 403, VAT Auditor → view-only with masking)
- Centralized export utilities (exportToPDF, exportToCSV, importFromCSV)
- apiFetch with X-User-Email header and 401 auto-logout
- Deep Navy Blue theme, dark mode support
- Invoice template editor with live iframe preview
- Number format inline editing with preview column
- Performance tab with DB stats, integrity check, cache management
