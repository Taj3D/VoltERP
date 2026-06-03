// ============================================================
// Departments [id] API — Multi-tenant CompanyId Isolation
// Module Token: Sys-Structure-Matrix
// Phase 6: Cross-tenant validation, text sanitization, FK checks
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

// GET /api/departments/[id] — Fetch single department with cross-tenant validation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Departments', 'GET');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;
    const item = await db.department.findUnique({
      where: { id },
      include: {
        _count: { select: { employees: true, designations: true } },
      },
    });

    if (!item) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cross-tenant validation
    if (companyId && item.companyId && item.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(item);
  } catch (error) {
    console.error('Error fetching department:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: 'Failed to fetch department' },
      { status: 500 }
    );
  }
}

// PUT /api/departments/[id] — Update department with cross-tenant validation
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Departments', 'PUT');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;
    const body = await request.json();

    // Pre-fetch for cross-tenant validation
    const existing = await db.department.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Sanitize text inputs
    const sanitizedName = body.name !== undefined ? sanitizeText(body.name) : undefined;
    const sanitizedDescription = body.description !== undefined
      ? (body.description ? sanitizeText(body.description) : null)
      : undefined;

    // Reject empty name after sanitization
    if (sanitizedName !== undefined && !sanitizedName) {
      return NextResponse.json(
        { error: 'Department name is required' },
        { status: 400 }
      );
    }

    // Case-insensitive duplicate check if name is being changed
    if (sanitizedName && sanitizedName !== existing.name) {
      const lowerName = sanitizedName.toLowerCase();
      const allActive = await db.department.findMany({
        where: {
          ...(companyId ? { companyId } : {}),
          isActive: true,
          NOT: { id },
        },
        select: { name: true },
      });
      const caseMatch = allActive.find(
        (d) => d.name.toLowerCase() === lowerName
      );
      if (caseMatch) {
        return NextResponse.json(
          { error: `Department with name "${sanitizedName}" already exists (case-insensitive match: "${caseMatch.name}")` },
          { status: 409 }
        );
      }
    }

    const item = await db.$transaction(async (tx) => {
      const record = await tx.department.update({
        where: { id },
        data: {
          ...(sanitizedName !== undefined && { name: sanitizedName }),
          ...(sanitizedDescription !== undefined && { description: sanitizedDescription }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
        },
      });

      await logUserActivity({
          tx: tx,
        action: 'UPDATE',
        module: 'Sys-Structure-Matrix',
        recordId: record.id,
        recordLabel: record.name || record.id,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          code: record.code,
          name: record.name,
          companyId,
          updatedFields: Object.keys(body),
        }),
      });

      return record;
    });

    return NextResponse.json(item);
  } catch (error) {
    if (error instanceof Error && error.message.includes('already exists')) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('Error updating department:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: 'Failed to update department' },
      { status: 500 }
    );
  }
}

// DELETE /api/departments/[id] — Soft-delete with FK check and cross-tenant validation
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Departments', 'DELETE');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;

    await db.$transaction(async (tx) => {
      const record = await tx.department.findUnique({ where: { id } });
      if (!record) throw new Error('Not found');

      // Cross-tenant validation
      if (companyId && record.companyId && record.companyId !== companyId) {
        throw new Error('Not found');
      }

      // FK check: Check if department is referenced by active designations or employees
      const [activeDesignations, activeEmployees] = await Promise.all([
        tx.designation.count({ where: { departmentId: id, isActive: true } }),
        tx.employee.count({ where: { departmentId: id, isActive: true } }),
      ]);

      if (activeDesignations > 0 || activeEmployees > 0) {
        throw new Error(
          `Cannot delete: Department is referenced by ${activeDesignations} active designation(s) and ${activeEmployees} active employee(s)`
        );
      }

      await tx.department.update({
        where: { id },
        data: { isActive: false },
      });

      await logUserActivity({
          tx: tx,
        action: 'DELETE',
        module: 'Sys-Structure-Matrix',
        recordId: record.id,
        recordLabel: record.name || record.id,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          code: record.code,
          name: record.name,
          softDelete: true,
          companyId,
        }),
      });

      return record;
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Not found') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      if (error.message.startsWith('Cannot delete')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    console.error('Error deleting department:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: 'Failed to delete department' },
      { status: 500 }
    );
  }
}
