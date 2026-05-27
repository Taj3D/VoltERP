import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity } from '@/lib/api-security';

// GET /api/sr-targets - List all SR targets with relations
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'SRTargets', 'GET');
  if (!security.authorized) return security.response;
  try {
    const targets = await db.sRTargetSetup.findMany({
      where: { isActive: true },
      include: {
        employee: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(targets);
  } catch (error) {
    console.error('Error fetching SR targets:', error);
    return NextResponse.json(
      { error: 'Failed to fetch SR targets' },
      { status: 500 }
    );
  }
}

// POST /api/sr-targets - Create SR target
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'SRTargets', 'POST');
  if (!security.authorized) return security.response;
  try {
    const body = await request.json();
    const { employeeId, month, year, targetAmount, isActive } = body;

    if (!employeeId || month === undefined || year === undefined || targetAmount === undefined) {
      return NextResponse.json(
        { error: 'employeeId, month, year, and targetAmount are required' },
        { status: 400 }
      );
    }

    // Validate month (1-12) and year
    if (month < 1 || month > 12) {
      return NextResponse.json(
        { error: 'Month must be between 1 and 12' },
        { status: 400 }
      );
    }
    if (year < 2000 || year > 2100) {
      return NextResponse.json(
        { error: 'Year must be between 2000 and 2100' },
        { status: 400 }
      );
    }
    if (targetAmount < 0) {
      return NextResponse.json(
        { error: 'Target amount must be a positive number' },
        { status: 400 }
      );
    }

    const result = await db.$transaction(async (tx) => {
      const target = await tx.sRTargetSetup.create({
        data: {
          employeeId,
          month,
          year,
          targetAmount,
          isActive: isActive !== undefined ? isActive : true,
        },
        include: {
          employee: true,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'SRTargets',
          recordId: target.id,
          recordLabel: `${target.employee?.name || target.id} - ${target.month}/${target.year}`,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({ employeeId, month, year, targetAmount }),
        },
      });

      return target;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating SR target:', error);
    return NextResponse.json(
      { error: 'Failed to create SR target' },
      { status: 500 }
    );
  }
}
