import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  maskFinancialArray,
  maskForVatAuditor,
} from '@/lib/api-security';

// ─────────────────────────────────────────────────────────────
// GET /api/pos/sales — POS Sales History
// Lists PosSale records with pagination, filtering, and
// multi-tenant isolation. Includes lines, customer, and godown.
// ─────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'PosSale', 'GET');
  if (!security.authorized) return security.response;

  const role = security.user.role;
  const companyId = security.user.companyId;

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '50', 10);
    const status = searchParams.get('status');
    const customerId = searchParams.get('customerId');
    const godownId = searchParams.get('godownId');
    const fromDate = searchParams.get('fromDate');
    const toDate = searchParams.get('toDate');
    const search = searchParams.get('search');

    // Build where clause
    const where: Record<string, unknown> = {
      isActive: true,
      ...(companyId && { companyId }),
    };

    if (status) where.status = status;
    if (customerId) where.customerId = customerId;
    if (godownId) where.godownId = godownId;

    // Date range filter
    if (fromDate || toDate) {
      const dateFilter: Record<string, unknown> = {};
      if (fromDate) dateFilter.gte = new Date(fromDate);
      if (toDate) dateFilter.lte = new Date(toDate);
      where.date = dateFilter;
    }

    // Search by receiptNo or cashierName
    if (search) {
      where.OR = [
        { receiptNo: { contains: search } },
        { cashierName: { contains: search } },
      ];
    }

    // Count for pagination
    const total = await db.posSale.count({ where });

    // Fetch paginated results
    const posSales = await db.posSale.findMany({
      where,
      include: {
        lines: {
          include: {
            product: { select: { id: true, name: true, productCode: true, image: true } },
          },
        },
        customer: { select: { id: true, name: true, customerCode: true, phone: true } },
        godown: { select: { id: true, name: true } },
      },
      orderBy: { date: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    // Enrich with computed fields
    const enrichedSales = posSales.map((sale) => ({
      ...sale,
      customerName: sale.customer?.name || 'Walk-in Customer',
      customerPhone: sale.customer?.phone || '',
      godownName: sale.godown?.name || '',
      lineCount: sale.lines.length,
      totalItems: sale.lines.reduce((sum, l) => sum + l.quantity, 0),
    }));

    // VAT Auditor masking
    const maskedSales = maskFinancialArray(
      enrichedSales as Record<string, unknown>[],
      role,
      ['subTotal', 'discountAmount', 'vatAmount', 'grandTotal', 'cashAmount', 'cardAmount', 'mfsAmount', 'cashChange']
    ).map((sale) => {
      const typedSale = sale as Record<string, unknown>;
      // Also mask line-level financial fields
      if (Array.isArray(typedSale.lines)) {
        typedSale.lines = typedSale.lines.map((line: unknown) => {
          const typedLine = line as Record<string, unknown>;
          return maskForVatAuditor(
            typedLine,
            role,
            ['rate', 'discountPercent', 'discountAmount', 'total', 'costPrice']
          );
        });
      }
      return typedSale;
    });

    return NextResponse.json({
      data: maskedSales,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error('Error fetching POS sales:', error);
    return NextResponse.json(
      { error: 'Failed to fetch POS sales' },
      { status: 500 }
    );
  }
}
