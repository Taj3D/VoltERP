import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  withApiSecurity,
  checkPeriodClose,
  maskFinancialArray,
  safeFinancialRound,
  safeFinancialAdd,
} from '@/lib/api-security';

// Helper: normalize empty strings to null for optional string fields
function nullIfEmpty(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
}

// GET /api/cash-collections - List all cash collections with multi-tenant isolation
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'CashCollections', 'GET');
  if (!security.authorized) return security.response;

  const role = security.user.role;
  const companyId = security.user.companyId;

  try {
    const items = await db.cashCollection.findMany({
      where: {
        isActive: true,
        ...(companyId && { companyId }),
      },
      include: {
        customer: true,
        paymentOption: true,
        bank: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Apply VAT Auditor financial masking (handles nested bank, customer objects)
    const masked = maskFinancialArray(items, role);

    return NextResponse.json(masked);
  } catch (error) {
    console.error('Error fetching cash collections:', error);
    return NextResponse.json(
      { error: 'Failed to fetch cash collections' },
      { status: 500 }
    );
  }
}

// POST /api/cash-collections - Create with companyId, safeFinancialRound, bank INCREMENT,
// double-entry ledger, AuditLog "Fin-Ledger-Transaction", batchMode support
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'CashCollections', 'POST');
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
          const record = await createSingleCashCollection(body.data[i], security.user, companyId);
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
    const result = await createSingleCashCollection(body, security.user, companyId);
    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating cash collection:', error);
    const message = error instanceof Error ? error.message : 'Failed to create cash collection';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Shared helper: create a single CashCollection with all business logic
 */
async function createSingleCashCollection(
  body: Record<string, unknown>,
  user: { id: string; name: string },
  companyId: string | null
) {
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

  if (!customerId || !date || amount === undefined || amount === null) {
    throw new Error('customerId, date, and amount are required');
  }

  // Period-close lock check
  const transactionDate = new Date(date as string);
  const periodLock = await checkPeriodClose(transactionDate);
  if (periodLock) throw new Error('Period is locked');

  const result = await db.$transaction(async (tx) => {
    // Auto-generate collectionCode as COL-XXXXX (5-digit zero-padded)
    const lastCollection = await tx.cashCollection.findFirst({
      orderBy: { collectionCode: 'desc' },
      select: { collectionCode: true },
    });

    let nextNum = 1;
    if (lastCollection?.collectionCode) {
      const match = lastCollection.collectionCode.match(/COL-(\d+)/);
      if (match) {
        nextNum = parseInt(match[1], 10) + 1;
      }
    }
    const collectionCode = `COL-${String(nextNum).padStart(5, '0')}`;

    const effectiveStatus = (status as string) || 'Approved';
    const effectiveAmount = safeFinancialRound(parseFloat(String(amount)) || 0);
    const effectiveBankId = (bankId as string) || null;
    const effectiveChequeNo = nullIfEmpty(chequeNo as string | undefined);
    const effectiveVoucherNo = nullIfEmpty(voucherNo as string | undefined);
    const effectiveDescription = nullIfEmpty(description as string | undefined);

    // Create the cash collection
    const cashCollection = await tx.cashCollection.create({
      data: {
        collectionCode,
        customerId: customerId as string,
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
        customer: true,
        paymentOption: true,
        bank: true,
      },
    });

    // When status is "Approved", handle bank INCREMENT and double-entry ledger
    if (effectiveStatus === 'Approved') {
      // If bankId provided: increment Bank.currentBalance by amount (cash IN)
      if (effectiveBankId) {
        const bankRecord = await tx.bank.findUnique({
          where: { id: effectiveBankId },
          select: { currentBalance: true },
        });
        const newBalance = safeFinancialAdd(bankRecord?.currentBalance ?? 0, effectiveAmount);
        await tx.bank.update({
          where: { id: effectiveBankId },
          data: { currentBalance: newBalance },
        });
      }

      // Double-entry ledger: Dr: Cash/Bank, Cr: Customer
      const cashAccountName = cashCollection.bank?.bankName || 'Cash in Hand';
      await tx.ledgerEntry.create({
        data: {
          date: transactionDate,
          account: cashAccountName,
          particulars: 'Cash Collection from customer',
          debit: effectiveAmount,
          credit: 0,
          reference: collectionCode,
          referenceType: 'CashCollection',
        },
      });
      await tx.ledgerEntry.create({
        data: {
          date: transactionDate,
          account: cashCollection.customer.name,
          particulars: 'Cash Collection from customer',
          credit: effectiveAmount,
          debit: 0,
          reference: collectionCode,
          referenceType: 'CashCollection',
        },
      });
    }

    // AuditLog with "Fin-Ledger-Transaction" module token
    await tx.auditLog.create({
      data: {
        action: 'CREATE',
        module: 'Fin-Ledger-Transaction',
        recordId: cashCollection.id,
        recordLabel: collectionCode,
        userId: user.id,
        userName: user.name,
        details: JSON.stringify({
          type: 'CashCollection',
          collectionCode,
          customerId,
          amount: effectiveAmount,
          bankId: effectiveBankId,
          chequeNo: effectiveChequeNo,
          voucherNo: effectiveVoucherNo,
          companyId: companyId || null,
          status: effectiveStatus,
        }),
      },
    });

    return cashCollection;
  });

  return result;
}
