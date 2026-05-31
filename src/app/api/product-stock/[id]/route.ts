import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  checkFinancialDeletePermission,
  safeFinancialRound,
  maskForVatAuditor,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// GET /api/product-stock/[id] — Get single product stock with cross-tenant validation + VAT masking
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Stock', 'GET');
  if (!security.authorized) return security.response;

  const { role, companyId } = security.user;
  const { id } = await params;

  try {
    const stock = await db.productStock.findFirst({
      where: { id, isActive: true },
      include: {
        product: true,
        godown: true,
      },
    });

    if (!stock) {
      return NextResponse.json(
        { error: 'Product stock not found' },
        { status: 404 }
      );
    }

    // Cross-tenant validation
    if (companyId && stock.companyId && stock.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Product stock not found' },
        { status: 404 }
      );
    }

    // Apply VAT Auditor masking on costPrice, totalValue fields
    const masked = maskForVatAuditor(
      stock as Record<string, unknown>,
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

// PUT /api/product-stock/[id] — Update product stock with cross-tenant validation
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Stock', 'PUT');
  if (!security.authorized) return security.response;

  const { id: userId, name: userName, companyId } = security.user;
  const { id } = await params;

  try {
    // Pre-fetch for cross-tenant validation
    const existing = await db.productStock.findFirst({
      where: { id, isActive: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Product stock not found' },
        { status: 404 }
      );
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Product stock not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const {
      quantity,
      costPrice,
      godownId,
      alertLevel,
    } = body;

    // ── Numeric integrity if quantity or costPrice provided ──
    let safeQty = existing.quantity;
    let safeCost = existing.costPrice;

    if (quantity !== undefined && quantity !== null) {
      const parsedQty = parseFloat(String(quantity));
      if (isNaN(parsedQty) || parsedQty <= 0) {
        return NextResponse.json(
          { error: 'quantity must be a positive number (zero, negative, and NaN are rejected)' },
          { status: 400 }
        );
      }
      safeQty = safeFinancialRound(parsedQty);
    }

    if (costPrice !== undefined && costPrice !== null) {
      const parsedCost = parseFloat(String(costPrice));
      if (isNaN(parsedCost) || parsedCost <= 0) {
        return NextResponse.json(
          { error: 'costPrice must be a positive number (zero, negative, and NaN are rejected)' },
          { status: 400 }
        );
      }
      safeCost = safeFinancialRound(parsedCost);
    }

    // Recalculate totalValue
    const totalValue = safeFinancialRound(safeQty * safeCost);

    // ── Godown SUSPENDED check if changing godownId ──
    const effectiveGodownId = godownId ? String(godownId) : existing.godownId;
    if (godownId && godownId !== existing.godownId) {
      const godown = await db.godown.findFirst({
        where: { id: String(godownId), isActive: true },
      });

      if (godown && godown.status === 'SUSPENDED') {
        return NextResponse.json(
          { error: 'Godown is SUSPENDED. Stock operations are blocked.' },
          { status: 400 }
        );
      }
    }

    const safeAlertLevel = alertLevel !== undefined && alertLevel !== null
      ? safeFinancialRound(parseFloat(String(alertLevel)))
      : existing.alertLevel;

    const updated = await db.productStock.update({
      where: { id },
      data: {
        quantity: safeQty,
        costPrice: safeCost,
        totalValue,
        godownId: effectiveGodownId,
        alertLevel: safeAlertLevel,
      },
      include: {
        product: true,
        godown: true,
      },
    });

    // Log activity with Inv-Stock-Core module token
    await logUserActivity({
      action: 'UPDATE',
      module: 'Inv-Stock-Core',
      recordId: updated.id,
      recordLabel: `ProductStock-${updated.productId}-${updated.godownId}`,
      userId,
      userName,
      details: JSON.stringify({
        productId: updated.productId,
        godownId: updated.godownId,
        quantity: safeQty,
        costPrice: safeCost,
        totalValue,
        companyId: companyId || null,
      }),
    });

    return NextResponse.json(updated);
  } catch (error: unknown) {
    console.error('Error updating product stock:', error);
    const message = error instanceof Error ? error.message : 'Failed to update product stock';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/product-stock/[id] — Soft-delete product stock (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Stock', 'DELETE');
  if (!security.authorized) return security.response;

  const { id: userId, name: userName, role, companyId } = security.user;
  const { id } = await params;

  // Admin-only delete enforcement
  const deleteCheck = checkFinancialDeletePermission(role);
  if (deleteCheck) return deleteCheck;

  try {
    // Pre-fetch for cross-tenant validation
    const existing = await db.productStock.findFirst({
      where: { id, isActive: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Product stock not found' },
        { status: 404 }
      );
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Product stock not found' },
        { status: 404 }
      );
    }

    // Soft delete
    await db.productStock.update({
      where: { id },
      data: { isActive: false },
    });

    // Log activity with Inv-Stock-Core module token
    await logUserActivity({
      action: 'DELETE',
      module: 'Inv-Stock-Core',
      recordId: id,
      recordLabel: `ProductStock-${existing.productId}-${existing.godownId}`,
      userId,
      userName,
      details: JSON.stringify({
        productId: existing.productId,
        godownId: existing.godownId,
        quantity: existing.quantity,
        costPrice: existing.costPrice,
        totalValue: existing.totalValue,
        companyId: companyId || null,
      }),
    });

    return NextResponse.json({ success: true, message: 'Product stock deleted successfully' });
  } catch (error: unknown) {
    console.error('Error deleting product stock:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete product stock';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
