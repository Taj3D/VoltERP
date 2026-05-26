import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Reports', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { searchParams } = new URL(request.url);
    const bankId = searchParams.get('bankId');

    if (!bankId) {
      return NextResponse.json(
        { error: 'bankId query parameter is required' },
        { status: 400 }
      );
    }

    const bank = await db.bank.findUnique({
      where: { id: bankId },
    });

    if (!bank) {
      return NextResponse.json(
        { error: 'Bank not found' },
        { status: 404 }
      );
    }

    // Fetch all transactions for this bank
    const [bankTransactions, expenses, incomes, cashCollections, cashDeliveries] =
      await Promise.all([
        db.bankTransaction.findMany({
          where: { bankId, isActive: true },
          orderBy: { date: 'asc' },
        }),
        db.expense.findMany({
          where: { bankId, isActive: true },
          include: { head: true, paymentOption: true },
          orderBy: { date: 'asc' },
        }),
        db.income.findMany({
          where: { bankId, isActive: true },
          include: { head: true, paymentOption: true },
          orderBy: { date: 'asc' },
        }),
        db.cashCollection.findMany({
          where: { bankId, isActive: true },
          include: { customer: true, paymentOption: true },
          orderBy: { date: 'asc' },
        }),
        db.cashDelivery.findMany({
          where: { bankId, isActive: true },
          include: { supplier: true, paymentOption: true },
          orderBy: { date: 'asc' },
        }),
      ]);

    // Build a unified transaction list
    const allTransactions: { date: Date; type: string; category: string; reference: string; debit: number; credit: number; description: string | null; balance?: number; paymentOption?: string | null; customer?: string | null; supplier?: string | null }[] = [];

    // Bank deposits/withdrawals
    for (const bt of bankTransactions) {
      allTransactions.push({
        date: bt.date,
        type: bt.type, // "Deposit" or "Withdraw"
        category: 'Bank Transaction',
        reference: bt.id,
        debit: bt.type === 'Withdraw' ? bt.amount : 0,
        credit: bt.type === 'Deposit' ? bt.amount : 0,
        description: bt.description,
      });
    }

    // Incomes (credits)
    for (const inc of incomes) {
      allTransactions.push({
        date: inc.date,
        type: 'Income',
        category: inc.head?.name || 'Income',
        reference: inc.id,
        debit: 0,
        credit: inc.amount,
        description: inc.description,
        paymentOption: inc.paymentOption?.name || null,
      });
    }

    // Expenses (debits)
    for (const exp of expenses) {
      allTransactions.push({
        date: exp.date,
        type: 'Expense',
        category: exp.head?.name || 'Expense',
        reference: exp.id,
        debit: exp.amount,
        credit: 0,
        description: exp.description,
        paymentOption: exp.paymentOption?.name || null,
      });
    }

    // Cash collections from customers (credits)
    for (const cc of cashCollections) {
      allTransactions.push({
        date: cc.date,
        type: 'Cash Collection',
        category: 'Collection',
        reference: cc.id,
        debit: 0,
        credit: cc.amount,
        description: cc.description || `Collection from ${cc.customer?.name || 'Customer'}`,
        customer: cc.customer?.name || null,
        paymentOption: cc.paymentOption?.name || null,
      });
    }

    // Cash deliveries to suppliers (debits)
    for (const cd of cashDeliveries) {
      allTransactions.push({
        date: cd.date,
        type: 'Cash Delivery',
        category: 'Delivery',
        reference: cd.id,
        debit: cd.amount,
        credit: 0,
        description: cd.description || `Payment to ${cd.supplier?.name || 'Supplier'}`,
        supplier: cd.supplier?.name || null,
        paymentOption: cd.paymentOption?.name || null,
      });
    }

    // Sort by date
    allTransactions.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Calculate running balance
    let runningBalance = bank.openingBalance;
    for (const txn of allTransactions) {
      runningBalance += txn.credit - txn.debit;
      txn.balance = runningBalance;
    }

    // Summary
    const totalDeposits = bankTransactions
      .filter((t) => t.type === 'Deposit')
      .reduce((s, t) => s + t.amount, 0);
    const totalWithdrawals = bankTransactions
      .filter((t) => t.type === 'Withdraw')
      .reduce((s, t) => s + t.amount, 0);
    const totalIncome = incomes.reduce((s, i) => s + i.amount, 0);
    const totalExpense = expenses.reduce((s, e) => s + e.amount, 0);
    const totalCollections = cashCollections.reduce((s, c) => s + c.amount, 0);
    const totalDeliveries = cashDeliveries.reduce((s, d) => s + d.amount, 0);

    const currentBalance =
      bank.openingBalance +
      totalDeposits -
      totalWithdrawals +
      totalIncome -
      totalExpense +
      totalCollections -
      totalDeliveries;

    return NextResponse.json({
      bank: {
        id: bank.id,
        bankName: bank.bankName,
        branch: bank.branch,
        accountNo: bank.accountNo,
        accountHolder: bank.accountHolder,
        openingBalance: bank.openingBalance,
      },
      transactions: allTransactions,
      summary: {
        openingBalance: bank.openingBalance,
        totalDeposits,
        totalWithdrawals,
        totalIncome,
        totalExpense,
        totalCollections,
        totalDeliveries,
        currentBalance,
      },
    });
  } catch (error) {
    console.error('Error fetching bank report:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bank report' },
      { status: 500 }
    );
  }
}
