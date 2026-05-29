import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  checkPeriodClose,
  maskForVatAuditorFinancial,
  checkFinancialDeletePermission,
  safeFinancialRound,
  safeFinancialAdd,
  safeFinancialSubtract,
} from '@/lib/api-security';

// GET /api/expenses/[id] - Get single expense with cross-tenant validation + VAT Auditor masking
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Expenses', 'GET');
  if (!security.authorized) return security.response;

  const { role, companyId } = security.user;

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

    // Cross-tenant validation: if user has a companyId, record must match
    if (companyId && expense.companyId && expense.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Expense not found' },
        { status: 404 }
      );
    }

    // Apply VAT Auditor financial masking
    const maskedExpense = maskForVatAuditorFinancial(
      expense as Record<string, unknown>,
      role
    );
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
// Includes cross-tenant validation, safe arithmetic for bank balance updates
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Expenses', 'PUT');
  if (!security.authorized) return security.response;

  const { id: userId, name: userName, role, companyId } = security.user;

  try {
    const { id } = await params;
    const body = await request.json();
    const {
      date,
      headId,
      amount,
      paymentOptionId,
      bankId,
      chequeNo,
      voucherNo,
      description,
      status,
    } = body;

    // Fetch existing record for cross-tenant validation, bank adjustment, ledger reversal
    const existing = await db.expense.findUnique({
      where: { id },
      select: {
        expenseCode: true,
        headId: true,
        bankId: true,
        amount: true,
        status: true,
        isActive: true,
        date: true,
        companyId: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Expense not found' },
        { status: 404 }
      );
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Expense not found' },
        { status: 404 }
      );
    }

    // Period-close lock check
    const checkDate = date ? new Date(date) : (existing.date || new Date());
    const periodLock = await checkPeriodClose(checkDate);
    if (periodLock) return periodLock;

    // Clean empty optional string fields → null
    const cleanChequeNo = chequeNo && String(chequeNo).trim() !== '' ? String(chequeNo) : undefined;
    const cleanVoucherNo = voucherNo && String(voucherNo).trim() !== '' ? String(voucherNo) : undefined;
    const cleanDescription = description !== undefined
      ? (String(description).trim() !== '' ? String(description) : null)
      : undefined;

    // expenseCode is immutable — cannot be changed
    const result = await db.$transaction(async (tx) => {
      const newAmount = amount !== undefined
        ? safeFinancialRound(parseFloat(String(amount)))
        : existing.amount;
      const newBankId = bankId !== undefined ? (bankId ? String(bankId) : null) : existing.bankId;
      const newHeadId = headId !== undefined ? String(headId) : existing.headId;
      const newStatus = status ? String(status) : existing.status;
      const oldBankId = existing.bankId;
      const oldAmount = existing.amount;
      const oldStatus = existing.status;
      const oldHeadId = existing.headId;
      const expenseDate = date ? new Date(date) : existing.date;

      // ──────────────────────────────────────────────────────────
      // STEP 1: Reverse old bank balance (safeFinancialAdd) if old status was Approved
      // ──────────────────────────────────────────────────────────
      if (oldBankId && oldStatus === 'Approved') {
        const oldBankRecord = await tx.bank.findUnique({
          where: { id: oldBankId },
          select: { currentBalance: true },
        });
        if (oldBankRecord) {
          const reversedBalance = safeFinancialAdd(oldBankRecord.currentBalance, oldAmount);
          await tx.bank.update({
            where: { id: oldBankId },
            data: { currentBalance: reversedBalance },
          });
        }
      }

      // ──────────────────────────────────────────────────────────
      // STEP 2: Create reversal ledger entries for the old state
      // ──────────────────────────────────────────────────────────
      if (oldStatus === 'Approved') {
        let oldHeadName = 'Unknown';
        if (oldHeadId) {
          const oldHead = await tx.expenseIncomeHead.findUnique({
            where: { id: oldHeadId },
            select: { name: true },
          });
          oldHeadName = oldHead?.name || 'Unknown';
        }

        let oldCashAccountName = 'Cash in Hand';
        if (oldBankId) {
          const oldBankRecord = await tx.bank.findUnique({
            where: { id: oldBankId },
            select: { bankName: true },
          });
          oldCashAccountName = oldBankRecord?.bankName || 'Bank';
        }

        // Reversal entry 1: Cr: [old head name] — reverses the original debit
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

        // Reversal entry 2: Dr: [old cash/bank] — reverses the original credit
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

      // ──────────────────────────────────────────────────────────
      // STEP 3: Apply new bank balance (safeFinancialSubtract) if new status is Approved
      // ──────────────────────────────────────────────────────────
      if (newBankId && newStatus === 'Approved') {
        const newBankRecord = await tx.bank.findUnique({
          where: { id: newBankId },
          select: { currentBalance: true },
        });
        if (newBankRecord) {
          const newBalance = safeFinancialSubtract(newBankRecord.currentBalance, newAmount);
          await tx.bank.update({
            where: { id: newBankId },
            data: { currentBalance: newBalance },
          });
        }
      }

      // ──────────────────────────────────────────────────────────
      // STEP 4: Create new ledger entries for the updated state
      // ──────────────────────────────────────────────────────────
      if (newStatus === 'Approved') {
        let newHeadName = 'Unknown';
        if (newHeadId) {
          const head = await tx.expenseIncomeHead.findUnique({
            where: { id: newHeadId },
            select: { name: true },
          });
          newHeadName = head?.name || 'Unknown';
        }

        let newCashAccountName = 'Cash in Hand';
        if (newBankId) {
          const newBankRecord = await tx.bank.findUnique({
            where: { id: newBankId },
            select: { bankName: true },
          });
          newCashAccountName = newBankRecord?.bankName || 'Bank';
        }

        const newParticulars = cleanDescription || 'Expense updated';

        // Dr: [new head name] with NEW amount
        await tx.ledgerEntry.create({
          data: {
            date: expenseDate,
            account: newHeadName,
            particulars: newParticulars,
            debit: newAmount,
            credit: 0,
            reference: existing.expenseCode,
            referenceType: 'Expense',
          },
        });

        // Cr: [new cash/bank] with NEW amount
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

      // ──────────────────────────────────────────────────────────
      // STEP 5: Update the expense record (expenseCode is immutable)
      // ──────────────────────────────────────────────────────────
      const expense = await tx.expense.update({
        where: { id },
        data: {
          ...(date !== undefined && { date: new Date(date) }),
          ...(headId !== undefined && { headId: newHeadId }),
          ...(amount !== undefined && { amount: newAmount }),
          ...(paymentOptionId !== undefined && { paymentOptionId: paymentOptionId ? String(paymentOptionId) : null }),
          ...(bankId !== undefined && { bankId: newBankId }),
          ...(chequeNo !== undefined && { chequeNo: cleanChequeNo ?? null }),
          ...(voucherNo !== undefined && { voucherNo: cleanVoucherNo ?? null }),
          ...(description !== undefined && { description: cleanDescription ?? null }),
          ...(status !== undefined && { status: newStatus }),
        },
        include: {
          head: true,
          paymentOption: true,
          bank: true,
        },
      });

      // ──────────────────────────────────────────────────────────
      // STEP 6: AuditLog entry — module token: Fin-Ledger-Transaction
      // ──────────────────────────────────────────────────────────
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'Fin-Ledger-Transaction',
          recordId: expense.id,
          recordLabel: existing.expenseCode,
          userId,
          userName,
          details: JSON.stringify({
            type: 'Expense',
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
// Only admin can delete financial posts (checkFinancialDeletePermission)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Expenses', 'DELETE');
  if (!security.authorized) return security.response;

  const { id: userId, name: userName, role, companyId } = security.user;

  // Manager delete restriction: only admin can delete financial posts
  const deleteCheck = checkFinancialDeletePermission(role);
  if (deleteCheck) return deleteCheck;

  try {
    const { id } = await params;

    const existing = await db.expense.findUnique({
      where: { id },
      select: {
        expenseCode: true,
        isActive: true,
        bankId: true,
        amount: true,
        status: true,
        date: true,
        companyId: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Expense not found' },
        { status: 404 }
      );
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
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
      // Reverse bank balance with safeFinancialAdd if expense was Approved
      if (existing.bankId && existing.status === 'Approved') {
        const bankRecord = await tx.bank.findUnique({
          where: { id: existing.bankId },
          select: { currentBalance: true },
        });
        if (bankRecord) {
          const reversedBalance = safeFinancialAdd(bankRecord.currentBalance, existing.amount);
          await tx.bank.update({
            where: { id: existing.bankId },
            data: { currentBalance: reversedBalance },
          });
        }
      }

      // Soft delete
      await tx.expense.update({
        where: { id },
        data: { isActive: false },
      });

      // AuditLog entry — module token: Fin-Ledger-Transaction
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'Fin-Ledger-Transaction',
          recordId: id,
          recordLabel: existing.expenseCode,
          userId,
          userName,
          details: JSON.stringify({
            type: 'Expense',
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
