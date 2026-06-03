import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  checkPeriodClose,
  maskForVatAuditor,
  safeFinancialRound,
  safeFinancialSubtract,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// ============================================================
// GET /api/batches/[id] — Single batch with all stock entries
// ============================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Stock', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const batch = await db.batchMaster.findUnique({
      where: { id },
      include: {
        product: {
          include: {
            category: true,
            brand: true,
          },
        },
        stockEntries: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    if (!batch.isActive) {
      return NextResponse.json({ error: 'Batch has been deleted' }, { status: 410 });
    }

    // Auto-detect expired/depleted
    let computedStatus = batch.status;
    const now = new Date();
    if (batch.expiryDate && new Date(batch.expiryDate) < now && batch.status === 'Active') {
      computedStatus = 'Expired';
    }
    if (batch.quantityOnHand <= 0 && batch.status === 'Active') {
      computedStatus = 'Depleted';
    }

    const enrichedBatch = { ...batch, computedStatus };

    // VAT Auditor masking
    const role = security.user.role;
    let masked = maskForVatAuditor(
      enrichedBatch as Record<string, unknown>,
      role,
      ['costPricePerUnit', 'salePricePerUnit', 'quantityOnHand', 'quantityReceived', 'quantitySold']
    );

    // Mask nested product
    if (masked.product && typeof masked.product === 'object' && role === 'vat_auditor') {
      masked = {
        ...masked,
        product: maskForVatAuditor(
          masked.product as Record<string, unknown>,
          role,
          ['costPrice', 'salePrice', 'wholesalePrice', 'dealerPrice']
        ),
      };
    }

    // Mask nested stockEntries
    if (Array.isArray(masked.stockEntries) && role === 'vat_auditor') {
      masked = {
        ...masked,
        stockEntries: (masked.stockEntries as Record<string, unknown>[]).map(se =>
          maskForVatAuditor(se, role, ['costPrice'])
        ),
      };
    }

    return NextResponse.json(masked);
  } catch (error) {
    console.error('[Batches] GET [id] error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch batch' },
      { status: 500 }
    );
  }
}

// ============================================================
// PUT /api/batches/[id] — Update batch details, recalculate quantityOnHand
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
    const {
      manufacturingDate,
      expiryDate,
      supplierLotNo,
      costPricePerUnit,
      salePricePerUnit,
      status,
      notes,
      quantityReceived,
    } = body;

    // Fetch existing batch
    const existing = await db.batchMaster.findUnique({
      where: { id },
      include: { stockEntries: { where: { isActive: true } } },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    if (!existing.isActive) {
      return NextResponse.json({ error: 'Batch has been deleted' }, { status: 410 });
    }

    // Period-close check
    const periodLock = await checkPeriodClose(new Date());
    if (periodLock) return periodLock;

    // Recalculate quantityOnHand if quantityReceived changes
    let newQuantityOnHand = existing.quantityOnHand;
    if (quantityReceived !== undefined && quantityReceived !== existing.quantityReceived) {
      const diff = safeFinancialRound(quantityReceived - existing.quantityReceived);
      newQuantityOnHand = safeFinancialRound(existing.quantityOnHand + diff);
    }

    // Auto-compute status
    let computedStatus = status || existing.status;
    const effectiveExpiryDate = expiryDate !== undefined
      ? (expiryDate ? new Date(expiryDate) : existing.expiryDate)
      : existing.expiryDate;

    if (effectiveExpiryDate && new Date(effectiveExpiryDate) < new Date() && computedStatus === 'Active') {
      computedStatus = 'Expired';
    }
    if (newQuantityOnHand <= 0 && computedStatus === 'Active') {
      computedStatus = 'Depleted';
    }

    const result = await db.$transaction(async (tx) => {
      const updateData: Record<string, unknown> = {};

      if (manufacturingDate !== undefined) updateData.manufacturingDate = manufacturingDate ? new Date(manufacturingDate) : null;
      if (expiryDate !== undefined) updateData.expiryDate = expiryDate ? new Date(expiryDate) : null;
      if (supplierLotNo !== undefined) updateData.supplierLotNo = supplierLotNo;
      if (costPricePerUnit !== undefined) updateData.costPricePerUnit = safeFinancialRound(costPricePerUnit);
      if (salePricePerUnit !== undefined) updateData.salePricePerUnit = safeFinancialRound(salePricePerUnit);
      if (notes !== undefined) updateData.notes = notes;
      if (quantityReceived !== undefined) {
        updateData.quantityReceived = safeFinancialRound(quantityReceived);
        updateData.quantityOnHand = Math.max(0, newQuantityOnHand);
      }
      updateData.status = computedStatus;

      const batch = await tx.batchMaster.update({
        where: { id },
        data: updateData,
        include: {
          product: {
            include: { category: true, brand: true },
          },
          stockEntries: {
            where: { isActive: true },
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'Stock',
          recordId: batch.id,
          recordLabel: existing.batchCode,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            type: 'BatchUpdate',
            batchCode: existing.batchCode,
            previousStatus: existing.status,
            newStatus: computedStatus,
            quantityReceivedChanged: quantityReceived !== undefined,
          }),
        },
      });

      return batch;
    });

    // Activity log
    await logUserActivity({
      action: 'UPDATE',
      module: 'Inv-Batch-Master',
      recordId: result.id,
      recordLabel: existing.batchCode,
      userId: security.user.id,
      userName: security.user.name,
      details: `Updated batch ${existing.batchCode}, status: ${computedStatus}`,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[Batches] PUT [id] error:', error);
    return NextResponse.json(
      { error: 'Failed to update batch' },
      { status: 500 }
    );
  }
}

// ============================================================
// DELETE /api/batches/[id] — Soft delete with stock reversal
// Creates OUT entries for remaining onHand quantity
// ============================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Stock', 'DELETE');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;

    const existing = await db.batchMaster.findUnique({
      where: { id },
      include: { stockEntries: { where: { isActive: true } } },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    if (!existing.isActive) {
      return NextResponse.json({ error: 'Batch already deleted' }, { status: 400 });
    }

    // Period-close check
    const periodLock = await checkPeriodClose(new Date());
    if (periodLock) return periodLock;

    await db.$transaction(async (tx) => {
      // Soft delete
      await tx.batchMaster.update({
        where: { id },
        data: { isActive: false },
      });

      // Create OUT stock entry to reverse remaining onHand quantity
      if (existing.quantityOnHand > 0) {
        await tx.stockEntry.create({
          data: {
            productId: existing.productId,
            godownId: existing.godownId || null,
            type: 'OUT',
            quantity: existing.quantityOnHand,
            reference: existing.batchCode,
            referenceType: 'BatchEntry',
            date: new Date(),
            batchId: existing.id,
            costPrice: existing.costPricePerUnit,
            notes: `Batch deletion reversal: ${existing.batchCode}`,
            companyId: existing.companyId || security.user.companyId || null,
          },
        });
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'Stock',
          recordId: existing.id,
          recordLabel: existing.batchCode,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            type: 'BatchDelete',
            batchCode: existing.batchCode,
            quantityOnHandReversed: existing.quantityOnHand,
            stockEntriesCount: existing.stockEntries.length,
          }),
        },
      });
    });

    // Activity log
    await logUserActivity({
      action: 'DELETE',
      module: 'Inv-Batch-Master',
      recordId: existing.id,
      recordLabel: existing.batchCode,
      userId: security.user.id,
      userName: security.user.name,
      details: `Deleted batch ${existing.batchCode}, reversed ${existing.quantityOnHand} units`,
    });

    return NextResponse.json({ message: 'Batch deleted successfully' });
  } catch (error) {
    console.error('[Batches] DELETE [id] error:', error);
    return NextResponse.json(
      { error: 'Failed to delete batch' },
      { status: 500 }
    );
  }
}
