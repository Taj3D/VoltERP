// ============================================================
// JOURNAL VOUCHERS — Phase 13
// Unified voucher header with multi-line debit/credit entries.
// VoucherType: JOURNAL, CASH_RECEIPT, CASH_PAYMENT, BANK_RECEIPT, BANK_PAYMENT
// Atomic double-entry: every voucher posts LedgerEntry pairs + increments COA currentBalance
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  safeFinancialRound,
  safeFinancialAdd,
  safeFinancialSubtract,
  maskAccountingArray,
  checkPeriodClose,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// Voucher type → prefix mapping for voucherNo generation
const VOUCHER_TYPE_PREFIX: Record<string, string> = {
  JOURNAL: 'JV-',
  CASH_RECEIPT: 'CR-',
  CASH_PAYMENT: 'CP-',
  BANK_RECEIPT: 'BR-',
  BANK_PAYMENT: 'BP-',
};

/**
 * Helper: Generate the next sequential code within a transaction.
 * Uses `tx` (transaction client) so it sees uncommitted records from the same transaction.
 */
async function generateNextCodeInTx(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  model: 'chartOfAccount' | 'ledgerEntry' | 'periodClose' | 'journalVoucher',
  prefix: string
): Promise<string> {
  const modelConfig: Record<string, { codeField: string; dbModel: string }> = {
    chartOfAccount: { codeField: 'code', dbModel: 'chartOfAccount' },
    ledgerEntry: { codeField: 'entryCode', dbModel: 'ledgerEntry' },
    periodClose: { codeField: 'code', dbModel: 'periodClose' },
    journalVoucher: { codeField: 'voucherNo', dbModel: 'journalVoucher' },
  };

  const config = modelConfig[model];
  if (!config) return `${prefix}00001`;

  const { codeField, dbModel } = config;
  const latestRecord = await (tx as any)[dbModel].findFirst({
    where: { [codeField]: { startsWith: prefix } },
    orderBy: { [codeField]: 'desc' },
    select: { [codeField]: true },
  });

  if (!latestRecord) return `${prefix}00001`;

  const numericPart = latestRecord[codeField].replace(prefix, '');
  const lastNumber = parseInt(numericPart, 10) || 0;
  return `${prefix}${String(lastNumber + 1).padStart(5, '0')}`;
}

/**
 * Helper: Post a voucher to the general ledger.
 * Creates LedgerEntry records for each VoucherLine and updates ChartOfAccount.currentBalance.
 * Must be called inside a $transaction.
 */
async function postVoucherToLedger(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  voucher: {
    id: string;
    voucherNo: string;
    date: Date;
    narration: string | null;
    companyId: string | null;
  },
  lines: Array<{
    accountId: string | null;
    accountName: string;
    debit: number;
    credit: number;
    particulars: string | null;
  }>
) {
  for (const line of lines) {
    // Generate entry code for each ledger entry (transaction-aware)
    const entryCode = await generateNextCodeInTx(tx, 'ledgerEntry', 'LED-');

    await tx.ledgerEntry.create({
      data: {
        entryCode,
        date: voucher.date,
        accountId: line.accountId || null,
        account: line.accountName,
        particulars: line.particulars || voucher.narration || null,
        debit: safeFinancialRound(line.debit),
        credit: safeFinancialRound(line.credit),
        reference: voucher.voucherNo,
        referenceType: 'JournalVoucher',
        companyId: voucher.companyId || null,
        isActive: true,
      },
    });

    // Update ChartOfAccount.currentBalance based on classification
    if (line.accountId) {
      const coaAccount = await tx.chartOfAccount.findUnique({
        where: { id: line.accountId },
        select: { classification: true, currentBalance: true },
      });

      if (coaAccount) {
        let newBalance = coaAccount.currentBalance;
        const classification = coaAccount.classification;
        const isDebitNature = classification === 'Asset' || classification === 'Expense';
        const isCreditNature = classification === 'Liability' || classification === 'Equity' || classification === 'Income' || classification === 'Revenue';

        if (line.debit > 0) {
          if (isDebitNature) {
            newBalance = safeFinancialAdd(newBalance, line.debit);
          } else if (isCreditNature) {
            newBalance = safeFinancialSubtract(newBalance, line.debit);
          }
        }

        if (line.credit > 0) {
          if (isDebitNature) {
            newBalance = safeFinancialSubtract(newBalance, line.credit);
          } else if (isCreditNature) {
            newBalance = safeFinancialAdd(newBalance, line.credit);
          }
        }

        await tx.chartOfAccount.update({
          where: { id: line.accountId },
          data: { currentBalance: safeFinancialRound(newBalance) },
        });
      }
    }
  }
}

// GET /api/journal-vouchers - List all journal vouchers with optional filters
// Supports: ?type=JOURNAL&status=Draft&from=2024-01-01&to=2024-12-31
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'JournalVouchers', 'GET');
  if (!security.authorized) return security.response;

  const role = security.user.role;
  const companyId = security.user.companyId;

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const status = searchParams.get('status');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    // Multi-tenant isolation — filter by companyId
    const where: Record<string, unknown> = { isActive: true };
    if (companyId) {
      where.companyId = companyId;
    }

    if (type) {
      where.type = type;
    }
    if (status) {
      where.status = status;
    }
    if (from || to) {
      const dateFilter: Record<string, Date> = {};
      if (from) dateFilter.gte = new Date(from);
      if (to) dateFilter.lte = new Date(to);
      where.date = dateFilter;
    }

    const vouchers = await db.journalVoucher.findMany({
      where,
      include: {
        lines: true,
        bank: true,
      },
      orderBy: { date: 'desc' },
    });

    // VAT Auditor masking on monetary fields
    const responseData =
      role === 'vat_auditor'
        ? maskAccountingArray(
            vouchers as Record<string, unknown>[],
            role,
            ['totalDebit', 'totalCredit']
          )
        : vouchers;

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Error fetching journal vouchers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch journal vouchers' },
      { status: 500 }
    );
  }
}

// POST /api/journal-vouchers - Create a journal voucher with balanced validation
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'JournalVouchers', 'POST');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const body = await request.json();
    const {
      date,
      type,
      narration,
      lines,
      status,
      bankId,
      chequeNo,
      chequeDate,
      referenceNo,
    } = body;

    // ── Validation: date is required ──
    if (!date) {
      return NextResponse.json(
        { error: 'Voucher date is required.' },
        { status: 400 }
      );
    }

    // ── Validation: lines array must exist with at least 2 entries ──
    if (!lines || !Array.isArray(lines) || lines.length < 2) {
      return NextResponse.json(
        { error: 'At least 2 voucher lines are required for a balanced entry.' },
        { status: 400 }
      );
    }

    // ── Validation: each line must have accountId, accountName, and exactly one of debit > 0 or credit > 0 ──
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const debit = Number(line.debit) || 0;
      const credit = Number(line.credit) || 0;

      if (!line.accountId) {
        return NextResponse.json(
          { error: `Line ${i + 1}: accountId is required.` },
          { status: 400 }
        );
      }
      if (!line.accountName) {
        return NextResponse.json(
          { error: `Line ${i + 1}: accountName is required.` },
          { status: 400 }
        );
      }

      // Reject negative amounts
      if (debit < 0) {
        return NextResponse.json(
          { error: `Line ${i + 1}: debit must be non-negative.` },
          { status: 400 }
        );
      }
      if (credit < 0) {
        return NextResponse.json(
          { error: `Line ${i + 1}: credit must be non-negative.` },
          { status: 400 }
        );
      }

      // Exactly one of debit > 0 or credit > 0 (not both, not neither)
      if (debit > 0 && credit > 0) {
        return NextResponse.json(
          { error: `Line ${i + 1}: a line cannot have both debit and credit > 0. Each line must have exactly one non-zero amount.` },
          { status: 400 }
        );
      }
      if (debit === 0 && credit === 0) {
        return NextResponse.json(
          { error: `Line ${i + 1}: either debit or credit must be greater than 0.` },
          { status: 400 }
        );
      }
    }

    // ── Validation: Deactivated Account Interlock ──
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const coaAccount = await db.chartOfAccount.findUnique({
        where: { id: line.accountId },
        select: { id: true, name: true, isActive: true, code: true },
      });

      if (!coaAccount) {
        return NextResponse.json(
          { error: `Line ${i + 1}: Account "${line.accountName}" (ID: ${line.accountId}) does not exist in the Chart of Accounts.` },
          { status: 400 }
        );
      }
      if (!coaAccount.isActive) {
        return NextResponse.json(
          { error: `Deactivated Account Interlock: Account "${coaAccount.name}" (${coaAccount.code}) is deactivated. Reactivate the account before using it in a voucher.` },
          { status: 400 }
        );
      }
    }

    // ── Validation: Balanced entry — Total Debits === Total Credits (within 0.01 tolerance) ──
    let totalDebit = 0;
    let totalCredit = 0;
    for (const line of lines) {
      totalDebit = safeFinancialAdd(totalDebit, Number(line.debit) || 0);
      totalCredit = safeFinancialAdd(totalCredit, Number(line.credit) || 0);
    }
    totalDebit = safeFinancialRound(totalDebit);
    totalCredit = safeFinancialRound(totalCredit);

    const imbalance = Math.abs(safeFinancialSubtract(totalDebit, totalCredit));
    if (imbalance > 0.01) {
      return NextResponse.json(
        { error: 'Ledger Imbalance Detected: Debits and Credits must match perfectly.', totalDebit, totalCredit, difference: safeFinancialRound(imbalance) },
        { status: 422 }
      );
    }

    // ── Validation: Period lock check ──
    const periodLockError = await checkPeriodClose(new Date(date));
    if (periodLockError) return periodLockError;

    // ── Validation: Bank ID required for bank voucher types ──
    const voucherType = type || 'JOURNAL';
    if (['BANK_RECEIPT', 'BANK_PAYMENT'].includes(voucherType) && !bankId) {
      return NextResponse.json(
        { error: 'Bank ID is required for bank receipt and bank payment vouchers.' },
        { status: 400 }
      );
    }

    // Resolve voucher prefix
    const prefix = VOUCHER_TYPE_PREFIX[voucherType] || 'JV-';
    const voucherStatus = status || 'Draft';

    // ── Transaction: Create voucher header + lines + optional ledger posting ──
    const result = await db.$transaction(async (tx) => {
      // Generate voucherNo (transaction-aware for uniqueness)
      const voucherNo = await generateNextCodeInTx(tx, 'journalVoucher', prefix);

      // Create the JournalVoucher header
      const voucher = await tx.journalVoucher.create({
        data: {
          voucherNo,
          date: new Date(date),
          type: voucherType,
          narration: narration || null,
          totalDebit,
          totalCredit,
          status: voucherStatus,
          postedAt: voucherStatus === 'Posted' ? new Date() : null,
          postedBy: voucherStatus === 'Posted' ? security.user.id : null,
          bankId: bankId || null,
          chequeNo: chequeNo || null,
          chequeDate: chequeDate ? new Date(chequeDate) : null,
          referenceNo: referenceNo || null,
          companyId: companyId || null,
          isActive: true,
        },
      });

      // Create all VoucherLine records
      const createdLines = [];
      for (const line of lines) {
        const voucherLine = await tx.voucherLine.create({
          data: {
            voucherId: voucher.id,
            accountId: line.accountId || null,
            accountName: line.accountName,
            debit: safeFinancialRound(Number(line.debit) || 0),
            credit: safeFinancialRound(Number(line.credit) || 0),
            particulars: line.particulars || null,
            companyId: companyId || null,
          },
        });
        createdLines.push(voucherLine);
      }

      // If status === "Posted": Create LedgerEntry records and update COA currentBalance
      if (voucherStatus === 'Posted') {
        await postVoucherToLedger(
          tx,
          {
            id: voucher.id,
            voucherNo: voucher.voucherNo,
            date: voucher.date,
            narration: voucher.narration,
            companyId: voucher.companyId,
          },
          createdLines.map((l) => ({
            accountId: l.accountId,
            accountName: l.accountName,
            debit: l.debit,
            credit: l.credit,
            particulars: l.particulars,
          }))
        );
      }

      // Return the voucher with lines and bank relation
      const fullVoucher = await tx.journalVoucher.findUnique({
        where: { id: voucher.id },
        include: { lines: true, bank: true },
      });

      return fullVoucher;
    });

    // Activity logging
    await logUserActivity({
      action: 'CREATE',
      module: 'Fin-Accounts-Core',
      recordId: result!.id,
      recordLabel: result!.voucherNo,
      userId: security.user.id,
      userName: security.user.name,
      details: JSON.stringify({
        voucherNo: result!.voucherNo,
        type: voucherType,
        status: voucherStatus,
        totalDebit,
        totalCredit,
        lineCount: lines.length,
      }),
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating journal voucher:', error);
    return NextResponse.json(
      { error: 'Failed to create journal voucher' },
      { status: 500 }
    );
  }
}
