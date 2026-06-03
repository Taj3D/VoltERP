import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  checkPeriodClose,
  maskForVatAuditor,
  maskFinancialArray,
  safeFinancialRound,
  safeFinancialAdd,
  safeFinancialSubtract,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// ============================================================
// SHARED: Auto-generate batchCode: BCH-XXXXX
// ============================================================

async function generateBatchCode(tx: any): Promise<string> {
  // Collision-safe code generation (findMany + Math.max)
  const allBatches = await tx.batchMaster.findMany({ select: { batchCode: true } });
  let maxNum = 0;
  for (const b of allBatches) {
    const match = b.batchCode?.match(/BCH-(\d+)/);
    if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
  }
  return `BCH-${String(maxNum + 1).padStart(5, '0')}`;
}

// ============================================================
// GET /api/batches — List all batches with product, godown, status filters
// Includes batch status computation (auto-detect Expired)
// ============================================================

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Stock', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId');
    const godownId = searchParams.get('godownId');
    const status = searchParams.get('status');

    const where: Record<string, unknown> = { isActive: true };
    if (productId) where.productId = productId;
    if (godownId) where.godownId = godownId;
    if (status) where.status = status;

    // Company isolation for non-admin users
    if (security.user.companyId && security.user.role !== 'admin') {
      where.companyId = security.user.companyId;
    }

    const batches = await db.batchMaster.findMany({
      where,
      include: {
        product: {
          include: {
            category: true,
            brand: true,
          },
        },
        stockEntries: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Auto-detect Expired batches and compute status
    const now = new Date();
    const enrichedBatches = batches.map(batch => {
      let computedStatus = batch.status;

      // Auto-detect expired batches
      if (batch.expiryDate && new Date(batch.expiryDate) < now && batch.status === 'Active') {
        computedStatus = 'Expired';
      }

      // Auto-detect depleted batches
      if (batch.quantityOnHand <= 0 && batch.status === 'Active') {
        computedStatus = 'Depleted';
      }

      return {
        ...batch,
        computedStatus,
      };
    });

    // Apply VAT Auditor masking
    const role = security.user.role;
    const maskedBatches = maskFinancialArray(
      enrichedBatches as Record<string, unknown>[],
      role,
      ['costPricePerUnit', 'salePricePerUnit', 'quantityOnHand', 'quantityReceived', 'quantitySold']
    );

    // Mask nested product cost fields
    const finalBatches = maskedBatches.map(batch => {
      let masked = batch;
      if (masked.product && typeof masked.product === 'object' && role === 'vat_auditor') {
        masked = {
          ...masked,
          product: maskForVatAuditor(
            masked.product as Record<string, unknown>,
            role,
            ['costPrice', 'salePrice', 'wholesalePrice', 'dealerPrice']
          ),
        };
      }
      // Mask nested stockEntries cost fields
      if (Array.isArray(masked.stockEntries) && role === 'vat_auditor') {
        masked = {
          ...masked,
          stockEntries: (masked.stockEntries as Record<string, unknown>[]).map(se =>
            maskForVatAuditor(se, role, ['costPrice'])
          ),
        };
      }
      return masked;
    });

    return NextResponse.json(finalBatches);
  } catch (error) {
    console.error('[Batches] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch batches' },
      { status: 500 }
    );
  }
}

// ============================================================
// POST /api/batches — Create batch with auto-generated batchCode
// Creates StockEntry (type=IN, referenceType="BatchEntry") with costPrice snapshot
// Updates BatchMaster.quantityOnHand = quantityReceived
// ============================================================

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Stock', 'POST');
  if (!security.authorized) return security.response;

  try {
    const body = await request.json();
    const {
      productId,
      godownId,
      manufacturingDate,
      expiryDate,
      supplierLotNo,
      quantityReceived,
      costPricePerUnit,
      salePricePerUnit,
      status = 'Active',
      notes,
    } = body;

    // ── Validation ──
    if (!productId) {
      return NextResponse.json({ error: 'productId is required' }, { status: 400 });
    }
    if (!quantityReceived || quantityReceived <= 0) {
      return NextResponse.json({ error: 'quantityReceived must be a positive number' }, { status: 400 });
    }

    // Validate product exists
    const product = await db.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, productCode: true, costPrice: true, salePrice: true, godownId: true, isActive: true },
    });
    if (!product || !product.isActive) {
      return NextResponse.json({ error: 'Product not found or inactive' }, { status: 400 });
    }

    // Validate godown if provided
    if (godownId) {
      const godown = await db.godown.findUnique({
        where: { id: godownId },
        select: { id: true, name: true, status: true, isActive: true },
      });
      if (!godown || !godown.isActive) {
        return NextResponse.json({ error: 'Godown not found or inactive' }, { status: 400 });
      }
      if (godown.status === 'SUSPENDED') {
        return NextResponse.json(
          { error: `EMERGENCY CLOSURE: Warehouse "${godown.name}" is SUSPENDED. Cannot create batch entries.` },
          { status: 403 }
        );
      }
    }

    // Period-close check
    const periodLock = await checkPeriodClose(new Date());
    if (periodLock) return periodLock;

    // Default cost/sale prices from product
    const effectiveCostPrice = costPricePerUnit || product.costPrice;
    const effectiveSalePrice = salePricePerUnit || product.salePrice;
    const effectiveGodownId = godownId || product.godownId;

    // Create batch with stock entry atomically
    const result = await db.$transaction(async (tx) => {
      const batchCode = await generateBatchCode(tx);

      // Create BatchMaster
      const batch = await tx.batchMaster.create({
        data: {
          batchCode,
          productId,
          godownId: effectiveGodownId || null,
          manufacturingDate: manufacturingDate ? new Date(manufacturingDate) : null,
          expiryDate: expiryDate ? new Date(expiryDate) : null,
          supplierLotNo: supplierLotNo || null,
          quantityReceived: safeFinancialRound(quantityReceived),
          quantitySold: 0,
          quantityOnHand: safeFinancialRound(quantityReceived),
          costPricePerUnit: safeFinancialRound(effectiveCostPrice),
          salePricePerUnit: safeFinancialRound(effectiveSalePrice),
          status,
          notes: notes || null,
          companyId: security.user.companyId || null,
        },
        include: {
          product: {
            include: { category: true, brand: true },
          },
          stockEntries: true,
        },
      });

      // Create StockEntry (type=IN, referenceType="BatchEntry") with costPrice snapshot
      await tx.stockEntry.create({
        data: {
          productId,
          godownId: effectiveGodownId || null,
          type: 'IN',
          quantity: safeFinancialRound(quantityReceived),
          reference: batchCode,
          referenceType: 'BatchEntry',
          date: new Date(),
          batchId: batch.id,
          costPrice: safeFinancialRound(effectiveCostPrice),
          notes: `Batch entry: ${batchCode}`,
          companyId: security.user.companyId || null,
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'Stock',
          recordId: batch.id,
          recordLabel: batchCode,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            type: 'BatchEntry',
            batchCode,
            productId,
            productName: product.name,
            quantityReceived,
            costPricePerUnit: effectiveCostPrice,
            godownId: effectiveGodownId,
          }),
        },
      });

      // Activity log inside transaction
      await logUserActivity({
        tx: tx,
        action: 'CREATE',
        module: 'Inv-Batch-Master',
        recordId: batch.id,
        recordLabel: batchCode,
        userId: security.user.id,
        userName: security.user.name,
        details: `Created batch ${batchCode} for product ${product.name} with ${quantityReceived} units`,
      });

      return batch;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('[Batches] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to create batch' },
      { status: 500 }
    );
  }
}
