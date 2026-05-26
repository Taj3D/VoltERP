// ============================================================
// SYSTEM CONFIG API — CRUD + Auto-Seed
// Group 6: Core Performance Configurations & System Settings
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, type UserRole } from '@/lib/api-security';

// Keys that are sensitive — VAT Auditor must NOT see their values
const PROFIT_SENSITIVE_KEYS = ['profit', 'margin', 'writeoff'];

function isProfitSensitive(key: string): boolean {
  return PROFIT_SENSITIVE_KEYS.some((s) => key.toLowerCase().includes(s));
}

// Default system configs to seed on first GET
const DEFAULT_CONFIGS = [
  { configKey: 'company_name', configValue: 'Electronics Mart', configType: 'string', category: 'Branding', description: 'Company display name' },
  { configKey: 'default_vat_rate', configValue: '15', configType: 'number', category: 'Tax', description: 'Default VAT percentage' },
  { configKey: 'currency_symbol', configValue: '৳', configType: 'string', category: 'Currency', description: 'Currency symbol for display' },
  { configKey: 'currency_code', configValue: 'BDT', configType: 'string', category: 'Currency', description: 'ISO currency code' },
  { configKey: 'currency_decimal_places', configValue: '2', configType: 'number', category: 'Currency', description: 'Decimal places for currency formatting' },
  { configKey: 'date_format', configValue: 'DD/MM/YYYY', configType: 'string', category: 'General', description: 'Default date format' },
  { configKey: 'printer_paper_size', configValue: 'A4', configType: 'string', category: 'Printer', description: 'Default printer paper size' },
  { configKey: 'printer_orientation', configValue: 'Portrait', configType: 'string', category: 'Printer', description: 'Default printer orientation' },
  { configKey: 'company_logo_url', configValue: '', configType: 'string', category: 'Branding', description: 'Company logo URL' },
  { configKey: 'company_address', configValue: '', configType: 'string', category: 'Branding', description: 'Company address' },
  { configKey: 'company_phone', configValue: '', configType: 'string', category: 'Branding', description: 'Company phone number' },
  { configKey: 'company_email', configValue: '', configType: 'string', category: 'Branding', description: 'Company email address' },
  { configKey: 'fiscal_year_start', configValue: 'July', configType: 'string', category: 'General', description: 'Fiscal year start month' },
  { configKey: 'low_stock_threshold', configValue: '5', configType: 'number', category: 'General', description: 'Default low stock alert threshold' },
  { configKey: 'auto_ledger_posting', configValue: 'true', configType: 'boolean', category: 'General', description: 'Enable automatic ledger posting' },
  { configKey: 'auto_po_enabled', configValue: 'true', configType: 'boolean', category: 'General', description: 'Enable automatic purchase order generation' },
];

// Seed default configs if table is empty
async function seedDefaults() {
  const count = await db.systemConfig.count();
  if (count === 0) {
    await db.systemConfig.createMany({ data: DEFAULT_CONFIGS });
  }
}

// GET /api/system-config — List all system configs
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'SystemConfig', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const userRole = security.user.role as UserRole;
    const isVatAuditor = userRole === 'vat_auditor';

    // Seed defaults if table is empty
    await seedDefaults();

    // Build filter
    const where: Record<string, unknown> = {};
    const category = searchParams.get('category');
    if (category) where.category = category;

    const configs = await db.systemConfig.findMany({
      where,
      orderBy: [{ category: 'asc' }, { configKey: 'asc' }],
    });

    // VAT Auditor: mask configKey values containing "profit", "margin", "writeoff"
    const masked = configs.map((c: any) => {
      if (isVatAuditor && isProfitSensitive(c.configKey)) {
        return { ...c, configValue: 'N/A (Audit Mode)', description: 'N/A (Audit Mode)' };
      }
      return c;
    });

    return NextResponse.json({ configs: masked, total: masked.length });
  } catch (error) {
    console.error('SystemConfig GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch system configs' }, { status: 500 });
  }
}

// POST /api/system-config — Create new config
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'SystemConfig', 'POST');
  if (!security.authorized) return security.response;

  try {
    const body = await request.json();
    const { configKey, configValue, configType, category, description, isActive } = body;

    if (!configKey || configValue === undefined || configValue === null) {
      return NextResponse.json(
        { error: 'Missing required fields: configKey, configValue' },
        { status: 400 }
      );
    }

    // Check for duplicate key
    const existing = await db.systemConfig.findUnique({ where: { configKey } });
    if (existing) {
      return NextResponse.json(
        { error: `Config key "${configKey}" already exists. Use PUT to update.` },
        { status: 409 }
      );
    }

    const config = await db.systemConfig.create({
      data: {
        configKey,
        configValue: String(configValue),
        configType: configType || 'string',
        category: category || 'General',
        description: description || null,
        isActive: isActive !== undefined ? isActive : true,
      },
    });

    // Audit log
    await db.auditLog.create({
      data: {
        action: 'CREATE',
        module: 'SystemConfig',
        recordId: config.id,
        recordLabel: config.configKey,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({ configKey, configValue, category }),
      },
    });

    return NextResponse.json({ config }, { status: 201 });
  } catch (error) {
    console.error('SystemConfig POST error:', error);
    return NextResponse.json({ error: 'Failed to create system config' }, { status: 500 });
  }
}

// PUT /api/system-config — Update config by configKey (passed as query param)
export async function PUT(request: NextRequest) {
  const security = await withApiSecurity(request, 'SystemConfig', 'PUT');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const configKey = searchParams.get('configKey');

    if (!configKey) {
      return NextResponse.json(
        { error: 'Missing required query param: configKey' },
        { status: 400 }
      );
    }

    const existing = await db.systemConfig.findUnique({ where: { configKey } });
    if (!existing) {
      return NextResponse.json(
        { error: `Config key "${configKey}" not found.` },
        { status: 404 }
      );
    }

    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    if (body.configValue !== undefined) updateData.configValue = String(body.configValue);
    if (body.configType !== undefined) updateData.configType = body.configType;
    if (body.category !== undefined) updateData.category = body.category;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;

    const config = await db.systemConfig.update({
      where: { configKey },
      data: updateData,
    });

    // Audit log
    await db.auditLog.create({
      data: {
        action: 'UPDATE',
        module: 'SystemConfig',
        recordId: config.id,
        recordLabel: config.configKey,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({ configKey, changes: updateData, previousValue: existing.configValue }),
      },
    });

    return NextResponse.json({ config });
  } catch (error) {
    console.error('SystemConfig PUT error:', error);
    return NextResponse.json({ error: 'Failed to update system config' }, { status: 500 });
  }
}

// DELETE /api/system-config — Delete config by id (Admin only)
export async function DELETE(request: NextRequest) {
  const security = await withApiSecurity(request, 'SystemConfig', 'DELETE');
  if (!security.authorized) return security.response;

  try {
    const userRole = security.user.role as UserRole;

    // Admin only
    if (userRole !== 'admin') {
      return NextResponse.json(
        { error: 'Access denied. Only administrators can delete system configurations.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Missing required query param: id' },
        { status: 400 }
      );
    }

    const existing = await db.systemConfig.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'System config not found.' },
        { status: 404 }
      );
    }

    await db.systemConfig.delete({ where: { id } });

    // Audit log
    await db.auditLog.create({
      data: {
        action: 'DELETE',
        module: 'SystemConfig',
        recordId: existing.id,
        recordLabel: existing.configKey,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({ configKey: existing.configKey, configValue: existing.configValue, category: existing.category }),
      },
    });

    return NextResponse.json({ success: true, deleted: existing.configKey });
  } catch (error) {
    console.error('SystemConfig DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete system config' }, { status: 500 });
  }
}
