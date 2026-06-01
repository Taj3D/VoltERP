// ============================================================
// JOURNAL VOUCHERS [id] — Phase 13
// Single voucher GET, PUT (Draft only), DELETE (Draft only).
// Posted vouchers are immutable — cannot update or delete.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  safeFinancialRound,
  safeFinancialAdd,
  safeFinancialSubtract,
  maskAccountingArray,
  maskForVatAuditorAccounting,
  checkPeriodClose,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

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

// GET /api/journal-vouchers/[id] - Get single voucher with lines and bank relation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'JournalVouchers', 'GET');
  if (!security.authorized) return security.response;

  const role = security.user.role;
  const companyId = security.user.companyId;

  try {
    const { id } = await params;

    const voucher = await db.journalVoucher.findUnique({
      where: { id },
      include: { lines: true, bank: true },
    });

    if (!voucher) {
      return NextResponse.json(
        { error: 'Journal voucher not found' },
        { status: 404 }
      );
    }

    // Cross-tenant validation: if user has a companyId, the record must match
    if (companyId && voucher.companyId && voucher.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Journal voucher not found' },
        { status: 404 }
      );
    }

    // VAT Auditor masking
    const responseData =
      role === 'vat_auditor'
        ? maskForVatAuditorAccounting(
            voucher as Record<string, unknown>,
            role
          )
        : voucher;

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Error fetching journal voucher:', error);
    return NextResponse.json(
      { error: 'Failed to fetch journal voucher' },
      { status: 500 }
    );
  }
}

// PUT /api/journal-vouchers/[id] - Update voucher (only Draft status can be updated)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'JournalVouchers', 'PUT');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;

    // Fetch existing voucher
    const existing = await db.journalVoucher.findUnique({
      where: { id },
      include: { lines: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Journal voucher not found' },
        { status: 404 }
      );
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Journal voucher not found' },
        { status: 404 }
      );
    }

    // Posted vouchers are immutable
    if (existing.status === 'Posted') {
      return NextResponse.json(
        { error: 'Cannot update a posted voucher. Posted vouchers are immutable for ledger integrity.' },
        { status: 403 }
      );
    }

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

    // If lines are provided, validate them
    if (lines && Array.isArray(lines)) {
      // Must have at least 2 lines
      if (lines.length < 2) {
        return NextResponse.json(
          { error: 'At least 2 voucher lines are required for a balanced entry.' },
          { status: 400 }
        );
      }

      // Validate each line
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

      // Deactivated Account Interlock
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

      // Balanced entry validation
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
    }

    // Period lock check if date is being changed
    const voucherDate = date ? new Date(date) : existing.date;
    const periodLockError = await checkPeriodClose(voucherDate);
    if (periodLockError) return periodLockError;

    // Determine if the voucher is being posted
    const newStatus = status || existing.status;
    const isPosting = existing.status === 'Draft' && newStatus === 'Posted';

    // Bank ID validation for bank voucher types
    const voucherType = type || existing.type;
    if (['BANK_RECEIPT', 'BANK_PAYMENT'].includes(voucherType) && !bankId && !existing.bankId) {
      return NextResponse.json(
        { error: 'Bank ID is required for bank receipt and bank payment vouchers.' },
        { status: 400 }
      );
    }

    // ── Transaction: Update voucher + lines + optional ledger posting ──
    const result = await db.$transaction(async (tx) => {
      // Calculate totals from new lines or keep existing
      let totalDebit = existing.totalDebit;
      let totalCredit = existing.totalCredit;

      if (lines && Array.isArray(lines)) {
        totalDebit = 0;
        totalCredit = 0;
        for (const line of lines) {
          totalDebit = safeFinancialAdd(totalDebit, Number(line.debit) || 0);
          totalCredit = safeFinancialAdd(totalCredit, Number(line.credit) || 0);
        }
        totalDebit = safeFinancialRound(totalDebit);
        totalCredit = safeFinancialRound(totalCredit);

        // Delete existing lines and recreate
        await tx.voucherLine.deleteMany({ where: { voucherId: id } });

        // Create new lines
        for (const line of lines) {
          await tx.voucherLine.create({
            data: {
              voucherId: id,
              accountId: line.accountId || null,
              accountName: line.accountName,
              debit: safeFinancialRound(Number(line.debit) || 0),
              credit: safeFinancialRound(Number(line.credit) || 0),
              particulars: line.particulars || null,
              companyId: companyId || null,
            },
          });
        }
      }

      // Update the voucher header
      const updatedVoucher = await tx.journalVoucher.update({
        where: { id },
        data: {
          ...(date && { date: new Date(date) }),
          ...(type && { type: voucherType }),
          ...(narration !== undefined && { narration: narration || null }),
          totalDebit,
          totalCredit,
          status: newStatus,
          ...(isPosting && { postedAt: new Date(), postedBy: security.user.id }),
          ...(bankId !== undefined && { bankId: bankId || null }),
          ...(chequeNo !== undefined && { chequeNo: chequeNo || null }),
          ...(chequeDate !== undefined && { chequeDate: chequeDate ? new Date(chequeDate) : null }),
          ...(referenceNo !== undefined && { referenceNo: referenceNo || null }),
        },
      });

      // If posting: Create LedgerEntry records and update COA currentBalance
      if (isPosting) {
        // Fetch current lines (after update)
        const currentLines = await tx.voucherLine.findMany({
          where: { voucherId: id },
        });

        await postVoucherToLedger(
          tx,
          {
            id: updatedVoucher.id,
            voucherNo: updatedVoucher.voucherNo,
            date: updatedVoucher.date,
            narration: updatedVoucher.narration,
            companyId: updatedVoucher.companyId,
          },
          currentLines.map((l) => ({
            accountId: l.accountId,
            accountName: l.accountName,
            debit: l.debit,
            credit: l.credit,
            particulars: l.particulars,
          }))
        );
      }

      // Return the full updated voucher with lines and bank
      const fullVoucher = await tx.journalVoucher.findUnique({
        where: { id },
        include: { lines: true, bank: true },
      });

      return fullVoucher;
    });

    // Activity logging
    await logUserActivity({
      action: 'UPDATE',
      module: 'Fin-Accounts-Core',
      recordId: id,
      recordLabel: existing.voucherNo,
      userId: security.user.id,
      userName: security.user.name,
      details: JSON.stringify({
        voucherNo: existing.voucherNo,
        type: voucherType,
        previousStatus: existing.status,
        newStatus,
        posted: isPosting,
      }),
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating journal voucher:', error);
    return NextResponse.json(
      { error: 'Failed to update journal voucher' },
      { status: 500 }
    );
  }
}

// DELETE /api/journal-vouchers/[id] - Only Draft vouchers can be deleted
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'JournalVouchers', 'DELETE');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const { id } = await params;

    // Fetch existing voucher
    const existing = await db.journalVoucher.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Journal voucher not found' },
        { status: 404 }
      );
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Journal voucher not found' },
        { status: 404 }
      );
    }

    // Posted vouchers cannot be deleted
    if (existing.status === 'Posted') {
      return NextResponse.json(
        { error: 'Cannot delete a posted voucher. Posted vouchers are immutable for ledger integrity. Reverse the voucher instead.' },
        { status: 403 }
      );
    }

    // Soft delete the voucher (lines are cascade-deleted by schema, but we soft-delete the header)
    await db.$transaction(async (tx) => {
      // Soft delete the voucher header
      await tx.journalVoucher.update({
        where: { id },
        data: { isActive: false },
      });

      // Soft delete the voucher lines (the schema has onDelete: Cascade,
      // but we prefer explicit soft-delete for audit trail)
      // Note: Since VoucherLine doesn't have isActive, they are cascade-deleted
      // when the voucher is hard-deleted. For soft-delete, we keep them.
    });

    // Activity logging
    await logUserActivity({
      action: 'DELETE',
      module: 'Fin-Accounts-Core',
      recordId: id,
      recordLabel: existing.voucherNo,
      userId: security.user.id,
      userName: security.user.name,
      details: JSON.stringify({
        voucherNo: existing.voucherNo,
        type: existing.type,
        status: existing.status,
        softDelete: true,
      }),
    });

    return NextResponse.json({ success: true, message: 'Journal voucher deleted successfully.' });
  } catch (error) {
    console.error('Error deleting journal voucher:', error);
    return NextResponse.json(
      { error: 'Failed to delete journal voucher' },
      { status: 500 }
    );
  }
}
