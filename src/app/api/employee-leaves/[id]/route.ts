import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, safeFinancialAdd, safeFinancialSubtract } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

const nullIfEmpty = (v: string | undefined | null) => (!v || !v.trim()) ? null : v.trim();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'EmployeeLeaves', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const companyId = security.user.companyId;

    const item = await db.employeeLeave.findUnique({
      where: { id },
      include: {
        employee: {
          include: {
            designation: true,
            department: true,
            leaveAllocations: true,
          },
        },
      },
    });

    if (!item) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cross-tenant companyId validation
    if (companyId && item.companyId && item.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch employee leave' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'EmployeeLeaves', 'PUT');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const body = await request.json();
    const companyId = security.user.companyId;

    // ── Phase 8: SR cannot approve/reject leaves — only Admin/Manager can ──
    if ((body.status === 'Approved' || body.status === 'Rejected') && security.user.role === 'sr') {
      return NextResponse.json(
        { error: 'Access denied. SR role cannot approve or reject leaves.' },
        { status: 403 }
      );
    }

    // ── Phase 8: Concurrency-locked transaction ──
    const item = await db.$transaction(async (tx) => {
      // Fetch existing leave record for cross-tenant validation and status check
      const existingLeave = await tx.employeeLeave.findUnique({
        where: { id },
        include: {
          employee: {
            include: {
              designation: true,
              department: true,
              leaveAllocations: true,
            },
          },
        },
      });

      if (!existingLeave) {
        throw new Error('Not found');
      }

      // Cross-tenant companyId validation
      if (companyId && existingLeave.companyId && existingLeave.companyId !== companyId) {
        throw new Error('Not found');
      }

      // ── Build update data ──
      const updateData: Record<string, any> = {};

      if (body.employeeId !== undefined) updateData.employeeId = body.employeeId;
      if (body.leaveType !== undefined) updateData.leaveType = body.leaveType;
      if (body.reason !== undefined) updateData.reason = nullIfEmpty(body.reason);

      // Handle date changes and recalculate totalDays
      const newFromDate = body.fromDate ? new Date(body.fromDate) : existingLeave.fromDate;
      const newToDate = body.toDate ? new Date(body.toDate) : existingLeave.toDate;

      // Re-validate dates if fromDate/toDate changed: toDate >= fromDate
      if (newToDate < newFromDate) {
        throw new Error('End Date must be greater than or equal to Start Date');
      }

      if (body.fromDate !== undefined) updateData.fromDate = newFromDate;
      if (body.toDate !== undefined) updateData.toDate = newToDate;

      // Recalculate totalDays if dates changed
      if (body.fromDate !== undefined || body.toDate !== undefined) {
        const diffMs = newToDate.getTime() - newFromDate.getTime();
        const calculatedDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1);
        updateData.totalDays = calculatedDays;
      }

      // ── Phase 8: When status changes TO "Approved" ──
      if (body.status === 'Approved') {
        const daysToDeduct = updateData.totalDays || existingLeave.totalDays;
        const currentYear = new Date(existingLeave.fromDate).getFullYear();
        const allocation = await tx.leaveAllocation.findFirst({
          where: {
            employeeId: existingLeave.employeeId,
            leaveType: existingLeave.leaveType,
            year: currentYear,
            isActive: true,
          },
        });

        if (allocation) {
          if (safeFinancialSubtract(allocation.remainingDays, daysToDeduct) < 0) {
            throw new Error('Transaction Blocked: Insufficient accumulated leave balance.');
          }
          await tx.leaveAllocation.update({
            where: { id: allocation.id },
            data: {
              usedDays: safeFinancialAdd(allocation.usedDays, daysToDeduct),
              remainingDays: safeFinancialSubtract(allocation.remainingDays, daysToDeduct),
            },
          });
        }

        // Set approvedBy and approvedAt
        updateData.approvedBy = security.user?.name || security.user?.email || 'Unknown';
        updateData.approvedAt = new Date();
      }

      // ── Phase 8: When status changes FROM "Approved" TO "Rejected" or "Pending" ──
      if (
        existingLeave.status === 'Approved' &&
        (body.status === 'Rejected' || body.status === 'Pending')
      ) {
        const currentYear = new Date(existingLeave.fromDate).getFullYear();
        const allocation = await tx.leaveAllocation.findFirst({
          where: {
            employeeId: existingLeave.employeeId,
            leaveType: existingLeave.leaveType,
            year: currentYear,
            isActive: true,
          },
        });

        if (allocation) {
          // Reverse the allocation: decrement usedDays, increment remainingDays
          await tx.leaveAllocation.update({
            where: { id: allocation.id },
            data: {
              usedDays: safeFinancialSubtract(allocation.usedDays, existingLeave.totalDays),
              remainingDays: safeFinancialAdd(allocation.remainingDays, existingLeave.totalDays),
            },
          });
        }

        // Set approvedBy and approvedAt for rejection
        updateData.approvedBy = security.user?.name || security.user?.email || 'Unknown';
        updateData.approvedAt = new Date();
      }

      // Set approvedBy/approvedAt for rejection (even if not previously approved)
      if (body.status === 'Rejected' && existingLeave.status !== 'Approved') {
        updateData.approvedBy = security.user?.name || security.user?.email || 'Unknown';
        updateData.approvedAt = new Date();
      }

      if (body.status !== undefined) {
        updateData.status = body.status;
      }

      // Update the leave record
      const record = await tx.employeeLeave.update({
        where: { id },
        data: updateData,
        include: {
          employee: {
            include: {
              designation: true,
              department: true,
              leaveAllocations: true,
            },
          },
        },
      });

      // Activity log with module: 'HR-Personnel-Core'
      await logUserActivity({
          tx: tx,
        action: 'UPDATE',
        module: 'HR-Personnel-Core',
        recordId: record.id,
        recordLabel: `${record.leaveCode} - ${record.employee?.name || record.id} - ${record.leaveType}`,
        userId: security.user?.id,
        userName: security.user?.name || security.user?.email,
        details: JSON.stringify({
          leaveCode: record.leaveCode,
          employeeId: record.employeeId,
          leaveType: record.leaveType,
          status: record.status,
          approvedBy: record.approvedBy,
          totalDays: record.totalDays,
        }),
      });

      return record;
    });

    return NextResponse.json(item);
  } catch (error: any) {
    // ── Phase 8: Race-condition protection — return 422 when balance insufficient ──
    if (error?.message?.includes('Transaction Blocked')) {
      return NextResponse.json(
        { error: 'Transaction Blocked: Insufficient accumulated leave balance.' },
        { status: 422 }
      );
    }
    if (error?.message === 'Not found') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (error?.message?.includes('End Date') || error?.message?.includes('cannot be before')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to update employee leave' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'EmployeeLeaves', 'DELETE');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const companyId = security.user.companyId;

    await db.$transaction(async (tx) => {
      const record = await tx.employeeLeave.findUnique({
        where: { id },
        include: { employee: true },
      });

      if (!record) {
        throw new Error('Not found');
      }

      // Cross-tenant companyId validation
      if (companyId && record.companyId && record.companyId !== companyId) {
        throw new Error('Not found');
      }

      // ── Phase 8: If the leave being deleted was "Approved", reverse the leave allocation ──
      if (record.status === 'Approved') {
        const currentYear = new Date(record.fromDate).getFullYear();
        const allocation = await tx.leaveAllocation.findFirst({
          where: {
            employeeId: record.employeeId,
            leaveType: record.leaveType,
            year: currentYear,
            isActive: true,
          },
        });

        if (allocation) {
          // Reverse the allocation: decrement usedDays, increment remainingDays
          await tx.leaveAllocation.update({
            where: { id: allocation.id },
            data: {
              usedDays: safeFinancialSubtract(allocation.usedDays, record.totalDays),
              remainingDays: safeFinancialAdd(allocation.remainingDays, record.totalDays),
            },
          });
        }
      }

      // Hard delete (employee leaves can be fully removed)
      await tx.employeeLeave.delete({ where: { id } });

      // Activity log with module: 'HR-Personnel-Core'
      await logUserActivity({
          tx: tx,
        action: 'DELETE',
        module: 'HR-Personnel-Core',
        recordId: record.id,
        recordLabel: `${record.leaveCode} - ${record.employee?.name || record.id} - ${record.leaveType}`,
        userId: security.user?.id,
        userName: security.user?.name || security.user?.email,
        details: JSON.stringify({
          leaveCode: record.leaveCode,
          employeeId: record.employeeId,
          leaveType: record.leaveType,
          totalDays: record.totalDays,
          status: record.status,
          hardDelete: true,
        }),
      });

      return record;
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.message === 'Not found') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to delete employee leave' }, { status: 500 });
  }
}
