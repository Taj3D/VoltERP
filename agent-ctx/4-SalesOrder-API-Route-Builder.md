# Task ID: 4 - Sales Order API Route Rewrite

## Task: Phase 11 — Complete rewrite of Sales Order API routes

### Files Rewritten:
1. `/home/z/my-project/src/app/api/sales-orders/route.ts`
2. `/home/z/my-project/src/app/api/sales-orders/[id]/route.ts`

### Changes Made:

#### File 1: /api/sales-orders/route.ts (COMPLETE rewrite)

**GET endpoint enhancements:**
- Multi-tenant companyId filtering: `where: { isActive: true, ...(companyId && { companyId }) }`
- Added `customerName`, `godownName`, `paymentOptionName` in response
- Included `customerCreditInfo` object with `creditLimit` and `currentOutstanding` for Credit Shield
- Applied `maskFinancialArray` for VAT Auditor masking on all financial fields (subTotal, discount, vatAmount, grandTotal, deliveryCost, cashAmount, bankAmount, mfsAmount, cardAmount)
- Applied line-level VAT Auditor masking (rate, discountPercent, discountAmount, vatAmount, total)

**POST endpoint — Complete overhaul:**
1. **Godown Status Validation (SUSPENDED = 403)**: Checks `godown.status === 'SUSPENDED'`, returns 403 with descriptive error
2. **Strict Numeric Validation (400)**:
   - Each line: quantity must be > 0, rate must be > 0
   - deliveryCost must be >= 0
   - Payment breakdown (cashAmount, bankAmount, mfsAmount, cardAmount) must each be >= 0
3. **Total Transaction Value Calculation**:
   - `subTotal = Σ line.total` using safeFinancialRound
   - `afterDiscount = subTotal - discount`
   - `afterDelivery = afterDiscount + deliveryCost`
   - `vatAmount = afterDelivery * (vatPct / 100)`
   - `grandTotal = afterDelivery + vatAmount`
4. **B2B Customer Credit Shield Interlock (422)**:
   - Fetches customer's creditLimit and calculates current outstanding (total unpaid SOs - total cash collections)
   - If `currentDue + newOrderValue > creditLimit` AND `creditOverride !== true`: returns 422 with `creditShieldViolation: true`, `currentDue`, `newOrderValue`, `creditLimit`, `excess`
   - **Role Bypass**: If `creditOverride === true` AND user is admin: allows transaction, sets `creditOverride: true` and `overrideBy: userId`
5. **Negative Stock Prevention (409)**: Pre-validates ProductStock at specified godown for each line
6. **Atomic Double-Entry Bookkeeping ($transaction)** when status is Confirmed/Delivered:
   - Creates SalesOrder with all new fields (deliveryCost, dueDate, cashAmount, bankAmount, mfsAmount, cardAmount, creditOverride, overrideBy)
   - Decrements ProductStock for each line
   - Creates StockEntry (type="OUT") with costPrice and totalCost for each line
   - Double-entry ledger: Debit Accounts Receivable, Credit Sales Revenue
   - Creates LedgerAutoPost record (LAP-XXXXX)
7. **Activity Logger**: `logUserActivity` with module token `'Inv-Orders-Core'`
8. **Auto-SMS Hook**: `buildPurchaseSms` + `dispatchAutoSms` with fire-and-forget pattern

#### File 2: /api/sales-orders/[id]/route.ts (COMPLETE rewrite)

**GET endpoint enhancements:**
- Cross-tenant companyId validation (returns 404 on mismatch)
- Added `customerName`, `godownName`, `paymentOptionName`, `customerCreditInfo`
- Applied `maskForVatAuditorFinancial` + `maskForVatAuditor` for comprehensive VAT Auditor masking
- Line-level VAT Auditor masking

**PUT endpoint — Same validations as POST:**
- Cross-tenant validation before any modification
- Godown Status Validation (SUSPENDED = 403)
- Strict Numeric Validation (400)
- Credit Shield check on updates (when grandTotal changes)
- Stock pre-validation for Confirmed/Delivered status transitions
- Status transition handling:
  - Confirmed/Delivered → Draft/Cancelled: Reverses ProductStock (increment), creates reversal StockEntry (type="IN"), creates reversal ledger entries, marks LedgerAutoPost as Reversed
  - Draft → Confirmed/Delivered: Processes ProductStock decrement, StockEntry, double-entry ledger, LedgerAutoPost
- Activity Logger with 'Inv-Orders-Core' token

**DELETE endpoint:**
- `checkFinancialDeletePermission(role)` — only admin can delete
- Cross-tenant validation
- If SO was Confirmed/Delivered: reverses stock (ProductStock increment), creates reversal StockEntry, creates reversal ledger entries, marks LedgerAutoPost as Reversed
- Soft delete with `isActive: false` + status: 'Cancelled'
- Activity Logger with 'Inv-Orders-Core' token

### Helper Functions (in both files):
- `nullIfEmpty`: Normalizes empty strings to null for optional fields
- `findOrCreateCoAAccount`: Finds or creates ChartOfAccount nodes for double-entry ledger (Accounts Receivable, Sales Revenue)

### Code Generation Patterns:
- invoiceNo: SO-XXXXX (5-digit zero-padded)
- entryCode: LED-XXXXX (5-digit zero-padded)
- LedgerAutoPost code: LAP-XXXXX (5-digit zero-padded)

### Verification:
- `bun run lint` passed with zero errors
- Dev server HTTP 200, GET /api/sales-orders returns enriched data with customerName, godownName, paymentOptionName, customerCreditInfo
- All calculations use safeFinancialRound/Add/Subtract (no raw +/- or floating-point drift)
- All routes follow Next.js 16 conventions (params as Promise, $transaction for atomicity)
