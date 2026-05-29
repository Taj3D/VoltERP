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

// GET /api/cash-collections/[id] - Get single cash collection with cross-tenant validation
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

    // Cross-tenant validation: companyId mismatch → 404
    const companyId = security.user.companyId;
    if (companyId && item.companyId && item.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Cash collection not found' },
        { status: 404 }
      );
    }

    // Apply VAT Auditor financial masking for single record
    const maskedItem = maskForVatAuditorFinancial(item, security.user.role);

    return NextResponse.json(maskedItem);
  } catch (error) {
    console.error('Error fetching cash collection:', error);
    return NextResponse.json(
      { error: 'Failed to fetch cash collection' },
      { status: 500 }
    );
  }
}

// PUT /api/cash-collections/[id] - Update with bank reversal + re-entry, safeFinancialAdd/Subtract, ledger update
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
      chequeNo,
      voucherNo,
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

    // Cross-tenant validation
    const companyId = security.user.companyId;
    if (companyId && existing.companyId && existing.companyId !== companyId) {
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
      const newAmount = amount !== undefined ? safeFinancialRound(parseFloat(amount) || 0) : oldAmount;
      const newStatus = status || oldStatus;
      const newChequeNo = chequeNo !== undefined ? nullIfEmpty(chequeNo) : existing.chequeNo;
      const newVoucherNo = voucherNo !== undefined ? nullIfEmpty(voucherNo) : existing.voucherNo;
      const newDescription = description !== undefined ? nullIfEmpty(description) : existing.description;

      // ── STEP 1: Reverse old bank impact if old status was Approved ──
      if (oldStatus === 'Approved' && oldBankId) {
        const bankRecord = await tx.bank.findUnique({
          where: { id: oldBankId },
          select: { currentBalance: true },
        });
        const reversedBalance = safeFinancialSubtract(bankRecord?.currentBalance ?? 0, oldAmount);
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

        // Reversal: Cr: [old cash/bank] (reverses original debit)
        await tx.ledgerEntry.create({
          data: {
            date: checkDate,
            account: oldCashAccountName,
            particulars: 'Reversal: Cash Collection update',
            debit: 0,
            credit: oldAmount,
            reference: existing.collectionCode,
            referenceType: 'CashCollection',
          },
        });

        // Reversal: Dr: [old customer] (reverses original credit)
        await tx.ledgerEntry.create({
          data: {
            date: checkDate,
            account: existing.customer.name,
            particulars: 'Reversal: Cash Collection update',
            debit: oldAmount,
            credit: 0,
            reference: existing.collectionCode,
            referenceType: 'CashCollection',
          },
        });
      }

      // ── STEP 3: Apply new bank impact if new status is Approved ──
      if (newStatus === 'Approved' && newBankId) {
        const bankRecord = await tx.bank.findUnique({
          where: { id: newBankId },
          select: { currentBalance: true },
        });
        const newBalance = safeFinancialAdd(bankRecord?.currentBalance ?? 0, newAmount);
        await tx.bank.update({
          where: { id: newBankId },
          data: { currentBalance: newBalance },
        });
      }

      // ── STEP 4: Create new ledger entries if new status is Approved ──
      if (newStatus === 'Approved') {
        // Get the customer name for ledger entry (may have changed)
        let customerName = existing.customer.name;
        if (customerId && customerId !== existing.customerId) {
          const newCustomer = await tx.customer.findUnique({
            where: { id: customerId },
            select: { name: true },
          });
          if (newCustomer) customerName = newCustomer.name;
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

        const newParticulars = newDescription || 'Cash Collection from customer (updated)';

        // Dr: Cash/Bank
        await tx.ledgerEntry.create({
          data: {
            date: checkDate,
            account: newCashAccountName,
            particulars: newParticulars,
            debit: newAmount,
            credit: 0,
            reference: existing.collectionCode,
            referenceType: 'CashCollection',
          },
        });
        // Cr: Customer
        await tx.ledgerEntry.create({
          data: {
            date: checkDate,
            account: customerName,
            particulars: newParticulars,
            credit: newAmount,
            debit: 0,
            reference: existing.collectionCode,
            referenceType: 'CashCollection',
          },
        });
      }

      // ── STEP 5: Update the cash collection record ──
      const updated = await tx.cashCollection.update({
        where: { id },
        data: {
          ...(customerId && { customerId }),
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
          customer: true,
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
          recordLabel: existing.collectionCode,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            type: 'CashCollection',
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
    console.error('Error updating cash collection:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to update cash collection';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/cash-collections/[id] - Soft delete (admin only), bank balance reversal
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const security = await withApiSecurity(request, 'CashCollections', 'DELETE');
  if (!security.authorized) return security.response;

  // Manager delete restriction: only admin can delete financial posts
  const deleteCheck = checkFinancialDeletePermission(security.user.role);
  if (deleteCheck) return deleteCheck;

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
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Cash collection not found' },
        { status: 404 }
      );
    }

    // Cross-tenant validation
    const companyId = security.user.companyId;
    if (companyId && existing.companyId && existing.companyId !== companyId) {
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
      // (cash was collected from customer, so remove from bank balance)
      if (existing.status === 'Approved' && existing.bankId) {
        const bankRecord = await tx.bank.findUnique({
          where: { id: existing.bankId },
          select: { currentBalance: true },
        });
        const newBalance = safeFinancialSubtract(bankRecord?.currentBalance ?? 0, existing.amount);
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
          recordLabel: existing.collectionCode,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            type: 'CashCollection',
            softDelete: true,
            bankImpactReversed: !!(existing.status === 'Approved' && existing.bankId),
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
