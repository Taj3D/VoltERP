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

// GET /api/damage-logs - List all damage logs with multi-tenant isolation + VAT Auditor masking
// Dealer: blocked entirely (403)  |  SR: read-only access
export async function GET(request: NextRequest) {
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
    const damageLogs = await db.damageLog.findMany({
      where: {
        isActive: true,
        ...(companyId ? { companyId } : {}),
      },
      include: {
        product: true,
        godown: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Apply VAT Auditor financial masking to array
    const masked = maskFinancialArray(
      damageLogs as Record<string, unknown>[],
      role,
      ['lossCostPrice', 'totalLossValue', 'quantity']
    );

    return NextResponse.json(masked);
  } catch (error) {
    console.error('Error fetching damage logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch damage logs' },
      { status: 500 }
    );
  }
}

// POST /api/damage-logs - Create damage log with atomic double-entry asset write-off
// Dealer: blocked entirely (403)  |  SR: blocked from writes (403)
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'DamageLogs', 'POST');
  if (!security.authorized) return security.response;

  const { id: userId, name: userName, role, companyId } = security.user;

  // Dealer: blocked entirely from damage logs
  if (role === 'dealer') {
    return NextResponse.json(
      { error: 'Access denied. Dealer role does not have access to Damage Logs.' },
      { status: 403 }
    );
  }

  // SR: read-only access — cannot create
  if (role === 'sr') {
    return NextResponse.json(
      { error: 'Write access denied. SR role has read-only access to Damage Logs.' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const {
      productId,
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

    // ────────────────────────────────────────────────────────────
    // Validate required fields
    // ────────────────────────────────────────────────────────────
    if (!productId) {
      return NextResponse.json(
        { error: 'productId is required' },
        { status: 400 }
      );
    }

    if (!godownId) {
      return NextResponse.json(
        { error: 'godownId is required' },
        { status: 400 }
      );
    }

    // Quantity: must be > 0, numeric only — block zero/negative/letters
    const parsedQuantity = parseFloat(String(quantity));
    if (isNaN(parsedQuantity) || parsedQuantity <= 0) {
      return NextResponse.json(
        { error: 'quantity must be a positive number greater than zero' },
        { status: 400 }
      );
    }

    // lossCostPrice: must be > 0
    const parsedLossCostPrice = parseFloat(String(lossCostPrice));
    if (isNaN(parsedLossCostPrice) || parsedLossCostPrice <= 0) {
      return NextResponse.json(
        { error: 'lossCostPrice must be a positive number greater than zero' },
        { status: 400 }
      );
    }

    // Reason: must be one of the valid values
    if (!reason || !VALID_REASONS.includes(String(reason))) {
      return NextResponse.json(
        { error: `reason must be one of: ${VALID_REASONS.join(', ')}` },
        { status: 400 }
      );
    }

    // ────────────────────────────────────────────────────────────
    // Check if the reporting godown is SUSPENDED
    // ────────────────────────────────────────────────────────────
    const godown = await db.godown.findUnique({
      where: { id: String(godownId) },
      select: { id: true, name: true, status: true, isActive: true },
    });

    if (!godown || !godown.isActive) {
      return NextResponse.json(
        { error: 'Godown not found or inactive' },
        { status: 404 }
      );
    }

    if (godown.status === 'SUSPENDED') {
      return NextResponse.json(
        { error: `Godown "${godown.name}" is SUSPENDED. All stock operations are blocked for this location.` },
        { status: 403 }
      );
    }

    // ────────────────────────────────────────────────────────────
    // Period-close lock check
    // ────────────────────────────────────────────────────────────
    const transactionDate = reportDate ? new Date(reportDate as string) : new Date();
    const periodLock = await checkPeriodClose(transactionDate);
    if (periodLock) return periodLock;

    // ────────────────────────────────────────────────────────────
    // Validate quantity against available physical stock
    // ────────────────────────────────────────────────────────────
    const safeQuantity = safeFinancialRound(parsedQuantity);
    const safeLossCostPrice = safeFinancialRound(parsedLossCostPrice);
    const safeTotalLossValue = safeFinancialRound(safeQuantity * safeLossCostPrice);

    // Check ProductStock at this location
    const productStock = await db.productStock.findUnique({
      where: {
        productId_godownId: {
          productId: String(productId),
          godownId: String(godownId),
        },
      },
      select: { id: true, quantity: true, totalValue: true, costPrice: true },
    });

    if (!productStock) {
      return NextResponse.json(
        { error: 'No stock record found for this product at the specified godown. Cannot write off stock that does not exist.' },
        { status: 400 }
      );
    }

    if (safeQuantity > productStock.quantity) {
      return NextResponse.json(
        {
          error: `Insufficient stock. Available quantity at this location is ${productStock.quantity}, but requested write-off quantity is ${safeQuantity}.`,
          available: productStock.quantity,
          requested: safeQuantity,
        },
        { status: 400 }
      );
    }

    // If batchNumber provided, validate against BatchMaster
    if (batchNumber && String(batchNumber).trim() !== '') {
      const batch = await db.batchMaster.findFirst({
        where: {
          batchCode: String(batchNumber).trim(),
          productId: String(productId),
          godownId: String(godownId),
          isActive: true,
        },
        select: { id: true, quantityOnHand: true, costPricePerUnit: true },
      });

      if (!batch) {
        return NextResponse.json(
          { error: `Batch "${String(batchNumber).trim()}" not found for this product at the specified godown.` },
          { status: 400 }
        );
      }

      if (safeQuantity > batch.quantityOnHand) {
        return NextResponse.json(
          {
            error: `Insufficient batch stock. Available batch quantity is ${batch.quantityOnHand}, but requested write-off quantity is ${safeQuantity}.`,
            available: batch.quantityOnHand,
            requested: safeQuantity,
          },
          { status: 400 }
        );
      }
    }

    // ────────────────────────────────────────────────────────────
    // Atomic transaction: create damage log + adjust stock + ledger + audit
    // ────────────────────────────────────────────────────────────
    const result = await db.$transaction(async (tx) => {
      // STEP 1: Auto-generate damageCode as DMG-XXXXX (5-digit zero-padded)
      const lastDamageLog = await tx.damageLog.findFirst({
        orderBy: { damageCode: 'desc' },
        select: { damageCode: true },
      });

      let nextNum = 1;
      if (lastDamageLog?.damageCode) {
        const match = lastDamageLog.damageCode.match(/DMG-(\d+)/);
        if (match) {
          nextNum = parseInt(match[1], 10) + 1;
        }
      }
      const damageCode = `DMG-${String(nextNum).padStart(5, '0')}`;

      // Clean optional fields
      const cleanBatchNumber = batchNumber && String(batchNumber).trim() !== '' ? String(batchNumber).trim() : null;
      const cleanDescription = description && String(description).trim() !== '' ? String(description).trim() : null;
      const cleanApprovedBy = approvedBy && String(approvedBy).trim() !== '' ? String(approvedBy).trim() : null;
      const damageStatus = status ? String(status) : 'Pending';

      // STEP 2: Create DamageLog record
      const damageLog = await tx.damageLog.create({
        data: {
          damageCode,
          productId: String(productId),
          godownId: String(godownId),
          batchNumber: cleanBatchNumber,
          quantity: safeQuantity,
          lossCostPrice: safeLossCostPrice,
          totalLossValue: safeTotalLossValue,
          reason: String(reason),
          description: cleanDescription,
          reportDate: transactionDate,
          approvedBy: cleanApprovedBy,
          approvedAt: cleanApprovedBy ? new Date() : null,
          status: damageStatus,
          companyId: companyId || null,
        },
        include: {
          product: true,
          godown: true,
        },
      });

      // STEP 3: Decrement ProductStock.quantity by damage qty (using safeFinancialSubtract)
      const currentStock = await tx.productStock.findUnique({
        where: {
          productId_godownId: {
            productId: String(productId),
            godownId: String(godownId),
          },
        },
        select: { id: true, quantity: true, totalValue: true },
      });

      if (currentStock) {
        const newQuantity = safeFinancialSubtract(currentStock.quantity, safeQuantity);
        const newTotalValue = safeFinancialSubtract(currentStock.totalValue, safeTotalLossValue);

        await tx.productStock.update({
          where: { id: currentStock.id },
          data: {
            quantity: newQuantity,
            totalValue: newTotalValue,
          },
        });
      }

      // STEP 4: If batchNumber provided, decrement BatchMaster.quantityOnHand
      if (cleanBatchNumber) {
        const batchRecord = await tx.batchMaster.findFirst({
          where: {
            batchCode: cleanBatchNumber,
            productId: String(productId),
            godownId: String(godownId),
            isActive: true,
          },
          select: { id: true, quantityOnHand: true, costPricePerUnit: true },
        });

        if (batchRecord) {
          const newBatchQuantity = safeFinancialSubtract(batchRecord.quantityOnHand, safeQuantity);

          await tx.batchMaster.update({
            where: { id: batchRecord.id },
            data: {
              quantityOnHand: newBatchQuantity,
            },
          });
        }
      }

      // STEP 5: Create StockEntry type="OUT" for audit trail
      await tx.stockEntry.create({
        data: {
          productId: String(productId),
          godownId: String(godownId),
          batchId: cleanBatchNumber
            ? (await tx.batchMaster.findFirst({
                where: {
                  batchCode: cleanBatchNumber,
                  productId: String(productId),
                  godownId: String(godownId),
                  isActive: true,
                },
                select: { id: true },
              }))?.id || null
            : null,
          type: 'OUT',
          quantity: safeQuantity,
          costPrice: safeLossCostPrice,
          reference: damageCode,
          referenceType: 'DamageLog',
          companyId: companyId || null,
          date: transactionDate,
          notes: `Damage write-off: ${String(reason)}${cleanDescription ? ` — ${cleanDescription}` : ''}`,
        },
      });

      // STEP 6: Post double-entry ledger pair
      // Debit: Find ChartOfAccount where name contains "Inventory Loss" or "Wastage" under Expenses
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

      // Credit: Find ChartOfAccount where name contains "Inventory Asset" under Assets
      const assetAccount = await tx.chartOfAccount.findFirst({
        where: {
          classification: 'Asset',
          isActive: true,
          name: { contains: 'Inventory Asset' },
          ...(companyId ? { companyId } : {}),
        },
        select: { id: true, name: true },
      });

      // Fallback account names if CoA records not found
      const debitAccountName = expenseAccount?.name || 'Inventory Loss / Wastage';
      const creditAccountName = assetAccount?.name || 'Inventory Asset';

      // Debit entry: Inventory Loss / Wastage (Expense)
      await tx.ledgerEntry.create({
        data: {
          date: transactionDate,
          accountId: expenseAccount?.id || null,
          account: debitAccountName,
          particulars: `Damage write-off: ${String(reason)} — ${damageLog.product?.name || 'Product'}`,
          debit: safeTotalLossValue,
          credit: 0,
          reference: damageCode,
          referenceType: 'DamageLog',
          companyId: companyId || null,
        },
      });

      // Credit entry: Inventory Asset (Asset)
      await tx.ledgerEntry.create({
        data: {
          date: transactionDate,
          accountId: assetAccount?.id || null,
          account: creditAccountName,
          particulars: `Asset write-off: ${String(reason)} — ${damageLog.product?.name || 'Product'}`,
          debit: 0,
          credit: safeTotalLossValue,
          reference: damageCode,
          referenceType: 'DamageLog',
          companyId: companyId || null,
        },
      });

      // STEP 7: Create AuditLog with module: 'Inv-Logistics-Core'
      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'Inv-Logistics-Core',
          recordId: damageLog.id,
          recordLabel: damageCode,
          userId,
          userName,
          details: JSON.stringify({
            type: 'DamageLog',
            damageCode,
            productId: String(productId),
            godownId: String(godownId),
            batchNumber: cleanBatchNumber,
            quantity: safeQuantity,
            lossCostPrice: safeLossCostPrice,
            totalLossValue: safeTotalLossValue,
            reason: String(reason),
            companyId: companyId || null,
            status: damageStatus,
            stockDecremented: !!currentStock,
            batchDecremented: !!cleanBatchNumber,
            ledgerPairCreated: true,
            debitAccount: debitAccountName,
            creditAccount: creditAccountName,
          }),
        },
      });

      return damageLog;
    });

    // Activity logging with module: 'Inv-Logistics-Core'
    await logUserActivity({
      action: 'CREATE',
      module: 'Inv-Logistics-Core',
      recordId: result.id,
      recordLabel: result.damageCode,
      userId,
      userName,
      details: `Created damage log ${result.damageCode}: ${safeQuantity} units written off (${reason})`,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating damage log:', error);
    const message = error instanceof Error ? error.message : 'Failed to create damage log';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
