// ============================================================
// GODOWNS [id] API ROUTE — Enhanced with SUSPENDED status checks,
// cross-tenant validation, XSS sanitization, admin-only delete,
// and Inv-Stock-Core audit token
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  checkFinancialDeletePermission,
  maskForVatAuditor,
  safeFinancialRound,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// XSS sanitization helper
function sanitizeString(input: string): string {
  return input.replace(/<[^>]*>/g, '').trim();
}

/**
 * GET /api/godowns/[id]
 * Get a single godown with cross-tenant companyId validation.
 * Includes productStocks count.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Godowns', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const companyId = security.user.companyId;

    const item = await db.godown.findFirst({
      where: {
        id,
        isActive: true,
        ...(companyId ? { companyId } : {}),
      },
      include: {
        _count: {
          select: {
            products: true,
            productStocks: true,
          },
        },
      },
    });

    if (!item) {
      return NextResponse.json({ error: 'Godown not found' }, { status: 404 });
    }

    // Cross-tenant validation
    if (companyId && item.companyId && item.companyId !== companyId) {
      return NextResponse.json({ error: 'Godown not found' }, { status: 404 });
    }

    // Apply VAT Auditor masking
    const role = security.user.role;
    const maskedItem = maskForVatAuditor(
      item as unknown as Record<string, unknown>,
      role,
      []
    );

    return NextResponse.json(maskedItem);
  } catch (error) {
    console.error('[Godowns] Error fetching godown:', error);
    return NextResponse.json(
      { error: 'Failed to fetch godown' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/godowns/[id]
 * Update a godown with cross-tenant validation, XSS sanitization,
 * and SUSPENDED status check for pending stock operations.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Godowns', 'PUT');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const companyId = security.user.companyId;
    const body = await request.json();

    // Pre-fetch for cross-tenant validation
    const existing = await db.godown.findFirst({
      where: {
        id,
        isActive: true,
        ...(companyId ? { companyId } : {}),
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Godown not found' }, { status: 404 });
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Godown not found' }, { status: 404 });
    }

    // If setting status to SUSPENDED, check for pending stock operations
    if (body.status === 'SUSPENDED' && existing.status !== 'SUSPENDED') {
      // Check for active ProductStock entries with quantity > 0
      const activeStocks = await db.productStock.count({
        where: {
          godownId: id,
          isActive: true,
          quantity: { gt: 0 },
          ...(companyId ? { companyId } : {}),
        },
      });

      if (activeStocks > 0) {
        return NextResponse.json(
          {
            error: `Cannot SUSPEND godown: ${activeStocks} product(s) have active stock in this warehouse. Transfer or clear stock before suspending.`,
            activeStockCount: activeStocks,
          },
          { status: 400 }
        );
      }

      // Check for pending stock transfers
      const pendingTransfersFrom = await db.stockTransfer.count({
        where: {
          fromGodownId: id,
          isActive: true,
          status: { in: ['PENDING', 'IN_TRANSIT'] },
        },
      });
      const pendingTransfersTo = await db.stockTransfer.count({
        where: {
          toGodownId: id,
          isActive: true,
          status: { in: ['PENDING', 'IN_TRANSIT'] },
        },
      });

      if (pendingTransfersFrom > 0 || pendingTransfersTo > 0) {
        return NextResponse.json(
          {
            error: `Cannot SUSPEND godown: ${pendingTransfersFrom + pendingTransfersTo} pending stock transfer(s) involve this warehouse. Complete or cancel transfers before suspending.`,
            pendingTransfers: pendingTransfersFrom + pendingTransfersTo,
          },
          { status: 400 }
        );
      }
    }

    // XSS sanitization on text fields
    const sanitizedName = body.name !== undefined ? sanitizeString(body.name) : undefined;
    const sanitizedAddress = body.address !== undefined ? (body.address ? sanitizeString(body.address) : null) : undefined;
    const sanitizedInCharge = body.inCharge !== undefined ? (body.inCharge ? sanitizeString(body.inCharge) : null) : undefined;

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (sanitizedName !== undefined) {
      if (!sanitizedName) {
        return NextResponse.json(
          { error: 'Godown name cannot be empty' },
          { status: 400 }
        );
      }
      updateData.name = sanitizedName;
    }
    if (sanitizedAddress !== undefined) updateData.address = sanitizedAddress;
    if (sanitizedInCharge !== undefined) updateData.inCharge = sanitizedInCharge;
    if (body.status !== undefined) {
      // Validate status value
      const validStatuses = ['ACTIVE', 'SUSPENDED'];
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json(
          { error: `Invalid status "${body.status}". Valid values: ${validStatuses.join(', ')}` },
          { status: 400 }
        );
      }
      updateData.status = body.status;
    }

    const item = await db.$transaction(async (tx) => {
      const record = await tx.godown.update({
        where: { id },
        data: updateData,
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'Inv-Stock-Core',
          recordId: record.id,
          recordLabel: record.name || record.id,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            name: record.name,
            status: record.status,
            updatedFields: Object.keys(updateData),
          }),
        },
      });

      return record;
    });

    return NextResponse.json(item);
  } catch (error) {
    console.error('[Godowns] Error updating godown:', error);
    return NextResponse.json(
      { error: 'Failed to update godown' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/godowns/[id]
 * Soft-delete a godown (admin only).
 * Cross-tenant validation, FK check for active ProductStock entries.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Godowns', 'DELETE');
  if (!security.authorized) return security.response;

  // Admin-only delete
  const deleteCheck = checkFinancialDeletePermission(security.user.role);
  if (deleteCheck) return deleteCheck;

  try {
    const { id } = await params;
    const companyId = security.user.companyId;

    // Pre-fetch for cross-tenant validation
    const existing = await db.godown.findFirst({
      where: {
        id,
        isActive: true,
        ...(companyId ? { companyId } : {}),
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Godown not found' }, { status: 404 });
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Godown not found' }, { status: 404 });
    }

    await db.$transaction(async (tx) => {
      // FK check: Check for active ProductStock entries
      const activeProductStocks = await tx.productStock.count({
        where: {
          godownId: id,
          isActive: true,
          quantity: { gt: 0 },
        },
      });

      if (activeProductStocks > 0) {
        throw new Error(
          `Cannot delete: ${activeProductStocks} active product stock record(s) exist in this warehouse. Transfer stock first.`
        );
      }

      // FK check: Check other active references
      const [
        activeProducts,
        activePurchaseOrders,
        activeSalesOrders,
        activeHireSales,
        activeSalesReturns,
        activeTransfersFrom,
        activeTransfersTo,
      ] = await Promise.all([
        tx.product.count({ where: { godownId: id, isActive: true } }),
        tx.purchaseOrder.count({ where: { godownId: id, isActive: true } }),
        tx.salesOrder.count({ where: { godownId: id, isActive: true } }),
        tx.hireSales.count({ where: { godownId: id, isActive: true } }),
        tx.salesReturn.count({ where: { godownId: id, isActive: true } }),
        tx.stockTransfer.count({ where: { fromGodownId: id, isActive: true } }),
        tx.stockTransfer.count({ where: { toGodownId: id, isActive: true } }),
      ]);

      const totalRefs =
        activeProducts +
        activePurchaseOrders +
        activeSalesOrders +
        activeHireSales +
        activeSalesReturns +
        activeTransfersFrom +
        activeTransfersTo;
      if (totalRefs > 0) {
        throw new Error(
          `Cannot delete: Godown is referenced by ${activeProducts} product(s), ${activePurchaseOrders} PO(s), ${activeSalesOrders} SO(s), ${activeHireSales} hire sale(s), ${activeSalesReturns} return(s), ${activeTransfersFrom + activeTransfersTo} transfer(s)`
        );
      }

      // Soft delete
      await tx.godown.update({
        where: { id },
        data: { isActive: false },
      });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'Inv-Stock-Core',
          recordId: existing.id,
          recordLabel: existing.name || existing.id,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            name: existing.name,
            softDelete: true,
          }),
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof Error && error.message.startsWith('Cannot delete')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('[Godowns] Error deleting godown:', error);
    return NextResponse.json(
      { error: 'Failed to delete godown' },
      { status: 500 }
    );
  }
}
