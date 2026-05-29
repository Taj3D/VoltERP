# Task 13-7: Stage 13 Frontend UI - Audit & Integrity Sub-Modules

## Summary
Updated 2 files (FinancialAuditGroupPage.tsx + ElectronicsMartApp.tsx) with complete Stage 13 frontend requirements for all 5 Audit & Integrity sub-modules.

## Files Modified

### 1. `/home/z/my-project/src/components/FinancialAuditGroupPage.tsx`
- Replaced `toLocaleString("en-BD")` with `Intl.NumberFormat("en-BD")` via `bdCurrencyFmt`
- Added `AUDIT_MASK` constant for consistent VAT Auditor masking
- Full VAT masking on ALL KPI monetary values (not just some)
- Ledger Auto-Post: admin-only buttons with Tooltip, "Posted By" column, VAT masked amounts
- Inventory Aging: SR/Dealer Access Restricted, VAT masking for monetary values
- Product Lifecycle: SR/Dealer Access Restricted, Cost/Sale Price columns, VAT masking
- Notifications & Integrity: SR/Dealer Access Restricted, admin-only Generate/Dismiss, Mark All Read, count badge, message masking
- Corporate PDF Footer on all exports (financialFooter with preparedBy/checkedBy/authorizedBy/printedBy)
- CompanyProfile loaded from /api/company-branding

### 2. `/home/z/my-project/src/components/ElectronicsMartApp.tsx`
- `bdCurrencyFmt = new Intl.NumberFormat("en-BD")` for global fmt function
- Dashboard KPI: VAT masking for ALL monetary values (not hiding cards)
- VAT Auditor Badge banner in DashboardPage
- Installment amounts masked for VAT Auditor
- ITEM_ACCESS_DENIED: Added "inventory-aging" and "product-lifecycle" for SR and Dealer

## RBAC Summary
| Role | Dashboard KPI | Ledger Auto-Post | Inventory Aging | Product Lifecycle | Notifications |
|------|--------------|-----------------|----------------|-------------------|--------------|
| Admin | Full | Full + All Actions | Full | Full | Full + All Actions |
| Manager | Full | View Only | Full | Full | Generate Only |
| SR | Access Restricted | Access Restricted | Access Restricted | Access Restricted | Access Restricted |
| Dealer | Access Restricted | Access Restricted | Access Restricted | Access Restricted | Access Restricted |
| VAT Auditor | All Masked | Amounts Masked | Values Masked | Prices Masked | Messages Masked |

## Verification
- `bun run lint` passed with ZERO errors
- Dev server compiling successfully
