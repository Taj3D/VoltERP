// ============================================================
// Departments API — Multi-tenant CompanyId Isolation
// Module Token: Sys-Structure-Matrix
// Phase 6: Auto-code DEPT-XXXXX, text sanitization, batch mode
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

// GET /api/departments — List all active departments filtered by companyId
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Departments', 'GET');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const items = await db.department.findMany({
      where: { isActive: true, ...(companyId ? { companyId } : {}) },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { employees: true, designations: true } },
      },
    });

    return NextResponse.json(items);
  } catch (error) {
    console.error('Error fetching departments:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: 'Failed to fetch departments' },
      { status: 500 }
    );
  }
}

// POST /api/departments — Create single or batch with companyId enforcement
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Departments', 'POST');
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
          description?: string;
          isActive?: boolean;
        }>) {
          const sanitizedName = sanitizeText(item.name || '');
          if (!sanitizedName) continue; // Skip invalid entries in batch

          const sanitizedDescription = item.description
            ? sanitizeText(item.description)
            : null;

          // Collision-safe code generation (findMany + Math.max)
          const allDepts = await tx.department.findMany({ select: { code: true } });
          let maxNum = 0;
          for (const d of allDepts) {
            const match = d.code?.match(/DEPT-(\d+)/);
            if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
          }
          const code = `DEPT-${String(maxNum + 1).padStart(5, '0')}`;

          // Duplicate check within tenant
          const existing = await tx.department.findFirst({
            where: {
              ...(companyId ? { companyId } : {}),
              name: sanitizedName,
              isActive: true,
            },
          });
          if (existing) continue; // Skip duplicates in batch

          // Also check lowercased manually for case-insensitive match (SQLite)
          const lowerName = sanitizedName.toLowerCase();
          const allActive = await tx.department.findMany({
            where: {
              ...(companyId ? { companyId } : {}),
              isActive: true,
            },
            select: { name: true },
          });
          const caseMatch = allActive.find(
            (d) => d.name.toLowerCase() === lowerName
          );
          if (caseMatch) continue; // Skip case-insensitive duplicates

          const record = await tx.department.create({
            data: {
              code,
              name: sanitizedName,
              description: sanitizedDescription,
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
          recordLabel: `Batch import: ${records.length} department(s)`,
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
        { error: 'Department name is required' },
        { status: 400 }
      );
    }

    const sanitizedDescription = body.description
      ? sanitizeText(body.description)
      : null;

    const item = await db.$transaction(async (tx) => {
      // Duplicate check within tenant (exact match)
      const existing = await tx.department.findFirst({
        where: {
          ...(companyId ? { companyId } : {}),
          name: sanitizedName,
          isActive: true,
        },
      });

      if (existing) {
        throw new Error(
          `Department with name "${sanitizedName}" already exists`
        );
      }

      // Case-insensitive duplicate check (manual lowercased comparison for SQLite)
      const lowerName = sanitizedName.toLowerCase();
      const allActive = await tx.department.findMany({
        where: {
          ...(companyId ? { companyId } : {}),
          isActive: true,
        },
        select: { name: true },
      });
      const caseMatch = allActive.find(
        (d) => d.name.toLowerCase() === lowerName
      );

      if (caseMatch) {
        throw new Error(
          `Department with name "${sanitizedName}" already exists (case-insensitive match: "${caseMatch.name}")`
        );
      }

      // Collision-safe code generation (findMany + Math.max)
      const allDepts = await tx.department.findMany({ select: { code: true } });
      let maxNum = 0;
      for (const d of allDepts) {
        const match = d.code?.match(/DEPT-(\d+)/);
        if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
      }
      const code = `DEPT-${String(maxNum + 1).padStart(5, '0')}`;

      const record = await tx.department.create({
        data: {
          code,
          name: sanitizedName,
          description: sanitizedDescription,
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
    console.error('Error creating department:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: 'Failed to create department' },
      { status: 500 }
    );
  }
}
