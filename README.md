# VoltERP — Electronics Mart IMS

A production-ready **Inventory Management System (IMS)** for electronics retail businesses, built with **Next.js 16, Prisma ORM, and SQLite/Turso**.

VoltERP covers the full retail lifecycle: investment tracking, asset & liability management, procurement (purchase orders, returns, replacements), inventory (stock, valuation, godown transfers), sales (orders, invoices, SR management), full accounting (chart of accounts, vouchers, trial balance, P&L, balance sheet), SMS auto-triggers, VAT auditor reports, and an extensive MIS reporting suite (100+ report pages).

## Features

- **5 Role-Based Access Control**: Admin, Manager, SR (Sales Representative), Dealer, VAT Auditor
- **100+ Module Pages** organized across Investment, Assets, Liabilities, Inventory, Accounting, SMS, MIS Reports, and System Settings
- **Multi-tenant Company Branding**: Admin can edit company name, logo, address, VAT number; logo embedded in all PDF exports
- **PDF / CSV Export & CSV Import** on every list page (jsPDF + papaparse)
- **English Digits Only** in all PDFs (no Bengali/scrambled digits)
- **5 SMS Auto-Triggers** with on/off toggles (purchase, sales, payment, stock alert, due reminder)
- **Profile Center** with photo, logo, and Voter ID upload (5 MB max each)
- **Security**: bcrypt password hashing, JWT auth, CSRF protection
- **Responsive**: PC + mobile + tablet; collapsible sidebar
- **Dark / Light Mode** via next-themes

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) + TypeScript 5 |
| Styling | Tailwind CSS 4 + shadcn/ui (New York) |
| Database | Prisma ORM + SQLite (local) / Turso libSQL (production) |
| Auth | JWT + bcryptjs |
| State | Zustand + TanStack Query |
| Charts | Recharts |
| PDF | jsPDF + jspdf-autotable |
| CSV | papaparse |

## Default Credentials (5 roles)

| Role | Username | Password |
|------|----------|----------|
| Admin | `emart.amit` | `Test_123` |
| Manager | `emart.manager` | `Manager_123` |
| SR | `emart.sr` | `SR_123` |
| Dealer | `emart.dealer` | `Dealer_123` |
| VAT Auditor | `emart.vat` | `VAT_123` |

> Change the admin password immediately after first deployment.

## Local Development

```bash
# 1. Install dependencies
npm install --legacy-peer-deps

# 2. Copy env file and configure
cp .env.example .env
# Edit .env: set DATABASE_URL and JWT_SECRET

# 3. Create database + generate Prisma client
npx prisma db push
npx prisma generate

# 4. (Optional) Seed reference data
node scripts/seed-reference-data.js

# 5. Start dev server
npm run dev
# Open http://localhost:3000
```

## Production Deployment on Vercel

Vercel's serverless functions don't support a local SQLite file, so **VoltERP uses [Turso](https://turso.tech) (cloud libSQL)** for production. The Prisma schema already enables the `driverAdapters` preview feature and `@prisma/adapter-libsql` is installed.

### Step 1 — Create a Turso Database (free tier available)

1. Sign up at https://turso.tech
2. Create a database:
   ```bash
   turso db create volterp
   turso db tokens create volterp   # produces an auth token
   turso db show volterp --url      # produces the libsql:// URL
   ```

### Step 2 — Push the schema to Turso (one-time, from your machine)

```bash
# Temporarily point Prisma at Turso
export DATABASE_URL="libsql://volterp-<your-org>.turso.io?authToken=<your-token>"
npx prisma db push
npx prisma generate

# Seed reference + company data
node scripts/seed-reference-data.js
```

### Step 3 — Deploy on Vercel

1. Go to https://vercel.com/new
2. Import your GitHub repo `Taj3D/VoltERP`
3. Vercel auto-detects Next.js and uses `vercel.json`
4. Add **Environment Variables** in the Vercel dashboard:

   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | `libsql://volterp-<your-org>.turso.io?authToken=<your-token>` |
   | `JWT_SECRET` | a long random string (e.g. `openssl rand -hex 32`) |

5. Click **Deploy**. The build runs `prisma generate && next build` automatically.

### Step 4 — Verify

- Visit the deployed URL
- Log in as Admin (`emart.amit` / `Test_123`)
- Change the admin password in Profile Center
- Update Company Name + Logo in System Settings → Company Branding

## Project Structure

```
prisma/
  schema.prisma          # Full database schema (SQLite/Turso)
  db/                    # Local SQLite dev database (gitignored)
src/
  app/
    api/                 # API routes (auth, CRUD, reports)
    page.tsx             # Single-page app entry
  components/
    ui/                  # shadcn/ui primitives
    ElectronicsMartApp.tsx  # Main application shell (sidebar, routing, modules)
  lib/
    db.ts                # Prisma client singleton
    auth.ts              # JWT + bcrypt helpers
scripts/
  seed-reference-data.js # Seed categories, brands, products, users, etc.
vercel.json              # Vercel build config
next.config.ts           # Next.js config (Vercel-ready)
```

## Security Notes

- Passwords hashed with bcryptjs (10 rounds)
- JWT tokens for session management
- `.env` is gitignored — never commit secrets
- CSRF tokens on state-changing mutations
- Only Admin role can reset user passwords

## License

Proprietary — © Electronics Mart. All rights reserved.
