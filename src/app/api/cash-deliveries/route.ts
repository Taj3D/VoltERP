import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  checkPeriodClose,
  maskFinancialArray,
  safeFinancialRound,
  safeFinancialSubtract,
} from '@/lib/api-security';

// Helper: normalize empty strings to null for optional string fields
function nullIfEmpty(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
}

// GET /api/cash-deliveries - List all cash deliveries with multi-tenant isolation
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'CashDeliveries', 'GET');
  if (!security.authorized) return security.response;

  const role = security.user.role;
  const companyId = security.user.companyId;

  try {
    const items = await db.cashDelivery.findMany({
      where: {
        isActive: true,
        ...(companyId && { companyId }),
      },
      include: {
        supplier: true,
        paymentOption: true,
        bank: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Apply VAT Auditor financial masking (handles nested bank, supplier objects)
    const masked = maskFinancialArray(items, role);

    return NextResponse.json(masked);
  } catch (error) {
    console.error('Error fetching cash deliveries:', error);
    return NextResponse.json(
      { error: 'Failed to fetch cash deliveries' },
      { status: 500 }
    );
  }
}

// POST /api/cash-deliveries - Create with companyId, safeFinancialRound, bank DECREMENT with validation,
// double-entry ledger, AuditLog "Fin-Ledger-Transaction", batchMode support
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'CashDeliveries', 'POST');
  if (!security.authorized) return security.response;

  const companyId = security.user.companyId;

  try {
    const body = await request.json();

    // ── batchMode support ──
    if (body.batchMode === true && Array.isArray(body.data)) {
      const results: unknown[] = [];
      const errors: unknown[] = [];

      for (let i = 0; i < body.data.length; i++) {
        try {
          const record = await createSingleCashDelivery(body.data[i], security.user, companyId);
          results.push(record);
        } catch (err) {
          errors.push({
            index: i,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }

      return NextResponse.json(
        { created: results.length, errors, results },
        { status: 201 }
      );
    }

    // ── single record creation ──
    const result = await createSingleCashDelivery(body, security.user, companyId);
    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating cash delivery:', error);
    const message = error instanceof Error ? error.message : 'Failed to create cash delivery';
    // Return 400 for validation errors (insufficient balance), 500 for others
    const statusCode = message.includes('Insufficient') ? 400 : 500;
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}

/**
 * Shared helper: create a single CashDelivery with all business logic
 * Must validate sufficient bank balance BEFORE decrementing.
 * Inside transaction, re-validate.
 */
async function createSingleCashDelivery(
  body: Record<string, unknown>,
  user: { id: string; name: string },
  companyId: string | null
) {
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

  if (!supplierId || !date || amount === undefined || amount === null) {
    throw new Error('supplierId, date, and amount are required');
  }

  // Period-close lock check
  const transactionDate = new Date(date as string);
  const periodLock = await checkPeriodClose(transactionDate);
  if (periodLock) throw new Error('Period is locked');

  const effectiveAmount = safeFinancialRound(parseFloat(String(amount)) || 0);
  const effectiveStatus = (status as string) || 'Approved';
  const effectiveBankId = (bankId as string) || null;
  const effectiveChequeNo = nullIfEmpty(chequeNo as string | undefined);
  const effectiveVoucherNo = nullIfEmpty(voucherNo as string | undefined);
  const effectiveDescription = nullIfEmpty(description as string | undefined);

  // Pre-transaction validation: check bank balance BEFORE decrementing
  if (effectiveStatus === 'Approved' && effectiveBankId) {
    const bank = await db.bank.findUnique({
      where: { id: effectiveBankId },
      select: { currentBalance: true, bankName: true },
    });

    if (!bank) {
      throw new Error(`Bank with id ${effectiveBankId} not found`);
    }

    if (bank.currentBalance < effectiveAmount) {
      throw new Error(
        `Insufficient bank balance. ${bank.bankName} has ৳${bank.currentBalance} but delivery amount is ৳${effectiveAmount}`
      );
    }
  }

  const result = await db.$transaction(async (tx) => {
    // Auto-generate deliveryCode as DEL-XXXXX (5-digit zero-padded)
    const lastDelivery = await tx.cashDelivery.findFirst({
      orderBy: { deliveryCode: 'desc' },
      select: { deliveryCode: true },
    });

    let nextNum = 1;
    if (lastDelivery?.deliveryCode) {
      const match = lastDelivery.deliveryCode.match(/DEL-(\d+)/);
      if (match) {
        nextNum = parseInt(match[1], 10) + 1;
      }
    }
    const deliveryCode = `DEL-${String(nextNum).padStart(5, '0')}`;

    // Create the cash delivery
    const cashDelivery = await tx.cashDelivery.create({
      data: {
        deliveryCode,
        supplierId: supplierId as string,
        date: transactionDate,
        amount: effectiveAmount,
        paymentOptionId: (paymentOptionId as string) || null,
        bankId: effectiveBankId,
        companyId: companyId || null,
        chequeNo: effectiveChequeNo,
        voucherNo: effectiveVoucherNo,
        description: effectiveDescription,
        status: effectiveStatus,
      },
      include: {
        supplier: true,
        paymentOption: true,
        bank: true,
      },
    });

    // When status is "Approved", handle bank DECREMENT and double-entry ledger
    if (effectiveStatus === 'Approved') {
      // If bankId provided: decrement Bank.currentBalance by amount (cash OUT)
      if (effectiveBankId) {
        // Re-validate inside transaction for consistency
        const currentBank = await tx.bank.findUnique({
          where: { id: effectiveBankId },
          select: { currentBalance: true },
        });

        if (!currentBank || currentBank.currentBalance < effectiveAmount) {
          throw new Error(
            `Insufficient bank balance. Bank has ৳${currentBank?.currentBalance ?? 0} but delivery amount is ৳${effectiveAmount}`
          );
        }

        const newBalance = safeFinancialSubtract(currentBank.currentBalance, effectiveAmount);
        await tx.bank.update({
          where: { id: effectiveBankId },
          data: { currentBalance: newBalance },
        });
      }

      // Double-entry ledger: Dr: Supplier, Cr: Cash/Bank
      const cashAccountName = cashDelivery.bank?.bankName || 'Cash in Hand';
      await tx.ledgerEntry.create({
        data: {
          date: transactionDate,
          account: cashDelivery.supplier.name,
          particulars: 'Cash Delivery to supplier',
          debit: effectiveAmount,
          credit: 0,
          reference: deliveryCode,
          referenceType: 'CashDelivery',
        },
      });
      await tx.ledgerEntry.create({
        data: {
          date: transactionDate,
          account: cashAccountName,
          particulars: 'Cash Delivery to supplier',
          debit: 0,
          credit: effectiveAmount,
          reference: deliveryCode,
          referenceType: 'CashDelivery',
        },
      });
    }

    // AuditLog with "Fin-Ledger-Transaction" module token
    await tx.auditLog.create({
      data: {
        action: 'CREATE',
        module: 'Fin-Ledger-Transaction',
        recordId: cashDelivery.id,
        recordLabel: deliveryCode,
        userId: user.id,
        userName: user.name,
        details: JSON.stringify({
          type: 'CashDelivery',
          deliveryCode,
          supplierId,
          amount: effectiveAmount,
          bankId: effectiveBankId,
          chequeNo: effectiveChequeNo,
          voucherNo: effectiveVoucherNo,
          companyId: companyId || null,
          status: effectiveStatus,
        }),
      },
    });

    return cashDelivery;
  });

  return result;
}
