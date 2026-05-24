import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId');

    // If no customerId provided, return summary for all customers
    if (!customerId) {
      const customers = await db.customer.findMany({
        where: { isActive: true },
        include: {
          salesOrders: { where: { isActive: true } },
          salesReturns: { where: { isActive: true } },
          cashCollections: { where: { isActive: true } },
          hireSales: { where: { isActive: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      const customerSummaries = customers.map((c) => {
        const totalSales = c.salesOrders.reduce((s, so) => s + so.grandTotal, 0);
        const totalReturns = c.salesReturns.reduce((s, sr) => s + sr.grandTotal, 0);
        const totalCollections = c.cashCollections.reduce((s, cc) => s + cc.amount, 0);
        const totalHire = c.hireSales.reduce((s, hs) => s + hs.grandTotal, 0);
        const totalRevenue = totalSales + totalHire;
        const balance = c.openingBalance + totalRevenue - totalReturns - totalCollections;
        const lastOrderDate = c.salesOrders.length > 0
          ? c.salesOrders.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].date
          : null;

        return {
          id: c.id,
          customerCode: c.customerCode,
          name: c.name,
          phone: c.phone,
          address: c.address,
          openingBalance: c.openingBalance,
          totalOrders: c.salesOrders.length + c.hireSales.length,
          totalRevenue,
          totalReturns,
          totalCollections,
          lastOrderDate,
          balance,
        };
      });

      const totalCustomers = customers.length;
      const totalRevenue = customerSummaries.reduce((s, c) => s + c.totalRevenue, 0);
      const totalOutstanding = customerSummaries.reduce((s, c) => s + Math.max(c.balance, 0), 0);
      const avgOrderValue = customerSummaries.reduce((s, c) => s + c.totalOrders, 0) > 0
        ? Math.round(totalRevenue / customerSummaries.reduce((s, c) => s + c.totalOrders, 0))
        : 0;

      return NextResponse.json({
        customers: customerSummaries,
        summary: {
          totalCustomers,
          totalRevenue,
          avgOrderValue,
          totalOutstanding,
        },
      });
    }

    // Single customer detailed ledger
    const customer = await db.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      );
    }

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

    const ledger: { date: Date; type: string; reference: string; debit: number; credit: number; balance: number; details?: Record<string, unknown> }[] = [];

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

    ledger.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let balance = customer.openingBalance;
    for (const entry of ledger) {
      if (entry.type === 'Opening Balance') {
        entry.balance = balance;
      } else {
        balance += entry.debit - entry.credit;
        entry.balance = balance;
      }
    }

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
