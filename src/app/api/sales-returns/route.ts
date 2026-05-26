import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity, checkPeriodClose } from '@/lib/api-security';

// GET /api/sales-returns - List all sales returns with relations
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'SalesReturns', 'GET');
  if (!security.authorized) return security.response;

  try {
    const salesReturns = await db.salesReturn.findMany({
      where: { isActive: true },
      include: {
        salesOrder: {
          include: {
            customer: true,
          },
        },
        customer: true,
        godown: true,
        lines: {
          include: {
            product: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(salesReturns);
  } catch (error) {
    console.error('Error fetching sales returns:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sales returns' },
      { status: 500 }
    );
  }
}

// POST /api/sales-returns - Create sales return with lines
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'SalesReturns', 'POST');
  if (!security.authorized) return security.response;

  try {
    const body = await request.json();
    const {
      salesOrderId,
      customerId,
      godownId,
      date,
      discount,
      vatPercentage,
      reason,
      creditMemoCode,
      lines,
    } = body;

    if (!salesOrderId || !customerId || !date || !lines || lines.length === 0) {
      return NextResponse.json(
        { error: 'salesOrderId, customerId, date, and lines are required' },
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

    // Auto-calculate subTotal from sum of line totals (before header discount and VAT)
    const subTotal = processedLines.reduce((sum: number, line) => sum + line.total, 0);
    const headerDiscount = discount || 0;
    const vatPct = vatPercentage || 0;
    const afterDiscount = subTotal - headerDiscount;
    const vatAmount = Math.round(afterDiscount * (vatPct / 100) * 100) / 100;
    const grandTotal = Math.round((afterDiscount + vatAmount) * 100) / 100;

    const result = await db.$transaction(async (tx) => {
      // Auto-generate returnNo as SRT-XXXXX (5-digit zero-padded)
      const lastSR = await tx.salesReturn.findFirst({
        orderBy: { returnNo: 'desc' },
        select: { returnNo: true },
      });

      let nextNum = 1;
      if (lastSR?.returnNo) {
        const match = lastSR.returnNo.match(/SRT-(\d+)/);
        if (match) {
          nextNum = parseInt(match[1], 10) + 1;
        }
      }
      const returnNo = `SRT-${String(nextNum).padStart(5, '0')}`;

      // CRITICAL VALIDATION: Cumulative return quantity vs original order quantity
      for (const line of processedLines) {
        const salesOrderLine = await tx.salesOrderLine.findFirst({
          where: { salesOrderId, productId: line.productId },
        });
        if (!salesOrderLine) {
          throw new Error(`Product not found in Sales Order. Cannot return items that were not part of the original order.`);
        }

        // Get total already-returned quantity for this product across all existing returns
        const existingReturns = await tx.salesReturn.findMany({
          where: { salesOrderId, isActive: true, status: { not: 'Rejected' } },
          include: { lines: { where: { productId: line.productId } } },
        });
        const totalAlreadyReturned = existingReturns.reduce((sum, ret) =>
          sum + ret.lines.reduce((lineSum, l) => lineSum + l.quantity, 0), 0
        );

        if (totalAlreadyReturned + line.quantity > salesOrderLine.quantity) {
          throw new Error(
            `Cumulative return quantity (${totalAlreadyReturned + line.quantity}) exceeds original order quantity (${salesOrderLine.quantity}) for this product. Already returned: ${totalAlreadyReturned}, Attempting: ${line.quantity}`
          );
        }
      }

      // Create sales return with lines
      const salesReturn = await tx.salesReturn.create({
        data: {
          returnNo,
          salesOrderId,
          customerId,
          godownId: godownId || null,
          date: new Date(date),
          subTotal,
          discount: headerDiscount,
          vatPercentage: vatPct,
          vatAmount,
          reason: reason || null,
          grandTotal,
          creditMemoCode: creditMemoCode || null,
          status: 'Pending',
          lines: {
            create: processedLines,
          },
        },
        include: {
          salesOrder: { include: { customer: true } },
          customer: true,
          godown: true,
          lines: { include: { product: true } },
        },
      });

      // Create StockEntry (type="IN") for each line — items are restocked to the godown
      for (const line of processedLines) {
        await tx.stockEntry.create({
          data: {
            productId: line.productId,
            godownId: godownId || null,
            type: 'IN',
            quantity: line.quantity,
            reference: returnNo,
            referenceType: 'SalesReturn',
            date: new Date(date),
          },
        });
      }

      // Create AuditLog entry
      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'SalesReturns',
          recordId: salesReturn.id,
          recordLabel: returnNo,
          details: JSON.stringify({
            salesOrderId,
            customerId,
            subTotal,
            discount: headerDiscount,
            vatPercentage: vatPct,
            vatAmount,
            grandTotal,
            lineCount: processedLines.length,
          }),
        },
      });

      return salesReturn;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating sales return:', error);
    const message = error instanceof Error ? error.message : 'Failed to create sales return';
    // Return 400 for validation errors, 500 for others
    const status = message.includes('exceeds') || message.includes('not found') || message.includes('Cumulative') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
