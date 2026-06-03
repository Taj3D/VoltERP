import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  checkPeriodClose,
  maskForVatAuditor,
  safeFinancialRound,
  safeFinancialAdd,
  safeFinancialSubtract,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// ============================================================
// SHARED: VAT Auditor masking for transfer records
// ============================================================

function maskTransferForVatAuditor(
  transfer: Record<string, unknown>,
  role: string
): Record<string, unknown> {
  if (role !== 'vat_auditor') return transfer;

  let masked = maskForVatAuditor(transfer, role, ['totalCostValue']);

  // Mask nested lines
  if (Array.isArray(masked.lines)) {
    masked = {
      ...masked,
      lines: (masked.lines as Record<string, unknown>[]).map(line => {
        let maskedLine = maskForVatAuditor(line, role, ['costPrice', 'lineTotal']);
        // Mask nested product
        if (maskedLine.product && typeof maskedLine.product === 'object') {
          maskedLine = {
            ...maskedLine,
            product: maskForVatAuditor(
              maskedLine.product as Record<string, unknown>,
              role,
              ['costPrice', 'salePrice', 'wholesalePrice', 'dealerPrice']
            ),
          };
        }
        return maskedLine;
      }),
    };
  }

  return masked;
}

// ============================================================
// Status transition validation map
// Pending → Approved → In-Transit → Delivered
// Cancelled at Pending or Approved stage
// ============================================================

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  'Pending': ['Approved', 'Cancelled'],
  'Approved': ['In-Transit', 'Cancelled'],
  'In-Transit': ['Delivered'],
  'Delivered': [], // Terminal state
  'Cancelled': [], // Terminal state
};

// ============================================================
// GET /api/transfers/[id] — Single transfer with full relations
// ============================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'StockTransfers', 'GET');
  if (!security.authorized) return security.response;

  // Dealer: completely blocked from transfer records
  if (security.user.role === 'dealer') {
    return NextResponse.json(
      { error: 'Access denied. Dealers cannot access transfer records.' },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    const transfer = await db.stockTransfer.findUnique({
      where: { id },
      include: {
        fromGodown: true,
        toGodown: true,
        lines: {
          include: {
            product: {
              include: {
                category: true,
                brand: true,
              },
            },
          },
        },
      },
    });

    if (!transfer) {
      return NextResponse.json({ error: 'Transfer not found' }, { status: 404 });
    }

    if (!transfer.isActive) {
      return NextResponse.json({ error: 'Transfer has been deleted' }, { status: 410 });
    }

    // Apply VAT Auditor masking
    const maskedTransfer = maskTransferForVatAuditor(
      transfer as Record<string, unknown>,
      security.user.role
    );

    return NextResponse.json(maskedTransfer);
  } catch (error) {
    console.error('[Transfers] GET [id] error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transfer' },
      { status: 500 }
    );
  }
}

// ============================================================
// PUT /api/transfers/[id] — Enhanced status transitions
// Pending→Approved→In-Transit→Delivered, Cancelled at Pending/Approved
// - On Approved: set approvedBy, approvedAt
// - On In-Transit: set shippedAt
// - On Delivered: set deliveredAt, create StockEntry IN at destination
// - On Cancelled: reverse stock entries (create IN at source)
// - Line modification only when Pending
// ============================================================

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'StockTransfers', 'PUT');
  if (!security.authorized) return security.response;

  // Dealer: completely blocked
  if (security.user.role === 'dealer') {
    return NextResponse.json(
      { error: 'Access denied. Dealers cannot access transfer records.' },
      { status: 403 }
    );
  }

  // SR: cannot modify transfers
  if (security.user.role === 'sr') {
    return NextResponse.json(
      { error: 'Access denied. SRs cannot create or modify transfers.' },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const {
      notes,
      status: newStatus,
      lines,
    } = body;

    // Fetch existing record
    const existing = await db.stockTransfer.findUnique({
      where: { id },
      include: {
        lines: true,
        fromGodown: true,
        toGodown: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Transfer not found' }, { status: 404 });
    }

    if (!existing.isActive) {
      return NextResponse.json({ error: 'Transfer has been deleted' }, { status: 410 });
    }

    // Period-close lock check
    const periodLock = await checkPeriodClose(existing.date);
    if (periodLock) return periodLock;

    // Status transition validation
    if (newStatus && newStatus !== existing.status) {
      const allowed = ALLOWED_TRANSITIONS[existing.status] || [];
      if (!allowed.includes(newStatus)) {
        return NextResponse.json(
          { error: `Invalid status transition from "${existing.status}" to "${newStatus}". Allowed transitions: ${allowed.join(', ') || 'None (terminal state)'}` },
          { status: 400 }
        );
      }
    }

    // Line modification only when Pending
    if (lines && existing.status !== 'Pending') {
      return NextResponse.json(
        { error: 'Line items can only be modified when transfer status is Pending' },
        { status: 400 }
      );
    }

    const result = await db.$transaction(async (tx) => {
      const updateData: Record<string, unknown> = {};

      if (notes !== undefined) updateData.notes = notes;

      // Handle status transitions
      const effectiveNewStatus = newStatus || existing.status;

      if (newStatus && newStatus !== existing.status) {
        updateData.status = newStatus;

        // Sync shippingStatus for compatibility
        if (newStatus === 'Approved') {
          updateData.shippingStatus = 'Pending';
          updateData.approvedBy = security.user.id;
          updateData.approvedAt = new Date();
        }

        if (newStatus === 'In-Transit') {
          updateData.shippingStatus = 'In-Transit';
          updateData.shippedAt = new Date();
        }

        if (newStatus === 'Delivered') {
          updateData.shippingStatus = 'Delivered';
          updateData.deliveredAt = new Date();

          // Create StockEntry IN at destination godown for each line
          const linesToReceive = existing.lines;
          for (const line of linesToReceive) {
            await tx.stockEntry.create({
              data: {
                productId: line.productId,
                godownId: existing.toGodownId,
                type: 'IN',
                quantity: line.quantity,
                reference: existing.transferNo,
                referenceType: 'Transfer',
                date: new Date(),
                batchId: line.batchId || null,
                costPrice: line.costPrice,
                notes: `Transfer received at destination: ${existing.transferNo}`,
                companyId: existing.companyId || security.user.companyId || null,
              },
            });
          }
        }

        if (newStatus === 'Cancelled') {
          updateData.shippingStatus = 'Cancelled';

          // Reverse stock entries: create IN entries at source to reverse the OUT entries
          const linesToReverse = existing.lines;
          for (const line of linesToReverse) {
            await tx.stockEntry.create({
              data: {
                productId: line.productId,
                godownId: existing.fromGodownId,
                type: 'IN',
                quantity: line.quantity,
                reference: existing.transferNo,
                referenceType: 'Transfer',
                date: new Date(),
                batchId: line.batchId || null,
                costPrice: line.costPrice,
                notes: `Transfer cancelled — stock reversal: ${existing.transferNo}`,
                companyId: existing.companyId || security.user.companyId || null,
              },
            });
          }
        }
      }

      // Handle line modification (only when Pending)
      if (lines && Array.isArray(lines) && lines.length > 0 && existing.status === 'Pending') {
        // First, reverse the old OUT stock entries
        for (const line of existing.lines) {
          await tx.stockEntry.create({
            data: {
              productId: line.productId,
              godownId: existing.fromGodownId,
              type: 'IN',
              quantity: line.quantity,
              reference: existing.transferNo,
              referenceType: 'Transfer',
              date: new Date(),
              batchId: line.batchId || null,
              costPrice: line.costPrice,
              notes: `Transfer line modification reversal: ${existing.transferNo}`,
              companyId: existing.companyId || security.user.companyId || null,
            },
          });
        }

        // Delete old lines
        await tx.stockTransferLine.deleteMany({
          where: { stockTransferId: id },
        });

        // Process new lines
        const processedLines: Array<{
          productId: string;
          quantity: number;
          batchId: string | null;
          costPrice: number;
          lineTotal: number;
          availableStock: number;
          stockStatus: string;
        }> = [];

        let totalCostValue = 0;

        for (const line of lines) {
          if (!line.productId) continue;

          const product = await tx.product.findUnique({
            where: { id: line.productId },
            select: { costPrice: true },
          });

          const costPrice = safeFinancialRound(product?.costPrice || 0);

          // Compute available stock at source
          const stockIns = await tx.stockEntry.findMany({
            where: { productId: line.productId, godownId: existing.fromGodownId, type: 'IN' },
            select: { quantity: true },
          });
          const stockOuts = await tx.stockEntry.findMany({
            where: { productId: line.productId, godownId: existing.fromGodownId, type: 'OUT' },
            select: { quantity: true },
          });
          const availableStock = safeFinancialRound(
            stockIns.reduce((s, e) => s + e.quantity, 0) -
            stockOuts.reduce((s, e) => s + e.quantity, 0)
          );

          let stockStatus = 'Available';
          if (availableStock <= 0) stockStatus = 'Insufficient';
          else if (availableStock < (line.quantity || 0)) stockStatus = 'Partial';

          const lineTotal = safeFinancialRound((line.quantity || 0) * costPrice);

          processedLines.push({
            productId: line.productId,
            quantity: safeFinancialRound(line.quantity || 0),
            batchId: line.batchId || null,
            costPrice,
            lineTotal,
            availableStock,
            stockStatus,
          });

          totalCostValue = safeFinancialAdd(totalCostValue, lineTotal);
        }

        // Create new OUT stock entries for new lines
        for (const line of processedLines) {
          await tx.stockEntry.create({
            data: {
              productId: line.productId,
              godownId: existing.fromGodownId,
              type: 'OUT',
              quantity: line.quantity,
              reference: existing.transferNo,
              referenceType: 'Transfer',
              date: existing.date,
              batchId: line.batchId,
              costPrice: line.costPrice,
              notes: `Transfer line modification: ${existing.transferNo}`,
              companyId: existing.companyId || security.user.companyId || null,
            },
          });
        }

        updateData.totalItems = processedLines.length;
        updateData.totalQuantity = processedLines.reduce((sum, l) => sum + l.quantity, 0);
        updateData.totalCostValue = totalCostValue;
        updateData.lines = {
          create: processedLines.map(l => ({
            productId: l.productId,
            quantity: l.quantity,
            batchId: l.batchId,
            costPrice: l.costPrice,
            lineTotal: l.lineTotal,
            availableStock: l.availableStock,
            stockStatus: l.stockStatus,
          })),
        };
      }

      // Update transfer
      const transfer = await tx.stockTransfer.update({
        where: { id },
        data: updateData,
        include: {
          fromGodown: true,
          toGodown: true,
          lines: {
            include: {
              product: {
                include: {
                  category: true,
                  brand: true,
                },
              },
            },
          },
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'StockTransfers',
          recordId: transfer.id,
          recordLabel: existing.transferNo,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            previousStatus: existing.status,
            newStatus: effectiveNewStatus,
            statusTransition: existing.status !== effectiveNewStatus
              ? `${existing.status} → ${effectiveNewStatus}`
              : undefined,
            linesModified: !!lines,
          }),
        },
      });

      return transfer;
    });

    // Activity log
    await logUserActivity({
      action: 'UPDATE',
      module: 'Inv-Stock-Transfer',
      recordId: result.id,
      recordLabel: existing.transferNo,
      userId: security.user.id,
      userName: security.user.name,
      details: `Updated transfer ${existing.transferNo}: status ${existing.status} → ${newStatus || existing.status}`,
    });

    // Apply VAT Auditor masking
    const maskedResult = maskTransferForVatAuditor(
      result as Record<string, unknown>,
      security.user.role
    );

    return NextResponse.json(maskedResult);
  } catch (error) {
    console.error('[Transfers] PUT [id] error:', error);
    return NextResponse.json(
      { error: 'Failed to update transfer' },
      { status: 500 }
    );
  }
}

// ============================================================
// DELETE /api/transfers/[id] — Soft delete with stock reversal
// Creates IN entries at source to reverse OUT entries (if not Cancelled)
// ============================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'StockTransfers', 'DELETE');
  if (!security.authorized) return security.response;

  // Dealer: completely blocked
  if (security.user.role === 'dealer') {
    return NextResponse.json(
      { error: 'Access denied. Dealers cannot access transfer records.' },
      { status: 403 }
    );
  }

  // SR: cannot delete transfers
  if (security.user.role === 'sr') {
    return NextResponse.json(
      { error: 'Access denied. SRs cannot create or modify transfers.' },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;

    const existing = await db.stockTransfer.findUnique({
      where: { id },
      include: { lines: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Transfer not found' }, { status: 404 });
    }

    if (!existing.isActive) {
      return NextResponse.json({ error: 'Transfer is already deleted' }, { status: 400 });
    }

    // Period-close lock check
    const periodLock = await checkPeriodClose(existing.date);
    if (periodLock) return periodLock;

    await db.$transaction(async (tx) => {
      // Soft delete
      await tx.stockTransfer.update({
        where: { id },
        data: { isActive: false },
      });

      // Stock reversal: create IN entries at source to reverse OUT entries
      // Skip if already Cancelled (stock was already reversed during cancellation)
      if (existing.status !== 'Cancelled') {
        for (const line of existing.lines) {
          await tx.stockEntry.create({
            data: {
              productId: line.productId,
              godownId: existing.fromGodownId,
              type: 'IN',
              quantity: line.quantity,
              reference: existing.transferNo,
              referenceType: 'Transfer',
              date: new Date(),
              batchId: line.batchId || null,
              costPrice: line.costPrice,
              notes: `Transfer deletion — stock reversal: ${existing.transferNo}`,
              companyId: existing.companyId || security.user.companyId || null,
            },
          });
        }
      }

      // If status was Delivered, also reverse the IN entries at destination
      if (existing.status === 'Delivered') {
        for (const line of existing.lines) {
          await tx.stockEntry.create({
            data: {
              productId: line.productId,
              godownId: existing.toGodownId,
              type: 'OUT',
              quantity: line.quantity,
              reference: existing.transferNo,
              referenceType: 'Transfer',
              date: new Date(),
              batchId: line.batchId || null,
              costPrice: line.costPrice,
              notes: `Transfer deletion — destination reversal: ${existing.transferNo}`,
              companyId: existing.companyId || security.user.companyId || null,
            },
          });
        }
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'StockTransfers',
          recordId: id,
          recordLabel: existing.transferNo,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            softDelete: true,
            status: existing.status,
            stockReversed: existing.status !== 'Cancelled',
            destinationReversed: existing.status === 'Delivered',
          }),
        },
      });
    });

    // Activity log
    await logUserActivity({
      action: 'DELETE',
      module: 'Inv-Stock-Transfer',
      recordId: existing.id,
      recordLabel: existing.transferNo,
      userId: security.user.id,
      userName: security.user.name,
      details: `Deleted transfer ${existing.transferNo} (status was ${existing.status})`,
    });

    return NextResponse.json({ message: 'Transfer deleted successfully' });
  } catch (error) {
    console.error('[Transfers] DELETE [id] error:', error);
    return NextResponse.json(
      { error: 'Failed to delete transfer' },
      { status: 500 }
    );
  }
}
