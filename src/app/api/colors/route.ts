// ============================================================
// Colors API — Multi-tenant CompanyId Isolation
// Module Token: Sys-Catalog-Core
// Phase 5: Boundary shields, case-insensitive unique checks
//          (name + colorCode), text sanitizer, batchMode support
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// ── Text Sanitizer ──
function sanitizeText(value: unknown): string {
  if (typeof value !== 'string') return '';
  let cleaned = value.trim();
  cleaned = cleaned.replace(/<[^>]*>/g, ''); // Strip HTML tags
  cleaned = cleaned.replace(/\s{2,}/g, ' '); // Collapse double/triple spaces
  return cleaned;
}

// ── Hex Color Code Validator ──
const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;
function isValidHexColor(code: string): boolean {
  return HEX_COLOR_REGEX.test(code);
}

// GET /api/colors — List all active colors filtered by companyId
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Colors', 'GET');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const items = await db.color.findMany({
      where: { isActive: true, ...(companyId ? { companyId } : {}) },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { products: true } },
      },
    });

    return NextResponse.json(items);
  } catch (error) {
    console.error('Error fetching colors:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch colors' },
      { status: 500 }
    );
  }
}

// POST /api/colors — Create single or batch with companyId enforcement
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Colors', 'POST');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId || null;

  try {
    const body = await request.json();

    // ── Batch mode support ──
    if (body.batchMode === true && Array.isArray(body.data)) {
      const records = await db.$transaction(async (tx) => {
        const created: any[] = [];

        for (const item of body.data) {
          const sanitizedName = sanitizeText(item.name);
          const sanitizedColorCode = sanitizeText(item.colorCode);

          if (!sanitizedName) {
            throw new Error('DUPLICATE_NAME: Color name cannot be empty after sanitization.');
          }

          if (!sanitizedColorCode) {
            throw new Error('VALIDATION_ERROR: Color code cannot be empty after sanitization.');
          }

          if (!isValidHexColor(sanitizedColorCode)) {
            throw new Error('VALIDATION_ERROR: Color code must be a valid 6-digit hex code (e.g., #FF5500).');
          }

          // Case-insensitive unique check for name scoped by company (SQLite-compatible)
          const existingNames = await tx.color.findMany({
            where: {
              companyId: companyId || null,
              isActive: true,
            },
            select: { id: true, name: true, colorCode: true },
          });
          const existingName = existingNames.find(e => e.name.toLowerCase() === sanitizedName.toLowerCase());

          if (existingName) {
            throw new Error(`DUPLICATE_NAME: A color with the name "${sanitizedName}" already exists in this company.`);
          }

          // Case-insensitive unique check for colorCode scoped by company (SQLite-compatible)
          const existingCode = existingNames.find(e => e.colorCode.toLowerCase() === sanitizedColorCode.toLowerCase());

          if (existingCode) {
            throw new Error(`DUPLICATE_CODE: A color with the color code "${sanitizedColorCode}" already exists in this company.`);
          }

          const record = await tx.color.create({
            data: {
              name: sanitizedName,
              colorCode: sanitizedColorCode,
              isActive: item.isActive ?? true,
              companyId,
            },
          });

          created.push(record);
        }

        return created;
      });

      // Single audit log entry for the batch
      await logUserActivity({
        action: 'CREATE',
        module: 'Sys-Catalog-Core',
        recordId: 'BATCH',
        recordLabel: `Batch import: ${records.length} color(s)`,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          count: records.length,
          names: records.map((r: any) => r.name),
          companyId,
        }),
      });

      return NextResponse.json(
        { success: true, count: records.length, data: records },
        { status: 201 }
      );
    }

    // ── Single record creation ──
    const sanitizedName = sanitizeText(body.name);
    const sanitizedColorCode = sanitizeText(body.colorCode);

    if (!sanitizedName) {
      return NextResponse.json(
        { error: 'Color name cannot be empty after sanitization.' },
        { status: 400 }
      );
    }

    if (!sanitizedColorCode) {
      return NextResponse.json(
        { error: 'Color code cannot be empty after sanitization.' },
        { status: 400 }
      );
    }

    if (!isValidHexColor(sanitizedColorCode)) {
      return NextResponse.json(
        { error: 'Color code must be a valid 6-digit hex code (e.g., #FF5500).' },
        { status: 400 }
      );
    }

    const item = await db.$transaction(async (tx) => {
      // Case-insensitive unique check for name & colorCode scoped by company (SQLite-compatible)
      const existingColors = await tx.color.findMany({
        where: {
          companyId: companyId || null,
          isActive: true,
        },
        select: { id: true, name: true, colorCode: true },
      });
      const existingName = existingColors.find(e => e.name.toLowerCase() === sanitizedName.toLowerCase());

      if (existingName) {
        throw new Error(`DUPLICATE_NAME: A color with the name "${sanitizedName}" already exists in this company.`);
      }

      const existingCode = existingColors.find(e => e.colorCode.toLowerCase() === sanitizedColorCode.toLowerCase());

      if (existingCode) {
        throw new Error(`DUPLICATE_CODE: A color with the color code "${sanitizedColorCode}" already exists in this company.`);
      }

      const record = await tx.color.create({
        data: {
          name: sanitizedName,
          colorCode: sanitizedColorCode,
          isActive: body.isActive ?? true,
          companyId,
        },
        include: {
          _count: { select: { products: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'Sys-Catalog-Core',
          recordId: record.id,
          recordLabel: record.name || record.id,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({ name: record.name, colorCode: record.colorCode, companyId }),
        },
      });

      return record;
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.startsWith('DUPLICATE_NAME')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      if (error.message.startsWith('DUPLICATE_CODE')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      if (error.message.startsWith('VALIDATION_ERROR')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    console.error('Error creating color:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create color' },
      { status: 500 }
    );
  }
}
