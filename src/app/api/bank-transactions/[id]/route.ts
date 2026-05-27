import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity, checkPeriodClose } from '@/lib/api-security';

// GET /api/bank-transactions/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'BankTransactions', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const item = await db.bankTransaction.findUnique({
      where: { id },
      include: {
        bank: true,
        toBank: true,
      },
    });

    if (!item) {
      return NextResponse.json(
        { error: 'Bank transaction not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(item);
  } catch (error) {
    console.error('Error fetching bank transaction:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bank transaction' },
      { status: 500 }
    );
  }
}

// PUT /api/bank-transactions/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'BankTransactions', 'PUT');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const body = await request.json();
    const { bankId, date, type, amount, toBankId, description, status } = body;

    // Fetch existing record
    const existing = await db.bankTransaction.findUnique({
      where: { id },
      include: { bank: true, toBank: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Bank transaction not found' },
        { status: 404 }
      );
    }

    // Period-close lock check
    const checkDate = date ? new Date(date) : (existing.date || new Date());
    const periodLock = await checkPeriodClose(checkDate);
    if (periodLock) return periodLock;

    // transactionCode is immutable
    if (body.transactionCode && body.transactionCode !== existing.transactionCode) {
      return NextResponse.json(
        { error: 'Transaction code cannot be changed' },
        { status: 400 }
      );
    }

    // type is immutable
    if (type && type !== existing.type) {
      return NextResponse.json(
        { error: 'Transaction type cannot be changed after creation' },
        { status: 400 }
      );
    }

    const effectiveType = existing.type;
    const effectiveBankId = bankId || existing.bankId;
    const effectiveToBankId = toBankId !== undefined ? toBankId : existing.toBankId;
    const effectiveAmount = amount !== undefined ? Number(amount) : existing.amount;
    const effectiveDate = date ? new Date(date) : existing.date;

    // Check if balance-affecting fields changed
    const amountChanged = effectiveAmount !== existing.amount;
    const bankChanged = effectiveBankId !== existing.bankId;
    const toBankChanged = effectiveToBankId !== existing.toBankId;
    const needsBalanceUpdate = amountChanged || bankChanged || toBankChanged;

    const result = await db.$transaction(async (tx) => {
      if (needsBalanceUpdate) {
        // ── Reverse old impact ──────────────────────────────────
        if (existing.type === 'Deposit') {
          // Old deposit incremented balance → decrement to reverse
          await tx.bank.update({
            where: { id: existing.bankId },
            data: { currentBalance: { decrement: existing.amount } },
          });
        } else if (existing.type === 'Withdraw') {
          // Old withdrawal decremented balance → increment to reverse
          await tx.bank.update({
            where: { id: existing.bankId },
            data: { currentBalance: { increment: existing.amount } },
          });
        } else if (existing.type === 'Transfer') {
          // Old transfer: source decremented, target incremented → reverse both
          await tx.bank.update({
            where: { id: existing.bankId },
            data: { currentBalance: { increment: existing.amount } },
          });
          if (existing.toBankId) {
            await tx.bank.update({
              where: { id: existing.toBankId },
              data: { currentBalance: { decrement: existing.amount } },
            });
          }
        }

        // ── Apply new impact ────────────────────────────────────
        if (effectiveType === 'Deposit') {
          const bank = await tx.bank.findUnique({
            where: { id: effectiveBankId },
          });
          if (!bank)
            throw new Error(`Bank with id ${effectiveBankId} not found`);

          const updatedBalance = bank.currentBalance + effectiveAmount;
          await tx.bank.update({
            where: { id: effectiveBankId },
            data: { currentBalance: updatedBalance },
          });

          const updated = await tx.bankTransaction.update({
            where: { id },
            data: {
              bankId: effectiveBankId,
              date: effectiveDate,
              amount: effectiveAmount,
              runningBalance: updatedBalance,
              description:
                description !== undefined ? description || null : existing.description,
              status: status || existing.status,
            },
            include: { bank: true, toBank: true },
          });

          await tx.auditLog.create({
            data: {
              action: 'UPDATE',
              module: 'BankTransactions',
              recordId: id,
              recordLabel: existing.transactionCode,
              userId: security.user.id,
              userName: security.user.name,
              details: JSON.stringify({
                type: effectiveType,
                amountChanged,
                oldAmount: existing.amount,
                newAmount: effectiveAmount,
                bankChanged,
                runningBalance: updatedBalance,
              }),
            },
          });

          return updated;
        }

        if (effectiveType === 'Withdraw') {
          const bank = await tx.bank.findUnique({
            where: { id: effectiveBankId },
          });
          if (!bank)
            throw new Error(`Bank with id ${effectiveBankId} not found`);

          if (bank.currentBalance < effectiveAmount) {
            throw new Error(
              `Insufficient bank balance. Available: ${bank.currentBalance}, Requested: ${effectiveAmount}`
            );
          }

          const updatedBalance = bank.currentBalance - effectiveAmount;
          await tx.bank.update({
            where: { id: effectiveBankId },
            data: { currentBalance: updatedBalance },
          });

          const updated = await tx.bankTransaction.update({
            where: { id },
            data: {
              bankId: effectiveBankId,
              date: effectiveDate,
              amount: effectiveAmount,
              runningBalance: updatedBalance,
              description:
                description !== undefined ? description || null : existing.description,
              status: status || existing.status,
            },
            include: { bank: true, toBank: true },
          });

          await tx.auditLog.create({
            data: {
              action: 'UPDATE',
              module: 'BankTransactions',
              recordId: id,
              recordLabel: existing.transactionCode,
              userId: security.user.id,
              userName: security.user.name,
              details: JSON.stringify({
                type: effectiveType,
                amountChanged,
                oldAmount: existing.amount,
                newAmount: effectiveAmount,
                bankChanged,
                runningBalance: updatedBalance,
              }),
            },
          });

          return updated;
        }

        if (effectiveType === 'Transfer') {
          if (!effectiveToBankId) {
            throw new Error(
              'toBankId is required for Transfer transactions'
            );
          }

          const sourceBank = await tx.bank.findUnique({
            where: { id: effectiveBankId },
          });
          if (!sourceBank)
            throw new Error(
              `Source bank with id ${effectiveBankId} not found`
            );

          const targetBank = await tx.bank.findUnique({
            where: { id: effectiveToBankId },
          });
          if (!targetBank)
            throw new Error(
              `Target bank with id ${effectiveToBankId} not found`
            );

          if (sourceBank.currentBalance < effectiveAmount) {
            throw new Error(
              `Insufficient bank balance. Available: ${sourceBank.currentBalance}, Requested: ${effectiveAmount}`
            );
          }

          const sourceUpdatedBalance =
            sourceBank.currentBalance - effectiveAmount;
          const targetUpdatedBalance =
            targetBank.currentBalance + effectiveAmount;

          await tx.bank.update({
            where: { id: effectiveBankId },
            data: { currentBalance: sourceUpdatedBalance },
          });
          await tx.bank.update({
            where: { id: effectiveToBankId },
            data: { currentBalance: targetUpdatedBalance },
          });

          // Update source transaction
          const updated = await tx.bankTransaction.update({
            where: { id },
            data: {
              bankId: effectiveBankId,
              date: effectiveDate,
              amount: effectiveAmount,
              runningBalance: sourceUpdatedBalance,
              toBankId: effectiveToBankId,
              description:
                description !== undefined ? description || null : existing.description,
              status: status || existing.status,
            },
            include: { bank: true, toBank: true },
          });

          // Also update the paired target transaction
          const pairedTransaction = await tx.bankTransaction.findFirst({
            where: {
              bankId: existing.toBankId || '',
              toBankId: existing.bankId,
              type: 'Deposit',
              amount: existing.amount,
              isActive: true,
            },
          });

          if (pairedTransaction) {
            await tx.bankTransaction.update({
              where: { id: pairedTransaction.id },
              data: {
                bankId: effectiveToBankId,
                amount: effectiveAmount,
                runningBalance: targetUpdatedBalance,
                toBankId: effectiveBankId,
                date: effectiveDate,
                description:
                  description !== undefined
                    ? description || null
                    : `Transfer from ${sourceBank.bankName}`,
                status: status || existing.status,
              },
            });
          }

          await tx.auditLog.create({
            data: {
              action: 'UPDATE',
              module: 'BankTransactions',
              recordId: id,
              recordLabel: existing.transactionCode,
              userId: security.user.id,
              userName: security.user.name,
              details: JSON.stringify({
                type: 'Transfer',
                amountChanged,
                oldAmount: existing.amount,
                newAmount: effectiveAmount,
                bankChanged,
                toBankChanged,
                sourceRunningBalance: sourceUpdatedBalance,
                targetRunningBalance: targetUpdatedBalance,
                pairedTransactionUpdated: !!pairedTransaction,
              }),
            },
          });

          return updated;
        }
      }

      // ── No balance-affecting changes ── simple update ─────────
      const updated = await tx.bankTransaction.update({
        where: { id },
        data: {
          ...(date && { date: new Date(date) }),
          ...(description !== undefined && { description: description || null }),
          ...(status && { status }),
        },
        include: { bank: true, toBank: true },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'BankTransactions',
          recordId: id,
          recordLabel: existing.transactionCode,
              userId: security.user.id,
              userName: security.user.name,
          details: JSON.stringify({
            type: effectiveType,
            balanceImpact: false,
          }),
        },
      });

      return updated;
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Error updating bank transaction:', error);
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to update bank transaction';
    const statusCode =
      message.includes('Insufficient') ||
      message.includes('not found') ||
      message.includes('cannot be changed') ||
      message.includes('required')
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}

// DELETE /api/bank-transactions/[id] - Soft delete with balance reversal
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'BankTransactions', 'DELETE');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;

    const existing = await db.bankTransaction.findUnique({
      where: { id },
      include: { bank: true, toBank: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Bank transaction not found' },
        { status: 404 }
      );
    }

    if (!existing.isActive) {
      return NextResponse.json(
        { error: 'Bank transaction is already deleted' },
        { status: 400 }
      );
    }

    // Period-close lock check
    const periodLock = await checkPeriodClose(existing.date || new Date());
    if (periodLock) return periodLock;

    await db.$transaction(async (tx) => {
      // Soft delete
      await tx.bankTransaction.update({
        where: { id },
        data: { isActive: false },
      });

      // Reverse bank balance impact
      if (existing.type === 'Deposit') {
        // Deposit had incremented balance → decrement to reverse
        await tx.bank.update({
          where: { id: existing.bankId },
          data: { currentBalance: { decrement: existing.amount } },
        });
      } else if (existing.type === 'Withdraw') {
        // Withdrawal had decremented balance → increment to reverse
        await tx.bank.update({
          where: { id: existing.bankId },
          data: { currentBalance: { increment: existing.amount } },
        });
      } else if (existing.type === 'Transfer') {
        // Transfer: source was decremented, target was incremented → reverse both
        await tx.bank.update({
          where: { id: existing.bankId },
          data: { currentBalance: { increment: existing.amount } },
        });
        if (existing.toBankId) {
          await tx.bank.update({
            where: { id: existing.toBankId },
            data: { currentBalance: { decrement: existing.amount } },
          });

          // Also soft-delete the paired target transaction
          const pairedTransaction = await tx.bankTransaction.findFirst({
            where: {
              bankId: existing.toBankId,
              toBankId: existing.bankId,
              type: 'Deposit',
              amount: existing.amount,
              isActive: true,
            },
          });

          if (pairedTransaction) {
            await tx.bankTransaction.update({
              where: { id: pairedTransaction.id },
              data: { isActive: false },
            });
          }
        }
      }

      // AuditLog
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'BankTransactions',
          recordId: id,
          recordLabel: existing.transactionCode,
              userId: security.user.id,
              userName: security.user.name,
          details: JSON.stringify({
            softDelete: true,
            type: existing.type,
            amount: existing.amount,
            bankId: existing.bankId,
            bankName: existing.bank?.bankName,
            toBankId: existing.toBankId,
            toBankName: existing.toBank?.bankName,
          }),
        },
      });
    });

    return NextResponse.json({ message: 'Bank transaction deleted successfully' });
  } catch (error) {
    console.error('Error deleting bank transaction:', error);
    return NextResponse.json(
      { error: 'Failed to delete bank transaction' },
      { status: 500 }
    );
  }
}
