import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  checkPeriodClose,
  safeFinancialRound,
  safeFinancialAdd,
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
// POST /api/pos/void — Void a POS Sale
// Reverses stock (increments ProductStock), creates StockEntry IN records,
// creates reverse ledger entries, and marks the sale as voided.
// ─────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'PosSale', 'POST');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;
  const userId = security.user.id;
  const userName = security.user.name;
  const userRole = security.user.role;

  try {
    const body = await request.json();
    const { posSaleId, voidReason } = body;

    if (!posSaleId) {
      return NextResponse.json(
        { error: 'posSaleId is required' },
        { status: 400 }
      );
    }

    // Only admin can void POS sales
    if (userRole !== 'admin') {
      return NextResponse.json(
        { error: 'Only administrators can void POS sales' },
        { status: 403 }
      );
    }

    // Fetch the POS sale with lines
    const posSale = await db.posSale.findUnique({
      where: { id: posSaleId },
      include: {
        lines: true,
        godown: true,
      },
    });

    if (!posSale) {
      return NextResponse.json(
        { error: 'POS sale not found' },
        { status: 404 }
      );
    }

    if (posSale.status === 'Voided') {
      return NextResponse.json(
        { error: 'This sale is already voided' },
        { status: 400 }
      );
    }

    // Cross-tenant validation
    if (companyId && posSale.companyId && posSale.companyId !== companyId) {
      return NextResponse.json(
        { error: 'POS sale not found' },
        { status: 404 }
      );
    }

    // Period-close lock check
    const periodLock = await checkPeriodClose(posSale.date);
    if (periodLock) return periodLock;

    // ── Atomic Transaction ──
    const result = await db.$transaction(async (tx) => {
      const now = new Date();
      const effectiveCompanyId = posSale.companyId || companyId || null;

      // 1. Mark PosSale as Voided
      await tx.posSale.update({
        where: { id: posSaleId },
        data: {
          status: 'Voided',
          voidReason: voidReason || null,
          voidedBy: userId,
          voidedAt: now,
        },
      });

      // 2. Reverse stock: Increment ProductStock & Create StockEntry IN for each line
      for (const line of posSale.lines) {
        // Increment ProductStock
        if (posSale.godownId) {
          const productStock = await tx.productStock.findUnique({
            where: {
              productId_godownId: {
                productId: line.productId,
                godownId: posSale.godownId,
              },
            },
          });

          if (productStock) {
            await tx.productStock.update({
              where: { id: productStock.id },
              data: {
                quantity: { increment: line.quantity },
                totalValue: safeFinancialRound(
                  safeFinancialAdd(productStock.quantity, line.quantity) * productStock.costPrice
                ),
              },
            });
          }
        }

        // Create StockEntry IN (reversal)
        await tx.stockEntry.create({
          data: {
            productId: line.productId,
            godownId: posSale.godownId || null,
            type: 'IN',
            quantity: line.quantity,
            costPrice: line.costPrice,
            totalCost: safeFinancialRound(line.quantity * line.costPrice),
            reference: `VOID-${posSale.receiptNo}`,
            referenceType: 'PosSaleVoid',
            companyId: effectiveCompanyId,
            date: now,
            notes: `Void of POS receipt ${posSale.receiptNo}${voidReason ? ` — ${voidReason}` : ''}`,
          },
        });
      }

      // 3. Create reverse ledger entries
      // Find the COA accounts used in the original sale
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

      const reverseEntries: Array<{
        entryCode: string;
        accountId: string;
        account: string;
        debit: number;
        credit: number;
        particulars: string;
      }> = [];
      let entryCounter = ledgerNextNum;

      // Reverse: Credit Cash in Hand (was debited)
      if (posSale.cashAmount > 0) {
        const cashCoaId = await findOrCreateCoAAccount(
          tx, 'Cash in Hand', 'Asset', 'COA-AST', effectiveCompanyId
        );
        reverseEntries.push({
          entryCode: `LED-${String(entryCounter).padStart(5, '0')}`,
          accountId: cashCoaId,
          account: 'Cash in Hand',
          debit: 0,
          credit: posSale.cashAmount,
          particulars: `VOID ${posSale.receiptNo} - Reverse Cash`,
        });
        entryCounter++;
      }

      // Reverse: Credit Bank Account (was debited)
      if (posSale.cardAmount > 0) {
        const bankCoaId = await findOrCreateCoAAccount(
          tx, 'Bank Account', 'Asset', 'COA-AST', effectiveCompanyId
        );
        reverseEntries.push({
          entryCode: `LED-${String(entryCounter).padStart(5, '0')}`,
          accountId: bankCoaId,
          account: 'Bank Account',
          debit: 0,
          credit: posSale.cardAmount,
          particulars: `VOID ${posSale.receiptNo} - Reverse Card`,
        });
        entryCounter++;
      }

      // Reverse: Credit MFS Account (was debited)
      if (posSale.mfsAmount > 0) {
        const mfsCoaId = await findOrCreateCoAAccount(
          tx, 'MFS Account', 'Asset', 'COA-AST', effectiveCompanyId
        );
        reverseEntries.push({
          entryCode: `LED-${String(entryCounter).padStart(5, '0')}`,
          accountId: mfsCoaId,
          account: 'MFS Account',
          debit: 0,
          credit: posSale.mfsAmount,
          particulars: `VOID ${posSale.receiptNo} - Reverse MFS`,
        });
        entryCounter++;
      }

      // Reverse: Debit Sales Revenue (was credited)
      reverseEntries.push({
        entryCode: `LED-${String(entryCounter).padStart(5, '0')}`,
        accountId: salesRevenueCoaId,
        account: 'Sales Revenue',
        debit: posSale.grandTotal,
        credit: 0,
        particulars: `VOID ${posSale.receiptNo} - Reverse Sales Revenue`,
      });
      entryCounter++;

      // Create all reverse ledger entries
      for (const entry of reverseEntries) {
        await tx.ledgerEntry.create({
          data: {
            entryCode: entry.entryCode,
            date: now,
            accountId: entry.accountId,
            account: entry.account,
            particulars: entry.particulars,
            debit: entry.debit,
            credit: entry.credit,
            reference: `VOID-${posSale.receiptNo}`,
            referenceType: 'PosSaleVoid',
            companyId: effectiveCompanyId,
          },
        });
      }

      // 4. If a SalesOrder was auto-created, cancel it
      if (posSale.salesOrderId) {
        const salesOrder = await tx.salesOrder.findUnique({
          where: { id: posSale.salesOrderId },
        });
        if (salesOrder && salesOrder.status !== 'Cancelled') {
          await tx.salesOrder.update({
            where: { id: posSale.salesOrderId },
            data: { status: 'Cancelled', notes: `Cancelled due to void of POS receipt ${posSale.receiptNo}` },
          });
        }
      }

      // 5. Activity Logger with "POS-Retail-Core" token
      await logUserActivity({
        action: 'DELETE',
        module: 'POS-Retail-Core',
        recordId: posSale.id,
        recordLabel: posSale.receiptNo,
        userId,
        userName,
        details: JSON.stringify({
          type: 'PosSaleVoid',
          receiptNo: posSale.receiptNo,
          voidReason: voidReason || 'No reason provided',
          grandTotal: posSale.grandTotal,
          lineCount: posSale.lines.length,
          salesOrderId: posSale.salesOrderId,
        }),
      });

      return {
        id: posSale.id,
        receiptNo: posSale.receiptNo,
        status: 'Voided',
        voidReason: voidReason || null,
        voidedBy: userId,
        voidedAt: now,
        reversedStockLines: posSale.lines.length,
        salesOrderCancelled: !!posSale.salesOrderId,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error voiding POS sale:', error);
    const message = error instanceof Error ? error.message : 'Failed to void POS sale';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
