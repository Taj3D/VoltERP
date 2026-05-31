import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  checkPeriodClose,
  safeFinancialRound,
  safeFinancialSubtract,
  safeFinancialAdd,
  checkFinancialDeletePermission,
  maskForVatAuditor,
  maskFinancialArray,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

const VALID_REASONS = ['BROKEN', 'EXPIRED', 'THEFT', 'MOISTURE'];

// GET /api/damage-logs/[id] - Get single damage log with cross-tenant validation + VAT Auditor masking
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'DamageLogs', 'GET');
  if (!security.authorized) return security.response;

  const { role, companyId } = security.user;

  // Dealer: blocked entirely from damage logs
  if (role === 'dealer') {
    return NextResponse.json(
      { error: 'Access denied. Dealer role does not have access to Damage Logs.' },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    const damageLog = await db.damageLog.findUnique({
      where: { id },
      include: {
        product: true,
        godown: true,
      },
    });

    if (!damageLog) {
      return NextResponse.json(
        { error: 'Damage log not found' },
        { status: 404 }
      );
    }

    // Cross-tenant validation: if user has a companyId, record must match
    if (companyId && damageLog.companyId && damageLog.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Damage log not found' },
        { status: 404 }
      );
    }

    // Apply VAT Auditor financial masking
    const maskedLog = maskFinancialArray(
      [damageLog as Record<string, unknown>],
      role,
      ['lossCostPrice', 'totalLossValue', 'quantity']
    )[0];

    return NextResponse.json(maskedLog);
  } catch (error) {
    console.error('Error fetching damage log:', error);
    return NextResponse.json(
      { error: 'Failed to fetch damage log' },
      { status: 500 }
    );
  }
}

// PUT /api/damage-logs/[id] - Update damage log with balanced stock reversal + re-entry
// Cross-tenant companyId validation, damageCode immutable, stock re-validation on quantity change
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'DamageLogs', 'PUT');
  if (!security.authorized) return security.response;

  const { id: userId, name: userName, role, companyId } = security.user;

  // Dealer: blocked entirely from damage logs
  if (role === 'dealer') {
    return NextResponse.json(
      { error: 'Access denied. Dealer role does not have access to Damage Logs.' },
      { status: 403 }
    );
  }

  // SR: read-only access — cannot update
  if (role === 'sr') {
    return NextResponse.json(
      { error: 'Write access denied. SR role has read-only access to Damage Logs.' },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const {
      godownId,
      batchNumber,
      quantity,
      lossCostPrice,
      reason,
      description,
      reportDate,
      approvedBy,
      status,
    } = body;

    // Fetch existing record for cross-tenant validation, stock reversal, ledger reversal
    const existing = await db.damageLog.findUnique({
      where: { id },
      select: {
        damageCode: true,
        productId: true,
        godownId: true,
        batchNumber: true,
        quantity: true,
        lossCostPrice: true,
        totalLossValue: true,
        reason: true,
        description: true,
        reportDate: true,
        approvedBy: true,
        approvedAt: true,
        status: true,
        companyId: true,
        isActive: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Damage log not found' },
        { status: 404 }
      );
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Damage log not found' },
        { status: 404 }
      );
    }

    if (!existing.isActive) {
      return NextResponse.json(
        { error: 'Cannot update a deleted damage log' },
        { status: 400 }
      );
    }

    // damageCode is immutable — cannot be changed
    if (body.damageCode !== undefined) {
      return NextResponse.json(
        { error: 'damageCode cannot be modified' },
        { status: 400 }
      );
    }

    // Period-close lock check
    const checkDate = reportDate ? new Date(reportDate as string) : (existing.reportDate || new Date());
    const periodLock = await checkPeriodClose(checkDate);
    if (periodLock) return periodLock;

    // Validate reason if provided
    if (reason !== undefined && !VALID_REASONS.includes(String(reason))) {
      return NextResponse.json(
        { error: `reason must be one of: ${VALID_REASONS.join(', ')}` },
        { status: 400 }
      );
    }

    // ────────────────────────────────────────────────────────────
    // Determine new values (fallback to existing if not provided)
    // ────────────────────────────────────────────────────────────
    const newQuantity = quantity !== undefined ? parseFloat(String(quantity)) : existing.quantity;
    const newLossCostPrice = lossCostPrice !== undefined ? parseFloat(String(lossCostPrice)) : existing.lossCostPrice;
    const newReason = reason !== undefined ? String(reason) : existing.reason;
    const newGodownId = godownId !== undefined ? String(godownId) : existing.godownId;
    const newProductId = existing.productId; // productId is not changeable
    const newBatchNumber = batchNumber !== undefined
      ? (String(batchNumber).trim() !== '' ? String(batchNumber).trim() : null)
      : existing.batchNumber;

    // Validate quantity > 0 if provided
    if (quantity !== undefined && (isNaN(newQuantity) || newQuantity <= 0)) {
      return NextResponse.json(
        { error: 'quantity must be a positive number greater than zero' },
        { status: 400 }
      );
    }

    // Validate lossCostPrice > 0 if provided
    if (lossCostPrice !== undefined && (isNaN(newLossCostPrice) || newLossCostPrice <= 0)) {
      return NextResponse.json(
        { error: 'lossCostPrice must be a positive number greater than zero' },
        { status: 400 }
      );
    }

    const safeNewQuantity = safeFinancialRound(newQuantity);
    const safeNewLossCostPrice = safeFinancialRound(newLossCostPrice);
    const safeNewTotalLossValue = safeFinancialRound(safeNewQuantity * safeNewLossCostPrice);
    const safeOldQuantity = safeFinancialRound(existing.quantity);
    const safeOldTotalLossValue = safeFinancialRound(existing.totalLossValue);

    // If quantity is being changed, validate against available stock
    // We need to add back the old quantity first (since it's already written off),
    // then check if the new quantity fits
    if (quantity !== undefined && safeNewQuantity !== safeOldQuantity) {
      // Check if the new godown is SUSPENDED
      const godownRecord = await db.godown.findUnique({
        where: { id: newGodownId },
        select: { id: true, name: true, status: true, isActive: true },
      });

      if (!godownRecord || !godownRecord.isActive) {
        return NextResponse.json(
          { error: 'Godown not found or inactive' },
          { status: 404 }
        );
      }

      if (godownRecord.status === 'SUSPENDED') {
        return NextResponse.json(
          { error: `Godown "${godownRecord.name}" is SUSPENDED. All stock operations are blocked for this location.` },
          { status: 403 }
        );
      }

      // Available stock = current stock + old write-off (because we'll reverse it)
      const productStock = await db.productStock.findUnique({
        where: {
          productId_godownId: {
            productId: newProductId,
            godownId: newGodownId,
          },
        },
        select: { id: true, quantity: true, totalValue: true },
      });

      if (!productStock) {
        return NextResponse.json(
          { error: 'No stock record found for this product at the specified godown.' },
          { status: 400 }
        );
      }

      // Available after reversal = current + old quantity (since old write-off will be reversed)
      const availableAfterReversal = safeFinancialAdd(productStock.quantity, safeOldQuantity);

      if (safeNewQuantity > availableAfterReversal) {
        return NextResponse.json(
          {
            error: `Insufficient stock. After reversing existing write-off, available quantity will be ${availableAfterReversal}, but requested write-off quantity is ${safeNewQuantity}.`,
            available: availableAfterReversal,
            requested: safeNewQuantity,
          },
          { status: 400 }
        );
      }

      // If new batchNumber provided, validate against BatchMaster
      if (newBatchNumber) {
        const batchRecord = await db.batchMaster.findFirst({
          where: {
            batchNumber: newBatchNumber,
            productId: newProductId,
            godownId: newGodownId,
            isActive: true,
          },
          select: { id: true, quantity: true, totalCost: true, costPrice: true },
        });

        if (!batchRecord) {
          return NextResponse.json(
            { error: `Batch "${newBatchNumber}" not found for this product at the specified godown.` },
            { status: 400 }
          );
        }

        // Available batch after reversal (only if old batch matches)
        let batchAvailableAfterReversal = batchRecord.quantity;
        if (existing.batchNumber && existing.batchNumber === newBatchNumber && existing.godownId === newGodownId) {
          batchAvailableAfterReversal = safeFinancialAdd(batchRecord.quantity, safeOldQuantity);
        }

        if (safeNewQuantity > batchAvailableAfterReversal) {
          return NextResponse.json(
            {
              error: `Insufficient batch stock. Available batch quantity is ${batchAvailableAfterReversal}, but requested write-off quantity is ${safeNewQuantity}.`,
              available: batchAvailableAfterReversal,
              requested: safeNewQuantity,
            },
            { status: 400 }
          );
        }
      }
    }

    // ────────────────────────────────────────────────────────────
    // Atomic transaction: reverse old stock + apply new stock + update log + ledger + audit
    // ────────────────────────────────────────────────────────────
    const result = await db.$transaction(async (tx) => {
      // STEP 1: Reverse old stock effects
      // Reverse ProductStock: add back old quantity and totalValue
      const oldProductStock = await tx.productStock.findUnique({
        where: {
          productId_godownId: {
            productId: existing.productId,
            godownId: existing.godownId,
          },
        },
        select: { id: true, quantity: true, totalValue: true },
      });

      if (oldProductStock) {
        const reversedQuantity = safeFinancialAdd(oldProductStock.quantity, safeOldQuantity);
        const reversedTotalValue = safeFinancialAdd(oldProductStock.totalValue, safeOldTotalLossValue);

        await tx.productStock.update({
          where: { id: oldProductStock.id },
          data: {
            quantity: reversedQuantity,
            totalValue: reversedTotalValue,
          },
        });
      }

      // Reverse BatchMaster if old batchNumber existed
      if (existing.batchNumber) {
        const oldBatch = await tx.batchMaster.findFirst({
          where: {
            batchNumber: existing.batchNumber,
            productId: existing.productId,
            godownId: existing.godownId,
            isActive: true,
          },
          select: { id: true, quantity: true, totalCost: true, costPrice: true },
        });

        if (oldBatch) {
          const reversedBatchQty = safeFinancialAdd(oldBatch.quantity, safeOldQuantity);
          const batchLossCost = safeFinancialRound(safeOldQuantity * oldBatch.costPrice);
          const reversedBatchTotalCost = safeFinancialAdd(oldBatch.totalCost, batchLossCost);

          await tx.batchMaster.update({
            where: { id: oldBatch.id },
            data: {
              quantity: reversedBatchQty,
              totalCost: reversedBatchTotalCost,
            },
          });
        }
      }

      // STEP 2: Apply new stock effects (decrement)
      const newProductStock = await tx.productStock.findUnique({
        where: {
          productId_godownId: {
            productId: newProductId,
            godownId: newGodownId,
          },
        },
        select: { id: true, quantity: true, totalValue: true },
      });

      if (newProductStock) {
        const decrementedQuantity = safeFinancialSubtract(newProductStock.quantity, safeNewQuantity);
        const decrementedTotalValue = safeFinancialSubtract(newProductStock.totalValue, safeNewTotalLossValue);

        await tx.productStock.update({
          where: { id: newProductStock.id },
          data: {
            quantity: decrementedQuantity,
            totalValue: decrementedTotalValue,
          },
        });
      }

      // Apply new BatchMaster decrement if batchNumber provided
      if (newBatchNumber) {
        const newBatch = await tx.batchMaster.findFirst({
          where: {
            batchNumber: newBatchNumber,
            productId: newProductId,
            godownId: newGodownId,
            isActive: true,
          },
          select: { id: true, quantity: true, totalCost: true, costPrice: true },
        });

        if (newBatch) {
          const newBatchQty = safeFinancialSubtract(newBatch.quantity, safeNewQuantity);
          const newBatchLossCost = safeFinancialRound(safeNewQuantity * newBatch.costPrice);
          const newBatchTotalCost = safeFinancialSubtract(newBatch.totalCost, newBatchLossCost);

          await tx.batchMaster.update({
            where: { id: newBatch.id },
            data: {
              quantity: newBatchQty,
              totalCost: newBatchTotalCost,
            },
          });
        }
      }

      // STEP 3: Create reversal StockEntry (IN) for the old write-off
      await tx.stockEntry.create({
        data: {
          productId: existing.productId,
          godownId: existing.godownId,
          type: 'IN',
          quantity: safeOldQuantity,
          costPrice: existing.lossCostPrice,
          totalCost: safeOldTotalLossValue,
          reference: existing.damageCode,
          referenceType: 'DamageLog',
          companyId: companyId || null,
          date: checkDate,
          notes: `Reversal: Damage log update — restoring ${safeOldQuantity} units`,
        },
      });

      // STEP 4: Create new StockEntry (OUT) for the updated write-off
      const batchEntryId = newBatchNumber
        ? (await tx.batchMaster.findFirst({
            where: {
              batchNumber: newBatchNumber,
              productId: newProductId,
              godownId: newGodownId,
              isActive: true,
            },
            select: { id: true },
          }))?.id || null
        : null;

      await tx.stockEntry.create({
        data: {
          productId: newProductId,
          godownId: newGodownId,
          batchId: batchEntryId,
          type: 'OUT',
          quantity: safeNewQuantity,
          costPrice: safeNewLossCostPrice,
          totalCost: safeNewTotalLossValue,
          reference: existing.damageCode,
          referenceType: 'DamageLog',
          companyId: companyId || null,
          date: checkDate,
          notes: `Damage write-off (updated): ${newReason}${description ? ` — ${String(description).trim()}` : ''}`,
        },
      });

      // STEP 5: Reverse old ledger entries + post new ledger pair
      // Reversal: Credit the old debit account, Debit the old credit account
      const oldExpenseAccount = await tx.chartOfAccount.findFirst({
        where: {
          classification: 'Expense',
          isActive: true,
          OR: [
            { name: { contains: 'Inventory Loss' } },
            { name: { contains: 'Wastage' } },
          ],
          ...(companyId ? { companyId } : {}),
        },
        select: { id: true, name: true },
      });

      const oldAssetAccount = await tx.chartOfAccount.findFirst({
        where: {
          classification: 'Asset',
          isActive: true,
          name: { contains: 'Inventory Asset' },
          ...(companyId ? { companyId } : {}),
        },
        select: { id: true, name: true },
      });

      const oldDebitAccountName = oldExpenseAccount?.name || 'Inventory Loss / Wastage';
      const oldCreditAccountName = oldAssetAccount?.name || 'Inventory Asset';

      // Reversal entry 1: Credit the old debit account (Expense)
      await tx.ledgerEntry.create({
        data: {
          date: checkDate,
          accountId: oldExpenseAccount?.id || null,
          account: oldDebitAccountName,
          particulars: 'Reversal: Damage log update',
          debit: 0,
          credit: safeOldTotalLossValue,
          reference: existing.damageCode,
          referenceType: 'DamageLog',
          companyId: companyId || null,
        },
      });

      // Reversal entry 2: Debit the old credit account (Asset)
      await tx.ledgerEntry.create({
        data: {
          date: checkDate,
          accountId: oldAssetAccount?.id || null,
          account: oldCreditAccountName,
          particulars: 'Reversal: Damage log update',
          debit: safeOldTotalLossValue,
          credit: 0,
          reference: existing.damageCode,
          referenceType: 'DamageLog',
          companyId: companyId || null,
        },
      });

      // New ledger entries for the updated values
      const newExpenseAccount = await tx.chartOfAccount.findFirst({
        where: {
          classification: 'Expense',
          isActive: true,
          OR: [
            { name: { contains: 'Inventory Loss' } },
            { name: { contains: 'Wastage' } },
          ],
          ...(companyId ? { companyId } : {}),
        },
        select: { id: true, name: true },
      });

      const newAssetAccount = await tx.chartOfAccount.findFirst({
        where: {
          classification: 'Asset',
          isActive: true,
          name: { contains: 'Inventory Asset' },
          ...(companyId ? { companyId } : {}),
        },
        select: { id: true, name: true },
      });

      const newDebitAccountName = newExpenseAccount?.name || 'Inventory Loss / Wastage';
      const newCreditAccountName = newAssetAccount?.name || 'Inventory Asset';

      const productRecord = await tx.product.findUnique({
        where: { id: newProductId },
        select: { name: true },
      });

      // Debit entry: Inventory Loss / Wastage (Expense) with NEW totalLossValue
      await tx.ledgerEntry.create({
        data: {
          date: checkDate,
          accountId: newExpenseAccount?.id || null,
          account: newDebitAccountName,
          particulars: `Damage write-off (updated): ${newReason} — ${productRecord?.name || 'Product'}`,
          debit: safeNewTotalLossValue,
          credit: 0,
          reference: existing.damageCode,
          referenceType: 'DamageLog',
          companyId: companyId || null,
        },
      });

      // Credit entry: Inventory Asset (Asset) with NEW totalLossValue
      await tx.ledgerEntry.create({
        data: {
          date: checkDate,
          accountId: newAssetAccount?.id || null,
          account: newCreditAccountName,
          particulars: `Asset write-off (updated): ${newReason} — ${productRecord?.name || 'Product'}`,
          debit: 0,
          credit: safeNewTotalLossValue,
          reference: existing.damageCode,
          referenceType: 'DamageLog',
          companyId: companyId || null,
        },
      });

      // STEP 6: Update the DamageLog record (damageCode is immutable)
      const cleanDescription = description !== undefined
        ? (String(description).trim() !== '' ? String(description).trim() : null)
        : existing.description;
      const cleanApprovedBy = approvedBy !== undefined
        ? (String(approvedBy).trim() !== '' ? String(approvedBy).trim() : null)
        : existing.approvedBy;

      const updatedDamageLog = await tx.damageLog.update({
        where: { id },
        data: {
          ...(godownId !== undefined && { godownId: newGodownId }),
          ...(batchNumber !== undefined && { batchNumber: newBatchNumber }),
          ...(quantity !== undefined && { quantity: safeNewQuantity }),
          ...(lossCostPrice !== undefined && { lossCostPrice: safeNewLossCostPrice }),
          totalLossValue: safeNewTotalLossValue,
          ...(reason !== undefined && { reason: newReason }),
          ...(description !== undefined && { description: cleanDescription }),
          ...(reportDate !== undefined && { reportDate: checkDate }),
          ...(approvedBy !== undefined && {
            approvedBy: cleanApprovedBy,
            approvedAt: cleanApprovedBy ? new Date() : null,
          }),
          ...(status !== undefined && { status: String(status) }),
        },
        include: {
          product: true,
          godown: true,
        },
      });

      // STEP 7: AuditLog with module: 'Inv-Logistics-Core'
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'Inv-Logistics-Core',
          recordId: id,
          recordLabel: existing.damageCode,
          userId,
          userName,
          details: JSON.stringify({
            type: 'DamageLog',
            damageCode: existing.damageCode,
            previousQuantity: safeOldQuantity,
            newQuantity: safeNewQuantity,
            previousLossCostPrice: existing.lossCostPrice,
            newLossCostPrice: safeNewLossCostPrice,
            previousTotalLossValue: safeOldTotalLossValue,
            newTotalLossValue: safeNewTotalLossValue,
            previousReason: existing.reason,
            newReason,
            previousGodownId: existing.godownId,
            newGodownId,
            previousBatchNumber: existing.batchNumber,
            newBatchNumber,
            stockReversedAndApplied: true,
            ledgerReversalCreated: true,
            ledgerNewEntriesCreated: true,
          }),
        },
      });

      return updatedDamageLog;
    });

    // Activity logging with module: 'Inv-Logistics-Core'
    await logUserActivity({
      action: 'UPDATE',
      module: 'Inv-Logistics-Core',
      recordId: id,
      recordLabel: existing.damageCode,
      userId,
      userName,
      details: `Updated damage log ${existing.damageCode}: quantity ${safeOldQuantity} → ${safeNewQuantity}`,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Error updating damage log:', error);
    const message = error instanceof Error ? error.message : 'Failed to update damage log';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/damage-logs/[id] - Soft delete (isActive = false)
// Only admin can delete (checkFinancialDeletePermission)
// Reverse stock effects within $transaction
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'DamageLogs', 'DELETE');
  if (!security.authorized) return security.response;

  const { id: userId, name: userName, role, companyId } = security.user;

  // Dealer: blocked entirely from damage logs
  if (role === 'dealer') {
    return NextResponse.json(
      { error: 'Access denied. Dealer role does not have access to Damage Logs.' },
      { status: 403 }
    );
  }

  // Only admin can delete financial posts
  const deleteCheck = checkFinancialDeletePermission(role);
  if (deleteCheck) return deleteCheck;

  try {
    const { id } = await params;

    const existing = await db.damageLog.findUnique({
      where: { id },
      select: {
        damageCode: true,
        productId: true,
        godownId: true,
        batchNumber: true,
        quantity: true,
        lossCostPrice: true,
        totalLossValue: true,
        reason: true,
        status: true,
        reportDate: true,
        companyId: true,
        isActive: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Damage log not found' },
        { status: 404 }
      );
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Damage log not found' },
        { status: 404 }
      );
    }

    if (!existing.isActive) {
      return NextResponse.json(
        { error: 'Damage log is already deleted' },
        { status: 400 }
      );
    }

    // Period-close lock check
    const periodLock = await checkPeriodClose(existing.reportDate || new Date());
    if (periodLock) return periodLock;

    const safeOldQuantity = safeFinancialRound(existing.quantity);
    const safeOldTotalLossValue = safeFinancialRound(existing.totalLossValue);

    await db.$transaction(async (tx) => {
      // STEP 1: Reverse stock effects — add back quantity and totalValue to ProductStock
      const productStock = await tx.productStock.findUnique({
        where: {
          productId_godownId: {
            productId: existing.productId,
            godownId: existing.godownId,
          },
        },
        select: { id: true, quantity: true, totalValue: true },
      });

      if (productStock) {
        const reversedQuantity = safeFinancialAdd(productStock.quantity, safeOldQuantity);
        const reversedTotalValue = safeFinancialAdd(productStock.totalValue, safeOldTotalLossValue);

        await tx.productStock.update({
          where: { id: productStock.id },
          data: {
            quantity: reversedQuantity,
            totalValue: reversedTotalValue,
          },
        });
      }

      // STEP 2: Reverse batch effects if batchNumber existed
      if (existing.batchNumber) {
        const batchRecord = await tx.batchMaster.findFirst({
          where: {
            batchNumber: existing.batchNumber,
            productId: existing.productId,
            godownId: existing.godownId,
            isActive: true,
          },
          select: { id: true, quantity: true, totalCost: true, costPrice: true },
        });

        if (batchRecord) {
          const reversedBatchQty = safeFinancialAdd(batchRecord.quantity, safeOldQuantity);
          const batchLossCost = safeFinancialRound(safeOldQuantity * batchRecord.costPrice);
          const reversedBatchTotalCost = safeFinancialAdd(batchRecord.totalCost, batchLossCost);

          await tx.batchMaster.update({
            where: { id: batchRecord.id },
            data: {
              quantity: reversedBatchQty,
              totalCost: reversedBatchTotalCost,
            },
          });
        }
      }

      // STEP 3: Create reversal StockEntry (IN) for audit trail
      await tx.stockEntry.create({
        data: {
          productId: existing.productId,
          godownId: existing.godownId,
          type: 'IN',
          quantity: safeOldQuantity,
          costPrice: existing.lossCostPrice,
          totalCost: safeOldTotalLossValue,
          reference: existing.damageCode,
          referenceType: 'DamageLog',
          companyId: companyId || null,
          date: existing.reportDate || new Date(),
          notes: `Reversal: Damage log deleted — restoring ${safeOldQuantity} units`,
        },
      });

      // STEP 4: Reverse ledger entries
      // Credit the old debit account (Expense), Debit the old credit account (Asset)
      const expenseAccount = await tx.chartOfAccount.findFirst({
        where: {
          classification: 'Expense',
          isActive: true,
          OR: [
            { name: { contains: 'Inventory Loss' } },
            { name: { contains: 'Wastage' } },
          ],
          ...(companyId ? { companyId } : {}),
        },
        select: { id: true, name: true },
      });

      const assetAccount = await tx.chartOfAccount.findFirst({
        where: {
          classification: 'Asset',
          isActive: true,
          name: { contains: 'Inventory Asset' },
          ...(companyId ? { companyId } : {}),
        },
        select: { id: true, name: true },
      });

      const debitAccountName = expenseAccount?.name || 'Inventory Loss / Wastage';
      const creditAccountName = assetAccount?.name || 'Inventory Asset';

      // Reversal entry 1: Credit the old debit account (Expense) — reverses the original debit
      await tx.ledgerEntry.create({
        data: {
          date: existing.reportDate || new Date(),
          accountId: expenseAccount?.id || null,
          account: debitAccountName,
          particulars: 'Reversal: Damage log deleted',
          debit: 0,
          credit: safeOldTotalLossValue,
          reference: existing.damageCode,
          referenceType: 'DamageLog',
          companyId: companyId || null,
        },
      });

      // Reversal entry 2: Debit the old credit account (Asset) — reverses the original credit
      await tx.ledgerEntry.create({
        data: {
          date: existing.reportDate || new Date(),
          accountId: assetAccount?.id || null,
          account: creditAccountName,
          particulars: 'Reversal: Damage log deleted',
          debit: safeOldTotalLossValue,
          credit: 0,
          reference: existing.damageCode,
          referenceType: 'DamageLog',
          companyId: companyId || null,
        },
      });

      // STEP 5: Soft delete the damage log
      await tx.damageLog.update({
        where: { id },
        data: { isActive: false },
      });

      // STEP 6: AuditLog with module: 'Inv-Logistics-Core'
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'Inv-Logistics-Core',
          recordId: id,
          recordLabel: existing.damageCode,
          userId,
          userName,
          details: JSON.stringify({
            type: 'DamageLog',
            damageCode: existing.damageCode,
            softDelete: true,
            stockReversed: !!productStock,
            batchReversed: !!existing.batchNumber,
            ledgerReversalCreated: true,
            reversedQuantity: safeOldQuantity,
            reversedTotalLossValue: safeOldTotalLossValue,
          }),
        },
      });
    });

    // Activity logging with module: 'Inv-Logistics-Core'
    await logUserActivity({
      action: 'DELETE',
      module: 'Inv-Logistics-Core',
      recordId: id,
      recordLabel: existing.damageCode,
      userId,
      userName,
      details: `Deleted damage log ${existing.damageCode}: reversed ${safeOldQuantity} units back to stock`,
    });

    return NextResponse.json({ message: 'Damage log deleted successfully' });
  } catch (error) {
    console.error('Error deleting damage log:', error);
    return NextResponse.json(
      { error: 'Failed to delete damage log' },
      { status: 500 }
    );
  }
}
