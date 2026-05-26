import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity, checkPeriodClose } from '@/lib/api-security';

// GET /api/incomes/[id] - Get single income with full includes
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Incomes', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const income = await db.income.findUnique({
      where: { id },
      include: {
        head: true,
        paymentOption: true,
        bank: true,
      },
    });

    if (!income) {
      return NextResponse.json(
        { error: 'Income not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(income);
  } catch (error) {
    console.error('Error fetching income:', error);
    return NextResponse.json(
      { error: 'Failed to fetch income' },
      { status: 500 }
    );
  }
}

// PUT /api/incomes/[id] - Update income (incomeCode is immutable)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Incomes', 'PUT');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const body = await request.json();
    const { date, headId, amount, paymentOptionId, bankId, description, status } = body;

    // Fetch existing record for bank adjustment logic and period check
    const existing = await db.income.findUnique({
      where: { id },
      select: {
        incomeCode: true,
        bankId: true,
        amount: true,
        status: true,
        isActive: true,
        date: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Income not found' },
        { status: 404 }
      );
    }

    // Period-close lock check
    const checkDate = date ? new Date(date) : (existing.date || new Date());
    const periodLock = await checkPeriodClose(checkDate);
    if (periodLock) return periodLock;

    // incomeCode is immutable — cannot be changed
    const result = await db.$transaction(async (tx) => {
      const newAmount = amount !== undefined ? parseFloat(String(amount)) : existing.amount;
      const newBankId = bankId !== undefined ? (bankId || null) : existing.bankId;
      const newStatus = status || existing.status;
      const oldBankId = existing.bankId;
      const oldAmount = existing.amount;
      const oldStatus = existing.status;

      // Bank balance adjustment: reverse old, apply new
      // If old income had bankId and was Approved, reverse the increment (decrement back)
      if (oldBankId && oldStatus === 'Approved') {
        await tx.bank.update({
          where: { id: oldBankId },
          data: {
            currentBalance: {
              decrement: oldAmount,
            },
          },
        });
      }

      // If new income has bankId and is Approved, apply the increment
      if (newBankId && newStatus === 'Approved') {
        await tx.bank.update({
          where: { id: newBankId },
          data: {
            currentBalance: {
              increment: newAmount,
            },
          },
        });
      }

      // Update the income (incomeCode is NOT updated — immutable)
      const income = await tx.income.update({
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
          module: 'Incomes',
          recordId: income.id,
          recordLabel: existing.incomeCode,
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

      return income;
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Error updating income:', error);
    const message = error instanceof Error ? error.message : 'Failed to update income';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/incomes/[id] - Soft delete (isActive=false)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Incomes', 'DELETE');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;

    const existing = await db.income.findUnique({
      where: { id },
      select: { incomeCode: true, isActive: true, bankId: true, amount: true, status: true, date: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Income not found' },
        { status: 404 }
      );
    }

    if (!existing.isActive) {
      return NextResponse.json(
        { error: 'Income is already deleted' },
        { status: 400 }
      );
    }

    // Period-close lock check
    const periodLock = await checkPeriodClose(existing.date || new Date());
    if (periodLock) return periodLock;

    await db.$transaction(async (tx) => {
      // If the income had a bank and was Approved, reverse the balance increment
      if (existing.bankId && existing.status === 'Approved') {
        await tx.bank.update({
          where: { id: existing.bankId },
          data: {
            currentBalance: {
              decrement: existing.amount,
            },
          },
        });
      }

      // Soft delete
      await tx.income.update({
        where: { id },
        data: { isActive: false },
      });

      // Create AuditLog entry
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'Incomes',
          recordId: id,
          recordLabel: existing.incomeCode,
          details: JSON.stringify({
            softDelete: true,
            bankBalanceReversed: !!(existing.bankId && existing.status === 'Approved'),
          }),
        },
      });
    });

    return NextResponse.json({ message: 'Income deleted successfully' });
  } catch (error) {
    console.error('Error deleting income:', error);
    return NextResponse.json(
      { error: 'Failed to delete income' },
      { status: 500 }
    );
  }
}
