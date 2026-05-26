import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity, checkPeriodClose } from '@/lib/api-security';

// GET /api/purchase-returns - List all purchase returns with relations
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'PurchaseReturns', 'GET');
  if (!security.authorized) return security.response;

  // Dealer: completely blocked from purchase return records
  if (security.user?.role === 'dealer') {
    return NextResponse.json({ error: 'Access denied. Dealers cannot access purchase return records.' }, { status: 403 });
  }

  try {
    const purchaseReturns = await db.purchaseReturn.findMany({
      where: { isActive: true },
      include: {
        purchaseOrder: {
          include: {
            supplier: true,
          },
        },
        supplier: true,
        lines: {
          include: {
            product: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(purchaseReturns);
  } catch (error) {
    console.error('Error fetching purchase returns:', error);
    return NextResponse.json(
      { error: 'Failed to fetch purchase returns' },
      { status: 500 }
    );
  }
}

// POST /api/purchase-returns - Create purchase return with lines
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'PurchaseReturns', 'POST');
  if (!security.authorized) return security.response;

  // Dealer: completely blocked from purchase return records
  if (security.user?.role === 'dealer') {
    return NextResponse.json({ error: 'Access denied. Dealers cannot access purchase return records.' }, { status: 403 });
  }

  // SR: cannot create purchase returns
  if (security.user?.role === 'sr') {
    return NextResponse.json({ error: 'Access denied. SRs cannot create or modify purchase returns.' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const {
      purchaseOrderId,
      supplierId,
      date,
      discount,
      vatPercentage,
      reason,
      debitNoteCode,
      challanRef,
      lines,
    } = body;

    if (!purchaseOrderId || !supplierId || !date || !lines || lines.length === 0) {
      return NextResponse.json(
        { error: 'purchaseOrderId, supplierId, date, and lines are required' },
        { status: 400 }
      );
    }

    // Period-close lock check
    const periodLock = await checkPeriodClose(date);
    if (periodLock) return periodLock;

    // Calculate line-level totals
    const processedLines = lines.map(
      (line: {
        productId: string;
        quantity: number;
        rate: number;
        discountPercent?: number;
        discountAmount?: number;
        vatAmount?: number;
        total: number;
      }) => {
        const lineDiscountPercent = line.discountPercent || 0;
        const lineRate = line.rate || 0;
        const lineQty = line.quantity || 0;
        const lineGross = lineRate * lineQty;
        const lineDiscountAmount = line.discountAmount || Math.round(lineGross * (lineDiscountPercent / 100) * 100) / 100;
        const afterLineDiscount = lineGross - lineDiscountAmount;
        const lineVatAmount = line.vatAmount || 0;
        const lineTotal = Math.round((afterLineDiscount + lineVatAmount) * 100) / 100;

        return {
          productId: line.productId,
          quantity: lineQty,
          rate: lineRate,
          discountPercent: lineDiscountPercent,
          discountAmount: lineDiscountAmount,
          vatAmount: lineVatAmount,
          total: lineTotal,
        };
      }
    );

    // Auto-calculate subTotal from sum of line totals
    const subTotal = processedLines.reduce((sum: number, line) => sum + line.total, 0);
    const headerDiscount = discount || 0;
    const vatPct = vatPercentage || 0;
    const afterDiscount = subTotal - headerDiscount;
    const vatAmount = Math.round(afterDiscount * (vatPct / 100) * 100) / 100;
    const grandTotal = Math.round((afterDiscount + vatAmount) * 100) / 100;

    const result = await db.$transaction(async (tx) => {
      // Auto-generate returnNo as PRT-XXXXX (5-digit zero-padded)
      const lastPR = await tx.purchaseReturn.findFirst({
        orderBy: { returnNo: 'desc' },
        select: { returnNo: true },
      });

      let nextNum = 1;
      if (lastPR?.returnNo) {
        const match = lastPR.returnNo.match(/PRT-(\d+)/);
        if (match) {
          nextNum = parseInt(match[1], 10) + 1;
        }
      }
      const returnNo = `PRT-${String(nextNum).padStart(5, '0')}`;

      // Auto-generate debitNoteCode as DN-XXXXX if not provided
      let effectiveDebitNoteCode = debitNoteCode;
      if (!effectiveDebitNoteCode) {
        const lastDN = await tx.purchaseReturn.findFirst({
          orderBy: { debitNoteCode: 'desc' },
          select: { debitNoteCode: true },
        });

        let dnNum = 1;
        if (lastDN?.debitNoteCode) {
          const match = lastDN.debitNoteCode.match(/DN-(\d+)/);
          if (match) {
            dnNum = parseInt(match[1], 10) + 1;
          }
        }
        effectiveDebitNoteCode = `DN-${String(dnNum).padStart(5, '0')}`;
      }

      // CRITICAL VALIDATION: Cumulative return quantity vs original order quantity
      for (const line of processedLines) {
        const purchaseOrderLine = await tx.purchaseOrderLine.findFirst({
          where: { purchaseOrderId, productId: line.productId },
        });
        if (!purchaseOrderLine) {
          throw new Error(`Product not found in Purchase Order. Cannot return items that were not part of the original order.`);
        }

        // Get total already-returned quantity for this product across all existing returns
        const existingReturns = await tx.purchaseReturn.findMany({
          where: { purchaseOrderId, isActive: true, status: { not: 'Rejected' } },
          include: { lines: { where: { productId: line.productId } } },
        });
        const totalAlreadyReturned = existingReturns.reduce((sum, ret) =>
          sum + ret.lines.reduce((lineSum, l) => lineSum + l.quantity, 0), 0
        );

        if (totalAlreadyReturned + line.quantity > purchaseOrderLine.quantity) {
          throw new Error(
            `Cumulative return quantity (${totalAlreadyReturned + line.quantity}) exceeds original order quantity (${purchaseOrderLine.quantity}) for this product. Already returned: ${totalAlreadyReturned}, Attempting: ${line.quantity}`
          );
        }
      }

      // Create purchase return with lines
      const purchaseReturn = await tx.purchaseReturn.create({
        data: {
          returnNo,
          purchaseOrderId,
          supplierId,
          date: new Date(date),
          subTotal,
          discount: headerDiscount,
          vatPercentage: vatPct,
          vatAmount,
          reason: reason || null,
          grandTotal,
          debitNoteCode: effectiveDebitNoteCode,
          challanRef: challanRef || null,
          status: 'Pending',
          lines: {
            create: processedLines,
          },
        },
        include: {
          purchaseOrder: { include: { supplier: true } },
          supplier: true,
          lines: { include: { product: true } },
        },
      });

      // Create StockEntry (type="OUT") for each line — items are removed from inventory
      for (const line of processedLines) {
        await tx.stockEntry.create({
          data: {
            productId: line.productId,
            godownId: null,
            type: 'OUT',
            quantity: line.quantity,
            reference: returnNo,
            referenceType: 'PurchaseReturn',
            date: new Date(date),
          },
        });
      }

      // Create AuditLog entry
      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'PurchaseReturns',
          recordId: purchaseReturn.id,
          recordLabel: returnNo,
          details: JSON.stringify({
            purchaseOrderId,
            supplierId,
            subTotal,
            discount: headerDiscount,
            vatPercentage: vatPct,
            vatAmount,
            grandTotal,
            debitNoteCode: effectiveDebitNoteCode,
            lineCount: processedLines.length,
          }),
        },
      });

      return purchaseReturn;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating purchase return:', error);
    const message = error instanceof Error ? error.message : 'Failed to create purchase return';
    const status = message.includes('exceeds') || message.includes('not found') || message.includes('Cumulative') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
