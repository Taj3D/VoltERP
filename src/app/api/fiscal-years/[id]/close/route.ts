// ============================================================
// FISCAL YEAR — YEAR-END CLOSE — Phase 14
// Critical Year-End Close automation endpoint.
// POST only. Admin-only. Generates closing journal voucher that
// zeroes nominal accounts (Revenue/Income, Expense) and transfers
// net variance into Equity → Retained Earnings.
//
// Algorithm:
// 1. Authenticate with withApiSecurity (admin-only)
// 2. Load FiscalYear by ID with cross-tenant validation
// 3. Verify status === "OPEN"
// 4. Inside a rigid $transaction:
//    a. Identify all nominal accounts (Income/Revenue/Expense)
//    b. Calculate cumulative balances from LedgerEntry
//    c. Find or create Retained Earnings COA node
//    d. Generate closing journal voucher (YC- prefix, Posted)
//    e. Create LedgerEntry records for each line
//    f. Update ChartOfAccount.currentBalance for affected accounts
//    g. Update FiscalYear record to CLOSED
// 5. Log activity with module 'Fin-Statements-Core'
// 6. Return updated FiscalYear with closing voucher details
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  safeFinancialRound,
  safeFinancialAdd,
  safeFinancialSubtract,
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
        referenceType: 'YearEndClose',
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
        const isDebitNature = classification === 'Asset' || classification === 'Expense' || classification === 'Expenses';
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

// POST /api/fiscal-years/[id]/close - Year-End Close automation (admin-only)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Step 1: Authenticate — only admin can close fiscal years
  const security = await withApiSecurity(request, 'PeriodClose', 'POST');
  if (!security.authorized) return security.response;

  if (security.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Access denied. Only Administrators can close fiscal years.' },
      { status: 403 }
    );
  }

  const companyId = security.user.companyId;

  try {
    // Step 2: Load FiscalYear record with cross-tenant validation
    const fiscalYear = await db.fiscalYear.findUnique({
      where: { id },
      include: { closingVoucher: true, retainedEarningsAccount: true },
    });

    if (!fiscalYear || !fiscalYear.isActive) {
      return NextResponse.json(
        { error: 'Fiscal year not found.' },
        { status: 404 }
      );
    }

    // Cross-tenant validation
    if (companyId && fiscalYear.companyId && fiscalYear.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Fiscal year not found.' },
        { status: 404 }
      );
    }

    // Step 3: Verify status === "OPEN"
    if (fiscalYear.status === 'CLOSED') {
      return NextResponse.json(
        {
          error: `Fiscal year "${fiscalYear.name}" is already CLOSED. Cannot close an already closed fiscal year.`,
          fiscalYearId: fiscalYear.id,
          closedAt: fiscalYear.closedAt,
          closedBy: fiscalYear.closedBy,
        },
        { status: 400 }
      );
    }

    if (fiscalYear.status !== 'OPEN') {
      return NextResponse.json(
        { error: `Fiscal year status is "${fiscalYear.status}". Only OPEN fiscal years can be closed.` },
        { status: 400 }
      );
    }

    // Step 4: Year-End Close inside a rigid $transaction
    const result = await db.$transaction(async (tx) => {
      // ── 4a: Identify all nominal accounts (Revenue/Income and Expenses classifications) ──
      const nominalAccounts = await tx.chartOfAccount.findMany({
        where: {
          classification: { in: ['Income', 'Revenue', 'Expense', 'Expenses'] },
          isActive: true,
          ...(companyId ? { companyId } : {}),
        },
        select: {
          id: true,
          code: true,
          name: true,
          classification: true,
          currentBalance: true,
          parentAccountId: true,
        },
      });

      // ── 4b: Calculate cumulative balances for each nominal account from LedgerEntry ──
      const nominalBalanceMap: Array<{
        id: string;
        code: string;
        name: string;
        classification: string;
        totalDebit: number;
        totalCredit: number;
        netBalance: number;
        balanceType: 'debit' | 'credit' | 'zero';
      }> = [];

      for (const account of nominalAccounts) {
        // Sum all debit and credit entries within the fiscal year date range
        const aggregates = await tx.ledgerEntry.aggregate({
          _sum: {
            debit: true,
            credit: true,
          },
          where: {
            accountId: account.id,
            date: {
              gte: fiscalYear.startDate,
              lte: fiscalYear.endDate,
            },
            isActive: true,
            ...(companyId ? { companyId } : {}),
          },
        });

        const totalDebit = safeFinancialRound(aggregates._sum.debit || 0);
        const totalCredit = safeFinancialRound(aggregates._sum.credit || 0);

        // Net balance calculation based on account nature:
        // Debit-nature accounts (Expenses): net = totalDebit - totalCredit
        // Credit-nature accounts (Revenue/Income): net = totalCredit - totalDebit
        const isDebitNature = account.classification === 'Expense' || account.classification === 'Expenses';
        let netBalance: number;

        if (isDebitNature) {
          netBalance = safeFinancialSubtract(totalDebit, totalCredit);
        } else {
          // Credit-nature: Income, Revenue
          netBalance = safeFinancialSubtract(totalCredit, totalDebit);
        }

        const balanceType = netBalance > 0.005
          ? (isDebitNature ? 'debit' : 'credit')
          : netBalance < -0.005
            ? (isDebitNature ? 'credit' : 'debit')
            : 'zero';

        // For the closing entry, we need the raw balance from the ledger perspective
        // Revenue/Income accounts normally have a CREDIT balance (totalCredit > totalDebit)
        // Expense accounts normally have a DEBIT balance (totalDebit > totalCredit)
        // We need to zero them out by:
        //   - If the account has a CREDIT balance: DEBIT it to zero
        //   - If the account has a DEBIT balance: CREDIT it to zero

        // Calculate the raw balance to determine closing entry direction
        // Raw credit balance = totalCredit - totalDebit (positive means credit balance)
        // Raw debit balance = totalDebit - totalCredit (positive means debit balance)
        const rawCreditBalance = safeFinancialSubtract(totalCredit, totalDebit);
        const rawDebitBalance = safeFinancialSubtract(totalDebit, totalCredit);

        // Absolute value to close
        const amountToClose = safeFinancialRound(
          Math.abs(rawCreditBalance) > 0.005 ? rawCreditBalance
            : Math.abs(rawDebitBalance) > 0.005 ? rawDebitBalance
              : 0
        );

        // Determine which side has the balance that needs to be zeroed
        // If totalCredit > totalDebit: account has a CREDIT balance → DEBIT to close
        // If totalDebit > totalCredit: account has a DEBIT balance → CREDIT to close
        let closingDebit = 0;
        let closingCredit = 0;

        if (rawCreditBalance > 0.005) {
          // Credit balance on nominal account → DEBIT to zero out
          closingDebit = safeFinancialRound(rawCreditBalance);
        } else if (rawDebitBalance > 0.005) {
          // Debit balance on nominal account → CREDIT to zero out
          closingCredit = safeFinancialRound(rawDebitBalance);
        }

        nominalBalanceMap.push({
          id: account.id,
          code: account.code,
          name: account.name,
          classification: account.classification,
          totalDebit,
          totalCredit,
          netBalance: amountToClose,
          balanceType: closingDebit > 0 ? 'credit' : closingCredit > 0 ? 'debit' : 'zero',
        });
      }

      // Filter only accounts with non-zero balances that need closing entries
      const accountsToClose = nominalBalanceMap.filter(
        (a) => a.balanceType !== 'zero'
      );

      // If no nominal accounts have balances, skip closing voucher creation
      // but still close the fiscal year
      if (accountsToClose.length === 0) {
        // Still close the fiscal year even if there are no nominal balances to zero
        const updatedFiscalYear = await tx.fiscalYear.update({
          where: { id: fiscalYear.id },
          data: {
            status: 'CLOSED',
            closedAt: new Date(),
            closedBy: security.user.id,
            netProfitClosed: 0,
          },
          include: {
            closingVoucher: true,
            retainedEarningsAccount: true,
          },
        });

        return { fiscalYear: updatedFiscalYear, closingVoucher: null };
      }

      // ── 4c: Find or create the Retained Earnings COA node ──
      let retainedEarningsAccount = await tx.chartOfAccount.findFirst({
        where: {
          name: 'Retained Earnings',
          classification: 'Equity',
          isActive: true,
          ...(companyId ? { companyId } : {}),
        },
        select: { id: true, code: true, name: true, classification: true, currentBalance: true, parentAccountId: true },
      });

      if (!retainedEarningsAccount) {
        // Find the root Equity node to use as parent
        const equityRoot = await tx.chartOfAccount.findFirst({
          where: {
            classification: 'Equity',
            isRoot: true,
            isActive: true,
            ...(companyId ? { companyId } : {}),
          },
          select: { id: true, code: true, name: true },
        });

        // Generate code for the new Retained Earnings account
        const reCode = await generateNextCodeInTx(tx, 'chartOfAccount', 'COA-');

        retainedEarningsAccount = await tx.chartOfAccount.create({
          data: {
            code: reCode,
            name: 'Retained Earnings',
            classification: 'Equity',
            openingBalance: 0,
            openingBalanceType: 'Cr',
            currentBalance: 0,
            isRoot: false,
            parentAccountId: equityRoot?.id || null,
            isActive: true,
            companyId: companyId || null,
          },
          select: { id: true, code: true, name: true, classification: true, currentBalance: true, parentAccountId: true },
        });
      }

      // ── 4d: Generate closing journal voucher ──
      const voucherNo = await generateNextCodeInTx(tx, 'journalVoucher', 'YC-');

      // Build voucher lines
      // For each nominal account with a non-zero balance:
      //   - If CREDIT balance (Revenue/Income): DEBIT line to zero out
      //   - If DEBIT balance (Expenses): CREDIT line to zero out
      // Then one offsetting line to Retained Earnings

      let totalDebitAmount = 0;
      let totalCreditAmount = 0;
      const voucherLines: Array<{
        accountId: string | null;
        accountName: string;
        debit: number;
        credit: number;
        particulars: string | null;
      }> = [];

      for (const account of accountsToClose) {
        const accountRecord = nominalAccounts.find((a) => a.id === account.id);
        if (!accountRecord) continue;

        // Calculate closing amounts from the raw ledger perspective
        const rawCreditBalance = safeFinancialSubtract(account.totalCredit, account.totalDebit);
        const rawDebitBalance = safeFinancialSubtract(account.totalDebit, account.totalCredit);

        let lineDebit = 0;
        let lineCredit = 0;

        if (rawCreditBalance > 0.005) {
          // Account has a CREDIT balance → DEBIT it to zero out
          lineDebit = safeFinancialRound(rawCreditBalance);
        } else if (rawDebitBalance > 0.005) {
          // Account has a DEBIT balance → CREDIT it to zero out
          lineCredit = safeFinancialRound(rawDebitBalance);
        }

        if (lineDebit > 0 || lineCredit > 0) {
          voucherLines.push({
            accountId: account.id,
            accountName: account.name,
            debit: lineDebit,
            credit: lineCredit,
            particulars: `Year-End Close: Zeroing ${account.name} (${account.code})`,
          });

          totalDebitAmount = safeFinancialAdd(totalDebitAmount, lineDebit);
          totalCreditAmount = safeFinancialAdd(totalCreditAmount, lineCredit);
        }
      }

      // Calculate net profit/loss:
      // Net profit = Revenue (credit balances closed via debit) > Expenses (debit balances closed via credit)
      // Total debits from closing revenue accounts = sum of revenue credit balances
      // Total credits from closing expense accounts = sum of expense debit balances
      // Net profit = totalDebitAmount (revenue zeroed) - totalCreditAmount (expenses zeroed)
      // But we need the Retained Earnings offsetting line to balance the voucher:
      //
      // If net profit (Revenue > Expenses): totalDebitAmount > totalCreditAmount from zeroing lines
      //   → We need a CREDIT to Retained Earnings for the difference
      // If net loss (Expenses > Revenue): totalCreditAmount > totalDebitAmount from zeroing lines
      //   → We need a DEBIT to Retained Earnings for the difference

      const retainedEarningsOffset = safeFinancialSubtract(totalDebitAmount, totalCreditAmount);
      const netProfitClosed = safeFinancialRound(retainedEarningsOffset);

      if (retainedEarningsOffset > 0.005) {
        // Net profit: Credit Retained Earnings
        voucherLines.push({
          accountId: retainedEarningsAccount.id,
          accountName: retainedEarningsAccount.name,
          debit: 0,
          credit: safeFinancialRound(retainedEarningsOffset),
          particulars: `Year-End Close: Net profit transfer to Retained Earnings for ${fiscalYear.name}`,
        });
        totalCreditAmount = safeFinancialAdd(totalCreditAmount, safeFinancialRound(retainedEarningsOffset));
      } else if (retainedEarningsOffset < -0.005) {
        // Net loss: Debit Retained Earnings
        const lossAmount = safeFinancialRound(Math.abs(retainedEarningsOffset));
        voucherLines.push({
          accountId: retainedEarningsAccount.id,
          accountName: retainedEarningsAccount.name,
          debit: lossAmount,
          credit: 0,
          particulars: `Year-End Close: Net loss transfer to Retained Earnings for ${fiscalYear.name}`,
        });
        totalDebitAmount = safeFinancialAdd(totalDebitAmount, lossAmount);
      }

      // Final balance check (debits must equal credits)
      totalDebitAmount = safeFinancialRound(totalDebitAmount);
      totalCreditAmount = safeFinancialRound(totalCreditAmount);
      const finalImbalance = Math.abs(safeFinancialSubtract(totalDebitAmount, totalCreditAmount));
      if (finalImbalance > 0.01) {
        throw new Error(
          `Closing voucher imbalance: Debits (${totalDebitAmount}) ≠ Credits (${totalCreditAmount}). Difference: ${safeFinancialRound(finalImbalance)}`
        );
      }

      // Create the JournalVoucher header
      const closingVoucher = await tx.journalVoucher.create({
        data: {
          voucherNo,
          date: fiscalYear.endDate,
          type: 'JOURNAL',
          narration: `Year-End Closing Entry for ${fiscalYear.name} - Nominal Account Wipeout`,
          totalDebit: totalDebitAmount,
          totalCredit: totalCreditAmount,
          status: 'Posted',
          postedAt: new Date(),
          postedBy: security.user.id,
          bankId: null,
          chequeNo: null,
          chequeDate: null,
          referenceNo: null,
          companyId: companyId || fiscalYear.companyId || null,
          isActive: true,
        },
        include: { lines: true, bank: true },
      });

      // Create all VoucherLine records
      for (const line of voucherLines) {
        await tx.voucherLine.create({
          data: {
            voucherId: closingVoucher.id,
            accountId: line.accountId || null,
            accountName: line.accountName,
            debit: safeFinancialRound(line.debit),
            credit: safeFinancialRound(line.credit),
            particulars: line.particulars || null,
            companyId: companyId || fiscalYear.companyId || null,
          },
        });
      }

      // ── 4e: Create LedgerEntry records for each line of the closing voucher ──
      await postVoucherToLedger(
        tx,
        {
          id: closingVoucher.id,
          voucherNo: closingVoucher.voucherNo,
          date: closingVoucher.date,
          narration: closingVoucher.narration,
          companyId: closingVoucher.companyId,
        },
        voucherLines
      );

      // ── 4f: Update ChartOfAccount.currentBalance for each affected nominal account (zeroed out) ──
      // The postVoucherToLedger function already handles currentBalance updates
      // But we need to ensure nominal accounts are explicitly zeroed out
      for (const account of accountsToClose) {
        await tx.chartOfAccount.update({
          where: { id: account.id },
          data: { currentBalance: 0 },
        });
      }

      // ── 4g: Update the FiscalYear record ──
      const updatedFiscalYear = await tx.fiscalYear.update({
        where: { id: fiscalYear.id },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          closedBy: security.user.id,
          closingVoucherId: closingVoucher.id,
          netProfitClosed: safeFinancialRound(netProfitClosed),
          retainedEarningsAccountId: retainedEarningsAccount.id,
        },
        include: {
          closingVoucher: {
            include: { lines: true, bank: true },
          },
          retainedEarningsAccount: true,
        },
      });

      return { fiscalYear: updatedFiscalYear, closingVoucher };
    });

    // Step 5: Log activity with module 'Fin-Statements-Core'
    await logUserActivity({
      action: 'UPDATE',
      module: 'Fin-Statements-Core',
      recordId: result.fiscalYear.id,
      recordLabel: result.fiscalYear.name,
      userId: security.user.id,
      userName: security.user.name,
      details: JSON.stringify({
        action: 'year_end_close',
        fiscalYearId: result.fiscalYear.id,
        fiscalYearName: result.fiscalYear.name,
        fiscalYearCode: result.fiscalYear.code,
        status: result.fiscalYear.status,
        closedAt: result.fiscalYear.closedAt,
        netProfitClosed: result.fiscalYear.netProfitClosed,
        closingVoucherId: result.fiscalYear.closingVoucherId,
        retainedEarningsAccountId: result.fiscalYear.retainedEarningsAccountId,
        ...(result.closingVoucher
          ? {
              closingVoucherNo: result.closingVoucher.voucherNo,
              closingVoucherTotalDebit: result.closingVoucher.totalDebit,
              closingVoucherTotalCredit: result.closingVoucher.totalCredit,
            }
          : {}),
      }),
    });

    // Step 6: Return the updated FiscalYear with the closing voucher details
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('[FISCAL-YEAR-CLOSE] Error closing fiscal year:', error);

    if (error instanceof Error && error.message.includes('Closing voucher imbalance')) {
      return NextResponse.json(
        { error: error.message },
        { status: 422 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to close fiscal year',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
