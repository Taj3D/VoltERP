import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

// GET /api/reports/balance-sheet - Enhanced with asOf date, financial ratios, detailed breakdown
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Reports', 'GET');
  if (!security.authorized) return security.response;
  try {
    const { searchParams } = new URL(request.url);
    const asOf = searchParams.get('asOf'); // Point-in-time balance sheet
    const hideMargins = searchParams.get('hideMargins'); // VAT Auditor mode

    const asOfDate = asOf ? new Date(asOf) : new Date();
    const auditMode = hideMargins === 'true';

    // === ASSETS ===

    // Total stock value: sum of (costPrice * openingStock) for all active products
    // Plus current stock from StockEntries
    const products = await db.product.findMany({
      where: { isActive: true },
      select: { costPrice: true, salePrice: true, openingStock: true, id: true, name: true },
    });

    const stockValue = products.reduce(
      (sum, p) => sum + p.costPrice * p.openingStock,
      0
    );

    // Bank balances: sum of all bank currentBalances
    const banks = await db.bank.findMany({
      where: { isActive: true },
      include: {
        bankTransactions: {
          where: asOf ? { date: { lte: asOfDate } } : undefined,
        },
        expenses: {
          where: asOf ? { date: { lte: asOfDate }, status: 'Approved' } : { status: 'Approved' },
        },
        incomes: {
          where: asOf ? { date: { lte: asOfDate }, status: 'Approved' } : { status: 'Approved' },
        },
        cashCollections: {
          where: asOf ? { date: { lte: asOfDate }, status: 'Approved' } : { status: 'Approved' },
        },
        cashDeliveries: {
          where: asOf ? { date: { lte: asOfDate }, status: 'Approved' } : { status: 'Approved' },
        },
      },
    });

    const bankBreakdown = banks.map((bank) => {
      const deposits = bank.bankTransactions
        .filter((t) => t.type === 'Deposit')
        .reduce((s, t) => s + t.amount, 0);
      const withdrawals = bank.bankTransactions
        .filter((t) => t.type === 'Withdraw')
        .reduce((s, t) => s + t.amount, 0);
      const bankIncome = bank.incomes.reduce((s, i) => s + i.amount, 0);
      const bankExpense = bank.expenses.reduce((s, e) => s + e.amount, 0);
      const collections = bank.cashCollections.reduce((s, c) => s + c.amount, 0);
      const deliveries = bank.cashDeliveries.reduce((s, d) => s + d.amount, 0);

      const currentBalance =
        bank.openingBalance +
        deposits -
        withdrawals +
        bankIncome -
        bankExpense +
        collections -
        deliveries;

      return {
        bankId: bank.id,
        bankName: bank.bankName,
        accountNo: bank.accountNo,
        currentBalance,
      };
    });

    const bankBalance = bankBreakdown.reduce((sum, b) => sum + b.currentBalance, 0);

    // Customer receivables — FIX BS-002: Include HireSales; FIX BS-001: Handle negative balances (overpayments)
    // FIX BS-003: Use notIn: ['Draft', 'Cancelled'] for status filter
    const customers = await db.customer.findMany({
      where: { isActive: true },
      include: {
        salesOrders: {
          where: {
            status: { notIn: ['Draft', 'Cancelled'] },
            ...(asOf ? { date: { lte: asOfDate } } : {}),
          },
        },
        hireSales: {
          where: {
            status: { notIn: ['Draft', 'Cancelled'] },
            ...(asOf ? { date: { lte: asOfDate } } : {}),
          },
        },
        cashCollections: {
          where: asOf ? { date: { lte: asOfDate } } : undefined,
        },
        salesReturns: {
          where: asOf ? { date: { lte: asOfDate } } : undefined,
        },
      },
    });

    let customerAdvances = 0; // Negative balances = overpayments → current liability
    let totalReceivables = 0; // Positive balances → current asset

    const receivablesBreakdown = customers.map((customer) => {
      const totalSales = customer.salesOrders.reduce((s, so) => s + so.grandTotal, 0);
      const totalHireSales = customer.hireSales.reduce((s, hs) => s + hs.grandTotal, 0);
      const totalCollections = customer.cashCollections.reduce((s, c) => s + c.amount, 0);
      const totalReturns = customer.salesReturns.reduce((s, r) => s + r.grandTotal, 0);
      const balance = customer.openingBalance + totalSales + totalHireSales - totalCollections - totalReturns;
      return {
        customerId: customer.id,
        customerName: customer.name,
        openingBalance: customer.openingBalance,
        totalSales,
        totalHireSales,
        totalCollections,
        totalReturns,
        balance, // Show the true balance (can be negative)
      };
    });

    for (const r of receivablesBreakdown) {
      if (r.balance >= 0) {
        totalReceivables += r.balance;
      } else {
        customerAdvances += Math.abs(r.balance);
      }
    }

    const totalCurrentAssets = bankBalance + totalReceivables;
    const totalAssets = stockValue + totalCurrentAssets;

    // === LIABILITIES ===

    // Supplier payables — FIX BS-001: Handle negative balances (supplier owes us)
    // FIX BS-003: Use notIn: ['Draft', 'Cancelled'] for status filter
    const suppliers = await db.supplier.findMany({
      where: { isActive: true },
      include: {
        purchaseOrders: {
          where: {
            status: { notIn: ['Draft', 'Cancelled'] },
            ...(asOf ? { date: { lte: asOfDate } } : {}),
          },
        },
        cashDeliveries: {
          where: asOf ? { date: { lte: asOfDate } } : undefined,
        },
        purchaseReturns: {
          where: asOf ? { date: { lte: asOfDate } } : undefined,
        },
      },
    });

    let supplierAdvances = 0; // Negative supplier balances (they owe us) → current asset
    let totalPayables = 0; // Positive balances → current liability

    const payablesBreakdown = suppliers.map((supplier) => {
      const totalPurchases = supplier.purchaseOrders.reduce((s, po) => s + po.grandTotal, 0);
      const totalDeliveries = supplier.cashDeliveries.reduce((s, d) => s + d.amount, 0);
      const totalReturns = supplier.purchaseReturns.reduce((s, r) => s + r.grandTotal, 0);
      const balance = supplier.openingBalance + totalPurchases - totalDeliveries - totalReturns;
      return {
        supplierId: supplier.id,
        supplierName: supplier.name,
        openingBalance: supplier.openingBalance,
        totalPurchases,
        totalDeliveries,
        totalReturns,
        balance, // Show the true balance (can be negative)
      };
    });

    for (const p of payablesBreakdown) {
      if (p.balance >= 0) {
        totalPayables += p.balance;
      } else {
        supplierAdvances += Math.abs(p.balance);
      }
    }

    // Equity: Net profit from P&L — FIX BS-003: Use notIn for status filters
    // COGS uses actual product costPrice from sales order lines, not purchase order totals
    const [confirmedSalesWithLines, allIncomes, allExpenses] = await Promise.all([
      db.salesOrder.findMany({
        where: {
          status: { notIn: ['Draft', 'Cancelled'] },
          isActive: true,
          ...(asOf ? { date: { lte: asOfDate } } : {}),
        },
        include: { lines: { include: { product: { select: { costPrice: true } } } } },
      }),
      db.income.aggregate({
        where: {
          isActive: true,
          status: { notIn: ['Draft', 'Cancelled'] },
          ...(asOf ? { date: { lte: asOfDate } } : {}),
        },
        _sum: { amount: true },
      }),
      db.expense.aggregate({
        where: {
          isActive: true,
          status: { notIn: ['Draft', 'Cancelled'] },
          ...(asOf ? { date: { lte: asOfDate } } : {}),
        },
        _sum: { amount: true },
      }),
    ]);

    const revenue = confirmedSalesWithLines.reduce((sum, s) => sum + s.grandTotal, 0) + (allIncomes._sum.amount || 0);
    const costOfGoods = confirmedSalesWithLines.reduce((sum, so) => {
      return sum + so.lines.reduce((lineSum, line) => {
        const costPrice = line.product?.costPrice || 0;
        return lineSum + (line.quantity * costPrice);
      }, 0);
    }, 0);
    const operatingExpenses = allExpenses._sum.amount || 0;
    const equity = revenue - costOfGoods - operatingExpenses;

    // Include Customer Advances in total liabilities, Supplier Advances in total assets
    const totalLiabilities = totalPayables + customerAdvances + Math.max(equity, 0);
    const totalAssetsWithAdvances = totalAssets + supplierAdvances;

    // === FINANCIAL RATIOS ===
    // Current Ratio = Current Assets / Current Liabilities
    const currentRatio = totalPayables > 0 ? totalCurrentAssets / totalPayables : 0;

    // Debt-to-Equity = Total Liabilities / Equity
    const debtToEquity = equity > 0 ? totalLiabilities / equity : 0;

    // Asset composition for PieChart
    const assetComposition = [
      { name: 'Stock Value', value: stockValue, color: '#3b82f6' },
      { name: 'Bank Balance', value: bankBalance, color: '#10b981' },
      { name: 'Receivables', value: totalReceivables, color: '#f59e0b' },
      ...(supplierAdvances > 0 ? [{ name: 'Supplier Advances', value: supplierAdvances, color: '#6366f1' }] : []),
    ].filter((a) => a.value > 0);

    // Liability composition for PieChart
    const liabilityComposition = [
      { name: 'Payables', value: totalPayables, color: '#ef4444' },
      ...(customerAdvances > 0 ? [{ name: 'Customer Advances', value: customerAdvances, color: '#f97316' }] : []),
      { name: 'Equity', value: Math.max(equity, 0), color: '#8b5cf6' },
    ].filter((l) => l.value > 0);

    // Comparison data for BarChart
    const comparisonData = [
      { category: 'Assets', value: totalAssetsWithAdvances },
      { category: 'Liabilities', value: totalLiabilities },
      { category: 'Equity', value: Math.max(equity, 0) },
    ];

    // Detailed asset breakdown
    const assetDetails = {
      fixedAssets: {
        stockValue,
        stockItems: products.length,
      },
      currentAssets: {
        bankBalance,
        bankBreakdown: auditMode ? bankBreakdown.map((b) => ({ bankName: b.bankName, currentBalance: b.currentBalance })) : bankBreakdown,
        receivables: totalReceivables,
        receivablesBreakdown: auditMode
          ? receivablesBreakdown.filter((r) => r.balance >= 0).map((r) => ({ customerName: r.customerName, balance: r.balance }))
          : receivablesBreakdown.filter((r) => r.balance >= 0),
        supplierAdvances,
        supplierAdvancesBreakdown: auditMode
          ? payablesBreakdown.filter((p) => p.balance < 0).map((p) => ({ supplierName: p.supplierName, balance: Math.abs(p.balance) }))
          : payablesBreakdown.filter((p) => p.balance < 0).map((p) => ({ ...p, balance: Math.abs(p.balance) })),
      },
    };

    // Detailed liability breakdown
    const liabilityDetails = {
      currentLiabilities: {
        payables: totalPayables,
        payablesBreakdown: auditMode
          ? payablesBreakdown.filter((p) => p.balance >= 0).map((p) => ({ supplierName: p.supplierName, balance: p.balance }))
          : payablesBreakdown.filter((p) => p.balance >= 0),
        customerAdvances,
        customerAdvancesBreakdown: auditMode
          ? receivablesBreakdown.filter((r) => r.balance < 0).map((r) => ({ customerName: r.customerName, balance: Math.abs(r.balance) }))
          : receivablesBreakdown.filter((r) => r.balance < 0).map((r) => ({ ...r, balance: Math.abs(r.balance) })),
      },
      equity: {
        retainedEarnings: auditMode ? 'N/A (Audit Mode)' : equity,
        totalEquity: auditMode ? 'N/A (Audit Mode)' : Math.max(equity, 0),
      },
    };

    return NextResponse.json({
      asOf: asOfDate.toISOString(),
      assets: {
        stock: stockValue,
        bankBalance,
        receivables: totalReceivables,
        supplierAdvances,
        totalAssets: totalAssetsWithAdvances,
        details: assetDetails,
      },
      liabilities: {
        payables: totalPayables,
        customerAdvances,
        equity: auditMode ? 'N/A (Audit Mode)' : equity,
        totalLiabilities: auditMode ? 'N/A (Audit Mode)' : totalLiabilities,
        details: liabilityDetails,
      },
      ratios: {
        currentRatio: parseFloat(currentRatio.toFixed(2)),
        debtToEquity: parseFloat(debtToEquity.toFixed(2)),
      },
      balanced: Math.abs(totalAssetsWithAdvances - totalLiabilities) < 0.01,
      assetComposition,
      liabilityComposition,
      comparisonData,
      auditMode,
    });
  } catch (error) {
    console.error('Error calculating balance sheet:', error);
    return NextResponse.json(
      { error: 'Failed to calculate balance sheet' },
      { status: 500 }
    );
  }
}
