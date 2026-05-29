import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  checkPeriodClose,
  maskFinancialArray,
  safeFinancialRound,
  safeFinancialAdd,
  safeFinancialSubtract,
} from '@/lib/api-security';

// Helper: null if empty string
function nullIfEmpty(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  return value.trim() === '' ? null : value.trim();
}

// GET /api/bank-transactions - List all bank transactions with multi-tenant isolation, safe running balances, VAT masking
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'BankTransactions', 'GET');
  if (!security.authorized) return security.response;

  const role = security.user.role;
  const companyId = security.user.companyId;

  try {
    // Multi-tenant filter: only show transactions for the user's company
    const whereClause: any = { isActive: true };
    if (companyId) {
      whereClause.companyId = companyId;
    }

    const items = await db.bankTransaction.findMany({
      where: whereClause,
      include: {
        bank: true,
        toBank: true,
      },
      orderBy: { date: 'asc' },
    });

    // Compute running balances per bank using safe financial arithmetic
    const bankBalanceMap: Record<string, number> = {};
    const computed = items.map((txn: any) => {
      const bId = txn.bankId;
      if (!(bId in bankBalanceMap)) {
        bankBalanceMap[bId] = txn.bank?.openingBalance || 0;
      }
      if (txn.type === 'Deposit') {
        bankBalanceMap[bId] = safeFinancialAdd(bankBalanceMap[bId], txn.amount);
      } else if (txn.type === 'Withdraw' || txn.type === 'Transfer') {
        bankBalanceMap[bId] = safeFinancialSubtract(bankBalanceMap[bId], txn.amount);
      }
      const runningBalance = safeFinancialRound(bankBalanceMap[bId]);
      // Update stored runningBalance if stale (fire-and-forget)
      if (Math.abs(txn.runningBalance - runningBalance) > 0.005) {
        db.bankTransaction
          .update({ where: { id: txn.id }, data: { runningBalance } })
          .catch(() => {});
      }
      return { ...txn, runningBalance };
    });

    // Return in desc order for display
    computed.reverse();

    // Apply VAT Auditor financial masking
    const masked = maskFinancialArray(computed, role);

    return NextResponse.json(masked);
  } catch (error) {
    console.error('Error fetching bank transactions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bank transactions' },
      { status: 500 }
    );
  }
}

// POST /api/bank-transactions - Create bank transaction with multi-tenant isolation, safe arithmetic, double-entry ledger, audit
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'BankTransactions', 'POST');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
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

    if (!bankId || !type || !date || amount === undefined || amount === null) {
      return NextResponse.json(
        { error: 'bankId, type, date, and amount are required' },
        { status: 400 }
      );
    }

    const transactionAmount = safeFinancialRound(Number(amount));
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

    // Clean optional string fields → null if empty
    const cleanChequeNo = nullIfEmpty(chequeNo);
    const cleanDepositorName = nullIfEmpty(depositorName);
    const cleanReferenceNo = nullIfEmpty(referenceNo);
    const cleanDescription = nullIfEmpty(description);

    // Build companyId filter for bank lookups (multi-tenant)
    const bankCompanyFilter: any = {};
    if (companyId) {
      bankCompanyFilter.companyId = companyId;
    }

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
        const bank = await tx.bank.findFirst({
          where: { id: bankId, ...bankCompanyFilter, isActive: true },
        });
        if (!bank) throw new Error(`Bank with id ${bankId} not found or does not belong to your company`);

        const updatedBalance = safeFinancialAdd(bank.currentBalance, transactionAmount);
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
            companyId: companyId || null,
            chequeNo: cleanChequeNo,
            depositorName: cleanDepositorName,
            referenceNo: cleanReferenceNo,
            description: cleanDescription,
            status: status || 'Approved',
            isActive: true,
          },
          include: { bank: true, toBank: true },
        });

        // LedgerEntry: balanced pair — Dr: Bank, Cr: Cash in Hand
        await tx.ledgerEntry.create({
          data: {
            date: transactionDate,
            account: bank.bankName,
            debit: transactionAmount,
            credit: 0,
            reference: transactionCode,
            referenceType: 'BankDeposit',
          },
        });
        await tx.ledgerEntry.create({
          data: {
            date: transactionDate,
            account: 'Cash in Hand',
            debit: 0,
            credit: transactionAmount,
            reference: transactionCode,
            referenceType: 'BankDeposit',
          },
        });

        // AuditLog — module token "Fin-Bank-Settlement"
        await tx.auditLog.create({
          data: {
            action: 'CREATE',
            module: 'Fin-Bank-Settlement',
            recordId: bankTransaction.id,
            recordLabel: transactionCode,
            userId: security.user.id,
            userName: security.user.name,
            details: JSON.stringify({
              type: 'Deposit',
              bankId,
              bankName: bank.bankName,
              amount: transactionAmount,
              runningBalance: updatedBalance,
              companyId: companyId || null,
            }),
          },
        });

        return bankTransaction;
      }

      // ── Withdraw ─────────────────────────────────────────────
      if (type === 'Withdraw') {
        const bank = await tx.bank.findFirst({
          where: { id: bankId, ...bankCompanyFilter, isActive: true },
        });
        if (!bank) throw new Error(`Bank with id ${bankId} not found or does not belong to your company`);

        // VALIDATE sufficient balance
        if (bank.currentBalance < transactionAmount) {
          throw new Error(
            `Insufficient bank balance. Available: ${bank.currentBalance}, Requested: ${transactionAmount}`
          );
        }

        const updatedBalance = safeFinancialSubtract(bank.currentBalance, transactionAmount);
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
            companyId: companyId || null,
            chequeNo: cleanChequeNo,
            depositorName: cleanDepositorName,
            referenceNo: cleanReferenceNo,
            description: cleanDescription,
            status: status || 'Approved',
            isActive: true,
          },
          include: { bank: true, toBank: true },
        });

        // LedgerEntry: balanced pair — Dr: Cash in Hand, Cr: Bank
        await tx.ledgerEntry.create({
          data: {
            date: transactionDate,
            account: 'Cash in Hand',
            debit: transactionAmount,
            credit: 0,
            reference: transactionCode,
            referenceType: 'BankWithdraw',
          },
        });
        await tx.ledgerEntry.create({
          data: {
            date: transactionDate,
            account: bank.bankName,
            debit: 0,
            credit: transactionAmount,
            reference: transactionCode,
            referenceType: 'BankWithdraw',
          },
        });

        // AuditLog — module token "Fin-Bank-Settlement"
        await tx.auditLog.create({
          data: {
            action: 'CREATE',
            module: 'Fin-Bank-Settlement',
            recordId: bankTransaction.id,
            recordLabel: transactionCode,
            userId: security.user.id,
            userName: security.user.name,
            details: JSON.stringify({
              type: 'Withdraw',
              bankId,
              bankName: bank.bankName,
              amount: transactionAmount,
              runningBalance: updatedBalance,
              companyId: companyId || null,
            }),
          },
        });

        return bankTransaction;
      }

      // ── Transfer ─────────────────────────────────────────────
      if (type === 'Transfer') {
        const sourceBank = await tx.bank.findFirst({
          where: { id: bankId, ...bankCompanyFilter, isActive: true },
        });
        if (!sourceBank) throw new Error(`Source bank with id ${bankId} not found or does not belong to your company`);

        const targetBank = await tx.bank.findFirst({
          where: { id: toBankId, ...bankCompanyFilter, isActive: true },
        });
        if (!targetBank) throw new Error(`Target bank with id ${toBankId} not found or does not belong to your company`);

        // VALIDATE source bank has sufficient balance
        if (sourceBank.currentBalance < transactionAmount) {
          throw new Error(
            `Insufficient bank balance. Available: ${sourceBank.currentBalance}, Requested: ${transactionAmount}`
          );
        }

        // Decrement source bank
        const sourceUpdatedBalance = safeFinancialSubtract(sourceBank.currentBalance, transactionAmount);
        await tx.bank.update({
          where: { id: bankId },
          data: { currentBalance: sourceUpdatedBalance },
        });

        // Increment target bank
        const targetUpdatedBalance = safeFinancialAdd(targetBank.currentBalance, transactionAmount);
        await tx.bank.update({
          where: { id: toBankId },
          data: { currentBalance: targetUpdatedBalance },
        });

        // Generate target transaction code (avoid collision)
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
            companyId: companyId || null,
            chequeNo: cleanChequeNo,
            depositorName: cleanDepositorName,
            referenceNo: cleanReferenceNo,
            description: cleanDescription,
            status: status || 'Approved',
            isActive: true,
          },
          include: { bank: true, toBank: true },
        });

        // Target BankTransaction (type="Deposit", linked via toBankId) — same companyId
        await tx.bankTransaction.create({
          data: {
            transactionCode: targetTransactionCode,
            bankId: toBankId,
            date: transactionDate,
            type: 'Deposit',
            amount: transactionAmount,
            runningBalance: targetUpdatedBalance,
            toBankId: bankId,
            companyId: companyId || null,
            chequeNo: cleanChequeNo,
            depositorName: cleanDepositorName,
            referenceNo: cleanReferenceNo,
            description: cleanDescription || `Transfer from ${sourceBank.bankName}`,
            status: status || 'Approved',
            isActive: true,
          },
          include: { bank: true, toBank: true },
        });

        // LedgerEntry: balanced pair — Dr: Source Bank, Cr: Target Bank
        await tx.ledgerEntry.create({
          data: {
            date: transactionDate,
            account: sourceBank.bankName,
            debit: transactionAmount,
            credit: 0,
            reference: transactionCode,
            referenceType: 'BankTransfer',
          },
        });
        await tx.ledgerEntry.create({
          data: {
            date: transactionDate,
            account: targetBank.bankName,
            debit: 0,
            credit: transactionAmount,
            reference: transactionCode,
            referenceType: 'BankTransfer',
          },
        });

        // AuditLog — module token "Fin-Bank-Settlement"
        await tx.auditLog.create({
          data: {
            action: 'CREATE',
            module: 'Fin-Bank-Settlement',
            recordId: sourceTransaction.id,
            recordLabel: transactionCode,
            userId: security.user.id,
            userName: security.user.name,
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
              companyId: companyId || null,
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
      message.includes('does not belong') ||
      message.includes('required') ||
      message.includes('Invalid') ||
      message.includes('positive')
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}
