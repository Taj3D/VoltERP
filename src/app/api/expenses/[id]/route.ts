import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity, checkPeriodClose } from '@/lib/api-security';

// GET /api/expenses/[id] - Get single expense with full includes
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Expenses', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const expense = await db.expense.findUnique({
      where: { id },
      include: {
        head: true,
        paymentOption: true,
        bank: true,
      },
    });

    if (!expense) {
      return NextResponse.json(
        { error: 'Expense not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(expense);
  } catch (error) {
    console.error('Error fetching expense:', error);
    return NextResponse.json(
      { error: 'Failed to fetch expense' },
      { status: 500 }
    );
  }
}

// PUT /api/expenses/[id] - Update expense (expenseCode is immutable)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Expenses', 'PUT');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const body = await request.json();
    const { date, headId, amount, paymentOptionId, bankId, description, status } = body;

    // Fetch existing record for bank adjustment logic and period check
    const existing = await db.expense.findUnique({
      where: { id },
      select: {
        expenseCode: true,
        bankId: true,
        amount: true,
        status: true,
        isActive: true,
        date: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Expense not found' },
        { status: 404 }
      );
    }

    // Period-close lock check
    const checkDate = date ? new Date(date) : (existing.date || new Date());
    const periodLock = await checkPeriodClose(checkDate);
    if (periodLock) return periodLock;

    // expenseCode is immutable — cannot be changed
    const result = await db.$transaction(async (tx) => {
      const newAmount = amount !== undefined ? parseFloat(String(amount)) : existing.amount;
      const newBankId = bankId !== undefined ? (bankId || null) : existing.bankId;
      const newStatus = status || existing.status;
      const oldBankId = existing.bankId;
      const oldAmount = existing.amount;
      const oldStatus = existing.status;

      // Bank balance adjustment: reverse old, apply new
      // If old expense had bankId and was Approved, reverse the decrement (increment back)
      if (oldBankId && oldStatus === 'Approved') {
        await tx.bank.update({
          where: { id: oldBankId },
          data: {
            currentBalance: {
              increment: oldAmount,
            },
          },
        });
      }

      // If new expense has bankId and is Approved, apply the decrement
      if (newBankId && newStatus === 'Approved') {
        await tx.bank.update({
          where: { id: newBankId },
          data: {
            currentBalance: {
              decrement: newAmount,
            },
          },
        });
      }

      // Resolve head name for ledger if headId changed
      let headName: string | null = null;
      if (headId) {
        const head = await tx.expenseIncomeHead.findUnique({
          where: { id: headId },
          select: { name: true },
        });
        headName = head?.name || null;
      }

      // Update the expense (expenseCode is NOT updated — immutable)
      const expense = await tx.expense.update({
        where: { id },
        data: {
          ...(date !== undefined && { date: new Date(date) }),
          ...(headId !== undefined && { headId }),
          ...(amount !== undefined && { amount: newAmount }),
          ...(paymentOptionId !== undefined && { paymentOptionId: paymentOptionId || null }),
          ...(bankId !== undefined && { bankId: newBankId }),
          ...(description !== undefined && { description: description || null }),
          ...(status !== undefined && { status }),
        },
        include: {
          head: true,
          paymentOption: true,
          bank: true,
        },
      });

      // Create AuditLog entry for update
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'Expenses',
          recordId: expense.id,
          recordLabel: existing.expenseCode,
          details: JSON.stringify({
            previousBankId: oldBankId,
            newBankId,
            previousAmount: oldAmount,
            newAmount,
            previousStatus: oldStatus,
            newStatus,
            bankBalanceAdjusted: !!(oldBankId || newBankId),
          }),
        },
      });

      return expense;
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Error updating expense:', error);
    const message = error instanceof Error ? error.message : 'Failed to update expense';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/expenses/[id] - Soft delete (isActive=false)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Expenses', 'DELETE');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;

    const existing = await db.expense.findUnique({
      where: { id },
      select: { expenseCode: true, isActive: true, bankId: true, amount: true, status: true, date: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Expense not found' },
        { status: 404 }
      );
    }

    if (!existing.isActive) {
      return NextResponse.json(
        { error: 'Expense is already deleted' },
        { status: 400 }
      );
    }

    // Period-close lock check
    const periodLock = await checkPeriodClose(existing.date || new Date());
    if (periodLock) return periodLock;

    await db.$transaction(async (tx) => {
      // If the expense had a bank and was Approved, reverse the balance decrement
      if (existing.bankId && existing.status === 'Approved') {
        await tx.bank.update({
          where: { id: existing.bankId },
          data: {
            currentBalance: {
              increment: existing.amount,
            },
          },
        });
      }

      // Soft delete
      await tx.expense.update({
        where: { id },
        data: { isActive: false },
      });

      // Create AuditLog entry
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'Expenses',
          recordId: id,
          recordLabel: existing.expenseCode,
          details: JSON.stringify({
            softDelete: true,
            bankBalanceReversed: !!(existing.bankId && existing.status === 'Approved'),
          }),
        },
      });
    });

    return NextResponse.json({ message: 'Expense deleted successfully' });
  } catch (error) {
    console.error('Error deleting expense:', error);
    return NextResponse.json(
      { error: 'Failed to delete expense' },
      { status: 500 }
    );
  }
}
