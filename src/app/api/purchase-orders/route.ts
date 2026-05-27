import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity, checkPeriodClose, maskForVatAuditor } from '@/lib/api-security';

// GET /api/purchase-orders - List all purchase orders with relations
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'PurchaseOrders', 'GET');
  if (!security.authorized) return security.response;

  // Dealer: completely blocked from purchase order records
  if (security.user?.role === 'dealer') {
    return NextResponse.json({ error: 'Access denied. Dealers cannot access purchase order records.' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const supplierId = searchParams.get('supplierId');

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (supplierId) where.supplierId = supplierId;

    const purchaseOrders = await db.purchaseOrder.findMany({
      where,
      include: {
        supplier: true,
        godown: true,
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
      ? purchaseOrders.map(order => ({
          ...maskForVatAuditor(order, security.user.role as any, ['subTotal', 'discount', 'vatAmount', 'grandTotal']),
          lines: order.lines?.map((line: any) =>
            maskForVatAuditor(line, security.user.role as any, ['rate', 'discountPercent', 'discountAmount', 'vatAmount', 'total'])
          ),
        }))
      : purchaseOrders;
    return NextResponse.json(maskedOrders);
  } catch (error) {
    console.error('Error fetching purchase orders:', error);
    return NextResponse.json(
      { error: 'Failed to fetch purchase orders' },
      { status: 500 }
    );
  }
}

// POST /api/purchase-orders - Create purchase order with lines
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'PurchaseOrders', 'POST');
  if (!security.authorized) return security.response;

  // Dealer: completely blocked from purchase order records
  if (security.user?.role === 'dealer') {
    return NextResponse.json({ error: 'Access denied. Dealers cannot access purchase order records.' }, { status: 403 });
  }

  // SR: cannot create purchase orders
  if (security.user?.role === 'sr') {
    return NextResponse.json({ error: 'Access denied. SRs cannot create purchase orders.' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { supplierId, date, godownId, notes, discount, vatPercentage, lines } = body;

    if (!supplierId || !date || !lines || lines.length === 0) {
      return NextResponse.json(
        { error: 'supplierId, date, and lines are required' },
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
    const afterDiscount = subTotal - totalDiscount;
    const vatAmount = Math.round(afterDiscount * (vatPct / 100) * 100) / 100;
    const grandTotal = Math.round((afterDiscount + vatAmount) * 100) / 100;

    // Auto-generate poNumber with 5-digit padding: PUR-XXXXX
    const lastPO = await db.purchaseOrder.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { poNumber: true },
    });

    let nextNum = 1;
    if (lastPO?.poNumber) {
      const match = lastPO.poNumber.match(/PUR-(\d+)/);
      if (match) {
        nextNum = parseInt(match[1], 10) + 1;
      }
    }
    const poNumber = `PUR-${String(nextNum).padStart(5, '0')}`;

    const result = await db.$transaction(async (tx) => {
      // Create purchase order with lines
      const purchaseOrder = await tx.purchaseOrder.create({
        data: {
          poNumber,
          supplierId,
          date: new Date(date),
          godownId: godownId || null,
          subTotal,
          discount: totalDiscount,
          vatPercentage: vatPct,
          vatAmount,
          grandTotal,
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
          supplier: true,
          godown: true,
          lines: { include: { product: true } },
        },
      });

      // Create StockEntry for each line (type="IN")
      for (const line of processedLines) {
        await tx.stockEntry.create({
          data: {
            productId: line.productId,
            godownId: godownId || null,
            type: 'IN',
            quantity: line.quantity,
            reference: poNumber,
            referenceType: 'PurchaseOrder',
            date: new Date(date),
          },
        });
      }

      // Create audit log
      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'PurchaseOrders',
          recordId: purchaseOrder.id,
          recordLabel: poNumber,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({ supplierId, grandTotal, lineCount: processedLines.length }),
        },
      });

      return purchaseOrder;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating purchase order:', error);
    return NextResponse.json(
      { error: 'Failed to create purchase order' },
      { status: 500 }
    );
  }
}
