// ============================================================
// PRODUCT LIFECYCLE API — Serial/IMEI Tracking
// Group 5: Financial Auditing, Automated Ledgers & Data Integrity
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, type UserRole } from '@/lib/api-security';

// Inline code generator for ProductSerialTracking
async function generateCode(model: string, prefix: string): Promise<string> {
  const latest = await (db as any)[model].findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: 'desc' },
    select: { code: true },
  });
  if (!latest) return `${prefix}00001`;
  const num = parseInt(latest.code.replace(prefix, ''), 10) || 0;
  return `${prefix}${String(num + 1).padStart(5, '0')}`;
}

function maskForVat(value: any, isVatAuditor: boolean): any {
  if (!isVatAuditor) return value;
  return 'N/A (Audit Mode)';
}

// GET /api/product-lifecycle
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Stock', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const userRole = security.user.role as UserRole;
    const isVatAuditor = userRole === 'vat_auditor';

    // Dealer: view-only (can access)
    // SR: can view
    // Admin/Manager: full access
    // VAT Auditor: cost masked

    const action = searchParams.get('action');

    // Lookup by serial or IMEI
    if (action === 'lookup') {
      return await lookupSerialIMEI(searchParams, isVatAuditor);
    }

    // List tracking records with filters
    const where: Record<string, unknown> = { isActive: true };

    const productId = searchParams.get('productId');
    const serialNumber = searchParams.get('serialNumber');
    const imeiNumber = searchParams.get('imeiNumber');
    const status = searchParams.get('status');
    const godownId = searchParams.get('godownId');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    if (productId) where.productId = productId;
    if (serialNumber) where.serialNumber = { contains: serialNumber };
    if (imeiNumber) where.imeiNumber = { contains: imeiNumber };
    if (status) where.status = status;
    if (godownId) where.godownId = godownId;

    const [records, total] = await Promise.all([
      db.productSerialTracking.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          // We can't directly include relations that aren't defined in schema
          // But we can look up related records manually
        },
      }),
      db.productSerialTracking.count({ where }),
    ]);

    // Enrich with product info and mask cost for VAT Auditor
    const enriched = await Promise.all(
      records.map(async (record: any) => {
        const product = await db.product.findUnique({
          where: { id: record.productId },
          select: {
            productCode: true,
            name: true,
            costPrice: true,
            salePrice: true,
          },
        });

        return {
          ...record,
          productCode: product?.productCode || 'N/A',
          productName: product?.name || 'N/A',
          costPrice: isVatAuditor
            ? maskForVat(product?.costPrice, true)
            : product?.costPrice || 0,
          salePrice: product?.salePrice || 0,
        };
      })
    );

    return NextResponse.json({ records: enriched, total, limit, offset });
  } catch (error) {
    console.error('Product lifecycle GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch product lifecycle records' }, { status: 500 });
  }
}

// Lookup a specific serial/IMEI and return full lifecycle history
async function lookupSerialIMEI(
  searchParams: URLSearchParams,
  isVatAuditor: boolean
) {
  const serial = searchParams.get('serial');
  const imei = searchParams.get('imei');

  if (!serial && !imei) {
    return NextResponse.json(
      { error: 'Must provide either serial or imei parameter for lookup' },
      { status: 400 }
    );
  }

  const where: Record<string, unknown> = { isActive: true };
  if (serial) where.serialNumber = serial;
  if (imei) where.imeiNumber = imei;

  const record = await db.productSerialTracking.findFirst({ where });

  if (!record) {
    return NextResponse.json(
      { error: 'No tracking record found for the given serial/IMEI' },
      { status: 404 }
    );
  }

  // Get product details
  const product = await db.product.findUnique({
    where: { id: record.productId },
    select: {
      productCode: true,
      name: true,
      costPrice: true,
      salePrice: true,
      category: { select: { name: true } },
      brand: { select: { name: true } },
    },
  });

  // Get all tracking records for this serial/IMEI (full lifecycle)
  const allRecords = await db.productSerialTracking.findMany({
    where: {
      productId: record.productId,
      isActive: true,
      OR: [
        ...(record.serialNumber ? [{ serialNumber: record.serialNumber }] : []),
        ...(record.imeiNumber ? [{ imeiNumber: record.imeiNumber }] : []),
      ],
    },
    orderBy: { createdAt: 'asc' },
  });

  // Get related orders
  const purchaseOrder = record.purchaseOrderId
    ? await db.purchaseOrder.findUnique({
        where: { id: record.purchaseOrderId },
        select: { poNumber: true, date: true, supplier: { select: { name: true } } },
      })
    : null;

  const salesOrder = record.salesOrderId
    ? await db.salesOrder.findUnique({
        where: { id: record.salesOrderId },
        select: { invoiceNo: true, date: true, customer: { select: { name: true } } },
      })
    : null;

  // Get stock entries related to this product
  const stockEntries = await db.stockEntry.findMany({
    where: {
      productId: record.productId,
      isActive: true,
    },
    orderBy: { date: 'desc' },
    take: 20,
    select: {
      id: true,
      type: true,
      quantity: true,
      date: true,
      reference: true,
      referenceType: true,
    },
  });

  return NextResponse.json({
    tracking: {
      ...record,
      productCode: product?.productCode || 'N/A',
      productName: product?.name || 'N/A',
      costPrice: isVatAuditor ? maskForVat(product?.costPrice, true) : product?.costPrice || 0,
      salePrice: product?.salePrice || 0,
      category: product?.category?.name || 'N/A',
      brand: product?.brand?.name || 'N/A',
    },
    lifecycle: allRecords.map((r: any) => ({
      ...r,
      status: r.status,
      date: r.purchaseDate || r.saleDate || r.returnDate || r.createdAt,
    })),
    purchaseOrder,
    salesOrder,
    stockEntries,
  });
}

// POST /api/product-lifecycle — Create a new tracking record
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Stock', 'POST');
  if (!security.authorized) return security.response;

  try {
    const userRole = security.user.role as UserRole;

    // Dealer: view-only (no create)
    if (userRole === 'dealer') {
      return NextResponse.json(
        { error: 'Access denied. Dealers have view-only access to product lifecycle.' },
        { status: 403 }
      );
    }

    // VAT Auditor: read-only
    if (userRole === 'vat_auditor') {
      return NextResponse.json(
        { error: 'Write access denied. VAT Auditor has read-only access.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      productId,
      serialNumber,
      imeiNumber,
      status,
      purchaseOrderId,
      salesOrderId,
      godownId,
      customerId,
      supplierId,
      purchaseDate,
      saleDate,
      returnDate,
      warrantyExpiry,
      notes,
    } = body;

    if (!productId) {
      return NextResponse.json(
        { error: 'Missing required field: productId' },
        { status: 400 }
      );
    }

    if (!serialNumber && !imeiNumber) {
      return NextResponse.json(
        { error: 'At least one of serialNumber or imeiNumber is required' },
        { status: 400 }
      );
    }

    // Verify product exists
    const product = await db.product.findUnique({ where: { id: productId } });
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const code = await generateCode('productSerialTracking', 'SRL-');

    const record = await db.productSerialTracking.create({
      data: {
        code,
        productId,
        serialNumber: serialNumber || null,
        imeiNumber: imeiNumber || null,
        status: status || 'InStock',
        purchaseOrderId: purchaseOrderId || null,
        salesOrderId: salesOrderId || null,
        godownId: godownId || null,
        customerId: customerId || null,
        supplierId: supplierId || null,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
        saleDate: saleDate ? new Date(saleDate) : null,
        returnDate: returnDate ? new Date(returnDate) : null,
        warrantyExpiry: warrantyExpiry ? new Date(warrantyExpiry) : null,
        notes: notes || null,
      },
    });

    // Audit log
    await db.auditLog.create({
      data: {
        action: 'CREATE',
        module: 'ProductLifecycle',
        recordId: record.id,
        recordLabel: record.code,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({ productId, serialNumber, imeiNumber, status }),
      },
    });

    return NextResponse.json({ record }, { status: 201 });
  } catch (error) {
    console.error('Product lifecycle POST error:', error);
    return NextResponse.json({ error: 'Failed to create tracking record' }, { status: 500 });
  }
}

// PUT /api/product-lifecycle — Update tracking record status
export async function PUT(request: NextRequest) {
  const security = await withApiSecurity(request, 'Stock', 'PUT');
  if (!security.authorized) return security.response;

  try {
    const userRole = security.user.role as UserRole;

    // Dealer: view-only
    if (userRole === 'dealer') {
      return NextResponse.json(
        { error: 'Access denied. Dealers have view-only access to product lifecycle.' },
        { status: 403 }
      );
    }

    // VAT Auditor: read-only
    if (userRole === 'vat_auditor') {
      return NextResponse.json(
        { error: 'Write access denied. VAT Auditor has read-only access.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      id,
      status,
      salesOrderId,
      customerId,
      saleDate,
      returnDate,
      godownId,
      notes,
    } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing required field: id' }, { status: 400 });
    }

    const existing = await db.productSerialTracking.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Tracking record not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (status) updateData.status = status;
    if (salesOrderId !== undefined) updateData.salesOrderId = salesOrderId;
    if (customerId !== undefined) updateData.customerId = customerId;
    if (saleDate !== undefined) updateData.saleDate = saleDate ? new Date(saleDate) : null;
    if (returnDate !== undefined) updateData.returnDate = returnDate ? new Date(returnDate) : null;
    if (godownId !== undefined) updateData.godownId = godownId;
    if (notes !== undefined) updateData.notes = notes;

    // If marking as Sold, set saleDate to now if not provided
    if (status === 'Sold' && !saleDate) {
      updateData.saleDate = new Date();
    }

    // If marking as Returned, set returnDate to now if not provided
    if (status === 'Returned' && !returnDate) {
      updateData.returnDate = new Date();
    }

    const record = await db.productSerialTracking.update({
      where: { id },
      data: updateData,
    });

    // Audit log
    await db.auditLog.create({
      data: {
        action: 'UPDATE',
        module: 'ProductLifecycle',
        recordId: record.id,
        recordLabel: record.code,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({ before: { status: existing.status }, after: updateData }),
      },
    });

    return NextResponse.json({ record });
  } catch (error) {
    console.error('Product lifecycle PUT error:', error);
    return NextResponse.json({ error: 'Failed to update tracking record' }, { status: 500 });
  }
}
