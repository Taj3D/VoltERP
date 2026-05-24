import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    // Build where clause
    const where: Record<string, unknown> = { isActive: true };

    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom);
      if (dateTo) where.date.lte = new Date(dateTo);
    }

    const transfers = await db.stockTransfer.findMany({
      where,
      include: {
        fromGodown: true,
        toGodown: true,
        lines: {
          include: {
            product: {
              include: {
                category: true,
                company: true,
              },
            },
          },
        },
      },
      orderBy: { date: 'desc' },
    });

    // Enrich with total quantity and value
    const transfersWithDetails = transfers.map((transfer) => {
      const totalQuantity = transfer.lines.reduce((sum, l) => sum + l.quantity, 0);
      const totalValue = transfer.lines.reduce(
        (sum, l) => sum + (l.product?.costPrice || 0) * l.quantity,
        0
      );

      return {
        id: transfer.id,
        transferNo: transfer.transferNo,
        date: transfer.date,
        fromGodown: transfer.fromGodown,
        toGodown: transfer.toGodown,
        status: transfer.status,
        notes: transfer.notes,
        lines: transfer.lines,
        totalQuantity,
        totalValue,
        lineCount: transfer.lines.length,
      };
    });

    // Summary
    const totalTransfers = transfers.length;
    const pendingCount = transfers.filter((t) => t.status === 'Pending').length;
    const completedCount = transfers.filter((t) => t.status === 'Completed').length;
    const totalItemsTransferred = transfersWithDetails.reduce(
      (sum, t) => sum + t.totalQuantity,
      0
    );

    // Godown-wise summary
    const fromGodownSummary = new Map<string, { godown: string; count: number; totalItems: number }>();
    const toGodownSummary = new Map<string, { godown: string; count: number; totalItems: number }>();

    for (const t of transfersWithDetails) {
      // From godown
      const fromKey = t.fromGodown?.id || 'unknown';
      const fromExisting = fromGodownSummary.get(fromKey);
      if (fromExisting) {
        fromExisting.count += 1;
        fromExisting.totalItems += t.totalQuantity;
      } else {
        fromGodownSummary.set(fromKey, {
          godown: t.fromGodown?.name || 'Unknown',
          count: 1,
          totalItems: t.totalQuantity,
        });
      }

      // To godown
      const toKey = t.toGodown?.id || 'unknown';
      const toExisting = toGodownSummary.get(toKey);
      if (toExisting) {
        toExisting.count += 1;
        toExisting.totalItems += t.totalQuantity;
      } else {
        toGodownSummary.set(toKey, {
          godown: t.toGodown?.name || 'Unknown',
          count: 1,
          totalItems: t.totalQuantity,
        });
      }
    }

    return NextResponse.json({
      transfers: transfersWithDetails,
      summary: {
        totalTransfers,
        pendingCount,
        completedCount,
        totalItemsTransferred,
        fromGodownSummary: Array.from(fromGodownSummary.values()),
        toGodownSummary: Array.from(toGodownSummary.values()),
      },
    });
  } catch (error) {
    console.error('Error fetching transfer report:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transfer report' },
      { status: 500 }
    );
  }
}
