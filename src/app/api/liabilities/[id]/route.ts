// ============================================================
// LIABILITY MODULE SINGLE-ITEM API ROUTES - Phase 4 Rewrite
// GET: Single liability with cross-tenant validation + VAT masking
// PUT: Update with ledger reversal, bank balance adjustment, zero-balance protection
// DELETE: Soft delete with admin-only permission + bank balance reversal
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
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function nullIfEmpty(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  return str === '' ? null : str;
}

/**
 * Auto-generate an entry code for LedgerEntry in pattern LED-XXXXX
 */
async function generateLedgerEntryCode(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]
): Promise<string> {
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

/**
 * Find or create a ChartOfAccount under "Liability" classification for a given head name.
 */
async function findOrCreateLiabilityAccount(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  headName: string,
  companyId: string | null
): Promise<{ id: string; code: string }> {
  const existing = await tx.chartOfAccount.findFirst({
    where: {
      name: headName,
      classification: 'Liability',
      isActive: true,
      ...(companyId ? { companyId } : {}),
    },
  });

  if (existing) {
    return { id: existing.id, code: existing.code };
  }

  const parentLiability = await tx.chartOfAccount.findFirst({
    where: {
      classification: 'Liability',
      name: 'Liability',
      isActive: true,
      ...(companyId ? { companyId } : {}),
    },
  });

  const coaCount = await tx.chartOfAccount.count();
  const coaCode = `COA-${String(coaCount + 1).padStart(5, '0')}`;

  const newAccount = await tx.chartOfAccount.create({
    data: {
      code: coaCode,
      name: headName,
      classification: 'Liability',
      parentAccountId: parentLiability?.id || null,
      openingBalance: 0,
      openingBalanceType: 'Cr',
      companyId: companyId || null,
    },
  });

  return { id: newAccount.id, code: newAccount.code };
}

// ────────────────────────────────────────────────────────────
// GET /api/liabilities/[id] - Single liability with cross-tenant + VAT masking
// ────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Liabilities', 'GET');
  if (!security.authorized) return security.response;

  const { role, companyId } = security.user;

  try {
    const { id } = await params;
    const item = await db.liability.findUnique({
      where: { id },
      include: { investmentHead: true },
    });

    if (!item) {
      return NextResponse.json(
        { error: 'Liability not found' },
        { status: 404 }
      );
    }

    // Cross-tenant validation
    if (companyId && item.companyId && item.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Liability not found' },
        { status: 404 }
      );
    }

    // Apply VAT Auditor financial masking
    const masked = maskForVatAuditorFinancial(
      item as Record<string, unknown>,
      role
    );

    return NextResponse.json(masked);
  } catch (error) {
    console.error('[Liabilities GET /id] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch liability' },
      { status: 500 }
    );
  }
}

// ────────────────────────────────────────────────────────────
// PUT /api/liabilities/[id] - Update with ledger reversal + bank adjustment
// ────────────────────────────────────────────────────────────

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Liabilities', 'PUT');
  if (!security.authorized) return security.response;

  const { id: userId, name: userName, role, companyId } = security.user;

  try {
    const { id } = await params;
    const body = await request.json();

    // Fetch existing record for cross-tenant validation and reversal
    const existing = await db.liability.findUnique({
      where: { id },
      include: { investmentHead: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Liability not found' },
        { status: 404 }
      );
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Liability not found' },
        { status: 404 }
      );
    }

    // Period-close lock check
    const checkDate = body.date ? new Date(body.date) : (existing.date || new Date());
    const periodLock = await checkPeriodClose(checkDate);
    if (periodLock) return periodLock;

    // ──────────────────────────────────────────────────────────
    // Deactivated Head Shield: if investmentHeadId changes, verify new head is active
    // ──────────────────────────────────────────────────────────
    const newHeadId = body.investmentHeadId !== undefined
      ? String(body.investmentHeadId)
      : existing.investmentHeadId;

    if (body.investmentHeadId && body.investmentHeadId !== existing.investmentHeadId) {
      const newHead = await db.investmentHead.findUnique({
        where: { id: newHeadId },
      });
      if (!newHead || newHead.isActive === false) {
        return NextResponse.json(
          { error: 'Cannot create liability against a deactivated/archived Liability Head' },
          { status: 400 }
        );
      }
    }

    // Compute old and new values
    const oldAmount = existing.amount;
    const oldBankId = existing.bankId;
    const oldType = existing.type;
    const oldHead = existing.investmentHead;

    const newAmount = body.amount !== undefined
      ? safeFinancialRound(parseFloat(String(body.amount)))
      : existing.amount;
    const newBankId = body.bankId !== undefined
      ? nullIfEmpty(body.bankId)
      : existing.bankId;
    const newType = body.type || existing.type;
    const newLiabilityType = body.liabilityType || existing.liabilityType;
    const newPrincipalAmount = body.principalAmount !== undefined
      ? safeFinancialRound(parseFloat(String(body.principalAmount)))
      : existing.principalAmount;
    const newInterestRate = body.interestRate !== undefined
      ? parseFloat(String(body.interestRate))
      : existing.interestRate;
    const newLoanDurationMonths = body.loanDurationMonths !== undefined
      ? parseInt(String(body.loanDurationMonths), 10)
      : existing.loanDurationMonths;
    const transactionDate = body.date ? new Date(body.date) : existing.date;

    // ──────────────────────────────────────────────────────────
    // For type="received" edits: recalculate outstandingBalance
    // ──────────────────────────────────────────────────────────
    let newOutstandingBalance = existing.outstandingBalance;
    if (newType === 'received') {
      newOutstandingBalance = safeFinancialRound(newPrincipalAmount);
    }

    // ──────────────────────────────────────────────────────────
    // For type="pay" edits: re-validate zero balance protection
    // ──────────────────────────────────────────────────────────
    if (newType === 'pay') {
      newOutstandingBalance = 0;

      // Include opening balance in outstanding computation
      const headForBalance = await db.investmentHead.findUnique({
        where: { id: newHeadId },
        select: { openingBalance: true, type: true },
      });
      const openingBal = (headForBalance?.type === 'Liability' ? (headForBalance?.openingBalance || 0) : 0);

      // Compute outstanding for this head (excluding current record)
      const receivedAgg = await db.liability.aggregate({
        _sum: { amount: true },
        where: {
          investmentHeadId: newHeadId,
          type: 'received',
          isActive: true,
          ...(companyId ? { companyId } : {}),
        },
      });
      const payAgg = await db.liability.aggregate({
        _sum: { amount: true },
        where: {
          investmentHeadId: newHeadId,
          type: 'pay',
          isActive: true,
          id: { not: id }, // Exclude current record
          ...(companyId ? { companyId } : {}),
        },
      });

      const totalReceived = receivedAgg._sum.amount || 0;
      const totalOtherPay = payAgg._sum.amount || 0;
      const projectedOutstanding = safeFinancialSubtract(
        safeFinancialSubtract(safeFinancialAdd(openingBal, totalReceived), totalOtherPay),
        newAmount
      );

      if (projectedOutstanding < 0) {
        return NextResponse.json(
          { error: 'Action Blocked: Repayment value exceeds total outstanding liability balance.' },
          { status: 400 }
        );
      }
    }

    // ──────────────────────────────────────────────────────────
    // Pre-validate: if bankId provided for pay, check bank balance
    // ──────────────────────────────────────────────────────────
    if (newType === 'pay' && newBankId) {
      const bankCheck = await db.bank.findUnique({
        where: { id: newBankId },
        select: { currentBalance: true },
      });
      if (bankCheck && bankCheck.currentBalance < newAmount) {
        return NextResponse.json(
          { error: 'Insufficient bank balance for liability repayment' },
          { status: 400 }
        );
      }
    }

    // Clean optional string fields
    const cleanPaymentMethod = body.paymentMethod !== undefined
      ? nullIfEmpty(body.paymentMethod)
      : existing.paymentMethod;
    const cleanVoucherNo = body.voucherNo !== undefined
      ? nullIfEmpty(body.voucherNo)
      : existing.voucherNo;
    const cleanChequeNo = body.chequeNo !== undefined
      ? nullIfEmpty(body.chequeNo)
      : existing.chequeNo;
    const cleanDescription = body.description !== undefined
      ? nullIfEmpty(body.description)
      : existing.description;

    // ──────────────────────────────────────────────────────────
    // Atomic transaction: reverse old, apply new
    // ──────────────────────────────────────────────────────────
    const result = await db.$transaction(async (tx) => {
      // ────────────────────────────────────────────────────────
      // STEP 1: Reverse old bank balance impact
      // ────────────────────────────────────────────────────────
      if (oldBankId) {
        const oldBankRecord = await tx.bank.findUnique({
          where: { id: oldBankId },
          select: { currentBalance: true },
        });
        if (oldBankRecord) {
          let reversedBalance: number;
          if (oldType === 'received') {
            // Received incremented bank, so reverse by subtracting
            reversedBalance = safeFinancialSubtract(oldBankRecord.currentBalance, oldAmount);
          } else {
            // Pay decremented bank, so reverse by adding
            reversedBalance = safeFinancialAdd(oldBankRecord.currentBalance, oldAmount);
          }
          await tx.bank.update({
            where: { id: oldBankId },
            data: { currentBalance: reversedBalance },
          });
        }
      }

      // ────────────────────────────────────────────────────────
      // STEP 2: Create reversal ledger entries (2 reversal entries)
      // ────────────────────────────────────────────────────────
      // Resolve old head name for reversal
      const oldHeadName = oldHead?.name || 'Unknown';
      const oldCashAccount = oldBankId
        ? 'Cash/Bank'
        : 'Cash in Hand';

      if (oldType === 'received') {
        // Original: Dr head.name, Cr Cash/Bank
        // Reversal: Cr head.name, Dr Cash/Bank
        await tx.ledgerEntry.create({
          data: {
            entryCode: await generateLedgerEntryCode(tx),
            date: transactionDate,
            account: oldHeadName,
            particulars: 'Reversal: Liability receive update',
            debit: 0,
            credit: oldAmount,
            reference: existing.voucherNo || id,
            referenceType: 'LiabilityReceive',
            companyId: companyId || null,
          },
        });
        await tx.ledgerEntry.create({
          data: {
            entryCode: await generateLedgerEntryCode(tx),
            date: transactionDate,
            account: oldCashAccount,
            particulars: 'Reversal: Liability receive update',
            debit: oldAmount,
            credit: 0,
            reference: existing.voucherNo || id,
            referenceType: 'LiabilityReceive',
            companyId: companyId || null,
          },
        });
      } else {
        // Original: Dr head.name, Cr Cash/Bank (pay)
        // Reversal: Cr head.name, Dr Cash/Bank
        await tx.ledgerEntry.create({
          data: {
            entryCode: await generateLedgerEntryCode(tx),
            date: transactionDate,
            account: oldHeadName,
            particulars: 'Reversal: Liability pay update',
            debit: 0,
            credit: oldAmount,
            reference: existing.voucherNo || id,
            referenceType: 'LiabilityPay',
            companyId: companyId || null,
          },
        });
        await tx.ledgerEntry.create({
          data: {
            entryCode: await generateLedgerEntryCode(tx),
            date: transactionDate,
            account: oldCashAccount,
            particulars: 'Reversal: Liability pay update',
            debit: oldAmount,
            credit: 0,
            reference: existing.voucherNo || id,
            referenceType: 'LiabilityPay',
            companyId: companyId || null,
          },
        });
      }

      // ────────────────────────────────────────────────────────
      // STEP 3: Apply new bank balance impact
      // ────────────────────────────────────────────────────────
      if (newBankId) {
        const newBankRecord = await tx.bank.findUnique({
          where: { id: newBankId },
          select: { currentBalance: true },
        });
        if (newBankRecord) {
          let updatedBalance: number;
          if (newType === 'received') {
            // Receive increments bank
            updatedBalance = safeFinancialAdd(newBankRecord.currentBalance, newAmount);
          } else {
            // Pay decrements bank
            updatedBalance = safeFinancialSubtract(newBankRecord.currentBalance, newAmount);
          }
          await tx.bank.update({
            where: { id: newBankId },
            data: { currentBalance: updatedBalance },
          });
        }
      }

      // ────────────────────────────────────────────────────────
      // STEP 4: Create new ledger entries (2 new entries)
      // ────────────────────────────────────────────────────────
      // Resolve new head for new entries
      let newHeadName = oldHeadName;
      if (body.investmentHeadId && body.investmentHeadId !== existing.investmentHeadId) {
        const headRecord = await tx.investmentHead.findUnique({
          where: { id: newHeadId },
          select: { name: true },
        });
        newHeadName = headRecord?.name || 'Unknown';
      }

      const newCashAccount = newBankId ? 'Cash/Bank' : 'Cash in Hand';

      // Find or create ChartOfAccount
      const liabilityAccount = await findOrCreateLiabilityAccount(tx, newHeadName, companyId);

      if (newType === 'received') {
        // Dr: head.name (Liabilities), Cr: Cash/Bank
        await tx.ledgerEntry.create({
          data: {
            entryCode: await generateLedgerEntryCode(tx),
            date: transactionDate,
            accountId: liabilityAccount.id,
            account: newHeadName,
            particulars: cleanDescription || `Liability received: ${newHeadName}`,
            debit: newAmount,
            credit: 0,
            reference: cleanVoucherNo || id,
            referenceType: 'LiabilityReceive',
            companyId: companyId || null,
          },
        });
        await tx.ledgerEntry.create({
          data: {
            entryCode: await generateLedgerEntryCode(tx),
            date: transactionDate,
            account: newCashAccount,
            particulars: cleanDescription || `Liability received: ${newHeadName}`,
            debit: 0,
            credit: newAmount,
            reference: cleanVoucherNo || id,
            referenceType: 'LiabilityReceive',
            companyId: companyId || null,
          },
        });
      } else {
        // Dr: head.name (Liabilities), Cr: Cash/Bank (pay)
        await tx.ledgerEntry.create({
          data: {
            entryCode: await generateLedgerEntryCode(tx),
            date: transactionDate,
            accountId: liabilityAccount.id,
            account: newHeadName,
            particulars: cleanDescription || `Liability payment: ${newHeadName}`,
            debit: newAmount,
            credit: 0,
            reference: cleanVoucherNo || id,
            referenceType: 'LiabilityPay',
            companyId: companyId || null,
          },
        });
        await tx.ledgerEntry.create({
          data: {
            entryCode: await generateLedgerEntryCode(tx),
            date: transactionDate,
            account: newCashAccount,
            particulars: cleanDescription || `Liability payment: ${newHeadName}`,
            debit: 0,
            credit: newAmount,
            reference: cleanVoucherNo || id,
            referenceType: 'LiabilityPay',
            companyId: companyId || null,
          },
        });
      }

      // ────────────────────────────────────────────────────────
      // STEP 5: Update the liability record
      // ────────────────────────────────────────────────────────
      const updated = await tx.liability.update({
        where: { id },
        data: {
          investmentHeadId: newHeadId,
          date: transactionDate,
          amount: newAmount,
          type: newType,
          liabilityType: newLiabilityType,
          principalAmount: newPrincipalAmount,
          interestRate: newInterestRate,
          loanDurationMonths: newLoanDurationMonths,
          outstandingBalance: newOutstandingBalance,
          paymentMethod: cleanPaymentMethod,
          bankId: newBankId,
          voucherNo: cleanVoucherNo,
          chequeNo: cleanChequeNo,
          description: cleanDescription,
        },
        include: { investmentHead: true },
      });

      // ────────────────────────────────────────────────────────
      // STEP 6: AuditLog
      // ────────────────────────────────────────────────────────
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'Fin-Liability-Core',
          recordId: updated.id,
          recordLabel: `${updated.investmentHead?.name || updated.id} - Tk. ${updated.amount}`,
          userId,
          userName,
          details: JSON.stringify({
            type: newType,
            previousAmount: oldAmount,
            newAmount,
            previousBankId: oldBankId,
            newBankId,
            previousType: oldType,
            newType,
            bankBalanceAdjusted: !!(oldBankId || newBankId),
            ledgerReversalCreated: true,
            ledgerNewEntriesCreated: true,
          }),
        },
      });

      return updated;
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('[Liabilities PUT /id] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to update liability';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ────────────────────────────────────────────────────────────
// DELETE /api/liabilities/[id] - Soft delete (admin-only) with bank reversal
// ────────────────────────────────────────────────────────────

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Liabilities', 'DELETE');
  if (!security.authorized) return security.response;

  const { id: userId, name: userName, role, companyId } = security.user;

  // Only admin can delete financial posts
  const deleteCheck = checkFinancialDeletePermission(role);
  if (deleteCheck) return deleteCheck;

  try {
    const { id } = await params;

    const existing = await db.liability.findUnique({
      where: { id },
      include: { investmentHead: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Liability not found' },
        { status: 404 }
      );
    }

    // Cross-tenant validation
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Liability not found' },
        { status: 404 }
      );
    }

    if (!existing.isActive) {
      return NextResponse.json(
        { error: 'Liability is already deleted' },
        { status: 400 }
      );
    }

    // Period-close lock check
    const periodLock = await checkPeriodClose(existing.date || new Date());
    if (periodLock) return periodLock;

    await db.$transaction(async (tx) => {
      // ────────────────────────────────────────────────────────
      // Reverse bank balance impact if bankId existed
      // ────────────────────────────────────────────────────────
      if (existing.bankId) {
        const bankRecord = await tx.bank.findUnique({
          where: { id: existing.bankId },
          select: { currentBalance: true },
        });
        if (bankRecord) {
          let reversedBalance: number;
          if (existing.type === 'received') {
            // Received incremented bank balance, so reverse by subtracting
            reversedBalance = safeFinancialSubtract(bankRecord.currentBalance, existing.amount);
          } else {
            // Pay decremented bank balance, so reverse by adding back
            reversedBalance = safeFinancialAdd(bankRecord.currentBalance, existing.amount);
          }
          await tx.bank.update({
            where: { id: existing.bankId },
            data: { currentBalance: reversedBalance },
          });
        }
      }

      // Soft delete
      await tx.liability.update({
        where: { id },
        data: { isActive: false },
      });

      // AuditLog — module token: Fin-Liability-Core
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'Fin-Liability-Core',
          recordId: existing.id,
          recordLabel: `${existing.investmentHead?.name || existing.id} - Tk. ${existing.amount}`,
          userId,
          userName,
          details: JSON.stringify({
            type: existing.type,
            softDelete: true,
            amount: existing.amount,
            bankId: existing.bankId,
            bankBalanceReversed: !!existing.bankId,
          }),
        },
      });
    });

    return NextResponse.json({ message: 'Liability deleted successfully' });
  } catch (error) {
    console.error('[Liabilities DELETE /id] Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete liability' },
      { status: 500 }
    );
  }
}
