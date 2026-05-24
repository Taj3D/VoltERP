import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const productId = searchParams.get('productId');

    // Build where clause
    const where: Record<string, unknown> = { isActive: true };

    if (customerId) {
      where.customerId = customerId;
    }

    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom);
      if (dateTo) where.date.lte = new Date(dateTo);
    }

    // If productId is provided, filter SOs that contain that product
    if (productId) {
      where.lines = {
        some: { productId },
      };
    }

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
        salesReturns: true,
      },
      orderBy: { date: 'desc' },
    });

    // Calculate profit margin for each order
    const salesWithMargin = salesOrders.map((so) => {
      const costOfGoods = so.lines.reduce(
        (sum, line) => sum + (line.product?.costPrice || 0) * line.quantity,
        0
      );
      const revenue = so.grandTotal;
      const profit = revenue - costOfGoods;
      const profitMargin = revenue > 0 ? ((profit / revenue) * 100).toFixed(2) : '0.00';

      return {
        ...so,
        costOfGoods,
        profit,
        profitMargin: parseFloat(profitMargin),
      };
    });

    // Summary calculations
    const totalRevenue = salesOrders.reduce((sum, so) => sum + so.grandTotal, 0);
    const totalCost = salesOrders.reduce(
      (sum, so) =>
        sum + so.lines.reduce((s, l) => s + (l.product?.costPrice || 0) * l.quantity, 0),
      0
    );
    const totalReturns = salesOrders.reduce(
      (sum, so) => sum + so.salesReturns.reduce((rs, r) => rs + r.grandTotal, 0),
      0
    );
    const totalProfit = totalRevenue - totalCost;
    const confirmedCount = salesOrders.filter((so) => so.status === 'Confirmed').length;
    const draftCount = salesOrders.filter((so) => so.status === 'Draft').length;

    // Product-wise sales summary
    const productSummary = new Map<
      string,
      {
        productId: string;
        productName: string;
        totalQuantity: number;
        totalRevenue: number;
        totalCost: number;
        profit: number;
      }
    >();
    for (const so of salesOrders) {
      for (const line of so.lines) {
        const cost = (line.product?.costPrice || 0) * line.quantity;
        const existing = productSummary.get(line.productId);
        if (existing) {
          existing.totalQuantity += line.quantity;
          existing.totalRevenue += line.total;
          existing.totalCost += cost;
          existing.profit = existing.totalRevenue - existing.totalCost;
        } else {
          productSummary.set(line.productId, {
            productId: line.productId,
            productName: line.product?.name || 'Unknown',
            totalQuantity: line.quantity,
            totalRevenue: line.total,
            totalCost: cost,
            profit: line.total - cost,
          });
        }
      }
    }

    return NextResponse.json({
      salesOrders: salesWithMargin,
      summary: {
        totalOrders: salesOrders.length,
        confirmedCount,
        draftCount,
        totalRevenue,
        totalCost,
        totalProfit,
        totalReturns,
        netRevenue: totalRevenue - totalReturns,
        overallMargin: totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(2) : '0.00',
      },
      productSummary: Array.from(productSummary.values()),
    });
  } catch (error) {
    console.error('Error fetching sales report:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sales report' },
      { status: 500 }
    );
  }
}
