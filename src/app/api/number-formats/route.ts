// ============================================================
// NUMBER FORMATS API — CRUD + Auto-Seed + Sequence Validation
// Group 6: Core Performance Configurations & System Settings
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, type UserRole, stripHtml } from '@/lib/api-security';

// Inline code generator for NF-XXXXX
async function generateFormatCode(): Promise<string> {
  const latest = await db.numberFormat.findFirst({
    where: { code: { startsWith: 'NF-' } },
    orderBy: { code: 'desc' },
    select: { code: true },
  });
  if (!latest) return 'NF-00001';
  const num = parseInt(latest.code.replace('NF-', ''), 10) || 0;
  return `NF-${String(num + 1).padStart(5, '0')}`;
}

// Default number formats to seed on first GET if table is empty
const DEFAULT_FORMATS = [
  { moduleKey: 'purchase_order', prefix: 'PUR-', paddingLength: 5, nextSequence: 1, resetYearly: false },
  { moduleKey: 'sales_order', prefix: 'SO-', paddingLength: 5, nextSequence: 1, resetYearly: false },
  { moduleKey: 'hire_sales', prefix: 'HIR-', paddingLength: 5, nextSequence: 1, resetYearly: false },
  { moduleKey: 'sales_return', prefix: 'SRT-', paddingLength: 5, nextSequence: 1, resetYearly: false },
  { moduleKey: 'purchase_return', prefix: 'PRT-', paddingLength: 5, nextSequence: 1, resetYearly: false },
  { moduleKey: 'replacement', prefix: 'RPL-', paddingLength: 5, nextSequence: 1, resetYearly: false },
  { moduleKey: 'transfer', prefix: 'TRF-', paddingLength: 5, nextSequence: 1, resetYearly: false },
  { moduleKey: 'expense', prefix: 'EXP-', paddingLength: 5, nextSequence: 1, resetYearly: false },
  { moduleKey: 'income', prefix: 'INC-', paddingLength: 5, nextSequence: 1, resetYearly: false },
  { moduleKey: 'cash_collection', prefix: 'CC-', paddingLength: 5, nextSequence: 1, resetYearly: false },
  { moduleKey: 'cash_delivery', prefix: 'CD-', paddingLength: 5, nextSequence: 1, resetYearly: false },
  { moduleKey: 'bank_transaction', prefix: 'BT-', paddingLength: 5, nextSequence: 1, resetYearly: false },
  { moduleKey: 'ledger_entry', prefix: 'LED-', paddingLength: 5, nextSequence: 1, resetYearly: false },
  { moduleKey: 'journal_entry', prefix: 'JRN-', paddingLength: 5, nextSequence: 1, resetYearly: false },
  { moduleKey: 'order_sheet', prefix: 'OS-', paddingLength: 5, nextSequence: 1, resetYearly: false },
  { moduleKey: 'notification', prefix: 'NOT-', paddingLength: 5, nextSequence: 1, resetYearly: false },
  { moduleKey: 'serial_tracking', prefix: 'SRL-', paddingLength: 5, nextSequence: 1, resetYearly: false },
  { moduleKey: 'data_integrity', prefix: 'DIL-', paddingLength: 5, nextSequence: 1, resetYearly: false },
  { moduleKey: 'ledger_auto_post', prefix: 'LAP-', paddingLength: 5, nextSequence: 1, resetYearly: false },
];

// Seed default formats if table is empty
async function seedDefaults() {
  const count = await db.numberFormat.count();
  if (count === 0) {
    for (const fmt of DEFAULT_FORMATS) {
      const code = await generateFormatCode();
      await db.numberFormat.create({
        data: { code, ...fmt },
      });
    }
  }
}

// GET /api/number-formats — List all number formats with optional moduleKey filter
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'NumberFormats', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);

    // Seed defaults if table is empty
    await seedDefaults();

    // Build filter
    const where: Record<string, unknown> = {};
    const moduleKey = searchParams.get('moduleKey');
    if (moduleKey) where.moduleKey = moduleKey;

    const formats = await db.numberFormat.findMany({
      where,
      orderBy: { moduleKey: 'asc' },
    });

    return NextResponse.json({ formats, total: formats.length });
  } catch (error) {
    console.error('NumberFormats GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch number formats' }, { status: 500 });
  }
}

// POST /api/number-formats — Create format with auto-generated NF-XXXXX code
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'NumberFormats', 'POST');
  if (!security.authorized) return security.response;

  try {
    const body = await request.json();
    const { moduleKey, prefix, paddingLength, nextSequence, resetYearly, separator, dateFormat, isActive } = body;

    if (!moduleKey || !prefix) {
      return NextResponse.json(
        { error: 'Missing required fields: moduleKey, prefix' },
        { status: 400 }
      );
    }

    // Validate prefix format: only alphanumeric, dash, slash, and underscore allowed
    if (!/^[A-Za-z0-9\-_\/]+$/.test(prefix)) {
      return NextResponse.json(
        { error: 'Prefix must only contain alphanumeric characters, dashes, slashes, and underscores.' },
        { status: 400 }
      );
    }

    // Validate prefix length
    if (prefix.length < 1 || prefix.length > 10) {
      return NextResponse.json(
        { error: 'Prefix must be between 1 and 10 characters long.' },
        { status: 400 }
      );
    }

    // Sanitize text fields to prevent XSS
    const sanitizedModuleKey = stripHtml(moduleKey).replace(/\s+/g, '_').toLowerCase();
    const sanitizedPrefix = stripHtml(prefix);

    // Check for duplicate moduleKey
    const existing = await db.numberFormat.findUnique({ where: { moduleKey: sanitizedModuleKey } });
    if (existing) {
      return NextResponse.json(
        { error: `Number format for module "${sanitizedModuleKey}" already exists.` },
        { status: 409 }
      );
    }

    const code = await generateFormatCode();

    const format = await db.numberFormat.create({
      data: {
        code,
        moduleKey: sanitizedModuleKey,
        prefix: sanitizedPrefix,
        paddingLength: paddingLength || 5,
        nextSequence: nextSequence || 1,
        resetYearly: resetYearly || false,
        separator: separator || null,
        dateFormat: dateFormat || null,
        isActive: isActive !== undefined ? isActive : true,
      },
    });

    // Audit log
    await db.auditLog.create({
      data: {
        action: 'CREATE',
        module: 'NumberFormats',
        recordId: format.id,
        recordLabel: format.code,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({ moduleKey: sanitizedModuleKey, prefix: sanitizedPrefix, code }),
      },
    });

    return NextResponse.json({ format }, { status: 201 });
  } catch (error) {
    console.error('NumberFormats POST error:', error);
    return NextResponse.json({ error: 'Failed to create number format' }, { status: 500 });
  }
}

// PUT /api/number-formats — Update format by id
// Important: nextSequence can only be INCREASED, never decreased
export async function PUT(request: NextRequest) {
  const security = await withApiSecurity(request, 'NumberFormats', 'PUT');
  if (!security.authorized) return security.response;

  try {
    const body = await request.json();
    const { id, moduleKey, prefix, paddingLength, nextSequence, resetYearly, separator, dateFormat, isActive } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Missing required field: id' },
        { status: 400 }
      );
    }

    // Validate prefix format if being updated
    if (prefix !== undefined && !/^[A-Za-z0-9\-_\/]+$/.test(prefix)) {
      return NextResponse.json(
        { error: 'Prefix must only contain alphanumeric characters, dashes, slashes, and underscores.' },
        { status: 400 }
      );
    }

    // Validate prefix length if being updated
    if (prefix !== undefined && (prefix.length < 1 || prefix.length > 10)) {
      return NextResponse.json(
        { error: 'Prefix must be between 1 and 10 characters long.' },
        { status: 400 }
      );
    }

    const existing = await db.numberFormat.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Number format not found.' },
        { status: 404 }
      );
    }

    // Critical: nextSequence can only be increased, never decreased
    if (nextSequence !== undefined && nextSequence < existing.nextSequence) {
      return NextResponse.json(
        { error: `nextSequence can only be increased. Current value: ${existing.nextSequence}, attempted: ${nextSequence}` },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (prefix !== undefined) updateData.prefix = stripHtml(prefix);
    if (paddingLength !== undefined) updateData.paddingLength = paddingLength;
    if (nextSequence !== undefined) updateData.nextSequence = nextSequence;
    if (resetYearly !== undefined) updateData.resetYearly = resetYearly;
    if (separator !== undefined) updateData.separator = separator ? stripHtml(separator) : null;
    if (dateFormat !== undefined) updateData.dateFormat = dateFormat ? stripHtml(dateFormat) : null;
    if (isActive !== undefined) updateData.isActive = isActive;
    // moduleKey is unique but can be updated if not conflicting
    if (moduleKey !== undefined && moduleKey !== existing.moduleKey) {
      const sanitizedKey = stripHtml(moduleKey).replace(/\s+/g, '_').toLowerCase();
      const duplicate = await db.numberFormat.findUnique({ where: { moduleKey: sanitizedKey } });
      if (duplicate) {
        return NextResponse.json(
          { error: `Number format for module "${sanitizedKey}" already exists.` },
          { status: 409 }
        );
      }
      updateData.moduleKey = sanitizedKey;
    }

    const format = await db.numberFormat.update({
      where: { id },
      data: updateData,
    });

    // Audit log
    await db.auditLog.create({
      data: {
        action: 'UPDATE',
        module: 'NumberFormats',
        recordId: format.id,
        recordLabel: format.code,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({ changes: updateData, previousSequence: existing.nextSequence }),
      },
    });

    return NextResponse.json({ format });
  } catch (error) {
    console.error('NumberFormats PUT error:', error);
    return NextResponse.json({ error: 'Failed to update number format' }, { status: 500 });
  }
}

// DELETE /api/number-formats — Delete by id (Admin only)
export async function DELETE(request: NextRequest) {
  const security = await withApiSecurity(request, 'NumberFormats', 'DELETE');
  if (!security.authorized) return security.response;

  try {
    const userRole = security.user.role as UserRole;

    // Admin only
    if (userRole !== 'admin') {
      return NextResponse.json(
        { error: 'Access denied. Only administrators can delete number formats.' },
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

    const existing = await db.numberFormat.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Number format not found.' },
        { status: 404 }
      );
    }

    await db.numberFormat.delete({ where: { id } });

    // Audit log
    await db.auditLog.create({
      data: {
        action: 'DELETE',
        module: 'NumberFormats',
        recordId: existing.id,
        recordLabel: existing.code,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({ moduleKey: existing.moduleKey, prefix: existing.prefix }),
      },
    });

    return NextResponse.json({ success: true, deleted: existing.code });
  } catch (error) {
    console.error('NumberFormats DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete number format' }, { status: 500 });
  }
}
