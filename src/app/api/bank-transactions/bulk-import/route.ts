import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  checkPeriodClose,
  safeFinancialRound,
  safeFinancialAdd,
  safeFinancialSubtract,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// ─── Currency Sanitization Helper ────────────────────────────
/**
 * sanitizeCurrencyValue - Converts any value to a safe 2-decimal number.
 * Throws an Error if the result is NaN or Infinity.
 */
function sanitizeCurrencyValue(val: unknown): number {
  const num = Number(val);
  if (Number.isNaN(num) || !Number.isFinite(num)) {
    throw new Error(`Invalid currency value: ${String(val)}`);
  }
  return safeFinancialRound(num);
}

// ─── Helper: null if empty string ────────────────────────────
function nullIfEmpty(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  return value.trim() === '' ? null : value.trim();
}

// ─── Type Definition ─────────────────────────────────────────
interface BankTransactionBulkItem {
  bankName: string;
  type: 'Deposit' | 'Withdraw' | 'Transfer';
  amount: number;
  date: string;
  toBankName?: string;
  chequeNo?: string;
  depositorName?: string;
  referenceNo?: string;
  description?: string;
  status?: 'Pending' | 'Approved' | 'Rejected';
}

// POST /api/bank-transactions/bulk-import
// Transactional CSV bulk import with duplicate reference validation,
// bank lookup by name, balance checks, ledger auto-posting, and audit.
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'BankTransactions', 'POST');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const body = await request.json();
    const data: BankTransactionBulkItem[] = body.data;

    // ── Basic shape validation ───────────────────────────────
    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json(
        { error: 'Request body must contain a non-empty "data" array' },
        { status: 400 }
      );
    }

    if (data.length > 500) {
      return NextResponse.json(
        { error: 'Bulk import limited to 500 records per batch' },
        { status: 400 }
      );
    }

    const errors: string[] = [];

    // ── Row-level validation pass (before DB interaction) ────
    data.forEach((item, index) => {
      const row = index + 1;

      if (!item.bankName || typeof item.bankName !== 'string' || item.bankName.trim() === '') {
        errors.push(`Row ${row}: bankName is required`);
      }

      if (!item.type || !['Deposit', 'Withdraw', 'Transfer'].includes(item.type)) {
        errors.push(`Row ${row}: type must be "Deposit", "Withdraw", or "Transfer"`);
      }

      if (item.amount === undefined || item.amount === null) {
        errors.push(`Row ${row}: amount is required`);
      } else {
        try {
          const sanitized = sanitizeCurrencyValue(item.amount);
          if (sanitized <= 0) {
            errors.push(`Row ${row}: amount must be greater than 0`);
          }
        } catch (e) {
          errors.push(`Row ${row}: ${e instanceof Error ? e.message : 'Invalid amount'}`);
        }
      }

      if (!item.date || typeof item.date !== 'string' || item.date.trim() === '') {
        errors.push(`Row ${row}: date is required`);
      } else {
        const parsed = new Date(item.date);
        if (isNaN(parsed.getTime())) {
          errors.push(`Row ${row}: date is not a valid ISO date string`);
        }
      }

      if (item.type === 'Transfer' && (!item.toBankName || typeof item.toBankName !== 'string' || item.toBankName.trim() === '')) {
        errors.push(`Row ${row}: toBankName is required for Transfer transactions`);
      }

      if (item.status && !['Pending', 'Approved', 'Rejected'].includes(item.status)) {
        errors.push(`Row ${row}: status must be "Pending", "Approved", or "Rejected"`);
      }
    });

    if (errors.length > 0) {
      return NextResponse.json(
        { error: 'Validation failed', details: errors },
        { status: 400 }
      );
    }

    // ── Duplicate reference validation ───────────────────────
    // Collect all non-empty referenceNo values from the batch
    const batchReferences: string[] = [];
    data.forEach((item, index) => {
      if (item.referenceNo && item.referenceNo.trim() !== '') {
        batchReferences.push(item.referenceNo.trim());
      }
    });

    // 1) Check against existing database records (where referenceNo IS NOT NULL AND isActive = true)
    const companyFilter: any = {};
    if (companyId) {
      companyFilter.companyId = companyId;
    }

    if (batchReferences.length > 0) {
      const existingRefs = await db.bankTransaction.findMany({
        where: {
          referenceNo: { in: batchReferences },
          isActive: true,
          ...companyFilter,
        },
        select: { referenceNo: true, transactionCode: true },
      });

      if (existingRefs.length > 0) {
        existingRefs.forEach((ref) => {
          errors.push(
            `Duplicate referenceNo "${ref.referenceNo}" already exists in database (transaction: ${ref.transactionCode})`
          );
        });
      }

      // 2) Check intra-batch duplicates
      const refCountMap: Record<string, number[]> = {};
      data.forEach((item, index) => {
        if (item.referenceNo && item.referenceNo.trim() !== '') {
          const normalized = item.referenceNo.trim();
          if (!refCountMap[normalized]) {
            refCountMap[normalized] = [];
          }
          refCountMap[normalized].push(index + 1);
        }
      });

      Object.entries(refCountMap).forEach(([ref, rows]) => {
        if (rows.length > 1) {
          errors.push(
            `Intra-batch duplicate referenceNo "${ref}" found in rows: ${rows.join(', ')}`
          );
        }
      });
    }

    if (errors.length > 0) {
      return NextResponse.json(
        { error: 'Duplicate reference validation failed', details: errors },
        { status: 400 }
      );
    }

    // ── Period-close lock check for all dates ────────────────
    const dateSet = new Set<string>();
    data.forEach((item) => {
      if (item.date) dateSet.add(item.date.trim());
    });

    for (const dateStr of dateSet) {
      const transactionDate = new Date(dateStr);
      const periodLock = await checkPeriodClose(transactionDate);
      if (periodLock) {
        return periodLock;
      }
    }

    // ── Bank lookup by name (within tenant scope) ────────────
    const bankNameSet = new Set<string>();
    data.forEach((item) => {
      if (item.bankName) bankNameSet.add(item.bankName.trim());
      if (item.type === 'Transfer' && item.toBankName) bankNameSet.add(item.toBankName.trim());
    });

    const bankLookupFilter: any = { isActive: true };
    if (companyId) {
      bankLookupFilter.companyId = companyId;
    }

    const banks = await db.bank.findMany({
      where: {
        bankName: { in: Array.from(bankNameSet) },
        ...bankLookupFilter,
      },
      include: { chartOfAccount: true },
    });

    const bankMap: Record<string, typeof banks[number]> = {};
    banks.forEach((bank) => {
      bankMap[bank.bankName.trim().toLowerCase()] = bank;
    });

    // Resolve bank names to IDs and validate
    const resolvedItems: Array<{
      bankId: string;
      bankName: string;
      bank: typeof banks[number];
      type: 'Deposit' | 'Withdraw' | 'Transfer';
      amount: number;
      date: Date;
      toBankId?: string;
      toBankName?: string;
      toBank?: typeof banks[number];
      chequeNo: string | null;
      depositorName: string | null;
      referenceNo: string | null;
      description: string | null;
      status: string;
    }> = [];

    data.forEach((item, index) => {
      const row = index + 1;
      const bank = bankMap[item.bankName.trim().toLowerCase()];
      if (!bank) {
        errors.push(`Row ${row}: Bank "${item.bankName}" not found or does not belong to your company`);
        return;
      }

      let toBank: typeof banks[number] | undefined;
      let toBankId: string | undefined;

      if (item.type === 'Transfer') {
        toBank = bankMap[item.toBankName!.trim().toLowerCase()];
        if (!toBank) {
          errors.push(`Row ${row}: Target bank "${item.toBankName}" not found or does not belong to your company`);
          return;
        }
        toBankId = toBank.id;

        if (bank.id === toBank.id) {
          errors.push(`Row ${row}: Source and target bank cannot be the same for Transfer`);
          return;
        }
      }

      resolvedItems.push({
        bankId: bank.id,
        bankName: bank.bankName,
        bank,
        type: item.type,
        amount: sanitizeCurrencyValue(item.amount),
        date: new Date(item.date),
        toBankId,
        toBankName: toBank?.bankName,
        toBank,
        chequeNo: nullIfEmpty(item.chequeNo),
        depositorName: nullIfEmpty(item.depositorName),
        referenceNo: nullIfEmpty(item.referenceNo),
        description: nullIfEmpty(item.description),
        status: item.status || 'Approved',
      });
    });

    if (errors.length > 0) {
      return NextResponse.json(
        { error: 'Bank resolution failed', details: errors },
        { status: 400 }
      );
    }

    // ── Balance pre-computation and validation ────────────────
    // Compute running projected balance per bank in order
    const runningProjected: Record<string, number> = {};
    resolvedItems.forEach((item, index) => {
      const row = index + 1;

      if (!(item.bankId in runningProjected)) {
        runningProjected[item.bankId] = item.bank.currentBalance;
      }

      if (item.type === 'Deposit') {
        runningProjected[item.bankId] = safeFinancialAdd(runningProjected[item.bankId], item.amount);
      } else if (item.type === 'Withdraw') {
        runningProjected[item.bankId] = safeFinancialSubtract(runningProjected[item.bankId], item.amount);
        if (runningProjected[item.bankId] < 0) {
          errors.push(
            `Row ${row}: Insufficient balance in bank "${item.bankName}" for withdrawal of ${item.amount}. Projected balance: ${runningProjected[item.bankId]}`
          );
        }
      } else if (item.type === 'Transfer') {
        runningProjected[item.bankId] = safeFinancialSubtract(runningProjected[item.bankId], item.amount);
        if (runningProjected[item.bankId] < 0) {
          errors.push(
            `Row ${row}: Insufficient balance in source bank "${item.bankName}" for transfer of ${item.amount}. Projected balance: ${runningProjected[item.bankId]}`
          );
        }
        if (item.toBankId) {
          if (!(item.toBankId in runningProjected)) {
            const toBankRecord = resolvedItems.find(r => r.toBankId === item.toBankId);
            runningProjected[item.toBankId] = toBankRecord?.toBank?.currentBalance ?? 0;
          }
          runningProjected[item.toBankId] = safeFinancialAdd(runningProjected[item.toBankId], item.amount);
        }
      }
    });

    if (errors.length > 0) {
      return NextResponse.json(
        { error: 'Balance validation failed', details: errors },
        { status: 400 }
      );
    }

    // ── ALL-OR-NOTHING TRANSACTIONAL IMPORT ──────────────────
    const transactionCodes: string[] = [];

    const result = await db.$transaction(async (tx) => {
      // Get the current highest transaction code
      const lastBT = await tx.bankTransaction.findFirst({
        orderBy: { transactionCode: 'desc' },
        select: { transactionCode: true },
      });

      let nextCodeNum = 1;
      if (lastBT?.transactionCode) {
        const match = lastBT.transactionCode.match(/BTX-(\d+)/);
        if (match) {
          nextCodeNum = parseInt(match[1], 10) + 1;
        }
      }

      for (let i = 0; i < resolvedItems.length; i++) {
        const item = resolvedItems[i];
        const transactionCode = `BTX-${String(nextCodeNum).padStart(5, '0')}`;
        nextCodeNum++;

        // Re-fetch bank inside transaction for latest balance
        const bank = await tx.bank.findFirst({
          where: { id: item.bankId, isActive: true },
        });
        if (!bank) {
          throw new Error(`Bank "${item.bankName}" not found during transaction execution`);
        }

        // ── Deposit ────────────────────────────────────────
        if (item.type === 'Deposit') {
          const updatedBalance = safeFinancialAdd(bank.currentBalance, item.amount);
          await tx.bank.update({
            where: { id: bank.id },
            data: { currentBalance: updatedBalance },
          });

          await tx.bankTransaction.create({
            data: {
              transactionCode,
              bankId: bank.id,
              date: item.date,
              type: 'Deposit',
              amount: item.amount,
              runningBalance: updatedBalance,
              companyId: companyId || null,
              chequeNo: item.chequeNo,
              depositorName: item.depositorName,
              referenceNo: item.referenceNo,
              description: item.description,
              status: item.status,
              isActive: true,
            },
            include: { bank: true, toBank: true },
          });

          // LedgerEntry: Dr Bank CoA, Cr Cash in Hand
          await tx.ledgerEntry.create({
            data: {
              date: item.date,
              account: bank.bankName,
              debit: item.amount,
              credit: 0,
              reference: transactionCode,
              referenceType: 'BankDeposit',
            },
          });
          await tx.ledgerEntry.create({
            data: {
              date: item.date,
              account: 'Cash in Hand',
              debit: 0,
              credit: item.amount,
              reference: transactionCode,
              referenceType: 'BankDeposit',
            },
          });

          transactionCodes.push(transactionCode);
        }

        // ── Withdraw ───────────────────────────────────────
        if (item.type === 'Withdraw') {
          // Validate sufficient balance (re-check inside transaction)
          if (bank.currentBalance < item.amount) {
            throw new Error(
              `Insufficient bank balance in "${item.bankName}". Available: ${bank.currentBalance}, Requested: ${item.amount}`
            );
          }

          const updatedBalance = safeFinancialSubtract(bank.currentBalance, item.amount);
          await tx.bank.update({
            where: { id: bank.id },
            data: { currentBalance: updatedBalance },
          });

          await tx.bankTransaction.create({
            data: {
              transactionCode,
              bankId: bank.id,
              date: item.date,
              type: 'Withdraw',
              amount: item.amount,
              runningBalance: updatedBalance,
              companyId: companyId || null,
              chequeNo: item.chequeNo,
              depositorName: item.depositorName,
              referenceNo: item.referenceNo,
              description: item.description,
              status: item.status,
              isActive: true,
            },
            include: { bank: true, toBank: true },
          });

          // LedgerEntry: Dr Cash in Hand, Cr Bank CoA
          await tx.ledgerEntry.create({
            data: {
              date: item.date,
              account: 'Cash in Hand',
              debit: item.amount,
              credit: 0,
              reference: transactionCode,
              referenceType: 'BankWithdraw',
            },
          });
          await tx.ledgerEntry.create({
            data: {
              date: item.date,
              account: bank.bankName,
              debit: 0,
              credit: item.amount,
              reference: transactionCode,
              referenceType: 'BankWithdraw',
            },
          });

          transactionCodes.push(transactionCode);
        }

        // ── Transfer ───────────────────────────────────────
        if (item.type === 'Transfer') {
          if (!item.toBankId) {
            throw new Error(`Transfer at row ${i + 1} is missing toBankId`);
          }

          const targetBank = await tx.bank.findFirst({
            where: { id: item.toBankId, isActive: true },
          });
          if (!targetBank) {
            throw new Error(`Target bank "${item.toBankName}" not found during transaction execution`);
          }

          // Validate sufficient balance (re-check inside transaction)
          if (bank.currentBalance < item.amount) {
            throw new Error(
              `Insufficient bank balance in source bank "${item.bankName}". Available: ${bank.currentBalance}, Requested: ${item.amount}`
            );
          }

          // Decrement source bank
          const sourceUpdatedBalance = safeFinancialSubtract(bank.currentBalance, item.amount);
          await tx.bank.update({
            where: { id: bank.id },
            data: { currentBalance: sourceUpdatedBalance },
          });

          // Increment target bank
          const targetUpdatedBalance = safeFinancialAdd(targetBank.currentBalance, item.amount);
          await tx.bank.update({
            where: { id: targetBank.id },
            data: { currentBalance: targetUpdatedBalance },
          });

          // Source BankTransaction (type="Transfer")
          await tx.bankTransaction.create({
            data: {
              transactionCode,
              bankId: bank.id,
              date: item.date,
              type: 'Transfer',
              amount: item.amount,
              runningBalance: sourceUpdatedBalance,
              toBankId: targetBank.id,
              companyId: companyId || null,
              chequeNo: item.chequeNo,
              depositorName: item.depositorName,
              referenceNo: item.referenceNo,
              description: item.description,
              status: item.status,
              isActive: true,
            },
            include: { bank: true, toBank: true },
          });

          // Target BankTransaction (type="Deposit", linked via toBankId) — same companyId
          const targetTransactionCode = `BTX-${String(nextCodeNum).padStart(5, '0')}`;
          nextCodeNum++;

          await tx.bankTransaction.create({
            data: {
              transactionCode: targetTransactionCode,
              bankId: targetBank.id,
              date: item.date,
              type: 'Deposit',
              amount: item.amount,
              runningBalance: targetUpdatedBalance,
              toBankId: bank.id,
              companyId: companyId || null,
              chequeNo: item.chequeNo,
              depositorName: item.depositorName,
              referenceNo: item.referenceNo,
              description: item.description || `Transfer from ${bank.bankName}`,
              status: item.status,
              isActive: true,
            },
            include: { bank: true, toBank: true },
          });

          // LedgerEntry: Dr Source Bank CoA, Cr Target Bank CoA
          await tx.ledgerEntry.create({
            data: {
              date: item.date,
              account: bank.bankName,
              debit: item.amount,
              credit: 0,
              reference: transactionCode,
              referenceType: 'BankTransfer',
            },
          });
          await tx.ledgerEntry.create({
            data: {
              date: item.date,
              account: targetBank.bankName,
              debit: 0,
              credit: item.amount,
              reference: transactionCode,
              referenceType: 'BankTransfer',
            },
          });

          transactionCodes.push(transactionCode);
        }
      }

      return { importedCount: resolvedItems.length };
    });

    // ── Single audit log entry for the bulk import ───────────
    await logUserActivity({
      action: 'IMPORT',
      module: 'Fin-Bank-Settlement',
      recordId: 'BULK',
      recordLabel: `Bulk Import: ${result.importedCount} transactions`,
      userId: security.user.id,
      userName: security.user.name,
      details: JSON.stringify({
        importedCount: result.importedCount,
        transactionCodes,
        companyId: companyId || null,
      }),
    });

    return NextResponse.json(
      {
        imported: result.importedCount,
        transactionCodes,
        errors: [],
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error('Error in bank transaction bulk import:', error);
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to import bank transactions in bulk';
    const statusCode =
      message.includes('Insufficient') ||
      message.includes('not found') ||
      message.includes('does not belong') ||
      message.includes('Invalid') ||
      message.includes('required') ||
      message.includes('same')
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}
