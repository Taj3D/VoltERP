// ============================================================
// Capacities API — Multi-tenant CompanyId Isolation
// Module Token: Sys-Structure-Matrix
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// ── Text sanitizer: strip HTML/XSS tags, normalize whitespace ──
function sanitizeText(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')           // Strip HTML/XSS tags
    .replace(/\r\n/g, '\n')            // Normalize line breaks
    .replace(/\n{3,}/g, '\n\n')        // Collapse excessive newlines
    .replace(/  +/g, ' ')              // Collapse double spaces
    .trim();
}

// GET /api/capacities — List all active capacities filtered by companyId
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Capacities', 'GET');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const items = await db.capacity.findMany({
      where: {
        isActive: true,
        ...(companyId ? { companyId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(items);
  } catch (error) {
    console.error('Error fetching capacities:', error);
    return NextResponse.json(
      { error: 'Failed to fetch capacities' },
      { status: 500 }
    );
  }
}

// POST /api/capacities — Create single or batch with companyId enforcement
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Capacities', 'POST');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const body = await request.json();

    // ── Batch mode support ──
    if (body.batchMode === true && Array.isArray(body.data)) {
      const sanitizedBatch = body.data.map(
        (item: {
          name?: string;
          description?: string;
          capacityValue?: number;
          capacityUnit?: string;
          isActive?: boolean;
        }) => ({
          name: typeof item.name === 'string' ? sanitizeText(item.name) : '',
          description: typeof item.description === 'string' ? sanitizeText(item.description) : null,
          capacityValue: item.capacityValue,
          capacityUnit: typeof item.capacityUnit === 'string' ? sanitizeText(item.capacityUnit) : null,
          isActive: item.isActive ?? true,
        })
      );

      // Validate all items have non-empty names and positive capacityValue
      for (let i = 0; i < sanitizedBatch.length; i++) {
        if (!sanitizedBatch[i].name) {
          return NextResponse.json(
            { error: `Capacity name is required for item at index ${i}` },
            { status: 400 }
          );
        }
        const cv = Number(sanitizedBatch[i].capacityValue);
        if (isNaN(cv) || cv <= 0) {
          return NextResponse.json(
            { error: `Capacity value must be a positive number greater than zero for item at index ${i}` },
            { status: 400 }
          );
        }
        // Validate capacityUnit if provided
        if (sanitizedBatch[i].capacityUnit === '') {
          sanitizedBatch[i].capacityUnit = null;
        }
      }

      const records = await db.$transaction(async (tx) => {
        const created: Array<{
          id: string;
          code: string;
          name: string;
          description: string | null;
          capacityValue: number;
          capacityUnit: string | null;
          companyId: string | null;
          isActive: boolean;
          createdAt: Date;
          updatedAt: Date;
        }> = [];

        for (const item of sanitizedBatch) {
          // Duplicate name check within company scope (case-insensitive for SQLite)
          const lowerName = item.name.toLowerCase();
          const allActiveForDup = await tx.capacity.findMany({
            where: {
              ...(companyId ? { companyId } : {}),
              isActive: true,
            },
            select: { name: true },
          });
          const caseMatch = allActiveForDup.find(c => c.name.toLowerCase() === lowerName);
          if (caseMatch) {
            throw new Error(
              `DUPLICATE_NAME: A capacity with name "${item.name}" already exists (case-insensitive match: "${caseMatch.name}")`
            );
          }

          // Collision-safe code generation (findMany + Math.max)
          const allCaps = await tx.capacity.findMany({ select: { code: true } });
          let maxNum = 0;
          for (const c of allCaps) {
            const match = c.code?.match(/CAP-(\d+)/);
            if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
          }
          const code = `CAP-${String(maxNum + 1).padStart(5, '0')}`;

          const record = await tx.capacity.create({
            data: {
              code,
              name: item.name,
              description: item.description,
              capacityValue: Number(item.capacityValue),
              capacityUnit: item.capacityUnit,
              isActive: item.isActive,
              ...(companyId && { companyId }),
            },
          });

          created.push(record);
        }

        return created;
      });

      // Single audit log entry for the batch
      await logUserActivity({
        action: 'IMPORT',
        module: 'Sys-Structure-Matrix',
        recordId: 'BATCH',
        recordLabel: `Batch import: ${records.length} capacity(ies)`,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          count: records.length,
          names: records.map((r) => r.name),
          companyId,
        }),
      });

      return NextResponse.json(
        { success: true, count: records.length, data: records },
        { status: 201 }
      );
    }

    // ── Single record creation ──
    // Sanitize text inputs
    const sanitizedName = sanitizeText(String(body.name || ''));
    const sanitizedDescription = body.description ? sanitizeText(String(body.description)) : null;
    const sanitizedCapacityUnit = body.capacityUnit ? sanitizeText(String(body.capacityUnit)) : null;

    // Reject empty name after sanitization
    if (!sanitizedName) {
      return NextResponse.json(
        { error: 'Capacity name is required' },
        { status: 400 }
      );
    }

    // CRITICAL: Validate capacityValue — must be a positive number > 0
    const capacityValue = Number(body.capacityValue);
    if (isNaN(capacityValue) || capacityValue <= 0) {
      return NextResponse.json(
        { error: 'Capacity value must be a positive number greater than zero' },
        { status: 400 }
      );
    }

    // Validate capacityUnit if provided — must be a valid measurement unit string after sanitization
    const VALID_CAPACITY_UNITS = ['m³', 'sqft', 'units', 'kg', 'tons', 'pcs', 'box', 'carton'];
    const finalCapacityUnit = sanitizedCapacityUnit || null;
    if (finalCapacityUnit && !VALID_CAPACITY_UNITS.includes(finalCapacityUnit)) {
      return NextResponse.json(
        { error: `Invalid capacity unit. Allowed values: ${VALID_CAPACITY_UNITS.join(', ')}` },
        { status: 400 }
      );
    }

    const item = await db.$transaction(async (tx) => {
      // Duplicate name check within company scope (case-insensitive for SQLite)
      const lowerName = sanitizedName.toLowerCase();
      const allActive = await tx.capacity.findMany({
        where: {
          ...(companyId ? { companyId } : {}),
          isActive: true,
        },
        select: { name: true },
      });
      const caseMatch = allActive.find(c => c.name.toLowerCase() === lowerName);
      if (caseMatch) {
        throw new Error(`DUPLICATE_NAME: A capacity with name "${sanitizedName}" already exists (case-insensitive match: "${caseMatch.name}")`);
      }

      // Collision-safe code generation (findMany + Math.max)
      const allCaps = await tx.capacity.findMany({ select: { code: true } });
      let maxNum = 0;
      for (const c of allCaps) {
        const match = c.code?.match(/CAP-(\d+)/);
        if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
      }
      const code = `CAP-${String(maxNum + 1).padStart(5, '0')}`;

      const record = await tx.capacity.create({
        data: {
          code,
          name: sanitizedName,
          description: sanitizedDescription,
          capacityValue,
          capacityUnit: finalCapacityUnit,
          isActive: body.isActive ?? true,
          ...(companyId && { companyId }),
        },
      });

      await logUserActivity({
          tx: tx,
        action: 'CREATE',
        module: 'Sys-Structure-Matrix',
        recordId: record.id,
        recordLabel: record.name || record.id,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          name: record.name,
          code: record.code,
          capacityValue: record.capacityValue,
          capacityUnit: record.capacityUnit,
          companyId,
        }),
      });

      return record;
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('DUPLICATE_NAME')) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 }
      );
    }
    console.error('Error creating capacity:', error);
    return NextResponse.json(
      { error: 'Failed to create capacity' },
      { status: 500 }
    );
  }
}
