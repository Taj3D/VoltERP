// ============================================================
// Godowns API — Multi-tenant CompanyId Isolation
// Module Token: Sys-Structure-Matrix
// Phase 6: Auto-code WH-XXXXX, text sanitization, capacity validation, batch mode
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

function sanitizeText(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')           // Strip HTML/XSS tags
    .replace(/\r\n/g, '\n')            // Normalize line breaks
    .replace(/\n{3,}/g, '\n\n')        // Collapse excessive newlines
    .replace(/  +/g, ' ')              // Collapse double spaces
    .trim();
}

// GET /api/godowns — List all active godowns filtered by companyId
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Godowns', 'GET');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const items = await db.godown.findMany({
      where: { isActive: true, ...(companyId ? { companyId } : {}) },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { products: true } },
      },
    });

    return NextResponse.json(items);
  } catch (error) {
    console.error('Error fetching godowns:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: 'Failed to fetch godowns' },
      { status: 500 }
    );
  }
}

// POST /api/godowns — Create single or batch with companyId enforcement
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Godowns', 'POST');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const body = await request.json();

    // ── Batch mode support ──
    if (body.batchMode === true && Array.isArray(body.data)) {
      const results = await db.$transaction(async (tx) => {
        const records = [];

        for (const item of body.data as Array<{
          name?: string;
          address?: string;
          inCharge?: string;
          phone?: string;
          capacityValue?: number;
          capacityUnit?: string;
          status?: string;
          isActive?: boolean;
        }>) {
          const sanitizedName = sanitizeText(item.name || '');
          const sanitizedAddress = item.address ? sanitizeText(item.address) : null;

          // Skip if required fields are empty after sanitization
          if (!sanitizedName) continue;
          if (!sanitizedAddress) continue;

          const sanitizedInCharge = item.inCharge ? sanitizeText(item.inCharge) : null;
          const sanitizedPhone = item.phone ? sanitizeText(item.phone) : null;

          // Validate capacityValue
          const capacityValue = item.capacityValue ?? 0;
          if (capacityValue < 0) continue; // Skip invalid capacity in batch

          // Duplicate check within tenant (case-insensitive, skip silently in batch)
          const lowerName = sanitizedName.toLowerCase();
          const allActiveForDup = await tx.godown.findMany({
            where: {
              ...(companyId ? { companyId } : {}),
              isActive: true,
            },
            select: { name: true },
          });
          const caseMatch = allActiveForDup.find(d => d.name.toLowerCase() === lowerName);
          if (caseMatch) continue; // Skip duplicates in batch

          // Collision-safe code generation (findMany + Math.max)
          const allGodowns = await tx.godown.findMany({ select: { code: true } });
          let maxNum = 0;
          for (const g of allGodowns) {
            const match = g.code?.match(/WH-(\d+)/);
            if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
          }
          const code = `WH-${String(maxNum + 1).padStart(5, '0')}`;

          const record = await tx.godown.create({
            data: {
              code,
              name: sanitizedName,
              address: sanitizedAddress,
              inCharge: sanitizedInCharge,
              phone: sanitizedPhone,
              status: item.status || 'ACTIVE',
              capacityValue,
              capacityUnit: item.capacityUnit || null,
              isActive: item.isActive ?? true,
              ...(companyId && { companyId }),
            },
          });

          records.push(record);
        }

        // Single audit log entry for the batch
        await logUserActivity({
          tx: tx,
          action: 'CREATE',
          module: 'Sys-Structure-Matrix',
          recordId: 'BATCH',
          recordLabel: `Batch import: ${records.length} godown(s)/warehouse(s)`,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            count: records.length,
            names: records.map((r) => r.name),
            companyId,
          }),
        });

        return records;
      });

      return NextResponse.json(
        { success: true, count: results.length, data: results },
        { status: 201 }
      );
    }

    // ── Single record creation ──
    const sanitizedName = sanitizeText(body.name || '');
    if (!sanitizedName) {
      return NextResponse.json(
        { error: 'Godown/Warehouse name is required' },
        { status: 400 }
      );
    }

    const sanitizedAddress = body.address ? sanitizeText(body.address) : null;
    if (!sanitizedAddress) {
      return NextResponse.json(
        { error: 'Godown/Warehouse address is required' },
        { status: 400 }
      );
    }

    const sanitizedInCharge = body.inCharge ? sanitizeText(body.inCharge) : null;
    const sanitizedPhone = body.phone ? sanitizeText(body.phone) : null;

    // Validate capacityValue
    const capacityValue = body.capacityValue ?? 0;
    if (capacityValue < 0) {
      return NextResponse.json(
        { error: 'Capacity value must be zero or greater' },
        { status: 400 }
      );
    }

    const item = await db.$transaction(async (tx) => {
      // Case-insensitive duplicate check (manual lowercased comparison for SQLite)
      const lowerName = sanitizedName.toLowerCase();
      const allActive = await tx.godown.findMany({
        where: {
          ...(companyId ? { companyId } : {}),
          isActive: true,
        },
        select: { name: true },
      });
      const caseMatch = allActive.find(d => d.name.toLowerCase() === lowerName);
      if (caseMatch) {
        throw new Error(`Godown with name "${sanitizedName}" already exists (case-insensitive match: "${caseMatch.name}")`);
      }

      // Collision-safe code generation (findMany + Math.max)
      const allGodowns = await tx.godown.findMany({ select: { code: true } });
      let maxNum = 0;
      for (const g of allGodowns) {
        const match = g.code?.match(/WH-(\d+)/);
        if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
      }
      const code = `WH-${String(maxNum + 1).padStart(5, '0')}`;

      const record = await tx.godown.create({
        data: {
          code,
          name: sanitizedName,
          address: sanitizedAddress,
          inCharge: sanitizedInCharge,
          phone: sanitizedPhone,
          status: body.status || 'ACTIVE',
          capacityValue,
          capacityUnit: body.capacityUnit || null,
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
          code: record.code,
          name: record.name,
          address: record.address,
          status: record.status,
          capacityValue: record.capacityValue,
          capacityUnit: record.capacityUnit,
          companyId,
        }),
      });

      return record;
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes('already exists')) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('Error creating godown:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: 'Failed to create godown' },
      { status: 500 }
    );
  }
}
