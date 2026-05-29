// ============================================================
// INVENTORY AGING API — Age Bracket Calculation
// Group 5: Financial Auditing, Automated Ledgers & Data Integrity
// STAGE 13: companyId isolation, safeFinancial arithmetic,
//   Audit-Inventory-Aging token, maskDashboardForVatAuditor
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  safeFinancialRound,
  safeFinancialAdd,
  maskDashboardForVatAuditor,
  type UserRole,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// Age bracket definitions
const AGE_BRACKETS = [
  { label: '0-30 days', min: 0, max: 30 },
  { label: '31-60 days', min: 31, max: 60 },
  { label: '61-90 days', min: 61, max: 90 },
  { label: '91-180 days', min: 91, max: 180 },
  { label: '181-365 days', min: 181, max: 365 },
  { label: '365+ days', min: 366, max: Infinity },
];

// GET /api/inventory-aging
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'InventoryAging', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const userRole = security.user.role as UserRole;
    const companyId = security.user.companyId;
    const isVatAuditor = userRole === 'vat_auditor';

    // Log user activity with audit token
    await logUserActivity({
      action: 'EXPORT',
      module: 'Audit-Inventory-Aging',
      userId: security.user.id,
      userName: security.user.name,
      details: 'Inventory aging report accessed',
    });

    const asOfDate = searchParams.get('asOf')
      ? new Date(searchParams.get('asOf') + 'T23:59:59.999Z')
      : new Date();
    const godownId = searchParams.get('godownId');

    // Fetch all active products with stock > 0, filtered by companyId
    const productWhere: Record<string, unknown> = {
      isActive: true,
      openingStock: { gt: 0 },
      ...(companyId ? { companyId } : {}),
    };
    if (godownId) productWhere.godownId = godownId;

    const products = await db.product.findMany({
      where: productWhere,
      select: {
        id: true,
        productCode: true,
        name: true,
        openingStock: true,
        costPrice: true,
        salePrice: true,
        godownId: true,
        createdAt: true,
        category: { select: { name: true } },
        brand: { select: { name: true } },
      },
    });

    // For each product, find the earliest StockEntry with type="IN" to determine age
    const agedProducts = await Promise.all(
      products.map(async (product: any) => {
        let ageDays = 0;
        let earliestDate: Date | null = null;

        // Find earliest IN stock entry — productId already scoped by company-filtered product list
        const earliestEntry = await db.stockEntry.findFirst({
          where: {
            productId: product.id,
            type: 'IN',
            date: { lte: asOfDate },
          },
          orderBy: { date: 'asc' },
          select: { date: true },
        });

        if (earliestEntry) {
          earliestDate = earliestEntry.date;
          ageDays = Math.floor(
            (asOfDate.getTime() - new Date(earliestDate).getTime()) / (1000 * 60 * 60 * 24)
          );
        } else {
          // Fallback: use product creation date
          earliestDate = product.createdAt;
          ageDays = Math.floor(
            (asOfDate.getTime() - new Date(product.createdAt).getTime()) / (1000 * 60 * 60 * 24)
          );
        }

        // Safe financial calculation for totalValue
        const totalValue = safeFinancialRound(product.openingStock * product.costPrice);

        return {
          id: product.id,
          productCode: product.productCode,
          name: product.name,
          category: product.category?.name || 'N/A',
          brand: product.brand?.name || 'N/A',
          stock: product.openingStock,
          costPrice: product.costPrice,
          totalValue,
          ageDays,
          earliestEntryDate: earliestDate,
        };
      })
    );

    // Group into age brackets with safeFinancialAdd for aggregations
    const brackets = AGE_BRACKETS.map((bracket) => {
      const matching = agedProducts.filter(
        (p: any) => p.ageDays >= bracket.min && p.ageDays <= bracket.max
      );
      const count = matching.length;

      // Calculate totalValue using safeFinancialAdd reduce on original values
      const totalValue = matching.reduce(
        (sum: number, p: any) => safeFinancialAdd(sum, p.totalValue),
        0
      );

      return {
        label: bracket.label,
        count,
        totalValue,
        products: matching,
      };
    });

    // Summary — use safeFinancialAdd for grand total
    const totalProducts = agedProducts.length;
    const totalValue = products.reduce(
      (sum: number, p: any) => safeFinancialAdd(sum, safeFinancialRound(p.openingStock * p.costPrice)),
      0
    );
    const ages = agedProducts.map((p: any) => p.ageDays);
    const averageAge = ages.length > 0
      ? Math.round(ages.reduce((a: number, b: number) => a + b, 0) / ages.length)
      : 0;
    const oldestAge = ages.length > 0 ? Math.max(...ages) : 0;

    const responseData = {
      brackets,
      summary: {
        totalProducts,
        totalValue,
        averageAge,
        oldestAge,
        asOfDate: asOfDate.toISOString().split('T')[0],
      },
    };

    // Apply deep recursive VAT Auditor masking for the entire response
    const maskedResponse = maskDashboardForVatAuditor(
      responseData as Record<string, unknown>,
      userRole
    );

    return NextResponse.json(maskedResponse);
  } catch (error) {
    console.error('Inventory aging GET error:', error);
    return NextResponse.json({ error: 'Failed to calculate inventory aging' }, { status: 500 });
  }
}
