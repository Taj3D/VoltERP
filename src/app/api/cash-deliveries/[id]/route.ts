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

// Helper: normalize empty strings to null for optional string fields
function nullIfEmpty(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
}

// GET /api/cash-deliveries/[id] - Get single cash delivery with cross-tenant validation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'CashDeliveries', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const item = await db.cashDelivery.findUnique({
      where: { id },
      include: {
        supplier: true,
        paymentOption: true,
        bank: true,
      },
    });

    if (!item) {
      return NextResponse.json(
        { error: 'Cash delivery not found' },
        { status: 404 }
      );
    }

    // Cross-tenant validation: companyId mismatch → 404
    const companyId = security.user.companyId;
    if (companyId && item.companyId && item.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Cash delivery not found' },
        { status: 404 }
      );
    }

    // Apply VAT Auditor financial masking for single record
    const maskedItem = maskForVatAuditorFinancial(item, security.user.role);

    return NextResponse.json(maskedItem);
  } catch (error) {
    console.error('Error fetching cash delivery:', error);
    return NextResponse.json(
      { error: 'Failed to fetch cash delivery' },
      { status: 500 }
    );
  }
}

// PUT /api/cash-deliveries/[id] - Update with bank reversal + re-entry with sufficient balance validation
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'CashDeliveries', 'PUT');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const body = await request.json();
    const {
      supplierId,
      date,
      amount,
      paymentOptionId,
      bankId,
      chequeNo,
      voucherNo,
      description,
      status,
    } = body;

    // Fetch existing record
    const existing = await db.cashDelivery.findUnique({
      where: { id },
      include: {
        supplier: true,
        bank: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Cash delivery not found' },
        { status: 404 }
      );
    }

    // Cross-tenant validation
    const companyId = security.user.companyId;
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Cash delivery not found' },
        { status: 404 }
      );
    }

    // Period-close lock check
    const checkDate = date ? new Date(date) : (existing.date || new Date());
    const periodLock = await checkPeriodClose(checkDate);
    if (periodLock) return periodLock;

    // deliveryCode is immutable - never update it

    const oldBankId = existing.bankId;
    const oldAmount = existing.amount;
    const oldStatus = existing.status;
    const newBankId = bankId !== undefined ? (bankId || null) : oldBankId;
    const newAmount = amount !== undefined ? safeFinancialRound(parseFloat(amount) || 0) : oldAmount;
    const newStatus = status || oldStatus;
    const newChequeNo = chequeNo !== undefined ? nullIfEmpty(chequeNo) : existing.chequeNo;
    const newVoucherNo = voucherNo !== undefined ? nullIfEmpty(voucherNo) : existing.voucherNo;
    const newDescription = description !== undefined ? nullIfEmpty(description) : existing.description;

    // Pre-transaction balance validation for CashDelivery:
    // If new status is Approved and there's a bankId, validate sufficient balance.
    if (newStatus === 'Approved' && newBankId) {
      const bank = await db.bank.findUnique({
        where: { id: newBankId },
        select: { currentBalance: true, bankName: true },
      });

      if (!bank) {
        return NextResponse.json(
          { error: `Bank with id ${newBankId} not found` },
          { status: 400 }
        );
      }

      // Simulate: reverse old first (if old was Approved with same bankId, add oldAmount back)
      let projectedBalance = bank.currentBalance;
      if (oldStatus === 'Approved' && oldBankId === newBankId) {
        projectedBalance = safeFinancialAdd(projectedBalance, oldAmount);
      } else if (oldStatus === 'Approved' && oldBankId && oldBankId !== newBankId) {
        // Old bank gets reversed (different bank), new bank only gets decremented
        projectedBalance = bank.currentBalance; // new bank hasn't been touched yet
      }

      if (projectedBalance < newAmount) {
        return NextResponse.json(
          {
            error: `Insufficient bank balance. ${bank.bankName} projected balance is ৳${projectedBalance} but delivery amount is ৳${newAmount}`,
          },
          { status: 400 }
        );
      }
    }

    const result = await db.$transaction(async (tx) => {
      // ── STEP 1: Reverse old bank impact if old status was Approved ──
      // (payment to supplier was made, so add the amount back to the bank)
      if (oldStatus === 'Approved' && oldBankId) {
        const bankRecord = await tx.bank.findUnique({
          where: { id: oldBankId },
          select: { currentBalance: true },
        });
        const reversedBalance = safeFinancialAdd(bankRecord?.currentBalance ?? 0, oldAmount);
        await tx.bank.update({
          where: { id: oldBankId },
          data: { currentBalance: reversedBalance },
        });
      }

      // ── STEP 2: Create reversal ledger entries for the old state ──
      if (oldStatus === 'Approved') {
        // Resolve old cash/bank account name for reversal
        let oldCashAccountName = 'Cash in Hand';
        if (oldBankId) {
          const oldBankRecord = await tx.bank.findUnique({
            where: { id: oldBankId },
            select: { bankName: true },
          });
          oldCashAccountName = oldBankRecord?.bankName || 'Bank';
        }

        // Reversal: Dr: [old cash/bank] (reverses original credit from cash/bank)
        await tx.ledgerEntry.create({
          data: {
            date: checkDate,
            account: oldCashAccountName,
            particulars: 'Reversal: Cash Delivery update',
            debit: oldAmount,
            credit: 0,
            reference: existing.deliveryCode,
            referenceType: 'CashDelivery',
          },
        });

        // Reversal: Cr: [old supplier] (reverses original debit to supplier)
        await tx.ledgerEntry.create({
          data: {
            date: checkDate,
            account: existing.supplier.name,
            particulars: 'Reversal: Cash Delivery update',
            debit: 0,
            credit: oldAmount,
            reference: existing.deliveryCode,
            referenceType: 'CashDelivery',
          },
        });
      }

      // ── STEP 3: Apply new bank impact if new status is Approved ──
      if (newStatus === 'Approved' && newBankId) {
        // Re-validate inside transaction for consistency
        const currentBank = await tx.bank.findUnique({
          where: { id: newBankId },
          select: { currentBalance: true },
        });

        if (!currentBank || currentBank.currentBalance < newAmount) {
          throw new Error(
            `Insufficient bank balance. Bank has ৳${currentBank?.currentBalance ?? 0} but delivery amount is ৳${newAmount}`
          );
        }

        const newBalance = safeFinancialSubtract(currentBank.currentBalance, newAmount);
        await tx.bank.update({
          where: { id: newBankId },
          data: { currentBalance: newBalance },
        });
      }

      // ── STEP 4: Create new ledger entries if new status is Approved ──
      if (newStatus === 'Approved') {
        // Get the supplier name for ledger entry (may have changed)
        let supplierName = existing.supplier.name;
        if (supplierId && supplierId !== existing.supplierId) {
          const newSupplier = await tx.supplier.findUnique({
            where: { id: supplierId },
            select: { name: true },
          });
          if (newSupplier) supplierName = newSupplier.name;
        }

        // Resolve new cash/bank account name
        let newCashAccountName = 'Cash in Hand';
        if (newBankId) {
          const newBankRecord = await tx.bank.findUnique({
            where: { id: newBankId },
            select: { bankName: true },
          });
          newCashAccountName = newBankRecord?.bankName || 'Bank';
        }

        const newParticulars = newDescription || 'Cash Delivery to supplier (updated)';

        // Dr: Supplier
        await tx.ledgerEntry.create({
          data: {
            date: checkDate,
            account: supplierName,
            particulars: newParticulars,
            debit: newAmount,
            credit: 0,
            reference: existing.deliveryCode,
            referenceType: 'CashDelivery',
          },
        });
        // Cr: Cash/Bank
        await tx.ledgerEntry.create({
          data: {
            date: checkDate,
            account: newCashAccountName,
            particulars: newParticulars,
            debit: 0,
            credit: newAmount,
            reference: existing.deliveryCode,
            referenceType: 'CashDelivery',
          },
        });
      }

      // ── STEP 5: Update the cash delivery record ──
      const updated = await tx.cashDelivery.update({
        where: { id },
        data: {
          ...(supplierId && { supplierId }),
          ...(date && { date: new Date(date) }),
          ...(amount !== undefined && { amount: newAmount }),
          ...(paymentOptionId !== undefined && { paymentOptionId: paymentOptionId || null }),
          ...(bankId !== undefined && { bankId: newBankId }),
          ...(chequeNo !== undefined && { chequeNo: newChequeNo }),
          ...(voucherNo !== undefined && { voucherNo: newVoucherNo }),
          ...(description !== undefined && { description: newDescription }),
          ...(status && { status: newStatus }),
        },
        include: {
          supplier: true,
          paymentOption: true,
          bank: true,
        },
      });

      // ── STEP 6: AuditLog with "Fin-Ledger-Transaction" module token ──
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'Fin-Ledger-Transaction',
          recordId: updated.id,
          recordLabel: existing.deliveryCode,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            type: 'CashDelivery',
            previousBankId: oldBankId,
            newBankId,
            previousAmount: oldAmount,
            newAmount,
            previousStatus: oldStatus,
            newStatus,
            bankImpactReversed: !!(oldStatus === 'Approved' && oldBankId),
            bankImpactApplied: !!(newStatus === 'Approved' && newBankId),
            ledgerReversalCreated: oldStatus === 'Approved',
            ledgerNewEntriesCreated: newStatus === 'Approved',
          }),
        },
      });

      return updated;
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Error updating cash delivery:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to update cash delivery';
    const statusCode = message.includes('Insufficient') ? 400 : 500;
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}

// DELETE /api/cash-deliveries/[id] - Soft delete (admin only), bank balance reversal
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'CashDeliveries', 'DELETE');
  if (!security.authorized) return security.response;

  // Manager delete restriction: only admin can delete financial posts
  const deleteCheck = checkFinancialDeletePermission(security.user.role);
  if (deleteCheck) return deleteCheck;

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
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Cash delivery not found' },
        { status: 404 }
      );
    }

    // Cross-tenant validation
    const companyId = security.user.companyId;
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Cash delivery not found' },
        { status: 404 }
      );
    }

    if (!existing.isActive) {
      return NextResponse.json(
        { error: 'Cash delivery is already deleted' },
        { status: 400 }
      );
    }

    // Period-close lock check
    const periodLock = await checkPeriodClose(existing.date || new Date());
    if (periodLock) return periodLock;

    await db.$transaction(async (tx) => {
      // Soft delete
      await tx.cashDelivery.update({
        where: { id },
        data: { isActive: false },
      });

      // If the delivery was Approved and had a bankId, reverse the bank impact
      // (payment to supplier was made, so add the amount back to the bank)
      if (existing.status === 'Approved' && existing.bankId) {
        const bankRecord = await tx.bank.findUnique({
          where: { id: existing.bankId },
          select: { currentBalance: true },
        });
        const newBalance = safeFinancialAdd(bankRecord?.currentBalance ?? 0, existing.amount);
        await tx.bank.update({
          where: { id: existing.bankId },
          data: { currentBalance: newBalance },
        });
      }

      // AuditLog with "Fin-Ledger-Transaction" module token
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'Fin-Ledger-Transaction',
          recordId: id,
          recordLabel: existing.deliveryCode,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            type: 'CashDelivery',
            softDelete: true,
            bankImpactReversed: !!(existing.status === 'Approved' && existing.bankId),
            reversedAmount: existing.status === 'Approved' && existing.bankId ? existing.amount : 0,
          }),
        },
      });
    });

    return NextResponse.json({ message: 'Cash delivery deleted successfully' });
  } catch (error) {
    console.error('Error deleting cash delivery:', error);
    return NextResponse.json(
      { error: 'Failed to delete cash delivery' },
      { status: 500 }
    );
  }
}
