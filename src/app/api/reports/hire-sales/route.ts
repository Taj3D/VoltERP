import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const hireSales = await db.hireSales.findMany({
      where: { isActive: true },
      include: {
        customer: true,
        godown: true,
        lines: {
          include: {
            product: true,
          },
        },
      },
      orderBy: { date: 'desc' },
    });

    // Get cash collections related to hire sales customers for outstanding calculation
    const hireCustomerIds = [...new Set(hireSales.map((hs) => hs.customerId))];
    const customerCollections = await db.cashCollection.findMany({
      where: {
        customerId: { in: hireCustomerIds },
      },
    });

    // Build a map of total collections per customer
    const collectionsByCustomer = new Map<string, number>();
    for (const cc of customerCollections) {
      collectionsByCustomer.set(
        cc.customerId,
        (collectionsByCustomer.get(cc.customerId) || 0) + cc.amount
      );
    }

    // Build hire sales totals per customer
    const hireSalesByCustomer = new Map<string, number>();
    for (const hs of hireSales) {
      hireSalesByCustomer.set(
        hs.customerId,
        (hireSalesByCustomer.get(hs.customerId) || 0) + hs.grandTotal
      );
    }

    const hireSalesWithStatus = hireSales.map((hs) => {
      const isActive = hs.status === 'Active' && !hs.returnDate;
      const customerTotalHire = hireSalesByCustomer.get(hs.customerId) || 0;
      const customerTotalCollections = collectionsByCustomer.get(hs.customerId) || 0;
      const customerOutstanding = Math.max(
        hs.customer.openingBalance + customerTotalHire - customerTotalCollections,
        0
      );

      return {
        id: hs.id,
        invoiceNo: hs.invoiceNo,
        date: hs.date,
        customer: hs.customer,
        godown: hs.godown,
        hireRate: hs.hireRate,
        duration: hs.duration,
        returnDate: hs.returnDate,
        grandTotal: hs.grandTotal,
        status: hs.status,
        currentStatus: isActive ? 'Active' : 'Returned',
        lines: hs.lines,
        outstandingAmount: customerOutstanding,
      };
    });

    // Summary
    const totalHireValue = hireSales.reduce((sum, hs) => sum + hs.grandTotal, 0);
    const activeCount = hireSalesWithStatus.filter((hs) => hs.currentStatus === 'Active').length;
    const returnedCount = hireSalesWithStatus.filter((hs) => hs.currentStatus === 'Returned').length;
    const totalOutstanding = hireSalesWithStatus.reduce(
      (sum, hs) => sum + hs.outstandingAmount,
      0
    );

    return NextResponse.json({
      hireSales: hireSalesWithStatus,
      summary: {
        totalHireSales: hireSales.length,
        activeCount,
        returnedCount,
        totalHireValue,
        totalOutstanding,
      },
    });
  } catch (error) {
    console.error('Error fetching hire sales report:', error);
    return NextResponse.json(
      { error: 'Failed to fetch hire sales report' },
      { status: 500 }
    );
  }
}
