import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  checkFinancialDeletePermission,
  safeFinancialRound,
  maskForVatAuditor,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// GET /api/batch-master/[id] — Get single batch master with cross-tenant validation + VAT masking
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Stock', 'GET');
  if (!security.authorized) return security.response;

  const { role, companyId } = security.user;
  const { id } = await params;

  try {
    const batch = await db.batchMaster.findFirst({
      where: { id, isActive: true },
      include: {
        product: true,
        godown: true,
      },
    });

    if (!batch) {
      return NextResponse.json(
        { error: 'Batch master not found' },
        { status: 404 }
      );
    }

    // Cross-tenant validation
    if (companyId && batch.companyId && batch.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Batch master not found' },
        { status: 404 }
      );
    }

    // Apply VAT Auditor masking on cost fields
    const masked = maskForVatAuditor(
      batch as Record<string, unknown>,
      role,
      ['costPrice', 'totalCost', 'salePrice']
    );

    return NextResponse.json(masked);
  } catch (error) {
    console.error('Error fetching batch master:', error);
    return NextResponse.json(
      { error: 'Failed to fetch batch master' },
      { status: 500 }
    );
  }
}

// PUT /api/batch-master/[id] — Update batch master with cross-tenant validation
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
    const existing = await db.batchMaster.findFirst({
      where: { id, isActive: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Batch master not found' },
        { status: 404 }
      );
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Batch master not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const {
      batchNumber,
      quantity,
      costPrice,
      salePrice,
      expiryDate,
      manufacturingDate,
      godownId,
      supplierId,
      purchaseOrderId,
      status,
    } = body;

    // ── XSS sanitization on string inputs ──
    const sanitize = (val: unknown): string | null => {
      if (!val || typeof val !== 'string') return null;
      return val.replace(/<[^>]*>/g, '').trim() || null;
    };

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

    // Recalculate totalCost if quantity or costPrice changes
    const totalCost = safeFinancialRound(safeQty * safeCost);
    const safeSalePrice = salePrice !== undefined && salePrice !== null
      ? safeFinancialRound(parseFloat(String(salePrice)))
      : existing.salePrice;

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

    const cleanBatchNumber = batchNumber ? sanitize(batchNumber) : existing.batchNumber;

    const updated = await db.batchMaster.update({
      where: { id },
      data: {
        batchNumber: cleanBatchNumber || existing.batchNumber,
        quantity: safeQty,
        costPrice: safeCost,
        totalCost,
        salePrice: safeSalePrice,
        expiryDate: expiryDate !== undefined ? (expiryDate ? new Date(expiryDate as string) : null) : existing.expiryDate,
        manufacturingDate: manufacturingDate !== undefined ? (manufacturingDate ? new Date(manufacturingDate as string) : null) : existing.manufacturingDate,
        godownId: effectiveGodownId,
        supplierId: supplierId !== undefined ? (supplierId ? String(supplierId) : null) : existing.supplierId,
        purchaseOrderId: purchaseOrderId !== undefined ? (purchaseOrderId ? String(purchaseOrderId) : null) : existing.purchaseOrderId,
        status: status ? String(status) : existing.status,
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
      recordLabel: updated.batchNumber,
      userId,
      userName,
      details: JSON.stringify({
        batchNumber: updated.batchNumber,
        quantity: safeQty,
        costPrice: safeCost,
        totalCost,
        companyId: companyId || null,
      }),
    });

    return NextResponse.json(updated);
  } catch (error: unknown) {
    console.error('Error updating batch master:', error);
    const message = error instanceof Error ? error.message : 'Failed to update batch master';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/batch-master/[id] — Soft-delete batch master (admin only)
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
    const existing = await db.batchMaster.findFirst({
      where: { id, isActive: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Batch master not found' },
        { status: 404 }
      );
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Batch master not found' },
        { status: 404 }
      );
    }

    // Check if batch has active stock entries
    const activeStockEntries = await db.stockEntry.findFirst({
      where: { batchId: id, isActive: true },
    });

    if (activeStockEntries) {
      return NextResponse.json(
        { error: 'Cannot delete batch master with active stock entries. Remove stock entries first.' },
        { status: 400 }
      );
    }

    // Soft delete
    await db.batchMaster.update({
      where: { id },
      data: { isActive: false },
    });

    // Log activity with Inv-Stock-Core module token
    await logUserActivity({
      action: 'DELETE',
      module: 'Inv-Stock-Core',
      recordId: id,
      recordLabel: existing.batchNumber,
      userId,
      userName,
      details: JSON.stringify({
        batchNumber: existing.batchNumber,
        productId: existing.productId,
        quantity: existing.quantity,
        companyId: companyId || null,
      }),
    });

    return NextResponse.json({ success: true, message: 'Batch master deleted successfully' });
  } catch (error: unknown) {
    console.error('Error deleting batch master:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete batch master';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
