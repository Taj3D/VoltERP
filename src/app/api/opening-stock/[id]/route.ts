import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  checkPeriodClose,
  maskForVatAuditor,
  safeFinancialRound,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// ============================================================
// GET /api/opening-stock/[id] — Get single opening stock entry
// ============================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Stock', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const openingStock = await db.openingStock.findUnique({
      where: { id },
      include: {
        product: {
          include: {
            category: true,
            brand: true,
            godown: true,
          },
        },
      },
    });

    if (!openingStock || !openingStock.isActive) {
      return NextResponse.json(
        { error: 'Opening stock entry not found' },
        { status: 404 }
      );
    }

    const enriched = {
      ...openingStock,
      totalValue: safeFinancialRound(openingStock.quantity * openingStock.costPrice),
    };

    // VAT Auditor masking
    const role = security.user.role;
    let result: Record<string, unknown> = enriched;
    if (role === 'vat_auditor') {
      result = maskForVatAuditor(result, role, ['costPrice', 'totalValue', 'quantity']);
      if (result.product && typeof result.product === 'object') {
        result = {
          ...result,
          product: maskForVatAuditor(
            result.product as Record<string, unknown>,
            role,
            ['costPrice', 'salePrice', 'wholesalePrice', 'dealerPrice', 'openingStock']
          ),
        };
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[OpeningStock] GET [id] error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch opening stock entry' },
      { status: 500 }
    );
  }
}

// ============================================================
// PUT /api/opening-stock/[id] — Update opening stock entry
// - Only Draft entries can be edited
// - If status changed to Posted: create StockEntry
// - Period-close check
// ============================================================

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Stock', 'PUT');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const body = await request.json();
    const existing = await db.openingStock.findUnique({ where: { id } });

    if (!existing || !existing.isActive) {
      return NextResponse.json(
        { error: 'Opening stock entry not found' },
        { status: 404 }
      );
    }

    // Only Draft entries can be edited
    if (existing.status === 'Posted') {
      return NextResponse.json(
        { error: 'Posted entries cannot be modified. Reverse first.' },
        { status: 403 }
      );
    }

    if (existing.status === 'Reversed') {
      return NextResponse.json(
        { error: 'Reversed entries cannot be modified.' },
        { status: 403 }
      );
    }

    const {
      productCode,
      productId,
      godownId,
      batchId,
      quantity,
      costPrice,
      effectiveDate,
      fiscalYear,
      status,
      notes,
      shippingStatus,
    } = body;

    // Handle status updates (e.g., shippingStatus for transfers or status changes)
    if (shippingStatus !== undefined && Object.keys(body).length === 1) {
      const updated = await db.openingStock.update({
        where: { id },
        data: { shippingStatus },
      });
      return NextResponse.json(updated);
    }

    // Validate quantity and costPrice if provided
    if (quantity !== undefined && quantity <= 0) {
      return NextResponse.json(
        { error: 'quantity must be a positive number' },
        { status: 400 }
      );
    }
    if (costPrice !== undefined && costPrice < 0) {
      return NextResponse.json(
        { error: 'costPrice must be a non-negative number' },
        { status: 400 }
      );
    }

    // Validate product if changed
    if (productId && productId !== existing.productId) {
      const product = await db.product.findUnique({
        where: { id: productId },
        select: { id: true, isActive: true },
      });
      if (!product || !product.isActive) {
        return NextResponse.json(
          { error: 'Product not found or inactive' },
          { status: 400 }
        );
      }
    }

    const effectiveQty = quantity !== undefined ? safeFinancialRound(quantity) : existing.quantity;
    const effectiveCostPrice = costPrice !== undefined ? safeFinancialRound(costPrice) : existing.costPrice;
    const totalValue = safeFinancialRound(effectiveQty * effectiveCostPrice);

    // Determine effective date
    let effectiveDateValue: Date = existing.effectiveDate;
    if (effectiveDate) {
      effectiveDateValue = new Date(effectiveDate);
    }

    // Period-close check
    const periodLock = await checkPeriodClose(effectiveDateValue);
    if (periodLock) return periodLock;

    // Determine new status
    const newStatus = status || existing.status;

    // Update atomically
    const result = await db.$transaction(async (tx) => {
      const updated = await tx.openingStock.update({
        where: { id },
        data: {
          ...(productId ? { productId } : {}),
          ...(productCode ? { productCode } : {}),
          ...(godownId !== undefined ? { godownId } : {}),
          ...(batchId !== undefined ? { batchId } : {}),
          quantity: effectiveQty,
          costPrice: effectiveCostPrice,
          totalValue,
          effectiveDate: effectiveDateValue,
          ...(fiscalYear ? { fiscalYear } : {}),
          status: newStatus,
          notes: notes !== undefined ? notes : existing.notes,
        },
      });

      // If status changed to Posted: create StockEntry
      if (newStatus === 'Posted' && existing.status !== 'Posted') {
        const product = await tx.product.findUnique({
          where: { id: updated.productId },
          select: { productCode: true, name: true },
        });

        await tx.stockEntry.create({
          data: {
            productId: updated.productId,
            godownId: updated.godownId,
            type: 'IN',
            quantity: effectiveQty,
            reference: `OS-${updated.id.substring(0, 8)}`,
            referenceType: 'OpeningStock',
            date: effectiveDateValue,
            batchId: updated.batchId,
            costPrice: effectiveCostPrice,
            notes: `Opening stock entry: ${product?.productCode || 'unknown'}`,
            companyId: security.user.companyId || null,
          },
        });
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'Stock',
          recordId: id,
          recordLabel: `OS-${updated.productCode || id.substring(0, 8)}`,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            type: 'OpeningStock',
            changes: body,
            totalValue,
          }),
        },
      });

      return updated;
    });

    // Activity log
    await logUserActivity({
      action: 'UPDATE',
      module: 'Inv-Opening-Stock',
      recordId: result.id,
      recordLabel: `OS-${result.productCode || id.substring(0, 8)}`,
      userId: security.user.id,
      userName: security.user.name,
      details: `Updated opening stock entry ${id.substring(0, 8)}`,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[OpeningStock] PUT [id] error:', error);
    return NextResponse.json(
      { error: 'Failed to update opening stock entry' },
      { status: 500 }
    );
  }
}

// ============================================================
// DELETE /api/opening-stock/[id] — Soft-delete opening stock entry
// - If entry is Posted: reverse the StockEntry
// ============================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Stock', 'DELETE');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const existing = await db.openingStock.findUnique({ where: { id } });

    if (!existing || !existing.isActive) {
      return NextResponse.json(
        { error: 'Opening stock entry not found' },
        { status: 404 }
      );
    }

    // Delete atomically
    const result = await db.$transaction(async (tx) => {
      // If Posted: reverse the stock entry
      if (existing.status === 'Posted') {
        await tx.stockEntry.create({
          data: {
            productId: existing.productId,
            godownId: existing.godownId,
            type: 'OUT',
            quantity: existing.quantity,
            reference: `OS-REV-${existing.id.substring(0, 8)}`,
            referenceType: 'OpeningStockReversal',
            date: new Date(),
            batchId: existing.batchId,
            costPrice: existing.costPrice,
            notes: `Reversal of opening stock entry: ${existing.productCode}`,
            companyId: security.user.companyId || null,
          },
        });
      }

      // Soft delete
      const deleted = await tx.openingStock.update({
        where: { id },
        data: { isActive: false },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'Stock',
          recordId: id,
          recordLabel: `OS-${existing.productCode || id.substring(0, 8)}`,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            type: 'OpeningStock',
            wasPosted: existing.status === 'Posted',
            quantity: existing.quantity,
            costPrice: existing.costPrice,
            totalValue: existing.totalValue,
          }),
        },
      });

      return deleted;
    });

    // Activity log
    await logUserActivity({
      action: 'DELETE',
      module: 'Inv-Opening-Stock',
      recordId: result.id,
      recordLabel: `OS-${existing.productCode || id.substring(0, 8)}`,
      userId: security.user.id,
      userName: security.user.name,
      details: `Deleted opening stock entry ${id.substring(0, 8)}${existing.status === 'Posted' ? ' (stock reversal applied)' : ''}`,
    });

    return NextResponse.json({
      success: true,
      message: existing.status === 'Posted'
        ? 'Opening stock deleted. Stock reversal applied.'
        : 'Opening stock deleted.',
    });
  } catch (error) {
    console.error('[OpeningStock] DELETE [id] error:', error);
    return NextResponse.json(
      { error: 'Failed to delete opening stock entry' },
      { status: 500 }
    );
  }
}
