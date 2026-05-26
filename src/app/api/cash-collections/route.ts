import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withApiSecurity, checkPeriodClose } from '@/lib/api-security';

// GET /api/cash-collections - List all cash collections with relations
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'CashCollections', 'GET');
  if (!security.authorized) return security.response;

  try {
    const items = await db.cashCollection.findMany({
      where: { isActive: true },
      include: {
        customer: true,
        paymentOption: true,
        bank: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(items);
  } catch (error) {
    console.error('Error fetching cash collections:', error);
    return NextResponse.json(
      { error: 'Failed to fetch cash collections' },
      { status: 500 }
    );
  }
}

// POST /api/cash-collections - Create cash collection with auto-code, bank + ledger + audit
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'CashCollections', 'POST');
  if (!security.authorized) return security.response;

  try {
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

    if (!customerId || !date || amount === undefined || amount === null) {
      return NextResponse.json(
        { error: 'customerId, date, and amount are required' },
        { status: 400 }
      );
    }

    // Period-close lock check
    const transactionDate = new Date(date);
    const periodLock = await checkPeriodClose(transactionDate);
    if (periodLock) return periodLock;

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

      const effectiveStatus = status || 'Approved';
      const effectiveAmount = parseFloat(amount) || 0;

      // Create the cash collection
      const cashCollection = await tx.cashCollection.create({
        data: {
          collectionCode,
          customerId,
          date: transactionDate,
          amount: effectiveAmount,
          paymentOptionId: paymentOptionId || null,
          bankId: bankId || null,
          description: description || null,
          status: effectiveStatus,
        },
        include: {
          customer: true,
          paymentOption: true,
          bank: true,
        },
      });

      // When status is "Approved", handle bank and ledger
      if (effectiveStatus === 'Approved') {
        // If bankId provided: increment Bank.currentBalance by amount
        if (bankId) {
          await tx.bank.update({
            where: { id: bankId },
            data: { currentBalance: { increment: effectiveAmount } },
          });
        }

        // Create LedgerEntry: account = customer.name, credit = amount
        await tx.ledgerEntry.create({
          data: {
            date: transactionDate,
            account: cashCollection.customer.name,
            particulars: 'Cash Collection from customer',
            credit: effectiveAmount,
            debit: 0,
            reference: collectionCode,
          },
        });
      }

      // Create AuditLog entry
      await tx.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'CashCollections',
          recordId: cashCollection.id,
          recordLabel: collectionCode,
          details: JSON.stringify({
            collectionCode,
            customerId,
            amount: effectiveAmount,
            bankId: bankId || null,
            status: effectiveStatus,
          }),
        },
      });

      return cashCollection;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating cash collection:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to create cash collection';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
