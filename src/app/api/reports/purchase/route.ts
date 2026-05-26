import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, validateVatMode } from '@/lib/api-security';
import type { UserRole } from '@/lib/api-security';

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Reports', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { searchParams } = new URL(request.url);
    const supplierId = searchParams.get('supplierId');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const productId = searchParams.get('productId');
    // VAT-001: Validate vatMode
    const rawVatMode = searchParams.get('vatMode') === 'true';
    const userRole = security.user.role as UserRole;
    const vatMode = validateVatMode(rawVatMode, userRole);

    // Build where clause
    const where: Record<string, unknown> = { isActive: true };

    if (supplierId) {
      where.supplierId = supplierId;
    }

    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom);
      if (dateTo) where.date.lte = new Date(dateTo);
    }

    // If productId is provided, filter POs that contain that product
    if (productId) {
      where.lines = {
        some: { productId },
      };
    }

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
        purchaseReturn: true,
      },
      orderBy: { date: 'desc' },
    });

    // Calculate summary
    const totalPOValue = purchaseOrders.reduce((sum, po) => sum + po.grandTotal, 0);
    const totalReturns = purchaseOrders.reduce(
      (sum, po) => sum + po.purchaseReturn.reduce((rs, r) => rs + r.grandTotal, 0),
      0
    );
    const confirmedCount = purchaseOrders.filter((po) => po.status === 'Confirmed').length;
    const draftCount = purchaseOrders.filter((po) => po.status === 'Draft').length;

    // Product-wise summary
    const productSummary = new Map<
      string,
      { productId: string; productName: string; totalQuantity: number; totalValue: number }
    >();
    for (const po of purchaseOrders) {
      for (const line of po.lines) {
        const existing = productSummary.get(line.productId);
        if (existing) {
          existing.totalQuantity += line.quantity;
          existing.totalValue += line.total;
        } else {
          productSummary.set(line.productId, {
            productId: line.productId,
            productName: line.product?.name || 'Unknown',
            totalQuantity: line.quantity,
            totalValue: line.total,
          });
        }
      }
    }

    return NextResponse.json({
      purchaseOrders,
      summary: {
        totalOrders: purchaseOrders.length,
        confirmedCount,
        draftCount,
        totalPOValue: vatMode ? 'N/A (Audit Mode)' : totalPOValue,
        totalReturns,
        netPurchaseValue: vatMode ? 'N/A (Audit Mode)' : (totalPOValue - totalReturns),
      },
      productSummary: Array.from(productSummary.values()),
    });
  } catch (error) {
    console.error('Error fetching purchase report:', error);
    return NextResponse.json(
      { error: 'Failed to fetch purchase report' },
      { status: 500 }
    );
  }
}
