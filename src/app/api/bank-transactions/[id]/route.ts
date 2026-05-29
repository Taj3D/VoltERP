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

// Helper: null if empty string
function nullIfEmpty(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  return value.trim() === '' ? null : value.trim();
}

// GET /api/bank-transactions/[id] - Get single bank transaction with cross-tenant validation + VAT Auditor masking
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'BankTransactions', 'GET');
  if (!security.authorized) return security.response;

  const role = security.user.role;
  const companyId = security.user.companyId;

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

    // Cross-tenant validation: if user has a companyId, the record must match
    if (companyId && item.companyId && item.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Bank transaction not found' },
        { status: 404 }
      );
    }

    // Apply VAT Auditor financial masking
    const maskedItem = maskForVatAuditorFinancial(item as Record<string, unknown>, role);
    return NextResponse.json(maskedItem);
  } catch (error) {
    console.error('Error fetching bank transaction:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bank transaction' },
      { status: 500 }
    );
  }
}

// PUT /api/bank-transactions/[id] - Update with cross-tenant validation, safe balance reversal + re-entry, immutable type/code
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'BankTransactions', 'PUT');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;
    const body = await request.json();
    const {
      bankId,
      date,
      type,
      amount,
      toBankId,
      chequeNo,
      depositorName,
      referenceNo,
      description,
      status,
    } = body;

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

    // Cross-tenant validation: if user has a companyId, the record must match
    if (companyId && existing.companyId && existing.companyId !== companyId) {
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
    const effectiveAmount = amount !== undefined ? safeFinancialRound(Number(amount)) : existing.amount;
    const effectiveDate = date ? new Date(date) : existing.date;

    // Clean optional string fields → null if empty
    const cleanChequeNo = chequeNo !== undefined ? nullIfEmpty(chequeNo) : existing.chequeNo;
    const cleanDepositorName = depositorName !== undefined ? nullIfEmpty(depositorName) : existing.depositorName;
    const cleanReferenceNo = referenceNo !== undefined ? nullIfEmpty(referenceNo) : existing.referenceNo;
    const cleanDescription = description !== undefined ? nullIfEmpty(description) : existing.description;

    // Check if balance-affecting fields changed
    const amountChanged = effectiveAmount !== existing.amount;
    const bankChanged = effectiveBankId !== existing.bankId;
    const toBankChanged = effectiveToBankId !== existing.toBankId;
    const needsBalanceUpdate = amountChanged || bankChanged || toBankChanged;

    // Build companyId filter for bank lookups (multi-tenant)
    const bankCompanyFilter: any = {};
    if (companyId) {
      bankCompanyFilter.companyId = companyId;
    }

    const result = await db.$transaction(async (tx) => {
      if (needsBalanceUpdate) {
        // ── Reverse old impact using safe financial arithmetic ──
        if (existing.type === 'Deposit') {
          // Old deposit incremented balance → subtract to reverse
          const currentBank = await tx.bank.findUnique({ where: { id: existing.bankId } });
          if (currentBank) {
            const reversedBalance = safeFinancialSubtract(currentBank.currentBalance, existing.amount);
            await tx.bank.update({
              where: { id: existing.bankId },
              data: { currentBalance: reversedBalance },
            });
          }
        } else if (existing.type === 'Withdraw') {
          // Old withdrawal decremented balance → add to reverse
          const currentBank = await tx.bank.findUnique({ where: { id: existing.bankId } });
          if (currentBank) {
            const reversedBalance = safeFinancialAdd(currentBank.currentBalance, existing.amount);
            await tx.bank.update({
              where: { id: existing.bankId },
              data: { currentBalance: reversedBalance },
            });
          }
        } else if (existing.type === 'Transfer') {
          // Old transfer: source was decremented, target was incremented → reverse both
          const sourceBank = await tx.bank.findUnique({ where: { id: existing.bankId } });
          if (sourceBank) {
            const sourceReversed = safeFinancialAdd(sourceBank.currentBalance, existing.amount);
            await tx.bank.update({
              where: { id: existing.bankId },
              data: { currentBalance: sourceReversed },
            });
          }
          if (existing.toBankId) {
            const targetBank = await tx.bank.findUnique({ where: { id: existing.toBankId } });
            if (targetBank) {
              const targetReversed = safeFinancialSubtract(targetBank.currentBalance, existing.amount);
              await tx.bank.update({
                where: { id: existing.toBankId },
                data: { currentBalance: targetReversed },
              });
            }
          }
        }

        // ── Apply new impact using safe financial arithmetic ──
        if (effectiveType === 'Deposit') {
          const bank = await tx.bank.findFirst({
            where: { id: effectiveBankId, ...bankCompanyFilter, isActive: true },
          });
          if (!bank) throw new Error(`Bank with id ${effectiveBankId} not found or does not belong to your company`);

          const updatedBalance = safeFinancialAdd(bank.currentBalance, effectiveAmount);
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
              chequeNo: cleanChequeNo,
              depositorName: cleanDepositorName,
              referenceNo: cleanReferenceNo,
              description: cleanDescription,
              status: status || existing.status,
            },
            include: { bank: true, toBank: true },
          });

          await tx.auditLog.create({
            data: {
              action: 'UPDATE',
              module: 'Fin-Bank-Settlement',
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
          const bank = await tx.bank.findFirst({
            where: { id: effectiveBankId, ...bankCompanyFilter, isActive: true },
          });
          if (!bank) throw new Error(`Bank with id ${effectiveBankId} not found or does not belong to your company`);

          if (bank.currentBalance < effectiveAmount) {
            throw new Error(
              `Insufficient bank balance. Available: ${bank.currentBalance}, Requested: ${effectiveAmount}`
            );
          }

          const updatedBalance = safeFinancialSubtract(bank.currentBalance, effectiveAmount);
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
              chequeNo: cleanChequeNo,
              depositorName: cleanDepositorName,
              referenceNo: cleanReferenceNo,
              description: cleanDescription,
              status: status || existing.status,
            },
            include: { bank: true, toBank: true },
          });

          await tx.auditLog.create({
            data: {
              action: 'UPDATE',
              module: 'Fin-Bank-Settlement',
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

          const sourceBank = await tx.bank.findFirst({
            where: { id: effectiveBankId, ...bankCompanyFilter, isActive: true },
          });
          if (!sourceBank) throw new Error(`Source bank with id ${effectiveBankId} not found or does not belong to your company`);

          const targetBank = await tx.bank.findFirst({
            where: { id: effectiveToBankId, ...bankCompanyFilter, isActive: true },
          });
          if (!targetBank) throw new Error(`Target bank with id ${effectiveToBankId} not found or does not belong to your company`);

          if (sourceBank.currentBalance < effectiveAmount) {
            throw new Error(
              `Insufficient bank balance. Available: ${sourceBank.currentBalance}, Requested: ${effectiveAmount}`
            );
          }

          const sourceUpdatedBalance = safeFinancialSubtract(sourceBank.currentBalance, effectiveAmount);
          const targetUpdatedBalance = safeFinancialAdd(targetBank.currentBalance, effectiveAmount);

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
              chequeNo: cleanChequeNo,
              depositorName: cleanDepositorName,
              referenceNo: cleanReferenceNo,
              description: cleanDescription,
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
                description: cleanDescription || `Transfer from ${sourceBank.bankName}`,
                status: status || existing.status,
              },
            });
          }

          await tx.auditLog.create({
            data: {
              action: 'UPDATE',
              module: 'Fin-Bank-Settlement',
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

      // ── No balance-affecting changes — simple update ─────────
      const updated = await tx.bankTransaction.update({
        where: { id },
        data: {
          ...(date && { date: new Date(date) }),
          ...(chequeNo !== undefined && { chequeNo: nullIfEmpty(chequeNo) }),
          ...(depositorName !== undefined && { depositorName: nullIfEmpty(depositorName) }),
          ...(referenceNo !== undefined && { referenceNo: nullIfEmpty(referenceNo) }),
          ...(description !== undefined && { description: nullIfEmpty(description) }),
          ...(status && { status }),
        },
        include: { bank: true, toBank: true },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'Fin-Bank-Settlement',
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
      message.includes('does not belong') ||
      message.includes('cannot be changed') ||
      message.includes('required')
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}

// DELETE /api/bank-transactions/[id] - Soft delete with checkFinancialDeletePermission, balance reversal, paired transaction cleanup
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'BankTransactions', 'DELETE');
  if (!security.authorized) return security.response;

  const role = security.user.role;
  const companyId = security.user.companyId;

  // Only admin can delete financial posts
  const deleteCheck = checkFinancialDeletePermission(role);
  if (deleteCheck) return deleteCheck;

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

    // Cross-tenant validation: if user has a companyId, the record must match
    if (companyId && existing.companyId && existing.companyId !== companyId) {
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
      // Soft delete the primary transaction
      await tx.bankTransaction.update({
        where: { id },
        data: { isActive: false },
      });

      // Reverse bank balance impact using safe financial arithmetic
      if (existing.type === 'Deposit') {
        // Deposit had incremented balance → subtract to reverse
        const bank = await tx.bank.findUnique({ where: { id: existing.bankId } });
        if (bank) {
          const reversedBalance = safeFinancialSubtract(bank.currentBalance, existing.amount);
          await tx.bank.update({
            where: { id: existing.bankId },
            data: { currentBalance: reversedBalance },
          });
        }
      } else if (existing.type === 'Withdraw') {
        // Withdrawal had decremented balance → add to reverse
        const bank = await tx.bank.findUnique({ where: { id: existing.bankId } });
        if (bank) {
          const reversedBalance = safeFinancialAdd(bank.currentBalance, existing.amount);
          await tx.bank.update({
            where: { id: existing.bankId },
            data: { currentBalance: reversedBalance },
          });
        }
      } else if (existing.type === 'Transfer') {
        // Transfer: source was decremented, target was incremented → reverse both
        const sourceBank = await tx.bank.findUnique({ where: { id: existing.bankId } });
        if (sourceBank) {
          const sourceReversed = safeFinancialAdd(sourceBank.currentBalance, existing.amount);
          await tx.bank.update({
            where: { id: existing.bankId },
            data: { currentBalance: sourceReversed },
          });
        }
        if (existing.toBankId) {
          const targetBank = await tx.bank.findUnique({ where: { id: existing.toBankId } });
          if (targetBank) {
            const targetReversed = safeFinancialSubtract(targetBank.currentBalance, existing.amount);
            await tx.bank.update({
              where: { id: existing.toBankId },
              data: { currentBalance: targetReversed },
            });
          }

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

      // AuditLog — module token "Fin-Bank-Settlement"
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'Fin-Bank-Settlement',
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
            companyId: companyId || null,
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
