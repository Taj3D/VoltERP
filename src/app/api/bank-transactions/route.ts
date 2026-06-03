// ============================================================
// Bank Transactions API — Double-Entry CoA Alignment, LedgerAutoPost, Balance Validation
// Module Token: Fin-Bank-Settlement
// ============================================================

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
import { logUserActivity } from '@/lib/activity-logger';

// Helper: normalize empty strings to null
function nullIfEmpty(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  return String(value).trim() === '' ? null : String(value).trim();
}

// Helper: generate BTX code — collision-safe
async function generateTransactionCode(tx: any): Promise<string> {
  const all = await tx.bankTransaction.findMany({
    select: { transactionCode: true },
  });
  let maxNum = 0;
  for (const r of all) {
    if (r.transactionCode) {
      const match = r.transactionCode.match(/BTX-(\d+)/);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
    }
  }
  return `BTX-${String(maxNum + 1).padStart(5, '0')}`;
}

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

// GET /api/bank-transactions — List with query params, running balance, summary, VAT masking
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'BankTransactions', 'GET');
  if (!security.authorized) return security.response;

  const { role, companyId } = security.user;

  try {
    const { searchParams } = new URL(request.url);
    const bankId = searchParams.get('bankId');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const bankType = searchParams.get('bankType');
    const action = searchParams.get('action');
    const ledgerPosted = searchParams.get('ledgerPosted');

    const whereClause: Record<string, unknown> = { isActive: true };
    if (companyId) whereClause.companyId = companyId;
    if (bankId) whereClause.bankId = bankId;
    if (ledgerPosted !== null && ledgerPosted !== undefined) {
      whereClause.ledgerPosted = ledgerPosted === 'true';
    }

    if (dateFrom || dateTo) {
      const dateFilter: Record<string, Date> = {};
      if (dateFrom) dateFilter.gte = new Date(dateFrom);
      if (dateTo) dateFilter.lte = new Date(dateTo);
      whereClause.date = dateFilter;
    }

    if (bankType && ['Bank', 'MFS', 'CashDrawer'].includes(bankType)) {
      whereClause.bank = {
        bankType,
        isActive: true,
        ...(companyId ? { companyId } : {}),
      };
    }

    // ── Summary action ──
    if (action === 'summary') {
      const items = await db.bankTransaction.findMany({
        where: whereClause,
        include: {
          bank: { include: { chartOfAccount: true } },
          toBank: { include: { chartOfAccount: true } },
        },
        orderBy: { date: 'asc' },
      });

      let totalDeposits = 0;
      let totalWithdrawals = 0;
      let totalTransfers = 0;

      const bankSummaryMap: Record<string, {
        bankId: string; bankName: string; bankType: string;
        deposits: number; withdrawals: number; transfers: number; currentBalance: number;
      }> = {};

      items.forEach((txn: Record<string, unknown>) => {
        const bId = txn.bankId as string;
        const bName = (txn.bank as Record<string, unknown>)?.bankName as string || 'Unknown';
        const bType = (txn.bank as Record<string, unknown>)?.bankType as string || 'Bank';
        const bBalance = (txn.bank as Record<string, unknown>)?.currentBalance as number || 0;

        if (!bankSummaryMap[bId]) {
          bankSummaryMap[bId] = { bankId: bId, bankName: bName, bankType: bType, deposits: 0, withdrawals: 0, transfers: 0, currentBalance: bBalance };
        }

        if (txn.type === 'Deposit') {
          totalDeposits = safeFinancialAdd(totalDeposits, txn.amount as number);
          bankSummaryMap[bId].deposits = safeFinancialAdd(bankSummaryMap[bId].deposits, txn.amount as number);
        } else if (txn.type === 'Withdraw') {
          totalWithdrawals = safeFinancialAdd(totalWithdrawals, txn.amount as number);
          bankSummaryMap[bId].withdrawals = safeFinancialAdd(bankSummaryMap[bId].withdrawals, txn.amount as number);
        } else if (txn.type === 'Transfer') {
          totalTransfers = safeFinancialAdd(totalTransfers, txn.amount as number);
          bankSummaryMap[bId].transfers = safeFinancialAdd(bankSummaryMap[bId].transfers, txn.amount as number);
        }
      });

      const bankWiseSummary = Object.values(bankSummaryMap).map((b) => ({
        ...b,
        netChange: safeFinancialSubtract(safeFinancialSubtract(b.deposits, b.withdrawals), b.transfers),
      }));

      const netCashPosition = safeFinancialSubtract(safeFinancialSubtract(totalDeposits, totalWithdrawals), totalTransfers);

      const summaryResult = { totalDeposits, totalWithdrawals, totalTransfers, netCashPosition, bankWiseSummary };

      // VAT Auditor masking for summary
      if (role === 'vat_auditor') {
        const maskedSummary = { ...summaryResult } as Record<string, unknown>;
        maskedSummary.totalDeposits = 'N/A (Audit Mode)';
        maskedSummary.totalWithdrawals = 'N/A (Audit Mode)';
        maskedSummary.totalTransfers = 'N/A (Audit Mode)';
        maskedSummary.netCashPosition = 'N/A (Audit Mode)';
        maskedSummary.bankWiseSummary = bankWiseSummary.map((b) => ({
          ...b, deposits: 'N/A (Audit Mode)', withdrawals: 'N/A (Audit Mode)', transfers: 'N/A (Audit Mode)', netChange: 'N/A (Audit Mode)', currentBalance: 'N/A (Audit Mode)',
        }));
        return NextResponse.json(maskedSummary);
      }

      return NextResponse.json(summaryResult);
    }

    // ── Standard list action ──
    const items = await db.bankTransaction.findMany({
      where: whereClause,
      include: {
        bank: { include: { chartOfAccount: true } },
        toBank: { include: { chartOfAccount: true } },
      },
      orderBy: { date: 'asc' },
    });

    // Compute running balances per bank
    const bankBalanceMap: Record<string, number> = {};
    const computed = items.map((txn: Record<string, unknown>) => {
      const bId = txn.bankId as string;
      const bankData = txn.bank as Record<string, unknown> | null;
      if (!(bId in bankBalanceMap)) {
        bankBalanceMap[bId] = (bankData?.openingBalance as number) || 0;
      }
      if (txn.type === 'Deposit') {
        bankBalanceMap[bId] = safeFinancialAdd(bankBalanceMap[bId], txn.amount as number);
      } else if (txn.type === 'Withdraw' || txn.type === 'Transfer') {
        bankBalanceMap[bId] = safeFinancialSubtract(bankBalanceMap[bId], txn.amount as number);
      }
      const runningBalance = safeFinancialRound(bankBalanceMap[bId]);
      // Fire-and-forget stale update
      if (Math.abs((txn.runningBalance as number) - runningBalance) > 0.005) {
        db.bankTransaction.update({ where: { id: txn.id as string }, data: { runningBalance } }).catch(() => {});
      }
      return { ...txn, runningBalance };
    });

    computed.reverse();
    const masked = maskFinancialArray(computed as Record<string, unknown>[], role, ['ledgerPosted', 'debitEntryCode', 'creditEntryCode']);
    return NextResponse.json(masked);
  } catch (error) {
    console.error('Error fetching bank transactions:', error);
    return NextResponse.json({ error: 'Failed to fetch bank transactions' }, { status: 500 });
  }
}

// POST /api/bank-transactions — Create with double-entry ledger, LedgerAutoPost, balance validation
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'BankTransactions', 'POST');
  if (!security.authorized) return security.response;

  const { id: userId, name: userName, companyId } = security.user;

  try {
    const body = await request.json();
    const { bankId, date, type, amount, toBankId, chequeNo, depositorName, referenceNo, description, status, referenceKey } = body;

    if (!bankId || !type || !date || amount === undefined || amount === null) {
      return NextResponse.json({ error: 'bankId, type, date, and amount are required' }, { status: 400 });
    }

    const transactionAmount = safeFinancialRound(Number(amount));
    if (isNaN(transactionAmount) || transactionAmount <= 0) {
      return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 });
    }

    if (!['Deposit', 'Withdraw', 'Transfer'].includes(type)) {
      return NextResponse.json({ error: 'Invalid transaction type. Must be Deposit, Withdraw, or Transfer.' }, { status: 400 });
    }

    if (type === 'Transfer' && !toBankId) {
      return NextResponse.json({ error: 'toBankId is required for Transfer transactions' }, { status: 400 });
    }

    // Period-close lock check
    const transactionDate = new Date(date);
    const periodLock = await checkPeriodClose(transactionDate);
    if (periodLock) return periodLock;

    // Idempotency check
    if (referenceKey) {
      const existing = await db.bankTransaction.findFirst({
        where: { referenceKey: String(referenceKey) },
      });
      if (existing) {
        return NextResponse.json(
          { error: `Idempotency conflict: BankTransaction with referenceKey "${String(referenceKey)}" already exists` },
          { status: 409 }
        );
      }
    }

    const cleanChequeNo = nullIfEmpty(chequeNo as string | undefined);
    const cleanDepositorName = nullIfEmpty(depositorName as string | undefined);
    const cleanReferenceNo = nullIfEmpty(referenceNo as string | undefined);
    const cleanDescription = nullIfEmpty(description as string | undefined);
    const effectiveStatus = status || 'Approved';

    const bankCompanyFilter: Record<string, unknown> = {};
    if (companyId) bankCompanyFilter.companyId = companyId;

    const result = await db.$transaction(async (tx: any) => {
      const transactionCode = await generateTransactionCode(tx);

      // ── Deposit ──
      if (type === 'Deposit') {
        const bank = await tx.bank.findFirst({ where: { id: bankId, ...bankCompanyFilter, isActive: true } });
        if (!bank) throw new Error(`Bank with id ${bankId} not found or does not belong to your company`);

        const updatedBalance = safeFinancialAdd(bank.currentBalance, transactionAmount);
        await tx.bank.update({ where: { id: bankId }, data: { currentBalance: updatedBalance } });

        const bankTransaction = await tx.bankTransaction.create({
          data: {
            transactionCode, bankId, date: transactionDate, type: 'Deposit',
            amount: transactionAmount, runningBalance: updatedBalance,
            companyId: companyId || null, chequeNo: cleanChequeNo, depositorName: cleanDepositorName,
            referenceNo: cleanReferenceNo, description: cleanDescription,
            status: effectiveStatus, referenceKey: referenceKey ? String(referenceKey) : null,
            ledgerPosted: false,
          },
          include: { bank: true, toBank: true },
        });

        // Double-Entry Ledger
        let debitEntryCode: string | null = null;
        let creditEntryCode: string | null = null;

        if (effectiveStatus === 'Approved') {
          const drCode = await generateLedgerEntryCode(tx);
          const crCode = `LED-${String(parseInt(drCode.match(/LED-(\d+)/)?.[1] || '0', 10) + 1).padStart(5, '0')}`;

          await tx.ledgerEntry.create({
            data: {
              entryCode: drCode, date: transactionDate, accountId: bank.chartOfAccountId,
              account: bank.bankName, debit: transactionAmount, credit: 0,
              reference: transactionCode, referenceType: 'BankDeposit', companyId: companyId || null,
            },
          });
          await tx.ledgerEntry.create({
            data: {
              entryCode: crCode, date: transactionDate,
              account: 'Cash in Hand', debit: 0, credit: transactionAmount,
              reference: transactionCode, referenceType: 'BankDeposit', companyId: companyId || null,
            },
          });

          debitEntryCode = drCode;
          creditEntryCode = crCode;

          // LedgerAutoPost
          const lapCode = await generateAutoPostCode(tx);
          await tx.ledgerAutoPost.create({
            data: {
              code: lapCode, sourceType: 'BankTransaction', sourceId: bankTransaction.id,
              sourceCode: transactionCode, debitEntryId: drCode, creditEntryId: crCode,
              debitAccount: bank.bankName, creditAccount: 'Cash in Hand',
              amount: transactionAmount, postingDate: transactionDate, status: 'Posted',
              companyId: companyId || null, postedBy: userId,
            },
          });

          await tx.bankTransaction.update({
            where: { id: bankTransaction.id },
            data: { ledgerPosted: true, debitEntryCode, creditEntryCode },
          });
        }

        await tx.auditLog.create({
          data: {
            action: 'CREATE', module: 'Fin-Bank-Settlement', recordId: bankTransaction.id,
            recordLabel: transactionCode, userId, userName,
            details: JSON.stringify({ type: 'Deposit', bankId, bankName: bank.bankName, amount: transactionAmount, runningBalance: updatedBalance, companyId: companyId || null, ledgerPosted: effectiveStatus === 'Approved' }),
          },
        });

        await logUserActivity({ tx: tx, action: 'CREATE', module: 'Fin-Bank-Settlement', recordId: bankTransaction.id, recordLabel: transactionCode, userId, userName, details: `Bank Deposit ${transactionCode}: ৳${transactionAmount}` });

        return bankTransaction;
      }

      // ── Withdraw ──
      if (type === 'Withdraw') {
        const bank = await tx.bank.findFirst({ where: { id: bankId, ...bankCompanyFilter, isActive: true } });
        if (!bank) throw new Error(`Bank with id ${bankId} not found or does not belong to your company`);

        if (bank.currentBalance < transactionAmount) {
          throw new Error(`Insufficient bank balance. Available: ${bank.currentBalance}, Requested: ${transactionAmount}`);
        }

        const updatedBalance = safeFinancialSubtract(bank.currentBalance, transactionAmount);
        await tx.bank.update({ where: { id: bankId }, data: { currentBalance: updatedBalance } });

        const bankTransaction = await tx.bankTransaction.create({
          data: {
            transactionCode, bankId, date: transactionDate, type: 'Withdraw',
            amount: transactionAmount, runningBalance: updatedBalance,
            companyId: companyId || null, chequeNo: cleanChequeNo, depositorName: cleanDepositorName,
            referenceNo: cleanReferenceNo, description: cleanDescription,
            status: effectiveStatus, referenceKey: referenceKey ? String(referenceKey) : null,
            ledgerPosted: false,
          },
          include: { bank: true, toBank: true },
        });

        let debitEntryCode: string | null = null;
        let creditEntryCode: string | null = null;

        if (effectiveStatus === 'Approved') {
          const drCode = await generateLedgerEntryCode(tx);
          const crCode = `LED-${String(parseInt(drCode.match(/LED-(\d+)/)?.[1] || '0', 10) + 1).padStart(5, '0')}`;

          await tx.ledgerEntry.create({
            data: {
              entryCode: drCode, date: transactionDate,
              account: 'Cash in Hand', debit: transactionAmount, credit: 0,
              reference: transactionCode, referenceType: 'BankWithdraw', companyId: companyId || null,
            },
          });
          await tx.ledgerEntry.create({
            data: {
              entryCode: crCode, date: transactionDate, accountId: bank.chartOfAccountId,
              account: bank.bankName, debit: 0, credit: transactionAmount,
              reference: transactionCode, referenceType: 'BankWithdraw', companyId: companyId || null,
            },
          });

          debitEntryCode = drCode;
          creditEntryCode = crCode;

          const lapCode = await generateAutoPostCode(tx);
          await tx.ledgerAutoPost.create({
            data: {
              code: lapCode, sourceType: 'BankTransaction', sourceId: bankTransaction.id,
              sourceCode: transactionCode, debitEntryId: drCode, creditEntryId: crCode,
              debitAccount: 'Cash in Hand', creditAccount: bank.bankName,
              amount: transactionAmount, postingDate: transactionDate, status: 'Posted',
              companyId: companyId || null, postedBy: userId,
            },
          });

          await tx.bankTransaction.update({
            where: { id: bankTransaction.id },
            data: { ledgerPosted: true, debitEntryCode, creditEntryCode },
          });
        }

        await tx.auditLog.create({
          data: {
            action: 'CREATE', module: 'Fin-Bank-Settlement', recordId: bankTransaction.id,
            recordLabel: transactionCode, userId, userName,
            details: JSON.stringify({ type: 'Withdraw', bankId, bankName: bank.bankName, amount: transactionAmount, runningBalance: updatedBalance, companyId: companyId || null, ledgerPosted: effectiveStatus === 'Approved' }),
          },
        });

        await logUserActivity({ tx: tx, action: 'CREATE', module: 'Fin-Bank-Settlement', recordId: bankTransaction.id, recordLabel: transactionCode, userId, userName, details: `Bank Withdraw ${transactionCode}: ৳${transactionAmount}` });

        return bankTransaction;
      }

      // ── Transfer ──
      if (type === 'Transfer') {
        const sourceBank = await tx.bank.findFirst({ where: { id: bankId, ...bankCompanyFilter, isActive: true } });
        if (!sourceBank) throw new Error(`Source bank with id ${bankId} not found`);

        const targetBank = await tx.bank.findFirst({ where: { id: toBankId, ...bankCompanyFilter, isActive: true } });
        if (!targetBank) throw new Error(`Target bank with id ${toBankId} not found`);

        if (sourceBank.currentBalance < transactionAmount) {
          throw new Error(`Insufficient bank balance. Available: ${sourceBank.currentBalance}, Requested: ${transactionAmount}`);
        }

        const sourceUpdatedBalance = safeFinancialSubtract(sourceBank.currentBalance, transactionAmount);
        const targetUpdatedBalance = safeFinancialAdd(targetBank.currentBalance, transactionAmount);

        await tx.bank.update({ where: { id: bankId }, data: { currentBalance: sourceUpdatedBalance } });
        await tx.bank.update({ where: { id: toBankId }, data: { currentBalance: targetUpdatedBalance } });

        // Generate target transaction code — collision-safe
        const allBTForTarget = await tx.bankTransaction.findMany({ select: { transactionCode: true } });
        let targetMaxNum = 0;
        for (const r of allBTForTarget) {
          if (r.transactionCode) {
            const match = r.transactionCode.match(/BTX-(\d+)/);
            if (match) targetMaxNum = Math.max(targetMaxNum, parseInt(match[1], 10));
          }
        }
        const sourceNum = parseInt(transactionCode.match(/BTX-(\d+)/)?.[1] || '0', 10);
        const effectiveTargetNum = Math.max(targetMaxNum, sourceNum) + 1;
        const targetTransactionCode = `BTX-${String(effectiveTargetNum).padStart(5, '0')}`;

        const sourceTransaction = await tx.bankTransaction.create({
          data: {
            transactionCode, bankId, date: transactionDate, type: 'Transfer',
            amount: transactionAmount, runningBalance: sourceUpdatedBalance, toBankId,
            companyId: companyId || null, chequeNo: cleanChequeNo, depositorName: cleanDepositorName,
            referenceNo: cleanReferenceNo, description: cleanDescription,
            status: effectiveStatus, referenceKey: referenceKey ? String(referenceKey) : null,
            ledgerPosted: false,
          },
          include: { bank: true, toBank: true },
        });

        await tx.bankTransaction.create({
          data: {
            transactionCode: targetTransactionCode, bankId: toBankId, date: transactionDate, type: 'Deposit',
            amount: transactionAmount, runningBalance: targetUpdatedBalance, toBankId: bankId,
            companyId: companyId || null, chequeNo: cleanChequeNo, depositorName: cleanDepositorName,
            referenceNo: cleanReferenceNo, description: cleanDescription || `Transfer from ${sourceBank.bankName}`,
            status: effectiveStatus, ledgerPosted: false,
          },
          include: { bank: true, toBank: true },
        });

        // Double-Entry Ledger for transfer
        let debitEntryCode: string | null = null;
        let creditEntryCode: string | null = null;

        if (effectiveStatus === 'Approved') {
          const drCode = await generateLedgerEntryCode(tx);
          const crCode = `LED-${String(parseInt(drCode.match(/LED-(\d+)/)?.[1] || '0', 10) + 1).padStart(5, '0')}`;

          await tx.ledgerEntry.create({
            data: {
              entryCode: drCode, date: transactionDate, accountId: targetBank.chartOfAccountId,
              account: targetBank.bankName, debit: transactionAmount, credit: 0,
              reference: transactionCode, referenceType: 'BankTransfer', companyId: companyId || null,
            },
          });
          await tx.ledgerEntry.create({
            data: {
              entryCode: crCode, date: transactionDate, accountId: sourceBank.chartOfAccountId,
              account: sourceBank.bankName, debit: 0, credit: transactionAmount,
              reference: transactionCode, referenceType: 'BankTransfer', companyId: companyId || null,
            },
          });

          debitEntryCode = drCode;
          creditEntryCode = crCode;

          const lapCode = await generateAutoPostCode(tx);
          await tx.ledgerAutoPost.create({
            data: {
              code: lapCode, sourceType: 'BankTransaction', sourceId: sourceTransaction.id,
              sourceCode: transactionCode, debitEntryId: drCode, creditEntryId: crCode,
              debitAccount: targetBank.bankName, creditAccount: sourceBank.bankName,
              amount: transactionAmount, postingDate: transactionDate, status: 'Posted',
              companyId: companyId || null, postedBy: userId,
            },
          });

          await tx.bankTransaction.update({
            where: { id: sourceTransaction.id },
            data: { ledgerPosted: true, debitEntryCode, creditEntryCode },
          });
        }

        await tx.auditLog.create({
          data: {
            action: 'CREATE', module: 'Fin-Bank-Settlement', recordId: sourceTransaction.id,
            recordLabel: transactionCode, userId, userName,
            details: JSON.stringify({
              type: 'Transfer', sourceBankId: bankId, sourceBankName: sourceBank.bankName,
              targetBankId: toBankId, targetBankName: targetBank.bankName,
              amount: transactionAmount, sourceRunningBalance: sourceUpdatedBalance,
              targetRunningBalance: targetUpdatedBalance, targetTransactionCode,
              companyId: companyId || null, ledgerPosted: effectiveStatus === 'Approved',
            }),
          },
        });

        await logUserActivity({ tx: tx, action: 'CREATE', module: 'Fin-Bank-Settlement', recordId: sourceTransaction.id, recordLabel: transactionCode, userId, userName, details: `Bank Transfer ${transactionCode}: ৳${transactionAmount}` });

        return sourceTransaction;
      }

      throw new Error('Unhandled transaction type');
    });

    // Automated SMS: Financial Collection Event (Bank Deposit = payment received)
    // Only trigger for Deposit type — represents incoming payment (cash/bank/bKash/Nagad)
    if (result && type === 'Deposit') {
      try {
        const { triggerFinancialCollectionSms } = await import('@/lib/sms-event-hooks');
        // Bank deposits may not have a direct customer/supplier link,
        // so we pass depositorName as context. The SMS trigger will skip
        // silently if no matching customer/supplier is found.
        await triggerFinancialCollectionSms({
          id: (result as any).id,
          amount: (result as any).amount,
          paymentMethod: (result as any).bank?.bankType === 'MFS' ? 'Mobile Financial Service' : 'Bank Transfer',
          date: (result as any).date,
          companyId: companyId || undefined,
        });
      } catch (smsError) {
        console.error('[BankTransactions] SMS trigger failed (non-blocking):', smsError);
      }
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating bank transaction:', error);
    const message = error instanceof Error ? error.message : 'Failed to create bank transaction';
    const statusCode = message.includes('Insufficient') || message.includes('not found') || message.includes('required') || message.includes('Invalid') || message.includes('positive') ? 400 : 500;
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}
