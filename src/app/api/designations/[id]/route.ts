import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, maskForVatAuditor, safeFinancialRound } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

const nullIfEmpty = (v: string | undefined | null) => (!v || !v.trim()) ? null : v.trim();

// XSS sanitization — strip HTML tags from text inputs
function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '').trim();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Designations', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const companyId = security.user.companyId;

    const item = await db.designation.findUnique({
      where: { id },
      include: { department: true, _count: { select: { employees: true } } },
    });
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Cross-tenant companyId validation
    if (companyId && item.companyId && item.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // VAT Auditor masking: hide salary band values
    const masked = security.user.role === 'vat_auditor'
      ? maskForVatAuditor(item, security.user.role, ['salaryBandMin', 'salaryBandMax'])
      : item;

    return NextResponse.json(masked);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch designation' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Designations', 'PUT');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const body = await request.json();
    const companyId = security.user.companyId;
    const userId = security.user.id;
    const userName = security.user.name;

    // Validate salaryBandMax >= salaryBandMin
    if (body.salaryBandMax !== undefined && body.salaryBandMin !== undefined &&
        Number(body.salaryBandMax) < Number(body.salaryBandMin)) {
      return NextResponse.json(
        { error: 'salaryBandMax must be greater than or equal to salaryBandMin' },
        { status: 400 }
      );
    }

    // Case-insensitive duplicate name check (exclude current record)
    if (body.name?.trim()) {
      const normalizedName = body.name.trim().toLowerCase();
      const duplicate = await db.designation.findFirst({
        where: { name: { contains: normalizedName }, isActive: true, id: { not: id } },
      });
      if (duplicate && duplicate.name.trim().toLowerCase() === normalizedName) {
        return NextResponse.json(
          { error: `Corporate Entity Collision: Designation name "${body.name.trim()}" already exists (case-insensitive match).` },
          { status: 400 }
        );
      }
    }

    const item = await db.$transaction(async (tx) => {
      // Cross-tenant validation before modification
      const existing = await tx.designation.findUnique({ where: { id } });
      if (!existing) throw new Error('Not found');
      if (companyId && existing.companyId && existing.companyId !== companyId) {
        throw new Error('Not found');
      }

      const record = await tx.designation.update({
        where: { id },
        data: {
          name: body.name !== undefined ? stripHtml(String(body.name)) : undefined,
          departmentId: body.departmentId,
          gradeLevel: body.gradeLevel !== undefined ? nullIfEmpty(body.gradeLevel) : undefined,
          salaryBandMin: body.salaryBandMin !== undefined ? safeFinancialRound(Number(body.salaryBandMin)) : undefined,
          salaryBandMax: body.salaryBandMax !== undefined ? safeFinancialRound(Number(body.salaryBandMax)) : undefined,
          description: body.description !== undefined ? (body.description ? stripHtml(String(body.description)) : null) : undefined,
          isActive: body.isActive !== undefined ? body.isActive : undefined,
        },
        include: { department: true, _count: { select: { employees: true } } },
      });

      await logUserActivity({
          tx: tx,
        action: 'UPDATE',
        module: 'HR-Personnel-Core',
        recordId: record.id,
        recordLabel: `${record.code} - ${record.name}`,
        userId,
        userName,
        details: JSON.stringify({
          code: record.code,
          name: record.name,
          departmentId: record.departmentId,
          gradeLevel: record.gradeLevel,
          salaryBandMin: record.salaryBandMin,
          salaryBandMax: record.salaryBandMax,
        }),
      });

      return record;
    });

    return NextResponse.json(item);
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Not found') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to update designation' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Designations', 'DELETE');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const companyId = security.user.companyId;
    const userId = security.user.id;
    const userName = security.user.name;

    // Only admin can delete
    if (security.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Delete access denied. Only administrators can delete designations.' },
        { status: 403 }
      );
    }

    await db.$transaction(async (tx) => {
      const record = await tx.designation.findUnique({ where: { id } });
      if (!record) throw new Error('Not found');

      // Cross-tenant validation before soft delete
      if (companyId && record.companyId && record.companyId !== companyId) {
        throw new Error('Not found');
      }

      // FK check: active employees referencing the designation
      const activeEmployees = await tx.employee.count({
        where: { designationId: id, isActive: true },
      });
      if (activeEmployees > 0) {
        throw new Error(`Cannot delete: Designation is referenced by ${activeEmployees} active employee(s)`);
      }

      // Soft delete
      await tx.designation.update({
        where: { id },
        data: { isActive: false },
      });

      await logUserActivity({
          tx: tx,
        action: 'DELETE',
        module: 'HR-Personnel-Core',
        recordId: record.id,
        recordLabel: `${record.code} - ${record.name}`,
        userId,
        userName,
        details: JSON.stringify({ code: record.code, name: record.name, softDelete: true }),
      });
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === 'Not found') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      if (error.message.startsWith('Cannot delete')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    return NextResponse.json({ error: 'Failed to delete designation' }, { status: 500 });
  }
}
