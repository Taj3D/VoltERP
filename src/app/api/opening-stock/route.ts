import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  checkPeriodClose,
  safeFinancialRound,
  safeFinancialAdd,
  maskFinancialArray,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// GET /api/opening-stock — List opening stock entries with multi-tenant isolation + VAT Auditor masking
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Stock', 'GET');
  if (!security.authorized) return security.response;

  const { role, companyId } = security.user;

  try {
    const stockEntries = await db.stockEntry.findMany({
      where: {
        isActive: true,
        referenceType: 'OpeningStock',
        ...(companyId ? { companyId } : {}),
      },
      include: {
        product: true,
        batch: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Apply VAT Auditor financial masking on costPrice, totalCost fields
    const masked = maskFinancialArray(
      stockEntries as Record<string, unknown>[],
      role,
      ['costPrice', 'totalCost']
    );

    return NextResponse.json(masked);
  } catch (error) {
    console.error('Error fetching opening stock entries:', error);
    return NextResponse.json(
      { error: 'Failed to fetch opening stock entries' },
      { status: 500 }
    );
  }
}

// POST /api/opening-stock — Post Product Opening Stock with atomic CoA double-entry
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Stock', 'POST');
  if (!security.authorized) return security.response;

  const { id: userId, name: userName, companyId } = security.user;

  try {
    const body = await request.json();
    const {
      productId,
      godownId,
      quantity,
      costPrice,
      batchNumber,
      expiryDate,
      date,
      notes,
    } = body;

    // ── Required field validation ──
    if (!productId || !godownId || quantity === undefined || quantity === null || costPrice === undefined || costPrice === null) {
      return NextResponse.json(
        { error: 'productId, godownId, quantity, and costPrice are required' },
        { status: 400 }
      );
    }

    // ── Numeric integrity: reject zero, negative, NaN ──
    const parsedQty = parseFloat(String(quantity));
    const parsedCost = parseFloat(String(costPrice));

    if (isNaN(parsedQty) || parsedQty <= 0) {
      return NextResponse.json(
        { error: 'quantity must be a positive number (zero, negative, and NaN are rejected)' },
        { status: 400 }
      );
    }

    if (isNaN(parsedCost) || parsedCost <= 0) {
      return NextResponse.json(
        { error: 'costPrice must be a positive number (zero, negative, and NaN are rejected)' },
        { status: 400 }
      );
    }

    const safeQty = safeFinancialRound(parsedQty);
    const safeCost = safeFinancialRound(parsedCost);
    const totalCost = safeFinancialRound(safeQty * safeCost);

    // ── Period-close lock check ──
    const transactionDate = date ? new Date(date as string) : new Date();
    const periodLock = await checkPeriodClose(transactionDate);
    if (periodLock) return periodLock;

    // ── XSS sanitization on string inputs ──
    const sanitize = (val: unknown): string | null => {
      if (!val || typeof val !== 'string') return null;
      return val.replace(/<[^>]*>/g, '').trim() || null;
    };

    const cleanBatchNumber = sanitize(batchNumber);
    const cleanNotes = sanitize(notes);

    // ── Atomic transaction ──
    const result = await db.$transaction(async (tx) => {
      // Godown SUSPENDED check
      const godown = await tx.godown.findFirst({
        where: { id: String(godownId), isActive: true },
      });

      if (!godown) {
        throw new Error('Godown not found or inactive');
      }

      if (godown.status === 'SUSPENDED') {
        throw new Error('Godown is SUSPENDED. Stock operations are blocked.');
      }

      // Find or create ProductStock record (upsert on @@unique([productId, godownId]))
      const existingStock = await tx.productStock.findFirst({
        where: {
          productId: String(productId),
          godownId: String(godownId),
          isActive: true,
        },
      });

      let productStock;
      if (existingStock) {
        const newQty = safeFinancialAdd(existingStock.quantity, safeQty);
        const newTotalValue = safeFinancialRound(newQty * safeCost);
        productStock = await tx.productStock.update({
          where: { id: existingStock.id },
          data: {
            quantity: newQty,
            costPrice: safeCost,
            totalValue: newTotalValue,
          },
        });
      } else {
        productStock = await tx.productStock.create({
          data: {
            productId: String(productId),
            godownId: String(godownId),
            quantity: safeQty,
            costPrice: safeCost,
            totalValue: totalCost,
            companyId: companyId || null,
          },
        });
      }

      // Create StockEntry with type: "IN", referenceType: "OpeningStock"
      const stockEntry = await tx.stockEntry.create({
        data: {
          productId: String(productId),
          godownId: String(godownId),
          type: 'IN',
          quantity: safeQty,
          costPrice: safeCost,
          totalCost,
          referenceType: 'OpeningStock',
          date: transactionDate,
          notes: cleanNotes,
          companyId: companyId || null,
        },
      });

      // Create or update BatchMaster if batchNumber is provided
      if (cleanBatchNumber) {
        const existingBatch = await tx.batchMaster.findFirst({
          where: {
            batchNumber: cleanBatchNumber,
            productId: String(productId),
            isActive: true,
            ...(companyId ? { companyId } : {}),
          },
        });

        if (existingBatch) {
          const newBatchQty = safeFinancialAdd(existingBatch.quantity, safeQty);
          const newBatchTotalCost = safeFinancialRound(newBatchQty * safeCost);
          await tx.batchMaster.update({
            where: { id: existingBatch.id },
            data: {
              quantity: newBatchQty,
              costPrice: safeCost,
              totalCost: newBatchTotalCost,
              expiryDate: expiryDate ? new Date(expiryDate as string) : existingBatch.expiryDate,
              godownId: String(godownId),
            },
          });

          // Link stock entry to batch
          await tx.stockEntry.update({
            where: { id: stockEntry.id },
            data: { batchId: existingBatch.id },
          });
        } else {
          const newBatch = await tx.batchMaster.create({
            data: {
              batchNumber: cleanBatchNumber,
              productId: String(productId),
              godownId: String(godownId),
              quantity: safeQty,
              costPrice: safeCost,
              totalCost,
              expiryDate: expiryDate ? new Date(expiryDate as string) : null,
              companyId: companyId || null,
            },
          });

          // Link stock entry to batch
          await tx.stockEntry.update({
            where: { id: stockEntry.id },
            data: { batchId: newBatch.id },
          });
        }
      }

      // ── Double-Entry Auto-Post to CoA ──
      // Fetch product details for naming
      const product = await tx.product.findUnique({
        where: { id: String(productId) },
        select: { name: true, productCode: true, openingStock: true, coaAccountId: true },
      });

      if (!product) {
        throw new Error('Product not found');
      }

      // Find Inventory Asset parent node
      const inventoryAssetParent = await tx.chartOfAccount.findFirst({
        where: {
          classification: 'Asset',
          name: { contains: 'Inventory' },
          companyId: companyId || null,
          isActive: true,
        },
      });

      // Find or create product-specific sub-node under Inventory Asset
      let inventoryNode = await tx.chartOfAccount.findFirst({
        where: {
          name: product.name,
          classification: 'Asset',
          parentAccountId: inventoryAssetParent?.id || null,
          companyId: companyId || null,
          isActive: true,
        },
      });

      if (!inventoryNode) {
        const code = `COA-INV-${Date.now()}`;
        inventoryNode = await tx.chartOfAccount.create({
          data: {
            code,
            name: product.name,
            classification: 'Asset',
            parentAccountId: inventoryAssetParent?.id || null,
            openingBalance: 0,
            openingBalanceType: 'Dr',
            companyId: companyId || null,
            isActive: true,
          },
        });
      }

      // Find or create Retained Earnings under Equity
      let retainedEarnings = await tx.chartOfAccount.findFirst({
        where: {
          classification: 'Equity',
          name: { contains: 'Retained Earnings' },
          companyId: companyId || null,
          isActive: true,
        },
      });

      if (!retainedEarnings) {
        const reCode = `COA-RE-${Date.now()}`;
        retainedEarnings = await tx.chartOfAccount.create({
          data: {
            code: reCode,
            name: 'Retained Earnings',
            classification: 'Equity',
            openingBalance: 0,
            openingBalanceType: 'Cr',
            companyId: companyId || null,
            isActive: true,
          },
        });
      }

      // Double-entry: Debit Inventory Asset, Credit Retained Earnings
      const entryCodeDr = `LED-${Date.now()}-DR`;
      const entryCodeCr = `LED-${Date.now()}-CR`;

      await tx.ledgerEntry.create({
        data: {
          entryCode: entryCodeDr,
          date: transactionDate,
          accountId: inventoryNode.id,
          account: inventoryNode.name,
          particulars: `Opening Stock: ${product.name} (${safeQty} units @ ${safeCost})`,
          debit: totalCost,
          credit: 0,
          reference: `OpeningStock-${product.productCode}`,
          referenceType: 'OpeningStock',
          companyId: companyId || null,
          isActive: true,
        },
      });

      await tx.ledgerEntry.create({
        data: {
          entryCode: entryCodeCr,
          date: transactionDate,
          accountId: retainedEarnings.id,
          account: retainedEarnings.name,
          particulars: `Opening Stock Contra: ${product.name}`,
          debit: 0,
          credit: totalCost,
          reference: `OpeningStock-${product.productCode}`,
          referenceType: 'OpeningStock',
          companyId: companyId || null,
          isActive: true,
        },
      });

      // LedgerAutoPost tracking
      const lapCode = `LAP-${Date.now()}`;
      await tx.ledgerAutoPost.create({
        data: {
          code: lapCode,
          sourceType: 'OpeningStock',
          sourceId: stockEntry.id,
          sourceCode: product.productCode,
          debitEntryId: entryCodeDr,
          creditEntryId: entryCodeCr,
          debitAccount: inventoryNode.name,
          creditAccount: retainedEarnings.name,
          amount: totalCost,
          postingDate: transactionDate,
          status: 'Posted',
          companyId: companyId || null,
          postedBy: userName,
        },
      });

      // Update Product: coaAccountId + openingStock
      await tx.product.update({
        where: { id: String(productId) },
        data: {
          coaAccountId: inventoryNode.id,
          openingStock: safeFinancialAdd(product.openingStock, safeQty),
        },
      });

      return { stockEntry, productStock, totalCost, inventoryNodeId: inventoryNode.id };
    });

    // Log activity with Inv-Stock-Core module token
    await logUserActivity({
      action: 'CREATE',
      module: 'Inv-Stock-Core',
      recordId: result.stockEntry.id,
      recordLabel: `OpeningStock-${productId}`,
      userId,
      userName,
      details: JSON.stringify({
        productId: String(productId),
        godownId: String(godownId),
        quantity: safeQty,
        costPrice: safeCost,
        totalCost,
        batchNumber: cleanBatchNumber,
        companyId: companyId || null,
      }),
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    console.error('Error posting opening stock:', error);
    const message = error instanceof Error ? error.message : 'Failed to post opening stock';

    // Return 400 for known business logic errors
    if (
      message.includes('SUSPENDED') ||
      message.includes('not found') ||
      message.includes('required')
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
