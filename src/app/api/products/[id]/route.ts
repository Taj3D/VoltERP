import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, maskForVatAuditor, validateImageFields, safeFinancialRound } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// ============================================================
// TEXT SANITIZER — Strip HTML tags, trim, collapse double spaces
// ============================================================
function sanitizeText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  let text = String(value);
  // Strip HTML tags
  text = text.replace(/<[^>]*>/g, '');
  // Collapse double spaces
  text = text.replace(/\s{2,}/g, ' ');
  // Trim
  text = text.trim();
  return text || null;
}

// ============================================================
// PRICE VALIDATION — Reject negative/zero values
// ============================================================
function validatePrices(body: Record<string, any>): string | null {
  const costPrice = Number(body.costPrice);
  const salePrice = Number(body.salePrice);
  const wholesalePrice = Number(body.wholesalePrice);
  const dealerPrice = Number(body.dealerPrice);

  if (body.costPrice !== undefined && (isNaN(costPrice) || costPrice <= 0)) {
    return 'Price validation failed: Purchase Price, MRP/Retail Price, Wholesale Price, and Dealer Price must be greater than zero.';
  }
  if (body.salePrice !== undefined && (isNaN(salePrice) || salePrice <= 0)) {
    return 'Price validation failed: Purchase Price, MRP/Retail Price, Wholesale Price, and Dealer Price must be greater than zero.';
  }
  if (body.wholesalePrice !== undefined && wholesalePrice !== 0 && (isNaN(wholesalePrice) || wholesalePrice <= 0)) {
    return 'Price validation failed: Purchase Price, MRP/Retail Price, Wholesale Price, and Dealer Price must be greater than zero.';
  }
  if (body.dealerPrice !== undefined && dealerPrice !== 0 && (isNaN(dealerPrice) || dealerPrice <= 0)) {
    return 'Price validation failed: Purchase Price, MRP/Retail Price, Wholesale Price, and Dealer Price must be greater than zero.';
  }

  // ReorderLevel must be >= 0
  if (body.reorderLevel !== undefined && Number(body.reorderLevel) < 0) {
    return 'Price validation failed: Reorder Level must be greater than or equal to zero.';
  }

  return null;
}

// ============================================================
// PRICING INTERLOCK — costPrice < salePrice
// ============================================================
function validatePricingInterlock(body: Record<string, any>): string | null {
  const costPrice = Number(body.costPrice);
  const salePrice = Number(body.salePrice);

  if (!isNaN(costPrice) && !isNaN(salePrice) && costPrice > 0 && salePrice > 0 && costPrice >= salePrice) {
    return 'Pricing interlock violation: Purchase Price (costPrice) must be less than MRP/Retail Price (salePrice) to avoid operational pricing traps.';
  }

  return null;
}

// ============================================================
// SKU / BARCODE COLLISION CHECK (exclude self)
// ============================================================
async function checkSkuBarcodeCollision(
  tx: any,
  body: Record<string, any>,
  excludeId: string
): Promise<string | null> {
  if (body.sku) {
    const skuExists = await tx.product.findFirst({
      where: { sku: body.sku.trim(), isActive: true, id: { not: excludeId } },
    });
    if (skuExists) {
      return 'SKU_COLLISION: Data Collision: SKU already exists in this tenant profile.';
    }
  }
  if (body.barcode) {
    const barcodeExists = await tx.product.findFirst({
      where: { barcode: body.barcode.trim(), isActive: true, id: { not: excludeId } },
    });
    if (barcodeExists) {
      return 'BARCODE_COLLISION: Data Collision: Barcode already exists in this tenant profile.';
    }
  }
  return null;
}

// ============================================================
// DEACTIVATED PARENT BLOCK CHECK
// ============================================================
async function checkDeactivatedParent(
  tx: any,
  body: Record<string, any>
): Promise<string | null> {
  if (body.categoryId) {
    const category = await tx.category.findUnique({ where: { id: body.categoryId } });
    if (!category || !category.isActive) {
      return 'PARENT_SUSPENDED: Parent Category is suspended/archived. Cannot assign product to inactive category.';
    }
  }
  if (body.brandId) {
    const brand = await tx.brand.findUnique({ where: { id: body.brandId } });
    if (!brand || !brand.isActive) {
      return 'PARENT_SUSPENDED: Parent Brand is suspended/archived. Cannot assign product to inactive brand.';
    }
  }
  return null;
}

// ============================================================
// SKU STATUS COMPUTATION
// ============================================================
function computeSkuStatus(sku: string | null | undefined, barcode: string | null | undefined): string {
  const hasSku = !!sku && sku.trim().length > 0;
  const hasBarcode = !!barcode && barcode.trim().length > 0;
  if (hasSku && hasBarcode) return 'Active';
  if (hasSku && !hasBarcode) return 'No Barcode';
  // Has barcode but no sku, or neither → "No SKU"
  return 'No SKU';
}

// ============================================================
// STOCK STATUS COMPUTATION
// ============================================================
function computeStockStatus(currentStock: number, reorderLevel: number): string {
  if (currentStock === 0) return 'Out of Stock';
  if (currentStock <= reorderLevel) return 'Low Stock';
  return 'In Stock';
}

// ============================================================
// SINGLE PRODUCT STOCK COMPUTATION — Aggregate stock entries for one product
// ============================================================
async function computeProductStock(productId: string): Promise<{ inQty: number; outQty: number }> {
  const [inAgg, outAgg] = await Promise.all([
    db.stockEntry.aggregate({
      where: { productId, type: 'IN' },
      _sum: { quantity: true },
    }),
    db.stockEntry.aggregate({
      where: { productId, type: 'OUT' },
      _sum: { quantity: true },
    }),
  ]);

  return {
    inQty: inAgg._sum.quantity || 0,
    outQty: outAgg._sum.quantity || 0,
  };
}

// ============================================================
// GET /api/products/[id] — Single product with computed stock fields + cross-tenant check
// ============================================================
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Products', 'GET');
  if (!security.authorized) return security.response;
  const companyId = security.user.companyId;

  try {
    const { id } = await params;
    const item = await db.product.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true, code: true, isActive: true } },
        brand: { select: { id: true, name: true, code: true, isActive: true } },
        color: true,
        godown: true,
        segment: true,
        company: true,
      },
    });

    if (!item) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cross-tenant validation
    if (companyId && item.companyId && item.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Compute stock for single product
    const stockData = await computeProductStock(id);
    const currentStock = safeFinancialRound((item.openingStock || 0) + stockData.inQty - stockData.outQty);
    const stockStatus = computeStockStatus(currentStock, item.reorderLevel || 0);
    const skuStatus = computeSkuStatus(item.sku, item.barcode);

    // Enrich with computed fields
    const enrichedItem = {
      ...item,
      currentStock,
      stockStatus,
      skuStatus,
    };

    // VAT Auditor masking
    const maskedItem = security.user.role === 'vat_auditor'
      ? maskForVatAuditor(enrichedItem, security.user.role as any, ['costPrice', 'wholesalePrice', 'dealerPrice'])
      : enrichedItem;

    return NextResponse.json(maskedItem);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch product' },
      { status: 500 }
    );
  }
}

// ============================================================
// PUT /api/products/[id] — Update with all Phase 5 guards
// ============================================================
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Products', 'PUT');
  if (!security.authorized) return security.response;
  const companyId = security.user.companyId;

  try {
    const { id } = await params;
    const body = await request.json();

    // Image validation
    const imgError = validateImageFields(body, ['image']);
    if (imgError) return NextResponse.json({ error: imgError }, { status: 400 });

    // Text sanitizer
    if (body.name !== undefined) body.name = sanitizeText(body.name);
    if (body.sizeCapacity !== undefined) body.sizeCapacity = sanitizeText(body.sizeCapacity);
    if (body.imeiNumber !== undefined) body.imeiNumber = sanitizeText(body.imeiNumber);

    // Price validation (only if price fields are being updated)
    if (body.costPrice !== undefined || body.salePrice !== undefined || body.wholesalePrice !== undefined || body.dealerPrice !== undefined) {
      const priceError = validatePrices(body);
      if (priceError) {
        return NextResponse.json({ error: priceError }, { status: 400 });
      }

      // Pricing interlock
      const interlockError = validatePricingInterlock(body);
      if (interlockError) {
        return NextResponse.json({ error: interlockError }, { status: 400 });
      }
    }

    const item = await db.$transaction(async (tx) => {
      // Pre-fetch record for cross-tenant validation
      const existing = await tx.product.findUnique({ where: { id } });
      if (!existing) throw new Error('Not found');

      // Cross-tenant validation
      if (companyId && existing.companyId && existing.companyId !== companyId) {
        throw new Error('Not found');
      }

      // SKU/Barcode collision check (exclude self)
      const collisionError = await checkSkuBarcodeCollision(tx, body, id);
      if (collisionError) {
        throw new Error(collisionError);
      }

      // Deactivated parent check
      const parentError = await checkDeactivatedParent(tx, body);
      if (parentError) {
        throw new Error(parentError);
      }

      // Build update data — only include fields that are provided
      const updateData: Record<string, any> = {};

      if (body.productCode !== undefined) updateData.productCode = body.productCode;
      if (body.name !== undefined) updateData.name = body.name;
      if (body.sku !== undefined) updateData.sku = body.sku?.trim() || null;
      if (body.barcode !== undefined) updateData.barcode = body.barcode?.trim() || null;
      if (body.categoryId !== undefined) updateData.categoryId = body.categoryId || null;
      if (body.brandId !== undefined) updateData.brandId = body.brandId || null;
      if (body.colorId !== undefined) updateData.colorId = body.colorId || null;
      if (body.unit !== undefined) updateData.unit = body.unit || null;
      if (body.sizeCapacity !== undefined) updateData.sizeCapacity = body.sizeCapacity || null;
      if (body.costPrice !== undefined) updateData.costPrice = safeFinancialRound(Number(body.costPrice));
      if (body.salePrice !== undefined) updateData.salePrice = safeFinancialRound(Number(body.salePrice));
      if (body.wholesalePrice !== undefined) updateData.wholesalePrice = safeFinancialRound(Number(body.wholesalePrice));
      if (body.dealerPrice !== undefined) updateData.dealerPrice = safeFinancialRound(Number(body.dealerPrice));
      if (body.openingStock !== undefined) updateData.openingStock = safeFinancialRound(Number(body.openingStock));
      if (body.reorderLevel !== undefined) updateData.reorderLevel = safeFinancialRound(Number(body.reorderLevel));
      if (body.godownId !== undefined) updateData.godownId = body.godownId || null;
      if (body.segmentId !== undefined) updateData.segmentId = body.segmentId || null;
      if (body.imeiNumber !== undefined) updateData.imeiNumber = body.imeiNumber || null;
      if (body.image !== undefined) updateData.image = body.image || null;
      if (body.isActive !== undefined) updateData.isActive = body.isActive ?? true;
      // Company ID: keep existing unless explicitly provided and valid
      if (body.companyId !== undefined) updateData.companyId = companyId || body.companyId || null;

      const record = await tx.product.update({
        where: { id },
        data: updateData,
        include: {
          category: { select: { id: true, name: true, code: true, isActive: true } },
          brand: { select: { id: true, name: true, code: true, isActive: true } },
          color: true,
          godown: true,
          segment: true,
          company: true,
        },
      });

      // Audit log — module: Sys-Catalog-Core
      await logUserActivity({
          tx: tx,
        action: 'UPDATE',
        module: 'Sys-Catalog-Core',
        recordId: record.id,
        recordLabel: record.name || record.productCode || record.id,
        userId: security.user?.id,
        userName: security.user?.name,
        details: JSON.stringify({ productCode: record.productCode, name: record.name, updatedFields: Object.keys(updateData) }),
      });

      return record;
    });

    return NextResponse.json(item);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update product';
    if (message === 'Not found') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (message.startsWith('SKU_COLLISION:') || message.startsWith('BARCODE_COLLISION:')) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    if (message.startsWith('PARENT_SUSPENDED:')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ============================================================
// DELETE /api/products/[id] — Soft delete with cross-tenant check
// ============================================================
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'Products', 'DELETE');
  if (!security.authorized) return security.response;
  const companyId = security.user.companyId;

  try {
    const { id } = await params;

    await db.$transaction(async (tx) => {
      const record = await tx.product.findUnique({ where: { id } });
      if (!record) throw new Error('Not found');

      // Cross-tenant validation
      if (companyId && record.companyId && record.companyId !== companyId) {
        throw new Error('Not found');
      }

      // FK Check: Check if product is referenced by active transaction lines
      const [
        activePOLines,
        activeSalesLines,
        activeTransferLines,
        activeHireLines,
        activeReplacementLines,
        activeSalesReturnLines,
        activePurchaseReturnLines,
      ] = await Promise.all([
        tx.purchaseOrderLine.count({ where: { productId: id, purchaseOrder: { isActive: true } } }),
        tx.salesOrderLine.count({ where: { productId: id, salesOrder: { isActive: true } } }),
        tx.stockTransferLine.count({ where: { productId: id, stockTransfer: { isActive: true } } }),
        tx.hireSalesLine.count({ where: { productId: id, hireSales: { isActive: true } } }),
        tx.replacementOrderLine.count({ where: { productId: id, replacementOrder: { isActive: true } } }),
        tx.salesReturnLine.count({ where: { productId: id, salesReturn: { isActive: true } } }),
        tx.purchaseReturnLine.count({ where: { productId: id, purchaseReturn: { isActive: true } } }),
      ]);

      const totalRefs = activePOLines + activeSalesLines + activeTransferLines + activeHireLines + activeReplacementLines + activeSalesReturnLines + activePurchaseReturnLines;
      if (totalRefs > 0) {
        throw new Error(
          `Cannot delete: Product is referenced by ${totalRefs} active transaction line(s) across orders, transfers, and returns`
        );
      }

      // Soft delete
      await tx.product.update({
        where: { id },
        data: { isActive: false },
      });

      // Audit log — module: Sys-Catalog-Core
      await logUserActivity({
          tx: tx,
        action: 'DELETE',
        module: 'Sys-Catalog-Core',
        recordId: record.id,
        recordLabel: record.name || record.productCode || record.id,
        userId: security.user?.id,
        userName: security.user?.name,
        details: JSON.stringify({ productCode: record.productCode, name: record.name, sku: record.sku, barcode: record.barcode, softDelete: true }),
      });

      return record;
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete product';
    if (message === 'Not found') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (message.startsWith('Cannot delete')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
