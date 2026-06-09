// ============================================================
// Bank Transactions [id] API — Double-Entry CoA Alignment, Ledger Reversal
// Module Token: Fin-Bank-Settlement
// ============================================================

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
  stripHtml,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// Helper: generate LED entry code — collision-safe (numeric max)
async function generateLedgerEntryCode(tx: any): Promise<string> {
  const all = await tx.ledgerEntry.findMany({
    select: { entryCode: true },
  });
  let maxNum = 0;
  for (const r of all) {
    if (r.entryCode) {
      const match = r.entryCode.match(/LED-(\d+)/);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
    }
  }
  return `LED-${String(maxNum + 1).padStart(5, '0')}`;
}

// Helper: generate LAP code — collision-safe (numeric max)
async function generateAutoPostCode(tx: any): Promise<string> {
  const all = await tx.ledgerAutoPost.findMany({
    select: { code: true },
  });
  let maxNum = 0;
  for (const r of all) {
    if (r.code) {
      const match = r.code.match(/LAP-(\d+)/);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
    }
  }
  return `LAP-${String(maxNum + 1).padStart(5, '0')}`;
}

// GET /api/bank-transactions/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'BankTransactions', 'GET');
  if (!security.authorized) return security.response;

  const { role, companyId } = security.user;

  try {
    const { id } = await params;
    const item = await db.bankTransaction.findUnique({
      where: { id },
      include: { bank: true, toBank: true },
    });

    if (!item || !item.isActive) {
      return NextResponse.json({ error: 'Bank transaction not found' }, { status: 404 });
    }

    if (companyId && item.companyId && item.companyId !== companyId) {
      return NextResponse.json({ error: 'Bank transaction not found' }, { status: 404 });
    }

    const maskedItem = maskForVatAuditorFinancial(item as Record<string, unknown>, role);
    return NextResponse.json(maskedItem);
  } catch (error) {
    console.error('Error fetching bank transaction:', error);
    return NextResponse.json({ error: 'Failed to fetch bank transaction' }, { status: 500 });
  }
}

// PUT /api/bank-transactions/[id] — Update with balance reversal + re-entry, immutable type/code
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'BankTransactions', 'PUT');
  if (!security.authorized) return security.response;

  const { id: userId, name: userName, companyId } = security.user;

  try {
    const { id } = await params;
    const body = await request.json();
    const { bankId, date, type, amount, toBankId, chequeNo, depositorName, referenceNo, description, status } = body;

    const existing = await db.bankTransaction.findUnique({
      where: { id },
      include: { bank: true, toBank: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Bank transaction not found' }, { status: 404 });
    }

    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Bank transaction not found' }, { status: 404 });
    }

    const checkDate = date ? new Date(date) : (existing.date || new Date());
    const periodLock = await checkPeriodClose(checkDate);
    if (periodLock) return periodLock;

    if (body.transactionCode && body.transactionCode !== existing.transactionCode) {
      return NextResponse.json({ error: 'Transaction code cannot be changed' }, { status: 400 });
    }

    if (type && type !== existing.type) {
      return NextResponse.json({ error: 'Transaction type cannot be changed after creation' }, { status: 400 });
    }

    const effectiveType = existing.type;
    const effectiveBankId = bankId || existing.bankId;
    const effectiveToBankId = toBankId !== undefined ? toBankId : existing.toBankId;
    const effectiveAmount = amount !== undefined ? safeFinancialRound(Number(amount)) : existing.amount;
    // Validate amount > 0 if being changed
    if (amount !== undefined && (isNaN(effectiveAmount) || effectiveAmount <= 0)) {
      return NextResponse.json({ error: 'Amount must be a positive number greater than 0' }, { status: 400 });
    }
    const effectiveDate = date ? new Date(date) : existing.date;

    const cleanChequeNo = chequeNo !== undefined ? (chequeNo ? stripHtml(String(chequeNo).trim()) || null : null) : existing.chequeNo;
    const cleanDepositorName = depositorName !== undefined ? (depositorName ? stripHtml(String(depositorName).trim()) || null : null) : existing.depositorName;
    const cleanReferenceNo = referenceNo !== undefined ? (referenceNo ? stripHtml(String(referenceNo).trim()) || null : null) : existing.referenceNo;
    const cleanDescription = description !== undefined ? (description ? stripHtml(String(description).trim()) || null : null) : existing.description;

    const amountChanged = effectiveAmount !== existing.amount;
    const bankChanged = effectiveBankId !== existing.bankId;
    const toBankChanged = effectiveToBankId !== existing.toBankId;
    const needsBalanceUpdate = amountChanged || bankChanged || toBankChanged;

    const bankCompanyFilter: Record<string, unknown> = {};
    if (companyId) bankCompanyFilter.companyId = companyId;

    const result = await db.$transaction(async (tx: any) => {
      if (needsBalanceUpdate) {
        // Reverse old impact
        if (existing.type === 'Deposit') {
          const currentBank = await tx.bank.findUnique({ where: { id: existing.bankId } });
          if (currentBank) {
            const reversedBalance = safeFinancialSubtract(currentBank.currentBalance, existing.amount);
            await tx.bank.update({ where: { id: existing.bankId }, data: { currentBalance: reversedBalance } });
          }
        } else if (existing.type === 'Withdraw') {
          const currentBank = await tx.bank.findUnique({ where: { id: existing.bankId } });
          if (currentBank) {
            const reversedBalance = safeFinancialAdd(currentBank.currentBalance, existing.amount);
            await tx.bank.update({ where: { id: existing.bankId }, data: { currentBalance: reversedBalance } });
          }
        } else if (existing.type === 'Transfer') {
          const sourceBank = await tx.bank.findUnique({ where: { id: existing.bankId } });
          if (sourceBank) {
            const sourceReversed = safeFinancialAdd(sourceBank.currentBalance, existing.amount);
            await tx.bank.update({ where: { id: existing.bankId }, data: { currentBalance: sourceReversed } });
          }
          if (existing.toBankId) {
            const targetBank = await tx.bank.findUnique({ where: { id: existing.toBankId } });
            if (targetBank) {
              const targetReversed = safeFinancialSubtract(targetBank.currentBalance, existing.amount);
              await tx.bank.update({ where: { id: existing.toBankId }, data: { currentBalance: targetReversed } });
            }
          }
        }

        // Apply new impact
        if (effectiveType === 'Deposit') {
          const bank = await tx.bank.findFirst({ where: { id: effectiveBankId, ...bankCompanyFilter, isActive: true } });
          if (!bank) throw new Error(`Bank with id ${effectiveBankId} not found`);
          const updatedBalance = safeFinancialAdd(bank.currentBalance, effectiveAmount);
          await tx.bank.update({ where: { id: effectiveBankId }, data: { currentBalance: updatedBalance } });

          const updated = await tx.bankTransaction.update({
            where: { id },
            data: {
              bankId: effectiveBankId, date: effectiveDate, amount: effectiveAmount,
              runningBalance: updatedBalance, chequeNo: cleanChequeNo, depositorName: cleanDepositorName,
              referenceNo: cleanReferenceNo, description: cleanDescription,
              status: status || existing.status,
            },
            include: { bank: true, toBank: true },
          });

          await tx.auditLog.create({
            data: {
              action: 'UPDATE', module: 'Fin-Bank-Settlement', recordId: id,
              recordLabel: existing.transactionCode, userId, userName,
              details: JSON.stringify({ type: effectiveType, amountChanged, oldAmount: existing.amount, newAmount: effectiveAmount, bankChanged, runningBalance: updatedBalance }),
            },
          });
          return updated;
        }

        if (effectiveType === 'Withdraw') {
          const bank = await tx.bank.findFirst({ where: { id: effectiveBankId, ...bankCompanyFilter, isActive: true } });
          if (!bank) throw new Error(`Bank with id ${effectiveBankId} not found`);
          if (bank.currentBalance < effectiveAmount) throw new Error(`Insufficient bank balance. Available: ${bank.currentBalance}, Requested: ${effectiveAmount}`);
          const updatedBalance = safeFinancialSubtract(bank.currentBalance, effectiveAmount);
          await tx.bank.update({ where: { id: effectiveBankId }, data: { currentBalance: updatedBalance } });

          const updated = await tx.bankTransaction.update({
            where: { id },
            data: {
              bankId: effectiveBankId, date: effectiveDate, amount: effectiveAmount,
              runningBalance: updatedBalance, chequeNo: cleanChequeNo, depositorName: cleanDepositorName,
              referenceNo: cleanReferenceNo, description: cleanDescription,
              status: status || existing.status,
            },
            include: { bank: true, toBank: true },
          });

          await tx.auditLog.create({
            data: {
              action: 'UPDATE', module: 'Fin-Bank-Settlement', recordId: id,
              recordLabel: existing.transactionCode, userId, userName,
              details: JSON.stringify({ type: effectiveType, amountChanged, oldAmount: existing.amount, newAmount: effectiveAmount, bankChanged, runningBalance: updatedBalance }),
            },
          });
          return updated;
        }

        if (effectiveType === 'Transfer') {
          if (!effectiveToBankId) throw new Error('toBankId is required for Transfer');
          const sourceBank = await tx.bank.findFirst({ where: { id: effectiveBankId, ...bankCompanyFilter, isActive: true } });
          if (!sourceBank) throw new Error(`Source bank not found`);
          const targetBank = await tx.bank.findFirst({ where: { id: effectiveToBankId, ...bankCompanyFilter, isActive: true } });
          if (!targetBank) throw new Error(`Target bank not found`);
          if (sourceBank.currentBalance < effectiveAmount) throw new Error(`Insufficient bank balance. Available: ${sourceBank.currentBalance}, Requested: ${effectiveAmount}`);

          const sourceUpdatedBalance = safeFinancialSubtract(sourceBank.currentBalance, effectiveAmount);
          const targetUpdatedBalance = safeFinancialAdd(targetBank.currentBalance, effectiveAmount);
          await tx.bank.update({ where: { id: effectiveBankId }, data: { currentBalance: sourceUpdatedBalance } });
          await tx.bank.update({ where: { id: effectiveToBankId }, data: { currentBalance: targetUpdatedBalance } });

          const updated = await tx.bankTransaction.update({
            where: { id },
            data: {
              bankId: effectiveBankId, date: effectiveDate, amount: effectiveAmount,
              runningBalance: sourceUpdatedBalance, toBankId: effectiveToBankId,
              chequeNo: cleanChequeNo, depositorName: cleanDepositorName,
              referenceNo: cleanReferenceNo, description: cleanDescription,
              status: status || existing.status,
            },
            include: { bank: true, toBank: true },
          });

          // Update paired target transaction
          const pairedTransaction = await tx.bankTransaction.findFirst({
            where: { bankId: existing.toBankId || '', toBankId: existing.bankId, type: 'Deposit', amount: existing.amount, isActive: true },
          });
          if (pairedTransaction) {
            await tx.bankTransaction.update({
              where: { id: pairedTransaction.id },
              data: { bankId: effectiveToBankId, amount: effectiveAmount, runningBalance: targetUpdatedBalance, toBankId: effectiveBankId, date: effectiveDate, description: cleanDescription || `Transfer from ${sourceBank.bankName}`, status: status || existing.status },
            });
          }

          await tx.auditLog.create({
            data: {
              action: 'UPDATE', module: 'Fin-Bank-Settlement', recordId: id,
              recordLabel: existing.transactionCode, userId, userName,
              details: JSON.stringify({ type: 'Transfer', amountChanged, oldAmount: existing.amount, newAmount: effectiveAmount, bankChanged, toBankChanged, sourceRunningBalance: sourceUpdatedBalance, targetRunningBalance: targetUpdatedBalance, pairedTransactionUpdated: !!pairedTransaction }),
            },
          });
          return updated;
        }
      }

      // No balance-affecting changes
      const updated = await tx.bankTransaction.update({
        where: { id },
        data: {
          ...(date && { date: new Date(date) }),
          ...(chequeNo !== undefined && { chequeNo: cleanChequeNo }),
          ...(depositorName !== undefined && { depositorName: cleanDepositorName }),
          ...(referenceNo !== undefined && { referenceNo: cleanReferenceNo }),
          ...(description !== undefined && { description: cleanDescription }),
          ...(status && { status }),
        },
        include: { bank: true, toBank: true },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE', module: 'Fin-Bank-Settlement', recordId: id,
          recordLabel: existing.transactionCode, userId, userName,
          details: JSON.stringify({ type: effectiveType, balanceImpact: false }),
        },
      });

      return updated;
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Error updating bank transaction:', error);
    const message = error instanceof Error ? error.message : 'Failed to update bank transaction';
    const statusCode = message.includes('Insufficient') || message.includes('not found') || message.includes('cannot be changed') || message.includes('required') ? 400 : 500;
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}

// DELETE /api/bank-transactions/[id] — Soft delete with ledger reversal
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'BankTransactions', 'DELETE');
  if (!security.authorized) return security.response;

  const deleteCheck = checkFinancialDeletePermission(security.user.role);
  if (deleteCheck) return deleteCheck;

  const { id: userId, name: userName, companyId } = security.user;

  try {
    const { id } = await params;

    const existing = await db.bankTransaction.findUnique({
      where: { id },
      include: { bank: true, toBank: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Bank transaction not found' }, { status: 404 });
    }

    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Bank transaction not found' }, { status: 404 });
    }

    if (!existing.isActive) {
      return NextResponse.json({ error: 'Bank transaction is already deleted' }, { status: 400 });
    }

    const periodLock = await checkPeriodClose(existing.date || new Date());
    if (periodLock) return periodLock;

    await db.$transaction(async (tx: any) => {
      // Soft delete
      await tx.bankTransaction.update({ where: { id }, data: { isActive: false, ledgerPosted: false } });

      // Reverse bank balance
      if (existing.type === 'Deposit') {
        const bank = await tx.bank.findUnique({ where: { id: existing.bankId } });
        if (bank) {
          const reversedBalance = safeFinancialSubtract(bank.currentBalance, existing.amount);
          await tx.bank.update({ where: { id: existing.bankId }, data: { currentBalance: reversedBalance } });
        }
      } else if (existing.type === 'Withdraw') {
        const bank = await tx.bank.findUnique({ where: { id: existing.bankId } });
        if (bank) {
          const reversedBalance = safeFinancialAdd(bank.currentBalance, existing.amount);
          await tx.bank.update({ where: { id: existing.bankId }, data: { currentBalance: reversedBalance } });
        }
      } else if (existing.type === 'Transfer') {
        const sourceBank = await tx.bank.findUnique({ where: { id: existing.bankId } });
        if (sourceBank) {
          const sourceReversed = safeFinancialAdd(sourceBank.currentBalance, existing.amount);
          await tx.bank.update({ where: { id: existing.bankId }, data: { currentBalance: sourceReversed } });
        }
        if (existing.toBankId) {
          const targetBank = await tx.bank.findUnique({ where: { id: existing.toBankId } });
          if (targetBank) {
            const targetReversed = safeFinancialSubtract(targetBank.currentBalance, existing.amount);
            await tx.bank.update({ where: { id: existing.toBankId }, data: { currentBalance: targetReversed } });
          }
          // Soft-delete paired target transaction
          const pairedTransaction = await tx.bankTransaction.findFirst({
            where: { bankId: existing.toBankId, toBankId: existing.bankId, type: 'Deposit', amount: existing.amount, isActive: true },
          });
          if (pairedTransaction) {
            await tx.bankTransaction.update({ where: { id: pairedTransaction.id }, data: { isActive: false, ledgerPosted: false } });
          }
        }
      }

      // If ledgerPosted, create reversal ledger entries
      if (existing.ledgerPosted) {
        let debitAccount = 'Cash in Hand';
        let creditAccount = existing.bank?.bankName || 'Bank';

        if (existing.type === 'Deposit') {
          debitAccount = existing.bank?.bankName || 'Bank';
          creditAccount = 'Cash in Hand';
        } else if (existing.type === 'Transfer' && existing.toBank) {
          debitAccount = existing.toBank.bankName;
          creditAccount = existing.bank?.bankName || 'Bank';
        }

        // Reversal entries
        const reversalDrCode = await generateLedgerEntryCode(tx);
        await tx.ledgerEntry.create({
          data: {
            entryCode: reversalDrCode, date: existing.date || new Date(),
            account: creditAccount, debit: existing.amount, credit: 0,
            reference: existing.transactionCode, referenceType: `Bank${existing.type}`,
            companyId: existing.companyId,
          },
        });
        const reversalCrCode = await generateLedgerEntryCode(tx);
        await tx.ledgerEntry.create({
          data: {
            entryCode: reversalCrCode, date: existing.date || new Date(),
            account: debitAccount, debit: 0, credit: existing.amount,
            reference: existing.transactionCode, referenceType: `Bank${existing.type}`,
            companyId: existing.companyId,
          },
        });

        // Reversal LedgerAutoPost
        const lapCode = await generateAutoPostCode(tx);
        await tx.ledgerAutoPost.create({
          data: {
            code: lapCode, sourceType: 'BankTransaction', sourceId: id,
            sourceCode: existing.transactionCode, debitEntryId: reversalDrCode, creditEntryId: reversalCrCode,
            debitAccount: creditAccount, creditAccount: debitAccount,
            amount: existing.amount, postingDate: existing.date || new Date(),
            status: 'Reversed', companyId: existing.companyId,
            reversalReason: 'Bank transaction soft-deleted', postedBy: userId,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          action: 'DELETE', module: 'Fin-Bank-Settlement', recordId: id,
          recordLabel: existing.transactionCode, userId, userName,
          details: JSON.stringify({
            softDelete: true, type: existing.type, amount: existing.amount,
            bankId: existing.bankId, bankName: existing.bank?.bankName,
            toBankId: existing.toBankId, toBankName: existing.toBank?.bankName,
            ledgerReversed: existing.ledgerPosted, companyId: companyId || null,
          }),
        },
      });
    });

    // Fire-and-forget activity log (outside transaction to avoid SQLite timeout)
    logUserActivity({ action: 'DELETE', module: 'Fin-Bank-Settlement', recordId: id, recordLabel: existing.transactionCode, userId, userName, details: `Soft-deleted bank transaction ${existing.transactionCode}` }).catch(() => {});

    return NextResponse.json({ message: 'Bank transaction deleted successfully' });
  } catch (error) {
    console.error('Error deleting bank transaction:', error);
    return NextResponse.json({ error: 'Failed to delete bank transaction' }, { status: 500 });
  }
}
