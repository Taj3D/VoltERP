import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  safeFinancialRound,
  maskFinancialArray,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// GET /api/batch-master — List batch masters with multi-tenant isolation + VAT Auditor masking
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Stock', 'GET');
  if (!security.authorized) return security.response;

  const { role, companyId } = security.user;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const productId = searchParams.get('productId');
    const godownId = searchParams.get('godownId');

    const batches = await db.batchMaster.findMany({
      where: {
        isActive: true,
        ...(companyId ? { companyId } : {}),
        ...(status ? { status } : {}),
        ...(productId ? { productId } : {}),
        ...(godownId ? { godownId } : {}),
      },
      include: {
        product: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Apply VAT Auditor masking on costPricePerUnit, salePricePerUnit fields
    const masked = maskFinancialArray(
      batches as Record<string, unknown>[],
      role,
      ['costPricePerUnit', 'salePricePerUnit']
    );

    return NextResponse.json(masked);
  } catch (error) {
    console.error('Error fetching batch masters:', error);
    return NextResponse.json(
      { error: 'Failed to fetch batch masters' },
      { status: 500 }
    );
  }
}

// POST /api/batch-master — Create batch master with validation
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Stock', 'POST');
  if (!security.authorized) return security.response;

  const { id: userId, name: userName, companyId } = security.user;

  try {
    const body = await request.json();
    const {
      batchCode,
      batchNumber, // Legacy alias for batchCode
      productId,
      quantity,
      costPrice,
      salePrice,
      expiryDate,
      manufacturingDate,
      godownId,
      status,
    } = body;

    // batchCode is the canonical field; batchNumber is accepted as a legacy alias
    const resolvedBatchCode = batchCode || batchNumber;

    // ── Required field validation ──
    if (!resolvedBatchCode || !productId || quantity === undefined || quantity === null || costPrice === undefined || costPrice === null) {
      return NextResponse.json(
        { error: 'batchCode, productId, quantity, and costPrice are required' },
        { status: 400 }
      );
    }

    // ── Numeric integrity: reject zero, negative, NaN ──
    const parsedQty = parseFloat(String(quantity));
    const parsedCost = parseFloat(String(costPrice));

    if (isNaN(parsedQty) || parsedQty <= 0) {
      return NextResponse.json(
        { error: 'quantity must be a positive number (zero, negative, and NaN are rejected)' },
        { status: 400 }
      );
    }

    if (isNaN(parsedCost) || parsedCost <= 0) {
      return NextResponse.json(
        { error: 'costPrice must be a positive number (zero, negative, and NaN are rejected)' },
        { status: 400 }
      );
    }

    const safeQty = safeFinancialRound(parsedQty);
    const safeCost = safeFinancialRound(parsedCost);
    const safeSalePrice = salePrice ? safeFinancialRound(parseFloat(String(salePrice))) : 0;

    // ── XSS sanitization on batchNumber string ──
    const sanitize = (val: unknown): string | null => {
      if (!val || typeof val !== 'string') return null;
      return val.replace(/<[^>]*>/g, '').trim() || null;
    };

    const cleanBatchCode = sanitize(resolvedBatchCode);
    if (!cleanBatchCode) {
      return NextResponse.json(
        { error: 'batchCode is required after sanitization' },
        { status: 400 }
      );
    }

    // ── Godown SUSPENDED check if godownId provided ──
    if (godownId) {
      const godown = await db.godown.findFirst({
        where: { id: String(godownId), isActive: true },
      });

      if (godown && godown.status === 'SUSPENDED') {
        return NextResponse.json(
          { error: 'Godown is SUSPENDED. Stock operations are blocked.' },
          { status: 400 }
        );
      }
    }

    // ── Create batch master ──
    const batch = await db.batchMaster.create({
      data: {
        batchCode: cleanBatchCode,
        productId: String(productId),
        godownId: godownId ? String(godownId) : null,
        quantityReceived: safeQty,
        quantityOnHand: safeQty,
        costPricePerUnit: safeCost,
        salePricePerUnit: safeSalePrice,
        expiryDate: expiryDate ? new Date(expiryDate as string) : null,
        manufacturingDate: manufacturingDate ? new Date(manufacturingDate as string) : null,
        status: status ? String(status) : 'Active',
        companyId: companyId || null,
      },
      include: {
        product: true,
      },
    });

    // Log activity with Inv-Stock-Core module token
    await logUserActivity({
      action: 'CREATE',
      module: 'Inv-Stock-Core',
      recordId: batch.id,
      recordLabel: cleanBatchCode,
      userId,
      userName,
      details: JSON.stringify({
        batchCode: cleanBatchCode,
        productId: String(productId),
        quantityReceived: safeQty,
        costPricePerUnit: safeCost,
        godownId: godownId ? String(godownId) : null,
        companyId: companyId || null,
      }),
    });

    return NextResponse.json(batch, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating batch master:', error);
    const message = error instanceof Error ? error.message : 'Failed to create batch master';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
