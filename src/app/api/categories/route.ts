// ============================================================
// Categories API — Multi-tenant CompanyId Isolation
// Module Token: Sys-Catalog-Core
// Phase 5: Boundary shields, case-insensitive unique checks,
//          text sanitizer, batchMode support
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';
import { getCached, setCached, invalidateByPrefix } from '@/lib/server-cache';

// ── Text Sanitizer ──
function sanitizeText(value: unknown): string {
  if (typeof value !== 'string') return '';
  let cleaned = value.trim();
  cleaned = cleaned.replace(/<[^>]*>/g, ''); // Strip HTML tags
  cleaned = cleaned.replace(/\s{2,}/g, ' '); // Collapse double/triple spaces
  return cleaned;
}

// ── Name Length Limit ──
const CATEGORY_NAME_MAX_LENGTH = 100;

// GET /api/categories — List all active categories filtered by companyId.
// PERFORMANCE: Cached server-side for 120s (categories change rarely).
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Categories', 'GET');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;
  const cacheKey = `categories:${companyId || 'default'}`;

  try {
    const cached = getCached<unknown>(cacheKey);
    if (cached) {
      return NextResponse.json(cached, {
        headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=120' },
      });
    }

    const items = await db.category.findMany({
      where: { isActive: true, ...(companyId ? { companyId } : {}) },
      orderBy: { createdAt: 'desc' },
      include: {
        parent: { select: { id: true, name: true, code: true } },
        children: { select: { id: true, name: true, code: true } },
        _count: { select: { products: true, children: true } },
      },
    });

    setCached(cacheKey, items, 120);

    return NextResponse.json(items, {
      headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=120' },
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch categories' },
      { status: 500 }
    );
  }
}

// POST /api/categories — Create single or batch with companyId enforcement
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Categories', 'POST');
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
          const sanitizedDescription = sanitizeText(item.description);

          if (!sanitizedName) {
            throw new Error('DUPLICATE_NAME: Category name cannot be empty after sanitization.');
          }

          if (sanitizedName.length > CATEGORY_NAME_MAX_LENGTH) {
            throw new Error(`VALIDATION_ERROR: Category name must not exceed ${CATEGORY_NAME_MAX_LENGTH} characters (got ${sanitizedName.length}).`);
          }

          // Case-insensitive unique check scoped by company (SQLite-compatible)
          const existingNames = await tx.category.findMany({
            where: {
              companyId: companyId || null,
              isActive: true,
            },
            select: { id: true, name: true },
          });
          const existing = existingNames.find(e => e.name.toLowerCase() === sanitizedName.toLowerCase());

          if (existing) {
            throw new Error(`DUPLICATE_NAME: A category with the name "${sanitizedName}" already exists in this company.`);
          }

          // Auto-generate code if not provided (find max code across ALL records including soft-deleted)
          let code = item.code;
          if (!code) {
            const allCategories = await tx.category.findMany({
              select: { code: true },
            });
            let maxNum = 0;
            for (const cat of allCategories) {
              const match = cat.code.match(/CAT-(\d+)/);
              if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
            }
            code = `CAT-${String(maxNum + 1 + created.length).padStart(5, '0')}`;
          }

          const record = await tx.category.create({
            data: {
              code,
              name: sanitizedName,
              description: sanitizedDescription || null,
              parentCategoryId: item.parentCategoryId || null,
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
        recordLabel: `Batch import: ${records.length} categor(y/ies)`,
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
    const sanitizedDescription = sanitizeText(body.description);

    if (!sanitizedName) {
      return NextResponse.json(
        { error: 'Category name cannot be empty after sanitization.' },
        { status: 400 }
      );
    }

    if (sanitizedName.length > CATEGORY_NAME_MAX_LENGTH) {
      return NextResponse.json(
        { error: `Category name must not exceed ${CATEGORY_NAME_MAX_LENGTH} characters (got ${sanitizedName.length}).` },
        { status: 400 }
      );
    }

    const item = await db.$transaction(async (tx) => {
      // Case-insensitive unique check scoped by company (SQLite-compatible)
      const existingNames = await tx.category.findMany({
        where: {
          companyId: companyId || null,
          isActive: true,
        },
        select: { id: true, name: true },
      });
      const existing = existingNames.find(e => e.name.toLowerCase() === sanitizedName.toLowerCase());

      if (existing) {
        throw new Error(`DUPLICATE_NAME: A category with the name "${sanitizedName}" already exists in this company.`);
      }

      // Auto-generate code if not provided (find max code across ALL records including soft-deleted)
      let code = body.code;
      if (!code) {
        const allCategories = await tx.category.findMany({
          select: { code: true },
        });
        let maxNum = 0;
        for (const cat of allCategories) {
          const match = cat.code.match(/CAT-(\d+)/);
          if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
        }
        code = `CAT-${String(maxNum + 1).padStart(5, '0')}`;
      }

      const record = await tx.category.create({
        data: {
          code,
          name: sanitizedName,
          description: sanitizedDescription || null,
          parentCategoryId: body.parentCategoryId || null,
          isActive: body.isActive ?? true,
          companyId,
        },
        include: {
          parent: { select: { id: true, name: true, code: true } },
          children: { select: { id: true, name: true, code: true } },
          _count: { select: { products: true, children: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'Sys-Catalog-Core',
          recordId: record.id,
          recordLabel: record.name || record.code || record.id,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({ code: record.code, name: record.name, parentCategoryId: body.parentCategoryId || null, companyId }),
        },
      });

      return record;
    });

    // Invalidate categories cache (new category added)
    invalidateByPrefix('categories:');

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('DUPLICATE_NAME')) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('Error creating category:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create category' },
      { status: 500 }
    );
  }
}
