# OperationsModulePage — Task Summary

## Task
Create `/home/z/my-project/src/components/OperationsModulePage.tsx` — a dedicated Operations Module page for VoltERP (Electronics Mart IMS v2.0).

## What was done
- Created the complete `OperationsModulePage.tsx` file (2452 lines)
- File contains 4 self-contained tab components:
  1. **SRTargetSetupTab** — Live performance dashboard with KPI cards (Total Targets, Total Target Amount, Avg Target, Total Achieved, Commission Projections), monthly/year/employee filters, color-coded achievement progress bars (Green ≥80%, Amber ≥50%, Red <50%), "View Performance" button opening monthly breakdown dialog
  2. **PaymentOptionsTab** — Channel config with status toggle (ACTIVE↔INACTIVE) using optimistic UI + snapshot rollback, INACTIVE warning banner, linked counts (Card Setups, Expenses, Sales, Cash Collections)
  3. **CardTypesTab** — Card classification with CRUD, Card Setups count, Active/Inactive badges
  4. **CardTypeSetupTab** — Fee matrix with effective rate calculation (chargePercentage + bankServiceCharge + customerConvFee), amber badge if >5%, green if ≤5%, rate bounds validation (0-10%)

## Key features implemented
- **Live Target Tracking**: Achievement % calculated from `/api/sr-performance`, commission projection, remaining amount
- **Status Toggles**: Power icon toggle for payment options with optimistic UI + snapshot rollback
- **Branded PDF Framework**: All tabs export PDF with company branding from `/api/company-branding`, financialFooter with signature blocks, systemNotice per module
- **Transactional CSV Core**: CSV import with XSS sanitization (script, javascript:, onerror=, etc.), field length validation, duplicate detection for SR targets, rate bounds validation for card type setup
- **Financial Benchmark Shields**: targetAmount > 0, minimumSalesQuota > 0, commissionPercentage ≥ 0
- **Card Fee Architecture**: BSC and Conv. Fee bounds 0-10%
- **VAT Audit Mode**: Masked columns for sensitive financial data
- **Auth**: localStorage-based with admin/manager mutation restriction
- **UI**: Dark navy header rows, blue accent, currency right-aligned, KPI cards with icon backgrounds, badges for status, loading spinners with contextual text, search bars with magnifying glass

## Integration
The component exports as default: `OperationsModulePage` with props `{ activeModule: string }`.
To integrate, update `ElectronicsMartApp.tsx`:
```tsx
import OperationsModulePage from "@/components/OperationsModulePage";
// Replace the basicModuleKeys handling for operations modules:
const opsKeys = new Set(["sr-targets", "payment-options", "card-types", "card-type-setup"]);
if (opsKeys.has(currentPage)) return <OperationsModulePage activeModule={currentPage} />;
```

## Status
✅ Complete — Lint passes, 2452 lines, all CRUD/validation/export/import implemented
