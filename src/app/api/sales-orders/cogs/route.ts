import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  maskForVatAuditorAccounting,
  safeFinancialRound,
  safeFinancialAdd,
} from '@/lib/api-security';

// ============================================================
// GET /api/sales-orders/cogs — COGS Aggregation Engine
// Returns: { totalCOGS, totalRevenue, totalGrossProfit, averageMargin, breakdown }
// Aggregates from SalesOrderLine joined with SalesOrder
// (filtered by status not Draft/Cancelled, isActive=true)
// ============================================================

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'SalesOrders', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const customerId = searchParams.get('customerId');
    const productId = searchParams.get('productId');
    const companyId = searchParams.get('companyId');

    // Build where clause for SalesOrder
    const orderWhere: Record<string, unknown> = {
      isActive: true,
      status: { notIn: ['Draft', 'Cancelled'] },
    };

    // Date range filter
    if (dateFrom || dateTo) {
      const dateFilter: Record<string, Date> = {};
      if (dateFrom) dateFilter.gte = new Date(dateFrom);
      if (dateTo) dateFilter.lte = new Date(dateTo);
      orderWhere.date = dateFilter;
    }

    if (customerId) orderWhere.customerId = customerId;

    // Company isolation
    const effectiveCompanyId = companyId ||
      (security.user.companyId && security.user.role !== 'admin' ? security.user.companyId : null);
    if (effectiveCompanyId) {
      orderWhere.companyId = effectiveCompanyId;
    }

    // Fetch all matching sales orders with their lines and products
    const salesOrders = await db.salesOrder.findMany({
      where: orderWhere,
      include: {
        lines: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                productCode: true,
              },
            },
          },
        },
      },
    });

    // Aggregate COGS data by product
    const productBreakdownMap = new Map<string, {
      productId: string;
      productName: string;
      totalQtySold: number;
      totalRevenue: number;
      totalCOGS: number;
      grossProfit: number;
      margin: number;
    }>();

    let totalCOGS = 0;
    let totalRevenue = 0;
    let totalGrossProfit = 0;

    for (const order of salesOrders) {
      for (const line of order.lines) {
        // Optional product filter
        if (productId && line.productId !== productId) continue;

        const lineRevenue = safeFinancialRound(line.total);
        const lineCOGS = safeFinancialRound(line.cogsAmount);
        const lineGP = safeFinancialRound(line.grossProfit);

        totalRevenue = safeFinancialAdd(totalRevenue, lineRevenue);
        totalCOGS = safeFinancialAdd(totalCOGS, lineCOGS);
        totalGrossProfit = safeFinancialAdd(totalGrossProfit, lineGP);

        // Per-product aggregation
        const existing = productBreakdownMap.get(line.productId);
        if (existing) {
          existing.totalQtySold = safeFinancialRound(existing.totalQtySold + line.quantity);
          existing.totalRevenue = safeFinancialAdd(existing.totalRevenue, lineRevenue);
          existing.totalCOGS = safeFinancialAdd(existing.totalCOGS, lineCOGS);
          existing.grossProfit = safeFinancialAdd(existing.grossProfit, lineGP);
          existing.margin = existing.totalRevenue > 0
            ? safeFinancialRound((existing.grossProfit / existing.totalRevenue) * 100)
            : 0;
        } else {
          productBreakdownMap.set(line.productId, {
            productId: line.productId,
            productName: line.product?.name || 'Unknown',
            totalQtySold: safeFinancialRound(line.quantity),
            totalRevenue: lineRevenue,
            totalCOGS: lineCOGS,
            grossProfit: lineGP,
            margin: lineRevenue > 0
              ? safeFinancialRound((lineGP / lineRevenue) * 100)
              : 0,
          });
        }
      }
    }

    const averageMargin = totalRevenue > 0
      ? safeFinancialRound((totalGrossProfit / totalRevenue) * 100)
      : 0;

    const breakdown = Array.from(productBreakdownMap.values()).sort(
      (a, b) => b.totalRevenue - a.totalRevenue
    );

    const result = {
      totalCOGS: safeFinancialRound(totalCOGS),
      totalRevenue: safeFinancialRound(totalRevenue),
      totalGrossProfit: safeFinancialRound(totalGrossProfit),
      averageMargin,
      breakdown,
      filters: {
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        customerId: customerId || null,
        productId: productId || null,
        companyId: effectiveCompanyId || null,
      },
      orderCount: salesOrders.length,
    };

    // Apply VAT Auditor masking for accounting fields
    const masked = maskForVatAuditorAccounting(
      result as Record<string, unknown>,
      security.user.role
    );

    return NextResponse.json(masked);
  } catch (error) {
    console.error('[SalesOrders/COGS] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to compute COGS aggregation' },
      { status: 500 }
    );
  }
}
