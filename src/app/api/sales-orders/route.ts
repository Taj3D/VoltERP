import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity, checkPeriodClose, maskForVatAuditor } from '@/lib/api-security';

// GET /api/sales-orders - List all sales orders with relations
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'SalesOrders', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const customerId = searchParams.get('customerId');

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;

    const salesOrders = await db.salesOrder.findMany({
      where,
      include: {
        customer: true,
        godown: true,
        paymentOption: true,
        lines: {
          include: {
            product: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    // VAT Auditor masking
    const maskedOrders = security.user.role === 'vat_auditor'
      ? salesOrders.map(order => ({
          ...maskForVatAuditor(order, security.user.role as any, ['subTotal', 'discount', 'vatAmount', 'grandTotal']),
          lines: order.lines?.map((line: any) =>
            maskForVatAuditor(line, security.user.role as any, ['rate', 'discountPercent', 'discountAmount', 'vatAmount', 'total'])
          ),
        }))
      : salesOrders;
    return NextResponse.json(maskedOrders);
  } catch (error) {
    console.error('Error fetching sales orders:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sales orders' },
      { status: 500 }
    );
  }
}

// POST /api/sales-orders - Create sales order with lines
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'SalesOrders', 'POST');
  if (!security.authorized) return security.response;

  try {
    const body = await request.json();
    const { customerId, date, godownId, discount, paymentOptionId, notes, vatPercentage, lines } =
      body;

    if (!customerId || !date || !lines || lines.length === 0) {
      return NextResponse.json(
        { error: 'customerId, date, and lines are required' },
        { status: 400 }
      );
    }

    // Period-close lock check
    const periodLock = await checkPeriodClose(new Date(date));
    if (periodLock) return periodLock;

    // Calculate line-level totals server-side to prevent floating-point drift
    const processedLines = lines.map((line: any) => {
      const lineQty = Number(line.quantity) || 0;
      const lineRate = Number(line.rate) || 0;
      const lineDiscPct = Number(line.discountPercent) || 0;
      const lineDiscAmt = Number(line.discountAmount) || Math.round(lineQty * lineRate * (lineDiscPct / 100) * 100) / 100;
      const lineGross = Math.round(lineQty * lineRate * 100) / 100;
      const afterLineDisc = Math.round((lineGross - lineDiscAmt) * 100) / 100;
      const lineVatAmt = Number(line.vatAmount) || 0;
      const lineTotal = Math.round((afterLineDisc + lineVatAmt) * 100) / 100;
      return {
        productId: line.productId,
        quantity: lineQty,
        rate: lineRate,
        discountPercent: lineDiscPct,
        discountAmount: lineDiscAmt,
        vatAmount: lineVatAmt,
        total: lineTotal,
      };
    });
    const subTotal = Math.round(processedLines.reduce((sum, l) => sum + l.total, 0) * 100) / 100;

    const totalDiscount = discount || 0;
    const vatPct = vatPercentage || 0;

    // Credit limit validation: outstanding = total orders - total collections
    const customer = await db.customer.findUnique({ where: { id: customerId } });
    if (customer && customer.creditLimit > 0) {
      const subTotalCalc = processedLines.reduce((sum, l) => sum + l.total, 0);
      const afterDiscountCalc = subTotalCalc - totalDiscount;
      const vatAmtCalc = Math.round(afterDiscountCalc * (vatPct / 100) * 100) / 100;
      const grandTotalCalc = Math.round((afterDiscountCalc + vatAmtCalc) * 100) / 100;

      // Outstanding balance = total order value - total cash collections received
      const existingOrders = await db.salesOrder.findMany({
        where: { customerId, status: { not: 'Cancelled' } },
        select: { grandTotal: true },
      });
      const totalOrderValue = existingOrders.reduce((sum, o) => sum + o.grandTotal, 0);

      const existingCollections = await db.cashCollection.findMany({
        where: { customerId, status: 'Approved', isActive: true },
        select: { amount: true },
      });
      const totalCollections = existingCollections.reduce((sum, c) => sum + c.amount, 0);

      const outstandingBalance = totalOrderValue - totalCollections;

      if (outstandingBalance + grandTotalCalc > customer.creditLimit) {
        return NextResponse.json(
          { error: `Credit limit exceeded. Outstanding: ৳${outstandingBalance.toLocaleString()}, New Order: ৳${grandTotalCalc.toLocaleString()}, Limit: ৳${customer.creditLimit.toLocaleString()}` },
          { status: 400 }
        );
      }
    }

    const afterDiscount = subTotal - totalDiscount;
    const vatAmount = Math.round(afterDiscount * (vatPct / 100) * 100) / 100;
    const grandTotal = Math.round((afterDiscount + vatAmount) * 100) / 100;

    // Auto-generate invoiceNo with 5-digit padding: SO-XXXXX
    const lastSO = await db.salesOrder.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { invoiceNo: true },
    });

    let nextNum = 1;
    if (lastSO?.invoiceNo) {
      const match = lastSO.invoiceNo.match(/SO-(\d+)/);
      if (match) {
        nextNum = parseInt(match[1], 10) + 1;
      }
    }
    const invoiceNo = `SO-${String(nextNum).padStart(5, '0')}`;

    const result = await db.$transaction(async (tx) => {
      // STOCK SAFETY: Verify sufficient stock before creating sales order
      for (const line of processedLines) {
        const product = await tx.product.findUnique({ where: { id: line.productId } });
        if (!product) throw new Error(`Product not found: ${line.productId}`);

        const stockWhere: { productId: string; godownId?: string } = { productId: line.productId };
        if (godownId) stockWhere.godownId = godownId;

        const stockIns = await tx.stockEntry.aggregate({
          where: { ...stockWhere, type: 'IN' },
          _sum: { quantity: true },
        });
        const stockOuts = await tx.stockEntry.aggregate({
          where: { ...stockWhere, type: 'OUT' },
          _sum: { quantity: true },
        });

        const currentStock = (product.openingStock || 0) + (stockIns._sum.quantity || 0) - (stockOuts._sum.quantity || 0);

        if (currentStock < line.quantity) {
          throw new Error(`Insufficient stock for "${product.name}". Available: ${currentStock}, Requested: ${line.quantity}. Transaction rolled back.`);
        }
      }

      // Create sales order with lines
      const salesOrder = await tx.salesOrder.create({
        data: {
          invoiceNo,
          customerId,
          date: new Date(date),
          godownId: godownId || null,
          subTotal,
          discount: totalDiscount,
          vatPercentage: vatPct,
          vatAmount,
          grandTotal,
          paymentOptionId: paymentOptionId || null,
          notes: notes || null,
          lines: {
            create: processedLines.map((line) => ({
              productId: line.productId,
              quantity: line.quantity,
              rate: line.rate,
              discountPercent: line.discountPercent,
              discountAmount: line.discountAmount,
              vatAmount: line.vatAmount,
              total: line.total,
            })),
          },
        },
        include: {
          customer: true,
          godown: true,
          paymentOption: true,
          lines: { include: { product: true } },
        },
      });

      // Create StockEntry for each line (type="OUT")
      for (const line of processedLines) {
        await tx.stockEntry.create({
          data: {
            productId: line.productId,
            godownId: godownId || null,
            type: 'OUT',
            quantity: line.quantity,
            reference: invoiceNo,
            referenceType: 'SalesOrder',
            date: new Date(date),
          },
        });
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'SalesOrders',
          recordId: salesOrder.id,
          recordLabel: invoiceNo,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({ customerId, grandTotal, lineCount: processedLines.length }),
        },
      });

      return salesOrder;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating sales order:', error);
    return NextResponse.json(
      { error: 'Failed to create sales order' },
      { status: 500 }
    );
  }
}
