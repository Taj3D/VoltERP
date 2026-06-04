// ============================================================
// Godowns [id] API — Multi-tenant CompanyId Isolation
// Module Token: Sys-Structure-Matrix
// Phase 6: Cross-tenant validation, status change logging, capacity validation
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

function sanitizeText(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')           // Strip HTML/XSS tags
    .replace(/\r\n/g, '\n')            // Normalize line breaks
    .replace(/\n{3,}/g, '\n\n')        // Collapse excessive newlines
    .replace(/  +/g, ' ')              // Collapse double spaces
    .trim();
}

// GET /api/godowns/[id] — Fetch single godown with cross-tenant validation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Godowns', 'GET');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;
    const item = await db.godown.findUnique({
      where: { id },
      include: {
        _count: { select: { products: true } },
      },
    });

    if (!item) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cross-tenant validation
    if (companyId && item.companyId && item.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(item);
  } catch (error) {
    console.error('Error fetching godown:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: 'Failed to fetch godown' },
      { status: 500 }
    );
  }
}

// PUT /api/godowns/[id] — Update godown with cross-tenant validation, status change
// logging, and warehouse routing parameter propagation
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Godowns', 'PUT');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;
    const body = await request.json();

    // Pre-fetch for cross-tenant validation
    const existing = await db.godown.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Sanitize text inputs
    const sanitizedName = body.name !== undefined ? sanitizeText(body.name) : undefined;
    const sanitizedAddress = body.address !== undefined
      ? (body.address ? sanitizeText(body.address) : null)
      : undefined;
    const sanitizedInCharge = body.inCharge !== undefined
      ? (body.inCharge ? sanitizeText(body.inCharge) : null)
      : undefined;
    const sanitizedPhone = body.phone !== undefined
      ? (body.phone ? sanitizeText(body.phone) : null)
      : undefined;

    // Validate capacityValue if being updated
    if (body.capacityValue !== undefined && body.capacityValue < 0) {
      return NextResponse.json(
        { error: 'Capacity value must be zero or greater' },
        { status: 400 }
      );
    }

    // Validate capacityUnit if being updated
    const VALID_CAPACITY_UNITS = ['m³', 'sqft', 'units', 'kg', 'tons'];
    if (body.capacityUnit && !VALID_CAPACITY_UNITS.includes(body.capacityUnit)) {
      return NextResponse.json(
        { error: `Invalid capacity unit. Must be one of: ${VALID_CAPACITY_UNITS.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate status if being updated
    const VALID_STATUSES = ['ACTIVE', 'SUSPENDED'];
    if (body.status && !VALID_STATUSES.includes(body.status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    // Detect status transitions for special logging and routing propagation
    let statusChangeDetail = '';
    let isSuspending = false;
    let isReactivating = false;

    if (body.status && existing.status !== body.status) {
      if (body.status === 'SUSPENDED' && existing.status === 'ACTIVE') {
        statusChangeDetail = 'EMERGENCY CLOSURE ACTIVATED';
        isSuspending = true;
      } else if (body.status === 'ACTIVE' && existing.status === 'SUSPENDED') {
        statusChangeDetail = 'WAREHOUSE REACTIVATED — All routing parameters unblocked';
        isReactivating = true;
      }
    }

    // ── Pending operations check for Emergency Closure (ACTIVE → SUSPENDED) ──
    let pendingOperations = {
      purchaseOrders: 0,
      salesOrders: 0,
      hireSales: 0,
      transfers: 0,
    };

    if (isSuspending) {
      const companyFilter = companyId ? { companyId } : {};

      const [
        pendingPOs,
        pendingSOs,
        pendingHS,
        pendingTransfersFrom,
        pendingTransfersTo,
      ] = await Promise.all([
        db.purchaseOrder.count({
          where: {
            godownId: id,
            isActive: true,
            status: { notIn: ['Received', 'Cancelled'] },
            ...companyFilter,
          },
        }),
        db.salesOrder.count({
          where: {
            godownId: id,
            isActive: true,
            status: { notIn: ['Delivered', 'Cancelled'] },
            ...companyFilter,
          },
        }),
        db.hireSales.count({
          where: {
            godownId: id,
            isActive: true,
            currentStatus: { notIn: ['Completed', 'Cancelled'] },
            ...companyFilter,
          },
        }),
        db.stockTransfer.count({
          where: {
            fromGodownId: id,
            isActive: true,
            status: { notIn: ['Completed', 'Cancelled'] },
          },
        }),
        db.stockTransfer.count({
          where: {
            toGodownId: id,
            isActive: true,
            status: { notIn: ['Completed', 'Cancelled'] },
          },
        }),
      ]);

      pendingOperations = {
        purchaseOrders: pendingPOs,
        salesOrders: pendingSOs,
        hireSales: pendingHS,
        transfers: pendingTransfersFrom + pendingTransfersTo,
      };
    }

    const item = await db.$transaction(async (tx) => {
      const record = await tx.godown.update({
        where: { id },
        data: {
          ...(sanitizedName !== undefined && { name: sanitizedName }),
          ...(sanitizedAddress !== undefined && { address: sanitizedAddress }),
          ...(sanitizedInCharge !== undefined && { inCharge: sanitizedInCharge }),
          ...(sanitizedPhone !== undefined && { phone: sanitizedPhone }),
          ...(body.status !== undefined && { status: body.status }),
          ...(body.capacityValue !== undefined && { capacityValue: body.capacityValue }),
          ...(body.capacityUnit !== undefined && { capacityUnit: body.capacityUnit || null }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
        },
      });

      // Build activity log details with routing propagation info
      const logDetails: Record<string, unknown> = {
        code: record.code,
        name: record.name,
        status: record.status,
        previousStatus: existing.status,
        statusChangeDetail: statusChangeDetail || undefined,
        capacityValue: record.capacityValue,
        capacityUnit: record.capacityUnit,
        companyId,
        updatedFields: Object.keys(body),
      };

      // Include pending operations data in log when suspending
      if (isSuspending) {
        const totalPending =
          pendingOperations.purchaseOrders +
          pendingOperations.salesOrders +
          pendingOperations.hireSales +
          pendingOperations.transfers;

        logDetails.routingPropagation = {
          event: 'WAREHOUSE_SUSPENDED',
          isReceivable: false,
          isDispatchable: false,
          pendingOperations,
          totalPending,
        };
      }

      // Log routing unblock on reactivation
      if (isReactivating) {
        logDetails.routingPropagation = {
          event: 'WAREHOUSE_REACTIVATED',
          isReceivable: true,
          isDispatchable: true,
          message: 'All routing parameters unblocked — warehouse can receive and dispatch stock',
        };
      }

      await logUserActivity({
          tx: tx,
        action: 'UPDATE',
        module: 'Sys-Structure-Matrix',
        recordId: record.id,
        recordLabel: record.name || record.id,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify(logDetails),
      });

      return record;
    });

    // Build response — include warning if suspending with pending operations
    if (isSuspending) {
      const totalPending =
        pendingOperations.purchaseOrders +
        pendingOperations.salesOrders +
        pendingOperations.hireSales +
        pendingOperations.transfers;

      if (totalPending > 0) {
        return NextResponse.json({
          warning: `Warehouse suspended with ${totalPending} pending operation(s): ${pendingOperations.purchaseOrders} PO(s), ${pendingOperations.salesOrders} SO(s), ${pendingOperations.hireSales} hire sale(s), ${pendingOperations.transfers} transfer(s)`,
          pendingOperations,
          record: item,
        });
      }
    }

    return NextResponse.json(item);
  } catch (error) {
    console.error('Error updating godown:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: 'Failed to update godown' },
      { status: 500 }
    );
  }
}

// DELETE /api/godowns/[id] — Soft-delete with FK check and cross-tenant validation
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Godowns', 'DELETE');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;

    await db.$transaction(async (tx) => {
      const record = await tx.godown.findUnique({ where: { id } });
      if (!record) throw new Error('Not found');

      // Cross-tenant validation
      if (companyId && record.companyId && record.companyId !== companyId) {
        throw new Error('Not found');
      }

      // FK check: Check if godown is referenced by active records
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

      await tx.godown.update({
        where: { id },
        data: { isActive: false },
      });

      await logUserActivity({
          tx: tx,
        action: 'DELETE',
        module: 'Sys-Structure-Matrix',
        recordId: record.id,
        recordLabel: record.name || record.id,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          code: record.code,
          name: record.name,
          address: record.address,
          status: record.status,
          softDelete: true,
          companyId,
        }),
      });

      return record;
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Not found') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      if (error.message.startsWith('Cannot delete')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    console.error('Error deleting godown:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: 'Failed to delete godown' },
      { status: 500 }
    );
  }
}
