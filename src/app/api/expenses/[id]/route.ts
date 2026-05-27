import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity, checkPeriodClose, maskForVatAuditor } from '@/lib/api-security';

// GET /api/expenses/[id] - Get single expense with full includes + VAT Auditor masking
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

    // Apply VAT Auditor masking for the amount field
    const role = security.user.role;
    const maskedExpense = maskForVatAuditor(expense, role, ['amount']);
    return NextResponse.json(maskedExpense);
  } catch (error) {
    console.error('Error fetching expense:', error);
    return NextResponse.json(
      { error: 'Failed to fetch expense' },
      { status: 500 }
    );
  }
}

// PUT /api/expenses/[id] - Update expense with balanced double-entry ledger reversal + re-entry
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

    // Fetch existing record for bank adjustment logic, ledger reversal, and period check
    const existing = await db.expense.findUnique({
      where: { id },
      select: {
        expenseCode: true,
        bankId: true,
        amount: true,
        status: true,
        isActive: true,
        date: true,
        headId: true,
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
      const newHeadId = headId !== undefined ? headId : existing.headId;
      const newStatus = status || existing.status;
      const oldBankId = existing.bankId;
      const oldAmount = existing.amount;
      const oldStatus = existing.status;
      const oldHeadId = existing.headId;
      const expenseDate = date ? new Date(date) : existing.date;

      // ============================================================
      // STEP 1: Reverse old bank balance if old status was Approved
      // ============================================================
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

      // ============================================================
      // STEP 2: Create reversal ledger entries for the old state
      // (Only if the old expense was Approved — it would have had ledger entries)
      // ============================================================
      if (oldStatus === 'Approved') {
        // Resolve old head name for reversal
        let oldHeadName = 'Unknown';
        if (oldHeadId) {
          const oldHead = await tx.expenseIncomeHead.findUnique({
            where: { id: oldHeadId },
            select: { name: true },
          });
          oldHeadName = oldHead?.name || 'Unknown';
        }

        // Resolve old cash/bank account name for reversal
        let oldCashAccountName = 'Cash in Hand';
        if (oldBankId) {
          const oldBankRecord = await tx.bank.findUnique({
            where: { id: oldBankId },
            select: { bankName: true },
          });
          oldCashAccountName = oldBankRecord?.bankName || 'Bank';
        }

        // Reversal entry 1: Cr: [old head name] with OLD amount
        // (Reverses the original debit to the expense head)
        await tx.ledgerEntry.create({
          data: {
            date: expenseDate,
            account: oldHeadName,
            particulars: 'Reversal: Expense update',
            debit: 0,
            credit: oldAmount,
            reference: existing.expenseCode,
            referenceType: 'Expense',
          },
        });

        // Reversal entry 2: Dr: [old cash/bank account name] with OLD amount
        // (Reverses the original credit from cash/bank)
        await tx.ledgerEntry.create({
          data: {
            date: expenseDate,
            account: oldCashAccountName,
            particulars: 'Reversal: Expense update',
            debit: oldAmount,
            credit: 0,
            reference: existing.expenseCode,
            referenceType: 'Expense',
          },
        });
      }

      // ============================================================
      // STEP 3: Apply new bank balance if new status is Approved
      // ============================================================
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

      // ============================================================
      // STEP 4: Create new ledger entries for the updated state
      // (Only if the new status is Approved)
      // ============================================================
      if (newStatus === 'Approved') {
        // Resolve new head name for ledger entry
        let newHeadName: string | null = null;
        if (newHeadId) {
          const head = await tx.expenseIncomeHead.findUnique({
            where: { id: newHeadId },
            select: { name: true },
          });
          newHeadName = head?.name || null;
        }

        // Resolve new cash/bank account name for ledger entry
        let newCashAccountName = 'Cash in Hand';
        if (newBankId) {
          const newBankRecord = await tx.bank.findUnique({
            where: { id: newBankId },
            select: { bankName: true },
          });
          newCashAccountName = newBankRecord?.bankName || 'Bank';
        }

        const newParticulars = description || 'Expense updated';

        // New entry 1: Dr: [new head name] with NEW amount
        await tx.ledgerEntry.create({
          data: {
            date: expenseDate,
            account: newHeadName || 'Unknown',
            particulars: newParticulars,
            debit: newAmount,
            credit: 0,
            reference: existing.expenseCode,
            referenceType: 'Expense',
          },
        });

        // New entry 2: Cr: [new cash/bank account name] with NEW amount
        await tx.ledgerEntry.create({
          data: {
            date: expenseDate,
            account: newCashAccountName,
            particulars: newParticulars,
            debit: 0,
            credit: newAmount,
            reference: existing.expenseCode,
            referenceType: 'Expense',
          },
        });
      }

      // ============================================================
      // STEP 5: Update the expense record (expenseCode is NOT updated — immutable)
      // ============================================================
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

      // ============================================================
      // STEP 6: Create AuditLog entry for update
      // ============================================================
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'Expenses',
          recordId: expense.id,
          recordLabel: existing.expenseCode,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            previousBankId: oldBankId,
            newBankId,
            previousAmount: oldAmount,
            newAmount,
            previousStatus: oldStatus,
            newStatus,
            previousHeadId: oldHeadId,
            newHeadId,
            bankBalanceAdjusted: !!(oldBankId || newBankId),
            ledgerReversalCreated: oldStatus === 'Approved',
            ledgerNewEntriesCreated: newStatus === 'Approved',
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
          userId: security.user.id,
          userName: security.user.name,
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
