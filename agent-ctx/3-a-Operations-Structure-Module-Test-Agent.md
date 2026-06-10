# Task 3-a: Operations + Structure Module Testing

## Agent: Operations+Structure Module Test Agent

## Summary
Tested and fixed module pages for Interest % Engine, Segment, Capacity, SR Target, Payment Option, CardType, and CardType Setup.

## Bugs Found & Fixed

### 1. SR Target Form - Numeric Field Display Bug (OperationsModulePage.tsx)
- **Bug**: `String(formData.commissionPercentage || "")` used `||` which treats `0` as falsy, causing commissionPercentage=0 to display as blank
- **Fix**: Changed to `String(formData.commissionPercentage ?? "")` using nullish coalescing
- **Lines affected**: 862, 867, 871, 875

### 2. SR Target Form - Decimal Point Input Bug (OperationsModulePage.tsx)
- **Bug**: onChange handlers used `Number(e.target.value)` which lost decimal point during input (typing "10." immediately became "10")
- **Fix**: Changed to store raw string values `e.target.value` and convert to Number only in handleSave (matching InterestPercentageEnginePage pattern)
- **Lines affected**: 862, 867, 871, 875

### 3. CardTypeSetup Dropdown - Inactive Channels Shown (OperationsModulePage.tsx)
- **Bug**: `apiFetch("/api/payment-options")` loaded ALL payment options including INACTIVE channels in the CardTypeSetup dropdown
- **Fix**: Changed to `apiFetch("/api/payment-options?activeOnly=true")` to only show ACTIVE channels
- **Line affected**: 1809

## Verification Results

### API Routes - All Exist and Match
- `/api/interest-percentages` + `[id]` + `amortization` ✓
- `/api/segments` + `[id]` ✓
- `/api/capacities` + `[id]` ✓
- `/api/sr-targets` + `[id]` ✓
- `/api/payment-options` + `[id]` ✓
- `/api/card-types` + `[id]` ✓
- `/api/card-type-setup` + `[id]` ✓

### Currency Formatting - All Use "Tk."
- InterestPercentageEnginePage: `fmtCurrency()` → "Tk. X,XXX.XX" ✓
- StructureModulePage: `fmt(v, "currency")` → "Tk. X,XXX.XX" ✓
- OperationsModulePage: `fmtCurrency()` → "Tk. X,XXX.XX" ✓

### PDF/CSV/Import Buttons - All Present
- Interest % Engine: CSV, PDF, Import ✓
- Segment: CSV, PDF, Import ✓
- Capacity: CSV, PDF, Import ✓
- SR Target: CSV, PDF, Import ✓
- Payment Option: CSV, PDF, Import ✓
- Card Type: CSV, PDF, Import ✓
- Card Type Setup: CSV, PDF, Import ✓

### Lint: Passed with no errors
