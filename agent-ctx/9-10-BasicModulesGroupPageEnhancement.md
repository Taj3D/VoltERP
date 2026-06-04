# Task 9-10: BasicModulesGroupPage Enhancement Agent

## Summary
Added Products tab to BasicModulesGroupPage and enhanced Colors module with color preview swatches.

## Changes Made

### File: `src/components/BasicModulesGroupPage.tsx`

1. **Import**: Added `Package` to lucide-react imports
2. **MODULE_CONFIGS**: Added "products" entry (key, label, icon, apiPath, category, 12 columns, 19 formFields, vatMaskedColumns)
3. **loadOptions**: Added 5 new select field mappings (categoryId, brandId, colorId, godownId, segmentId)
4. **handleSave**: Added product pricing validation (costPrice > 0, salePrice > 0, costPrice < salePrice)
5. **getSpinLockText**: Added "Validating Product Catalog & SKU Matrix..." for products
6. **renderFormField**: Added colorCode special case with hex input + color picker + preview swatch
7. **Table body**: Updated colorCode column rendering with square swatch + monospace hex text

## Lint Result
`bun run lint` — PASSED with zero errors
