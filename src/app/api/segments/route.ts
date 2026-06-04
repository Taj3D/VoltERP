// ============================================================
// Segments API — Multi-tenant CompanyId Isolation
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

// GET /api/segments — List all active segments filtered by companyId
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Segments', 'GET');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const items = await db.segment.findMany({
      where: {
        isActive: true,
        ...(companyId ? { companyId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { products: true } },
      },
    });

    return NextResponse.json(items);
  } catch (error) {
    console.error('Error fetching segments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch segments' },
      { status: 500 }
    );
  }
}

// POST /api/segments — Create single or batch with companyId enforcement
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Segments', 'POST');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const body = await request.json();

    // ── Batch mode support ──
    if (body.batchMode === true && Array.isArray(body.data)) {
      const sanitizedBatch = body.data.map(
        (item: { name?: string; description?: string; isActive?: boolean }) => ({
          name: typeof item.name === 'string' ? sanitizeText(item.name) : '',
          description: typeof item.description === 'string' ? sanitizeText(item.description) : null,
          isActive: item.isActive ?? true,
        })
      );

      // Validate all items have non-empty names
      for (let i = 0; i < sanitizedBatch.length; i++) {
        if (!sanitizedBatch[i].name) {
          return NextResponse.json(
            { error: `Segment name is required for item at index ${i}` },
            { status: 400 }
          );
        }
      }

      const records = await db.$transaction(async (tx) => {
        const created: Array<{
          id: string;
          code: string;
          name: string;
          description: string | null;
          companyId: string | null;
          isActive: boolean;
          createdAt: Date;
          updatedAt: Date;
        }> = [];

        for (const item of sanitizedBatch) {
          // Duplicate check within company scope (case-insensitive for SQLite)
          const lowerName = item.name.toLowerCase();
          const allActiveForDup = await tx.segment.findMany({
            where: {
              ...(companyId ? { companyId } : {}),
              isActive: true,
            },
            select: { name: true },
          });
          const caseMatch = allActiveForDup.find(s => s.name.toLowerCase() === lowerName);
          if (caseMatch) {
            throw new Error(
              `DUPLICATE_NAME: A segment with name "${item.name}" already exists (case-insensitive match: "${caseMatch.name}")`
            );
          }

          // Collision-safe code generation (findMany + Math.max)
          const allSegs = await tx.segment.findMany({ select: { code: true } });
          let maxNum = 0;
          for (const s of allSegs) {
            const match = s.code?.match(/SEG-(\d+)/);
            if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
          }
          const code = `SEG-${String(maxNum + 1).padStart(5, '0')}`;

          const record = await tx.segment.create({
            data: {
              code,
              name: item.name,
              description: item.description,
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
        recordLabel: `Batch import: ${records.length} segment(s)`,
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

    // Reject empty name after sanitization
    if (!sanitizedName) {
      return NextResponse.json(
        { error: 'Segment name is required' },
        { status: 400 }
      );
    }

    const item = await db.$transaction(async (tx) => {
      // Duplicate check within company scope (case-insensitive for SQLite)
      const lowerName = sanitizedName.toLowerCase();
      const allActive = await tx.segment.findMany({
        where: {
          ...(companyId ? { companyId } : {}),
          isActive: true,
        },
        select: { name: true },
      });
      const caseMatch = allActive.find(s => s.name.toLowerCase() === lowerName);
      if (caseMatch) {
        throw new Error(`DUPLICATE_NAME: A segment with name "${sanitizedName}" already exists (case-insensitive match: "${caseMatch.name}")`);
      }

      // Collision-safe code generation (findMany + Math.max)
      const allSegs = await tx.segment.findMany({ select: { code: true } });
      let maxNum = 0;
      for (const s of allSegs) {
        const match = s.code?.match(/SEG-(\d+)/);
        if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
      }
      const code = `SEG-${String(maxNum + 1).padStart(5, '0')}`;

      const record = await tx.segment.create({
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
        details: JSON.stringify({ name: record.name, code: record.code, companyId }),
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
    console.error('Error creating segment:', error);
    return NextResponse.json(
      { error: 'Failed to create segment' },
      { status: 500 }
    );
  }
}
