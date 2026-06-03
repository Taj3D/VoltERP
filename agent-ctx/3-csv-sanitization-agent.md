# Task ID: 3 — CSV Import Engine Sanitization Enhancement

## Agent: CSV Sanitization Agent

## Work Log

- Read `/home/z/my-project/worklog.md` for project context (VoltERP — Electronics Mart IMS)
- Read `/home/z/my-project/src/lib/export-utils.ts` (1230 lines) to understand the existing `importFromCSV` function
- Identified the row processing loop (lines 1009-1100) and the field type coercion logic (lines 1019-1065)

## Changes Made

### 1. Added `sanitizeCSVText` function (lines 918-931)
- Inserted BEFORE the `importFromCSV` function as specified
- Strips HTML tags (`<script>`, `<iframe>`, etc.) via regex
- Strips SQL injection patterns (`OR 1=1`, `--`, `; DROP`, `; DELETE`, `; UPDATE`, `; INSERT`, `UNION SELECT`, `; ALTER`)
- Strips JavaScript protocol handlers (`javascript:`)
- Strips event handler attributes (`onclick=`, `onerror=`, etc.)
- Returns trimmed result

### 2. Added Negative Value Guard (lines 1048-1062)
- Inserted after `record[field.key] = num;` inside the number type coercion block
- Checks if the numeric value is negative (`record[field.key] < 0`)
- Uses regex `/quantity|days|allocated|count|stock|amount|balance|limit|price|rate|total|qty/i` to identify quantity/count fields
- If negative value found on a quantity field:
  - Increments `failed++`
  - Pushes descriptive error to `errors[]` array: `Row N: Negative value not allowed for "Field Label" (-X). Row dropped.`
  - Pushes detailed field error to `fieldErrors[]` array with message: `Negative value (-X) rejected by input sanitization rules`
  - Sets `rowHasError = true`
  - Breaks out of the field loop (stops processing this row)

### 3. Added Text Sanitizer Application (lines 1094-1105)
- Replaced the catch-all `else` block with specific handling for `text` and `textarea` field types
- Applies `sanitizeCSVText(value)` to the raw value
- If sanitization changed the value, logs a field error: `Input sanitized: potentially dangerous content removed`
- Other field types (select, password, image, etc.) still fall through to `record[field.key] = value`

## Verification
- `bun run lint` passed with ZERO errors
- Dev server stable (HTTP 200 confirmed from dev.log)
- All existing functionality preserved (no changes to PDF export, CSV export, batch insert, or other import validation)

## Summary
- 1 file modified: `/home/z/my-project/src/lib/export-utils.ts`
- 3 changes: sanitizeCSVText function, negative value guard, text sanitizer application
- Zero lint errors, dev server stable
