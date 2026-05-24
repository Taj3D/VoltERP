import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const items = await db.employee.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        designation: true,
        department: true,
      },
    });
    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch employees' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const item = await db.$transaction(async (tx) => {
      let employeeCode = body.employeeCode;
      if (!employeeCode) {
        const lastEmployee = await tx.employee.findFirst({
          orderBy: { createdAt: 'desc' },
          select: { employeeCode: true },
        });
        let nextNum = 1;
        if (lastEmployee?.employeeCode) {
          const match = lastEmployee.employeeCode.match(/EMP-(\d+)/);
          if (match) nextNum = parseInt(match[1]) + 1;
        }
        employeeCode = `EMP-${String(nextNum).padStart(3, '0')}`;
      }

      return tx.employee.create({
        data: {
          employeeCode,
          name: body.name,
          designationId: body.designationId,
          departmentId: body.departmentId,
          joiningDate: body.joiningDate ? new Date(body.joiningDate) : new Date(),
          phone: body.phone || null,
          address: body.address || null,
          photo: body.photo || null,
          isActive: body.isActive ?? true,
        },
        include: {
          designation: true,
          department: true,
        },
      });
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create employee' }, { status: 500 });
  }
}
