// ============================================================
// PURCHASE ORDER RECEIVING — Ingestion Matrix Interface
// Connects PO fulfillment updates directly to active warehouse
// receiving channels. Atomic transaction ensures stock entries,
// line-level receiving progress, and PO-level status transitions
// are always consistent.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity, checkPeriodClose, safeFinancialRound } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// -----------------------------------------------------------
// Types
// -----------------------------------------------------------

interface ReceivedItem {
  productId: string;
  receivedQuantity: number;
  godownId?: string; // optional override for receiving warehouse
}

interface ReceiveRequestBody {
  purchaseOrderId: string;
  receivedItems: ReceivedItem[];
  receivedDate: string;
  challanRef?: string;
  notes?: string;
}

// -----------------------------------------------------------
// GET /api/purchase-orders/receive?purchaseOrderId=xxx
// Returns the receiving status for a PO:
//   - PO details with lines
//   - For each line: ordered qty, received qty, pending qty, receiving status
//   - List of all stock entries linked to this PO
// -----------------------------------------------------------

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'PurchaseOrders', 'GET');
  if (!security.authorized) return security.response;

  // Dealer and SR roles blocked from PO receiving data
  if (security.user.role === 'dealer') {
    return NextResponse.json(
      { error: 'Access denied. Dealers cannot access purchase order receiving records.' },
      { status: 403 }
    );
  }
  if (security.user.role === 'sr') {
    return NextResponse.json(
      { error: 'Access denied. SRs cannot access purchase order receiving records.' },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const purchaseOrderId = searchParams.get('purchaseOrderId');

    if (!purchaseOrderId) {
      return NextResponse.json(
        { error: 'purchaseOrderId query parameter is required' },
        { status: 400 }
      );
    }

    // Fetch the PO with all lines and product details
    const purchaseOrder = await db.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: {
        supplier: true,
        godown: true,
        lines: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!purchaseOrder) {
      return NextResponse.json(
        { error: 'Purchase order not found' },
        { status: 404 }
      );
    }

    // Fetch all stock entries linked to this PO via the poNumber reference
    const stockEntries = await db.stockEntry.findMany({
      where: {
        reference: purchaseOrder.poNumber,
        referenceType: 'PurchaseOrder',
      },
      include: {
        product: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Build per-line receiving status summary
    const lineReceivingStatus = purchaseOrder.lines.map((line) => {
      const orderedQty = line.quantity;
      const receivedQty = line.receivedQuantity;
      const pendingQty = line.pendingQuantity;
      let status: string;

      if (receivedQty >= orderedQty) {
        status = 'Fully Received';
      } else if (receivedQty > 0) {
        status = 'Partially Received';
      } else {
        status = 'Unreceived';
      }

      return {
        lineId: line.id,
        productId: line.productId,
        productName: line.product?.name || null,
        productCode: line.product?.productCode || null,
        orderedQuantity: orderedQty,
        receivedQuantity: receivedQty,
        pendingQuantity: pendingQty,
        receivingStatus: status,
      };
    });

    return NextResponse.json({
      purchaseOrder: {
        id: purchaseOrder.id,
        poNumber: purchaseOrder.poNumber,
        date: purchaseOrder.date,
        status: purchaseOrder.status,
        fulfillmentStatus: purchaseOrder.fulfillmentStatus,
        receivingStatus: purchaseOrder.receivingStatus,
        receivedDate: purchaseOrder.receivedDate,
        godown: purchaseOrder.godown,
        supplier: purchaseOrder.supplier,
        notes: purchaseOrder.notes,
      },
      lines: lineReceivingStatus,
      stockEntries,
    });
  } catch (error) {
    console.error('Error fetching PO receiving status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch purchase order receiving status' },
      { status: 500 }
    );
  }
}

// -----------------------------------------------------------
// POST /api/purchase-orders/receive
// Receive items against a confirmed or partially received PO.
// Atomic transaction ensures all mutations succeed or none do.
// -----------------------------------------------------------

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'PurchaseOrders', 'POST');
  if (!security.authorized) return security.response;

  // Dealer and SR roles blocked from PO receiving operations
  if (security.user.role === 'dealer') {
    return NextResponse.json(
      { error: 'Access denied. Dealers cannot receive purchase order items.' },
      { status: 403 }
    );
  }
  if (security.user.role === 'sr') {
    return NextResponse.json(
      { error: 'Access denied. SRs cannot receive purchase order items.' },
      { status: 403 }
    );
  }

  try {
    const body: ReceiveRequestBody = await request.json();
    const { purchaseOrderId, receivedItems, receivedDate, challanRef, notes } = body;

    // ── 1. Request body validation ──────────────────────────
    if (!purchaseOrderId) {
      return NextResponse.json(
        { error: 'purchaseOrderId is required' },
        { status: 400 }
      );
    }
    if (!receivedItems || !Array.isArray(receivedItems) || receivedItems.length === 0) {
      return NextResponse.json(
        { error: 'receivedItems must be a non-empty array' },
        { status: 400 }
      );
    }
    if (!receivedDate) {
      return NextResponse.json(
        { error: 'receivedDate is required' },
        { status: 400 }
      );
    }

    // Validate each receivedItem has required fields and positive quantity
    for (let i = 0; i < receivedItems.length; i++) {
      const item = receivedItems[i];
      if (!item.productId) {
        return NextResponse.json(
          { error: `receivedItems[${i}].productId is required` },
          { status: 400 }
        );
      }
      if (!item.receivedQuantity || item.receivedQuantity <= 0) {
        return NextResponse.json(
          { error: `receivedItems[${i}].receivedQuantity must be a positive number` },
          { status: 400 }
        );
      }
    }

    // ── 2. Validate PO exists and is in a receivable status ──
    const purchaseOrder = await db.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: {
        lines: true,
        godown: true,
      },
    });

    if (!purchaseOrder) {
      return NextResponse.json(
        { error: 'Purchase order not found' },
        { status: 404 }
      );
    }

    if (!purchaseOrder.isActive) {
      return NextResponse.json(
        { error: 'Cannot receive against an inactive/deleted purchase order' },
        { status: 400 }
      );
    }

    const receivableStatuses = ['Confirmed', 'Partially Received'];
    if (!receivableStatuses.includes(purchaseOrder.status)) {
      return NextResponse.json(
        { error: `Purchase order status is "${purchaseOrder.status}". Only "Confirmed" or "Partially Received" orders can receive items.` },
        { status: 400 }
      );
    }

    // ── 3. Validate each productId exists in the PO's lines ──
    const poLineMap = new Map(purchaseOrder.lines.map((line) => [line.productId, line]));

    for (let i = 0; i < receivedItems.length; i++) {
      const item = receivedItems[i];
      if (!poLineMap.has(item.productId)) {
        return NextResponse.json(
          { error: `receivedItems[${i}]: Product ${item.productId} does not exist in this purchase order's lines` },
          { status: 400 }
        );
      }
    }

    // ── 4. Validate receivedQuantity does not exceed remaining ──
    for (let i = 0; i < receivedItems.length; i++) {
      const item = receivedItems[i];
      const line = poLineMap.get(item.productId)!;
      const remainingQty = safeFinancialRound(line.quantity - line.receivedQuantity);

      if (item.receivedQuantity > remainingQty) {
        return NextResponse.json(
          {
            error: `receivedItems[${i}]: Received quantity (${item.receivedQuantity}) exceeds remaining quantity (${remainingQty}) for product ${line.product?.productCode || item.productId}. Ordered: ${line.quantity}, Already received: ${line.receivedQuantity}`,
          },
          { status: 400 }
        );
      }
    }

    // ── 5. Period close check on receivedDate ────────────────
    const periodLock = await checkPeriodClose(new Date(receivedDate));
    if (periodLock) return periodLock;

    // ── 6. Godown SUSPENDED check ───────────────────────────
    // Check the PO-level godown and any per-item godown overrides
    const godownIdsToCheck = new Set<string>();
    if (purchaseOrder.godownId) {
      godownIdsToCheck.add(purchaseOrder.godownId);
    }
    for (const item of receivedItems) {
      if (item.godownId) {
        godownIdsToCheck.add(item.godownId);
      }
    }

    for (const godownId of godownIdsToCheck) {
      const godown = await db.godown.findUnique({
        where: { id: godownId },
        select: { id: true, name: true, status: true, isActive: true },
      });
      if (!godown || !godown.isActive) {
        return NextResponse.json(
          { error: `Receiving warehouse "${godownId}" not found or is inactive` },
          { status: 400 }
        );
      }
      if (godown.status === 'SUSPENDED') {
        return NextResponse.json(
          { error: `EMERGENCY CLOSURE: Warehouse "${godown.name}" is SUSPENDED. All receiving operations to this location are blocked until reactivated.` },
          { status: 403 }
        );
      }
    }

    // ── 7. Atomic transaction ───────────────────────────────
    const result = await db.$transaction(async (tx) => {
      // 7a. Process each received item
      for (const item of receivedItems) {
        const line = poLineMap.get(item.productId)!;
        const newReceivedQty = safeFinancialRound(line.receivedQuantity + item.receivedQuantity);
        const newPendingQty = safeFinancialRound(line.quantity - newReceivedQty);

        // Update PurchaseOrderLine
        await tx.purchaseOrderLine.update({
          where: { id: line.id },
          data: {
            receivedQuantity: newReceivedQty,
            pendingQuantity: newPendingQty,
          },
        });

        // Determine godownId: per-item override > PO-level godown
        const effectiveGodownId = item.godownId || purchaseOrder.godownId || null;

        // Create StockEntry (type=IN) for the received item
        await tx.stockEntry.create({
          data: {
            productId: item.productId,
            godownId: effectiveGodownId,
            type: 'IN',
            quantity: item.receivedQuantity,
            reference: purchaseOrder.poNumber,
            referenceType: 'PurchaseOrder',
            date: new Date(receivedDate),
            notes: challanRef ? `Challan: ${challanRef}` : null,
          },
        });

        // Update the in-memory line map for PO-level status calculation
        poLineMap.set(item.productId, {
          ...line,
          receivedQuantity: newReceivedQty,
          pendingQuantity: newPendingQty,
        });
      }

      // 7b. Determine PO-level receivingStatus
      // Refresh lines from DB for authoritative status calculation
      const updatedLines = await tx.purchaseOrderLine.findMany({
        where: { purchaseOrderId },
      });

      const allLinesFullyReceived = updatedLines.every(
        (l) => safeFinancialRound(l.receivedQuantity) >= safeFinancialRound(l.quantity)
      );
      const anyLineReceived = updatedLines.some(
        (l) => safeFinancialRound(l.receivedQuantity) > 0
      );

      let receivingStatus: string;
      if (allLinesFullyReceived) {
        receivingStatus = 'Fully Received';
      } else if (anyLineReceived) {
        receivingStatus = 'Partially Received';
      } else {
        receivingStatus = 'Unreceived';
      }

      // 7c. Determine PO-level fulfillmentStatus
      let fulfillmentStatus: string;
      if (receivingStatus === 'Fully Received') {
        fulfillmentStatus = 'Fulfilled';
      } else if (receivingStatus === 'Partially Received') {
        fulfillmentStatus = 'Partial';
      } else {
        fulfillmentStatus = 'Pending';
      }

      // 7d. Determine PO-level status
      let poStatus: string;
      if (receivingStatus === 'Fully Received') {
        poStatus = 'Received';
      } else {
        poStatus = 'Partially Received';
      }

      // Build the update payload
      const updateData: Record<string, unknown> = {
        receivingStatus,
        fulfillmentStatus,
        status: poStatus,
      };

      // Set receivedDate only when fully received
      if (receivingStatus === 'Fully Received') {
        updateData.receivedDate = new Date(receivedDate);
      }

      // Append receiving notes (preserve existing notes + add new)
      if (notes) {
        const existingNotes = purchaseOrder.notes || '';
        const timestamp = new Date().toISOString();
        updateData.notes = existingNotes
          ? `${existingNotes}\n[${timestamp}] Receiving: ${notes}`
          : `[${timestamp}] Receiving: ${notes}`;
      }

      // Update PurchaseOrder
      const updatedPO = await tx.purchaseOrder.update({
        where: { id: purchaseOrderId },
        data: updateData,
        include: {
          supplier: true,
          godown: true,
          lines: {
            include: {
              product: true,
            },
          },
        },
      });

      // 7e. Create audit log: action='RECEIVE', module='PurchaseOrders'
      await tx.auditLog.create({
        data: {
          action: 'RECEIVE',
          module: 'PurchaseOrders',
          recordId: purchaseOrderId,
          recordLabel: purchaseOrder.poNumber,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            receivedItems: receivedItems.map((item) => ({
              productId: item.productId,
              receivedQuantity: item.receivedQuantity,
              godownId: item.godownId || purchaseOrder.godownId || null,
            })),
            receivedDate,
            challanRef: challanRef || null,
            receivingStatus,
            fulfillmentStatus,
            poStatus,
          }),
        },
      });

      return updatedPO;
    });

    // 7f. Call logUserActivity for the receiving event (outside tx — non-blocking)
    await logUserActivity({
      action: 'UPDATE',
      module: 'Inv-PO-Receiving',
      recordId: purchaseOrderId,
      recordLabel: purchaseOrder.poNumber,
      userId: security.user.id,
      userName: security.user.name,
      details: `Received ${receivedItems.length} item(s) against PO ${purchaseOrder.poNumber}. Status: ${result.receivingStatus}`,
    });

    // Automated SMS: Inventory Ingestion Event (legacy toggle)
    for (const line of receivedItems) {
      try {
        // Find the stock entry just created for this received item
        const stockEntry = await db.stockEntry.findFirst({
          where: {
            productId: line.productId,
            reference: purchaseOrder.poNumber,
            referenceType: 'PurchaseOrder',
            type: 'IN',
          },
          orderBy: { createdAt: 'desc' },
        });

        if (stockEntry) {
          const { triggerInventoryIngestionSms } = await import('@/lib/sms-event-hooks');
          await triggerInventoryIngestionSms({
            id: stockEntry.id,
            supplierId: purchaseOrder.supplierId || undefined,
            productId: line.productId,
            quantity: line.receivedQuantity,
            godownId: purchaseOrder.godownId || undefined,
            date: new Date(),
            companyId: purchaseOrder.companyId || undefined,
          });
        }
      } catch (smsError) {
        console.error('[PO-Receive] SMS trigger failed (non-blocking):', smsError);
      }
    }

    // NEW: Auto SMS on Godown/Showroom Stock Receive (autoSmsOnGodownReceive toggle)
    try {
      // Build a summary of received items for the SMS
      const receivedProducts = await db.product.findMany({
        where: { id: { in: receivedItems.map(item => item.productId) } },
        select: { id: true, name: true },
      });
      const itemSummary = receivedProducts.map(p => p.name).join(', ');

      // Look up godown name
      let godownName = 'Warehouse';
      if (purchaseOrder.godownId) {
        const godown = await db.godown.findUnique({
          where: { id: purchaseOrder.godownId },
          select: { name: true },
        });
        if (godown) godownName = godown.name;
      }

      const { triggerPurchaseOrderReceivedSms } = await import('@/lib/sms-event-hooks');
      await triggerPurchaseOrderReceivedSms({
        purchaseOrderId: purchaseOrder.id,
        poNumber: purchaseOrder.poNumber,
        supplierId: purchaseOrder.supplierId,
        itemSummary,
        godownName,
        companyId: purchaseOrder.companyId || undefined,
      });
    } catch (smsError) {
      console.error('[PO-Receive] GodownReceive SMS trigger failed (non-blocking):', smsError);
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('Error receiving purchase order items:', error);
    return NextResponse.json(
      { error: 'Failed to receive purchase order items' },
      { status: 500 }
    );
  }
}
