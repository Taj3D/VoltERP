# Task 7b — API Fix Agent

## Task: Fix bugs in Purchase Order API routes

## Bugs Fixed

### Bug 1: Replace weak local stripHtml with shared version
- **File**: `src/app/api/purchase-orders/route.ts`
- Removed local `stripHtml` function (lines 16-18) that only did `input.replace(/<[^>]*>/g, '').trim()`
- Added `stripHtml` to import from `@/lib/api-security`
- The shared version also strips script/style tags, HTML entities, javascript: URLs, on* event handlers

### Bug 2: Sanitize notes in PUT handler
- **File**: `src/app/api/purchase-orders/[id]/route.ts`
- Changed `if (notes !== undefined) updateData.notes = notes;` to `if (notes !== undefined) updateData.notes = stripHtml(String(notes));`
- Added `stripHtml` to import from `@/lib/api-security`

### Bug 3: Remove forced receivedQuantity override on "Received" status
- **File**: `src/app/api/purchase-orders/[id]/route.ts`
- Removed the `computedLines = computedLines.map(...)` block that forced all line `receivedQuantity = quantity` and `pendingQuantity = 0`
- Replaced with comment explaining that line-level receivedQuantity should only be updated through the dedicated `/api/purchase-orders/receive` endpoint
- PO-level status fields (fulfillmentStatus, receivingStatus) are still updated correctly

### Bug 4: Add missing stripHtml import
- Covered by Bug 2 — `stripHtml` was added to the import from `@/lib/api-security`

## TypeScript Check
- No new errors introduced by these changes
- Pre-existing errors in purchase-orders files (receive/route.ts:272, route.ts:818) are unrelated
