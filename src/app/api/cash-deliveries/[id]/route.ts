import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity, checkPeriodClose } from '@/lib/api-security';

// GET /api/cash-deliveries/[id] - Get single cash delivery with all relations
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

    return NextResponse.json(item);
  } catch (error) {
    console.error('Error fetching cash delivery:', error);
    return NextResponse.json(
      { error: 'Failed to fetch cash delivery' },
      { status: 500 }
    );
  }
}

// PUT /api/cash-deliveries/[id] - Update cash delivery with bank reversal + balance validation
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

    // Period-close lock check
    const checkDate = date ? new Date(date) : (existing.date || new Date());
    const periodLock = await checkPeriodClose(checkDate);
    if (periodLock) return periodLock;

    // deliveryCode is immutable - never update it

    const oldBankId = existing.bankId;
    const oldAmount = existing.amount;
    const oldStatus = existing.status;
    const newBankId = bankId !== undefined ? (bankId || null) : oldBankId;
    const newAmount = amount !== undefined ? (parseFloat(amount) || 0) : oldAmount;
    const newStatus = status || oldStatus;

    // Pre-transaction balance validation for CashDelivery:
    // If new status is Approved and there's a bankId, we need to validate sufficiency.
    // The net impact = (new decrement if Approved) - (old increment we reverse if was Approved)
    // But we reverse old first, then apply new, so we validate the apply step.
    if (newStatus === 'Approved' && newBankId) {
      // Calculate what the bank balance would be after reversing old impact
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
        projectedBalance += oldAmount;
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
      // Reverse old bank impact if the old status was Approved
      if (oldStatus === 'Approved' && oldBankId) {
        await tx.bank.update({
          where: { id: oldBankId },
          data: { currentBalance: { increment: oldAmount } },
        });
      }

      // Apply new bank impact if the new status is Approved
      if (newStatus === 'Approved' && newBankId) {
        // Re-validate inside transaction
        const currentBank = await tx.bank.findUnique({
          where: { id: newBankId },
          select: { currentBalance: true },
        });

        if (!currentBank || currentBank.currentBalance < newAmount) {
          throw new Error(
            `Insufficient bank balance. Bank has ৳${currentBank?.currentBalance ?? 0} but delivery amount is ৳${newAmount}`
          );
        }

        await tx.bank.update({
          where: { id: newBankId },
          data: { currentBalance: { decrement: newAmount } },
        });
      }

      // Get the supplier name for ledger entry (may have changed)
      let supplierName = existing.supplier.name;
      if (supplierId && supplierId !== existing.supplierId) {
        const newSupplier = await tx.supplier.findUnique({
          where: { id: supplierId },
          select: { name: true },
        });
        if (newSupplier) supplierName = newSupplier.name;
      }

      // Update the cash delivery
      const updated = await tx.cashDelivery.update({
        where: { id },
        data: {
          ...(supplierId && { supplierId }),
          ...(date && { date: new Date(date) }),
          ...(amount !== undefined && { amount: newAmount }),
          ...(paymentOptionId !== undefined && { paymentOptionId: paymentOptionId || null }),
          ...(bankId !== undefined && { bankId: bankId || null }),
          ...(description !== undefined && { description: description || null }),
          ...(status && { status: newStatus }),
        },
        include: {
          supplier: true,
          paymentOption: true,
          bank: true,
        },
      });

      // If status is Approved and (bankId or amount changed), create balanced ledger pair
      const bankOrAmountChanged =
        newBankId !== oldBankId || newAmount !== oldAmount;
      const statusChanged = newStatus !== oldStatus;

      if ((newStatus === 'Approved' && bankOrAmountChanged) ||
          (statusChanged && newStatus === 'Approved')) {
        // Get cash/bank account name for the credit entry
        const bankRecord = newBankId
          ? await tx.bank.findUnique({ where: { id: newBankId }, select: { bankName: true } })
          : null;
        const cashAccountName = bankRecord?.bankName || 'Cash in Hand';
        // Dr: Supplier
        await tx.ledgerEntry.create({
          data: {
            date: updated.date,
            account: supplierName,
            particulars: 'Cash Delivery to supplier (updated)',
            debit: newAmount,
            credit: 0,
            reference: existing.deliveryCode,
            referenceType: 'CashDelivery',
          },
        });
        // Cr: Cash/Bank
        await tx.ledgerEntry.create({
          data: {
            date: updated.date,
            account: cashAccountName,
            particulars: 'Cash Delivery to supplier (updated)',
            debit: 0,
            credit: newAmount,
            reference: existing.deliveryCode,
            referenceType: 'CashDelivery',
          },
        });
      }

      // Create AuditLog entry
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'CashDeliveries',
          recordId: updated.id,
          recordLabel: existing.deliveryCode,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            previousBankId: oldBankId,
            newBankId,
            previousAmount: oldAmount,
            newAmount,
            previousStatus: oldStatus,
            newStatus,
            bankImpactReversed: oldStatus === 'Approved' && oldBankId ? true : false,
            bankImpactApplied: newStatus === 'Approved' && newBankId ? true : false,
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

// DELETE /api/cash-deliveries/[id] - Soft delete
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'CashDeliveries', 'DELETE');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;

    const existing = await db.cashDelivery.findUnique({
      where: { id },
      select: { deliveryCode: true, isActive: true, bankId: true, amount: true, status: true, date: true },
    });

    if (!existing) {
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
        await tx.bank.update({
          where: { id: existing.bankId },
          data: { currentBalance: { increment: existing.amount } },
        });
      }

      // Create AuditLog entry
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'CashDeliveries',
          recordId: id,
          recordLabel: existing.deliveryCode,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            softDelete: true,
            bankImpactReversed: existing.status === 'Approved' && existing.bankId ? true : false,
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
