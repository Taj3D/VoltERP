import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity, checkPeriodClose, maskForVatAuditor } from '@/lib/api-security';

// GET /api/incomes/[id] - Get single income with full includes
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Incomes', 'GET');
  if (!security.authorized) return security.response;
  const role = security.user.role;

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

    const maskedIncome = maskForVatAuditor(income, role, ['amount']);
    return NextResponse.json(maskedIncome);
  } catch (error) {
    console.error('Error fetching income:', error);
    return NextResponse.json(
      { error: 'Failed to fetch income' },
      { status: 500 }
    );
  }
}

// PUT /api/incomes/[id] - Update income (incomeCode is immutable)
// Includes balanced double-entry ledger reversal + re-entry (Dr = Cr)
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

    // Fetch existing record for bank adjustment logic, ledger reversal, and period check
    const existing = await db.income.findUnique({
      where: { id },
      select: {
        incomeCode: true,
        headId: true,
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
      const newHeadId = headId !== undefined ? headId : existing.headId;
      const newBankId = bankId !== undefined ? (bankId || null) : existing.bankId;
      const newStatus = status || existing.status;
      const oldBankId = existing.bankId;
      const oldAmount = existing.amount;
      const oldStatus = existing.status;
      const oldHeadId = existing.headId;

      // ────────────────────────────────────────────────────────
      // STEP 1: Bank balance adjustment — reverse old
      // ────────────────────────────────────────────────────────
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

      // ────────────────────────────────────────────────────────
      // STEP 2: Old ledger reversal (only if oldStatus was 'Approved')
      // ────────────────────────────────────────────────────────
      if (oldStatus === 'Approved') {
        // Resolve old head name for the reversal entry
        let oldHeadName = 'Unknown';
        if (oldHeadId) {
          const oldHead = await tx.expenseIncomeHead.findUnique({
            where: { id: oldHeadId },
            select: { name: true },
          });
          oldHeadName = oldHead?.name || 'Unknown';
        }

        // Resolve old cash/bank account name for the reversal entry
        let oldCashBankAccountName = 'Cash in Hand';
        if (oldBankId) {
          const oldBank = await tx.bank.findUnique({
            where: { id: oldBankId },
            select: { bankName: true },
          });
          oldCashBankAccountName = oldBank?.bankName || 'Bank';
        }

        // Reversal entry 1: Dr: [old head name] with the OLD amount
        // (reverses the original credit to the income head)
        await tx.ledgerEntry.create({
          data: {
            date: existing.date || new Date(),
            account: oldHeadName,
            particulars: 'Reversal: Income update',
            debit: oldAmount,
            credit: 0,
            reference: existing.incomeCode,
            referenceType: 'Income',
          },
        });

        // Reversal entry 2: Cr: [old cash/bank account name] with the OLD amount
        // (reverses the original debit from cash/bank)
        await tx.ledgerEntry.create({
          data: {
            date: existing.date || new Date(),
            account: oldCashBankAccountName,
            particulars: 'Reversal: Income update',
            debit: 0,
            credit: oldAmount,
            reference: existing.incomeCode,
            referenceType: 'Income',
          },
        });
      }

      // ────────────────────────────────────────────────────────
      // STEP 3: Bank balance adjustment — apply new
      // ────────────────────────────────────────────────────────
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

      // ────────────────────────────────────────────────────────
      // STEP 4: New ledger entries (only if newStatus is 'Approved')
      // ────────────────────────────────────────────────────────
      if (newStatus === 'Approved') {
        // Resolve new head name for the ledger entry
        let newHeadName = 'Unknown';
        if (newHeadId) {
          const newHead = await tx.expenseIncomeHead.findUnique({
            where: { id: newHeadId },
            select: { name: true },
          });
          newHeadName = newHead?.name || 'Unknown';
        }

        // Resolve new cash/bank account name for the ledger entry
        let newCashBankAccountName = 'Cash in Hand';
        if (newBankId) {
          const newBank = await tx.bank.findUnique({
            where: { id: newBankId },
            select: { bankName: true },
          });
          newCashBankAccountName = newBank?.bankName || 'Bank';
        }

        const ledgerDate = date ? new Date(date) : (existing.date || new Date());

        // New entry 1: Cr: [new head name] with the NEW amount (income is a credit)
        await tx.ledgerEntry.create({
          data: {
            date: ledgerDate,
            account: newHeadName,
            particulars: description || 'Income updated',
            debit: 0,
            credit: newAmount,
            reference: existing.incomeCode,
            referenceType: 'Income',
          },
        });

        // New entry 2: Dr: [new cash/bank account name] with the NEW amount (cash/bank debit)
        await tx.ledgerEntry.create({
          data: {
            date: ledgerDate,
            account: newCashBankAccountName,
            particulars: description || 'Income updated',
            debit: newAmount,
            credit: 0,
            reference: existing.incomeCode,
            referenceType: 'Income',
          },
        });
      }

      // ────────────────────────────────────────────────────────
      // STEP 5: Update the income record (incomeCode is NOT updated — immutable)
      // ────────────────────────────────────────────────────────
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

      // ────────────────────────────────────────────────────────
      // STEP 6: Create AuditLog entry for update
      // ────────────────────────────────────────────────────────
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'Incomes',
          recordId: income.id,
          recordLabel: existing.incomeCode,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            previousBankId: oldBankId,
            newBankId,
            previousAmount: oldAmount,
            newAmount,
            previousStatus: oldStatus,
            newStatus,
            bankBalanceAdjusted: !!(oldBankId || newBankId),
            ledgerReversed: oldStatus === 'Approved',
            ledgerReEntered: newStatus === 'Approved',
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
          userId: security.user.id,
          userName: security.user.name,
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
