import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  checkPeriodClose,
  safeFinancialRound,
  safeFinancialAdd,
  safeFinancialSubtract,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// ─────────────────────────────────────────────────────────────
// Helper: Find or Create CoA Account for double-entry ledger
// ─────────────────────────────────────────────────────────────
async function findOrCreateCoAAccount(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  name: string,
  classification: string,
  parentCode: string,
  companyId: string | null
): Promise<string> {
  let account = await tx.chartOfAccount.findFirst({
    where: { name, classification, ...(companyId && { companyId }) },
  });
  if (account) return account.id;

  const parent = await tx.chartOfAccount.findFirst({
    where: { code: parentCode, ...(companyId && { companyId }) },
  });

  const code = `COA-${String(Date.now()).slice(-5)}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
  account = await tx.chartOfAccount.create({
    data: {
      code,
      name,
      classification,
      parentAccountId: parent?.id || null,
      ...(companyId && { companyId }),
    },
  });
  return account.id;
}

// ─────────────────────────────────────────────────────────────
// POST /api/pos/checkout — Atomic POS Checkout
// Performs the entire checkout in a single Prisma $transaction:
// - Creates PosSale + PosSaleLines
// - Decrements ProductStock for each line item
// - Creates StockEntry OUT records
// - Auto-creates a SalesOrder record (for double-entry ledger integration)
// - Auto-posts LedgerEntries (Debit: Cash/Bank/MFS asset nodes, Credit: Sales Revenue COA node)
// - Logs activity with "POS-Retail-Core" token
// ─────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'PosSale', 'POST');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;
  const userId = security.user.id;
  const userName = security.user.name;

  try {
    const body = await request.json();
    const {
      customerId,
      godownId,
      cashierName,
      lines,
      cashAmount,
      cardAmount,
      mfsAmount,
      discountPercent,
      vatPercentage,
      companyId: bodyCompanyId,
    } = body;

    // ── Required fields validation ──
    if (!godownId) {
      return NextResponse.json(
        { error: 'godownId is required — POS sale must specify a retail godown' },
        { status: 400 }
      );
    }
    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json(
        { error: 'At least one line item is required' },
        { status: 400 }
      );
    }

    // ── Godown Status Validation ──
    const godown = await db.godown.findUnique({ where: { id: godownId } });
    if (!godown) {
      return NextResponse.json({ error: 'Godown not found' }, { status: 400 });
    }
    if (godown.status === 'SUSPENDED') {
      return NextResponse.json(
        { error: `Godown "${godown.name}" is SUSPENDED. All stock operations are blocked.` },
        { status: 403 }
      );
    }

    // ── Validate each line item ──
    const effectiveCompanyId = bodyCompanyId || companyId || null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.productId) {
        return NextResponse.json(
          { error: `Line ${i + 1}: productId is required` },
          { status: 400 }
        );
      }
      const lineQty = Number(line.quantity);
      const lineRate = Number(line.rate);
      if (isNaN(lineQty) || lineQty <= 0) {
        return NextResponse.json(
          { error: `Line ${i + 1}: quantity must be greater than 0` },
          { status: 400 }
        );
      }
      if (isNaN(lineRate) || lineRate <= 0) {
        return NextResponse.json(
          { error: `Line ${i + 1}: rate must be greater than 0` },
          { status: 400 }
        );
      }
    }

    // ── Validate customer if provided ──
    let customerCoaId: string | null = null;
    if (customerId) {
      const customer = await db.customer.findUnique({
        where: { id: customerId },
        include: { coaAccount: true },
      });
      if (!customer) {
        return NextResponse.json({ error: 'Customer not found' }, { status: 400 });
      }
      customerCoaId = customer.coaAccountId;
    }

    // ── Pre-transaction stock validation ──
    const processedLines = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineQty = Number(line.quantity);
      const lineRate = Number(line.rate);
      const lineDiscPct = Number(line.discountPercent) || 0;
      const lineCostPrice = Number(line.costPrice) || 0;

      // Lookup product for name/code snapshot
      const product = await db.product.findUnique({
        where: { id: line.productId },
      });
      if (!product) {
        return NextResponse.json(
          { error: `Product not found: ${line.productId}` },
          { status: 400 }
        );
      }

      // Check stock at the specified godown
      const productStock = await db.productStock.findUnique({
        where: { productId_godownId: { productId: line.productId, godownId } },
      });
      const available = productStock?.quantity || 0;
      if (available < lineQty) {
        return NextResponse.json(
          {
            error: `Insufficient stock for '${product.name}' at ${godown.name}. Available: ${available}, Requested: ${lineQty}.`,
            stockViolation: true,
            productId: line.productId,
            available,
            requested: lineQty,
          },
          { status: 409 }
        );
      }

      // Calculate line-level amounts
      const lineGross = safeFinancialRound(lineQty * lineRate);
      const lineDiscAmt = safeFinancialRound(lineGross * (lineDiscPct / 100));
      const lineTotal = safeFinancialSubtract(lineGross, lineDiscAmt);

      processedLines.push({
        productId: line.productId,
        productName: product.name,
        productCode: product.productCode,
        quantity: lineQty,
        rate: lineRate,
        discountPercent: lineDiscPct,
        discountAmount: lineDiscAmt,
        total: lineTotal,
        costPrice: lineCostPrice || product.costPrice,
        productStockId: productStock?.id || null,
      });
    }

    // ── Calculate totals ──
    const subTotal = safeFinancialRound(
      processedLines.reduce((sum, l) => safeFinancialAdd(sum, l.total), 0)
    );
    const globalDiscPct = Number(discountPercent) || 0;
    const discountAmount = safeFinancialRound(subTotal * (globalDiscPct / 100));
    const afterDiscount = safeFinancialSubtract(subTotal, discountAmount);
    const vatPct = Number(vatPercentage) || 0;
    const vatAmount = safeFinancialRound(afterDiscount * (vatPct / 100));
    const grandTotal = safeFinancialAdd(afterDiscount, vatAmount);

    // ── Payment breakdown ──
    const cashAmt = Number(cashAmount) || 0;
    const cardAmt = Number(cardAmount) || 0;
    const mfsAmt = Number(mfsAmount) || 0;
    const totalPaid = safeFinancialAdd(safeFinancialAdd(cashAmt, cardAmt), mfsAmt);
    const cashChange = safeFinancialSubtract(totalPaid, grandTotal);

    if (totalPaid < grandTotal) {
      return NextResponse.json(
        {
          error: `Payment amount (${totalPaid}) is less than grand total (${grandTotal}). Short by ${safeFinancialSubtract(grandTotal, totalPaid)}.`,
          paymentShortfall: true,
          totalPaid,
          grandTotal,
        },
        { status: 400 }
      );
    }

    // ── Period-close lock check ──
    const now = new Date();
    const periodLock = await checkPeriodClose(now);
    if (periodLock) return periodLock;

    // ── Atomic Transaction ──
    const result = await db.$transaction(async (tx) => {
      // 1. Generate receiptNo: POS-XXXXX
      const lastSale = await tx.posSale.findFirst({
        orderBy: { receiptNo: 'desc' },
        select: { receiptNo: true },
      });
      let nextNum = 1;
      if (lastSale?.receiptNo) {
        const match = lastSale.receiptNo.match(/POS-(\d+)/);
        if (match) {
          nextNum = parseInt(match[1], 10) + 1;
        }
      }
      const receiptNo = `POS-${String(nextNum).padStart(5, '0')}`;

      // 2. Create PosSale with PosSaleLines
      const posSale = await tx.posSale.create({
        data: {
          receiptNo,
          customerId: customerId || null,
          godownId,
          date: now,
          subTotal,
          discountPercent: globalDiscPct,
          discountAmount,
          vatPercentage: vatPct,
          vatAmount,
          grandTotal,
          cashAmount: cashAmt,
          cardAmount: cardAmt,
          mfsAmount: mfsAmt,
          cashChange: cashChange > 0 ? cashChange : 0,
          status: 'Completed',
          cashierName: cashierName || userName || null,
          companyId: effectiveCompanyId,
          lines: {
            create: processedLines.map((l) => ({
              productId: l.productId,
              productName: l.productName,
              productCode: l.productCode,
              quantity: l.quantity,
              rate: l.rate,
              discountPercent: l.discountPercent,
              discountAmount: l.discountAmount,
              total: l.total,
              costPrice: l.costPrice,
              companyId: effectiveCompanyId,
            })),
          },
        },
        include: {
          lines: true,
          customer: true,
          godown: true,
        },
      });

      // 3. Decrement ProductStock & Create StockEntry OUT for each line
      for (const line of processedLines) {
        if (line.productStockId) {
          const currentStock = await tx.productStock.findUnique({
            where: { id: line.productStockId },
          });
          if (!currentStock || currentStock.quantity < line.quantity) {
            throw new Error(`Insufficient stock for product ${line.productName} (re-check in transaction failed)`);
          }
          await tx.productStock.update({
            where: { id: line.productStockId },
            data: {
              quantity: { decrement: line.quantity },
              totalValue: safeFinancialRound(
                safeFinancialSubtract(currentStock.quantity, line.quantity) * currentStock.costPrice
              ),
            },
          });
        }

        // Create StockEntry OUT
        await tx.stockEntry.create({
          data: {
            productId: line.productId,
            godownId,
            type: 'OUT',
            quantity: line.quantity,
            costPrice: line.costPrice,
            totalCost: safeFinancialRound(line.quantity * line.costPrice),
            reference: receiptNo,
            referenceType: 'PosSale',
            companyId: effectiveCompanyId,
            date: now,
          },
        });
      }

      // 4. Auto-create SalesOrder for ledger integration
      const lastSO = await tx.salesOrder.findFirst({
        orderBy: { invoiceNo: 'desc' },
        select: { invoiceNo: true },
      });
      let soNextNum = 1;
      if (lastSO?.invoiceNo) {
        const match = lastSO.invoiceNo.match(/SO-(\d+)/);
        if (match) {
          soNextNum = parseInt(match[1], 10) + 1;
        }
      }
      const invoiceNo = `SO-${String(soNextNum).padStart(5, '0')}`;

      const salesOrder = await tx.salesOrder.create({
        data: {
          invoiceNo,
          customerId: customerId || 'walk-in',
          date: now,
          godownId,
          subTotal,
          discount: discountAmount,
          vatPercentage: vatPct,
          vatAmount,
          grandTotal,
          cashAmount: cashAmt,
          bankAmount: cardAmt,
          mfsAmount: mfsAmt,
          cardAmount: cardAmt,
          status: 'Delivered',
          notes: `Auto-created from POS receipt ${receiptNo}`,
          companyId: effectiveCompanyId,
          lines: {
            create: processedLines.map((l) => ({
              productId: l.productId,
              quantity: l.quantity,
              rate: l.rate,
              discountPercent: l.discountPercent,
              discountAmount: l.discountAmount,
              vatAmount: 0,
              total: l.total,
            })),
          },
        },
      });

      // Link the SalesOrder to the PosSale
      await tx.posSale.update({
        where: { id: posSale.id },
        data: { salesOrderId: salesOrder.id },
      });

      // 5. Double-Entry Ledger Auto-Post
      // Find or create relevant COA accounts
      const salesRevenueCoaId = await findOrCreateCoAAccount(
        tx, 'Sales Revenue', 'Income', 'COA-INC', effectiveCompanyId
      );

      // Generate ledger entry codes
      const lastLedgerEntry = await tx.ledgerEntry.findFirst({
        orderBy: { entryCode: 'desc' },
        select: { entryCode: true },
      });
      let ledgerNextNum = 1;
      if (lastLedgerEntry?.entryCode) {
        const match = lastLedgerEntry.entryCode.match(/LED-(\d+)/);
        if (match) {
          ledgerNextNum = parseInt(match[1], 10) + 1;
        }
      }

      // Build debit entries for each payment method that has a non-zero amount
      const ledgerEntries: Array<{ entryCode: string; accountId: string; account: string; debit: number; credit: number; particulars: string }> = [];
      let entryCounter = ledgerNextNum;

      // Debit: Cash in Hand (for cash portion)
      if (cashAmt > 0) {
        const cashCoaId = await findOrCreateCoAAccount(
          tx, 'Cash in Hand', 'Asset', 'COA-AST', effectiveCompanyId
        );
        ledgerEntries.push({
          entryCode: `LED-${String(entryCounter).padStart(5, '0')}`,
          accountId: cashCoaId,
          account: 'Cash in Hand',
          debit: cashAmt,
          credit: 0,
          particulars: `POS Receipt ${receiptNo} - Cash`,
        });
        entryCounter++;
      }

      // Debit: Bank Account (for card portion)
      if (cardAmt > 0) {
        const bankCoaId = await findOrCreateCoAAccount(
          tx, 'Bank Account', 'Asset', 'COA-AST', effectiveCompanyId
        );
        ledgerEntries.push({
          entryCode: `LED-${String(entryCounter).padStart(5, '0')}`,
          accountId: bankCoaId,
          account: 'Bank Account',
          debit: cardAmt,
          credit: 0,
          particulars: `POS Receipt ${receiptNo} - Card`,
        });
        entryCounter++;
      }

      // Debit: MFS Account (for mobile financial services portion)
      if (mfsAmt > 0) {
        const mfsCoaId = await findOrCreateCoAAccount(
          tx, 'MFS Account', 'Asset', 'COA-AST', effectiveCompanyId
        );
        ledgerEntries.push({
          entryCode: `LED-${String(entryCounter).padStart(5, '0')}`,
          accountId: mfsCoaId,
          account: 'MFS Account',
          debit: mfsAmt,
          credit: 0,
          particulars: `POS Receipt ${receiptNo} - MFS`,
        });
        entryCounter++;
      }

      // Credit: Sales Revenue (for entire grandTotal)
      ledgerEntries.push({
        entryCode: `LED-${String(entryCounter).padStart(5, '0')}`,
        accountId: salesRevenueCoaId,
        account: 'Sales Revenue',
        debit: 0,
        credit: grandTotal,
        particulars: `POS Receipt ${receiptNo} - Sales`,
      });
      entryCounter++;

      // Create all ledger entries
      for (const entry of ledgerEntries) {
        await tx.ledgerEntry.create({
          data: {
            entryCode: entry.entryCode,
            date: now,
            accountId: entry.accountId,
            account: entry.account,
            particulars: entry.particulars,
            debit: entry.debit,
            credit: entry.credit,
            reference: receiptNo,
            referenceType: 'PosSale',
            companyId: effectiveCompanyId,
          },
        });
      }

      // Create LedgerAutoPost record
      const lastAutoPost = await tx.ledgerAutoPost.findFirst({
        orderBy: { code: 'desc' },
        select: { code: true },
      });
      let lapNextNum = 1;
      if (lastAutoPost?.code) {
        const match = lastAutoPost.code.match(/LAP-(\d+)/);
        if (match) {
          lapNextNum = parseInt(match[1], 10) + 1;
        }
      }
      const lapCode = `LAP-${String(lapNextNum).padStart(5, '0')}`;

      await tx.ledgerAutoPost.create({
        data: {
          code: lapCode,
          sourceType: 'PosSale',
          sourceId: posSale.id,
          sourceCode: receiptNo,
          debitEntryId: ledgerEntries[0]?.entryCode || '',
          creditEntryId: ledgerEntries[ledgerEntries.length - 1]?.entryCode || '',
          debitAccount: ledgerEntries.map(e => e.account).filter(a => a !== 'Sales Revenue').join(' + ') || 'Cash in Hand',
          creditAccount: 'Sales Revenue',
          amount: grandTotal,
          postingDate: now,
          status: 'Posted',
          postedBy: userId,
          companyId: effectiveCompanyId,
        },
      });

      // 6. Activity Logger with "POS-Retail-Core" token
      await logUserActivity({
        action: 'CREATE',
        module: 'POS-Retail-Core',
        recordId: posSale.id,
        recordLabel: receiptNo,
        userId,
        userName,
        details: JSON.stringify({
          type: 'PosSale',
          receiptNo,
          godownId,
          customerId: customerId || 'walk-in',
          grandTotal,
          lineCount: processedLines.length,
          cashAmount: cashAmt,
          cardAmount: cardAmt,
          mfsAmount: mfsAmt,
          cashChange: cashChange > 0 ? cashChange : 0,
          salesOrderId: salesOrder.id,
          invoiceNo,
        }),
      });

      return { posSale, salesOrder, receiptNo };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating POS sale:', error);
    const message = error instanceof Error ? error.message : 'Failed to create POS sale';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
