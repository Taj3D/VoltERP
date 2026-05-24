import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const [
      totalProducts, totalCategories, totalCustomers, totalSuppliers,
      todaySales, todayPurchase, totalExpenses, totalIncome
    ] = await Promise.all([
      db.product.count({ where: { isActive: true } }),
      db.category.count({ where: { isActive: true } }),
      db.customer.count({ where: { isActive: true } }),
      db.supplier.count({ where: { isActive: true } }),
      db.salesOrder.aggregate({ where: { status: "Confirmed" }, _sum: { grandTotal: true } }),
      db.purchaseOrder.aggregate({ where: { status: "Confirmed" }, _sum: { grandTotal: true } }),
      db.expense.aggregate({ _sum: { amount: true } }),
      db.income.aggregate({ _sum: { amount: true } }),
    ]);

    const stockValue = await db.product.aggregate({ where: { isActive: true }, _sum: { costPrice: true, openingStock: true } });
    const bankBalance = await db.bank.aggregate({ _sum: { openingBalance: true } });
    const pendingPO = await db.purchaseOrder.count({ where: { status: "Draft" } });
    const pendingSO = await db.salesOrder.count({ where: { status: "Draft" } });

    return NextResponse.json({
      totalProducts,
      totalCategories,
      totalCustomers,
      totalSuppliers,
      todaySales: todaySales._sum.grandTotal || 0,
      todayPurchase: todayPurchase._sum.grandTotal || 0,
      stockValue: (stockValue._sum.costPrice || 0) * (stockValue._sum.openingStock || 1),
      cashBalance: bankBalance._sum.openingBalance || 0,
      pendingPO,
      pendingSO,
      totalExpenses: totalExpenses._sum.amount || 0,
      totalIncome: totalIncome._sum.amount || 0,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 });
  }
}
