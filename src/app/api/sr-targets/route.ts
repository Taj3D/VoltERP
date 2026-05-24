import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/sr-targets - List all SR targets with relations
export async function GET() {
  try {
    const targets = await db.sRTargetSetup.findMany({
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
  try {
    const body = await request.json();
    const { employeeId, month, year, targetAmount, isActive } = body;

    if (!employeeId || month === undefined || year === undefined || targetAmount === undefined) {
      return NextResponse.json(
        { error: 'employeeId, month, year, and targetAmount are required' },
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
