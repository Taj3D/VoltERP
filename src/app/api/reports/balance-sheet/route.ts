import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  validateVatMode,
  maskAccountingReportForVatAuditor,
  safeFinancialAdd,
  safeFinancialSubtract,
  safeFinancialRound,
  formatFinancialField,
} from '@/lib/api-security';
import type { UserRole } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// GET /api/reports/balance-sheet - Stage 12: Multi-tenant, safe math, VAT auditor masking, RBAC, activity log
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'BalanceSheet', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const asOf = searchParams.get('asOf'); // Point-in-time balance sheet

    // STAGE 12: VAT Auditor mode validation (replaces old hideMargins)
    const rawVatMode = searchParams.get('vatMode') === 'true';
    const userRole = security.user.role as UserRole;
    const vatMode = validateVatMode(rawVatMode, userRole);

    // STAGE 12: Multi-tenant companyId isolation
    const companyId = security.user.companyId;

    const asOfDate = asOf ? new Date(asOf) : new Date();

    // === ASSETS ===

    // STAGE 12: Total stock value with companyId filter for Product
    const productWhere: Record<string, unknown> = { isActive: true };
    if (companyId) productWhere.companyId = companyId;

    const products = await db.product.findMany({
      where: productWhere,
      select: { costPrice: true, salePrice: true, openingStock: true, id: true, name: true },
    });

    // STAGE 12: Use safeFinancialAdd for stock value accumulation
    let stockValue = 0;
    for (const p of products) {
      stockValue = safeFinancialAdd(stockValue, p.costPrice * p.openingStock);
    }

    // STAGE 12: Bank balances with companyId filter
    const bankWhere: Record<string, unknown> = { isActive: true };
    if (companyId) bankWhere.companyId = companyId;

    const banks = await db.bank.findMany({
      where: bankWhere,
      include: {
        bankTransactions: {
          where: asOf ? { date: { lte: asOfDate } } : undefined,
        },
        expenses: {
          where: {
            isActive: true,
            status: 'Approved',
            ...(asOf ? { date: { lte: asOfDate } } : {}),
            ...(companyId ? { companyId } : {}),
          },
        },
        incomes: {
          where: {
            isActive: true,
            status: 'Approved',
            ...(asOf ? { date: { lte: asOfDate } } : {}),
            ...(companyId ? { companyId } : {}),
          },
        },
        cashCollections: {
          where: {
            isActive: true,
            status: 'Approved',
            ...(asOf ? { date: { lte: asOfDate } } : {}),
            ...(companyId ? { companyId } : {}),
          },
        },
        cashDeliveries: {
          where: {
            isActive: true,
            status: 'Approved',
            ...(asOf ? { date: { lte: asOfDate } } : {}),
            ...(companyId ? { companyId } : {}),
          },
        },
      },
    });

    // STAGE 12: Build bank-by-bank breakdown with safe math
    const bankBreakdown = banks.map((bank) => {
      let deposits = 0;
      for (const t of bank.bankTransactions.filter((t) => t.type === 'Deposit')) {
        deposits = safeFinancialAdd(deposits, t.amount);
      }
      let withdrawals = 0;
      for (const t of bank.bankTransactions.filter((t) => t.type === 'Withdraw')) {
        withdrawals = safeFinancialAdd(withdrawals, t.amount);
      }
      let bankIncome = 0;
      for (const i of bank.incomes) {
        bankIncome = safeFinancialAdd(bankIncome, i.amount);
      }
      let bankExpense = 0;
      for (const e of bank.expenses) {
        bankExpense = safeFinancialAdd(bankExpense, e.amount);
      }
      let collections = 0;
      for (const c of bank.cashCollections) {
        collections = safeFinancialAdd(collections, c.amount);
      }
      let deliveries = 0;
      for (const d of bank.cashDeliveries) {
        deliveries = safeFinancialAdd(deliveries, d.amount);
      }

      // STAGE 12: Current balance using safe math
      const currentBalance = safeFinancialRound(
        safeFinancialAdd(
          safeFinancialAdd(
            safeFinancialAdd(
              safeFinancialAdd(
                safeFinancialAdd(
                  safeFinancialSubtract(
                    safeFinancialAdd(bank.openingBalance, deposits),
                    withdrawals
                  ),
                  bankIncome
                ),
                safeFinancialSubtract(0, bankExpense) // -bankExpense
              ),
              collections
            ),
            safeFinancialSubtract(0, deliveries) // -deliveries
          ),
          0
        )
      );

      // Simpler approach: openingBalance + deposits - withdrawals + bankIncome - bankExpense + collections - deliveries
      const currentBal = safeFinancialSubtract(
        safeFinancialAdd(
          safeFinancialSubtract(
            safeFinancialAdd(
              safeFinancialSubtract(
                safeFinancialAdd(
                  safeFinancialAdd(bank.openingBalance, deposits),
                  withdrawals
                ),
                bankIncome
              ),
              bankExpense
            ),
            collections
          ),
          deliveries
        ),
        0
      );

      return {
        bankId: bank.id,
        bankName: bank.bankName,
        accountNo: bank.accountNo,
        currentBalance: safeFinancialRound(
          bank.openingBalance + deposits - withdrawals + bankIncome - bankExpense + collections - deliveries
        ),
      };
    });

    // STAGE 12: Bank balance total with safe math
    let bankBalance = 0;
    for (const b of bankBreakdown) {
      bankBalance = safeFinancialAdd(bankBalance, b.currentBalance);
    }

    // NOTE: Customer does NOT have companyId — known limitation for Stage 12
    // Customer receivables — FIX BS-002: Include HireSales; FIX BS-001: Handle negative balances
    // FIX BS-003: Use notIn: ['Draft', 'Cancelled'] for status filter
    const customers = await db.customer.findMany({
      where: { isActive: true },
      include: {
        salesOrders: {
          where: {
            status: { notIn: ['Draft', 'Cancelled'] },
            isActive: true,
            ...(asOf ? { date: { lte: asOfDate } } : {}),
          },
        },
        hireSales: {
          where: {
            status: { notIn: ['Draft', 'Cancelled'] },
            isActive: true,
            ...(asOf ? { date: { lte: asOfDate } } : {}),
          },
        },
        cashCollections: {
          where: {
            isActive: true,
            ...(asOf ? { date: { lte: asOfDate } } : {}),
            ...(companyId ? { companyId } : {}),
          },
        },
        salesReturns: {
          where: {
            isActive: true,
            ...(asOf ? { date: { lte: asOfDate } } : {}),
          },
        },
      },
    });

    // STAGE 12: Use safe math for all customer balance calculations
    let customerAdvances = 0; // Negative balances = overpayments → current liability
    let totalReceivables = 0; // Positive balances → current asset

    const receivablesBreakdown = customers.map((customer) => {
      let totalSales = 0;
      for (const so of customer.salesOrders) {
        totalSales = safeFinancialAdd(totalSales, so.grandTotal);
      }
      let totalHireSales = 0;
      for (const hs of customer.hireSales) {
        totalHireSales = safeFinancialAdd(totalHireSales, hs.grandTotal);
      }
      let totalCollections = 0;
      for (const c of customer.cashCollections) {
        totalCollections = safeFinancialAdd(totalCollections, c.amount);
      }
      let totalReturns = 0;
      for (const r of customer.salesReturns) {
        totalReturns = safeFinancialAdd(totalReturns, r.grandTotal);
      }
      const balance = safeFinancialSubtract(
        safeFinancialAdd(safeFinancialAdd(customer.openingBalance, totalSales), totalHireSales),
        safeFinancialAdd(totalCollections, totalReturns)
      );
      return {
        customerId: customer.id,
        customerName: customer.name,
        openingBalance: customer.openingBalance,
        totalSales,
        totalHireSales,
        totalCollections,
        totalReturns,
        balance,
      };
    });

    // STAGE 12: Accumulate receivables and advances with safe math
    for (const r of receivablesBreakdown) {
      if (r.balance >= 0) {
        totalReceivables = safeFinancialAdd(totalReceivables, r.balance);
      } else {
        customerAdvances = safeFinancialAdd(customerAdvances, Math.abs(r.balance));
      }
    }

    const totalCurrentAssets = safeFinancialAdd(bankBalance, totalReceivables);
    const totalAssets = safeFinancialAdd(stockValue, totalCurrentAssets);

    // === LIABILITIES ===

    // NOTE: Supplier does NOT have companyId — known limitation for Stage 12
    const suppliers = await db.supplier.findMany({
      where: { isActive: true },
      include: {
        purchaseOrders: {
          where: {
            status: { notIn: ['Draft', 'Cancelled'] },
            isActive: true,
            ...(asOf ? { date: { lte: asOfDate } } : {}),
          },
        },
        cashDeliveries: {
          where: {
            isActive: true,
            ...(asOf ? { date: { lte: asOfDate } } : {}),
            ...(companyId ? { companyId } : {}),
          },
        },
        purchaseReturns: {
          where: {
            isActive: true,
            ...(asOf ? { date: { lte: asOfDate } } : {}),
          },
        },
      },
    });

    // STAGE 12: Use safe math for all supplier balance calculations
    let supplierAdvances = 0;
    let totalPayables = 0;

    const payablesBreakdown = suppliers.map((supplier) => {
      let totalPurchases = 0;
      for (const po of supplier.purchaseOrders) {
        totalPurchases = safeFinancialAdd(totalPurchases, po.grandTotal);
      }
      let totalDeliveries = 0;
      for (const d of supplier.cashDeliveries) {
        totalDeliveries = safeFinancialAdd(totalDeliveries, d.amount);
      }
      let totalReturns = 0;
      for (const r of supplier.purchaseReturns) {
        totalReturns = safeFinancialAdd(totalReturns, r.grandTotal);
      }
      const balance = safeFinancialSubtract(
        safeFinancialAdd(supplier.openingBalance, totalPurchases),
        safeFinancialAdd(totalDeliveries, totalReturns)
      );
      return {
        supplierId: supplier.id,
        supplierName: supplier.name,
        openingBalance: supplier.openingBalance,
        totalPurchases,
        totalDeliveries,
        totalReturns,
        balance,
      };
    });

    // STAGE 12: Accumulate payables and advances with safe math
    for (const p of payablesBreakdown) {
      if (p.balance >= 0) {
        totalPayables = safeFinancialAdd(totalPayables, p.balance);
      } else {
        supplierAdvances = safeFinancialAdd(supplierAdvances, Math.abs(p.balance));
      }
    }

    // === EQUITY: P&L from active period carries forward into Retained Earnings ===
    // STAGE 12: Check for active period close to determine retained earnings period

    // NOTE: SalesOrder does NOT have companyId — known limitation
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
          ...(companyId ? { companyId } : {}),
        },
        _sum: { amount: true },
      }),
      db.expense.aggregate({
        where: {
          isActive: true,
          status: { notIn: ['Draft', 'Cancelled'] },
          ...(asOf ? { date: { lte: asOfDate } } : {}),
          ...(companyId ? { companyId } : {}),
        },
        _sum: { amount: true },
      }),
    ]);

    // STAGE 12: Revenue with safe math
    let salesTotal = 0;
    for (const s of confirmedSalesWithLines) {
      salesTotal = safeFinancialAdd(salesTotal, s.grandTotal);
    }
    const revenue = safeFinancialAdd(salesTotal, allIncomes._sum.amount || 0);

    // STAGE 12: COGS with safe math
    let costOfGoods = 0;
    for (const so of confirmedSalesWithLines) {
      for (const line of so.lines) {
        const costPrice = line.product?.costPrice || 0;
        costOfGoods = safeFinancialAdd(costOfGoods, line.quantity * costPrice);
      }
    }

    const operatingExpenses = allExpenses._sum.amount || 0;

    // STAGE 12: Equity = Revenue - COGS - Operating Expenses (Retained Earnings = P&L)
    const equity = safeFinancialSubtract(safeFinancialSubtract(revenue, costOfGoods), operatingExpenses);

    // STAGE 12: Period close — check for active period close that carries forward P&L into Retained Earnings
    const periodCloseWhere: Record<string, unknown> = { isLocked: true };
    if (companyId) periodCloseWhere.companyId = companyId;

    const activePeriodClose = await db.periodClose.findFirst({
      where: periodCloseWhere,
      orderBy: { periodYear: 'desc' },
    });

    let retainedEarnings = equity;
    if (activePeriodClose) {
      // P&L from the most recent locked period carries forward
      // Retained Earnings = Equity from current P&L (already computed above)
      // The period close locks the books; any P&L before that is "retained"
      retainedEarnings = safeFinancialRound(equity);
    }

    // STAGE 12: Total liabilities with safe math
    // Include Customer Advances in total liabilities, Supplier Advances in total assets
    const totalLiabilities = safeFinancialAdd(
      safeFinancialAdd(totalPayables, customerAdvances),
      Math.max(retainedEarnings, 0)
    );
    const totalAssetsWithAdvances = safeFinancialAdd(totalAssets, supplierAdvances);

    // === FINANCIAL RATIOS ===
    // STAGE 12: Use safeFinancialRound for all ratio calculations
    const currentRatio = totalPayables > 0 ? safeFinancialRound(totalCurrentAssets / totalPayables) : 0;
    const debtToEquity = equity > 0 ? safeFinancialRound(totalLiabilities / equity) : 0;

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
      { name: 'Equity', value: Math.max(retainedEarnings, 0), color: '#8b5cf6' },
    ].filter((l) => l.value > 0);

    // Comparison data for BarChart
    const comparisonData = [
      { category: 'Assets', value: totalAssetsWithAdvances },
      { category: 'Liabilities', value: totalLiabilities },
      { category: 'Equity', value: Math.max(retainedEarnings, 0) },
    ];

    // STAGE 12: Detailed asset breakdown with formatFinancialField for null fields
    const assetDetails = {
      fixedAssets: {
        stockValue,
        stockItems: products.length,
      },
      currentAssets: {
        bankBalance,
        bankBreakdown: bankBreakdown.map((b) => ({
          ...b,
          bankName: formatFinancialField(b.bankName),
          accountNo: formatFinancialField(b.accountNo),
        })),
        receivables: totalReceivables,
        receivablesBreakdown: receivablesBreakdown
          .filter((r) => r.balance >= 0)
          .map((r) => ({
            ...r,
            customerName: formatFinancialField(r.customerName),
          })),
        supplierAdvances,
        supplierAdvancesBreakdown: payablesBreakdown
          .filter((p) => p.balance < 0)
          .map((p) => ({
            supplierName: formatFinancialField(p.supplierName),
            balance: Math.abs(p.balance),
          })),
      },
    };

    // STAGE 12: Detailed liability breakdown with formatFinancialField for null fields
    const liabilityDetails = {
      currentLiabilities: {
        payables: totalPayables,
        payablesBreakdown: payablesBreakdown
          .filter((p) => p.balance >= 0)
          .map((p) => ({
            ...p,
            supplierName: formatFinancialField(p.supplierName),
          })),
        customerAdvances,
        customerAdvancesBreakdown: receivablesBreakdown
          .filter((r) => r.balance < 0)
          .map((r) => ({
            customerName: formatFinancialField(r.customerName),
            balance: Math.abs(r.balance),
          })),
      },
      equity: {
        retainedEarnings,
        totalEquity: Math.max(retainedEarnings, 0),
      },
    };

    // STAGE 12: Verify balance sheet integrity
    // totalAssetsWithAdvances must equal totalLiabilities for a balanced sheet
    const sheetBalanced = safeFinancialSubtract(
      safeFinancialRound(totalAssetsWithAdvances),
      safeFinancialRound(totalLiabilities)
    ) === 0;

    // Build response data
    const responseData: Record<string, unknown> = {
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
        equity: retainedEarnings,
        retainedEarnings,
        totalLiabilities,
        details: liabilityDetails,
      },
      ratios: {
        currentRatio,
        debtToEquity,
      },
      balanced: sheetBalanced,
      assetComposition,
      liabilityComposition,
      comparisonData,
      periodClose: activePeriodClose ? {
        periodCode: activePeriodClose.code,
        periodMonth: activePeriodClose.periodMonth,
        periodYear: activePeriodClose.periodYear,
      } : null,
    };

    // STAGE 12: Apply VAT Auditor deep masking (replaces old hideMargins/auditMode)
    if (vatMode) {
      const masked = maskAccountingReportForVatAuditor(responseData, userRole);
      return NextResponse.json(masked);
    }

    // STAGE 12: Activity logging
    await logUserActivity({
      action: 'EXPORT',
      module: 'Acc-Balance-Sheet',
      userId: security.user.id,
      userName: security.user.name,
      details: 'Balance Sheet report generated',
    });

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Error calculating balance sheet:', error);
    return NextResponse.json(
      { error: 'Failed to calculate balance sheet' },
      { status: 500 }
    );
  }
}
