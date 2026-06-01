// ============================================================
// SINGLE BRANCH OPERATIONS — Get, Update, Delete
// GET    /api/branches/[id] — Get single branch
// PUT    /api/branches/[id] — Update branch
// DELETE /api/branches/[id] — Soft-delete branch
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, checkFinancialDeletePermission, type UserRole } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Companies', 'GET');
  if (!security.authorized) return security.response;

  const { id } = await params;
  const companyId = security.user.companyId;

  try {
    const branch = await db.branch.findFirst({
      where: { id, isActive: true },
      include: {
        company: {
          select: { id: true, name: true, code: true },
        },
        users: {
          where: { isActive: true },
          select: { id: true, name: true, email: true, role: true },
        },
        godowns: {
          where: { isActive: true },
          select: { id: true, name: true, status: true },
        },
        _count: {
          select: {
            interBranchTransfersFrom: true,
            interBranchTransfersTo: true,
          },
        },
      },
    });

    if (!branch) {
      return NextResponse.json({ error: 'Branch not found.' }, { status: 404 });
    }

    // Cross-tenant validation
    if (companyId && branch.companyId !== companyId) {
      return NextResponse.json({ error: 'Branch not found.' }, { status: 404 });
    }

    return NextResponse.json(branch);
  } catch (error) {
    console.error('[Branch GET] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch branch' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Companies', 'PUT');
  if (!security.authorized) return security.response;

  const { id } = await params;
  const companyId = security.user.companyId;

  try {
    // Pre-fetch and cross-tenant check
    const existing = await db.branch.findFirst({
      where: { id, isActive: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Branch not found.' }, { status: 404 });
    }

    if (companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Branch not found.' }, { status: 404 });
    }

    const body = await request.json();

    // If changing status to SUSPENDED, freeze all pending inter-branch transfers
    if (body.status === 'SUSPENDED' && existing.status !== 'SUSPENDED') {
      await db.interBranchTransfer.updateMany({
        where: {
          isActive: true,
          status: 'Pending',
          companyId: existing.companyId,
          OR: [
            { fromBranchId: id },
            { toBranchId: id },
          ],
        },
        data: { status: 'Cancelled' },
      });
    }

    const branch = await db.$transaction(async (tx) => {
      const record = await tx.branch.update({
        where: { id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.address !== undefined && { address: body.address || null }),
          ...(body.phone !== undefined && { phone: body.phone || null }),
          ...(body.email !== undefined && { email: body.email || null }),
          ...(body.managerName !== undefined && { managerName: body.managerName || null }),
          ...(body.status !== undefined && { status: body.status }),
          ...(body.isHeadOffice !== undefined && { isHeadOffice: body.isHeadOffice }),
          ...(body.gstNumber !== undefined && { gstNumber: body.gstNumber || null }),
          ...(body.openingDate !== undefined && { openingDate: body.openingDate ? new Date(body.openingDate) : null }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'Holding-Consolidation-Core',
          recordId: record.id,
          recordLabel: record.name || record.code,
          userId: security.user.id || 'system',
          userName: security.user.name || 'System',
          details: JSON.stringify({
            code: record.code,
            name: record.name,
            status: record.status,
            isHeadOffice: record.isHeadOffice,
            suspended: body.status === 'SUSPENDED' && existing.status !== 'SUSPENDED',
          }),
        },
      });

      return record;
    });

    return NextResponse.json(branch);
  } catch (error) {
    console.error('[Branch PUT] Error:', error);
    return NextResponse.json({ error: 'Failed to update branch' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Companies', 'DELETE');
  if (!security.authorized) return security.response;

  // Only admin can delete
  const deleteCheck = checkFinancialDeletePermission(security.user.role as UserRole);
  if (deleteCheck) return deleteCheck;

  const { id } = await params;
  const companyId = security.user.companyId;

  try {
    // Pre-fetch and cross-tenant check
    const existing = await db.branch.findFirst({
      where: { id, isActive: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Branch not found.' }, { status: 404 });
    }

    if (companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Branch not found.' }, { status: 404 });
    }

    // Check for active transfers involving this branch
    const activeTransfers = await db.interBranchTransfer.count({
      where: {
        isActive: true,
        status: { in: ['Pending', 'Approved'] },
        OR: [{ fromBranchId: id }, { toBranchId: id }],
      },
    });

    if (activeTransfers > 0) {
      return NextResponse.json(
        { error: `Cannot delete branch. There are ${activeTransfers} active inter-branch transfers involving this branch. Cancel them first.` },
        { status: 409 }
      );
    }

    // Soft-delete
    await db.$transaction(async (tx) => {
      await tx.branch.update({
        where: { id },
        data: { isActive: false },
      });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'Holding-Consolidation-Core',
          recordId: id,
          recordLabel: existing.name || existing.code,
          userId: security.user.id || 'system',
          userName: security.user.name || 'System',
          details: JSON.stringify({
            code: existing.code,
            name: existing.name,
            action: 'SOFT_DELETE',
          }),
        },
      });
    });

    return NextResponse.json({ success: true, message: 'Branch deleted successfully.' });
  } catch (error) {
    console.error('[Branch DELETE] Error:', error);
    return NextResponse.json({ error: 'Failed to delete branch' }, { status: 500 });
  }
}
