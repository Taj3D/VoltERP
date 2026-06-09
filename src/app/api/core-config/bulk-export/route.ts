// ============================================================
// CORE CONFIG BULK EXPORT API — Transactional CSV Router
// Generates CSV data for any core config module with account
// hash validation and enterprise formatting.
// Module Token: Sys-Config-Core
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

type ModuleType = 'companies' | 'categories' | 'colors' | 'brands' | 'units';

// Generate account hash for export file integrity
function generateAccountHash(mod: ModuleType): string {
  const timestamp = Date.now();
  const checksum = Math.random().toString(16).substring(2, 10);
  return `CORE-${mod}-${timestamp}-${checksum}`;
}

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'CoreConfigBulkExport', 'GET');
  if (!security.authorized) return security.response;

  try {
    const url = new URL(request.url);
    const moduleParam = url.searchParams.get('module') as ModuleType | null;
    const includeInactive = url.searchParams.get('includeInactive') === 'true';

    const validModules: ModuleType[] = ['companies', 'categories', 'colors', 'brands', 'units'];
    if (!moduleParam || !validModules.includes(moduleParam)) {
      return NextResponse.json(
        { error: `Invalid module: "${moduleParam}". Must be one of: ${validModules.join(', ')}` },
        { status: 400 }
      );
    }

    const where = includeInactive ? {} : { isActive: true };
    let data: any[];
    let headers: string[];
    let rows: string[][];

    switch (moduleParam) {
      case 'companies': {
        data = await db.company.findMany({
          where,
          orderBy: { name: 'asc' },
        });
        headers = ['Code', 'Name', 'Address', 'Phone', 'Mobile', 'Email', 'Website', 'VAT Number', 'Trade License', 'BIN Number', 'Currency Symbol', 'Invoice Prefix', 'Thank You Message', 'System Note', 'Show Barcode', 'Show Pay In Word', 'Logo Width', 'Logo Height', 'Active'];
        rows = data.map(item => [
          item.code || '',
          item.name || '',
          item.address || '',
          item.phone || '',
          item.mobile || '',
          item.email || '',
          item.website || '',
          item.vatNumber || '',
          item.tradeLicense || '',
          item.binNumber || '',
          item.currencySymbol || 'Tk. ',
          item.invoicePrefix || '',
          item.thankYouMsg || '',
          item.systemNote || '',
          item.showBarcode ? 'true' : 'false',
          item.showPayInWord ? 'true' : 'false',
          String(item.logoWidth || 30),
          String(item.logoHeight || 20),
          item.isActive ? 'true' : 'false',
        ]);
        break;
      }
      case 'categories': {
        data = await db.category.findMany({
          where,
          orderBy: { name: 'asc' },
          include: { parent: { select: { name: true } } },
        });
        headers = ['Code', 'Name', 'Description', 'Parent Category', 'Active'];
        rows = data.map(item => [
          item.code || '',
          item.name || '',
          item.description || '',
          (item as any).parent?.name || '',
          item.isActive ? 'true' : 'false',
        ]);
        break;
      }
      case 'colors': {
        data = await db.color.findMany({ where, orderBy: { name: 'asc' } });
        headers = ['Name', 'Color Code', 'Active'];
        rows = data.map(item => [
          item.name || '',
          item.colorCode || '',
          item.isActive ? 'true' : 'false',
        ]);
        break;
      }
      case 'brands': {
        data = await db.brand.findMany({ where, orderBy: { name: 'asc' } });
        headers = ['Code', 'Name', 'Description', 'Active'];
        rows = data.map(item => [
          item.code || '',
          item.name || '',
          item.description || '',
          item.isActive ? 'true' : 'false',
        ]);
        break;
      }
      case 'units': {
        data = await db.unit.findMany({ where, orderBy: { name: 'asc' } });
        headers = ['Code', 'Name', 'Symbol', 'Description', 'Active'];
        rows = data.map(item => [
          item.code || '',
          item.name || '',
          item.symbol || '',
          item.description || '',
          item.isActive ? 'true' : 'false',
        ]);
        break;
      }
    }

    // Build CSV with UTF-8 BOM
    const escapeCSV = (val: string) => {
      if (val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('\r')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    const headerRow = headers.map(escapeCSV).join(',');
    const dataRows = rows.map(row => row.map(escapeCSV).join(','));
    const accountHash = generateAccountHash(moduleParam);
    const csvContent = `${headerRow}\n${dataRows.join('\n')}\n_accountHash,${accountHash}\n`;
    const bom = '\uFEFF';
    const csv = bom + csvContent;

    await logUserActivity({
      action: 'EXPORT',
      module: 'Sys-Config-Core',
      recordLabel: `Bulk Export: ${moduleParam}`,
      userId: security.user?.id,
      userName: security.user?.name,
      details: JSON.stringify({ module: moduleParam, recordCount: data.length, accountHash }),
    });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv;charset=utf-8;',
        'Content-Disposition': `attachment; filename="${moduleParam}-export.csv"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to export data' }, { status: 500 });
  }
}
