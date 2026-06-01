// ============================================================
// CORE CONFIG DROPDOWNS API — Dynamic Dropdown Population
// Returns all categories, colors, brands, and units as
// lightweight dropdown options for operational forms.
// When admin changes core configs, consuming forms auto-refresh
// their dropdown selections on next fetch.
// Module Token: Sys-Config-Core
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'CoreConfigDropdowns', 'GET');
  if (!security.authorized) return security.response;
  try {
    const [categories, colors, brands, units, companies] = await Promise.all([
      db.category.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, code: true, name: true, parentCategoryId: true },
      }),
      db.color.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, colorCode: true },
      }),
      db.brand.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, code: true, name: true },
      }),
      db.unit.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, code: true, name: true, symbol: true },
      }),
      db.company.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, code: true, name: true },
      }),
    ]);

    // Build category hierarchy for tree-style dropdowns
    const categoryTree = categories.map(cat => ({
      ...cat,
      parentName: categories.find(p => p.id === cat.parentCategoryId)?.name || null,
    }));

    return NextResponse.json({
      categories: categoryTree,
      colors,
      brands,
      units,
      companies,
      _meta: {
        totalCategories: categories.length,
        totalColors: colors.length,
        totalBrands: brands.length,
        totalUnits: units.length,
        totalCompanies: companies.length,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch dropdown options' }, { status: 500 });
  }
}
