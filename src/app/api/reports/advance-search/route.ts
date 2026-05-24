import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');

    if (!q || q.trim().length === 0) {
      return NextResponse.json({
        products: [],
        customers: [],
        suppliers: [],
        employees: [],
        purchaseOrders: [],
        salesOrders: [],
      });
    }

    const searchTerm = q.trim();
    const containsFilter = { contains: searchTerm };

    // Search across multiple entities in parallel
    const [products, customers, suppliers, employees, purchaseOrders, salesOrders] = await Promise.all([
      db.product.findMany({
        where: {
          isActive: true,
          OR: [
            { name: containsFilter },
            { productCode: containsFilter },
          ],
        },
        include: { category: true, company: true, color: true, godown: true, segment: true },
        take: 20,
      }),
      db.customer.findMany({
        where: {
          isActive: true,
          OR: [
            { name: containsFilter },
            { customerCode: containsFilter },
            { phone: containsFilter },
          ],
        },
        take: 20,
      }),
      db.supplier.findMany({
        where: {
          isActive: true,
          OR: [
            { name: containsFilter },
            { supplierCode: containsFilter },
            { phone: containsFilter },
          ],
        },
        take: 20,
      }),
      db.employee.findMany({
        where: {
          isActive: true,
          OR: [
            { name: containsFilter },
            { employeeCode: containsFilter },
            { phone: containsFilter },
          ],
        },
        include: { designation: true, department: true },
        take: 20,
      }),
      db.purchaseOrder.findMany({
        where: {
          isActive: true,
          OR: [
            { poNumber: containsFilter },
            { notes: containsFilter },
          ],
        },
        include: {
          supplier: true,
          godown: true,
          lines: { include: { product: true } },
        },
        take: 20,
      }),
      db.salesOrder.findMany({
        where: {
          isActive: true,
          OR: [
            { invoiceNo: containsFilter },
            { notes: containsFilter },
          ],
        },
        include: {
          customer: true,
          godown: true,
          paymentOption: true,
          lines: { include: { product: true } },
        },
        take: 20,
      }),
    ]);

    return NextResponse.json({
      products,
      customers,
      suppliers,
      employees,
      purchaseOrders,
      salesOrders,
    });
  } catch (error) {
    console.error('Error performing advance search:', error);
    return NextResponse.json(
      { error: 'Failed to perform advance search' },
      { status: 500 }
    );
  }
}
