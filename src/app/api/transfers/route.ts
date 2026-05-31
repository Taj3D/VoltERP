// ============================================================
// STOCK TRANSFERS API — Phase 12: Intransit Valuation State Machine
// GET (list) and POST (create) with godown SUSPENDED interlock,
// ProductStock validation, batch preservation, and costPrice lookup
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  checkPeriodClose,
  safeFinancialRound,
  safeFinancialAdd,
  safeFinancialSubtract,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// -----------------------------------------------------------
// GET /api/transfers — List all stock transfers with relations
// -----------------------------------------------------------
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'StockTransfers', 'GET');
  if (!security.authorized) return security.response;

  const { companyId } = security.user;

  try {
    const where: Record<string, unknown> = { isActive: true };

    // Multi-tenant isolation: scope to user's company
    if (companyId) {
      where.companyId = companyId;
    }

    const transfers = await db.stockTransfer.findMany({
      where,
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
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(transfers);
  } catch (error) {
    console.error('[TransfersAPI] Error fetching transfers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transfers' },
      { status: 500 }
    );
  }
}

// -----------------------------------------------------------
// POST /api/transfers — Create stock transfer (PENDING draft)
// Stock is NOT deducted at creation; only when shipped (IN_TRANSIT)
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'StockTransfers', 'POST');
  if (!security.authorized) return security.response;

  const { id: userId, name: userName, companyId } = security.user;

  try {
    const body = await request.json();
    const { fromGodownId, toGodownId, date, notes, lines } = body;

    // ── Required fields validation ──
    if (!fromGodownId || !toGodownId || !date || !lines || !Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json(
        { error: 'fromGodownId, toGodownId, date, and lines (non-empty array) are required' },
        { status: 400 }
      );
    }

    // ── Source and destination must differ ──
    if (fromGodownId === toGodownId) {
      return NextResponse.json(
        { error: 'Source and destination godown cannot be the same' },
        { status: 400 }
      );
    }

    // ── EMERGENCY SUSPENDED INTERLOCK ──
    // Check BOTH source and destination Godown status.
    // If either is "SUSPENDED", abort with 403.
    const [sourceGodown, destGodown] = await Promise.all([
      db.godown.findUnique({ where: { id: fromGodownId }, select: { id: true, name: true, status: true, isActive: true } }),
      db.godown.findUnique({ where: { id: toGodownId }, select: { id: true, name: true, status: true, isActive: true } }),
    ]);

    if (!sourceGodown || !sourceGodown.isActive) {
      return NextResponse.json(
        { error: 'Source godown not found or is inactive' },
        { status: 400 }
      );
    }
    if (!destGodown || !destGodown.isActive) {
      return NextResponse.json(
        { error: 'Destination godown not found or is inactive' },
        { status: 400 }
      );
    }
    if (sourceGodown.status === 'SUSPENDED') {
      return NextResponse.json(
        { error: 'Transfer blocked: Source Godown is SUSPENDED. All stock operations are frozen for this warehouse.' },
        { status: 403 }
      );
    }
    if (destGodown.status === 'SUSPENDED') {
      return NextResponse.json(
        { error: 'Transfer blocked: Destination Godown is SUSPENDED. All stock operations are frozen for this warehouse.' },
        { status: 403 }
      );
    }

    // ── Period-close lock check ──
    const periodLock = await checkPeriodClose(date);
    if (periodLock) return periodLock;

    // ── Line-level validation ──
    let totalQuantity = 0;
    let totalValue = 0;
    const validatedLines: Array<{
      productId: string;
      quantity: number;
      batchNumber: string | null;
      costPrice: number;
      totalCost: number;
    }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (!line.productId) {
        return NextResponse.json(
          { error: `Line ${i + 1}: productId is required` },
          { status: 400 }
        );
      }

      const quantity = Number(line.quantity);
      if (isNaN(quantity) || quantity <= 0) {
        return NextResponse.json(
          { error: `Line ${i + 1}: quantity must be greater than 0` },
          { status: 400 }
        );
      }

      // ── Validate stock availability at source (ProductStock) ──
      const productStock = await db.productStock.findUnique({
        where: {
          productId_godownId: {
            productId: line.productId,
            godownId: fromGodownId,
          },
        },
        select: { id: true, quantity: true, costPrice: true },
      });

      if (!productStock) {
        return NextResponse.json(
          { error: `Line ${i + 1}: No stock record found for this product at source godown` },
          { status: 400 }
        );
      }

      if (productStock.quantity < quantity) {
        return NextResponse.json(
          { error: `Line ${i + 1}: Insufficient stock at source godown. Available: ${productStock.quantity}, Requested: ${quantity}` },
          { status: 400 }
        );
      }

      // ── Batch preservation: validate batch exists at source if batchNumber provided ──
      const batchNumber = line.batchNumber || null;
      if (batchNumber) {
        const batch = await db.batchMaster.findFirst({
          where: {
            batchNumber,
            productId: line.productId,
            godownId: fromGodownId,
            isActive: true,
          },
          select: { id: true, quantity: true, costPrice: true },
        });

        if (!batch) {
          return NextResponse.json(
            { error: `Line ${i + 1}: Batch "${batchNumber}" not found for this product at source godown` },
            { status: 400 }
          );
        }

        if (batch.quantity < quantity) {
          return NextResponse.json(
            { error: `Line ${i + 1}: Insufficient batch stock. Batch "${batchNumber}" has ${batch.quantity} units, requested ${quantity}` },
            { status: 400 }
          );
        }
      }

      // ── Look up costPrice from ProductStock for intransit valuation ──
      const costPrice = safeFinancialRound(productStock.costPrice || 0);
      const totalCost = safeFinancialRound(quantity * costPrice);

      validatedLines.push({
        productId: line.productId,
        quantity,
        batchNumber,
        costPrice,
        totalCost,
      });

      totalQuantity = safeFinancialAdd(totalQuantity, quantity);
      totalValue = safeFinancialAdd(totalValue, totalCost);
    }

    // ── Create transfer in atomic transaction ──
    const result = await db.$transaction(async (tx) => {
      // Auto-generate transferNo as TRN-XXXXX (5-digit zero-padded)
      const lastTransfer = await tx.stockTransfer.findFirst({
        orderBy: { transferNo: 'desc' },
        select: { transferNo: true },
      });

      let nextNum = 1;
      if (lastTransfer?.transferNo) {
        const match = lastTransfer.transferNo.match(/TRN-(\d+)/);
        if (match) {
          nextNum = parseInt(match[1], 10) + 1;
        }
      }
      const transferNo = `TRN-${String(nextNum).padStart(5, '0')}`;

      // Create stock transfer with shippingStatus = "PENDING" (draft state)
      // Do NOT deduct stock yet — stock is only deducted when shipped (IN_TRANSIT)
      const transfer = await tx.stockTransfer.create({
        data: {
          transferNo,
          fromGodownId,
          toGodownId,
          date: new Date(date),
          shippingStatus: 'PENDING',
          status: 'Pending',
          totalItems: validatedLines.length,
          totalQuantity,
          totalValue,
          notes: notes || null,
          ...(companyId && { companyId }),
          lines: {
            create: validatedLines.map((line) => ({
              productId: line.productId,
              quantity: line.quantity,
              batchNumber: line.batchNumber,
              costPrice: line.costPrice,
              totalCost: line.totalCost,
            })),
          },
        },
        include: {
          fromGodown: true,
          toGodown: true,
          lines: { include: { product: true } },
        },
      });

      // AuditLog via logUserActivity — module: 'Inv-Logistics-Core'
      await logUserActivity({
        action: 'CREATE',
        module: 'Inv-Logistics-Core',
        recordId: transfer.id,
        recordLabel: transferNo,
        userId,
        userName,
        details: JSON.stringify({
          fromGodownId,
          toGodownId,
          totalItems: validatedLines.length,
          totalQuantity,
          totalValue,
          shippingStatus: 'PENDING',
          lines: validatedLines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            batchNumber: l.batchNumber,
            costPrice: l.costPrice,
            totalCost: l.totalCost,
          })),
        }),
      });

      return transfer;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('[TransfersAPI] Error creating transfer:', error);
    return NextResponse.json(
      { error: 'Failed to create transfer' },
      { status: 500 }
    );
  }
}
