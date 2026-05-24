import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId');

    if (!customerId) {
      return NextResponse.json(
        { error: 'customerId query parameter is required' },
        { status: 400 }
      );
    }

    const customer = await db.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      );
    }

    // Fetch all related data for the customer ledger
    const [salesOrders, salesReturns, cashCollections] = await Promise.all([
      db.salesOrder.findMany({
        where: { customerId, isActive: true },
        include: {
          lines: { include: { product: true } },
          paymentOption: true,
        },
        orderBy: { date: 'asc' },
      }),
      db.salesReturn.findMany({
        where: { customerId, isActive: true },
        include: {
          lines: { include: { product: true } },
        },
        orderBy: { date: 'asc' },
      }),
      db.cashCollection.findMany({
        where: { customerId, isActive: true },
        include: { paymentOption: true, bank: true },
        orderBy: { date: 'asc' },
      }),
    ]);

    // Build a combined ledger with all transactions
    const ledger: { date: Date; type: string; reference: string; debit: number; credit: number; balance: number; details?: Record<string, unknown> }[] = [];

    // Opening balance entry
    if (customer.openingBalance > 0) {
      ledger.push({
        date: customer.createdAt,
        type: 'Opening Balance',
        reference: '-',
        debit: customer.openingBalance,
        credit: 0,
        balance: customer.openingBalance,
      });
    }

    let runningBalance = customer.openingBalance;

    // Sales (debits - increase customer balance)
    for (const so of salesOrders) {
      runningBalance += so.grandTotal;
      ledger.push({
        date: so.date,
        type: 'Sale',
        reference: so.invoiceNo,
        debit: so.grandTotal,
        credit: 0,
        balance: runningBalance,
        details: {
          id: so.id,
          status: so.status,
          itemCount: so.lines.length,
          paymentOption: so.paymentOption?.name || null,
        },
      });
    }

    // Sales returns (credits - decrease customer balance)
    for (const sr of salesReturns) {
      runningBalance -= sr.grandTotal;
      ledger.push({
        date: sr.date,
        type: 'Sales Return',
        reference: sr.returnNo,
        debit: 0,
        credit: sr.grandTotal,
        balance: runningBalance,
        details: {
          id: sr.id,
          reason: sr.reason,
          itemCount: sr.lines.length,
        },
      });
    }

    // Cash collections (credits - decrease customer balance)
    for (const cc of cashCollections) {
      runningBalance -= cc.amount;
      ledger.push({
        date: cc.date,
        type: 'Collection',
        reference: cc.id,
        debit: 0,
        credit: cc.amount,
        balance: runningBalance,
        details: {
          id: cc.id,
          paymentOption: cc.paymentOption?.name || null,
          bank: cc.bank?.bankName || null,
          description: cc.description,
        },
      });
    }

    // Sort ledger by date
    ledger.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Recalculate running balance after sorting
    let balance = customer.openingBalance;
    for (const entry of ledger) {
      if (entry.type === 'Opening Balance') {
        entry.balance = balance;
      } else {
        balance += entry.debit - entry.credit;
        entry.balance = balance;
      }
    }

    // Summary
    const totalSales = salesOrders.reduce((sum, so) => sum + so.grandTotal, 0);
    const totalReturns = salesReturns.reduce((sum, sr) => sum + sr.grandTotal, 0);
    const totalCollections = cashCollections.reduce((sum, cc) => sum + cc.amount, 0);
    const currentBalance = customer.openingBalance + totalSales - totalReturns - totalCollections;

    return NextResponse.json({
      customer: {
        id: customer.id,
        code: customer.customerCode,
        name: customer.name,
        phone: customer.phone,
        address: customer.address,
        openingBalance: customer.openingBalance,
      },
      ledger,
      summary: {
        openingBalance: customer.openingBalance,
        totalSales,
        totalReturns,
        totalCollections,
        currentBalance,
      },
    });
  } catch (error) {
    console.error('Error fetching customer-wise report:', error);
    return NextResponse.json(
      { error: 'Failed to fetch customer-wise report' },
      { status: 500 }
    );
  }
}
