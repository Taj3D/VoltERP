import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/sr-targets/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const target = await db.sRTargetSetup.findUnique({
      where: { id },
      include: {
        employee: true,
      },
    });

    if (!target) {
      return NextResponse.json(
        { error: 'SR target not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(target);
  } catch (error) {
    console.error('Error fetching SR target:', error);
    return NextResponse.json(
      { error: 'Failed to fetch SR target' },
      { status: 500 }
    );
  }
}

// PUT /api/sr-targets/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { employeeId, month, year, targetAmount, isActive } = body;

    const result = await db.$transaction(async (tx) => {
      const target = await tx.sRTargetSetup.update({
        where: { id },
        data: {
          ...(employeeId && { employeeId }),
          ...(month !== undefined && { month }),
          ...(year !== undefined && { year }),
          ...(targetAmount !== undefined && { targetAmount }),
          ...(isActive !== undefined && { isActive }),
        },
        include: {
          employee: true,
        },
      });

      return target;
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating SR target:', error);
    return NextResponse.json(
      { error: 'Failed to update SR target' },
      { status: 500 }
    );
  }
}

// DELETE /api/sr-targets/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await db.$transaction(async (tx) => {
      await tx.sRTargetSetup.delete({
        where: { id },
      });
    });

    return NextResponse.json({ message: 'SR target deleted successfully' });
  } catch (error) {
    console.error('Error deleting SR target:', error);
    return NextResponse.json(
      { error: 'Failed to delete SR target' },
      { status: 500 }
    );
  }
}
