import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity, checkPeriodClose } from '@/lib/api-security';

// GET /api/transfers - List all stock transfers with relations
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'StockTransfers', 'GET');
  if (!security.authorized) return security.response;

  // Dealer: completely blocked from transfer records
  if (security.user?.role === 'dealer') {
    return NextResponse.json({ error: 'Access denied. Dealers cannot access transfer records.' }, { status: 403 });
  }

  try {
    const transfers = await db.stockTransfer.findMany({
      where: { isActive: true },
      include: {
        fromGodown: true,
        toGodown: true,
        lines: {
          include: {
            product: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(transfers);
  } catch (error) {
    console.error('Error fetching transfers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transfers' },
      { status: 500 }
    );
  }
}

// POST /api/transfers - Create stock transfer with lines
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'StockTransfers', 'POST');
  if (!security.authorized) return security.response;

  // Dealer: completely blocked from transfer records
  if (security.user?.role === 'dealer') {
    return NextResponse.json({ error: 'Access denied. Dealers cannot access transfer records.' }, { status: 403 });
  }

  // SR: cannot create transfers
  if (security.user?.role === 'sr') {
    return NextResponse.json({ error: 'Access denied. SRs cannot create or modify transfers.' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { fromGodownId, toGodownId, date, notes, lines } = body;

    if (!fromGodownId || !toGodownId || !date || !lines || lines.length === 0) {
      return NextResponse.json(
        { error: 'fromGodownId, toGodownId, date, and lines are required' },
        { status: 400 }
      );
    }

    // Period-close lock check
    const periodLock = await checkPeriodClose(date);
    if (periodLock) return periodLock;

    // Validate fromGodownId !== toGodownId
    if (fromGodownId === toGodownId) {
      return NextResponse.json(
        { error: 'Source and destination godown cannot be the same' },
        { status: 400 }
      );
    }

    // Stock availability check at source godown
    for (const line of lines) {
      // Calculate current stock at source godown
      const stockIns = await db.stockEntry.findMany({
        where: { productId: line.productId, godownId: fromGodownId, type: 'IN' },
        select: { quantity: true },
      });
      const stockOuts = await db.stockEntry.findMany({
        where: { productId: line.productId, godownId: fromGodownId, type: 'OUT' },
        select: { quantity: true },
      });
      const currentStock = stockIns.reduce((s, e) => s + e.quantity, 0) - stockOuts.reduce((s, e) => s + e.quantity, 0);

      if (currentStock < line.quantity) {
        return NextResponse.json(
          { error: `Insufficient stock at source godown. Product has ${currentStock} units available, but ${line.quantity} requested for transfer.` },
          { status: 400 }
        );
      }
    }

    const result = await db.$transaction(async (tx) => {
      // Auto-generate transferNo as TRN-XXXXX (5-digit zero-padded)
      const lastTransfer = await tx.stockTransfer.findFirst({
        orderBy: { transferNo: 'desc' },
        select: { transferNo: true },
      });

      let nextNum = 1;
      if (lastTransfer?.transferNo) {
        const match = lastTransfer.transferNo.match(/TRN-(\d+)/);
        if (match) {
          nextNum = parseInt(match[1], 10) + 1;
        }
      }
      const transferNo = `TRN-${String(nextNum).padStart(5, '0')}`;

      // Auto-calculate totalItems and totalQuantity
      const totalItems = lines.length;
      const totalQuantity = lines.reduce(
        (sum: number, line: { quantity: number }) => sum + (line.quantity || 0),
        0
      );

      // Create stock transfer with lines
      const transfer = await tx.stockTransfer.create({
        data: {
          transferNo,
          fromGodownId,
          toGodownId,
          date: new Date(date),
          shippingStatus: 'Pending',
          status: 'Pending',
          totalItems,
          totalQuantity,
          notes: notes || null,
          lines: {
            create: lines.map(
              (line: {
                productId: string;
                quantity: number;
              }) => ({
                productId: line.productId,
                quantity: line.quantity,
              })
            ),
          },
        },
        include: {
          fromGodown: true,
          toGodown: true,
          lines: { include: { product: true } },
        },
      });

      // Stock Locking: Create StockEntry (type="OUT") from source godown for each line
      // Do NOT create IN entries yet — those are only created when shippingStatus moves to "Delivered"
      for (const line of lines) {
        await tx.stockEntry.create({
          data: {
            productId: line.productId,
            godownId: fromGodownId,
            type: 'OUT',
            quantity: line.quantity,
            reference: transferNo,
            referenceType: 'Transfer',
            date: new Date(date),
          },
        });
      }

      // Create AuditLog entry
      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'StockTransfers',
          recordId: transfer.id,
          recordLabel: transferNo,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({
            fromGodownId,
            toGodownId,
            totalItems,
            totalQuantity,
            lineCount: lines.length,
          }),
        },
      });

      return transfer;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating transfer:', error);
    return NextResponse.json(
      { error: 'Failed to create transfer' },
      { status: 500 }
    );
  }
}
