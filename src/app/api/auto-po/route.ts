// ============================================================
// AUTO-PO ENGINE — Phase 11 Enhanced
// Cross-references active physical stock records with
// minimumStockLevelAlert thresholds (ProductStock.alertLevel)
// and Product.reorderLevel. Auto-generates editable draft PO
// forms mapped to the last registered supplier of each item.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity, maskForVatAuditor } from '@/lib/api-security';

// GET /api/auto-po - Find products below reorder/alert level and suggest PO quantities
// Formula: Suggested PO = Avg Daily Sales × Lead Time Days - Current Stock + Safety Stock
// Enhancement: Cross-reference ProductStock.alertLevel (location-wise) + lastSupplierId mapping
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'AutoPO', 'GET');
  if (!security.authorized) return security.response;

  // Dealer: completely blocked from auto PO
  if (security.user?.role === 'dealer') {
    return NextResponse.json({ error: 'Access denied. Dealers cannot access auto PO suggestions.' }, { status: 403 });
  }

  // SR: completely blocked from auto PO
  if (security.user?.role === 'sr') {
    return NextResponse.json({ error: 'Access denied. SRs cannot access auto PO suggestions.' }, { status: 403 });
  }

  try {
    const isVatAuditor = security.user?.role === 'vat_auditor';
    const companyId = security.user?.companyId || undefined;

    // Get all active products with related info, filtered by tenant if available
    const whereClause: any = { isActive: true };
    if (companyId) whereClause.companyId = companyId;

    const products = await db.product.findMany({
      include: {
        category: true,
        godown: true,
        company: true,
        productStocks: {
          where: { isActive: true },
          include: { godown: true },
        },
      },
      where: whereClause,
    });

    // Build a map of productId -> array of ProductStock records (location-wise stock)
    const productStockMap = new Map<string, typeof products[0]['productStocks']>();
    for (const product of products) {
      productStockMap.set(product.id, product.productStocks);
    }

    // Get all stock entries to compute current stock per product
    const stockWhere: any = {};
    if (companyId) stockWhere.companyId = companyId;

    const stockEntries = await db.stockEntry.findMany({
      where: stockWhere,
      select: {
        productId: true,
        type: true,
        quantity: true,
      },
    });

    // Build stock map (current stock = openingStock + IN entries - OUT entries)
    const stockMap = new Map<string, number>();
    for (const entry of stockEntries) {
      const current = stockMap.get(entry.productId) || 0;
      if (entry.type === 'IN') {
        stockMap.set(entry.productId, current + entry.quantity);
      } else if (entry.type === 'OUT') {
        stockMap.set(entry.productId, current - entry.quantity);
      }
    }

    // Calculate average daily sales per product over the last 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const salesEntries = await db.stockEntry.findMany({
      where: {
        type: 'OUT',
        date: { gte: ninetyDaysAgo },
        ...stockWhere,
      },
      select: {
        productId: true,
        quantity: true,
      },
    });

    // Build sales map: total quantity sold per product over 90 days
    const salesMap = new Map<string, number>();
    for (const entry of salesEntries) {
      const current = salesMap.get(entry.productId) || 0;
      salesMap.set(entry.productId, current + entry.quantity);
    }

    // Fetch suppliers for lastSupplierId mapping
    const supplierIds = [...new Set(products.map(p => p.lastSupplierId).filter(Boolean))] as string[];
    const suppliers = supplierIds.length > 0 ? await db.supplier.findMany({
      where: { id: { in: supplierIds } },
      select: { id: true, name: true, supplierCode: true, phone: true },
    }) : [];
    const supplierMap = new Map(suppliers.map(s => [s.id, s]));

    // Parameters for the formula
    const leadTimeDays = 14; // 2 weeks default lead time
    const DAYS_FOR_AVG = 90;

    // Calculate suggested PO for ALL products
    // Then filter to only show those with suggestedQuantity > 0 or below reorder level
    const autoPOItems = products
      .map((product) => {
        const stockMovements = stockMap.get(product.id) || 0;
        const currentStock = product.openingStock + stockMovements;
        const totalSoldLast90Days = salesMap.get(product.id) || 0;
        const avgDailySales = totalSoldLast90Days / DAYS_FOR_AVG;

        // Safety stock = reorder level (product-level) or max of location alert levels
        const locationAlertLevels = productStockMap.get(product.id)?.map(ps => ps.alertLevel || 0) || [];
        const maxLocationAlertLevel = locationAlertLevels.length > 0 ? Math.max(...locationAlertLevels) : 0;
        const safetyStock = Math.max(product.reorderLevel, maxLocationAlertLevel);

        // Cross-reference: check if ANY location-wise stock is below its alertLevel
        const locationStockDetails = (productStockMap.get(product.id) || []).map(ps => ({
          godownId: ps.godownId,
          godownName: ps.godown?.name || 'Unknown',
          quantity: ps.quantity,
          alertLevel: ps.alertLevel,
          isBelowAlert: ps.quantity < ps.alertLevel,
        }));
        const anyLocationBelowAlert = locationStockDetails.some(ls => ls.isBelowAlert);

        // Suggested PO = ceil(avgDailySales * leadTimeDays - currentStock + safetyStock)
        const rawSuggestedPO = avgDailySales * leadTimeDays - currentStock + safetyStock;
        const suggestedQuantity = rawSuggestedPO > 0 ? Math.ceil(rawSuggestedPO) : 0;

        // Last registered supplier mapping
        const lastSupplier = product.lastSupplierId ? supplierMap.get(product.lastSupplierId) : null;

        return {
          productId: product.id,
          productCode: product.productCode,
          productName: product.name,
          category: product.category?.name || 'Uncategorized',
          godown: product.godown?.name || 'Unassigned',
          godownId: product.godownId || null,
          currentStock,
          reorderLevel: product.reorderLevel,
          maxLocationAlertLevel,
          anyLocationBelowAlert,
          locationStockDetails,
          avgDailySales: Math.round(avgDailySales * 100) / 100,
          leadTimeDays,
          safetyStock,
          suggestedQuantity,
          costPrice: isVatAuditor ? 'N/A (Audit Mode)' : product.costPrice,
          estimatedCost: isVatAuditor ? 'N/A (Audit Mode)' : Math.max(suggestedQuantity, 0) * product.costPrice,
          // Auto-PO supplier mapping
          lastSupplierId: product.lastSupplierId || null,
          lastSupplierName: lastSupplier?.name || null,
          lastSupplierCode: lastSupplier?.supplierCode || null,
          lastSupplierPhone: lastSupplier?.phone || null,
          valuationMethod: product.valuationMethod,
        };
      })
      // Show products that need PO (suggested > 0) or are below reorder level or below location alert level
      .filter((item) => item.suggestedQuantity > 0 || item.currentStock <= item.reorderLevel || item.anyLocationBelowAlert);

    return NextResponse.json(autoPOItems);
  } catch (error) {
    console.error('Error generating auto PO suggestions:', error);
    return NextResponse.json(
      { error: 'Failed to generate auto PO suggestions' },
      { status: 500 }
    );
  }
}

// POST /api/auto-po - Generate a draft Purchase Order from auto-PO suggestions
// Takes an array of selected auto-PO items and creates a single draft PO
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'AutoPO', 'POST');
  if (!security.authorized) return security.response;

  if (security.user?.role === 'dealer' || security.user?.role === 'sr') {
    return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { supplierId, godownId, date, lines } = body;

    if (!supplierId || !date || !lines || lines.length === 0) {
      return NextResponse.json(
        { error: 'supplierId, date, and lines are required' },
        { status: 400 }
      );
    }

    // Validate godown status
    if (godownId) {
      const godown = await db.godown.findUnique({ where: { id: godownId } });
      if (godown && godown.status === 'SUSPENDED') {
        return NextResponse.json(
          { error: `Auto-PO blocked: Target godown '${godown.name}' is SUSPENDED. All stock operations are prohibited for this location.` },
          { status: 403 }
        );
      }
    }

    // Period-close lock check
    const periodClose = await db.periodClose.findFirst({
      where: {
        periodMonth: new Date(date).getMonth() + 1,
        periodYear: new Date(date).getFullYear(),
        isLocked: true,
      },
    });
    if (periodClose) {
      return NextResponse.json(
        { error: `Period for ${new Date(date).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })} is locked. No transactions allowed.` },
        { status: 423 }
      );
    }

    // Validate each line
    for (const line of lines) {
      const qty = Number(line.quantity);
      const rate = Number(line.rate);
      if (isNaN(qty) || qty <= 0) {
        return NextResponse.json(
          { error: `Invalid line item: quantity must be a positive number (received: ${line.quantity})` },
          { status: 400 }
        );
      }
      if (isNaN(rate) || rate <= 0) {
        return NextResponse.json(
          { error: `Invalid line item: rate must be a positive number (received: ${line.rate})` },
          { status: 400 }
        );
      }
    }

    // Calculate totals
    const processedLines = lines.map((line: any) => {
      const lineQty = Number(line.quantity) || 0;
      const lineRate = Number(line.rate) || 0;
      const lineTotal = Math.round(lineQty * lineRate * 100) / 100;
      return {
        productId: line.productId,
        quantity: lineQty,
        rate: lineRate,
        taxRate: Number(line.taxRate) || 0,
        discountPercent: 0,
        discountAmount: 0,
        vatAmount: 0,
        total: lineTotal,
      };
    });

    const subTotal = Math.round(processedLines.reduce((sum: number, l: any) => sum + l.total, 0) * 100) / 100;
    const vatPct = Number(body.vatPercentage) || 0;
    const vatAmount = Math.round(subTotal * (vatPct / 100) * 100) / 100;
    const grandTotal = Math.round((subTotal + vatAmount) * 100) / 100;

    // Auto-generate PO number
    const lastPO = await db.purchaseOrder.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { poNumber: true },
    });
    let nextNum = 1;
    if (lastPO?.poNumber) {
      const match = lastPO.poNumber.match(/PUR-(\d+)/);
      if (match) nextNum = parseInt(match[1], 10) + 1;
    }
    const poNumber = `PUR-${String(nextNum).padStart(5, '0')}`;

    const companyId = security.user?.companyId || null;

    const result = await db.$transaction(async (tx) => {
      const purchaseOrder = await tx.purchaseOrder.create({
        data: {
          poNumber,
          supplierId,
          date: new Date(date),
          godownId: godownId || null,
          subTotal,
          vatPercentage: vatPct,
          vatAmount,
          grandTotal,
          status: 'Draft',
          isAutoGenerated: true,
          notes: body.notes || 'Auto-generated Purchase Order from stock alert analysis',
          companyId,
          lines: {
            create: processedLines.map((line: any) => ({
              productId: line.productId,
              quantity: line.quantity,
              rate: line.rate,
              taxRate: line.taxRate,
              discountPercent: 0,
              discountAmount: 0,
              vatAmount: 0,
              total: line.total,
            })),
          },
        },
        include: {
          supplier: true,
          godown: true,
          lines: { include: { product: true } },
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'Inv-Orders-Core',
          recordId: purchaseOrder.id,
          recordLabel: poNumber,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({ type: 'AutoPurchaseOrder', supplierId, grandTotal, lineCount: processedLines.length, isAutoGenerated: true }),
        },
      });

      return purchaseOrder;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating auto-PO:', error);
    return NextResponse.json(
      { error: 'Failed to create auto-PO' },
      { status: 500 }
    );
  }
}
