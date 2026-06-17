# Electronics Mart IMS — Version History

> **Product:** Electronics Mart Inventory Management System (VoltERP)
> **Current Version:** `v3.0.0`
> **Release Date:** 2025-01-18
> **License:** Proprietary

---

## Versioning Strategy (Semantic Versioning)

We follow [Semantic Versioning 2.0.0](https://semver.org/):

```
MAJOR.MINOR.PATCH  (e.g. 3.0.0)
  │     │     │
  │     │     └── Backward-compatible bug fixes
  │     └──────── New backward-compatible features
  └────────────── Breaking changes / major rewrites
```

| Bump Type | When to use | Example |
|-----------|-------------|---------|
| **PATCH** | Bug fixes, security patches, performance tweaks | `3.0.0 → 3.0.1` |
| **MINOR** | New features, new modules, UI enhancements | `3.0.0 → 3.1.0` |
| **MAJOR** | Breaking changes, database rewrites, architecture shifts | `3.0.0 → 4.0.0` |

---

## 🚀 v3.0.0 — "Stability & Branding Release" (2025-01-18)

### Major Changes
- **Company Branding System** — Full company name/address/logo/branding propagation across all module pages and PDFs
- **Feature Flag Framework** — Runtime toggle for all new features (no code redeploy needed)
- **Database Migration Tracking** — Versioned schema migrations with rollback support
- **Git Release Branch Strategy** — `release/v3.0` branch + tagged releases

### Bug Fixes (from v2.0)
- ✅ Fixed: Company Settings "Save Company Branding" button not working (PUT /api/company-branding)
- ✅ Fixed: CSV Import broken app-wide (raw fetch → apiFetch with auth + CSRF)
- ✅ Fixed: Auto PO payload mismatch (`lines` → `items`)
- ✅ Fixed: Missing `?import=true` on 5 CSV import paths
- ✅ Fixed: New Purchase Orders forced to "Draft" status regardless of dropdown
- ✅ Fixed: Sales Orders forced to "Draft" status + missing Status dropdown
- ✅ Fixed: Request thundering herd on /api/notifications (in-flight deduplication)
- ✅ Fixed: Missing CSRF token on POST requests (getCsrfToken + X-CSRF-Token header)
- ✅ Fixed: Stale accessToken closures (useRef pattern)
- ✅ Fixed: Non-blocking notification generation (try/catch)
- ✅ Fixed: Typo `/api/ordersheets` → `/api/order-sheets`

### New Features
- 🆕 Feature Flag system with environment + database + runtime toggle
- 🆕 Version badge in UI header
- 🆕 `/api/feature-flags` endpoint for runtime flag management
- 🆕 `FeatureFlagProvider` + `useFeatureFlag` hook for frontend
- 🆕 Version bump scripts (`bun run version:patch/minor/major`)
- 🆕 Release tag script (`bun run release:tag`)
- 🆕 Prisma migrations folder with version tracking

### Security Enhancements
- 🔒 CSRF token validation on all POST/PUT/DELETE
- 🔒 JWT-based authentication (transitional from X-User-Email header)
- 🔒 In-flight request deduplication (prevents connection saturation)
- 🔒 Rate limiting on auth endpoints
- 🔒 Security audit trail logging

### Workflow Verified (End-to-End)
1. Purchase 10 Sony Washing Machines @ Tk. 15,000 → Main Warehouse
2. Transfer 1 unit → Display Center
3. Sell 1 unit @ Tk. 16,500 → Customer
4. Generate PDF receipt with company logo → ✅ Verified

### Files Changed
- `package.json` — version 1.0.0 → 3.0.0, added version/release scripts
- `src/lib/feature-flags.ts` — NEW: feature flag system
- `src/lib/api-client.ts` — in-flight deduplication, CSRF, 401 retry
- `src/lib/export-utils.ts` — CSV import uses apiFetch
- `src/components/erp/layout/AppHeader.tsx` — useRef pattern, non-blocking notifications
- `src/components/InventoryGroupPage.tsx` — Auto PO payload fix
- `src/components/SystemSettingsGroupPage.tsx` — Company branding save
- `prisma/migrations/` — NEW: migration tracking
- `VERSION.md` — NEW: this changelog

---

## ✅ v2.0.0 — "Master Audit Baseline" (2025-01-15)

### Baseline Features (100+ module pages)
- **Investment Module:** Investment Heads, Investments, Assets, Liabilities
- **Core Config:** Companies, Categories, Colors, Brands, Units, Products, Bank/Vault Profiles
- **Structure:** Departments, Godowns, Segments, Capacities
- **Operations:** Designations, Employees, Employee Leave, Leave Allocations
- **CRM:** Customers, Suppliers
- **Inventory:** Order Sheet, Purchase Order, Auto PO, Sales Order, Hire Sales, Sales Return, Purchase Return, Replacement Order, Stock, Stock Details, Transfer, Opening Stock, Batch Master, Valuation
- **Account Management:** Expense/Income Heads, Expenses, Incomes, Cash Collections, Cash Deliveries, Bank Transactions
- **SMS Service:** SMS Inbox, Send SMS, SMS Bills, SMS Reports, SMS Service Settings, SMS Bill Payments, Bulk SMS
- **Accounting Reports:** Chart of Accounts & Ledger, Cash In Hand, Trial Balance, P&L, Balance Sheet & Period Close
- **Financial Audit:** Audit & Integrity, MIS Report, Basic/Purchase/Sales/Hire Sales/SR/Customer Wise Reports
- **Management Reports:** Management Report, Advance Search, Bank Report
- **System Settings:** Configuration, Company Settings, Invoice Templates, Number Formats, Audit Trail, Performance & Cache

### Tech Stack
- Next.js 16 (App Router) + TypeScript 5
- Prisma ORM + Turso (SQLite)
- Tailwind CSS 4 + shadcn/ui (New York)
- Zustand + TanStack Query
- Vercel deployment

---

## 📋 Upcoming — v3.1.0 (Planned)

- [ ] Password hashing migration (plaintext → bcrypt/argon2)
- [ ] JWT session tokens (replace X-User-Email header)
- [ ] httpOnly cookies (replace localStorage)
- [ ] Vercel Blob for photo/logo upload (BLOB_READ_WRITE_TOKEN)
- [ ] SMS auto-trigger on purchase/payment/godown receipt/employee joining
- [ ] PDF digit formatting (Bengali → English)
- [ ] Sidebar collapse/expand fix on PC
- [ ] Role-based access control (5 roles: Admin, Manager, SR, Dealer, VAT Auditor)

---

## 🔄 Rollback Procedure

If v3.0.0 causes issues in production:

```bash
# 1. Revert to v2.0.0 tag
git checkout v2.0.0

# 2. Reinstall dependencies
bun install

# 3. Revert database (if migration was applied)
bun run db:reset  # WARNING: This will erase data

# 4. Redeploy
vercel --prod
```

For feature-level rollback (safer):
```bash
# Disable specific feature via flag (no redeploy)
curl -X PUT /api/feature-flags \
  -H "Content-Type: application/json" \
  -d '{"flag":"new_dashboard","enabled":false}'
```

---

## 📞 Release Owners

| Role | Name | Responsibility |
|------|------|---------------|
| Product Owner | Amit Sharma | Release approval |
| Tech Lead | Z.ai Code | Code quality, architecture |
| QA | Agent Browser (automated) | Pre-release verification |

---

*This document is maintained alongside every release. Do not edit manually — use `bun run version:patch/minor/major` to bump versions.*
