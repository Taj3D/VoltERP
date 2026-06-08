import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'EmployeeLeaves', 'GET');
  if (!security.authorized) return security.response;
  try {
    const companyId = security.user.companyId;

    const items = await db.leaveAllocation.findMany({
      where: { ...(companyId ? { companyId, isActive: true } : { isActive: true }) },
      orderBy: { createdAt: 'desc' },
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            employeeCode: true,
            designation: { select: { id: true, name: true, code: true } },
            department: { select: { id: true, name: true, code: true } },
          },
        },
      },
    });

    // VAT Auditor masking not needed (leave allocations are not financial)
    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch leave allocations' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'EmployeeLeaves', 'POST');
  if (!security.authorized) return security.response;
  try {
    const body = await request.json();
    const companyId = security.user.companyId;
    const userId = security.user.id;
    const userName = security.user.name;

    // Batch mode support for CSV import
    if (body.batchMode === true && Array.isArray(body.data)) {
      const results: unknown[] = [];
      const errors: string[] = [];

      for (let i = 0; i < body.data.length; i++) {
        const row = body.data[i];
        try {
          // Validate allocatedDays > 0
          if (!row.allocatedDays || Number(row.allocatedDays) <= 0) {
            errors.push(`Row ${i + 1}: allocatedDays must be greater than 0`);
            continue;
          }

          // Validate no duplicate allocation for same employee+leaveType+year within same company
          const duplicateCheck = await db.leaveAllocation.findFirst({
            where: {
              employeeId: row.employeeId,
              leaveType: row.leaveType,
              year: Number(row.year),
              ...(companyId ? { companyId } : {}),
              isActive: true,
            },
          });
          if (duplicateCheck) {
            errors.push(`Row ${i + 1}: Duplicate allocation for employee ${row.employeeId}, leave type ${row.leaveType}, year ${row.year}`);
            continue;
          }

          const allocatedDays = Number(row.allocatedDays);
          const usedDays = Number(row.usedDays ?? 0);
          const remainingDays = allocatedDays - usedDays;

          const record = await db.$transaction(async (tx) => {
            const created = await tx.leaveAllocation.create({
              data: {
                employeeId: row.employeeId,
                leaveType: row.leaveType,
                allocatedDays,
                usedDays,
                remainingDays,
                year: Number(row.year),
                ...(companyId && { companyId }),
              },
              include: {
                employee: {
                  select: {
                    id: true,
                    name: true,
                    employeeCode: true,
                    designation: { select: { id: true, name: true, code: true } },
                    department: { select: { id: true, name: true, code: true } },
                  },
                },
              },
            });
            return created;
          });

          results.push(record);
        } catch (err) {
          errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }

      // Single batch activity log
      await logUserActivity({
        action: 'IMPORT',
        module: 'HR-Personnel-Core',
        recordId: 'BATCH',
        recordLabel: `Batch import: ${results.length} leave allocations`,
        userId,
        userName,
        details: JSON.stringify({ total: body.data.length, created: results.length, errors: errors.length }),
      });

      return NextResponse.json({ created: results, errors }, { status: 201 });
    }

    // Single mode: Validate required fields
    if (!body.employeeId) {
      return NextResponse.json({ error: 'employeeId is required' }, { status: 400 });
    }
    if (!body.leaveType) {
      return NextResponse.json({ error: 'leaveType is required (e.g. Casual, Sick, Annual, Maternity)' }, { status: 400 });
    }
    if (!body.year) {
      return NextResponse.json({ error: 'year is required' }, { status: 400 });
    }
    if (!body.allocatedDays || Number(body.allocatedDays) <= 0) {
      return NextResponse.json(
        { error: 'allocatedDays must be greater than 0' },
        { status: 400 }
      );
    }

    // Validate no duplicate allocation for same employee+leaveType+year within same company
    const duplicateCheck = await db.leaveAllocation.findFirst({
      where: {
        employeeId: body.employeeId,
        leaveType: body.leaveType,
        year: Number(body.year),
        ...(companyId ? { companyId } : {}),
        isActive: true,
      },
    });
    if (duplicateCheck) {
      return NextResponse.json(
        { error: `Duplicate allocation: employee already has ${body.leaveType} leave allocated for ${body.year}` },
        { status: 400 }
      );
    }

    // Compute remainingDays = allocatedDays - usedDays (initially usedDays=0)
    const allocatedDays = Number(body.allocatedDays);
    const usedDays = Number(body.usedDays ?? 0);
    const remainingDays = allocatedDays - usedDays;

    const item = await db.$transaction(async (tx) => {
      const record = await tx.leaveAllocation.create({
        data: {
          employeeId: body.employeeId,
          leaveType: body.leaveType,
          allocatedDays,
          usedDays,
          remainingDays,
          year: Number(body.year),
          ...(companyId && { companyId }),
        },
        include: {
          employee: {
            select: {
              id: true,
              name: true,
              employeeCode: true,
              designation: { select: { id: true, name: true, code: true } },
              department: { select: { id: true, name: true, code: true } },
            },
          },
        },
      });

      await logUserActivity({
          tx: tx,
        action: 'CREATE',
        module: 'HR-Personnel-Core',
        recordId: record.id,
        recordLabel: `${record.employee?.name || record.employeeId} - ${record.leaveType} ${record.year}`,
        userId,
        userName,
        details: JSON.stringify({
          employeeId: record.employeeId,
          leaveType: record.leaveType,
          allocatedDays: record.allocatedDays,
          usedDays: record.usedDays,
          remainingDays: record.remainingDays,
          year: record.year,
        }),
      });

      return record;
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create leave allocation' }, { status: 500 });
  }
}
