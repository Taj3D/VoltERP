import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity, checkPeriodClose } from '@/lib/api-security';

// GET /api/cash-collections/[id] - Get single cash collection with all relations
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'CashCollections', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const item = await db.cashCollection.findUnique({
      where: { id },
      include: {
        customer: true,
        paymentOption: true,
        bank: true,
      },
    });

    if (!item) {
      return NextResponse.json(
        { error: 'Cash collection not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(item);
  } catch (error) {
    console.error('Error fetching cash collection:', error);
    return NextResponse.json(
      { error: 'Failed to fetch cash collection' },
      { status: 500 }
    );
  }
}

// PUT /api/cash-collections/[id] - Update cash collection with bank reversal logic
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'CashCollections', 'PUT');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;
    const body = await request.json();
    const {
      customerId,
      date,
      amount,
      paymentOptionId,
      bankId,
      description,
      status,
    } = body;

    // Fetch existing record
    const existing = await db.cashCollection.findUnique({
      where: { id },
      include: {
        customer: true,
        bank: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Cash collection not found' },
        { status: 404 }
      );
    }

    // Period-close lock check
    const checkDate = date ? new Date(date) : (existing.date || new Date());
    const periodLock = await checkPeriodClose(checkDate);
    if (periodLock) return periodLock;

    // collectionCode is immutable - never update it

    const result = await db.$transaction(async (tx) => {
      const oldBankId = existing.bankId;
      const oldAmount = existing.amount;
      const oldStatus = existing.status;
      const newBankId = bankId !== undefined ? (bankId || null) : oldBankId;
      const newAmount = amount !== undefined ? (parseFloat(amount) || 0) : oldAmount;
      const newStatus = status || oldStatus;

      // Reverse old bank impact if the old status was Approved
      if (oldStatus === 'Approved' && oldBankId) {
        await tx.bank.update({
          where: { id: oldBankId },
          data: { currentBalance: { decrement: oldAmount } },
        });
      }

      // Apply new bank impact if the new status is Approved
      if (newStatus === 'Approved' && newBankId) {
        await tx.bank.update({
          where: { id: newBankId },
          data: { currentBalance: { increment: newAmount } },
        });
      }

      // Get the customer name for ledger entry (may have changed)
      let customerName = existing.customer.name;
      if (customerId && customerId !== existing.customerId) {
        const newCustomer = await tx.customer.findUnique({
          where: { id: customerId },
          select: { name: true },
        });
        if (newCustomer) customerName = newCustomer.name;
      }

      // Update the cash collection
      const updated = await tx.cashCollection.update({
        where: { id },
        data: {
          ...(customerId && { customerId }),
          ...(date && { date: new Date(date) }),
          ...(amount !== undefined && { amount: newAmount }),
          ...(paymentOptionId !== undefined && { paymentOptionId: paymentOptionId || null }),
          ...(bankId !== undefined && { bankId: bankId || null }),
          ...(description !== undefined && { description: description || null }),
          ...(status && { status: newStatus }),
        },
        include: {
          customer: true,
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
        // Get cash/bank account name for the debit entry
        const bankRecord = newBankId
          ? await tx.bank.findUnique({ where: { id: newBankId }, select: { bankName: true } })
          : null;
        const cashAccountName = bankRecord?.bankName || 'Cash in Hand';
        // Dr: Cash/Bank
        await tx.ledgerEntry.create({
          data: {
            date: updated.date,
            account: cashAccountName,
            particulars: 'Cash Collection from customer (updated)',
            debit: newAmount,
            credit: 0,
            reference: existing.collectionCode,
            referenceType: 'CashCollection',
          },
        });
        // Cr: Customer
        await tx.ledgerEntry.create({
          data: {
            date: updated.date,
            account: customerName,
            particulars: 'Cash Collection from customer (updated)',
            credit: newAmount,
            debit: 0,
            reference: existing.collectionCode,
            referenceType: 'CashCollection',
          },
        });
      }

      // Create AuditLog entry
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'CashCollections',
          recordId: updated.id,
          recordLabel: existing.collectionCode,
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
    console.error('Error updating cash collection:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to update cash collection';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/cash-collections/[id] - Soft delete
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'CashCollections', 'DELETE');
  if (!security.authorized) return security.response;

  try {
    const { id } = await params;

    const existing = await db.cashCollection.findUnique({
      where: { id },
      select: { collectionCode: true, isActive: true, bankId: true, amount: true, status: true, date: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Cash collection not found' },
        { status: 404 }
      );
    }

    if (!existing.isActive) {
      return NextResponse.json(
        { error: 'Cash collection is already deleted' },
        { status: 400 }
      );
    }

    // Period-close lock check
    const periodLock = await checkPeriodClose(existing.date || new Date());
    if (periodLock) return periodLock;

    await db.$transaction(async (tx) => {
      // Soft delete
      await tx.cashCollection.update({
        where: { id },
        data: { isActive: false },
      });

      // If the collection was Approved and had a bankId, reverse the bank impact
      if (existing.status === 'Approved' && existing.bankId) {
        await tx.bank.update({
          where: { id: existing.bankId },
          data: { currentBalance: { decrement: existing.amount } },
        });
      }

      // Create AuditLog entry
      await tx.auditLog.create({
        data: {
          action: 'DELETE',
          module: 'CashCollections',
          recordId: id,
          recordLabel: existing.collectionCode,
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

    return NextResponse.json({ message: 'Cash collection deleted successfully' });
  } catch (error) {
    console.error('Error deleting cash collection:', error);
    return NextResponse.json(
      { error: 'Failed to delete cash collection' },
      { status: 500 }
    );
  }
}
