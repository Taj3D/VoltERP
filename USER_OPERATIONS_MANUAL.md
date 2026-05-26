# VoltERP — Electronics Mart IMS
## Complete User Operations Manual
### Version 2.0 | Production Release

---

> **Developed & Copyright by NextGen Digital Studio**

---

# TABLE OF CONTENTS

1. [System Overview & Login](#1-system-overview--login)
2. [Investment & Liquidity Sector](#2-investment--liquidity-sector)
3. [Basic Foundation Modules](#3-basic-foundation-modules)
4. [Staff & CRM Ecosystem](#4-staff--crm-ecosystem)
5. [Logistical Inventory Management Pipelines](#5-logistical-inventory-management-pipelines)
6. [Financial Accounting, SMS & Reporting Infrastructure](#6-financial-accounting-sms--reporting-infrastructure)
7. [Universal Background Systems Reference](#7-universal-background-systems-reference)
8. [Quick Reference: Keyboard Shortcuts & Navigation](#8-quick-reference-keyboard-shortcuts--navigation)

---

# 1. SYSTEM OVERVIEW & LOGIN

## 1.1 What is VoltERP?

VoltERP is a full-featured Inventory Management System designed for Electronics Mart businesses. It manages everything from procurement to sales, from staff payroll to financial accounting, and from warehouse logistics to VAT-compliant reporting — all within a single web application.

The system is organized into **80+ module pages** grouped under **10 sidebar navigation sections**. Each page provides a data table grid, creation/edit forms, and a Triple Utility Bundle (Import CSV, Export CSV, Export PDF).

## 1.2 How to Log In

1. Open the application in your browser.
2. You will see the **Sign In** screen with a Deep Navy Blue gradient background and the Electronics Mart logo.
3. **Step 1:** Click the **"Login As"** dropdown and select your role:
   - **Admin** (emart.amit) — Full system access
   - **Manager** (emart.manager) — Operations & reporting access, no system settings
   - **SR** (Sales Representative) (emart.sr) — Sales & customer-facing access only
   - **Dealer** (emart.dealer) — View-only product & order access
   - **VAT Auditor** (emart.vat) — Read-only financial & VAT reporting access
4. **Step 2:** The username field will auto-fill based on the role you selected.
5. **Step 3:** Type your password in the password field.
6. **Step 4:** Click **"Sign In"**.
7. If credentials are valid, you will enter the main dashboard. If not, a red error banner will appear.

## 1.3 Role-Based Access at a Glance

| Role | Can Create/Edit | Can Delete | Can View Financials | Can System Settings | Scope |
|------|----------------|------------|---------------------|---------------------|-------|
| **Admin** | ✅ Everything | ✅ Everything | ✅ Full | ✅ Full | Unrestricted |
| **Manager** | ✅ Operations only | ✅ Operations only | ✅ Full | ❌ Blocked | No system config/audit |
| **SR** | ✅ Sales, Customers, SMS | ❌ No deletions in financial | ❌ Blocked | ❌ Blocked | Sales floor only |
| **Dealer** | ❌ Read-only | ❌ Blocked | ❌ Blocked | ❌ Blocked | Product browsing only |
| **VAT Auditor** | ❌ Read-only everywhere | ❌ Blocked | ✅ Masked values | ✅ Read-only | Audit & VAT compliance |

## 1.4 Theme Toggle (Day/Night Mode)

- At the top-right of the header bar, you will find a **Sun/Moon icon**.
- Click the **Moon icon** to switch to Dark Mode (Deep Navy Blue background).
- Click the **Sun icon** to switch to Light Mode (clean white background).
- Your preference is saved automatically for future sessions.

## 1.5 Global Search (⌘K / Ctrl+K)

- Press **⌘K** (Mac) or **Ctrl+K** (Windows/Linux) anywhere in the application.
- A search dialog will appear with a text input.
- Type any module name, page name, or keyword (e.g., "purchase", "ledger", "customer").
- Results are filtered by your role — you will only see pages you have access to.
- Click a result to navigate directly to that page.
- Press **Escape** to close the dialog.

## 1.6 Notification Bell

- The **Bell icon** in the header shows system notifications.
- Notification types include: Low Stock alerts, Overdue Installments, Balance Mismatches, Period Close warnings, Data Integrity issues.
- Click the bell to view all notifications. Unread notifications are highlighted.
- Dismiss individual notifications by clicking the **X** button.

---

# 2. INVESTMENT & LIQUIDITY SECTOR

> **Sidebar Group:** Investment
> **Navigation Path:** Sidebar → Investment → [Sub-pages]
> **RBAC Access:** Admin ✅ | Manager ✅ | SR ❌ | Dealer ❌ | VAT Auditor ❌ (SR and Dealer are completely blocked from this group)

---

## 2.1 Investment Heads

### Purpose
Investment Heads are the **ledger category accounts** that group all your business's financial assets and liabilities. Think of them as the top-level folders in your accounting filing cabinet.

### How to Navigate
1. Click **Investment** in the sidebar.
2. Click **Investment Heads**.

### What You See
A data table listing all investment head records with columns:
- **Code** — The auto-generated unique identifier (format: `INVH-00001`, `INVH-00002`, etc.)
- **Name** — The display name of the head (e.g., "Office Building", "Bank FDR", "Supplier Loan")
- **Description** — Optional notes about this head
- **Type** — The classification dropdown with options: **Fixed Asset**, **Current Asset**, **Liability**, **PF** (Provident Fund), **FDR** (Fixed Deposit Receipt), **Security**
- **Opening Balance** — The starting balance amount in ৳
- **Opening Type** — Either **Dr** (Debit — money owed TO the business) or **Cr** (Credit — money owed BY the business)
- **Status** — Active or Inactive

### How to Create a New Investment Head
1. Click the **"+ Add New"** button at the top-right of the table.
2. A dialog form opens with the following fields:
   - **Name** (required) — Type the head name (e.g., "Main Office Building")
   - **Description** (optional) — Add any notes
   - **Type** (required) — Select from the dropdown:
     - `Fixed Asset` — Long-term assets like buildings, machinery
     - `Current Asset` — Short-term liquid resources like cash, inventory
     - `Liability` — Debts owed by the business
     - `PF` — Provident Fund contributions
     - `FDR` — Fixed Deposit Receipts in banks
     - `Security` — Security deposits made or received
   - **Opening Balance** — Enter the starting balance amount
   - **Opening Type** — Select `Dr` or `Cr`
   - **Active** checkbox — Checked by default
3. The **Code** field is **auto-generated** by the system (e.g., `INVH-00001`). You do NOT type this manually.
4. Click **Save** to create the record.

### How to Edit
1. Click the **pencil icon** (Edit) on any row.
2. The same form opens, pre-filled with the existing values.
3. Modify any field and click **Save**.

### How to Delete
1. Click the **trash icon** (Delete) on any row.
2. A confirmation dialog appears. Click **Confirm** to permanently delete.
3. ⚠️ **Period Close Check:** If the investment head has transactions in a locked month, deletion will be blocked with a 403 error.

### Triple Utility Bundle
- **Export PDF:** Click the PDF icon to generate a Landscape A4 PDF with corporate header (Navy Blue bar, "VoltERP — Electronics Mart IMS" title), alternating row colors, and Page X of Y footer.
- **Export CSV:** Click the CSV icon to download a UTF-8 BOM encoded CSV file. The ৳ symbol is preserved in Excel.
- **Import CSV:** Click the Upload icon to import investment heads from a CSV file. The system will:
  1. Show a file picker dialog.
  2. Parse the CSV with PapaParse (handles quoted fields, commas inside values).
  3. Validate each row against the schema (required fields, type coercion).
  4. Show row-by-row error messages for any failed imports.
  5. Insert valid rows one at a time via the API.

### ⚠️ Background Systems
- **RBAC:** Only Admin and Manager can access this page. SR, Dealer, and VAT Auditor receive a 403 Forbidden error.
- **Auto-Code:** The `code` field (INVH-XXXXX) is generated server-side and is read-only.
- **Period Close:** Creating/editing/deleting is blocked if the transaction date falls in a locked month.

---

## 2.2 Investment (General Investment Register)

### Purpose
This page registers **individual investment transactions** — each entry records a specific financial event linked to an Investment Head. For example, if "Office Building" is an Investment Head of type "Fixed Asset", then purchasing a new AC unit for that building would be an Investment entry here.

### How to Navigate
1. Click **Investment** → **Investment**.

### What You See
A table of all investment entries with:
- **Code** — Auto-generated (format: `INV-00001`)
- **Investment Head** — The parent ledger head (dropdown lookup from Investment Heads)
- **Date** — Transaction date
- **Amount** — The monetary value in ৳
- **Asset Category** — `Fixed` or `Current`
- **Description** — Optional notes
- **Status** — Active/Inactive

### How to Create
1. Click **"+ Add New"**.
2. Fill in the form:
   - **Investment Head** (required) — Select from the dropdown (populated from Investment Heads API)
   - **Date** (required) — Pick the transaction date
   - **Amount** (required) — Enter the monetary amount
   - **Asset Category** — Select `Fixed` (depreciable long-term) or `Current` (liquid/short-term)
   - **Description** — Free-text notes
   - **Active** — Checkbox (default: checked)
3. Click **Save**.

### ⚠️ Background Systems
- **RBAC:** Admin & Manager only. SR/Dealer/VAT Auditor blocked.
- **Auto-Code:** `INV-00001` format, server-generated, read-only.
- **Period Close:** Blocked in locked months.
- **VAT Auditor:** If a VAT Auditor somehow reaches this page, all amount/cost fields display "N/A (Audit Mode)".

---

## 2.3 Fixed Asset

### Purpose
Register and track **depreciable long-term business properties** — buildings, machinery, vehicles, office equipment. Each fixed asset is linked to an Investment Head of type "Fixed Asset".

### How to Navigate
1. Click **Investment** → **Fixed Asset**.

### What You See
A filtered view of the Investment page showing only entries where `assetCategory = "Fixed"`.

### How to Create
1. Click **"+ Add New"**.
2. Select an Investment Head that is of type "Fixed Asset".
3. Enter Date, Amount, and Description.
4. The Asset Category will be pre-set to "Fixed".
5. Click **Save**.

### Business Logic
- Fixed assets are tracked for depreciation timelines.
- The system does NOT auto-calculate depreciation — this is recorded manually via Ledger entries.
- Fixed asset values appear in the Balance Sheet under "Fixed Assets" section.

### ⚠️ Background Systems
- **RBAC:** Admin & Manager only.
- **Auto-Code:** Uses the same `INV-XXXXX` format.
- **Period Close:** Blocked in locked months.
- **VAT Auditor Masking:** Amount values replaced with "N/A (Audit Mode)".

---

## 2.4 Current Asset

### Purpose
Track **liquid and short-term resources** — cash reserves, inventory value, receivables, bank balances. Each current asset is linked to an Investment Head of type "Current Asset".

### How to Navigate
1. Click **Investment** → **Current Asset**.

### What You See
A filtered view showing only entries where `assetCategory = "Current"`.

### How to Create
Same as Fixed Asset, but the Asset Category is pre-set to "Current".

### Business Logic
- Current assets are expected to be converted to cash within one fiscal year.
- They appear in the Balance Sheet under "Current Assets" section.
- Used in liquidity ratio calculations.

### ⚠️ Background Systems
- **RBAC:** Admin & Manager only.
- **Auto-Code:** `INV-XXXXX` format.
- **Period Close:** Blocked in locked months.

---

## 2.5 Liability Receive

### Purpose
Log **incoming debt/loan influxes** — when the business receives money from a liability source (e.g., bank loan disbursed, supplier credit extended).

### How to Navigate
1. Click **Investment** → **Liability Receive**.

### What You See
A filtered view of the Liability page showing only entries where `type = "received"`.

### How to Create
1. Click **"+ Add New"**.
2. Fill in:
   - **Investment Head** (required) — Must be a Liability-type head
   - **Date** (required) — When the money was received
   - **Amount** (required) — The received amount in ৳
   - **Payment Method** — Cash, Bank Transfer, Cheque, etc.
   - **Description** — Notes about the transaction
3. Click **Save**.

### Business Logic
- When a Liability Receive is recorded, the system increases the outstanding liability balance for that Investment Head.
- The total outstanding appears in the Liability Report.

### ⚠️ Background Systems
- **RBAC:** Admin & Manager only.
- **Auto-Code:** Uses the Liability model's auto-generated code.
- **Period Close:** Blocked in locked months.
- **General Ledger Auto-Post:** A corresponding ledger entry is created: Debit the Cash/Bank account, Credit the Liability account.

---

## 2.6 Liability Pay

### Purpose
Record **repayment vouchers** — when the business pays back a liability (e.g., loan EMI, supplier settlement).

### How to Navigate
1. Click **Investment** → **Liability Pay**.

### What You See
A filtered view of the Liability page showing only entries where `type = "pay"`.

### How to Create
1. Click **"+ Add New"**.
2. Fill in:
   - **Investment Head** (required) — Must be a Liability-type head
   - **Date** (required) — When the payment was made
   - **Amount** (required) — The payment amount in ৳
   - **Payment Method** — Cash, Bank Transfer, Cheque
   - **Description** — Notes
3. Click **Save**.

### Business Logic
- When a Liability Pay is recorded, the system decreases the outstanding liability balance.
- The updated balance is reflected immediately in the Liability Report.

### ⚠️ Background Systems
- **RBAC:** Admin & Manager only.
- **Auto-Code:** Auto-generated liability code.
- **Period Close:** Blocked in locked months.
- **General Ledger Auto-Post:** Debit the Liability account, Credit the Cash/Bank account.

---

## 2.7 Liability Report

### Purpose
View the **outstanding balance** for all liability heads and export A4 landscape reports.

### How to Navigate
1. Click **Investment** → **Liability Report**.

### What You See
A summary table showing:
- **Investment Head** — Name of the liability
- **Total Received** — Sum of all "received" type transactions
- **Total Paid** — Sum of all "pay" type transactions
- **Outstanding Balance** — Total Received minus Total Paid (the remaining debt)
- **Last Transaction Date** — The most recent activity date

### Exporting
- **Export PDF:** Generates a Landscape A4 PDF with:
  - Navy Blue corporate header
  - "VoltERP — Electronics Mart IMS" branding
  - Report title "Liability Report"
  - Alternating row colors
  - Page X of Y footer
  - "© NextGen Digital Studio" copyright
- **Export CSV:** Downloads a UTF-8 BOM CSV for Excel analysis.

### ⚠️ Background Systems
- **RBAC:** Admin & Manager only.
- **VAT Auditor Masking:** If a VAT Auditor views this report, all monetary amounts display "N/A (Audit Mode)".
- **Period Close:** This is a read-only report, so no period close restrictions apply.

---

# 3. BASIC FOUNDATION MODULES

> **Sidebar Group:** Basic Modules
> **Navigation Path:** Sidebar → Basic Modules → [Sub-pages]
> **RBAC Access:** Admin ✅ | Manager ✅ | SR ✅ | Dealer ✅ | VAT Auditor ✅ (All roles can access this group — it contains the system's foundational data)

---

## 3.1 Companies

### Purpose
Register the **business entities** (concerns, brands, sister companies) whose products you sell. In an electronics mart, you might have companies like "Samsung", "LG", "Sony", "Walton" etc.

### How to Navigate
1. Click **Basic Modules** → **Companies**.

### What You See
A table with columns:
- **Code** — Auto-generated: `COM-00001`
- **Name** — The company name
- **Address** — Physical address
- **Phone** — Contact number
- **Email** — Official email
- **Logo** — URL or path to company logo
- **Status** — Active/Inactive

### How to Create
1. Click **"+ Add New"**.
2. Fill in:
   - **Name** (required) — e.g., "Samsung Electronics"
   - **Address** — e.g., "Gulshan, Dhaka"
   - **Phone** — Contact number
   - **Email** — Official email
   - **Logo** — Optional image URL
   - **Active** — Checkbox (default: checked)
3. The **Code** is auto-generated (`COM-00001`, `COM-00002`, etc.).
4. Click **Save**.

### Business Logic
- Companies are linked to Products (each product has an optional `companyId`).
- Companies are also linked to Order Sheets (company ordersheets are procurement forecasts).
- Deleting a company does NOT delete its products — the link becomes null.

### ⚠️ Background Systems
- **RBAC:** All 5 roles can VIEW. Only Admin and Manager can CREATE/EDIT/DELETE.
- **Auto-Code:** `COM-XXXXX` format, server-generated.
- **Period Close:** Creating companies is NOT period-restricted (it's reference data, not financial).
- **VAT Auditor:** Can view but cannot edit. No cost/masking applies here.

---

## 3.2 Categories

### Purpose
Create a **multi-level parent category tree** that organizes all your products. For example: Electronics → Mobile → Smartphone → Flagship.

### How to Navigate
1. Click **Basic Modules** → **Categories**.

### What You See
A table with:
- **Code** — `CAT-00001`
- **Name** — Category name
- **Description** — Optional notes
- **Parent Category** — The parent in the hierarchy (shown as name, not ID)
- **Status** — Active/Inactive

### How to Create
1. Click **"+ Add New"**.
2. Fill in:
   - **Name** (required) — e.g., "Smartphones"
   - **Description** — Optional
   - **Parent Category** — Dropdown showing all existing categories. Leave empty for a top-level category.
   - **Active** — Checkbox (default: checked)
3. The **Code** is auto-generated (`CAT-00001`).
4. Click **Save**.

### Hierarchy Structure
- If you leave "Parent Category" empty, this becomes a **root-level** category.
- If you select a parent, this becomes a **child** of that parent.
- You can create unlimited depth: `Electronics → Mobile → Samsung → Galaxy S Series → Flagship`
- The system prevents circular references (a category cannot be its own ancestor).

### ⚠️ Background Systems
- **RBAC:** All roles can VIEW. Only Admin/Manager can CREATE/EDIT/DELETE.
- **Auto-Code:** `CAT-XXXXX` format.
- **Period Close:** Not applicable (reference data).

---

## 3.3 Colors

### Purpose
Define the **color options** available for products. Each color has a name and a hex color code for visual identification.

### How to Navigate
1. Click **Basic Modules** → **Colors**.

### What You See
A table with:
- **Name** — Color name (e.g., "Midnight Black")
- **Color Code** — Hex code (e.g., `#1a1a2e`)
- **Status** — Active/Inactive

### How to Create
1. Click **"+ Add New"**.
2. Fill in:
   - **Name** (required) — e.g., "Phantom Blue"
   - **Color Code** (required) — Enter a hex color code. A color preview swatch appears next to the input.
   - **Active** — Checkbox
3. Click **Save**.

### Business Logic
- Colors are linked to Products (each product can optionally have a `colorId`).
- The hex code is used in the UI to render color preview dots on product rows.

### ⚠️ Background Systems
- **RBAC:** All roles can VIEW. Admin/Manager can CREATE/EDIT/DELETE.
- **Auto-Code:** No code prefix — uses database ID.
- **Period Close:** Not applicable.

---

## 3.4 Products

### Purpose
The **master product catalog** — every item you buy, sell, or track in inventory must exist here first. This is the heart of the entire system.

### How to Navigate
1. Click **Basic Modules** → **Products**.

### What You See
A large table with columns:
- **Product Code** — `PROD-00001`
- **Name** — Product display name
- **Category** — Linked category
- **Color** — Optional color
- **Brand** — Optional brand
- **Unit** — Measurement unit (pcs, kg, etc.)
- **Size/Capacity** — e.g., "256GB", "55 inch"
- **Cost Price** — Purchase cost in ৳ (HIDDEN for VAT Auditor)
- **Sale Price** — Retail selling price in ৳
- **Wholesale Price** — Bulk selling price in ৳ (HIDDEN for VAT Auditor)
- **Dealer Price** — Dealer-specific price in ৳ (HIDDEN for VAT Auditor)
- **Opening Stock** — Initial stock quantity
- **Reorder Level** — Minimum quantity before reorder alert
- **Godown** — Default warehouse location
- **Segment** — Optional market segment
- **Company** — Optional manufacturer/company
- **IMEI Number** — For mobile devices
- **Status** — Active/Inactive

### How to Create
1. Click **"+ Add New"**.
2. Fill in the form:
   - **Name** (required) — e.g., "Samsung Galaxy S24 Ultra"
   - **Category** (required) — Dropdown populated from Categories API
   - **Color** — Dropdown from Colors API
   - **Brand** — Dropdown from Brands API
   - **Unit** — Free text (e.g., "pcs", "set")
   - **Size/Capacity** — Free text
   - **Cost Price** — Enter purchase cost
   - **Sale Price** — Enter retail price
   - **Wholesale Price** — Enter wholesale price
   - **Dealer Price** — Enter dealer price
   - **Opening Stock** — Initial quantity
   - **Reorder Level** — Minimum stock level
   - **Godown** — Dropdown from Godowns API
   - **Segment** — Dropdown from Segments API
   - **Company** — Dropdown from Companies API
   - **IMEI Number** — For mobile phones
   - **Active** — Checkbox
3. The **Product Code** is auto-generated (`PROD-00001`).
4. Click **Save**.

### Business Logic
- Products are referenced by EVERY transaction type: Purchase Orders, Sales Orders, Hire Sales, Returns, Replacements, Stock Transfers.
- When a product's stock falls below the Reorder Level, the system generates a Low Stock notification.
- The **Auto PO** feature uses product sales history and stock levels to suggest purchase quantities.

### ⚠️ Background Systems
- **RBAC:**
  - **Admin/Manager:** Full CRUD access.
  - **SR:** Can view products and sale prices only. Cost/wholesale/dealer columns are HIDDEN in the table.
  - **Dealer:** Can view products and dealer prices only. Cost/wholesale columns are HIDDEN.
  - **VAT Auditor:** Can view products but costPrice, wholesalePrice, and dealerPrice display "N/A (Audit Mode)". A yellow "VAT AUDITOR MODE" banner appears at the top of the page.
- **Auto-Code:** `PROD-XXXXX` format, server-generated.
- **Period Close:** Not applicable for product creation (reference data).
- **VAT Auditor Masking:** Applied both in the table view AND in PDF/CSV exports. The PDF shows an amber "VAT AUDITOR MODE" badge in the header.

---

## 3.5 Bank

### Purpose
Set up your **branch bank account network** — each bank account the business holds is registered here. These accounts are used for expenses, incomes, cash collections, cash deliveries, and bank-to-bank transfers.

### How to Navigate
1. Click **Basic Modules** → **Bank**.

### What You See
A table with:
- **Bank Name** — e.g., "Dutch-Bangla Bank"
- **Branch** — e.g., "Gulshan Branch"
- **Account No** — The account number
- **Account Holder** — Name on the account
- **Opening Balance** — Initial balance in ৳
- **Current Balance** — Live balance (auto-calculated)
- **Status** — Active/Inactive

### How to Create
1. Click **"+ Add New"**.
2. Fill in:
   - **Bank Name** (required) — e.g., "City Bank"
   - **Branch** — e.g., "Dhanmondi"
   - **Account No** (required) — e.g., "1234567890"
   - **Account Holder** (required) — e.g., "Electronics Mart Ltd."
   - **Opening Balance** — Default: 0
   - **Active** — Checkbox
3. Click **Save**.

### Business Logic
- The **Current Balance** is automatically updated whenever:
  - An Expense is recorded with this bank (balance decreases)
  - An Income is recorded with this bank (balance increases)
  - A Cash Collection is deposited (balance increases)
  - A Cash Delivery is withdrawn (balance decreases)
  - A Bank Transaction (Deposit/Withdraw/Transfer) is recorded
- Bank accounts appear as dropdowns in Expense, Income, Cash Collection, Cash Delivery, and Bank Transaction forms.

### ⚠️ Background Systems
- **RBAC:** All roles can VIEW. Admin/Manager can CREATE/EDIT/DELETE.
- **Auto-Code:** No prefix — uses database ID.
- **Period Close:** Not applicable (reference data).
- **VAT Auditor:** Balance values are masked with "N/A (Audit Mode)".

---

## 3.6 Department

### Purpose
Define the **organizational departments** of your business. Each department groups employees and designations.

### How to Navigate
1. Click **Basic Modules** → **Department** (under "Structure" sub-group).

### What You See
A table with:
- **Name** — e.g., "Sales", "Accounts", "Warehouse"
- **Description** — Optional notes
- **Status** — Active/Inactive

### How to Create
1. Click **"+ Add New"**.
2. Fill in:
   - **Name** (required) — e.g., "Human Resources"
   - **Description** — Optional
   - **Active** — Checkbox
3. Click **Save**.

### Business Logic
- Departments are linked to Designations and Employees.
- Each employee must belong to exactly one department.
- Each designation must belong to exactly one department.

### ⚠️ Background Systems
- **RBAC:** All roles can VIEW. Admin/Manager can CREATE/EDIT/DELETE.
- **Period Close:** Not applicable.

---

## 3.7 Godowns (Multi-Warehouse Management)

### Purpose
Set up and manage **multiple warehouse/storage locations**. In a multi-branch electronics business, you may have a main warehouse, showroom stock, and secondary storage.

### How to Navigate
1. Click **Basic Modules** → **Godowns** (under "Structure" sub-group).

### What You See
A table with:
- **Name** — e.g., "Main Warehouse", "Showroom A"
- **Address** — Physical location
- **In-Charge** — Person responsible
- **Status** — Active/Inactive

### How to Create
1. Click **"+ Add New"**.
2. Fill in:
   - **Name** (required) — e.g., "Dhaka Central Warehouse"
   - **Address** — e.g., "Tejgaon Industrial Area"
   - **In-Charge** — e.g., "Rahim Uddin"
   - **Active** — Checkbox
3. Click **Save**.

### Business Logic
- Godowns are the **center of multi-warehouse inventory management**.
- Every Purchase Order, Sales Order, and Hire Sales can specify which godown the stock goes to/comes from.
- **Stock Transfers** move inventory between godowns with a 3-state machine: **Pending → In-Transit → Delivered**.
- The **Stock** page shows inventory grouped by godown, with expandable rows showing per-warehouse quantities.
- The **Stock Details** page shows a 7-source chronological movement timeline per product per godown.

### ⚠️ Background Systems
- **RBAC:** All roles can VIEW. Admin/Manager can CREATE/EDIT/DELETE.
- **Period Close:** Not applicable (reference data).

---

## 3.8 Interest Percentage

### Purpose
Configure the **interest rates** used for Hire Sales installment calculations.

### How to Navigate
1. Click **Basic Modules** → **Interest Percentage**.

### What You See
A table with:
- **Percentage** — The interest rate (e.g., 12.5)
- **Effective Date** — When this rate takes effect
- **Status** — Active/Inactive

### How to Create
1. Click **"+ Add New"**.
2. Fill in:
   - **Percentage** (required) — e.g., `15`
   - **Effective Date** (required) — Pick the date
   - **Active** — Checkbox
3. Click **Save**.

### Business Logic
- Multiple interest percentages can exist with different effective dates.
- The most recent active rate is used for new Hire Sales calculations.
- The rate is applied to the balance amount to calculate installment amounts.

### ⚠️ Background Systems
- **RBAC:** All roles can VIEW. Admin/Manager can CREATE/EDIT/DELETE.
- **Period Close:** Not applicable.

---

## 3.9 Segment

### Purpose
Define **market segments** for product classification (e.g., "Budget", "Mid-Range", "Premium", "Enterprise").

### How to Navigate
1. Click **Basic Modules** → **Segment** (under "Structure" sub-group).

### What You See
A simple table with Name, Description, and Status.

### How to Create
1. Click **"+ Add New"**.
2. Fill in **Name** (required), **Description** (optional), **Active** checkbox.
3. Click **Save**.

### Business Logic
- Products can optionally be assigned to a segment.
- Segments are used in MIS reports for market analysis.

### ⚠️ Background Systems
- **RBAC:** All roles can VIEW. Admin/Manager can CREATE/EDIT/DELETE.

---

## 3.10 Capacity

### Purpose
Define **capacity types** for products (e.g., "32GB", "64GB", "128GB", "1TB", "55 inch").

### How to Navigate
1. Click **Basic Modules** → **Capacity** (under "Structure" sub-group).

### What You See
A simple table with Name, Description, and Status.

### How to Create
Same as Segment — simple Name + Description form.

### Business Logic
- Capacity definitions help standardize product specifications across the catalog.

### ⚠️ Background Systems
- **RBAC:** All roles can VIEW. Admin/Manager can CREATE/EDIT/DELETE.

---

## 3.11 SR Target Setup

### Purpose
Configure **monthly sales performance targets** for each Sales Representative.

### How to Navigate
1. Click **Basic Modules** → **SR Target Setup** (under "Operations" sub-group).

### What You See
A table with:
- **Employee** — The SR (Sales Rep) name
- **Month** — Target month (1-12)
- **Year** — Target year
- **Target Amount** — The sales target in ৳
- **Status** — Active/Inactive

### How to Create
1. Click **"+ Add New"**.
2. Fill in:
   - **Employee** (required) — Select from the Employees dropdown (filtered to SR-type employees)
   - **Month** (required) — Number 1-12
   - **Year** (required) — e.g., 2025
   - **Target Amount** (required) — e.g., 500000
   - **Active** — Checkbox
3. Click **Save**.

### Business Logic
- Each SR can have one target per month per year.
- Target achievement is calculated as: (Actual Sales / Target Amount) × 100%
- This data feeds the **SR Commission Report** and **SR Wise Sales Report**.

### ⚠️ Background Systems
- **RBAC:** Admin and Manager can VIEW and CREATE/EDIT. SR can view their own targets. Dealer and VAT Auditor: limited access.
- **Auto-Code:** No prefix — uses database ID.
- **Period Close:** Not applicable (reference data, but actual sales are financial).

---

## 3.12 Payment Option

### Purpose
Define the **checkout payment methods** available to customers (e.g., "Cash", "Credit Card", "bKash", "Bank Transfer").

### How to Navigate
1. Click **Basic Modules** → **Payment Option** (under "Operations" sub-group).

### What You See
A simple table with Name and Status.

### How to Create
1. Click **"+ Add New"**.
2. Enter **Name** (required) — e.g., "bKash"
3. Check **Active**.
4. Click **Save**.

### Business Logic
- Payment Options are linked to Sales Orders, Expenses, Incomes, Cash Collections, and Cash Deliveries.
- Each Payment Option can have multiple Card Type Setups (e.g., "Credit Card" option → "Visa 2.5%", "Mastercard 3%").

### ⚠️ Background Systems
- **RBAC:** All roles can VIEW. Admin/Manager can CREATE/EDIT/DELETE.

---

## 3.13 CardType

### Purpose
Define the **card brands/types** used with payment options (e.g., "Visa", "Mastercard", "Amex", "Dual").

### How to Navigate
1. Click **Basic Modules** → **CardType** (under "Operations" sub-group).

### What You See
A simple table with Name and Status.

### How to Create
Same as Payment Option — simple Name form.

### Business Logic
- CardTypes are linked to CardType Setups, which define the charge percentage for each Payment Option + CardType combination.

### ⚠️ Background Systems
- **RBAC:** All roles can VIEW. Admin/Manager can CREATE/EDIT/DELETE.

---

## 3.14 CardType Setup

### Purpose
Configure the **checkout fee/charge percentages** for each Payment Option + CardType combination. For example, "Credit Card + Visa = 2.5% charge" or "Credit Card + Mastercard = 3.0% charge".

### How to Navigate
1. Click **Basic Modules** → **CardType Setup** (under "Operations" sub-group).

### What You See
A table with:
- **Payment Option** — e.g., "Credit Card"
- **Card Type** — e.g., "Visa"
- **Charge Percentage** — e.g., 2.5
- **Status** — Active/Inactive

### How to Create
1. Click **"+ Add New"**.
2. Fill in:
   - **Payment Option** (required) — Select from dropdown
   - **Card Type** (required) — Select from dropdown
   - **Charge Percentage** — Enter the fee percentage (e.g., `2.5`)
   - **Active** — Checkbox
3. Click **Save**.

### Business Logic
- When a Sales Order uses a specific Payment Option + Card Type, the charge percentage is applied to the order total.
- This charge amount is tracked as an additional cost and is included in financial reports.

### ⚠️ Background Systems
- **RBAC:** All roles can VIEW. Admin/Manager can CREATE/EDIT/DELETE.
- **VAT Auditor:** Charge percentages are visible but profit-related fields are masked.

---

## 3.15 Brands & Units (Additional Basic Modules)

### Brands
- **Purpose:** Register product brand names (e.g., "Samsung", "LG", "Sony").
- **Code Format:** `BRN-00001`
- **Navigation:** Basic Modules → Brands
- Same simple CRUD pattern as above.

### Units
- **Purpose:** Define measurement units (e.g., "Piece", "Kilogram", "Meter", "Liter").
- **Code Format:** `UNT-00001`
- **Fields:** Name, Symbol (e.g., "pcs", "kg"), Description
- **Navigation:** Basic Modules → Units

---

# 4. STAFF & CRM ECOSYSTEM

> **Sidebar Group:** Staff + Customers & Suppliers
> **RBAC Access:** Admin ✅ | Manager ✅ | SR ✅ (limited) | Dealer ❌ (staff blocked) | VAT Auditor ✅ (read-only, masked)

---

## 4.1 Designations

### Purpose
Define the **job positions** within each department, along with salary band ranges.

### How to Navigate
1. Click **Staff** → **Designations**.

### What You See
A table with:
- **Code** — `DSG-00001`
- **Name** — e.g., "Senior Sales Executive"
- **Department** — Linked department name
- **Grade Level** — e.g., "Grade-1", "Senior"
- **Salary Band Min** — Minimum salary for this designation
- **Salary Band Max** — Maximum salary for this designation
- **Status** — Active/Inactive

### How to Create
1. Click **"+ Add New"**.
2. Fill in:
   - **Name** (required) — e.g., "Accounts Manager"
   - **Department** (required) — Select from dropdown
   - **Grade Level** — Optional (e.g., "Grade-3")
   - **Salary Band Min** — e.g., 25000
   - **Salary Band Max** — e.g., 45000
   - **Active** — Checkbox
3. Click **Save**.

### Validation Rule
- ⚠️ **The server will reject** any designation where `salaryBandMax < salaryBandMin`. A 400 error is returned with the message: "Salary band maximum must be greater than or equal to minimum."

### ⚠️ Background Systems
- **RBAC:** Admin/Manager full access. SR can view. Dealer BLOCKED. VAT Auditor read-only.
- **Auto-Code:** `DSG-XXXXX` format, server-generated.
- **Period Close:** Not applicable (reference data).

---

## 4.2 Employees (22-Field Staff Directory)

### Purpose
Maintain a **comprehensive staff directory** with 22+ fields covering Employment, Personal, Contact, and Banking profiles.

### How to Navigate
1. Click **Staff** → **Employees**.

### What You See
A table with key columns:
- **Employee Code** — `EMP-00001`
- **Name** — Full name
- **Designation** — Job title
- **Department** — Department
- **Phone** — Contact number
- **Status** — Active/Inactive

### Full Field List (22 fields)

**Employment Profile:**
- Name (required)
- Designation (required, dropdown)
- Department (required, dropdown)
- Joining Date (required, date picker)
- Base Salary (number)
- Employee Type: Permanent / Contract / Probation / Part-time
- Status: Active / On Leave / Resigned / Terminated

**Personal Profile:**
- Gender: Male / Female / Other
- Blood Group: A+, A-, B+, B-, O+, O-, AB+, AB-
- Religion
- Date of Birth (date picker)
- Father's Name
- Mother's Name
- Spouse's Name
- Marital Status: Single / Married / Divorced / Widowed
- NID Number (National ID)
- TIN Number (Tax ID)

**Contact Profile:**
- Phone
- Email
- Present Address (textarea)
- Permanent Address (textarea)
- Emergency Contact Number
- Emergency Contact Name

**Banking:**
- Bank Name
- Bank Account No

**Other:**
- Photo URL
- Reference By
- Address
- Active (checkbox)

### How to Create
1. Click **"+ Add New"**.
2. Fill in all relevant fields. Required fields: Name, Designation, Department, Joining Date.
3. The **Employee Code** is auto-generated (`EMP-00001`).
4. Click **Save**.

### Business Logic
- Employees with SR (Sales Rep) type designations are the ones who appear in SR Target Setup and SR reports.
- Employee leaves are tracked in the Employee Leave module.
- Salary information feeds into expense calculations and financial reports.

### ⚠️ Background Systems
- **RBAC:**
  - Admin/Manager: Full CRUD.
  - SR: Can view their own record and colleagues.
  - Dealer: BLOCKED from Staff module entirely.
  - VAT Auditor: Read-only. Salary and financial fields are masked.
- **Auto-Code:** `EMP-XXXXX` format.
- **Period Close:** Not applicable (reference data, but salary expenses are financial).

---

## 4.3 Employee Leave

### Purpose
Track and manage **employee leave requests** with an approval workflow.

### How to Navigate
1. Click **Staff** → **Employee Leave**.

### What You See
A table with:
- **Leave Code** — `LEV-00001`
- **Employee** — Name of the employee
- **Leave Type** — Casual / Sick / Annual / Maternity
- **From Date** — Start date
- **To Date** — End date
- **Total Days** — Auto-calculated
- **Status** — Pending / Approved / Rejected

### How to Create a Leave Request
1. Click **"+ Add New"**.
2. Fill in:
   - **Employee** (required) — Select from dropdown
   - **Leave Type** (required) — Select from: Casual, Sick, Annual, Maternity
   - **From Date** (required) — Start date picker
   - **To Date** (required) — End date picker
   - **Reason** (textarea) — Why the leave is needed
   - **Status** — Default: "Pending"
3. Click **Save**.

### Approval Workflow
- Leave requests start as **"Pending"**.
- An Admin or Manager can edit the leave to change status to **"Approved"** or **"Rejected"**.
- The **Approved By** and **Approved At** fields are recorded automatically.
- Only approved leaves count against the employee's leave balance.

### ⚠️ Background Systems
- **RBAC:** Admin/Manager can approve/reject. SR can submit for themselves. Dealer BLOCKED.
- **Auto-Code:** `LEV-XXXXX` format.
- **Period Close:** Not applicable.

---

## 4.4 Customers

### Purpose
Maintain the **customer CRM database** with credit limit tracking, zone/area filtering, and opening balance indicators.

### How to Navigate
1. Click **Customers & Suppliers** → **Customers**.

### What You See
A table with:
- **Customer Code** — `CUS-00001`
- **Name** — Customer name
- **Phone** — Contact number
- **Email** — Email address
- **Address** — Physical address
- **Area** — Zone/area filter
- **Reference** — Who referred this customer
- **Opening Balance** — Starting balance in ৳
- **Opening Type** — Dr (Debit) or Cr (Credit)
- **Credit Limit** — Maximum credit allowed in ৳
- **Customer Type** — Regular or Dealer
- **Status** — Active/Inactive

### How to Create
1. Click **"+ Add New"**.
2. Fill in:
   - **Customer Name** (required)
   - **Phone** — Contact
   - **Email** — Email address
   - **Address** (textarea) — Full address
   - **Customer Type** (required) — Regular or Dealer
   - **Opening Balance** — Default: 0
   - **Opening Type** — Dr (customer owes you) or Cr (you owe customer)
   - **Credit Limit** — Maximum credit (e.g., 100000)
   - **Active** — Checkbox
3. The **Customer Code** is auto-generated (`CUS-00001`).
4. Click **Save**.

### Credit Limit Utilization
- The system tracks how much credit each customer has used.
- When creating a **Sales Order**, the system checks if the customer's total outstanding exceeds their credit limit.
- If the order would push the customer over their credit limit, a warning is shown (but the order is not blocked — the decision is left to the operator).
- Credit utilization is visible in the Customer Due Report and Customer Ledger.

### ⚠️ Background Systems
- **RBAC:**
  - Admin/Manager: Full CRUD.
  - SR: Can create and edit customers. Cannot delete.
  - Dealer: Can view customer list (limited fields).
  - VAT Auditor: Read-only. Financial fields are masked.
- **Auto-Code:** `CUS-XXXXX` format, server-generated.
- **Period Close:** Creating a customer is not period-restricted, but transactions against the customer ARE.

---

## 4.5 Suppliers

### Purpose
Maintain the **supplier database** with payment terms, credit tracking, and opening balance indicators.

### How to Navigate
1. Click **Customers & Suppliers** → **Suppliers**.

### What You See
A table with:
- **Supplier Code** — `SUP-00001`
- **Name** — Supplier name
- **Contact Person** — Primary contact name
- **Phone** — Contact number
- **Email** — Email address
- **Address** — Physical address
- **Area** — Zone/area
- **Terms** — Payment terms (e.g., "Net 30", "Cash on Delivery")
- **Opening Balance** — Starting balance in ৳
- **Opening Type** — Dr or Cr (default: Cr — supplier has credit balance)
- **Credit Limit** — Maximum credit
- **Status** — Active/Inactive

### How to Create
1. Click **"+ Add New"**.
2. Fill in the same pattern as Customers.
3. The **Supplier Code** is auto-generated (`SUP-00001`).
4. Click **Save**.

### Business Logic
- Suppliers are linked to Purchase Orders and Purchase Returns.
- The supplier's outstanding balance is tracked in the Supplier Due Report and Supplier Ledger.
- Cash Deliveries (payments to suppliers) reduce the supplier's outstanding balance.

### ⚠️ Background Systems
- **RBAC:**
  - Admin/Manager: Full CRUD.
  - SR: BLOCKED from Suppliers module.
  - Dealer: BLOCKED from Suppliers module.
  - VAT Auditor: Read-only. Financial fields masked.
- **Auto-Code:** `SUP-XXXXX` format.
- **Period Close:** Not applicable for creation, but applicable for financial transactions.

---

# 5. LOGISTICAL INVENTORY MANAGEMENT PIPELINES

> **Sidebar Group:** Inventory Management
> **RBAC Access:** Admin ✅ | Manager ✅ | SR ✅ (sales-side only) | Dealer ✅ (view-only) | VAT Auditor ✅ (read-only, masked)

---

## 5.1 Order Sheet (Company / Customer / Reports)

### Purpose
Process **target forecasting datasets** — order sheets capture anticipated demand from either a Company (procurement forecast) or a Customer (pre-order).

### Three Sub-Pages

#### Company Ordersheet
1. Click **Inventory Management** → **Company Ordersheet**.
2. Create ordersheets linked to a Company with product line items (product, quantity, rate, total).
3. Used for forecasting how much stock to procure from each company.

#### Customer Ordersheet
1. Click **Inventory Management** → **Customer Ordersheet**.
2. Create ordersheets linked to a Customer with product line items.
3. Used for capturing customer pre-orders and demand signals.

#### Ordersheet Report
1. Click **Inventory Management** → **Ordersheet Report**.
2. A read-only report showing all ordersheets with date filters and status filters.

### How to Create an Ordersheet
1. Click **"+ Add New"**.
2. Fill in:
   - **Sheet No** (required) — Auto-generated: `OS-00001`
   - **Company/Customer** — Select from dropdown (depending on sub-page)
   - **Date** (required) — Date picker
   - **Status** — Draft / Confirmed / Completed
   - **Notes** — Textarea
3. Add **line items**:
   - **Product** — Select from dropdown
   - **Quantity** — Number
   - **Rate** — Unit price
   - **Total** — Auto-calculated (quantity × rate)
   - **Notes** — Per-line notes
4. Click **Save**.

### ⚠️ Background Systems
- **RBAC:** Admin/Manager full access. SR can create customer ordersheets. Dealer: view-only.
- **Auto-Code:** `OS-XXXXX` format.
- **Period Close:** Ordersheet creation is not period-restricted (it's forecasting, not financial).

---

## 5.2 Purchase Order

### Purpose
Execute the **procurement pipeline** — create purchase orders to suppliers, receive goods into godowns, and track payment obligations.

### How to Navigate
1. Click **Inventory Management** → **Purchase Order**.

### What You See
A comprehensive order management page with:
- **PO Number** — `PUR-00001`
- **Supplier** — Linked supplier
- **Date** — Order date
- **Godown** — Destination warehouse
- **Sub Total** — Sum of line totals
- **Discount** — Discount amount
- **VAT %** — VAT percentage
- **VAT Amount** — Calculated VAT
- **Grand Total** — Final amount payable
- **Status** — Draft / Received / Cancelled
- **Notes** — Optional

### How to Create a Purchase Order
1. Click **"+ Add New"** (or the Create PO button).
2. Fill in:
   - **Supplier** (required) — Select from dropdown
   - **Date** (required) — Order date
   - **Godown** — Select destination warehouse
   - **Notes** — Optional
3. Add **line items**:
   - **Product** — Select from product dropdown
   - **Quantity** — Number of units
   - **Rate** — Unit cost price
   - **Discount %** — Per-line discount percentage
   - **Discount Amount** — Auto-calculated
   - **VAT Amount** — Auto-calculated
   - **Total** — Auto-calculated
4. The **Sub Total**, **Discount**, **VAT Amount**, and **Grand Total** are computed automatically.
5. Click **Save**.

### Status Flow
- **Draft** → Initial state when created
- **Received** → When goods are physically received. At this point:
  - Stock entries are automatically created (type: "IN", referenceType: "PurchaseOrder")
  - The godown's stock quantity increases
  - A ledger entry is auto-posted: Debit Inventory, Credit Accounts Payable
- **Cancelled** → If the order is cancelled before receipt

### ⚠️ Background Systems
- **RBAC:**
  - Admin: Full access.
  - Manager: Full access.
  - **SR: BLOCKED** from Purchase Orders entirely (403 on both frontend and backend).
  - Dealer: BLOCKED.
  - VAT Auditor: Read-only. SubTotal, Discount, VAT Amount, Grand Total, and line item costs are replaced with "N/A (Audit Mode)".
- **Auto-Code:** `PUR-XXXXX` format.
- **Period Close:** ⚠️ CRITICAL — Creating, editing, or receiving a Purchase Order is BLOCKED if the transaction date falls within a locked month. The server returns a 403 error with the period details.
- **General Ledger Auto-Post:** When status changes to "Received", automatic double-entry postings are created.
- **WarehouseStock:** Stock is automatically updated at the specified godown.

---

## 5.3 Auto PO (Automatic Purchase Order Suggestions)

### Purpose
Use the **dynamic reorder formula** to automatically suggest which products need to be restocked and how many units to order.

### How to Navigate
1. Click **Inventory Management** → **Auto PO**.

### What You See
A report-style page showing a table of product suggestions with:
- **Product** — Name and code
- **Current Stock** — Quantity in warehouse
- **Reorder Level** — Minimum threshold
- **Avg Daily Sales** — Average units sold per day
- **Lead Time** — Supplier delivery time in days
- **Safety Stock** — Buffer quantity
- **Suggested PO Qty** — Auto-calculated reorder quantity

### The Auto PO Formula
```
Suggested PO Qty = (Avg Sales × Lead Time) - Current Stock + Safety Stock
```

**Example:**
- A product sells 5 units/day on average
- Supplier takes 7 days to deliver (Lead Time = 7)
- Current stock = 20 units
- Safety stock = 10 units
- Suggested PO = (5 × 7) - 20 + 10 = **25 units**

### How to Use
1. Review the suggestions in the table.
2. Filter by godown, category, or supplier.
3. Select the products you want to order.
4. Click **"Generate PO"** to automatically create a Purchase Order with the suggested quantities.
5. The new PO appears in the Purchase Order page with "Draft" status.

### ⚠️ Background Systems
- **RBAC:** Admin/Manager can generate POs. SR/Dealer BLOCKED. VAT Auditor read-only (masked values).
- **Period Close:** The generated PO will be checked against period close when saved.

---

## 5.4 Sales Order

### Purpose
Process **customer sales** with dynamic invoice generation, credit limit validation, and automated stock deduction.

### How to Navigate
1. Click **Inventory Management** → **Sales Order**.

### What You See
A comprehensive sales order page with:
- **Invoice No** — `SO-00001`
- **Customer** — Linked customer
- **Date** — Invoice date
- **Godown** — Source warehouse
- **Sub Total** — Sum of line totals
- **Discount** — Discount amount
- **VAT %** — VAT percentage
- **VAT Amount** — Calculated VAT
- **Grand Total** — Final invoice amount
- **Payment Option** — How the customer pays
- **Status** — Draft / Delivered / Cancelled
- **Notes** — Optional

### How to Create a Sales Order
1. Click **"+ Add New"**.
2. Fill in:
   - **Customer** (required) — Select from dropdown
   - **Date** (required) — Invoice date
   - **Godown** — Select source warehouse
   - **Payment Option** — Select payment method
   - **Notes** — Optional
3. Add **line items**:
   - **Product** — Select from product dropdown
   - **Quantity** — Number of units
   - **Rate** — Selling price per unit (defaults from product's salePrice)
   - **Discount %** — Per-line discount
   - **VAT Amount** — Auto-calculated
   - **Total** — Auto-calculated
4. Click **Save**.

### Credit Limit Validation
- When you select a customer, the system automatically shows their:
  - **Credit Limit** (e.g., ৳100,000)
  - **Outstanding Balance** (e.g., ৳75,000)
  - **Available Credit** (e.g., ৳25,000)
- If the Grand Total exceeds the Available Credit, a **warning banner** appears.
- The operator can still proceed (business decision), but the warning is logged.

### Status Flow
- **Draft** → Initial state
- **Delivered** → When goods are dispatched:
  - Stock entries are created (type: "OUT", referenceType: "SalesOrder")
  - The godown's stock decreases
  - A ledger entry is auto-posted: Debit Accounts Receivable, Credit Sales Revenue
- **Cancelled** → If cancelled before delivery

### ⚠️ Background Systems
- **RBAC:**
  - Admin/Manager: Full access.
  - SR: Can create and view sales orders. Cannot edit financial details or delete.
  - Dealer: Can view their own orders (view-only).
  - VAT Auditor: Read-only. SubTotal, Discount, VAT, GrandTotal, and line item amounts are "N/A (Audit Mode)".
- **Auto-Code:** `SO-XXXXX` format.
- **Period Close:** ⚠️ BLOCKED in locked months.
- **General Ledger Auto-Post:** Automatic on delivery.
- **WarehouseStock:** Stock deducted from the specified godown.

---

## 5.5 Hire Sales (Installment Sales)

### Purpose
Process **installment-based sales** with down payments, automated monthly installment schedules, and tracking of paid/outstanding amounts.

### How to Navigate
1. Click **Inventory Management** → **Hire Sales**.

### What You See
A comprehensive hire sales page with:
- **Invoice No** — `HIR-00001`
- **Customer** — Linked customer
- **Date** — Sale date
- **Godown** — Source warehouse
- **Sub Total** — Total before hire charges
- **Down Payment** — Initial payment in ৳
- **Hire Rate** — Interest rate applied
- **Duration** — Number of installments (months)
- **Installment Amount** — Monthly payment
- **Balance Amount** — Remaining after down payment
- **Total Paid** — Cumulative payments received
- **Current Status** — Active / Completed / Defaulted
- **Next Payment Date** — Upcoming installment due date
- **Grand Total** — Full amount including hire charges
- **VAT %** and **VAT Amount**

### How to Create a Hire Sale
1. Click **"+ Add New"**.
2. Fill in:
   - **Customer** (required) — Must be a Regular customer (not Dealer type)
   - **Date** (required)
   - **Godown** — Source warehouse
   - **Down Payment** — e.g., ৳30,000
   - **Hire Rate** — e.g., 12 (%)
   - **Duration** — e.g., 12 (months)
3. Add **line items** (products being sold).
4. The system auto-calculates:
   - **Balance Amount** = Sub Total - Down Payment
   - **Installment Amount** = Balance Amount / Duration + (Balance Amount × Hire Rate / 100 / 12)
   - **Grand Total** = Down Payment + (Installment Amount × Duration)
5. An **installment schedule table** is generated automatically:
   - Each row shows: Installment #, Due Date, Amount, Paid Amount, Paid Date, Status
   - Status options: Pending / Paid / Overdue / Partial
6. Click **Save**.

### Tracking Installments
- The **Next Payment Date** is automatically updated when an installment is marked as "Paid".
- The **Total Paid** increases with each payment.
- If a payment is overdue by more than 30 days, the installment status changes to "Overdue" and a notification is generated.
- The **Defaulting Customer Report** shows all customers with overdue installments.

### ⚠️ Background Systems
- **RBAC:** Admin/Manager full access. SR can create hire sales. Dealer view-only. VAT Auditor read-only with ALL financial fields masked (subTotal, downPayment, hireRate, installmentAmount, balanceAmount, totalPaid, grandTotal, line items).
- **Auto-Code:** `HIR-XXXXX` format.
- **Period Close:** BLOCKED in locked months.
- **General Ledger Auto-Post:** Down payment creates a Cash/Bank debit. Each installment payment creates additional ledger entries.

---

## 5.6 Sales Return

### Purpose
Process **customer returns** with dynamic lookups against the original Sales Order, cumulative return checks, and automatic warehouse-level stock re-integration.

### How to Navigate
1. Click **Inventory Management** → **Sales Return**.

### What You See
A table with:
- **Return No** — `SRT-00001`
- **Sales Order** — Linked original invoice
- **Customer** — Customer returning the item
- **Godown** — Warehouse receiving the return
- **Date** — Return date
- **Sub Total, Discount, VAT, Grand Total** — Return financials
- **Reason** — Why the item is being returned
- **Credit Memo Code** — Auto-generated credit memo reference
- **Status** — Pending / Approved / Rejected

### How to Create a Sales Return
1. Click **"+ Add New"**.
2. Select the **original Sales Order** from the dropdown. The system auto-fills:
   - Customer name
   - Products from the original order
3. Select which products are being returned and enter quantities.
4. The system checks: **Is the return quantity ≤ the original order quantity?** If not, an error is shown.
5. The system also checks: **Cumulative returns** — if this customer has already returned items from this order, the new return + previous returns cannot exceed the original quantity.
6. Enter the **Reason** for return.
7. Click **Save**.

### Stock Re-Integration
- When the return is approved (status = "Approved"):
  - A Stock Entry is created: type = "IN", referenceType = "SalesReturn"
  - The **WarehouseStock** for the specified godown increases
  - A ledger entry is auto-posted: Credit Accounts Receivable (reduce customer debt), Debit Sales Returns (contra-revenue)

### ⚠️ Background Systems
- **RBAC:** Admin/Manager full access. SR can create returns for their orders. Dealer BLOCKED. VAT Auditor read-only (masked financials).
- **Auto-Code:** `SRT-XXXXX` format.
- **Period Close:** BLOCKED in locked months.
- **Cumulative Return Check:** The API validates that total returns don't exceed the original order quantity.

---

## 5.7 Purchase Return

### Purpose
Process **returns to suppliers** for defective goods, wrong shipments, or price adjustments.

### How to Navigate
1. Click **Inventory Management** → **Purchase Return**.

### What You See
A table with:
- **Return No** — `PRT-00001`
- **Purchase Order** — Linked original PO
- **Supplier** — Supplier receiving the return
- **Date** — Return date
- **Sub Total, Discount, VAT, Grand Total** — Return financials
- **Reason** — Why the item is being returned
- **Debit Note Code** — Auto-generated debit note reference
- **Challan Ref** — Supplier's challan reference number
- **Status** — Pending / Approved / Rejected

### How to Create
Same pattern as Sales Return but linked to a Purchase Order instead.

### Stock Re-Integration
- When approved, stock is **deducted** from the godown (reverse of the original purchase):
  - Stock Entry: type = "OUT", referenceType = "PurchaseReturn"
  - WarehouseStock decreases
  - Ledger: Debit Accounts Payable (reduce supplier debt), Credit Purchase Returns

### ⚠️ Background Systems
- **RBAC:** Admin/Manager full access. SR BLOCKED from Purchase Returns. Dealer BLOCKED. VAT Auditor read-only (masked).
- **Auto-Code:** `PRT-XXXXX` format.
- **Period Close:** BLOCKED in locked months.

---

## 5.8 Replacement Order

### Purpose
Handle **warranty claims** and execute **product-to-product swaps** — when a customer returns a defective item and receives a replacement.

### How to Navigate
1. Click **Inventory Management** → **Replacement Order**.

### What You See
A table with:
- **Replacement No** — `RPL-00001`
- **Sales Order** — Linked original sale (optional)
- **Date** — Replacement date
- **Reason** — Why the replacement is needed
- **Status** — Pending / Approved / Completed

### How to Create
1. Click **"+ Add New"**.
2. Fill in:
   - **Replacement No** (auto-generated: `RPL-00001`)
   - **Sales Order** — Link to the original sale (optional — for warranty tracking)
   - **Date** (required)
   - **Reason** (textarea) — e.g., "Screen defect under warranty"
   - **Status** — Default: "Pending"
3. Add **line items** — the products being swapped in (replacement products).
4. Click **Save**.

### Replacement Workflow
1. **Pending** — Initial request
2. **Approved** — Manager approves the replacement
3. **Completed** — Replacement product is dispatched:
   - The original product is marked as "Returned" in stock
   - The replacement product is marked as "OUT" in stock
   - Stock entries are created for both movements
   - No financial ledger entry (it's a swap, not a sale)

### ⚠️ Background Systems
- **RBAC:** Admin/Manager full access. SR can create replacement requests. Dealer BLOCKED. VAT Auditor read-only.
- **Auto-Code:** `RPL-XXXXX` format.
- **Period Close:** BLOCKED in locked months.

---

## 5.9 Stock (Multi-Warehouse Inventory View)

### Purpose
View the **current inventory levels** across all godowns with expandable rows showing per-warehouse breakdowns.

### How to Navigate
1. Click **Inventory Management** → **Stock**.

### What You See
A table showing:
- **Product** — Name and code
- **Total Stock** — Sum across all godowns
- **Reorder Level** — Minimum threshold
- **Stock Status** — Badge: "In Stock" (green), "Low Stock" (yellow), "Out of Stock" (red)

### Expandable Rows
- Click the **chevron icon** (▶) on any row to expand it.
- The expanded view shows stock **per godown**:
  - Godown Name
  - Quantity
  - Last Updated
- This allows you to see exactly where each product is stored.

### ⚠️ Background Systems
- **RBAC:** All roles can VIEW. No one creates "stock" directly — stock is a computed view from StockEntry records.
- **VAT Auditor:** Cost prices hidden. Only quantities and product names visible.

---

## 5.10 Stock Details (7-Source Movement Timeline)

### Purpose
View a **chronological movement timeline** for each product, showing every stock-affecting event from 7 possible sources.

### How to Navigate
1. Click **Inventory Management** → **Stock Details**.

### What You See
A detailed view with product filter and date range picker:
- **Product** — Select a product to view its timeline
- **Godown** — Filter by warehouse
- **Date Range** — From/To date pickers

### The 7 Stock Movement Sources
1. **PurchaseOrder** — Goods received from supplier (IN)
2. **SalesOrder** — Goods sold to customer (OUT)
3. **Transfer (In)** — Goods received from another godown (IN)
4. **Transfer (Out)** — Goods sent to another godown (OUT)
5. **SalesReturn** — Customer returned goods (IN)
6. **PurchaseReturn** — Goods returned to supplier (OUT)
7. **Adjustment** — Manual stock adjustments (IN or OUT)

### Timeline Columns
- **Date** — When the movement occurred
- **Type** — IN or OUT
- **Reference** — The document number (PO-00001, SO-00001, etc.)
- **Reference Type** — Which of the 7 sources
- **Quantity** — Amount moved
- **Running Balance** — Stock after this movement
- **Notes** — Any additional information

### ⚠️ Background Systems
- **RBAC:** All roles can VIEW. This is a read-only analysis page.
- **VAT Auditor:** Quantity data visible, cost values hidden.

---

## 5.11 Transfer (Inter-Godown Stock Transfer)

### Purpose
Move inventory **between godowns** with a 3-state transfer status machine and full audit trail.

### How to Navigate
1. Click **Inventory Management** → **Transfer**.

### What You See
A table with:
- **Transfer No** — `TRN-00001`
- **From Godown** — Source warehouse
- **To Godown** — Destination warehouse
- **Date** — Transfer date
- **Shipping Status** — Pending / In-Transit / Delivered
- **Shipped At** — When it left the source
- **Delivered At** — When it arrived at destination
- **Total Items** — Number of product lines
- **Total Quantity** — Sum of all quantities
- **Notes** — Optional

### The Transfer State Machine
```
PENDING ──→ IN_TRANSIT ──→ DELIVERED
   │              │
   └─ Cancelled   └─ (cannot go backwards)
```

1. **Pending** — Transfer created, goods not yet moved.
2. **In-Transit** — Goods have left the source godown. At this point:
   - The source godown's stock DECREASES (goods have physically left)
   - The destination godown's stock has NOT yet increased (goods in transit)
   - The "in-transit" quantity is tracked separately
3. **Delivered** — Goods received at the destination godown. At this point:
   - The destination godown's stock INCREASES
   - The transfer is complete

### How to Create a Transfer
1. Click **"+ Add New"**.
2. Fill in:
   - **From Godown** (required) — Source warehouse
   - **To Godown** (required) — Destination warehouse (must be different from source)
   - **Date** (required)
   - **Notes** — Optional
3. Add **line items**:
   - **Product** — Select from dropdown (shows current stock at source godown)
   - **Quantity** — Must be ≤ available stock at source
4. Click **Save** (status = Pending).

### How to Progress the Transfer
1. Click the **edit icon** on a Pending transfer.
2. Change **Shipping Status** to "In-Transit".
3. The **Shipped At** timestamp is recorded automatically.
4. Later, click edit again and change to "Delivered".
5. The **Delivered At** timestamp is recorded automatically.

### ⚠️ Background Systems
- **RBAC:** Admin/Manager full access. SR can view transfers. Dealer BLOCKED. VAT Auditor read-only.
- **Auto-Code:** `TRN-XXXXX` format.
- **Period Close:** BLOCKED in locked months.
- **Stock Entries:** Auto-created for both IN and OUT movements at the appropriate godowns.
- **WarehouseStock:** Updated in real-time as the transfer progresses.

---

# 6. FINANCIAL ACCOUNTING, SMS & REPORTING INFRASTRUCTURE

> **Sidebar Groups:** Account Management, SMS Service, Accounting Report, Financial Audit, MIS Report
> **RBAC Access:** Admin ✅ | Manager ✅ | SR ❌ (mostly blocked) | Dealer ❌ | VAT Auditor ✅ (read-only with masking)

---

## 6.1 Expense/Income Heads

### Purpose
Define the **category accounts** for all expenses and incomes (e.g., "Rent", "Utilities", "Commission Income", "Service Revenue").

### How to Navigate
1. Click **Account Management** → **Expense/Income Head**.

### What You See
A table with:
- **Name** — e.g., "Office Rent"
- **Type** — Expense or Income
- **Status** — Active/Inactive

### How to Create
1. Click **"+ Add New"**.
2. Fill in:
   - **Name** (required) — e.g., "Courier Charges"
   - **Type** (required) — Select "Expense" or "Income"
   - **Active** — Checkbox
3. Click **Save**.

### ⚠️ Background Systems
- **RBAC:** Admin/Manager can CRUD. SR BLOCKED from Account Management. Dealer BLOCKED. VAT Auditor read-only.
- **Period Close:** Not applicable (reference data).

---

## 6.2 Expenses

### Purpose
Record **business expenditures** — rent, utilities, salaries, maintenance, etc. Each expense auto-posts to the General Ledger.

### How to Navigate
1. Click **Account Management** → **Expense**.

### What You See
A table with:
- **Expense Code** — `EXP-00001`
- **Date** — When the expense was incurred
- **Head** — The expense category
- **Amount** — The expense amount in ৳
- **Payment Option** — How it was paid
- **Bank** — Which bank account (if paid via bank)
- **Description** — Notes
- **Status** — Approved / Pending

### How to Create
1. Click **"+ Add New"**.
2. Fill in:
   - **Date** (required) — Expense date
   - **Head** (required) — Select from Expense-type heads
   - **Amount** (required) — e.g., 15000
   - **Payment Option** — Cash / Credit Card / Bank Transfer
   - **Bank** — Select if paid via bank
   - **Description** — Notes
   - **Status** — Default: "Approved"
3. Click **Save**.

### General Ledger Auto-Post
When an expense is created:
- **Debit:** The Expense Head account
- **Credit:** Cash Account (if cash) or Bank Account (if bank transfer)

### ⚠️ Background Systems
- **RBAC:** Admin/Manager can CRUD. SR BLOCKED. Dealer BLOCKED. VAT Auditor read-only (amounts masked).
- **Auto-Code:** `EXP-XXXXX` format.
- **Period Close:** ⚠️ BLOCKED in locked months. If you try to create an expense dated in January and January is locked, you get a 403 error.
- **General Ledger:** Auto-posted immediately.

---

## 6.3 Incomes

### Purpose
Record **business income** — service fees, interest income, commission received, etc.

### How to Navigate
1. Click **Account Management** → **Income**.

### What You See
Same structure as Expenses but with:
- **Income Code** — `INC-00001`
- **Head** — Income-type heads only

### General Ledger Auto-Post
When income is recorded:
- **Debit:** Cash Account or Bank Account
- **Credit:** The Income Head account

### ⚠️ Background Systems
- Same as Expenses — RBAC, Auto-Code, Period Close, Ledger Auto-Post all apply.

---

## 6.4 Cash Collections

### Purpose
Record **cash received from customers** — payment against outstanding invoices.

### How to Navigate
1. Click **Account Management** → **Cash Collection**.

### What You See
A table with:
- **Collection Code** — `COL-00001`
- **Customer** — Who paid
- **Date** — Payment date
- **Amount** — Amount received in ৳
- **Payment Option** — Cash / Card / Bank
- **Bank** — If deposited to bank
- **Description** — Notes
- **Status** — Approved

### General Ledger Auto-Post
- **Debit:** Cash or Bank Account
- **Credit:** Customer Account (reduces their outstanding balance)

### ⚠️ Background Systems
- **RBAC:** Admin/Manager can CRUD. SR can create collections. Dealer BLOCKED. VAT Auditor read-only (amounts masked).
- **Auto-Code:** `COL-XXXXX` format.
- **Period Close:** BLOCKED in locked months.

---

## 6.5 Cash Deliveries

### Purpose
Record **cash paid to suppliers** — settlement of outstanding payables.

### How to Navigate
1. Click **Account Management** → **Cash Delivery**.

### What You See
A table with:
- **Delivery Code** — `DIL-00001`
- **Supplier** — Who received the payment
- **Date** — Payment date
- **Amount** — Amount paid in ৳
- **Payment Option** — Cash / Card / Bank
- **Bank** — If paid from bank
- **Description** — Notes

### General Ledger Auto-Post
- **Debit:** Supplier Account (reduces their outstanding balance)
- **Credit:** Cash or Bank Account

### ⚠️ Background Systems
- **RBAC:** Admin/Manager can CRUD. SR BLOCKED. Dealer BLOCKED. VAT Auditor read-only.
- **Auto-Code:** `DIL-XXXXX` format.
- **Period Close:** BLOCKED in locked months.

---

## 6.6 Bank Transactions

### Purpose
Record **bank-level operations** — deposits, withdrawals, and bank-to-bank transfers with running balance tracking.

### How to Navigate
1. Click **Account Management** → **Bank Transaction**.

### What You See
A table with:
- **Transaction Code** — `BTX-00001`
- **Bank** — The bank account
- **Date** — Transaction date
- **Type** — Deposit / Withdraw / Transfer
- **Amount** — Transaction amount
- **Running Balance** — Account balance after this transaction
- **To Bank** — Destination bank (for Transfer type)
- **Description** — Notes
- **Status** — Approved

### Transaction Types

#### Deposit
- Cash or cheque deposited INTO the bank account.
- **Debit:** Bank Account (balance increases)
- **Credit:** Cash Account

#### Withdraw
- Cash withdrawn FROM the bank account.
- **Debit:** Cash Account
- **Credit:** Bank Account (balance decreases)

#### Transfer
- Money moved from one bank account to another.
- **Debit:** To Bank Account (destination balance increases)
- **Credit:** From Bank Account (source balance decreases)
- Both banks' `currentBalance` are updated automatically.

### ⚠️ Background Systems
- **RBAC:** Admin/Manager can CRUD. SR BLOCKED. Dealer BLOCKED. VAT Auditor read-only (amounts masked).
- **Auto-Code:** `BTX-XXXXX` format.
- **Period Close:** BLOCKED in locked months.
- **Paired Ledger Entries:** Bank-to-bank transfers create TWO ledger entries (one per bank).

---

## 6.7 SMS Subsystem

### Overview
The SMS module provides **message queue management** and **bulk messaging** capabilities for customer communication.

### Sub-Pages

#### SMS Inbox
- **Path:** SMS Service → SMS Inbox
- Shows all sent/received messages with recipient, message text, status (Pending/Sent/Failed), sent date, and cost.
- **RBAC:** Admin/Manager/SR can view. Dealer BLOCKED. VAT Auditor BLOCKED from SMS module.

#### Send SMS
- **Path:** SMS Service → Send SMS
- Form with: Recipient (phone number), Message (textarea)
- Click **Send** to queue the message.
- The system uses the configured SMS API (from SMS Settings).

#### SMS Bills
- **Path:** SMS Service → SMS Bill
- Track SMS service provider billing: Period, Total SMS count, Total Cost, Paid Amount, Status (Unpaid/Partial/Paid).

#### SMS Bill Payments
- **Path:** SMS Service → SMS Bill Payment
- Record payments against SMS bills: Amount, Date, Method (Cash/Bank Transfer), Notes.

#### SMS Report
- **Path:** SMS Service → SMS Report
- Summary report of SMS activity by period.

#### SMS Service Setting
- **Path:** SMS Service → SMS Service Setting
- Configure the SMS gateway: API URL, API Key, Sender ID.

#### Send Bulk SMS
- **Path:** SMS Service → Send Bulk SMS
- Form with: Recipients (comma-separated phone numbers), Message (textarea)
- Sends the same message to multiple recipients at once.

### ⚠️ Background Systems
- **RBAC:**
  - Admin/Manager: Full SMS access.
  - SR: Can send SMS and view inbox.
  - Dealer: BLOCKED.
  - **VAT Auditor: BLOCKED from ALL SMS sub-pages** (7 items in the deny list).

---

## 6.8 Accounting Reports

### Chart of Accounts & Ledger
- **Path:** Accounting Report → Chart of Accounts & Ledger
- **Purpose:** View the full **double-entry Chart of Accounts** hierarchy with 5 classifications: Asset, Liability, Income, Expense, Equity.
- **Features:**
  - Tree view with parent/child accounts
  - Each account shows: Code (COA-XXXXX), Name, Classification, Opening Balance (Dr/Cr), Current Balance
  - Click any account to view its **Ledger Entries** (all debit/credit transactions)
  - Filter ledger by date range and reference type
  - The system prevents **circular parent references** in the COA hierarchy
- **RBAC:** Admin/Manager full access. SR/Dealer BLOCKED. VAT Auditor read-only.

### Cash In Hand
- **Path:** Accounting Report → Cash In Hand
- **Purpose:** Shows the current cash balance — sum of all cash receipts minus all cash payments.
- **Calculation:** Opening Cash Balance + Cash Collections + Incomes (cash) - Cash Deliveries - Expenses (cash)
- **RBAC:** Admin/Manager only.

### Trial Balance
- **Path:** Accounting Report → Trial Balance
- **Purpose:** The **double-entry verification report** — ensures total debits equal total credits.
- **Columns:** Account Name, Debit Total, Credit Total
- **Validation:** If Debit Total ≠ Credit Total, a red warning appears showing the difference.
- **RBAC:** Admin/Manager only. VAT Auditor can view (read-only).

### Profit and Loss Account
- **Path:** Accounting Report → Profit and Loss Account
- **Purpose:** Shows the **net profit or loss** for a given period.
- **Structure:**
  - Income section: All income heads with totals
  - Expense section: All expense heads with totals
  - **Net Profit = Total Income - Total Expenses**
  - **Gross Profit = Sales Revenue - Cost of Goods Sold**
- **Date Filters:** Select a period (From/To dates).
- **RBAC:** Admin/Manager only. VAT Auditor can view (masked profit figures).

### Balance Sheet & Period Close
- **Path:** Accounting Report → Balance Sheet & Period Close
- **Purpose:** Shows the **financial position** at a point in time and allows month-end closing.
- **Structure:**
  - **Assets** = Fixed Assets + Current Assets
  - **Liabilities** = Long-term Liabilities + Current Liabilities
  - **Equity** = Owner's Equity + Retained Earnings
  - **Validation:** Assets = Liabilities + Equity (must balance)
- **Period Close:**
  - Select a month and year.
  - Click **"Lock Period"** to prevent any further transactions in that month.
  - Once locked, all POST/PUT/DELETE operations for dates in that month are BLOCKED with a 403 error.
  - Only an Admin can unlock a period.
  - Period close records have codes: `BAL-00001`
- **RBAC:** Admin can lock/unlock. Manager can view. SR/Dealer BLOCKED. VAT Auditor can view.

### ⚠️ VAT Auditor Special Mode
When a VAT Auditor views any accounting report:
- All cost, profit, margin, and wholesale values display **"N/A (Audit Mode)"**
- Revenue totals are shown (they need these for VAT calculation)
- Expense totals are shown (they need these for input tax verification)
- But individual product costs, margins, and profitability figures are hidden
- A yellow **"VAT AUDITOR MODE"** banner appears at the top of every report
- PDF exports include an amber badge in the header

---

## 6.9 Financial Audit Group

### Dashboard KPI
- **Path:** Financial Audit → Dashboard KPI
- **Purpose:** Real-time key performance indicators dashboard.
- **KPIs:** Total Revenue, Net Profit, Stock Value, Cash Balance, Total Receivables, Total Payables, Inventory Turnover Ratio
- **Charts:** Revenue trend bar chart, Top products, Monthly comparison
- **RBAC:** Admin/Manager full access. SR/Dealer BLOCKED. VAT Auditor read-only (KPIs masked).

### Ledger Auto-Post
- **Path:** Financial Audit → Ledger Auto-Post
- **Purpose:** View and verify all **automatically posted ledger entries** from transactions.
- **Columns:** Entry Code (LED-XXXXX), Date, Account, Particulars, Debit, Credit, Reference, Reference Type
- **Reference Types:** SalesOrder, PurchaseOrder, Expense, Income, CashCollection, CashDelivery, BankTransaction, Manual
- **Verification:** Click **"Verify Balance"** to check if total debits = total credits.
- **RBAC:** Admin/Manager full access. SR/Dealer BLOCKED. VAT Auditor read-only.

### Inventory Aging
- **Path:** Financial Audit → Inventory Aging
- **Purpose:** Analyze how long products have been sitting in inventory.
- **Aging Buckets:** 0-30 days, 31-60 days, 61-90 days, 90+ days
- **Columns:** Product, Total Quantity, 0-30 days, 31-60 days, 61-90 days, 90+ days, Aging Value
- **RBAC:** Admin/Manager full access. SR/Dealer BLOCKED. VAT Auditor read-only (values masked).

### Product Lifecycle
- **Path:** Financial Audit → Product Lifecycle
- **Purpose:** Track individual products from procurement to sale/return using **Serial/IMEI tracking**.
- **Columns:** Code (SRL-XXXXX), Product, Serial Number, IMEI Number, Status (InStock/Sold/Returned/Replaced/Damaged/Transferred), Purchase Order, Sales Order, Godown, Customer, Supplier, Purchase Date, Sale Date, Return Date, Warranty Expiry
- **RBAC:** Admin/Manager full access. SR/Dealer BLOCKED. VAT Auditor read-only.

### Notifications & Integrity
- **Path:** Financial Audit → Notifications & Integrity
- **Purpose:** View system-generated **threshold alerts** and **data integrity audit logs**.
- **Notification Types:** LowStock, OverdueInstallment, BalanceMismatch, PeriodClose, DataIntegrity, System
- **Severity Levels:** Info (blue), Warning (yellow), Critical (red)
- **Integrity Logs:** Out-of-balance entries, reconciliation failures
- **Actions:** Mark as Read, Dismiss, Navigate to Source (using actionUrl)
- **RBAC:** Admin/Manager full access. SR/Dealer BLOCKED. VAT Auditor read-only.

---

## 6.10 MIS Reports (42+ Sub-Reports)

### Overview
The MIS Report Engine provides **42+ specialized sub-reports** organized into 8 categories. Each report has date presets, filter controls, and the Triple Utility Bundle (Import CSV preview, Export CSV, Export PDF).

### Navigation
Click **MIS Report** in the sidebar, then select any sub-report.

### Report Categories

#### Basic Reports (8 reports)
1. **Employee Information** — Complete staff directory with all 22 fields
2. **Product Information** — Full product catalog with pricing and stock
3. **Stock Details Report** — Per-product stock movement timeline
4. **Stock Summary Report** — Aggregated stock levels by category/godown
5. **Stock Ledger** — Double-entry stock ledger (receipts and issues)
6. **Stock Quantity Report** — Simple quantity-on-hand by product
7. **Stock Forecasting (Product Wise)** — Predicted demand per product
8. **Stock Forecasting (Concern Wise)** — Predicted demand per company/brand

#### Purchase Reports (7 reports)
9. **Supplier Ledger** — All transactions with a specific supplier
10. **Daily Purchase Report** — Purchases grouped by date
11. **Suppliers Wise Purchase** — Purchases grouped by supplier
12. **Supplier Cash Delivery** — Payments made to suppliers
13. **Suppliers Due Report** — Outstanding supplier balances with aging buckets (0-30, 31-60, 61-90, 90+ days)
14. **Model Wise Purchase** — Purchases grouped by product model
15. **VAT Report** — VAT collected and paid summary

#### Sales Reports (3 reports)
16. **Daily Sales Report** — Sales grouped by date
17. **Replacement Report** — All replacement orders
18. **Model Wise Sales** — Sales grouped by product model

#### Hire Sales Reports (5 reports)
19. **Installment Collection** — All installment payments received
20. **Upcoming Installment** — Installments due in the next 30 days
21. **Defaulting Customer** — Customers with overdue installments
22. **Default Customer Summary** — Aggregated default analysis
23. **Hire Account Details** — Full hire sale lifecycle per account

#### SR Reports (8 reports)
24. **SR Wise Sales Report** — Sales performance per SR
25. **SR Wise Sales Details** — Line-item breakdown per SR
26. **SR Wise Customer Due** — Outstanding receivables per SR's customers
27. **SR Wise Customer Sales Summary** — Revenue per SR's customer base
28. **SR Visit Report** — Customer visit tracking per SR
29. **SR Wise Customer Status** — Active/inactive customer status per SR
30. **SR Wise Cash Collection** — Collections attributed to each SR
31. **SR Commission Report** — Commission calculations per SR

#### Customer Wise Reports (6 reports)
32. **Customer Wise Sales** — Sales per customer
33. **Category Wise Customer Due** — Outstanding dues grouped by product category
34. **Customer Ledger Report** — Full transaction history per customer
35. **Customer Due Report [Date Wise]** — Outstanding balances as of a specific date
36. **Customer Cash Collection** — Payment history per customer
37. **Customer Ledger Summary** — Aggregated customer balances

#### Management Reports (7 reports)
38. **Expense Report** — Expenses by category and period
39. **Product Wise Benefit Report** — Profit margin per product (ROI benefit margins)
40. **Income Report** — Income by category and period
41. **Adjustment Report** — Manual journal adjustments
42. **Transaction Summary** — All financial transactions in a period
43. **Monthly Transaction Report** — Month-over-month comparison
44. **Showroom Analysis** — Performance by godown/showroom

#### Bank Reports (3 reports)
45. **Bank Transaction Report** — All bank deposits, withdrawals, transfers
46. **Bank Ledger** — Running balance per bank account
47. **Transfer Report** — All inter-godown stock transfers

#### Advanced
48. **Advance Search** — Cross-module fuzzy search across all data types

### Common Report Features
- **Date Range Picker:** Select From/To dates for all reports
- **Filter Dropdowns:** Filter by supplier, customer, SR, godown, category, etc.
- **Aging Buckets:** Supplier Due and Customer Due reports show 0-30, 31-60, 61-90, 90+ days overdue columns
- **ROI Benefit Margins:** Product Wise Benefit shows cost vs. sale price margins

### Triple Utility Bundle on Reports
- **Export PDF:** Landscape A4 with corporate header, alternating rows, Page X of Y
- **Export CSV:** UTF-8 BOM encoded for ৳ symbol compatibility
- **Import CSV:** Not applicable on read-only reports (no data import)

### ⚠️ Background Systems
- **RBAC:** Admin/Manager can view ALL reports. SR can view only sales-related reports (limited). Dealer BLOCKED from MIS. VAT Auditor can view reports but with masked cost/profit/margin values.
- **VAT Auditor Masking:** The `validateVatMode()` function ensures that only genuine VAT Auditor roles get masked data. Any other role requesting `vatMode=true` is ignored.
- **Period Close:** Reports are read-only, so period close doesn't block viewing. However, the data reflects only transactions in open periods.

---

# 7. UNIVERSAL BACKGROUND SYSTEMS REFERENCE

This section explains the **5 background systems** that operate across ALL pages in the system.

---

## 7.1 Server-Side RBAC (Role-Based Access Control)

### How It Works
Every API request goes through the `withApiSecurity()` function (defined in `src/lib/api-security.ts`). This function:

1. **Reads the `X-User-Email` header** from the request (sent by the frontend's `apiFetch` function).
2. **Looks up the user** in the database to get their role.
3. **Checks group-level access** — Does this role have access to the module's sidebar group?
4. **Checks module-level deny** — Is this specific module in the role's deny list?
5. **Checks write permissions** — For POST/PUT/DELETE, is this role allowed to modify this module?

### If Access Is Denied
- The API returns **403 Forbidden** with a descriptive error message.
- The frontend shows a toast notification: "Access denied. Your role (sr) does not have access to..."
- No data is returned, no mutations are performed.

### Role Permission Matrix (Server-Side)

| Module | Admin | Manager | SR | Dealer | VAT Auditor |
|--------|-------|---------|-----|--------|-------------|
| Investment | ✅ Full | ✅ Full | ❌ 403 | ❌ 403 | ❌ 403 |
| Basic Modules | ✅ Full | ✅ Full | ✅ Read+Write (limited) | ✅ Read-only | ✅ Read-only |
| Staff | ✅ Full | ✅ Full | ✅ Read+Write (limited) | ❌ 403 | ✅ Read-only |
| Customers/Suppliers | ✅ Full | ✅ Full | ✅ Read+Write | ✅ Read-only | ✅ Read-only |
| Inventory | ✅ Full | ✅ Full | ✅ Sales only | ✅ Read-only | ✅ Read-only |
| Account Mgmt | ✅ Full | ✅ Full | ❌ 403 | ❌ 403 | ✅ Read-only |
| SMS | ✅ Full | ✅ Full | ✅ Read+Write | ❌ 403 | ❌ 403 |
| Accounting Report | ✅ Full | ✅ Full | ❌ 403 | ❌ 403 | ✅ Read-only |
| MIS Report | ✅ Full | ✅ Full | ❌ 403 | ❌ 403 | ✅ Read-only (masked) |
| System Settings | ✅ Full | ❌ 403 | ❌ 403 | ❌ 403 | ✅ Read-only |

### Write Permission Deny List

**SR cannot write to:** PurchaseOrders, PurchaseReturns, Expenses, CashDeliveries, BankTransactions, ChartOfAccounts, PeriodClose, MISReports, InvestmentHeads, Assets, Liabilities, Suppliers, SystemConfig, InvoiceTemplates, NumberFormats, AuditTrail

**Dealer cannot write to:** EVERYTHING (pure read-only role with select view permissions)

**VAT Auditor cannot write to:** EVERYTHING (strictly read-only role across all modules)

---

## 7.2 VAT Auditor Mode

### What Happens When a VAT User Views a Page

1. **API Layer:** The `maskForVatAuditor()` function replaces sensitive field values with `"N/A (Audit Mode)"`.
   - Masked fields: costPrice, wholesalePrice, dealerPrice, discount, discountPercent, discountAmount, margin, profit, subTotal, grandTotal (on orders), totalPaid, balanceAmount, hireRate, installmentAmount, downPayment, stockValue, netProfit, totalRevenue, cashBalance

2. **Frontend Layer:**
   - A **yellow banner** appears at the top of every page: "⚠️ VAT AUDITOR MODE — Sensitive financial values are hidden"
   - Table cells containing masked values show `"N/A (Audit Mode)"` in amber text
   - The cost/wholesale/dealer columns are completely hidden from the table (filtered out)
   - Form fields for masked values are disabled/hidden

3. **Export Layer:**
   - **PDF:** An amber "VAT AUDITOR MODE" badge appears in the header. Masked columns show "N/A (Audit Mode)".
   - **CSV:** Masked columns contain "N/A (Audit Mode)" text. The ৳ symbol is still present for non-masked currency fields.

4. **Report Layer:**
   - The `validateVatMode()` function ensures only genuine VAT Auditor roles can activate masking.
   - Non-auditor users requesting `vatMode=true` are silently ignored (masking is not applied).

### Why This Matters
VAT Auditors need to verify tax compliance (sales volumes, VAT collected, expense VAT) but should NOT see:
- Product cost prices (gives away supplier negotiations)
- Wholesale/dealer prices (competitive pricing information)
- Profit margins (business profitability data)
- Individual transaction discounts (commercial sensitivity)

---

## 7.3 Month-End Period Close

### How It Works
The `checkPeriodClose()` function (in `src/lib/api-security.ts`) is called BEFORE every financial mutation.

1. The function receives the transaction date from the request body.
2. It queries the `PeriodClose` table for a record matching the month and year.
3. If `isLocked = true`, it returns a **403 Forbidden** response with:
   - `periodCode` — The lock record code (e.g., BAL-00001)
   - `lockedMonth` — The locked month number
   - `lockedYear` — The locked year
4. If no lock is found, the mutation proceeds normally.

### Which Operations Are Protected
All **34 mutation handlers** (POST/PUT/DELETE) across the following modules:
- Purchase Orders, Sales Orders, Hire Sales
- Sales Returns, Purchase Returns, Replacements
- Expenses, Incomes
- Cash Collections, Cash Deliveries, Bank Transactions
- Stock Entries, Stock Transfers
- Ledger Entries
- Period Close itself (you can't unlock a period without admin access)

### How to Lock a Period
1. Navigate to **Accounting Report → Balance Sheet & Period Close**.
2. Select the month and year.
3. Click **"Lock Period"**.
4. Confirm the action.
5. The system creates a `PeriodClose` record with `isLocked = true`.

### How to Unlock a Period
1. Only an **Admin** can unlock a period.
2. Navigate to the same page.
3. Find the locked period in the list.
4. Click **"Unlock"**.
5. Confirm the action.

### What Happens When a User Tries to Edit in a Locked Period
- The API returns 403 with: "Period locked. The month 1/2025 has been closed and locked. No modifications are allowed. Contact an administrator to unlock."
- The frontend shows a red toast notification with the same message.
- The edit is NOT saved.

---

## 7.4 Triple Utility Bundle

Every data table in the system has three utility buttons in the toolbar:

### Import CSV
1. Click the **Upload icon** (↑) in the table toolbar.
2. A file picker dialog opens. Select a `.csv` file.
3. The system parses the file using **PapaParse** (handles quoted fields, commas inside values, UTF-8 encoding).
4. **Schema Validation Preview:**
   - Each row is validated against the module's form field definitions.
   - Required fields are checked for missing values.
   - Type coercion is performed:
     - Numbers: Strips currency symbols (৳, $, ,) and parses
     - Booleans: "true"/"1"/"Active" → true
     - Dates: Attempts Date.parse(), falls back to raw string
   - Row-by-row errors are displayed: "Row 5: Missing required fields: Name, Category"
5. Valid rows are inserted via the API one at a time.
6. A progress indicator shows "Imported: 45/50".
7. A summary toast shows: "Imported: 48, Failed: 2"

### Export CSV
1. Click the **CSV icon** in the table toolbar.
2. The system generates a UTF-8 BOM encoded CSV file:
   - **BOM:** `\uFEFF` prefix ensures Excel correctly interprets the ৳ symbol
   - **RFC 4180 compliant:** Fields with commas, quotes, or newlines are properly escaped
   - **VAT masking:** If the current user is a VAT Auditor, masked columns show "N/A (Audit Mode)"
3. The file downloads automatically as `{module-name}.csv`.

### Export PDF
1. Click the **PDF icon** in the table toolbar.
2. The system generates a **Landscape A4 PDF** using jsPDF + autoTable:
   - **Corporate Header:**
     - Navy Blue (#0a1628) bar across the top
     - "VoltERP — Electronics Mart IMS" in white
     - Report title and subtitle
     - Generation timestamp (right-aligned)
     - VAT AUDITOR MODE badge (amber, right side — only for VAT Auditor)
   - **Table:**
     - Blue (#2563eb) header row with white text
     - Alternating row colors (light blue-gray)
     - Currency columns right-aligned
     - Proper date formatting (DD Mon YYYY)
   - **Footer:**
     - Navy Blue bar at the bottom
     - "© NextGen Digital Studio — Electronics Mart IMS" (left)
     - "Page X of Y" (right)
3. The file downloads as `{module-name}.pdf`.

---

## 7.5 Auto-Code Paradigm

### How It Works
Every record in the system receives a **unique, zero-padded, prefixed code** that is:

1. **Auto-generated** by the server when the record is created
2. **Read-only** — the user cannot edit it in the form
3. **Immutable** — it never changes, even if the record is updated
4. **Sequential** — each new record gets the next number in sequence

### Code Format
`{PREFIX}-{5-digit zero-padded number}`

### Complete Code Prefix Map

| Module | Prefix | Example |
|--------|--------|---------|
| Investment Heads | INVH- | INVH-00001 |
| Investments | INV- | INV-00001 |
| Companies | COM- | COM-00001 |
| Categories | CAT- | CAT-00001 |
| Products | PROD- | PROD-00001 |
| Brands | BRN- | BRN-00001 |
| Units | UNT- | UNT-00001 |
| Designations | DSG- | DSG-00001 |
| Employees | EMP- | EMP-00001 |
| Employee Leaves | LEV- | LEV-00001 |
| Customers | CUS- | CUS-00001 |
| Suppliers | SUP- | SUP-00001 |
| Order Sheets | OS- | OS-00001 |
| Purchase Orders | PUR- | PUR-00001 |
| Sales Orders | SO- | SO-00001 |
| Hire Sales | HIR- | HIR-00001 |
| Sales Returns | SRT- | SRT-00001 |
| Purchase Returns | PRT- | PRT-00001 |
| Replacements | RPL- | RPL-00001 |
| Stock Transfers | TRN- | TRN-00001 |
| Expenses | EXP- | EXP-00001 |
| Incomes | INC- | INC-00001 |
| Cash Collections | COL- | COL-00001 |
| Cash Deliveries | DIL- | DIL-00001 |
| Bank Transactions | BTX- | BTX-00001 |
| Chart of Accounts | COA- | COA-00001 |
| Ledger Entries | LED- | LED-00001 |
| Period Close | BAL- | BAL-00001 |
| Notifications | NOT- | NOT-00001 |
| Serial Tracking | SRL- | SRL-00001 |

### How the Server Generates Codes
The `generateNextCode()` function (in `src/lib/accounting-utils.ts`):
1. Queries the database for the latest record matching the prefix.
2. Extracts the numeric portion after the prefix.
3. Increments by 1.
4. Zero-pads to 5 digits.
5. Returns the new code (e.g., `PROD-00042`).

This approach avoids gaps from deleted records and ensures uniqueness.

---

# 8. QUICK REFERENCE: KEYBOARD SHORTCUTS & NAVIGATION

## Global Shortcuts

| Shortcut | Action |
|----------|--------|
| ⌘K / Ctrl+K | Open Global Search (⌘K Deep-Linking) |
| Escape | Close search dialog / close any open modal |
| Tab | Navigate between form fields |
| Enter | Submit form / confirm action |

## Navigation Pattern

1. **Sidebar** (left) — Click a group to expand/collapse. Click an item to navigate.
2. **Breadcrumbs** (top) — Shows current location: "Investment > Investment Heads"
3. **⌘K Search** — Type any keyword to jump directly to a page.
4. **Back/Forward** — Browser navigation works within the SPA.

## Common UI Patterns

### Data Table
- **Search bar** — Filter rows by any visible column value
- **+ Add New** — Open create form dialog
- **Pencil icon** — Edit record
- **Trash icon** — Delete record (with confirmation)
- **Eye icon** — View details (read-only mode)
- **PDF/CSV/Upload icons** — Triple Utility Bundle

### Form Dialog
- **Required fields** have a red asterisk (*)
- **Auto-generated fields** show "Auto-generated" placeholder and are disabled
- **Dropdown fields** are populated dynamically from the API
- **Date fields** use a date picker
- **Textarea fields** for long text (addresses, notes, reasons)
- **Checkbox fields** for boolean values (Active/Inactive)

### Status Badges
- 🟢 **Green** — Active, Approved, Paid, In Stock, Delivered
- 🟡 **Yellow** — Pending, Partial, Low Stock, In-Transit
- 🔴 **Red** — Overdue, Blocked, Out of Stock, Cancelled, Rejected
- 🔵 **Blue** — Draft, Info notifications

## Footer
Every page has a sticky footer at the bottom:
> **Developed & Copyright by NextGen Digital Studio**

---

# APPENDIX A: SYSTEM SETTINGS (GROUP 6)

> **Sidebar Group:** System Settings
> **RBAC Access:** Admin ✅ | Manager ❌ | SR ❌ | Dealer ❌ | VAT Auditor ✅ (read-only)

### Company Settings
- Configure company name, address, logo, tax ID, and other business details.
- These values appear on PDF report headers and invoice templates.
- **RBAC:** Admin can edit. VAT Auditor can view (masked profit-sensitive configs).

### Invoice Templates
- Design and manage invoice layouts for Sales Orders and Hire Sales.
- Template fields: Header text, footer text, terms & conditions, logo placement, column ordering.
- **RBAC:** Admin can create/edit. VAT Auditor can view.

### Number Formats
- Configure the code prefix and padding length for each module.
- Default: 5-digit padding with module-specific prefixes (see Code Prefix Map above).
- **RBAC:** Admin only. All other roles BLOCKED.

### Audit Trail Viewer
- View a **timeline of all system actions** performed by all users.
- Filter by: Action type (CREATE/UPDATE/DELETE/LOGIN/LOGOUT/EXPORT/IMPORT), Module, User, Date range.
- Each entry shows: Action, Module, Record ID, Record Label, User Name, Details (JSON before/after), IP address, Timestamp.
- **RBAC:** Admin can view all. VAT Auditor can view (masked cost/profit details). SR/Dealer BLOCKED.

### Performance & Cache
- View and manage the **LRU memory cache** and database performance settings.
- Cache tiers: 30s (volatile), 5min (standard), 15min (reference), 1hr (static)
- Cache size: 500 entries max
- Database: SQLite WAL mode, 64MB page cache, NORMAL sync mode
- 55+ database indexes for FK, date, and status columns
- **RBAC:** Admin can view and clear cache. VAT Auditor can view. SR/Dealer BLOCKED.

---

# APPENDIX B: DATABASE SCHEMA MAP

The system uses **50+ Prisma models** organized into these sections:

1. **Authentication:** User (email, password, role, isActive)
2. **Investment Module:** InvestmentHead, Asset, Liability
3. **Basic Modules:** Company, Category, Color, Bank, Department, Godown, InterestPercentage, Segment, Capacity, Brand, Unit, SRTargetSetup, PaymentOption, CardType, CardTypeSetup
4. **Product Master:** Product (with 14+ relations to other models)
5. **Staff Management:** Designation, Employee (22 fields), EmployeeLeave
6. **CRM:** Customer, Supplier
7. **Inventory - Orders:** OrderSheet, OrderSheetLine, PurchaseOrder, PurchaseOrderLine, SalesOrder, SalesOrderLine
8. **Inventory - Hire Sales:** HireSales, HireSalesLine, HireInstallment
9. **Inventory - Returns:** SalesReturn, SalesReturnLine, PurchaseReturn, PurchaseReturnLine
10. **Inventory - Replacements:** ReplacementOrder, ReplacementOrderLine
11. **Stock Management:** StockEntry, StockTransfer, StockTransferLine
12. **Account Management:** ExpenseIncomeHead, Expense, Income, CashCollection, CashDelivery, BankTransaction
13. **SMS Service:** SmsSetting, SmsLog, SmsBill, SmsBillPayment
14. **Chart of Accounts & Ledger:** ChartOfAccount (hierarchical), LedgerEntry
15. **Period Close:** PeriodClose (unique month+year constraint)
16. **Audit:** AuditLog
17. **Group 5 - Financial Audit:** Notification, ProductSerialTracking, DataIntegrityLog, InventoryAging, ProductLifecycle
18. **Dashboard:** DashboardKPI

---

# APPENDIX C: LOGIN CREDENTIALS QUICK REFERENCE

| Role | Username | Password |
|------|----------|----------|
| Admin | emart.amit | Test_123 |
| Manager | emart.manager | Manager_123 |
| SR | emart.sr | SR_123 |
| Dealer | emart.dealer | Dealer_123 |
| VAT Auditor | emart.vat | VAT_123 |

---

*End of VoltERP User Operations Manual — Version 2.0*
*Developed & Copyright by NextGen Digital Studio*
