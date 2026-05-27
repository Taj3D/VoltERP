import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'ExpenseIncomeHeads', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const item = await db.expenseIncomeHead.findUnique({ where: { id } });
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch expense/income head' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'ExpenseIncomeHeads', 'PUT');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    const body = await request.json();
    const item = await db.$transaction(async (tx) => {
      const record = await tx.expenseIncomeHead.update({
        where: { id },
        data: {
          name: body.name,
          type: body.type,
          isActive: body.isActive ?? true,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'ExpenseIncomeHeads',
          recordId: record.id,
          recordLabel: record.name || record.id,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({ name: record.name, type: record.type }),
        },
      });

      return record;
    });
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update expense/income head' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = await withApiSecurity(request, 'ExpenseIncomeHeads', 'DELETE');
  if (!security.authorized) return security.response;
  try {
    const { id } = await params;
    await db.$transaction(async (tx) => {
      const record = await tx.expenseIncomeHead.findUnique({ where: { id } });
      if (!record) throw new Error('Not found');

      // FK check: Check if head is referenced by active expenses or incomes
      const [activeExpenses, activeIncomes] = await Promise.all([
        tx.expense.count({ where: { headId: id, isActive: true } }),
        tx.income.count({ where: { headId: id, isActive: true } }),
      ]);

      if (activeExpenses > 0 || activeIncomes > 0) {
        throw new Error(
          `Cannot delete: Expense/Income Head is referenced by ${activeExpenses} active expense(s) and ${activeIncomes} active income(s)`
        );
      }

      await tx.expenseIncomeHead.update({
        where: { id },
        data: { isActive: false },
      });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'ExpenseIncomeHeads',
          recordId: record.id,
          recordLabel: record.name || record.id,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({ name: record.name, type: record.type, softDelete: true }),
        },
      });

      return record;
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.message?.startsWith('Cannot delete')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to delete expense/income head' }, { status: 500 });
  }
}
