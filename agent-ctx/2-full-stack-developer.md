# Task 2 — Phase 15 Prisma Schema + API Routes

## Work Completed

### 1. Prisma Schema Updates
- Added `PosSale` model (lines 1881-1920 in schema.prisma) with:
  - receiptNo (unique), customerId, godownId, date
  - subTotal, discountPercent, discountAmount, vatPercentage, vatAmount, grandTotal
  - Split payment: cashAmount, cardAmount, mfsAmount, cashChange
  - Metadata: salesOrderId, status, voidReason, voidedBy, voidedAt, cashierName
  - companyId for multi-tenant isolation
  - Relations: customer, godown, company, salesOrder, lines
  - Indexes: customerId, godownId, date, companyId, status

- Added `PosSaleLine` model (lines 1922-1945 in schema.prisma) with:
  - posSaleId, productId, productName (snapshot), productCode (snapshot)
  - quantity, rate, discountPercent, discountAmount, total, costPrice
  - companyId, relations to PosSale (cascade), Product, Company
  - Indexes: posSaleId, productId, companyId

- Added relations to existing models:
  - Company: `posSales PosSale[]`, `posSaleLines PosSaleLine[]`
  - Customer: `posSales PosSale[]`
  - Godown: `posSales PosSale[]`
  - Product: `posSaleLines PosSaleLine[]`
  - SalesOrder: `posSales PosSale[]`

### 2. Schema Push
- Ran `DATABASE_URL='file:/home/z/my-project/db/custom.db' npx prisma db push --accept-data-loss`
- Successfully synced, Prisma Client regenerated

### 3. API Routes Created
- `/api/pos/barcode` — GET: Barcode scanner lookup by productCode or IMEI, returns product + stock info
- `/api/pos/checkout` — POST: Atomic POS checkout with $transaction (creates PosSale+Lines, decrements ProductStock, creates StockEntry OUT, auto-creates SalesOrder, auto-posts LedgerEntries for split payment)
- `/api/pos/sales` — GET: POS sales history with pagination, filtering, VAT auditor masking
- `/api/pos/void` — POST: Void a POS sale (reverses stock, creates StockEntry IN, reverse ledger entries, cancels linked SalesOrder)

### 4. Activity Logger Updated
- Added `POS-Retail-Core` module token documentation to activity-logger.ts

### Verification
- `bun run lint` passed with zero errors
- Dev server running on localhost:3000 (HTTP 200)
- `/api/pos/barcode?code=test` returns proper 404 for non-existent product
- `/api/pos/sales` returns proper auth requirement
