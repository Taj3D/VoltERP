// ============================================================
// Cash Deliveries [id] API — Double-Entry CoA Alignment, Status Transition, Ledger Reversal
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

// AP Forward: Re-add supplier credit balance when cash delivery is cancelled/deleted
function computeApForward(
  currentBalance: number,
  currentBalanceType: string,
  amount: number
): { newBalance: number; newBalanceType: string } {
  if (currentBalanceType === 'Cr') {
    return {
      newBalance: safeFinancialAdd(currentBalance, amount),
      newBalanceType: 'Cr',
    };
  } else {
    // Dr balance
    if (amount > currentBalance) {
      return {
        newBalance: safeFinancialSubtract(amount, currentBalance),
        newBalanceType: 'Cr',
      };
    } else {
      return {
        newBalance: safeFinancialSubtract(currentBalance, amount),
        newBalanceType: 'Dr',
      };
    }
  }
}

// Allowed status transitions for CashDelivery
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  Pending: ['Approved', 'Rejected'],
  Approved: ['Rejected'],
  Rejected: [],
};

// GET /api/cash-deliveries/[id] — Single cash delivery with CoA includes
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'CashDeliveries', 'GET');
  if (!security.authorized) return security.response;

  const { role, companyId } = security.user;

  try {
    const { id } = await params;
    const item = await db.cashDelivery.findUnique({
      where: { id },
      include: {
        supplier: true,
        paymentOption: true,
        bank: true,
        chartOfAccount: true,
      },
    });

    if (!item || !item.isActive) {
      return NextResponse.json({ error: 'Cash delivery not found' }, { status: 404 });
    }

    if (companyId && item.companyId && item.companyId !== companyId) {
      return NextResponse.json({ error: 'Cash delivery not found' }, { status: 404 });
    }

    const maskedItem = maskForVatAuditorFinancial(item as Record<string, unknown>, role);
    return NextResponse.json(maskedItem);
  } catch (error) {
    console.error('Error fetching cash delivery:', error);
    return NextResponse.json({ error: 'Failed to fetch cash delivery' }, { status: 500 });
  }
}

// PUT /api/cash-deliveries/[id] — Status transition, ledger reversal on rejection
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'CashDeliveries', 'PUT');
  if (!security.authorized) return security.response;

  const { id: userId, name: userName, companyId } = security.user;

  try {
    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    const existing = await db.cashDelivery.findUnique({
      where: { id },
      include: { supplier: true, bank: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Cash delivery not found' }, { status: 404 });
    }

    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Cash delivery not found' }, { status: 404 });
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
        // Reverse bank balance (delivery decremented, now add back)
        if (existing.bankId) {
          const bankRecord = await tx.bank.findUnique({
            where: { id: existing.bankId },
            select: { currentBalance: true },
          });
          if (bankRecord) {
            const reversedBalance = safeFinancialAdd(bankRecord.currentBalance, existing.amount);
            await tx.bank.update({
              where: { id: existing.bankId },
              data: { currentBalance: reversedBalance },
            });
          }
        }

        // Create reversal ledger entries
        const reversalDrCode = await generateLedgerEntryCode(tx);
        const reversalCrCode = `LED-${String(parseInt(reversalDrCode.match(/LED-(\d+)/)?.[1] || '0', 10) + 1).padStart(5, '0')}`;

        const debitAccount = existing.supplier?.name || 'Unknown Supplier';
        let creditAccount = 'Cash in Hand';
        if (existing.bankId) {
          const bankRecord = await tx.bank.findUnique({
            where: { id: existing.bankId },
            select: { bankName: true },
          });
          creditAccount = bankRecord?.bankName || 'Bank';
        }

        // Reversal: Dr: cash/bank (reverses original Cr)
        await tx.ledgerEntry.create({
          data: {
            entryCode: reversalDrCode,
            date: checkDate,
            account: creditAccount,
            particulars: 'Reversal: Cash Delivery rejected',
            debit: existing.amount,
            credit: 0,
            reference: existing.deliveryCode,
            referenceType: 'CashDelivery',
            companyId: existing.companyId,
          },
        });

        // Reversal: Cr: supplier (reverses original Dr)
        await tx.ledgerEntry.create({
          data: {
            entryCode: reversalCrCode,
            date: checkDate,
            account: debitAccount,
            particulars: 'Reversal: Cash Delivery rejected',
            debit: 0,
            credit: existing.amount,
            reference: existing.deliveryCode,
            referenceType: 'CashDelivery',
            companyId: existing.companyId,
          },
        });

        // Reversal LedgerAutoPost
        const lapCode = await generateAutoPostCode(tx);
        await tx.ledgerAutoPost.create({
          data: {
            code: lapCode,
            sourceType: 'CashDelivery',
            sourceId: id,
            sourceCode: existing.deliveryCode,
            debitEntryId: reversalDrCode,
            creditEntryId: reversalCrCode,
            debitAccount: creditAccount,
            creditAccount: debitAccount,
            amount: existing.amount,
            postingDate: checkDate,
            status: 'Reversed',
            companyId: existing.companyId,
            reversalReason: 'Cash Delivery rejected',
            postedBy: userId,
          },
        });

        await tx.cashDelivery.update({
          where: { id },
          data: { ledgerPosted: false },
        });

        // ── AP Forward: Re-add supplier credit balance on rejection ──
        if (existing.supplierId && existing.supplier) {
          const { newBalance, newBalanceType } = computeApForward(
            existing.supplier.currentBalance,
            existing.supplier.currentBalanceType,
            existing.amount
          );
          await tx.supplier.update({
            where: { id: existing.supplierId },
            data: { currentBalance: newBalance, currentBalanceType: newBalanceType },
          });
        }
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

      // Update the cash delivery record
      const updated = await tx.cashDelivery.update({
        where: { id },
        data: {
          ...(body.supplierId && { supplierId: String(body.supplierId) }),
          ...(body.date && { date: new Date(body.date) }),
          ...(body.amount !== undefined && { amount: safeFinancialRound(parseFloat(String(body.amount))) }),
          ...(body.paymentOptionId !== undefined && { paymentOptionId: body.paymentOptionId ? String(body.paymentOptionId) : null }),
          ...(body.bankId !== undefined && { bankId: body.bankId ? String(body.bankId) : null }),
          ...(updatedChequeNo !== undefined && { chequeNo: updatedChequeNo }),
          ...(updatedVoucherNo !== undefined && { voucherNo: updatedVoucherNo }),
          ...(updatedDescription !== undefined && { description: updatedDescription }),
          ...(status !== undefined && { status: newStatus }),
        },
        include: {
          supplier: true,
          paymentOption: true,
          bank: true,
          chartOfAccount: true,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'Fin-Ledger-Transaction',
          recordId: updated.id,
          recordLabel: existing.deliveryCode,
          userId,
          userName,
          details: JSON.stringify({
            type: 'CashDelivery',
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
        recordLabel: existing.deliveryCode,
        userId,
        userName,
        details: `Updated cash delivery ${existing.deliveryCode}: status ${existing.status} → ${newStatus}`,
      });

      return updated;
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Error updating cash delivery:', error);
    const message = error instanceof Error ? error.message : 'Failed to update cash delivery';
    const statusCode = message.includes('Insufficient') ? 400 : 500;
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}

// DELETE /api/cash-deliveries/[id] — Soft delete with ledger reversal
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'CashDeliveries', 'DELETE');
  if (!security.authorized) return security.response;

  const deleteCheck = checkFinancialDeletePermission(security.user.role);
  if (deleteCheck) return deleteCheck;

  const { id: userId, name: userName, companyId } = security.user;

  try {
    const { id } = await params;

    const existing = await db.cashDelivery.findUnique({
      where: { id },
      select: {
        deliveryCode: true,
        isActive: true,
        bankId: true,
        amount: true,
        status: true,
        date: true,
        companyId: true,
        ledgerPosted: true,
        supplierId: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Cash delivery not found' }, { status: 404 });
    }

    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Cash delivery not found' }, { status: 404 });
    }

    if (!existing.isActive) {
      return NextResponse.json({ error: 'Cash delivery is already deleted' }, { status: 400 });
    }

    const periodLock = await checkPeriodClose(existing.date || new Date());
    if (periodLock) return periodLock;

    await db.$transaction(async (tx: any) => {
      // Reverse bank balance if ledgerPosted (delivery decremented, now add back)
      if (existing.ledgerPosted && existing.bankId) {
        const bankRecord = await tx.bank.findUnique({
          where: { id: existing.bankId },
          select: { currentBalance: true },
        });
        if (bankRecord) {
          const reversedBalance = safeFinancialAdd(bankRecord.currentBalance, existing.amount);
          await tx.bank.update({
            where: { id: existing.bankId },
            data: { currentBalance: reversedBalance },
          });
        }
      }

      // If ledgerPosted, create reversal ledger entries
      if (existing.ledgerPosted) {
        const supplier = await tx.supplier.findUnique({
          where: { id: existing.supplierId },
          select: { name: true, currentBalance: true, currentBalanceType: true },
        });

        // ── AP Forward: Re-add supplier credit balance on delete ──
        if (supplier) {
          const { newBalance, newBalanceType } = computeApForward(
            supplier.currentBalance,
            supplier.currentBalanceType,
            existing.amount
          );
          await tx.supplier.update({
            where: { id: existing.supplierId },
            data: { currentBalance: newBalance, currentBalanceType: newBalanceType },
          });
        }

        let creditAccount = 'Cash in Hand';
        if (existing.bankId) {
          const bankRecord = await tx.bank.findUnique({
            where: { id: existing.bankId },
            select: { bankName: true },
          });
          creditAccount = bankRecord?.bankName || 'Bank';
        }

        const reversalDrCode = await generateLedgerEntryCode(tx);
        const reversalCrCode = `LED-${String(parseInt(reversalDrCode.match(/LED-(\d+)/)?.[1] || '0', 10) + 1).padStart(5, '0')}`;

        // Reversal: Dr: cash/bank (reverses original Cr)
        await tx.ledgerEntry.create({
          data: {
            entryCode: reversalDrCode,
            date: existing.date || new Date(),
            account: creditAccount,
            particulars: 'Reversal: Cash Delivery deleted',
            debit: existing.amount,
            credit: 0,
            reference: existing.deliveryCode,
            referenceType: 'CashDelivery',
            companyId: existing.companyId,
          },
        });

        // Reversal: Cr: supplier (reverses original Dr)
        await tx.ledgerEntry.create({
          data: {
            entryCode: reversalCrCode,
            date: existing.date || new Date(),
            account: supplier?.name || 'Unknown',
            particulars: 'Reversal: Cash Delivery deleted',
            debit: 0,
            credit: existing.amount,
            reference: existing.deliveryCode,
            referenceType: 'CashDelivery',
            companyId: existing.companyId,
          },
        });

        const lapCode = await generateAutoPostCode(tx);
        await tx.ledgerAutoPost.create({
          data: {
            code: lapCode,
            sourceType: 'CashDelivery',
            sourceId: id,
            sourceCode: existing.deliveryCode,
            debitEntryId: reversalDrCode,
            creditEntryId: reversalCrCode,
            debitAccount: creditAccount,
            creditAccount: supplier?.name || 'Unknown',
            amount: existing.amount,
            postingDate: existing.date || new Date(),
            status: 'Reversed',
            companyId: existing.companyId,
            reversalReason: 'Cash Delivery soft-deleted',
            postedBy: userId,
          },
        });
      }

      await tx.cashDelivery.update({
        where: { id },
        data: { isActive: false, ledgerPosted: false },
      });

      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'Fin-Ledger-Transaction',
          recordId: id,
          recordLabel: existing.deliveryCode,
          userId,
          userName,
          details: JSON.stringify({
            type: 'CashDelivery',
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
        recordLabel: existing.deliveryCode,
        userId,
        userName,
        details: `Soft-deleted cash delivery ${existing.deliveryCode}`,
      });
    });

    return NextResponse.json({ message: 'Cash delivery deleted successfully' });
  } catch (error) {
    console.error('Error deleting cash delivery:', error);
    return NextResponse.json({ error: 'Failed to delete cash delivery' }, { status: 500 });
  }
}
