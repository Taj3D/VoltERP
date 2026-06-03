// ============================================================
// Brands API — Multi-tenant CompanyId Isolation
// Module Token: Sys-Catalog-Core
// Phase 5: Case-insensitive unique checks, text sanitizer, batchMode
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

/**
 * sanitizeText - Trims whitespace, collapses multiple spaces, strips HTML tags.
 * Returns null if the string is empty after sanitization.
 */
function sanitizeText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  let text = String(value);
  // Strip HTML tags
  text = text.replace(/<[^>]*>/g, '');
  // Collapse double/triple spaces to single space
  text = text.replace(/\s{2,}/g, ' ');
  // Trim whitespace
  text = text.trim();
  return text || null;
}

// GET /api/brands — List all active brands filtered by companyId
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Brands', 'GET');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const items = await db.brand.findMany({
      where: { isActive: true, ...(companyId ? { companyId } : {}) },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { products: true } },
      },
    });

    return NextResponse.json(items);
  } catch (error) {
    console.error('Error fetching brands:', error);
    return NextResponse.json(
      { error: 'Failed to fetch brands' },
      { status: 500 }
    );
  }
}

// POST /api/brands — Create single or batch with companyId enforcement
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Brands', 'POST');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const body = await request.json();

    // ── Batch mode support ──
    if (body.batchMode === true && Array.isArray(body.data)) {
      const records = await db.$transaction(async (tx) => {
        const results = [];

        for (const item of body.data) {
          const sanitizedName = sanitizeText(item.name);
          const sanitizedDescription = sanitizeText(item.description);

          if (!sanitizedName) {
            throw new Error('DUPLICATE_NAME: Brand name cannot be empty after sanitization.');
          }

          // Case-insensitive unique check scoped by company (SQLite-compatible)
          const existingNames = await tx.brand.findMany({
            where: {
              companyId: companyId || null,
              isActive: true,
            },
            select: { id: true, name: true },
          });
          const existing = existingNames.find(e => e.name.toLowerCase() === sanitizedName.toLowerCase());

          if (existing) {
            throw new Error(
              `DUPLICATE_NAME: A brand with the name "${sanitizedName}" already exists in this company.`
            );
          }

          // Collision-safe code generation (findMany + Math.max)
          const allBrands = await tx.brand.findMany({ select: { code: true } });
          let maxNum = 0;
          for (const b of allBrands) {
            const match = b.code?.match(/BRN-(\d+)/);
            if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
          }
          const code = `BRN-${String(maxNum + 1 + results.length).padStart(5, '0')}`;

          const record = await tx.brand.create({
            data: {
              code,
              name: sanitizedName,
              description: sanitizedDescription,
              isActive: item.isActive ?? true,
              companyId: companyId || null,
            },
          });

          results.push(record);
        }

        return results;
      });

      // Single audit log entry for the batch
      await logUserActivity({
        action: 'CREATE',
        module: 'Sys-Catalog-Core',
        recordId: 'BATCH',
        recordLabel: `Batch import: ${records.length} brand(s)`,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          count: records.length,
          names: records.map((r: { name: string }) => r.name),
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
    const sanitizedDescription = sanitizeText(body.description);

    if (!sanitizedName) {
      return NextResponse.json(
        { error: 'Brand name cannot be empty after sanitization.' },
        { status: 400 }
      );
    }

    const item = await db.$transaction(async (tx) => {
      // Case-insensitive unique check scoped by company (SQLite-compatible)
      const existingNames = await tx.brand.findMany({
        where: {
          companyId: companyId || null,
          isActive: true,
        },
        select: { id: true, name: true },
      });
      const existing = existingNames.find(e => e.name.toLowerCase() === sanitizedName.toLowerCase());

      if (existing) {
        throw new Error(
          `DUPLICATE_NAME: A brand with the name "${sanitizedName}" already exists in this company.`
        );
      }

      // Collision-safe code generation (findMany + Math.max)
      const allBrands = await tx.brand.findMany({ select: { code: true } });
      let maxNum = 0;
      for (const b of allBrands) {
        const match = b.code?.match(/BRN-(\d+)/);
        if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
      }
      const code = `BRN-${String(maxNum + 1).padStart(5, '0')}`;

      const record = await tx.brand.create({
        data: {
          code,
          name: sanitizedName,
          description: sanitizedDescription,
          isActive: body.isActive ?? true,
          companyId: companyId || null,
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
          recordLabel: record.name || record.code,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({ code: record.code, name: record.name, companyId }),
        },
      });

      return record;
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('DUPLICATE_NAME')) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('Error creating brand:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create brand' },
      { status: 500 }
    );
  }
}
