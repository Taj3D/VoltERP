import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity, checkPeriodClose } from '@/lib/api-security';

// GET /api/cash-deliveries - List all cash deliveries with relations
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'CashDeliveries', 'GET');
  if (!security.authorized) return security.response;

  try {
    const items = await db.cashDelivery.findMany({
      where: { isActive: true },
      include: {
        supplier: true,
        paymentOption: true,
        bank: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(items);
  } catch (error) {
    console.error('Error fetching cash deliveries:', error);
    return NextResponse.json(
      { error: 'Failed to fetch cash deliveries' },
      { status: 500 }
    );
  }
}

// POST /api/cash-deliveries - Create cash delivery with auto-code, bank decrement + validation, ledger + audit
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'CashDeliveries', 'POST');
  if (!security.authorized) return security.response;

  try {
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

    if (!supplierId || !date || amount === undefined || amount === null) {
      return NextResponse.json(
        { error: 'supplierId, date, and amount are required' },
        { status: 400 }
      );
    }

    // Period-close lock check
    const transactionDate = new Date(date);
    const periodLock = await checkPeriodClose(transactionDate);
    if (periodLock) return periodLock;

    const effectiveAmount = parseFloat(amount) || 0;
    const effectiveStatus = status || 'Approved';

    // Pre-transaction validation: check bank balance if bankId provided and status is Approved
    if (effectiveStatus === 'Approved' && bankId) {
      const bank = await db.bank.findUnique({
        where: { id: bankId },
        select: { currentBalance: true, bankName: true },
      });

      if (!bank) {
        return NextResponse.json(
          { error: `Bank with id ${bankId} not found` },
          { status: 400 }
        );
      }

      if (bank.currentBalance < effectiveAmount) {
        return NextResponse.json(
          {
            error: `Insufficient bank balance. ${bank.bankName} has ৳${bank.currentBalance} but delivery amount is ৳${effectiveAmount}`,
          },
          { status: 400 }
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
          supplierId,
          date: transactionDate,
          amount: effectiveAmount,
          paymentOptionId: paymentOptionId || null,
          bankId: bankId || null,
          description: description || null,
          status: effectiveStatus,
        },
        include: {
          supplier: true,
          paymentOption: true,
          bank: true,
        },
      });

      // When status is "Approved", handle bank and ledger
      if (effectiveStatus === 'Approved') {
        // If bankId provided: decrement Bank.currentBalance by amount
        if (bankId) {
          // Re-validate inside transaction for consistency
          const currentBank = await tx.bank.findUnique({
            where: { id: bankId },
            select: { currentBalance: true },
          });

          if (!currentBank || currentBank.currentBalance < effectiveAmount) {
            throw new Error(
              `Insufficient bank balance. Bank has ৳${currentBank?.currentBalance ?? 0} but delivery amount is ৳${effectiveAmount}`
            );
          }

          await tx.bank.update({
            where: { id: bankId },
            data: { currentBalance: { decrement: effectiveAmount } },
          });
        }

        // Create LedgerEntry: account = supplier.name, debit = amount
        await tx.ledgerEntry.create({
          data: {
            date: transactionDate,
            account: cashDelivery.supplier.name,
            particulars: 'Cash Delivery to supplier',
            debit: effectiveAmount,
            credit: 0,
            reference: deliveryCode,
          },
        });
      }

      // Create AuditLog entry
      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'CashDeliveries',
          recordId: cashDelivery.id,
          recordLabel: deliveryCode,
          details: JSON.stringify({
            deliveryCode,
            supplierId,
            amount: effectiveAmount,
            bankId: bankId || null,
            status: effectiveStatus,
          }),
        },
      });

      return cashDelivery;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating cash delivery:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to create cash delivery';
    // Return 400 for validation errors (insufficient balance), 500 for others
    const statusCode = message.includes('Insufficient') ? 400 : 500;
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}
