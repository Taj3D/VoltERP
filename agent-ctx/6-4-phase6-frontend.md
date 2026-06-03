# Task 6-4: Phase 6 Frontend — BasicModulesGroupPage Structural Hierarchy Enhancement

## Agent: Phase 6 Frontend Agent
## Status: COMPLETE

### Work Log:

- Read existing BasicModulesGroupPage.tsx (1056 lines)
- Read worklog.md for prior context (Tasks 1-10, multiple API and frontend rewrites)
- Read export-utils.ts for FieldDef/ColumnDef/CompanyProfile type definitions

### Changes Made to `/home/z/my-project/src/components/BasicModulesGroupPage.tsx`:

#### 1. MODULE_CONFIGS Updated for 4 Structural Modules:

**Departments** — Added `code` column at start of columns array

**Godowns** — Added new columns: `code`, `phone`, `status`, `capacityValue`, `capacityUnit`; Added new form fields: `phone` (required), `status` (select with ACTIVE/SUSPENDED options), `capacityValue` (number, step 0.01), `capacityUnit` (select with m³/sqft/units/kg/tons options), `address` now required

**Segments** — Added `code` column at start of columns array

**Capacities** — Added new columns: `code`, `capacityValue`, `capacityUnit`; Added new form fields: `capacityValue` (number, required, step 0.01), `capacityUnit` (select, required, with m³/sqft/units/kg/tons options)

#### 2. New States Added to ModuleTab:
- `structuralSnapshot` — `useState<any[] | null>(null)` for optimistic UI rollback
- `capacityError` — `useState(false)` for capacity validation red highlight

#### 3. sanitizeInput Helper Added:
```typescript
const sanitizeInput = (input: string): string => {
  return input.replace(/<[^>]*>/g, '').replace(/\r\n/g, '\n').replace(/  +/g, ' ').trim();
};
```
Applied in `handleSave` — all string fields sanitized before API payload

#### 4. handleSave Updated:
- **Capacity validation**: For `capacities` module, validates `capacityValue > 0`; same for `godowns` module. Shows destructive toast and sets `capacityError` state on failure
- **XSS sanitization**: All string formData values run through `sanitizeInput` before sending
- **Snapshot storage**: `setStructuralSnapshot([...data])` before each save operation
- **Rollback on failure**: On network errors (Failed to fetch, NetworkError, Network request failed), rolls back to `structuralSnapshot` and shows 8-second destructive toast "Connection Lost — Rolled back to pre-save state"

#### 5. Spin-Lock Text for Structural Modules:
- `godowns`: "Compiling Spatial Matrix & Initializing Volumetric Warehouses..."
- `departments`: "Saving Department Structure..."
- `segments`: "Validating Segment Matrix..."
- `capacities`: "Validating Capacity Specifications..."
- Other modules preserved: catalog collision text for categories/colors/brands/units, bank text for banks, generic "Saving..." for rest

#### 6. Suspended Godown Warning Banner:
When any godown has `status === "SUSPENDED"`, a red warning banner renders above the table:
```
EMERGENCY CLOSURE: N warehouse(s) suspended — all stock transfers and receipt orders are blocked
```
With AlertTriangle icon, red background/border

#### 7. Emergency Closure Toggle for Godowns:
- Added `handleEmergencyClosureToggle` function that toggles `status` between "SUSPENDED" and "ACTIVE"
- Uses same snapshot/rollback pattern as handleSave
- Shows contextual toast (destructive for suspension, default for reactivation)
- Added Power icon button in actions column for godowns
- Suspended rows get subtle red background highlight

#### 8. Godown Status Column Special Rendering:
- `SUSPENDED` → Red badge with AlertTriangle icon + "SUSPENDED" text
- `ACTIVE` → Green badge with "ACTIVE" text

#### 9. Capacity Field Red Highlight:
- When `capacityError` is true, the capacityValue Input gets `border-red-500 focus:border-red-500 focus:ring-red-500` classes
- Inline error message below the field: "Capacity value must be greater than zero"
- Error clears when user types in the field or changes capacityUnit

#### 10. White-Label PDF Footer Sync:
- Structural modules (departments, godowns, segments, capacities) now use `authState.user?.displayName || userRole` for `preparedBy` and `printedBy` in financialFooter
- Company profile pulled from `/api/company-branding` with Base64 logo and corporate name

#### 11. Import Addition:
- Added `Power` icon from lucide-react for Emergency Closure toggle button

### Verification:
- `bun run lint` passed with zero errors
- Dev server stable (HTTP 200, compiled successfully)
- All 8 Phase 6 requirements fully implemented
- Existing module functionality preserved (companies, categories, colors, brands, units, banks, sr-targets, payment-options, card-types, card-type-setup)
