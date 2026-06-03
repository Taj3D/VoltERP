import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  checkPeriodClose,
  maskForVatAuditor,
  maskFinancialArray,
  safeFinancialRound,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// ============================================================
// GET /api/opening-stock — List opening stock entries with product, godown info
// Filters: fiscalYear, status, godownId
// ============================================================

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Stock', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const fiscalYear = searchParams.get('fiscalYear');
    const status = searchParams.get('status');
    const godownId = searchParams.get('godownId');

    const where: Record<string, unknown> = { isActive: true };
    if (fiscalYear) where.fiscalYear = fiscalYear;
    if (status) where.status = status;
    if (godownId) where.godownId = godownId;

    // Company isolation for non-admin users
    if (security.user.companyId && security.user.role !== 'admin') {
      where.companyId = security.user.companyId;
    }

    const openingStocks = await db.openingStock.findMany({
      where,
      include: {
        product: {
          include: {
            category: true,
            brand: true,
            godown: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Enrich with computed fields
    const enriched = openingStocks.map(os => ({
      ...os,
      totalValue: safeFinancialRound(os.quantity * os.costPrice),
    }));

    // Apply VAT Auditor masking
    const role = security.user.role;
    const maskedStocks = maskFinancialArray(
      enriched as Record<string, unknown>[],
      role,
      ['costPrice', 'totalValue', 'quantity']
    );

    // Mask nested product cost fields
    const finalStocks = maskedStocks.map(os => {
      let masked = os;
      if (masked.product && typeof masked.product === 'object' && role === 'vat_auditor') {
        masked = {
          ...masked,
          product: maskForVatAuditor(
            masked.product as Record<string, unknown>,
            role,
            ['costPrice', 'salePrice', 'wholesalePrice', 'dealerPrice', 'openingStock']
          ),
        };
      }
      return masked;
    });

    return NextResponse.json(finalStocks);
  } catch (error) {
    console.error('[OpeningStock] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch opening stock entries' },
      { status: 500 }
    );
  }
}

// ============================================================
// POST /api/opening-stock — Create opening stock entry
// - Validate productId exists, productCode matches product
// - Compute totalValue = quantity * costPrice
// - If status="Posted": create StockEntry (type=IN, referenceType="OpeningStock")
// - Period-close check, idempotency via referenceKey
// - Auto-generate effectiveDate if not provided (start of fiscal year)
// ============================================================

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Stock', 'POST');
  if (!security.authorized) return security.response;

  try {
    const body = await request.json();
    const {
      productCode,
      productId,
      godownId,
      batchId,
      quantity,
      costPrice,
      effectiveDate,
      fiscalYear,
      status = 'Posted',
      referenceKey,
      notes,
    } = body;

    // ── Validation ──
    if (!productId) {
      return NextResponse.json({ error: 'productId is required' }, { status: 400 });
    }
    if (!quantity || quantity <= 0) {
      return NextResponse.json({ error: 'quantity must be a positive number' }, { status: 400 });
    }
    if (costPrice === undefined || costPrice < 0) {
      return NextResponse.json({ error: 'costPrice must be a non-negative number' }, { status: 400 });
    }

    // Validate product exists
    const product = await db.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        name: true,
        productCode: true,
        costPrice: true,
        salePrice: true,
        wholesalePrice: true,
        godownId: true,
        isActive: true,
      },
    });
    if (!product || !product.isActive) {
      return NextResponse.json({ error: 'Product not found or inactive' }, { status: 400 });
    }

    // Validate productCode matches product
    if (productCode && productCode !== product.productCode) {
      return NextResponse.json(
        { error: `productCode "${productCode}" does not match product's code "${product.productCode}"` },
        { status: 400 }
      );
    }

    // Validate godown if provided
    const effectiveGodownId = godownId || product.godownId;
    if (effectiveGodownId) {
      const godown = await db.godown.findUnique({
        where: { id: effectiveGodownId },
        select: { id: true, name: true, status: true, isActive: true },
      });
      if (!godown || !godown.isActive) {
        return NextResponse.json({ error: 'Godown not found or inactive' }, { status: 400 });
      }
      if (godown.status === 'SUSPENDED') {
        return NextResponse.json(
          { error: `EMERGENCY CLOSURE: Warehouse "${godown.name}" is SUSPENDED. Cannot post opening stock.` },
          { status: 403 }
        );
      }
    }

    // Validate batchId if provided
    if (batchId) {
      const batch = await db.batchMaster.findUnique({
        where: { id: batchId },
        select: { id: true, productId: true },
      });
      if (!batch) {
        return NextResponse.json({ error: 'Batch not found' }, { status: 400 });
      }
      if (batch.productId !== productId) {
        return NextResponse.json({ error: 'Batch does not belong to this product' }, { status: 400 });
      }
    }

    // Auto-generate effectiveDate if not provided (start of fiscal year)
    let effectiveDateValue: Date;
    if (effectiveDate) {
      effectiveDateValue = new Date(effectiveDate);
    } else if (fiscalYear) {
      // Parse fiscal year like "2025-2026" and use July 1 of start year
      const startYear = parseInt(fiscalYear.split('-')[0], 10);
      effectiveDateValue = new Date(startYear, 6, 1); // July 1
    } else {
      // Default to start of current year
      const now = new Date();
      effectiveDateValue = new Date(now.getFullYear(), 0, 1); // January 1
    }

    // Period-close check
    const periodLock = await checkPeriodClose(effectiveDateValue);
    if (periodLock) return periodLock;

    // Idempotency check via referenceKey
    if (referenceKey) {
      const existing = await db.openingStock.findFirst({
        where: { referenceKey },
      });
      if (existing) {
        return NextResponse.json(
          {
            error: 'Duplicate submission detected. This opening stock entry has already been created.',
            referenceKey,
            existingId: existing.id,
          },
          { status: 409 }
        );
      }
    }

    // Compute totalValue
    const totalValue = safeFinancialRound(quantity * costPrice);

    // Validate status
    const validStatuses = ['Draft', 'Posted', 'Reversed'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status "${status}". Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    // Create opening stock entry atomically
    const result = await db.$transaction(async (tx) => {
      // Determine fiscal year
      const effectiveFiscalYear = fiscalYear || (() => {
        const y = effectiveDateValue.getFullYear();
        const m = effectiveDateValue.getMonth(); // 0-based
        // If month is July or later, fiscal year is YYYY-YYYY+1, else YYYY-1-YYYY
        return m >= 6 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
      })();

      const openingStock = await tx.openingStock.create({
        data: {
          productCode: product.productCode,
          productId,
          godownId: effectiveGodownId || null,
          batchId: batchId || null,
          quantity: safeFinancialRound(quantity),
          costPrice: safeFinancialRound(costPrice),
          totalValue,
          effectiveDate: effectiveDateValue,
          fiscalYear: effectiveFiscalYear,
          status,
          referenceKey: referenceKey || null,
          notes: notes || null,
          companyId: security.user.companyId || null,
        },
      });

      // If status="Posted": create StockEntry (type=IN, referenceType="OpeningStock")
      if (status === 'Posted') {
        await tx.stockEntry.create({
          data: {
            productId,
            godownId: effectiveGodownId || null,
            type: 'IN',
            quantity: safeFinancialRound(quantity),
            reference: `OS-${openingStock.id.substring(0, 8)}`,
            referenceType: 'OpeningStock',
            date: effectiveDateValue,
            batchId: batchId || null,
            costPrice: safeFinancialRound(costPrice),
            notes: `Opening stock entry: ${product.productCode}`,
            companyId: security.user.companyId || null,
          },
        });
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'Stock',
          recordId: openingStock.id,
          recordLabel: `OS-${product.productCode}`,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            type: 'OpeningStock',
            productId,
            productName: product.name,
            productCode: product.productCode,
            quantity,
            costPrice,
            totalValue,
            status,
            fiscalYear: effectiveFiscalYear,
            godownId: effectiveGodownId,
          }),
        },
      });

      return openingStock;
    });

    // Activity log
    await logUserActivity({
      action: 'CREATE',
      module: 'Inv-Opening-Stock',
      recordId: result.id,
      recordLabel: `OS-${product.productCode}`,
      userId: security.user.id,
      userName: security.user.name,
      details: `Created opening stock entry for ${product.name} (${product.productCode}): ${quantity} units at ৳${costPrice}`,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('[OpeningStock] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to create opening stock entry' },
      { status: 500 }
    );
  }
}
