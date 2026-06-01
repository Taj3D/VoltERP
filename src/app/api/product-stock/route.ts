import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  safeFinancialRound,
  maskFinancialArray,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// GET /api/product-stock — List location-wise stock with multi-tenant isolation + VAT Auditor masking
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Stock', 'GET');
  if (!security.authorized) return security.response;

  const { role, companyId } = security.user;

  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId');
    const godownId = searchParams.get('godownId');

    const stocks = await db.productStock.findMany({
      where: {
        isActive: true,
        ...(companyId ? { companyId } : {}),
        ...(productId ? { productId } : {}),
        ...(godownId ? { godownId } : {}),
      },
      include: {
        product: true,
        godown: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Apply VAT Auditor masking on costPrice, totalValue fields
    const masked = maskFinancialArray(
      stocks as Record<string, unknown>[],
      role,
      ['costPrice', 'totalValue']
    );

    return NextResponse.json(masked);
  } catch (error) {
    console.error('Error fetching product stock:', error);
    return NextResponse.json(
      { error: 'Failed to fetch product stock' },
      { status: 500 }
    );
  }
}

// POST /api/product-stock — Create/update product stock at a location
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
      alertLevel,
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
    const totalValue = safeFinancialRound(safeQty * safeCost);
    const safeAlertLevel = alertLevel ? safeFinancialRound(parseFloat(String(alertLevel))) : 0;

    // ── Godown SUSPENDED check ──
    const godown = await db.godown.findFirst({
      where: { id: String(godownId), isActive: true },
    });

    if (!godown) {
      return NextResponse.json(
        { error: 'Godown not found or inactive' },
        { status: 400 }
      );
    }

    if (godown.status === 'SUSPENDED') {
      return NextResponse.json(
        { error: 'Godown is SUSPENDED. Stock operations are blocked.' },
        { status: 400 }
      );
    }

    // ── Upsert on @@unique([productId, godownId]) ──
    const productStock = await db.productStock.upsert({
      where: {
        productId_godownId: {
          productId: String(productId),
          godownId: String(godownId),
        },
      },
      update: {
        quantity: safeQty,
        costPrice: safeCost,
        totalValue,
        alertLevel: safeAlertLevel,
      },
      create: {
        productId: String(productId),
        godownId: String(godownId),
        quantity: safeQty,
        costPrice: safeCost,
        totalValue,
        alertLevel: safeAlertLevel,
        companyId: companyId || null,
      },
      include: {
        product: true,
        godown: true,
      },
    });

    // Log activity with Inv-Stock-Core module token
    await logUserActivity({
      action: 'CREATE',
      module: 'Inv-Stock-Core',
      recordId: productStock.id,
      recordLabel: `ProductStock-${productId}-${godownId}`,
      userId,
      userName,
      details: JSON.stringify({
        productId: String(productId),
        godownId: String(godownId),
        quantity: safeQty,
        costPrice: safeCost,
        totalValue,
        companyId: companyId || null,
      }),
    });

    return NextResponse.json(productStock, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating/updating product stock:', error);
    const message = error instanceof Error ? error.message : 'Failed to create/update product stock';

    if (message.includes('SUSPENDED') || message.includes('not found')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
