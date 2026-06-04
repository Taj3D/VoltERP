// ============================================================
// Expense/Income Heads [id] API — Double-Entry CoA Alignment
// Module Token: Fin-Expense-Head
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  maskForVatAuditorFinancial,
  checkFinancialDeletePermission,
  stripHtml,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// GET /api/expense-income-heads/[id] — Get single head with CoA link, cross-tenant validation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'ExpenseIncomeHeads', 'GET');
  if (!security.authorized) return security.response;

  const { role, companyId } = security.user;

  try {
    const { id } = await params;
    const item = await db.expenseIncomeHead.findUnique({
      where: { id },
      include: {
        chartOfAccount: true,
        company: true,
      },
    });

    if (!item || !item.isActive) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cross-tenant validation
    if (companyId && item.companyId && item.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Apply VAT Auditor financial masking
    const maskedItem = maskForVatAuditorFinancial(item as Record<string, unknown>, role);

    return NextResponse.json(maskedItem);
  } catch (error) {
    console.error('Error fetching expense/income head:', error);
    return NextResponse.json(
      { error: 'Failed to fetch expense/income head' },
      { status: 500 }
    );
  }
}

// PUT /api/expense-income-heads/[id] — Update with CoA link, cross-tenant validation
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'ExpenseIncomeHeads', 'PUT');
  if (!security.authorized) return security.response;

  const { id: userId, name: userName, companyId } = security.user;

  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await db.expenseIncomeHead.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (!existing.isActive) {
      return NextResponse.json({ error: 'Head is already deleted' }, { status: 400 });
    }

    // Validate CoA link if changing
    const newChartOfAccountId = body.chartOfAccountId !== undefined
      ? (body.chartOfAccountId ? String(body.chartOfAccountId) : null)
      : existing.chartOfAccountId;

    if (newChartOfAccountId) {
      const coa = await db.chartOfAccount.findUnique({
        where: { id: newChartOfAccountId },
        select: { classification: true, isActive: true },
      });
      if (!coa || !coa.isActive) {
        return NextResponse.json(
          { error: `Chart of Account with id ${newChartOfAccountId} not found or inactive` },
          { status: 400 }
        );
      }
      const headType = body.type || existing.type;
      const expectedClassification = headType === 'Expense' ? 'Expense' : 'Income';
      if (coa.classification !== expectedClassification) {
        return NextResponse.json(
          { error: `CoA classification mismatch: Head type "${headType}" requires CoA classification "${expectedClassification}", but found "${coa.classification}"` },
          { status: 400 }
        );
      }
    }

    // Sanitize text inputs for XSS
    const sanitizedName = body.name !== undefined ? stripHtml(String(body.name)) : undefined;
    const sanitizedType = body.type !== undefined ? String(body.type) : undefined;

    // Case-insensitive duplicate name check if name is being changed (manual toLowerCase for SQLite compatibility)
    if (sanitizedName && sanitizedName !== existing.name) {
      const allHeadsOfType = await db.expenseIncomeHead.findMany({
        where: { type: sanitizedType || existing.type, isActive: true },
        select: { name: true },
      });
      const dupHead = allHeadsOfType.find(h => h.name.toLowerCase() === sanitizedName.toLowerCase() && h.id !== existing.id);
      if (dupHead) {
        return NextResponse.json(
          { error: `A ${(sanitizedType || existing.type)} head with name "${sanitizedName}" already exists` },
          { status: 400 }
        );
      }
    }

    const item = await db.$transaction(async (tx) => {
      const record = await tx.expenseIncomeHead.update({
        where: { id },
        data: {
          ...(sanitizedName !== undefined && { name: sanitizedName }),
          ...(sanitizedType !== undefined && { type: sanitizedType }),
          ...(body.chartOfAccountId !== undefined && { chartOfAccountId: newChartOfAccountId }),
          isActive: body.isActive ?? existing.isActive,
          ...(companyId && { companyId }),
        },
        include: {
          chartOfAccount: true,
          company: true,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'Fin-Expense-Head',
          recordId: record.id,
          recordLabel: record.name || record.id,
          userId,
          userName,
          details: JSON.stringify({
            previousName: existing.name,
            previousType: existing.type,
            previousChartOfAccountId: existing.chartOfAccountId,
            newName: record.name,
            newType: record.type,
            newChartOfAccountId: record.chartOfAccountId,
            companyId,
          }),
        },
      });

      await logUserActivity({
          tx: tx,
        action: 'UPDATE',
        module: 'Fin-Expense-Head',
        recordId: record.id,
        recordLabel: existing.code || record.name,
        userId,
        userName,
        details: `Updated head: ${existing.name} → ${record.name}`,
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

// DELETE /api/expense-income-heads/[id] — Soft delete (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'ExpenseIncomeHeads', 'DELETE');
  if (!security.authorized) return security.response;

  const deleteCheck = checkFinancialDeletePermission(security.user.role);
  if (deleteCheck) return deleteCheck;

  const { id: userId, name: userName, companyId } = security.user;

  try {
    const { id } = await params;

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
          userId,
          userName,
          details: JSON.stringify({
            name: existing.name,
            type: existing.type,
            chartOfAccountId: existing.chartOfAccountId,
            softDelete: true,
            companyId,
          }),
        },
      });

      await logUserActivity({
          tx: tx,
        action: 'DELETE',
        module: 'Fin-Expense-Head',
        recordId: existing.id,
        recordLabel: existing.code || existing.name,
        userId,
        userName,
        details: `Soft-deleted head: ${existing.name} (${existing.type})`,
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
