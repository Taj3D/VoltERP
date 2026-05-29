// ============================================================
// Expense/Income Heads [id] API — Multi-tenant Cross-tenant Validation
// Module Token: Fin-Expense-Head
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, checkFinancialDeletePermission } from '@/lib/api-security';

// GET /api/expense-income-heads/[id] — Get single head with cross-tenant validation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'ExpenseIncomeHeads', 'GET');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;
    const item = await db.expenseIncomeHead.findUnique({ where: { id } });

    if (!item) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cross-tenant validation: if user has a companyId and the record has one, they must match
    if (companyId && item.companyId && item.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(item);
  } catch (error) {
    console.error('Error fetching expense/income head:', error);
    return NextResponse.json(
      { error: 'Failed to fetch expense/income head' },
      { status: 500 }
    );
  }
}

// PUT /api/expense-income-heads/[id] — Update with cross-tenant validation & companyId enforcement
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'ExpenseIncomeHeads', 'PUT');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;
    const body = await request.json();

    // Pre-fetch the existing record for cross-tenant validation
    const existing = await db.expenseIncomeHead.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const item = await db.$transaction(async (tx) => {
      const record = await tx.expenseIncomeHead.update({
        where: { id },
        data: {
          name: body.name,
          type: body.type,
          isActive: body.isActive ?? existing.isActive,
          // Enforce companyId — prevent cross-tenant reassignment
          ...(companyId && { companyId }),
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'Fin-Expense-Head',
          recordId: record.id,
          recordLabel: record.name || record.id,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            previousName: existing.name,
            previousType: existing.type,
            newName: record.name,
            newType: record.type,
            companyId,
          }),
        },
      });

      return record;
    });

    return NextResponse.json(item);
  } catch (error) {
    console.error('Error updating expense/income head:', error);
    return NextResponse.json(
      { error: 'Failed to update expense/income head' },
      { status: 500 }
    );
  }
}

// DELETE /api/expense-income-heads/[id] — Soft delete (admin only via checkFinancialDeletePermission)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'ExpenseIncomeHeads', 'DELETE');
  if (!security.authorized) return security.response;

  // Only admin can delete financial posts
  const deleteCheck = checkFinancialDeletePermission(security.user.role);
  if (deleteCheck) return deleteCheck;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;

    // Pre-fetch for cross-tenant validation
    const existing = await db.expenseIncomeHead.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (!existing.isActive) {
      return NextResponse.json(
        { error: 'Expense/Income Head is already deleted' },
        { status: 400 }
      );
    }

    await db.$transaction(async (tx) => {
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

      // Soft delete
      await tx.expenseIncomeHead.update({
        where: { id },
        data: { isActive: false },
      });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'Fin-Expense-Head',
          recordId: existing.id,
          recordLabel: existing.name || existing.id,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            name: existing.name,
            type: existing.type,
            softDelete: true,
            companyId,
          }),
        },
      });
    });

    return NextResponse.json({ success: true, message: 'Expense/Income Head deleted successfully' });
  } catch (error: unknown) {
    if (error instanceof Error && error.message.startsWith('Cannot delete')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error deleting expense/income head:', error);
    return NextResponse.json(
      { error: 'Failed to delete expense/income head' },
      { status: 500 }
    );
  }
}
