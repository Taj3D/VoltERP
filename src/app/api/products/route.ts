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
// SKU / BARCODE COLLISION CHECK
// ============================================================
async function checkSkuBarcodeCollision(
  tx: any,
  body: Record<string, any>,
  excludeId?: string
): Promise<string | null> {
  if (body.sku) {
    const skuWhere: any = { sku: body.sku.trim(), isActive: true };
    if (excludeId) {
      skuWhere.id = { not: excludeId };
    }
    const skuExists = await tx.product.findFirst({ where: skuWhere });
    if (skuExists) {
      return 'SKU_COLLISION: Data Collision: SKU already exists in this tenant profile.';
    }
  }
  if (body.barcode) {
    const barcodeWhere: any = { barcode: body.barcode.trim(), isActive: true };
    if (excludeId) {
      barcodeWhere.id = { not: excludeId };
    }
    const barcodeExists = await tx.product.findFirst({ where: barcodeWhere });
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
// BATCH STOCK AGGREGATION — Efficient groupBy for multiple products
// ============================================================
async function batchComputeStock(productIds: string[]): Promise<Map<string, { inQty: number; outQty: number }>> {
  const stockMap = new Map<string, { inQty: number; outQty: number }>();

  // Initialize all product IDs with zero
  for (const id of productIds) {
    stockMap.set(id, { inQty: 0, outQty: 0 });
  }

  if (productIds.length === 0) return stockMap;

  // Batch aggregate stock IN entries
  const stockIns = await db.stockEntry.groupBy({
    by: ['productId'],
    where: { productId: { in: productIds }, type: 'IN' },
    _sum: { quantity: true },
  });

  // Batch aggregate stock OUT entries
  const stockOuts = await db.stockEntry.groupBy({
    by: ['productId'],
    where: { productId: { in: productIds }, type: 'OUT' },
    _sum: { quantity: true },
  });

  // Build lookup maps
  for (const entry of stockIns) {
    const existing = stockMap.get(entry.productId);
    if (existing) {
      existing.inQty = entry._sum.quantity || 0;
    }
  }

  for (const entry of stockOuts) {
    const existing = stockMap.get(entry.productId);
    if (existing) {
      existing.outQty = entry._sum.quantity || 0;
    }
  }

  return stockMap;
}

// ============================================================
// GET /api/products — Multi-tenant list with stock computation, filters, summary
// ============================================================
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Products', 'GET');
  if (!security.authorized) return security.response;
  const companyId = security.user.companyId;

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const stockStatusFilter = searchParams.get('stockStatus');
    const searchQuery = searchParams.get('search');

    // ---- SUMMARY ACTION ----
    if (action === 'summary') {
      const baseWhere = {
        isActive: true,
        ...(companyId ? { companyId } : {}),
      };

      const allProducts = await db.product.findMany({
        where: baseWhere,
        select: {
          id: true,
          sku: true,
          barcode: true,
          openingStock: true,
          reorderLevel: true,
          costPrice: true,
          salePrice: true,
          wholesalePrice: true,
          dealerPrice: true,
          categoryId: true,
          category: { select: { id: true, name: true } },
        },
      });

      // Batch compute stock for all products
      const productIds = allProducts.map(p => p.id);
      const stockMap = await batchComputeStock(productIds);

      let inStock = 0;
      let lowStock = 0;
      let outOfStock = 0;
      let activeSKUs = 0;
      let noSKUs = 0;

      // Category-wise summary map
      const categoryMap = new Map<string, { categoryId: string; categoryName: string; count: number; totalValue: number }>();

      for (const p of allProducts) {
        const stockData = stockMap.get(p.id) || { inQty: 0, outQty: 0 };
        const currentStock = safeFinancialRound((p.openingStock || 0) + stockData.inQty - stockData.outQty);
        const status = computeStockStatus(currentStock, p.reorderLevel || 0);
        const skuStat = computeSkuStatus(p.sku, p.barcode);

        if (status === 'In Stock') inStock++;
        else if (status === 'Low Stock') lowStock++;
        else outOfStock++;

        if (skuStat === 'Active') activeSKUs++;
        else noSKUs++;

        // Category-wise accumulation
        const catId = p.categoryId;
        const catName = p.category?.name || 'Uncategorized';
        const existing = categoryMap.get(catId);
        // Total value = currentStock * costPrice (inventory valuation at cost)
        const inventoryValue = safeFinancialRound(currentStock * (p.costPrice || 0));
        if (existing) {
          existing.count++;
          existing.totalValue = safeFinancialRound(existing.totalValue + inventoryValue);
        } else {
          categoryMap.set(catId, { categoryId: catId, categoryName: catName, count: 1, totalValue: inventoryValue });
        }
      }

      const summary = {
        totalProducts: allProducts.length,
        inStock,
        lowStock,
        outOfStock,
        activeSKUs,
        noSKUs,
        categoryWiseSummary: Array.from(categoryMap.values()),
      };

      // VAT Auditor masking on summary monetary fields
      if (security.user.role === 'vat_auditor') {
        return NextResponse.json({
          ...summary,
          totalProducts: summary.totalProducts,
          inStock: summary.inStock,
          lowStock: summary.lowStock,
          outOfStock: summary.outOfStock,
          categoryWiseSummary: summary.categoryWiseSummary.map(c => ({
            ...c,
            totalValue: 'N/A (Audit Mode)' as unknown as number,
          })),
        });
      }

      return NextResponse.json(summary);
    }

    // ---- REGULAR LIST WITH STOCK COMPUTATION ----
    // PERFORMANCE: Default pagination (100 items) to avoid returning 3.5MB+
    // payloads when the client doesn't specify a limit. Use ?limit=0 for all
    // (reserved for export/batch operations only).
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const requestedLimit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 100;
    const searchLimit = requestedLimit === 0 ? 0 : Math.min(requestedLimit, 500); // cap at 500

    const searchWhere = searchQuery
      ? {
          OR: [
            { name: { contains: searchQuery } },
            { productCode: { contains: searchQuery } },
            { sku: { contains: searchQuery } },
            { barcode: { contains: searchQuery } },
          ],
        }
      : {};
    const items = await db.product.findMany({
      where: {
        isActive: true,
        ...(companyId ? { companyId } : {}),
        ...searchWhere,
      },
      ...(searchLimit > 0 ? { take: searchLimit, skip: (page - 1) * searchLimit } : {}),
      orderBy: { createdAt: 'desc' },
      include: {
        category: { select: { id: true, name: true, code: true, isActive: true } },
        brand: { select: { id: true, name: true, code: true, isActive: true } },
        color: true,
        godown: true,
        segment: true,
        company: true,
      },
    });

    // Batch compute stock for all products
    const productIds = items.map(p => p.id);
    const stockMap = await batchComputeStock(productIds);

    // Enrich each product with computed fields
    let enrichedItems = items.map(item => {
      const stockData = stockMap.get(item.id) || { inQty: 0, outQty: 0 };
      const currentStock = safeFinancialRound((item.openingStock || 0) + stockData.inQty - stockData.outQty);
      const stockStatus = computeStockStatus(currentStock, item.reorderLevel || 0);
      const skuStatus = computeSkuStatus(item.sku, item.barcode);

      return {
        ...item,
        currentStock,
        stockStatus,
        skuStatus,
      };
    });

    // Apply stockStatus filter if provided
    if (stockStatusFilter) {
      const validStatuses = ['In Stock', 'Low Stock', 'Out of Stock'];
      if (!validStatuses.includes(stockStatusFilter)) {
        return NextResponse.json(
          { error: `Invalid stockStatus filter. Must be one of: ${validStatuses.join(', ')}` },
          { status: 400 }
        );
      }
      enrichedItems = enrichedItems.filter(item => item.stockStatus === stockStatusFilter);
    }

    // VAT Auditor masking — mask costPrice, wholesalePrice, dealerPrice
    const maskedItems = security.user.role === 'vat_auditor'
      ? enrichedItems.map(item => maskForVatAuditor(item, security.user.role as any, ['costPrice', 'wholesalePrice', 'dealerPrice']))
      : enrichedItems;

    return NextResponse.json(maskedItems);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch products' },
      { status: 500 }
    );
  }
}

// ============================================================
// POST /api/products — Create single or batch with all Phase 5 guards
// Enhanced: within-batch duplicate SKU/barcode validation, currency sanitization
// ============================================================
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Products', 'POST');
  if (!security.authorized) return security.response;
  const companyId = security.user.companyId;

  try {
    const body = await request.json();

    // ---- SINGLE MODE required-field validation ----
    if (!body.batchMode) {
      if (!body.name || !String(body.name).trim()) {
        return NextResponse.json({ error: "Product name is required" }, { status: 400 });
      }
      // SKU is optional — collision check below handles the case when SKU is provided
    }

    // ---- BATCH MODE ----
    if (body.batchMode && Array.isArray(body.data)) {
      const batchData = body.data;

      // ---- WITHIN-BATCH DUPLICATE SKU/BARCODE VALIDATION ----
      const skuSet = new Set<string>();
      const barcodeSet = new Set<string>();
      const duplicateErrors: { field: string; value: string; indices: number[] }[] = [];

      for (let i = 0; i < batchData.length; i++) {
        const record = batchData[i];

        // Check SKU duplicates within the batch
        if (record.sku && typeof record.sku === 'string' && record.sku.trim()) {
          const normalizedSku = record.sku.trim();
          if (skuSet.has(normalizedSku)) {
            // Find the first occurrence index
            const firstIndex = batchData.findIndex(
              (r: any, idx: number) => idx < i && r.sku && typeof r.sku === 'string' && r.sku.trim() === normalizedSku
            );
            const existing = duplicateErrors.find(e => e.field === 'sku' && e.value === normalizedSku);
            if (existing) {
              existing.indices.push(i + 1);
            } else {
              duplicateErrors.push({ field: 'sku', value: normalizedSku, indices: [firstIndex + 1, i + 1] });
            }
          } else {
            skuSet.add(normalizedSku);
          }
        }

        // Check Barcode duplicates within the batch
        if (record.barcode && typeof record.barcode === 'string' && record.barcode.trim()) {
          const normalizedBarcode = record.barcode.trim();
          if (barcodeSet.has(normalizedBarcode)) {
            const firstIndex = batchData.findIndex(
              (r: any, idx: number) => idx < i && r.barcode && typeof r.barcode === 'string' && r.barcode.trim() === normalizedBarcode
            );
            const existing = duplicateErrors.find(e => e.field === 'barcode' && e.value === normalizedBarcode);
            if (existing) {
              existing.indices.push(i + 1);
            } else {
              duplicateErrors.push({ field: 'barcode', value: normalizedBarcode, indices: [firstIndex + 1, i + 1] });
            }
          } else {
            barcodeSet.add(normalizedBarcode);
          }
        }
      }

      // Return 409 if any duplicates found within the batch
      if (duplicateErrors.length > 0) {
        return NextResponse.json(
          {
            error: 'Duplicate SKU/Barcode detected within batch import. Each SKU and Barcode must be unique within the batch.',
            details: duplicateErrors.map(d => ({
              field: d.field,
              value: d.value,
              duplicateAtRows: d.indices,
            })),
          },
          { status: 409 }
        );
      }

      // Validate all items first before creating any
      for (let i = 0; i < batchData.length; i++) {
        const record = batchData[i];

        // Text sanitizer
        record.name = sanitizeText(record.name);
        record.sizeCapacity = sanitizeText(record.sizeCapacity);
        record.imeiNumber = sanitizeText(record.imeiNumber);

        // Price validation
        if (record.costPrice !== undefined || record.salePrice !== undefined || record.wholesalePrice !== undefined || record.dealerPrice !== undefined) {
          // Only validate prices that are provided and non-zero
          const cp = Number(record.costPrice ?? 0);
          const sp = Number(record.salePrice ?? 0);
          const wp = Number(record.wholesalePrice ?? 0);
          const dp = Number(record.dealerPrice ?? 0);

          if (cp < 0 || sp < 0 || wp < 0 || dp < 0) {
            return NextResponse.json(
              { error: `Price validation failed at item ${i + 1}: Purchase Price, MRP/Retail Price, Wholesale Price, and Dealer Price must be greater than zero.` },
              { status: 400 }
            );
          }
          if ((cp > 0 && sp > 0) && cp >= sp) {
            return NextResponse.json(
              { error: `Pricing interlock violation at item ${i + 1}: Purchase Price (costPrice) must be less than MRP/Retail Price (salePrice) to avoid operational pricing traps.` },
              { status: 400 }
            );
          }
        }

        // CURRENCY SANITIZATION — Apply rounding to 2 decimal places on all price fields
        if (record.costPrice !== undefined) record.costPrice = safeFinancialRound(Number(record.costPrice));
        if (record.salePrice !== undefined) record.salePrice = safeFinancialRound(Number(record.salePrice));
        if (record.wholesalePrice !== undefined) record.wholesalePrice = safeFinancialRound(Number(record.wholesalePrice));
        if (record.dealerPrice !== undefined) record.dealerPrice = safeFinancialRound(Number(record.dealerPrice));
        if (record.reorderLevel !== undefined) record.reorderLevel = safeFinancialRound(Number(record.reorderLevel));
        if (record.openingStock !== undefined) record.openingStock = safeFinancialRound(Number(record.openingStock));

        // Company ID
        record.companyId = companyId || record.companyId || null;
      }

      // Create all in single $transaction
      const results = await db.$transaction(async (tx) => {
        const created: any[] = [];

        for (const record of batchData) {
          // SKU/Barcode collision check per item (against DB)
          const collisionError = await checkSkuBarcodeCollision(tx, record);
          if (collisionError) {
            throw new Error(collisionError);
          }

          // Deactivated parent check per item
          const parentError = await checkDeactivatedParent(tx, record);
          if (parentError) {
            throw new Error(parentError);
          }

          // Generate productCode if missing (collision-safe: findMany + Math.max)
          let productCode = record.productCode;
          if (!productCode) {
            const allProducts = await tx.product.findMany({ select: { productCode: true } });
            let maxNum = 0;
            for (const p of allProducts) {
              const match = p.productCode?.match(/PROD-(\d+)/);
              if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
            }
            productCode = `PROD-${String(maxNum + 1 + created.length).padStart(5, '0')}`;
          }

          const item = await tx.product.create({
            data: {
              productCode,
              name: record.name,
              sku: record.sku?.trim() || null,
              barcode: record.barcode?.trim() || null,
              categoryId: record.categoryId || null,
              brandId: record.brandId || null,
              colorId: record.colorId || null,
              unit: record.unit || null,
              sizeCapacity: record.sizeCapacity || null,
              costPrice: record.costPrice ?? 0,
              salePrice: record.salePrice ?? 0,
              wholesalePrice: record.wholesalePrice ?? 0,
              dealerPrice: record.dealerPrice ?? 0,
              openingStock: record.openingStock ?? 0,
              reorderLevel: record.reorderLevel ?? 0,
              godownId: record.godownId || null,
              segmentId: record.segmentId || null,
              companyId: record.companyId,
              imeiNumber: record.imeiNumber || null,
              image: record.image || null,
              compressorWarranty: record.compressorWarranty ? Number(record.compressorWarranty) : null,
              compressorWarrantyUnit: record.compressorWarrantyUnit || null,
              panelWarranty: record.panelWarranty ? Number(record.panelWarranty) : null,
              panelWarrantyUnit: record.panelWarrantyUnit || null,
              serviceWarranty: record.serviceWarranty ? Number(record.serviceWarranty) : null,
              serviceWarrantyUnit: record.serviceWarrantyUnit || null,
              motorWarranty: record.motorWarranty ? Number(record.motorWarranty) : null,
              motorWarrantyUnit: record.motorWarrantyUnit || null,
              sparePartsWarranty: record.sparePartsWarranty ? Number(record.sparePartsWarranty) : null,
              sparePartsWarrantyUnit: record.sparePartsWarrantyUnit || null,
              isActive: record.isActive ?? true,
            },
            include: {
              category: { select: { id: true, name: true, code: true, isActive: true } },
              brand: { select: { id: true, name: true, code: true, isActive: true } },
              color: true,
              godown: true,
              segment: true,
              company: true,
            },
          });

          created.push(item);
        }

        // Single audit log for batch
        await logUserActivity({
          tx: tx,
          action: 'IMPORT',
          module: 'Sys-Catalog-Core',
          recordId: 'BATCH',
          recordLabel: `Batch: ${created.length} products`,
          userId: security.user?.id,
          userName: security.user?.name,
          details: JSON.stringify({ count: created.length, productCodes: created.map((p: any) => p.productCode) }),
        });

        return created;
      });

      return NextResponse.json({ success: true, count: results.length, data: results }, { status: 201 });
    }

    // ---- SINGLE MODE ----

    // Image validation
    const imgError = validateImageFields(body, ['image']);
    if (imgError) return NextResponse.json({ error: imgError }, { status: 400 });

    // Text sanitizer
    body.name = sanitizeText(body.name);
    body.sizeCapacity = sanitizeText(body.sizeCapacity);
    body.imeiNumber = sanitizeText(body.imeiNumber);

    // Price validation
    const priceError = validatePrices(body);
    if (priceError) {
      return NextResponse.json({ error: priceError }, { status: 400 });
    }

    // Pricing interlock
    const interlockError = validatePricingInterlock(body);
    if (interlockError) {
      return NextResponse.json({ error: interlockError }, { status: 400 });
    }

    const item = await db.$transaction(async (tx) => {
      // SKU/Barcode collision check
      const collisionError = await checkSkuBarcodeCollision(tx, body);
      if (collisionError) {
        throw new Error(collisionError);
      }

      // Deactivated parent check
      const parentError = await checkDeactivatedParent(tx, body);
      if (parentError) {
        throw new Error(parentError);
      }

      // Generate productCode if missing (collision-safe: findMany + Math.max)
      let productCode = body.productCode;
      if (!productCode) {
        const allProducts = await tx.product.findMany({ select: { productCode: true } });
        let maxNum = 0;
        for (const p of allProducts) {
          const match = p.productCode?.match(/PROD-(\d+)/);
          if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
        }
        productCode = `PROD-${String(maxNum + 1).padStart(5, '0')}`;
      }

      // CURRENCY SANITIZATION — Apply rounding to 2 decimal places on all price fields
      const record = await tx.product.create({
        data: {
          productCode,
          name: body.name,
          sku: body.sku?.trim() || null,
          barcode: body.barcode?.trim() || null,
          categoryId: body.categoryId || null,
          brandId: body.brandId || null,
          colorId: body.colorId || null,
          unit: body.unit || null,
          sizeCapacity: body.sizeCapacity || null,
          costPrice: safeFinancialRound(Number(body.costPrice ?? 0)),
          salePrice: safeFinancialRound(Number(body.salePrice ?? 0)),
          wholesalePrice: safeFinancialRound(Number(body.wholesalePrice ?? 0)),
          dealerPrice: safeFinancialRound(Number(body.dealerPrice ?? 0)),
          openingStock: safeFinancialRound(Number(body.openingStock ?? 0)),
          reorderLevel: safeFinancialRound(Number(body.reorderLevel ?? 0)),
          godownId: body.godownId || null,
          segmentId: body.segmentId || null,
          companyId: companyId || body.companyId || null,
          imeiNumber: body.imeiNumber || null,
          image: body.image || null,
          compressorWarranty: body.compressorWarranty ? Number(body.compressorWarranty) : null,
          compressorWarrantyUnit: body.compressorWarrantyUnit || null,
          panelWarranty: body.panelWarranty ? Number(body.panelWarranty) : null,
          panelWarrantyUnit: body.panelWarrantyUnit || null,
          serviceWarranty: body.serviceWarranty ? Number(body.serviceWarranty) : null,
          serviceWarrantyUnit: body.serviceWarrantyUnit || null,
          motorWarranty: body.motorWarranty ? Number(body.motorWarranty) : null,
          motorWarrantyUnit: body.motorWarrantyUnit || null,
          sparePartsWarranty: body.sparePartsWarranty ? Number(body.sparePartsWarranty) : null,
          sparePartsWarrantyUnit: body.sparePartsWarrantyUnit || null,
          isActive: body.isActive ?? true,
        },
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
        action: 'CREATE',
        module: 'Sys-Catalog-Core',
        recordId: record.id,
        recordLabel: record.name || record.productCode || record.id,
        userId: security.user?.id,
        userName: security.user?.name,
        details: JSON.stringify({ productCode: record.productCode, name: record.name, categoryId: record.categoryId, sku: body.sku || null, barcode: body.barcode || null }),
      });

      return record;
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    // Handle collision and parent suspended errors with proper status codes
    const message = error instanceof Error ? error.message : 'Failed to create product';
    if (message.startsWith('SKU_COLLISION:') || message.startsWith('BARCODE_COLLISION:')) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    if (message.startsWith('PARENT_SUSPENDED:')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
