import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity, checkPeriodClose } from '@/lib/api-security';

// GET /api/transfers/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'StockTransfers', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const transfer = await db.stockTransfer.findUnique({
      where: { id },
      include: {
        fromGodown: true,
        toGodown: true,
        lines: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!transfer) {
      return NextResponse.json(
        { error: 'Transfer not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(transfer);
  } catch (error) {
    console.error('Error fetching transfer:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transfer' },
      { status: 500 }
    );
  }
}

// PUT /api/transfers/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'StockTransfers', 'PUT');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const body = await request.json();
    const {
      fromGodownId,
      toGodownId,
      date,
      notes,
      shippingStatus,
      lines,
    } = body;

    // Fetch existing record for state flow management
    const existing = await db.stockTransfer.findUnique({
      where: { id },
      select: {
        transferNo: true,
        shippingStatus: true,
        status: true,
        fromGodownId: true,
        toGodownId: true,
        lines: true,
        date: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Transfer not found' },
        { status: 404 }
      );
    }

    // Period-close lock check
    const effectiveDate = date || existing.date;
    const periodLock = await checkPeriodClose(effectiveDate);
    if (periodLock) return periodLock;

    // transferNo is immutable

    // Validate fromGodownId !== toGodownId if either is being changed
    const effectiveFromId = fromGodownId || existing.fromGodownId;
    const effectiveToId = toGodownId || existing.toGodownId;
    if (effectiveFromId === effectiveToId) {
      return NextResponse.json(
        { error: 'Source and destination godown cannot be the same' },
        { status: 400 }
      );
    }

    // State Flow Management: Check for invalid backward transitions
    const newShippingStatus = shippingStatus || existing.shippingStatus;

    if (newShippingStatus !== existing.shippingStatus) {
      // "Delivered" → "In-Transit" or "Pending": REJECT this reversal
      if (existing.shippingStatus === 'Delivered' && (newShippingStatus === 'In-Transit' || newShippingStatus === 'Pending')) {
        return NextResponse.json(
          { error: `Cannot change shipping status from "${existing.shippingStatus}" to "${newShippingStatus}". Once delivered, status cannot go backward.` },
          { status: 400 }
        );
      }

      // "In-Transit" → "Pending": Also reject backward transition
      if (existing.shippingStatus === 'In-Transit' && newShippingStatus === 'Pending') {
        return NextResponse.json(
          { error: `Cannot change shipping status from "In-Transit" to "Pending". Status cannot go backward.` },
          { status: 400 }
        );
      }
    }

    const result = await db.$transaction(async (tx) => {
      // Process lines if provided
      let processedLines: Array<{
        productId: string;
        quantity: number;
      }> | null = null;

      if (lines && lines.length > 0) {
        processedLines = lines.map(
          (line: {
            productId: string;
            quantity: number;
          }) => ({
            productId: line.productId,
            quantity: line.quantity || 0,
          })
        );
      }

      // Auto-calculate totalItems and totalQuantity
      let totalItems: number | undefined;
      let totalQuantity: number | undefined;

      if (processedLines) {
        totalItems = processedLines.length;
        totalQuantity = processedLines.reduce((sum, line) => sum + line.quantity, 0);
      }

      // Replace lines if provided
      if (processedLines) {
        await tx.stockTransferLine.deleteMany({
          where: { stockTransferId: id },
        });
      }

      // Build update data
      const updateData: Record<string, unknown> = {};

      if (fromGodownId) updateData.fromGodownId = fromGodownId;
      if (toGodownId) updateData.toGodownId = toGodownId;
      if (date) updateData.date = new Date(date);
      if (notes !== undefined) updateData.notes = notes;
      if (totalItems !== undefined) updateData.totalItems = totalItems;
      if (totalQuantity !== undefined) updateData.totalQuantity = totalQuantity;

      // State Flow Management: Handle shippingStatus transitions
      if (newShippingStatus !== existing.shippingStatus) {
        updateData.shippingStatus = newShippingStatus;
        updateData.status = newShippingStatus; // Sync status with shippingStatus

        // "Pending" → "In-Transit": Set shippedAt to now()
        if (existing.shippingStatus === 'Pending' && newShippingStatus === 'In-Transit') {
          updateData.shippedAt = new Date();
        }

        // "In-Transit" → "Delivered": Set deliveredAt to now(), create StockEntry (type="IN") for each line
        if (existing.shippingStatus === 'In-Transit' && newShippingStatus === 'Delivered') {
          updateData.deliveredAt = new Date();

          // Create StockEntry (type="IN") for each line into the destination godown
          const linesToReceive = processedLines || existing.lines;
          const destGodownId = toGodownId || existing.toGodownId;

          for (const line of linesToReceive) {
            await tx.stockEntry.create({
              data: {
                productId: line.productId,
                godownId: destGodownId,
                type: 'IN',
                quantity: line.quantity,
                reference: existing.transferNo,
                referenceType: 'Transfer',
                date: new Date(),
                notes: `Received at destination: Stock Transfer ${existing.transferNo}`,
              },
            });
          }
        }
      }

      if (processedLines) {
        updateData.lines = {
          create: processedLines,
        };
      }

      const transfer = await tx.stockTransfer.update({
        where: { id },
        data: updateData,
        include: {
          fromGodown: true,
          toGodown: true,
          lines: { include: { product: true } },
        },
      });

      // Create AuditLog entry for update
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'StockTransfers',
          recordId: transfer.id,
          recordLabel: existing.transferNo,
          details: JSON.stringify({
            previousShippingStatus: existing.shippingStatus,
            newShippingStatus,
            totalItems,
            totalQuantity,
            statusTransition: existing.shippingStatus !== newShippingStatus
              ? `${existing.shippingStatus} → ${newShippingStatus}`
              : undefined,
          }),
        },
      });

      return transfer;
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating transfer:', error);
    return NextResponse.json(
      { error: 'Failed to update transfer' },
      { status: 500 }
    );
  }
}

// DELETE /api/transfers/[id] - Soft delete
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'StockTransfers', 'DELETE');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;

    const existing = await db.stockTransfer.findUnique({
      where: { id },
      select: { transferNo: true, isActive: true, shippingStatus: true, date: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Transfer not found' },
        { status: 404 }
      );
    }

    if (!existing.isActive) {
      return NextResponse.json(
        { error: 'Transfer is already deleted' },
        { status: 400 }
      );
    }

    // Period-close lock check
    const periodLock = await checkPeriodClose(existing.date);
    if (periodLock) return periodLock;

    await db.$transaction(async (tx) => {
      await tx.stockTransfer.update({
        where: { id },
        data: { isActive: false },
      });

      // Create AuditLog entry
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'StockTransfers',
          recordId: id,
          recordLabel: existing.transferNo,
          details: JSON.stringify({ softDelete: true, shippingStatus: existing.shippingStatus }),
        },
      });
    });

    return NextResponse.json({ message: 'Transfer deleted successfully' });
  } catch (error) {
    console.error('Error deleting transfer:', error);
    return NextResponse.json(
      { error: 'Failed to delete transfer' },
      { status: 500 }
    );
  }
}
