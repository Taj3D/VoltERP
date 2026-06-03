// ============================================================
// Cash Collections [id] API — Double-Entry CoA Alignment, Status Transition, Ledger Reversal
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
  safeFinancialSubtract,
  safeFinancialAdd,
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

// AR Forward: Re-add customer debit balance when cash collection is cancelled/rejected
function computeArForward(
  currentBalance: number,
  currentBalanceType: string,
  amount: number
): { newBalance: number; newBalanceType: string } {
  if (currentBalanceType === 'Dr') {
    return {
      newBalance: safeFinancialAdd(currentBalance, amount),
      newBalanceType: 'Dr',
    };
  } else {
    // Cr balance
    if (amount > currentBalance) {
      return {
        newBalance: safeFinancialSubtract(amount, currentBalance),
        newBalanceType: 'Dr',
      };
    } else {
      return {
        newBalance: safeFinancialSubtract(currentBalance, amount),
        newBalanceType: 'Cr',
      };
    }
  }
}

// Allowed status transitions for CashCollection
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  Pending: ['Approved', 'Rejected'],
  Approved: ['Rejected'],
  Rejected: [],
};

// GET /api/cash-collections/[id] — Single cash collection with CoA includes
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'CashCollections', 'GET');
  if (!security.authorized) return security.response;

  const { role, companyId } = security.user;

  try {
    const { id } = await params;
    const item = await db.cashCollection.findUnique({
      where: { id },
      include: {
        customer: true,
        paymentOption: true,
        bank: true,
        chartOfAccount: true,
        sr: true,
      },
    });

    if (!item || !item.isActive) {
      return NextResponse.json({ error: 'Cash collection not found' }, { status: 404 });
    }

    if (companyId && item.companyId && item.companyId !== companyId) {
      return NextResponse.json({ error: 'Cash collection not found' }, { status: 404 });
    }

    const maskedItem = maskForVatAuditorFinancial(item as Record<string, unknown>, role);
    return NextResponse.json(maskedItem);
  } catch (error) {
    console.error('Error fetching cash collection:', error);
    return NextResponse.json({ error: 'Failed to fetch cash collection' }, { status: 500 });
  }
}

// PUT /api/cash-collections/[id] — Status transition, ledger reversal on rejection
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'CashCollections', 'PUT');
  if (!security.authorized) return security.response;

  const { id: userId, name: userName, companyId } = security.user;

  try {
    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    const existing = await db.cashCollection.findUnique({
      where: { id },
      include: { customer: true, bank: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Cash collection not found' }, { status: 404 });
    }

    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Cash collection not found' }, { status: 404 });
    }

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
      // On Rejection: reverse ledger entries and bank balance
      if (newStatus === 'Rejected' && existing.ledgerPosted) {
        // Reverse bank balance
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
        const reversalCrCode = `LED-${String(parseInt(reversalDrCode.match(/LED-(\d+)/)?.[1] || '0', 10) + 1).padStart(5, '0')}`;

        const creditAccount = existing.customer?.name || 'Unknown Customer';
        let debitAccount = 'Cash in Hand';
        if (existing.bankId) {
          const bankRecord = await tx.bank.findUnique({
            where: { id: existing.bankId },
            select: { bankName: true },
          });
          debitAccount = bankRecord?.bankName || 'Bank';
        }

        // Reversal: Cr: cash/bank (reverses original Dr)
        await tx.ledgerEntry.create({
          data: {
            entryCode: reversalCrCode,
            date: checkDate,
            account: debitAccount,
            particulars: 'Reversal: Cash Collection rejected',
            debit: 0,
            credit: existing.amount,
            reference: existing.collectionCode,
            referenceType: 'CashCollection',
            companyId: existing.companyId,
          },
        });

        // Reversal: Dr: customer (reverses original Cr)
        await tx.ledgerEntry.create({
          data: {
            entryCode: reversalDrCode,
            date: checkDate,
            account: creditAccount,
            particulars: 'Reversal: Cash Collection rejected',
            debit: existing.amount,
            credit: 0,
            reference: existing.collectionCode,
            referenceType: 'CashCollection',
            companyId: existing.companyId,
          },
        });

        // Reversal LedgerAutoPost
        const lapCode = await generateAutoPostCode(tx);
        await tx.ledgerAutoPost.create({
          data: {
            code: lapCode,
            sourceType: 'CashCollection',
            sourceId: id,
            sourceCode: existing.collectionCode,
            debitEntryId: reversalDrCode,
            creditEntryId: reversalCrCode,
            debitAccount: creditAccount,
            creditAccount: debitAccount,
            amount: existing.amount,
            postingDate: checkDate,
            status: 'Reversed',
            companyId: existing.companyId,
            reversalReason: 'Cash Collection rejected',
            postedBy: userId,
          },
        });

        await tx.cashCollection.update({
          where: { id },
          data: { ledgerPosted: false },
        });

        // ── AR Forward: Re-add customer debit balance on rejection ──
        if (existing.customerId && existing.customer) {
          const { newBalance, newBalanceType } = computeArForward(
            existing.customer.currentBalance,
            existing.customer.currentBalanceType,
            existing.amount
          );
          await tx.customer.update({
            where: { id: existing.customerId },
            data: { currentBalance: newBalance, currentBalanceType: newBalanceType },
          });
        }
      }

      // Update the cash collection record
      const updated = await tx.cashCollection.update({
        where: { id },
        data: {
          ...(body.customerId && { customerId: String(body.customerId) }),
          ...(body.date && { date: new Date(body.date) }),
          ...(body.amount !== undefined && { amount: safeFinancialRound(parseFloat(String(body.amount))) }),
          ...(body.paymentOptionId !== undefined && { paymentOptionId: body.paymentOptionId ? String(body.paymentOptionId) : null }),
          ...(body.bankId !== undefined && { bankId: body.bankId ? String(body.bankId) : null }),
          ...(body.chequeNo !== undefined && { chequeNo: body.chequeNo ? String(body.chequeNo) : null }),
          ...(body.voucherNo !== undefined && { voucherNo: body.voucherNo ? String(body.voucherNo) : null }),
          ...(body.description !== undefined && { description: body.description ? String(body.description) : null }),
          ...(status !== undefined && { status: newStatus }),
        },
        include: {
          customer: true,
          paymentOption: true,
          bank: true,
          chartOfAccount: true,
          sr: true,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'Fin-Ledger-Transaction',
          recordId: updated.id,
          recordLabel: existing.collectionCode,
          userId,
          userName,
          details: JSON.stringify({
            type: 'CashCollection',
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
        recordLabel: existing.collectionCode,
        userId,
        userName,
        details: `Updated cash collection ${existing.collectionCode}: status ${existing.status} → ${newStatus}`,
      });

      return updated;
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Error updating cash collection:', error);
    const message = error instanceof Error ? error.message : 'Failed to update cash collection';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/cash-collections/[id] — Soft delete with ledger reversal
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'CashCollections', 'DELETE');
  if (!security.authorized) return security.response;

  const deleteCheck = checkFinancialDeletePermission(security.user.role);
  if (deleteCheck) return deleteCheck;

  const { id: userId, name: userName, companyId } = security.user;

  try {
    const { id } = await params;

    const existing = await db.cashCollection.findUnique({
      where: { id },
      select: {
        collectionCode: true,
        isActive: true,
        bankId: true,
        amount: true,
        status: true,
        date: true,
        companyId: true,
        ledgerPosted: true,
        customerId: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Cash collection not found' }, { status: 404 });
    }

    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Cash collection not found' }, { status: 404 });
    }

    if (!existing.isActive) {
      return NextResponse.json({ error: 'Cash collection is already deleted' }, { status: 400 });
    }

    const periodLock = await checkPeriodClose(existing.date || new Date());
    if (periodLock) return periodLock;

    await db.$transaction(async (tx: any) => {
      // Reverse bank balance if ledgerPosted
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
        const customer = await tx.customer.findUnique({
          where: { id: existing.customerId },
          select: { name: true, currentBalance: true, currentBalanceType: true },
        });

        // ── AR Forward: Re-add customer debit balance on delete ──
        if (customer) {
          const { newBalance, newBalanceType } = computeArForward(
            customer.currentBalance,
            customer.currentBalanceType,
            existing.amount
          );
          await tx.customer.update({
            where: { id: existing.customerId },
            data: { currentBalance: newBalance, currentBalanceType: newBalanceType },
          });
        }

        let debitAccount = 'Cash in Hand';
        if (existing.bankId) {
          const bankRecord = await tx.bank.findUnique({
            where: { id: existing.bankId },
            select: { bankName: true },
          });
          debitAccount = bankRecord?.bankName || 'Bank';
        }

        const reversalDrCode = await generateLedgerEntryCode(tx);
        const reversalCrCode = `LED-${String(parseInt(reversalDrCode.match(/LED-(\d+)/)?.[1] || '0', 10) + 1).padStart(5, '0')}`;

        // Reversal: Cr: cash/bank (reverses original Dr)
        await tx.ledgerEntry.create({
          data: {
            entryCode: reversalCrCode,
            date: existing.date || new Date(),
            account: debitAccount,
            particulars: 'Reversal: Cash Collection deleted',
            debit: 0,
            credit: existing.amount,
            reference: existing.collectionCode,
            referenceType: 'CashCollection',
            companyId: existing.companyId,
          },
        });

        // Reversal: Dr: customer (reverses original Cr)
        await tx.ledgerEntry.create({
          data: {
            entryCode: reversalDrCode,
            date: existing.date || new Date(),
            account: customer?.name || 'Unknown',
            particulars: 'Reversal: Cash Collection deleted',
            debit: existing.amount,
            credit: 0,
            reference: existing.collectionCode,
            referenceType: 'CashCollection',
            companyId: existing.companyId,
          },
        });

        const lapCode = await generateAutoPostCode(tx);
        await tx.ledgerAutoPost.create({
          data: {
            code: lapCode,
            sourceType: 'CashCollection',
            sourceId: id,
            sourceCode: existing.collectionCode,
            debitEntryId: reversalDrCode,
            creditEntryId: reversalCrCode,
            debitAccount: customer?.name || 'Unknown',
            creditAccount: debitAccount,
            amount: existing.amount,
            postingDate: existing.date || new Date(),
            status: 'Reversed',
            companyId: existing.companyId,
            reversalReason: 'Cash Collection soft-deleted',
            postedBy: userId,
          },
        });
      }

      await tx.cashCollection.update({
        where: { id },
        data: { isActive: false, ledgerPosted: false },
      });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'Fin-Ledger-Transaction',
          recordId: id,
          recordLabel: existing.collectionCode,
          userId,
          userName,
          details: JSON.stringify({
            type: 'CashCollection',
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
        recordLabel: existing.collectionCode,
        userId,
        userName,
        details: `Soft-deleted cash collection ${existing.collectionCode}`,
      });
    });

    return NextResponse.json({ message: 'Cash collection deleted successfully' });
  } catch (error) {
    console.error('Error deleting cash collection:', error);
    return NextResponse.json({ error: 'Failed to delete cash collection' }, { status: 500 });
  }
}
