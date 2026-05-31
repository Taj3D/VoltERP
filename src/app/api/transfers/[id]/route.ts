// ============================================================
// STOCK TRANSFERS [id] API — Phase 12: Intransit Valuation State Machine
// GET, PUT (state machine transitions), DELETE
//
// State Machine Transitions:
//   PENDING → IN_TRANSIT  (SHIP)    : Deduct source, create OUT entry, shift CoA to In-Transit
//   IN_TRANSIT → RECEIVED (RECEIVE) : Add to destination, create IN entry, move CoA to Inventory Asset
//   IN_TRANSIT → REJECTED (REJECT)  : Return to source, create IN entry, reverse CoA
//   BLOCKED: RECEIVED → any, REJECTED → any, IN_TRANSIT → PENDING
//
// All transitions execute within atomic $transaction.
// Godown SUSPENDED interlock checked on every forward transition.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  checkPeriodClose,
  checkFinancialDeletePermission,
  safeFinancialRound,
  safeFinancialAdd,
  safeFinancialSubtract,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// Valid shippingStatus values
const VALID_SHIPPING_STATUSES = ['PENDING', 'IN_TRANSIT', 'RECEIVED', 'REJECTED'];

// Blocked backward transitions
const BLOCKED_TRANSITIONS: Record<string, string[]> = {
  RECEIVED: ['IN_TRANSIT', 'PENDING', 'REJECTED'],
  REJECTED: ['IN_TRANSIT', 'PENDING', 'RECEIVED'],
  IN_TRANSIT: ['PENDING'],
};

// -----------------------------------------------------------
// Helper: Find or create a LedgerEntry code
// -----------------------------------------------------------
async function generateLedgerCode(tx: typeof db): Promise<string> {
  const lastEntry = await tx.ledgerEntry.findFirst({
    orderBy: { entryCode: 'desc' },
    select: { entryCode: true },
  });
  let nextNum = 1;
  if (lastEntry?.entryCode) {
    const match = lastEntry.entryCode.match(/LED-(\d+)/);
    if (match) {
      nextNum = parseInt(match[1], 10) + 1;
    }
  }
  return `LED-${String(nextNum).padStart(5, '0')}`;
}

// -----------------------------------------------------------
// Helper: Find CoA account by name pattern
// -----------------------------------------------------------
async function findCoAAccount(
  tx: typeof db,
  namePattern: string,
  companyId: string | null
) {
  // Try company-scoped first, then global
  if (companyId) {
    const account = await tx.chartOfAccount.findFirst({
      where: { name: { contains: namePattern }, companyId, isActive: true },
    });
    if (account) return account;
  }
  // Fallback to global (no companyId filter)
  return tx.chartOfAccount.findFirst({
    where: { name: { contains: namePattern }, isActive: true },
  });
}

// -----------------------------------------------------------
// GET /api/transfers/[id] — Fetch single transfer
// -----------------------------------------------------------
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'StockTransfers', 'GET');
  if (!security.authorized) return security.response;

  const { companyId } = security.user;

  try {
    const { id } = await params;
    const transfer = await db.stockTransfer.findUnique({
      where: { id },
      include: {
        fromGodown: true,
        toGodown: true,
        company: true,
        lines: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!transfer || !transfer.isActive) {
      return NextResponse.json(
        { error: 'Transfer not found' },
        { status: 404 }
      );
    }

    // Cross-tenant companyId validation
    if (companyId && transfer.companyId && transfer.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Transfer not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(transfer);
  } catch (error) {
    console.error('[TransfersAPI] Error fetching transfer:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transfer' },
      { status: 500 }
    );
  }
}

// -----------------------------------------------------------
// PUT /api/transfers/[id] — Intransit Valuation State Machine
// -----------------------------------------------------------
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'StockTransfers', 'PUT');
  if (!security.authorized) return security.response;

  const { id: userId, name: userName, companyId } = security.user;

  try {
    const { id } = await params;
    const body = await request.json();
    const { shippingStatus, rejectionReason, notes } = body;

    // ── Fetch existing record ──
    const existing = await db.stockTransfer.findUnique({
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

    if (!existing || !existing.isActive) {
      return NextResponse.json(
        { error: 'Transfer not found' },
        { status: 404 }
      );
    }

    // Cross-tenant companyId validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Transfer not found' },
        { status: 404 }
      );
    }

    const currentStatus = existing.shippingStatus;

    // ── If no shippingStatus change, handle basic field updates only ──
    if (!shippingStatus || shippingStatus === currentStatus) {
      // Only allow notes updates on PENDING transfers
      if (currentStatus !== 'PENDING') {
        return NextResponse.json(
          { error: `Cannot modify transfer in "${currentStatus}" status. Only state transitions are allowed.` },
          { status: 400 }
        );
      }

      const updateData: Record<string, unknown> = {};
      if (notes !== undefined) updateData.notes = notes || null;

      if (Object.keys(updateData).length === 0) {
        return NextResponse.json(existing);
      }

      const updated = await db.stockTransfer.update({
        where: { id },
        data: updateData,
        include: {
          fromGodown: true,
          toGodown: true,
          lines: { include: { product: true } },
        },
      });

      return NextResponse.json(updated);
    }

    // ── Validate shippingStatus value ──
    if (!VALID_SHIPPING_STATUSES.includes(shippingStatus)) {
      return NextResponse.json(
        { error: `Invalid shipping status "${shippingStatus}". Valid values: ${VALID_SHIPPING_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    // ── BLOCK backward transitions ──
    const blockedTargets = BLOCKED_TRANSITIONS[currentStatus];
    if (blockedTargets && blockedTargets.includes(shippingStatus)) {
      return NextResponse.json(
        { error: `State transition blocked: Cannot change from "${currentStatus}" to "${shippingStatus}". Backward transitions are not allowed.` },
        { status: 400 }
      );
    }

    // ── Validate forward transition paths ──
    const validTransitions: Record<string, string[]> = {
      PENDING: ['IN_TRANSIT'],
      IN_TRANSIT: ['RECEIVED', 'REJECTED'],
    };

    const allowed = validTransitions[currentStatus];
    if (!allowed || !allowed.includes(shippingStatus)) {
      return NextResponse.json(
        { error: `Invalid state transition: "${currentStatus}" → "${shippingStatus}". Allowed transitions from "${currentStatus}": ${allowed?.join(', ') || 'none'}` },
        { status: 400 }
      );
    }

    // ── Period-close lock check ──
    const periodLock = await checkPeriodClose(existing.date);
    if (periodLock) return periodLock;

    // ── REJECT action requires rejectionReason ──
    if (shippingStatus === 'REJECTED' && (!rejectionReason || !rejectionReason.trim())) {
      return NextResponse.json(
        { error: 'Rejection reason is required when rejecting a transfer' },
        { status: 400 }
      );
    }

    // ── Execute state transition within atomic transaction ──
    const result = await db.$transaction(async (tx) => {
      // ────────────────────────────────────────────────────────
      // TRANSITION 1: PENDING → IN_TRANSIT (SHIP action)
      // ────────────────────────────────────────────────────────
      if (currentStatus === 'PENDING' && shippingStatus === 'IN_TRANSIT') {
        // Check both source AND destination godown are not SUSPENDED
        const [sourceGodown, destGodown] = await Promise.all([
          tx.godown.findUnique({
            where: { id: existing.fromGodownId },
            select: { id: true, name: true, status: true },
          }),
          tx.godown.findUnique({
            where: { id: existing.toGodownId },
            select: { id: true, name: true, status: true },
          }),
        ]);

        if (sourceGodown?.status === 'SUSPENDED') {
          throw new Error('Transfer blocked: Source Godown is SUSPENDED. All stock operations are frozen for this warehouse.');
        }
        if (destGodown?.status === 'SUSPENDED') {
          throw new Error('Transfer blocked: Destination Godown is SUSPENDED. All stock operations are frozen for this warehouse.');
        }

        // Re-validate stock availability inside transaction for consistency
        for (const line of existing.lines) {
          const productStock = await tx.productStock.findUnique({
            where: {
              productId_godownId: {
                productId: line.productId,
                godownId: existing.fromGodownId,
              },
            },
          });

          if (!productStock || productStock.quantity < line.quantity) {
            throw new Error(
              `Insufficient stock for product at source godown. Available: ${productStock?.quantity || 0}, Required: ${line.quantity}`
            );
          }
        }

        // Deduct stock from Source Warehouse and create OUT entries
        let transferTotalValue = 0;

        for (const line of existing.lines) {
          // Decrement ProductStock.quantity at source godown
          const productStock = await tx.productStock.findUnique({
            where: {
              productId_godownId: {
                productId: line.productId,
                godownId: existing.fromGodownId,
              },
            },
          });

          if (productStock) {
            const newQty = safeFinancialSubtract(productStock.quantity, line.quantity);
            const newTotalValue = safeFinancialRound(newQty * productStock.costPrice);
            await tx.productStock.update({
              where: { id: productStock.id },
              data: {
                quantity: newQty,
                totalValue: newTotalValue,
              },
            });
          }

          // Decrement BatchMaster.quantity if batchNumber is provided
          if (line.batchNumber) {
            const batch = await tx.batchMaster.findFirst({
              where: {
                batchNumber: line.batchNumber,
                productId: line.productId,
                godownId: existing.fromGodownId,
                isActive: true,
              },
            });

            if (batch) {
              const newBatchQty = safeFinancialSubtract(batch.quantity, line.quantity);
              const newBatchTotalCost = safeFinancialRound(newBatchQty * batch.costPrice);
              await tx.batchMaster.update({
                where: { id: batch.id },
                data: {
                  quantity: newBatchQty,
                  totalCost: newBatchTotalCost,
                  status: newBatchQty <= 0 ? 'Exhausted' : batch.status,
                },
              });
            }
          }

          // Create StockEntry type="OUT" at source godown
          await tx.stockEntry.create({
            data: {
              productId: line.productId,
              godownId: existing.fromGodownId,
              type: 'OUT',
              quantity: line.quantity,
              costPrice: line.costPrice,
              totalCost: line.totalCost,
              reference: existing.transferNo,
              referenceType: 'Transfer',
              date: new Date(),
              notes: `Shipped: Stock Transfer ${existing.transferNo}`,
              ...(companyId && { companyId }),
            },
          });

          transferTotalValue = safeFinancialAdd(transferTotalValue, line.totalCost);
        }

        // ── Shift asset value to In-Transit CoA ──
        // Credit: "Inventory Asset" (reduce inventory asset)
        // Debit: "Inventory In-Transit" (increase intransit asset)
        const inventoryAssetAccount = await findCoAAccount(tx, 'Inventory Asset', companyId);
        const inTransitAccount = await findCoAAccount(tx, 'Inventory In-Transit', companyId);

        if (inventoryAssetAccount && inTransitAccount && transferTotalValue > 0) {
          const now = new Date();

          // Debit: Inventory In-Transit (increase asset)
          await tx.ledgerEntry.create({
            data: {
              entryCode: await generateLedgerCode(tx),
              date: now,
              accountId: inTransitAccount.id,
              account: inTransitAccount.name,
              particulars: `Stock Transfer ${existing.transferNo} — In-Transit from ${existing.fromGodown?.name || existing.fromGodownId}`,
              debit: transferTotalValue,
              credit: 0,
              reference: existing.transferNo,
              referenceType: 'Transfer',
              ...(companyId && { companyId }),
            },
          });

          // Credit: Inventory Asset (reduce asset)
          await tx.ledgerEntry.create({
            data: {
              entryCode: await generateLedgerCode(tx),
              date: now,
              accountId: inventoryAssetAccount.id,
              account: inventoryAssetAccount.name,
              particulars: `Stock Transfer ${existing.transferNo} — Shipped to ${existing.toGodown?.name || existing.toGodownId}`,
              debit: 0,
              credit: transferTotalValue,
              reference: existing.transferNo,
              referenceType: 'Transfer',
              ...(companyId && { companyId }),
            },
          });
        }

        // Update transfer record
        const updated = await tx.stockTransfer.update({
          where: { id },
          data: {
            shippingStatus: 'IN_TRANSIT',
            status: 'In-Transit',
            shippedAt: new Date(),
            totalValue: transferTotalValue,
          },
          include: {
            fromGodown: true,
            toGodown: true,
            lines: { include: { product: true } },
          },
        });

        // AuditLog
        await logUserActivity({
          action: 'UPDATE',
          module: 'Inv-Logistics-Core',
          recordId: id,
          recordLabel: existing.transferNo,
          userId,
          userName,
          details: JSON.stringify({
            transition: 'PENDING → IN_TRANSIT (SHIP)',
            totalValue: transferTotalValue,
            linesShipped: existing.lines.length,
          }),
        });

        return updated;
      }

      // ────────────────────────────────────────────────────────
      // TRANSITION 2: IN_TRANSIT → RECEIVED (RECEIVE action)
      // ────────────────────────────────────────────────────────
      if (currentStatus === 'IN_TRANSIT' && shippingStatus === 'RECEIVED') {
        let totalReceivedValue = 0;

        // Atomically move stock into Destination Warehouse
        for (const line of existing.lines) {
          // Increment ProductStock.quantity at destination godown (create if not exists)
          const destProductStock = await tx.productStock.findUnique({
            where: {
              productId_godownId: {
                productId: line.productId,
                godownId: existing.toGodownId,
              },
            },
          });

          if (destProductStock) {
            const newQty = safeFinancialAdd(destProductStock.quantity, line.quantity);
            // Recalculate weighted average cost
            const currentTotalValue = safeFinancialRound(destProductStock.quantity * destProductStock.costPrice);
            const incomingTotalValue = safeFinancialRound(line.quantity * line.costPrice);
            const newTotalValue = safeFinancialAdd(currentTotalValue, incomingTotalValue);
            const newCostPrice = newQty > 0 ? safeFinancialRound(newTotalValue / newQty) : destProductStock.costPrice;

            await tx.productStock.update({
              where: { id: destProductStock.id },
              data: {
                quantity: newQty,
                costPrice: newCostPrice,
                totalValue: newTotalValue,
              },
            });
          } else {
            // Create ProductStock at destination
            await tx.productStock.create({
              data: {
                productId: line.productId,
                godownId: existing.toGodownId,
                quantity: line.quantity,
                costPrice: line.costPrice,
                totalValue: safeFinancialRound(line.quantity * line.costPrice),
                alertLevel: 0,
                ...(companyId && { companyId }),
              },
            });
          }

          // Increment BatchMaster at destination if batchNumber provided (create batch at destination if needed)
          if (line.batchNumber) {
            const destBatch = await tx.batchMaster.findFirst({
              where: {
                batchNumber: line.batchNumber,
                productId: line.productId,
                godownId: existing.toGodownId,
                isActive: true,
              },
            });

            if (destBatch) {
              const newBatchQty = safeFinancialAdd(destBatch.quantity, line.quantity);
              const newBatchTotalCost = safeFinancialRound(newBatchQty * line.costPrice);
              await tx.batchMaster.update({
                where: { id: destBatch.id },
                data: {
                  quantity: newBatchQty,
                  costPrice: line.costPrice,
                  totalCost: newBatchTotalCost,
                  status: 'Active',
                },
              });
            } else {
              // Create batch at destination
              await tx.batchMaster.create({
                data: {
                  batchNumber: line.batchNumber,
                  productId: line.productId,
                  godownId: existing.toGodownId,
                  quantity: line.quantity,
                  costPrice: line.costPrice,
                  totalCost: safeFinancialRound(line.quantity * line.costPrice),
                  salePrice: 0,
                  status: 'Active',
                  ...(companyId && { companyId }),
                },
              });
            }
          }

          // Create StockEntry type="IN" at destination godown
          await tx.stockEntry.create({
            data: {
              productId: line.productId,
              godownId: existing.toGodownId,
              type: 'IN',
              quantity: line.quantity,
              costPrice: line.costPrice,
              totalCost: line.totalCost,
              reference: existing.transferNo,
              referenceType: 'Transfer',
              date: new Date(),
              notes: `Received: Stock Transfer ${existing.transferNo}`,
              ...(companyId && { companyId }),
            },
          });

          totalReceivedValue = safeFinancialAdd(totalReceivedValue, line.totalCost);
        }

        // ── Move CoA: Debit "Inventory Asset", Credit "Inventory In-Transit" ──
        const inventoryAssetAccount = await findCoAAccount(tx, 'Inventory Asset', companyId);
        const inTransitAccount = await findCoAAccount(tx, 'Inventory In-Transit', companyId);

        if (inventoryAssetAccount && inTransitAccount && totalReceivedValue > 0) {
          const now = new Date();

          // Debit: Inventory Asset (increase asset at destination)
          await tx.ledgerEntry.create({
            data: {
              entryCode: await generateLedgerCode(tx),
              date: now,
              accountId: inventoryAssetAccount.id,
              account: inventoryAssetAccount.name,
              particulars: `Stock Transfer ${existing.transferNo} — Received at ${existing.toGodown?.name || existing.toGodownId}`,
              debit: totalReceivedValue,
              credit: 0,
              reference: existing.transferNo,
              referenceType: 'Transfer',
              ...(companyId && { companyId }),
            },
          });

          // Credit: Inventory In-Transit (reduce intransit asset)
          await tx.ledgerEntry.create({
            data: {
              entryCode: await generateLedgerCode(tx),
              date: now,
              accountId: inTransitAccount.id,
              account: inTransitAccount.name,
              particulars: `Stock Transfer ${existing.transferNo} — Delivered, clearing In-Transit`,
              debit: 0,
              credit: totalReceivedValue,
              reference: existing.transferNo,
              referenceType: 'Transfer',
              ...(companyId && { companyId }),
            },
          });
        }

        // Update transfer record
        const updated = await tx.stockTransfer.update({
          where: { id },
          data: {
            shippingStatus: 'RECEIVED',
            status: 'Received',
            deliveredAt: new Date(),
          },
          include: {
            fromGodown: true,
            toGodown: true,
            lines: { include: { product: true } },
          },
        });

        // AuditLog
        await logUserActivity({
          action: 'UPDATE',
          module: 'Inv-Logistics-Core',
          recordId: id,
          recordLabel: existing.transferNo,
          userId,
          userName,
          details: JSON.stringify({
            transition: 'IN_TRANSIT → RECEIVED (RECEIVE)',
            totalReceivedValue,
            linesReceived: existing.lines.length,
          }),
        });

        return updated;
      }

      // ────────────────────────────────────────────────────────
      // TRANSITION 3: IN_TRANSIT → REJECTED (REJECT action)
      // ────────────────────────────────────────────────────────
      if (currentStatus === 'IN_TRANSIT' && shippingStatus === 'REJECTED') {
        let totalRejectedValue = 0;

        // Return stock to Source Warehouse
        for (const line of existing.lines) {
          // Increment ProductStock.quantity back at source godown
          const sourceProductStock = await tx.productStock.findUnique({
            where: {
              productId_godownId: {
                productId: line.productId,
                godownId: existing.fromGodownId,
              },
            },
          });

          if (sourceProductStock) {
            const newQty = safeFinancialAdd(sourceProductStock.quantity, line.quantity);
            const newTotalValue = safeFinancialRound(newQty * sourceProductStock.costPrice);
            await tx.productStock.update({
              where: { id: sourceProductStock.id },
              data: {
                quantity: newQty,
                totalValue: newTotalValue,
              },
            });
          } else {
            // Should not normally happen since we deducted from here, but create as safety
            await tx.productStock.create({
              data: {
                productId: line.productId,
                godownId: existing.fromGodownId,
                quantity: line.quantity,
                costPrice: line.costPrice,
                totalValue: safeFinancialRound(line.quantity * line.costPrice),
                alertLevel: 0,
                ...(companyId && { companyId }),
              },
            });
          }

          // Increment BatchMaster.quantity back if batchNumber
          if (line.batchNumber) {
            const sourceBatch = await tx.batchMaster.findFirst({
              where: {
                batchNumber: line.batchNumber,
                productId: line.productId,
                godownId: existing.fromGodownId,
                isActive: true,
              },
            });

            if (sourceBatch) {
              const newBatchQty = safeFinancialAdd(sourceBatch.quantity, line.quantity);
              const newBatchTotalCost = safeFinancialRound(newBatchQty * sourceBatch.costPrice);
              await tx.batchMaster.update({
                where: { id: sourceBatch.id },
                data: {
                  quantity: newBatchQty,
                  totalCost: newBatchTotalCost,
                  status: 'Active', // Reactivate if was Exhausted
                },
              });
            } else {
              // Recreate batch at source (it may have been exhausted and marked inactive)
              await tx.batchMaster.create({
                data: {
                  batchNumber: line.batchNumber,
                  productId: line.productId,
                  godownId: existing.fromGodownId,
                  quantity: line.quantity,
                  costPrice: line.costPrice,
                  totalCost: safeFinancialRound(line.quantity * line.costPrice),
                  salePrice: 0,
                  status: 'Active',
                  ...(companyId && { companyId }),
                },
              });
            }
          }

          // Create StockEntry type="IN" at source godown (return)
          await tx.stockEntry.create({
            data: {
              productId: line.productId,
              godownId: existing.fromGodownId,
              type: 'IN',
              quantity: line.quantity,
              costPrice: line.costPrice,
              totalCost: line.totalCost,
              reference: existing.transferNo,
              referenceType: 'Transfer',
              date: new Date(),
              notes: `Rejected Return: Stock Transfer ${existing.transferNo}`,
              ...(companyId && { companyId }),
            },
          });

          totalRejectedValue = safeFinancialAdd(totalRejectedValue, line.totalCost);
        }

        // ── Reverse CoA: Credit "Inventory Asset", Debit "Inventory In-Transit" ──
        const inventoryAssetAccount = await findCoAAccount(tx, 'Inventory Asset', companyId);
        const inTransitAccount = await findCoAAccount(tx, 'Inventory In-Transit', companyId);

        if (inventoryAssetAccount && inTransitAccount && totalRejectedValue > 0) {
          const now = new Date();

          // Credit: Inventory Asset (increase asset back at source)
          await tx.ledgerEntry.create({
            data: {
              entryCode: await generateLedgerCode(tx),
              date: now,
              accountId: inventoryAssetAccount.id,
              account: inventoryAssetAccount.name,
              particulars: `Stock Transfer ${existing.transferNo} — Rejected, stock returned to ${existing.fromGodown?.name || existing.fromGodownId}`,
              debit: 0,
              credit: totalRejectedValue,
              reference: existing.transferNo,
              referenceType: 'Transfer',
              ...(companyId && { companyId }),
            },
          });

          // Debit: Inventory In-Transit (reduce intransit asset)
          await tx.ledgerEntry.create({
            data: {
              entryCode: await generateLedgerCode(tx),
              date: now,
              accountId: inTransitAccount.id,
              account: inTransitAccount.name,
              particulars: `Stock Transfer ${existing.transferNo} — Rejected, clearing In-Transit`,
              debit: totalRejectedValue,
              credit: 0,
              reference: existing.transferNo,
              referenceType: 'Transfer',
              ...(companyId && { companyId }),
            },
          });
        }

        // Update transfer record
        const updated = await tx.stockTransfer.update({
          where: { id },
          data: {
            shippingStatus: 'REJECTED',
            status: 'Rejected',
            rejectedAt: new Date(),
            rejectionReason: rejectionReason?.trim() || null,
          },
          include: {
            fromGodown: true,
            toGodown: true,
            lines: { include: { product: true } },
          },
        });

        // AuditLog
        await logUserActivity({
          action: 'UPDATE',
          module: 'Inv-Logistics-Core',
          recordId: id,
          recordLabel: existing.transferNo,
          userId,
          userName,
          details: JSON.stringify({
            transition: 'IN_TRANSIT → REJECTED (REJECT)',
            rejectionReason: rejectionReason?.trim() || null,
            totalRejectedValue,
            linesReturned: existing.lines.length,
          }),
        });

        return updated;
      }

      // Should never reach here due to validation above, but just in case
      throw new Error(`Unhandled state transition: ${currentStatus} → ${shippingStatus}`);
    });

    return NextResponse.json(result);
  } catch (error) {
    // Handle thrown errors from $transaction (e.g., SUSPENDED interlock)
    if (error instanceof Error) {
      if (error.message.includes('SUSPENDED')) {
        return NextResponse.json(
          { error: error.message },
          { status: 403 }
        );
      }
      if (error.message.includes('Insufficient stock')) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }
      if (error.message.includes('Unhandled state transition')) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }
    }
    console.error('[TransfersAPI] Error updating transfer:', error);
    return NextResponse.json(
      { error: 'Failed to update transfer' },
      { status: 500 }
    );
  }
}

// -----------------------------------------------------------
// DELETE /api/transfers/[id] — Admin-only soft delete
// Reverses any stock effects if in IN_TRANSIT state
// -----------------------------------------------------------
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'StockTransfers', 'DELETE');
  if (!security.authorized) return security.response;

  const { id: userId, name: userName, companyId } = security.user;

  // Admin-only delete permission
  const deleteCheck = checkFinancialDeletePermission(security.user.role);
  if (deleteCheck) return deleteCheck;

  try {
    const { id } = await params;

    // Fetch existing record with lines
    const existing = await db.stockTransfer.findUnique({
      where: { id },
      include: {
        lines: true,
      },
    });

    if (!existing || !existing.isActive) {
      return NextResponse.json(
        { error: 'Transfer not found' },
        { status: 404 }
      );
    }

    // Cross-tenant companyId validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Transfer not found' },
        { status: 404 }
      );
    }

    // Period-close lock check
    const periodLock = await checkPeriodClose(existing.date);
    if (periodLock) return periodLock;

    // Cannot delete RECEIVED transfers (final state)
    if (existing.shippingStatus === 'RECEIVED') {
      return NextResponse.json(
        { error: 'Cannot delete a transfer that has been received. Received transfers are final.' },
        { status: 400 }
      );
    }

    await db.$transaction(async (tx) => {
      // ── If IN_TRANSIT, reverse stock effects before soft-deleting ──
      if (existing.shippingStatus === 'IN_TRANSIT') {
        let totalReversalValue = 0;

        for (const line of existing.lines) {
          // Return stock to Source Warehouse
          const sourceProductStock = await tx.productStock.findUnique({
            where: {
              productId_godownId: {
                productId: line.productId,
                godownId: existing.fromGodownId,
              },
            },
          });

          if (sourceProductStock) {
            const newQty = safeFinancialAdd(sourceProductStock.quantity, line.quantity);
            const newTotalValue = safeFinancialRound(newQty * sourceProductStock.costPrice);
            await tx.productStock.update({
              where: { id: sourceProductStock.id },
              data: {
                quantity: newQty,
                totalValue: newTotalValue,
              },
            });
          }

          // Increment BatchMaster.quantity back if batchNumber
          if (line.batchNumber) {
            const sourceBatch = await tx.batchMaster.findFirst({
              where: {
                batchNumber: line.batchNumber,
                productId: line.productId,
                godownId: existing.fromGodownId,
                isActive: true,
              },
            });

            if (sourceBatch) {
              const newBatchQty = safeFinancialAdd(sourceBatch.quantity, line.quantity);
              const newBatchTotalCost = safeFinancialRound(newBatchQty * sourceBatch.costPrice);
              await tx.batchMaster.update({
                where: { id: sourceBatch.id },
                data: {
                  quantity: newBatchQty,
                  totalCost: newBatchTotalCost,
                  status: 'Active',
                },
              });
            }
          }

          // Create StockEntry type="IN" at source godown (reversal)
          await tx.stockEntry.create({
            data: {
              productId: line.productId,
              godownId: existing.fromGodownId,
              type: 'IN',
              quantity: line.quantity,
              costPrice: line.costPrice,
              totalCost: line.totalCost,
              reference: existing.transferNo,
              referenceType: 'Transfer',
              date: new Date(),
              notes: `Deletion Reversal: Stock Transfer ${existing.transferNo} cancelled`,
              ...(companyId && { companyId }),
            },
          });

          totalReversalValue = safeFinancialAdd(totalReversalValue, line.totalCost);
        }

        // ── Reverse CoA entries for IN_TRANSIT state ──
        // Credit "Inventory Asset", Debit "Inventory In-Transit"
        const inventoryAssetAccount = await findCoAAccount(tx, 'Inventory Asset', companyId);
        const inTransitAccount = await findCoAAccount(tx, 'Inventory In-Transit', companyId);

        if (inventoryAssetAccount && inTransitAccount && totalReversalValue > 0) {
          const now = new Date();

          // Credit: Inventory Asset (restore asset at source)
          await tx.ledgerEntry.create({
            data: {
              entryCode: await generateLedgerCode(tx),
              date: now,
              accountId: inventoryAssetAccount.id,
              account: inventoryAssetAccount.name,
              particulars: `Stock Transfer ${existing.transferNo} — Deleted, reversing In-Transit shipment`,
              debit: 0,
              credit: totalReversalValue,
              reference: existing.transferNo,
              referenceType: 'Transfer',
              ...(companyId && { companyId }),
            },
          });

          // Debit: Inventory In-Transit (clear intransit asset)
          await tx.ledgerEntry.create({
            data: {
              entryCode: await generateLedgerCode(tx),
              date: now,
              accountId: inTransitAccount.id,
              account: inTransitAccount.name,
              particulars: `Stock Transfer ${existing.transferNo} — Deleted, clearing In-Transit`,
              debit: totalReversalValue,
              credit: 0,
              reference: existing.transferNo,
              referenceType: 'Transfer',
              ...(companyId && { companyId }),
            },
          });
        }
      }

      // ── If PENDING, just soft-delete (no stock was deducted) ──

      // Soft delete the transfer
      await tx.stockTransfer.update({
        where: { id },
        data: { isActive: false },
      });

      // AuditLog via logUserActivity
      await logUserActivity({
        action: 'DELETE',
        module: 'Inv-Logistics-Core',
        recordId: id,
        recordLabel: existing.transferNo,
        userId,
        userName,
        details: JSON.stringify({
          softDelete: true,
          previousShippingStatus: existing.shippingStatus,
          stockReversed: existing.shippingStatus === 'IN_TRANSIT',
          totalValue: existing.totalValue,
        }),
      });
    });

    return NextResponse.json({ message: 'Transfer deleted successfully' });
  } catch (error) {
    console.error('[TransfersAPI] Error deleting transfer:', error);
    return NextResponse.json(
      { error: 'Failed to delete transfer' },
      { status: 500 }
    );
  }
}
