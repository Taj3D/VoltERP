// ============================================================
// Incomes [id] API — Double-Entry CoA Alignment, Status Transition, Ledger Reversal
// Module Token: Fin-Ledger-Transaction
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

// Allowed status transitions for Income
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  Pending: ['Approved', 'Rejected'],
  Approved: ['Rejected'],
  Rejected: [],
};

// GET /api/incomes/[id] — Single income with CoA includes, cross-tenant validation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Incomes', 'GET');
  if (!security.authorized) return security.response;

  const { role, companyId } = security.user;

  try {
    const { id } = await params;
    const income = await db.income.findUnique({
      where: { id },
      include: {
        head: { include: { chartOfAccount: true } },
        paymentOption: true,
        bank: true,
        chartOfAccount: true,
      },
    });

    if (!income || !income.isActive) {
      return NextResponse.json({ error: 'Income not found' }, { status: 404 });
    }

    if (companyId && income.companyId && income.companyId !== companyId) {
      return NextResponse.json({ error: 'Income not found' }, { status: 404 });
    }

    const maskedIncome = maskForVatAuditorFinancial(income as Record<string, unknown>, role);
    return NextResponse.json(maskedIncome);
  } catch (error) {
    console.error('Error fetching income:', error);
    return NextResponse.json({ error: 'Failed to fetch income' }, { status: 500 });
  }
}

// PUT /api/incomes/[id] — Status transition, ledger reversal on rejection
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Incomes', 'PUT');
  if (!security.authorized) return security.response;

  const { id: userId, name: userName, role, companyId } = security.user;

  try {
    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    const existing = await db.income.findUnique({
      where: { id },
      select: {
        incomeCode: true,
        headId: true,
        bankId: true,
        amount: true,
        status: true,
        isActive: true,
        date: true,
        companyId: true,
        ledgerPosted: true,
        debitEntryCode: true,
        creditEntryCode: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Income not found' }, { status: 404 });
    }

    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Income not found' }, { status: 404 });
    }

    // Period-close lock check
    const checkDate = body.date ? new Date(body.date) : (existing.date || new Date());
    const periodLock = await checkPeriodClose(checkDate);
    if (periodLock) return periodLock;

    // Status transition validation
    if (status && status !== existing.status) {
      const allowed = ALLOWED_TRANSITIONS[existing.status] || [];
      if (!allowed.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status transition: ${existing.status} → ${status}. Allowed: [${allowed.join(', ')}]` },
          { status: 400 }
        );
      }
    }

    const newStatus = status ? String(status) : existing.status;

    const result = await db.$transaction(async (tx: any) => {
      // ── On Rejection: reverse ledger entries and bank balance ──
      if (newStatus === 'Rejected' && existing.ledgerPosted) {
        // Reverse bank balance (income was incremented, now decrement)
        if (existing.bankId) {
          const bankRecord = await tx.bank.findUnique({
            where: { id: existing.bankId },
            select: { currentBalance: true },
          });
          if (bankRecord) {
            const reversedBalance = safeFinancialSubtract(bankRecord.currentBalance, existing.amount);
            await tx.bank.update({
              where: { id: existing.bankId },
              data: { currentBalance: reversedBalance },
            });
          }
        }

        // Create reversal ledger entries
        const reversalDrCode = await generateLedgerEntryCode(tx);
        const reversalCrCode = await generateLedgerEntryCode(tx);

        const head = await tx.expenseIncomeHead.findUnique({
          where: { id: existing.headId },
          select: { name: true },
        });

        let cashAccountName = 'Cash in Hand';
        if (existing.bankId) {
          const bankRecord = await tx.bank.findUnique({
            where: { id: existing.bankId },
            select: { bankName: true },
          });
          cashAccountName = bankRecord?.bankName || 'Bank';
        }

        // Reversal: Dr: income head (reverses original Cr)
        await tx.ledgerEntry.create({
          data: {
            entryCode: reversalDrCode,
            date: checkDate,
            account: head?.name || 'Unknown',
            particulars: 'Reversal: Income rejected',
            debit: existing.amount,
            credit: 0,
            reference: existing.incomeCode,
            referenceType: 'Income',
            companyId: existing.companyId,
          },
        });

        // Reversal: Cr: cash/bank (reverses original Dr)
        await tx.ledgerEntry.create({
          data: {
            entryCode: reversalCrCode,
            date: checkDate,
            account: cashAccountName,
            particulars: 'Reversal: Income rejected',
            debit: 0,
            credit: existing.amount,
            reference: existing.incomeCode,
            referenceType: 'Income',
            companyId: existing.companyId,
          },
        });

        // Create reversal LedgerAutoPost
        const lapCode = await generateAutoPostCode(tx);
        await tx.ledgerAutoPost.create({
          data: {
            code: lapCode,
            sourceType: 'Income',
            sourceId: id,
            sourceCode: existing.incomeCode,
            debitEntryId: reversalDrCode,
            creditEntryId: reversalCrCode,
            debitAccount: head?.name || 'Unknown',
            creditAccount: cashAccountName,
            amount: existing.amount,
            postingDate: checkDate,
            status: 'Reversed',
            companyId: existing.companyId,
            reversalReason: 'Income rejected',
            postedBy: userId,
          },
        });

        await tx.income.update({
          where: { id },
          data: { ledgerPosted: false },
        });
      }

      // Validate amount > 0 if being changed
      if (body.amount !== undefined) {
        const newAmount = safeFinancialRound(parseFloat(String(body.amount)));
        if (isNaN(newAmount) || newAmount <= 0) {
          throw new Error('Amount must be a positive number greater than 0');
        }
      }
      // Sanitize text inputs for XSS
      const updatedChequeNo = body.chequeNo !== undefined ? (body.chequeNo ? stripHtml(String(body.chequeNo)) : null) : undefined;
      const updatedVoucherNo = body.voucherNo !== undefined ? (body.voucherNo ? stripHtml(String(body.voucherNo)) : null) : undefined;
      const updatedDescription = body.description !== undefined ? (body.description ? stripHtml(String(body.description)) : null) : undefined;

      // Update the income record
      const income = await tx.income.update({
        where: { id },
        data: {
          ...(body.date !== undefined && { date: new Date(body.date) }),
          ...(body.headId !== undefined && { headId: String(body.headId) }),
          ...(body.amount !== undefined && { amount: safeFinancialRound(parseFloat(String(body.amount))) }),
          ...(body.paymentOptionId !== undefined && { paymentOptionId: body.paymentOptionId ? String(body.paymentOptionId) : null }),
          ...(body.bankId !== undefined && { bankId: body.bankId ? String(body.bankId) : null }),
          ...(updatedChequeNo !== undefined && { chequeNo: updatedChequeNo }),
          ...(updatedVoucherNo !== undefined && { voucherNo: updatedVoucherNo }),
          ...(updatedDescription !== undefined && { description: updatedDescription }),
          ...(status !== undefined && { status: newStatus }),
        },
        include: {
          head: { include: { chartOfAccount: true } },
          paymentOption: true,
          bank: true,
          chartOfAccount: true,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'Fin-Ledger-Transaction',
          recordId: income.id,
          recordLabel: existing.incomeCode,
          userId,
          userName,
          details: JSON.stringify({
            type: 'Income',
            previousStatus: existing.status,
            newStatus,
            ledgerReversed: newStatus === 'Rejected' && existing.ledgerPosted,
            bankBalanceReversed: newStatus === 'Rejected' && !!existing.bankId,
          }),
        },
      });

      await logUserActivity({
        tx: tx,
        action: 'UPDATE',
        module: 'Fin-Ledger-Transaction',
        recordId: id,
        recordLabel: existing.incomeCode,
        userId,
        userName,
        details: `Updated income ${existing.incomeCode}: status ${existing.status} → ${newStatus}`,
      });

      return income;
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Error updating income:', error);
    const message = error instanceof Error ? error.message : 'Failed to update income';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/incomes/[id] — Soft delete with ledger reversal
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'Incomes', 'DELETE');
  if (!security.authorized) return security.response;

  const { id: userId, name: userName, role, companyId } = security.user;

  const deleteCheck = checkFinancialDeletePermission(role);
  if (deleteCheck) return deleteCheck;

  try {
    const { id } = await params;

    const existing = await db.income.findUnique({
      where: { id },
      select: {
        incomeCode: true,
        isActive: true,
        bankId: true,
        amount: true,
        status: true,
        date: true,
        companyId: true,
        ledgerPosted: true,
        headId: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Income not found' }, { status: 404 });
    }

    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Income not found' }, { status: 404 });
    }

    if (!existing.isActive) {
      return NextResponse.json({ error: 'Income is already deleted' }, { status: 400 });
    }

    const periodLock = await checkPeriodClose(existing.date || new Date());
    if (periodLock) return periodLock;

    await db.$transaction(async (tx: any) => {
      // Reverse bank balance if ledgerPosted (income was incremented, now decrement)
      if (existing.ledgerPosted && existing.bankId) {
        const bankRecord = await tx.bank.findUnique({
          where: { id: existing.bankId },
          select: { currentBalance: true },
        });
        if (bankRecord) {
          const reversedBalance = safeFinancialSubtract(bankRecord.currentBalance, existing.amount);
          await tx.bank.update({
            where: { id: existing.bankId },
            data: { currentBalance: reversedBalance },
          });
        }
      }

      // If ledgerPosted, create reversal ledger entries
      if (existing.ledgerPosted) {
        const head = await tx.expenseIncomeHead.findUnique({
          where: { id: existing.headId },
          select: { name: true },
        });

        let cashAccountName = 'Cash in Hand';
        if (existing.bankId) {
          const bankRecord = await tx.bank.findUnique({
            where: { id: existing.bankId },
            select: { bankName: true },
          });
          cashAccountName = bankRecord?.bankName || 'Bank';
        }

        const reversalDrCode = await generateLedgerEntryCode(tx);
        const reversalCrCode = await generateLedgerEntryCode(tx);

        // Reversal: Dr: income head (reverses original Cr)
        await tx.ledgerEntry.create({
          data: {
            entryCode: reversalDrCode,
            date: existing.date || new Date(),
            account: head?.name || 'Unknown',
            particulars: 'Reversal: Income deleted',
            debit: existing.amount,
            credit: 0,
            reference: existing.incomeCode,
            referenceType: 'Income',
            companyId: existing.companyId,
          },
        });

        // Reversal: Cr: cash/bank (reverses original Dr)
        await tx.ledgerEntry.create({
          data: {
            entryCode: reversalCrCode,
            date: existing.date || new Date(),
            account: cashAccountName,
            particulars: 'Reversal: Income deleted',
            debit: 0,
            credit: existing.amount,
            reference: existing.incomeCode,
            referenceType: 'Income',
            companyId: existing.companyId,
          },
        });

        // Create reversal LedgerAutoPost
        const lapCode = await generateAutoPostCode(tx);
        await tx.ledgerAutoPost.create({
          data: {
            code: lapCode,
            sourceType: 'Income',
            sourceId: id,
            sourceCode: existing.incomeCode,
            debitEntryId: reversalDrCode,
            creditEntryId: reversalCrCode,
            debitAccount: head?.name || 'Unknown',
            creditAccount: cashAccountName,
            amount: existing.amount,
            postingDate: existing.date || new Date(),
            status: 'Reversed',
            companyId: existing.companyId,
            reversalReason: 'Income soft-deleted',
            postedBy: userId,
          },
        });
      }

      // Soft delete
      await tx.income.update({
        where: { id },
        data: { isActive: false, ledgerPosted: false },
      });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'Fin-Ledger-Transaction',
          recordId: id,
          recordLabel: existing.incomeCode,
          userId,
          userName,
          details: JSON.stringify({
            type: 'Income',
            softDelete: true,
            bankBalanceReversed: !!(existing.ledgerPosted && existing.bankId),
            ledgerReversed: existing.ledgerPosted,
          }),
        },
      });

      await logUserActivity({
        tx: tx,
        action: 'DELETE',
        module: 'Fin-Ledger-Transaction',
        recordId: id,
        recordLabel: existing.incomeCode,
        userId,
        userName,
        details: `Soft-deleted income ${existing.incomeCode}`,
      });
    });

    return NextResponse.json({ message: 'Income deleted successfully' });
  } catch (error) {
    console.error('Error deleting income:', error);
    return NextResponse.json({ error: 'Failed to delete income' }, { status: 500 });
  }
}
