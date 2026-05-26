import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity, checkPeriodClose } from '@/lib/api-security';

// GET /api/bank-transactions - List all bank transactions with relations
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'BankTransactions', 'GET');
  if (!security.authorized) return security.response;

  try {
    const items = await db.bankTransaction.findMany({
      where: { isActive: true },
      include: {
        bank: true,
        toBank: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(items);
  } catch (error) {
    console.error('Error fetching bank transactions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bank transactions' },
      { status: 500 }
    );
  }
}

// POST /api/bank-transactions - Create bank transaction with balance tracking
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'BankTransactions', 'POST');
  if (!security.authorized) return security.response;

  try {
    const body = await request.json();
    const { bankId, date, type, amount, toBankId, description, status } = body;

    if (!bankId || !type || !date || amount === undefined || amount === null) {
      return NextResponse.json(
        { error: 'bankId, type, date, and amount are required' },
        { status: 400 }
      );
    }

    const transactionAmount = Number(amount);
    if (isNaN(transactionAmount) || transactionAmount <= 0) {
      return NextResponse.json(
        { error: 'Amount must be a positive number' },
        { status: 400 }
      );
    }

    if (!['Deposit', 'Withdraw', 'Transfer'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid transaction type. Must be Deposit, Withdraw, or Transfer.' },
        { status: 400 }
      );
    }

    if (type === 'Transfer' && !toBankId) {
      return NextResponse.json(
        { error: 'toBankId is required for Transfer transactions' },
        { status: 400 }
      );
    }

    // Period-close lock check
    const transactionDate = new Date(date);
    const periodLock = await checkPeriodClose(transactionDate);
    if (periodLock) return periodLock;

    const result = await db.$transaction(async (tx) => {
      // Auto-generate transactionCode as BTX-XXXXX (5-digit zero-padded)
      const lastBT = await tx.bankTransaction.findFirst({
        orderBy: { transactionCode: 'desc' },
        select: { transactionCode: true },
      });

      let nextNum = 1;
      if (lastBT?.transactionCode) {
        const match = lastBT.transactionCode.match(/BTX-(\d+)/);
        if (match) {
          nextNum = parseInt(match[1], 10) + 1;
        }
      }
      const transactionCode = `BTX-${String(nextNum).padStart(5, '0')}`;

      // ── Deposit ──────────────────────────────────────────────
      if (type === 'Deposit') {
        const bank = await tx.bank.findUnique({ where: { id: bankId } });
        if (!bank) throw new Error(`Bank with id ${bankId} not found`);

        const updatedBalance = bank.currentBalance + transactionAmount;
        await tx.bank.update({
          where: { id: bankId },
          data: { currentBalance: updatedBalance },
        });

        const bankTransaction = await tx.bankTransaction.create({
          data: {
            transactionCode,
            bankId,
            date: transactionDate,
            type: 'Deposit',
            amount: transactionAmount,
            runningBalance: updatedBalance,
            description: description || null,
            status: status || 'Approved',
            isActive: true,
          },
          include: { bank: true, toBank: true },
        });

        // LedgerEntry: credit (with explicit debit: 0)
        await tx.ledgerEntry.create({
          data: {
            date: transactionDate,
            account: bank.bankName,
            debit: 0,
            credit: transactionAmount,
            reference: transactionCode,
          },
        });

        // AuditLog
        await tx.auditLog.create({
          data: {
            action: 'CREATE',
            module: 'BankTransactions',
            recordId: bankTransaction.id,
            recordLabel: transactionCode,
            details: JSON.stringify({
              type: 'Deposit',
              bankId,
              bankName: bank.bankName,
              amount: transactionAmount,
              runningBalance: updatedBalance,
            }),
          },
        });

        return bankTransaction;
      }

      // ── Withdraw ─────────────────────────────────────────────
      if (type === 'Withdraw') {
        const bank = await tx.bank.findUnique({ where: { id: bankId } });
        if (!bank) throw new Error(`Bank with id ${bankId} not found`);

        // VALIDATE sufficient balance
        if (bank.currentBalance < transactionAmount) {
          throw new Error(
            `Insufficient bank balance. Available: ${bank.currentBalance}, Requested: ${transactionAmount}`
          );
        }

        const updatedBalance = bank.currentBalance - transactionAmount;
        await tx.bank.update({
          where: { id: bankId },
          data: { currentBalance: updatedBalance },
        });

        const bankTransaction = await tx.bankTransaction.create({
          data: {
            transactionCode,
            bankId,
            date: transactionDate,
            type: 'Withdraw',
            amount: transactionAmount,
            runningBalance: updatedBalance,
            description: description || null,
            status: status || 'Approved',
            isActive: true,
          },
          include: { bank: true, toBank: true },
        });

        // LedgerEntry: debit (with explicit credit: 0)
        await tx.ledgerEntry.create({
          data: {
            date: transactionDate,
            account: bank.bankName,
            debit: transactionAmount,
            credit: 0,
            reference: transactionCode,
          },
        });

        // AuditLog
        await tx.auditLog.create({
          data: {
            action: 'CREATE',
            module: 'BankTransactions',
            recordId: bankTransaction.id,
            recordLabel: transactionCode,
            details: JSON.stringify({
              type: 'Withdraw',
              bankId,
              bankName: bank.bankName,
              amount: transactionAmount,
              runningBalance: updatedBalance,
            }),
          },
        });

        return bankTransaction;
      }

      // ── Transfer ─────────────────────────────────────────────
      if (type === 'Transfer') {
        const sourceBank = await tx.bank.findUnique({ where: { id: bankId } });
        if (!sourceBank) throw new Error(`Source bank with id ${bankId} not found`);

        const targetBank = await tx.bank.findUnique({ where: { id: toBankId } });
        if (!targetBank) throw new Error(`Target bank with id ${toBankId} not found`);

        // VALIDATE source bank has sufficient balance
        if (sourceBank.currentBalance < transactionAmount) {
          throw new Error(
            `Insufficient bank balance. Available: ${sourceBank.currentBalance}, Requested: ${transactionAmount}`
          );
        }

        // Decrement source bank
        const sourceUpdatedBalance = sourceBank.currentBalance - transactionAmount;
        await tx.bank.update({
          where: { id: bankId },
          data: { currentBalance: sourceUpdatedBalance },
        });

        // Increment target bank
        const targetUpdatedBalance = targetBank.currentBalance + transactionAmount;
        await tx.bank.update({
          where: { id: toBankId },
          data: { currentBalance: targetUpdatedBalance },
        });

        // Generate target transaction code properly (don't reuse nextNum + 1)
        const lastBTForTarget = await tx.bankTransaction.findFirst({
          orderBy: { transactionCode: 'desc' },
          select: { transactionCode: true },
        });
        let targetNextNum = 1;
        if (lastBTForTarget?.transactionCode) {
          const match = lastBTForTarget.transactionCode.match(/BTX-(\d+)/);
          if (match) {
            targetNextNum = parseInt(match[1], 10) + 1;
          }
        }
        // Use the higher of the two to avoid collision
        const effectiveTargetNum = Math.max(targetNextNum, nextNum + 1);
        const targetTransactionCode = `BTX-${String(effectiveTargetNum).padStart(5, '0')}`;

        // Source BankTransaction (type="Transfer")
        const sourceTransaction = await tx.bankTransaction.create({
          data: {
            transactionCode,
            bankId,
            date: transactionDate,
            type: 'Transfer',
            amount: transactionAmount,
            runningBalance: sourceUpdatedBalance,
            toBankId,
            description: description || null,
            status: status || 'Approved',
            isActive: true,
          },
          include: { bank: true, toBank: true },
        });

        // Target BankTransaction (type="Deposit", linked via toBankId)
        await tx.bankTransaction.create({
          data: {
            transactionCode: targetTransactionCode,
            bankId: toBankId,
            date: transactionDate,
            type: 'Deposit',
            amount: transactionAmount,
            runningBalance: targetUpdatedBalance,
            toBankId: bankId,
            description: description || `Transfer from ${sourceBank.bankName}`,
            status: status || 'Approved',
            isActive: true,
          },
          include: { bank: true, toBank: true },
        });

        // LedgerEntry: debit from source (with explicit credit: 0)
        await tx.ledgerEntry.create({
          data: {
            date: transactionDate,
            account: sourceBank.bankName,
            debit: transactionAmount,
            credit: 0,
            reference: transactionCode,
          },
        });

        // LedgerEntry: credit to target (with explicit debit: 0)
        await tx.ledgerEntry.create({
          data: {
            date: transactionDate,
            account: targetBank.bankName,
            debit: 0,
            credit: transactionAmount,
            reference: transactionCode,
          },
        });

        // AuditLog
        await tx.auditLog.create({
          data: {
            action: 'CREATE',
            module: 'BankTransactions',
            recordId: sourceTransaction.id,
            recordLabel: transactionCode,
            details: JSON.stringify({
              type: 'Transfer',
              sourceBankId: bankId,
              sourceBankName: sourceBank.bankName,
              targetBankId: toBankId,
              targetBankName: targetBank.bankName,
              amount: transactionAmount,
              sourceRunningBalance: sourceUpdatedBalance,
              targetRunningBalance: targetUpdatedBalance,
              targetTransactionCode,
            }),
          },
        });

        return sourceTransaction;
      }

      throw new Error('Unhandled transaction type');
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating bank transaction:', error);
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to create bank transaction';
    const statusCode =
      message.includes('Insufficient') ||
      message.includes('not found') ||
      message.includes('required') ||
      message.includes('Invalid') ||
      message.includes('positive')
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}
