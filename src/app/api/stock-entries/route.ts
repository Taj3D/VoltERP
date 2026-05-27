import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity, checkPeriodClose } from '@/lib/api-security';

// GET /api/stock-entries - List all stock entries with filters
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'StockEntries', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const productId = searchParams.get('productId');
    const godownId = searchParams.get('godownId');
    const referenceType = searchParams.get('referenceType');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    if (productId) where.productId = productId;
    if (godownId) where.godownId = godownId;
    if (referenceType) where.referenceType = referenceType;

    const [entries, total] = await Promise.all([
      db.stockEntry.findMany({
        where,
        include: {
          product: { select: { id: true, name: true, productCode: true } },
        },
        orderBy: { date: 'desc' },
        take: limit,
        skip: offset,
      }),
      db.stockEntry.count({ where }),
    ]);

    return NextResponse.json({ data: entries, total, limit, offset });
  } catch (error) {
    console.error('Error fetching stock entries:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stock entries' },
      { status: 500 }
    );
  }
}

// POST /api/stock-entries - Create a stock entry
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'StockEntries', 'POST');
  if (!security.authorized) return security.response;
  try {
    const body = await request.json();
    const { productId, godownId, type, quantity, reference, referenceType, date } = body;

    if (!productId || !type || !quantity || !date) {
      return NextResponse.json(
        { error: 'productId, type, quantity, and date are required' },
        { status: 400 }
      );
    }

    if (!['IN', 'OUT', 'TRANSFER'].includes(type)) {
      return NextResponse.json(
        { error: 'Type must be IN, OUT, or TRANSFER' },
        { status: 400 }
      );
    }

    // Period close check
    const periodLock = await checkPeriodClose(new Date(date));
    if (periodLock) return periodLock;

    // Negative stock prevention: check current stock before OUT
    if (type === 'OUT') {
      const qty = Number(quantity);
      const inTotal = await db.stockEntry.aggregate({
        where: { productId, type: 'IN', isActive: true },
        _sum: { quantity: true },
      });
      const outTotal = await db.stockEntry.aggregate({
        where: { productId, type: 'OUT', isActive: true },
        _sum: { quantity: true },
      });
      const currentStock = (inTotal._sum.quantity || 0) - (outTotal._sum.quantity || 0);
      if (currentStock - qty < 0) {
        return NextResponse.json(
          { error: `Insufficient stock. Current: ${currentStock}, Requested: ${qty}. Stock cannot go below 0.` },
          { status: 400 }
        );
      }
    }

    const entry = await db.stockEntry.create({
      data: {
        productId,
        godownId: godownId || null,
        type,
        quantity: Number(quantity),
        reference: reference || null,
        referenceType: referenceType || null,
        date: new Date(date),
      },
      include: {
        product: { select: { id: true, name: true, productCode: true } },
      },
    });

    // Audit log
    await db.auditLog.create({
      data: {
        action: 'CREATE',
        module: 'StockEntries',
        recordId: entry.id,
        recordLabel: `${entry.type}-${entry.productId}`,
        userId: security.user?.id || 'system',
        userName: security.user?.name || 'System',
        details: JSON.stringify({ productId, type, quantity, reference, referenceType, date }),
      },
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error('Error creating stock entry:', error);
    return NextResponse.json(
      { error: 'Failed to create stock entry' },
      { status: 500 }
    );
  }
}
