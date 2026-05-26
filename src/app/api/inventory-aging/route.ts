// ============================================================
// INVENTORY AGING API — Age Bracket Calculation
// Group 5: Financial Auditing, Automated Ledgers & Data Integrity
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, type UserRole } from '@/lib/api-security';

// Use 'Stock' module → maps to 'inventory' group, accessible by SR, Dealer, VAT Auditor

function maskForVat(value: any, isVatAuditor: boolean): any {
  if (!isVatAuditor) return value;
  return 'N/A (Audit Mode)';
}

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
  const security = await withApiSecurity(request, 'Stock', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const userRole = security.user.role as UserRole;
    const isVatAuditor = userRole === 'vat_auditor';

    const asOfDate = searchParams.get('asOf')
      ? new Date(searchParams.get('asOf') + 'T23:59:59.999Z')
      : new Date();
    const godownId = searchParams.get('godownId');

    // Fetch all active products with stock > 0
    const productWhere: Record<string, unknown> = {
      isActive: true,
      openingStock: { gt: 0 },
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

        // Find earliest IN stock entry
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

        const totalValue = product.openingStock * product.costPrice;

        return {
          id: product.id,
          productCode: product.productCode,
          name: product.name,
          category: product.category?.name || 'N/A',
          brand: product.brand?.name || 'N/A',
          stock: product.openingStock,
          costPrice: isVatAuditor ? maskForVat(product.costPrice, true) : product.costPrice,
          totalValue: isVatAuditor ? maskForVat(totalValue, true) : totalValue,
          ageDays,
          earliestEntryDate: earliestDate,
        };
      })
    );

    // Group into age brackets
    const brackets = AGE_BRACKETS.map((bracket) => {
      const matching = agedProducts.filter(
        (p: any) => p.ageDays >= bracket.min && p.ageDays <= bracket.max
      );
      const count = matching.length;

      // Calculate totalValue using original (unmasked) data
      const totalValue = isVatAuditor
        ? 'N/A (Audit Mode)' as any
        : matching.reduce((sum: number, p: any) => {
            const original = products.find((pr: any) => pr.id === p.id);
            return sum + (original ? original.openingStock * original.costPrice : 0);
          }, 0);

      return {
        label: bracket.label,
        count,
        totalValue,
        products: matching,
      };
    });

    // Summary
    const totalProducts = agedProducts.length;
    const totalValue = isVatAuditor
      ? 'N/A (Audit Mode)' as any
      : products.reduce((sum: number, p: any) => sum + p.openingStock * p.costPrice, 0);
    const ages = agedProducts.map((p: any) => p.ageDays);
    const averageAge = ages.length > 0
      ? Math.round(ages.reduce((a: number, b: number) => a + b, 0) / ages.length)
      : 0;
    const oldestAge = ages.length > 0 ? Math.max(...ages) : 0;

    return NextResponse.json({
      brackets,
      summary: {
        totalProducts,
        totalValue,
        averageAge,
        oldestAge,
        asOfDate: asOfDate.toISOString().split('T')[0],
      },
    });
  } catch (error) {
    console.error('Inventory aging GET error:', error);
    return NextResponse.json({ error: 'Failed to calculate inventory aging' }, { status: 500 });
  }
}
