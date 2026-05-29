// ============================================================
// DATA INTEGRITY API — Audit & Integrity Checks
// Group 5: Financial Auditing, Automated Ledgers & Data Integrity
// STAGE 13: Full multi-tenant companyId isolation, safe financial
// arithmetic, logUserActivity with Audit-Integrity-Sentinel module
// token, VAT Auditor masking on discrepancy/expectedValue/actualValue,
// RBAC enforcement.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  safeFinancialAdd,
  safeFinancialSubtract,
  safeFinancialRound,
  maskForVatAuditor,
  type UserRole,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';
import { db } from '@/lib/db';
import { verifyLedgerBalance } from '@/lib/accounting-utils';

// Inline code generator for DataIntegrityLog
async function generateCode(model: string, prefix: string): Promise<string> {
  const latest = await (db as Record<string, { findFirst: (args: Record<string, unknown>) => Promise<{ code: string } | null> }>)[model].findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: 'desc' },
    select: { code: true },
  });
  if (!latest) return `${prefix}00001`;
  const num = parseInt(latest.code.replace(prefix, ''), 10) || 0;
  return `${prefix}${String(num + 1).padStart(5, '0')}`;
}

// GET /api/data-integrity — List integrity logs with filters
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'DataIntegrityLog', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const userRole = security.user.role as UserRole;
    const companyId = security.user.companyId;

    // SR and Dealer blocked via MODULE_DENY (enforced by withApiSecurity)
    // Additional explicit check for safety
    if (userRole === 'sr' || userRole === 'dealer') {
      return NextResponse.json(
        { error: 'Access denied. SR and Dealer roles cannot access data integrity logs.' },
        { status: 403 }
      );
    }

    const where: Record<string, unknown> = {};

    // Multi-tenant isolation: filter by companyId
    if (companyId) {
      where.companyId = companyId;
    }

    const checkType = searchParams.get('checkType');
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    if (checkType) where.checkType = checkType;
    if (status) where.status = status;

    const [logs, total] = await Promise.all([
      db.dataIntegrityLog.findMany({
        where,
        orderBy: { checkedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      db.dataIntegrityLog.count({ where }),
    ]);

    // VAT Auditor masking — mask discrepancy, expectedValue, actualValue fields
    const masked = logs.map((log: Record<string, unknown>) =>
      maskForVatAuditor(log, userRole, ['discrepancy', 'expectedValue', 'actualValue'])
    );

    return NextResponse.json({ logs: masked, total, limit, offset });
  } catch (error) {
    console.error('Data integrity GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch integrity logs' }, { status: 500 });
  }
}

// POST /api/data-integrity — Run integrity checks
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'DataIntegrityLog', 'POST');
  if (!security.authorized) return security.response;

  try {
    const userRole = security.user.role as UserRole;

    // SR and Dealer blocked via MODULE_DENY (enforced by withApiSecurity)
    // Additional explicit check for safety
    if (userRole === 'sr' || userRole === 'dealer') {
      return NextResponse.json(
        { error: 'Access denied. SR and Dealer roles cannot run integrity checks.' },
        { status: 403 }
      );
    }

    // VAT Auditor: read-only (already enforced by withApiSecurity's vat_auditor write deny)
    if (userRole === 'vat_auditor') {
      return NextResponse.json(
        { error: 'Write access denied. VAT Auditor has read-only access.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'run-check') {
      return await runAllChecks(security);
    }

    return NextResponse.json(
      { error: 'Invalid action. Use ?action=run-check to run integrity checks.' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Data integrity POST error:', error);
    return NextResponse.json({ error: 'Failed to run integrity checks' }, { status: 500 });
  }
}

async function runAllChecks(
  security: { authorized: true; user: { id: string; email: string; name: string; role: string; companyId: string | null } }
) {
  const companyId = security.user.companyId;
  const results: Record<string, unknown>[] = [];

  try {
    // ============================================================
    // 1. LedgerBalance: Verify total debits = total credits (company-scoped)
    // ============================================================
    const ledgerBalance = await verifyLedgerBalance({ companyId });
    const ledgerCode = await generateCode('dataIntegrityLog', 'DIL-');

    const ledgerLog = await db.dataIntegrityLog.create({
      data: {
        code: ledgerCode,
        checkType: 'LedgerBalance',
        status: ledgerBalance.balanced ? 'Passed' : 'Failed',
        module: 'Ledger',
        details: JSON.stringify({
          totalDebit: ledgerBalance.totalDebit,
          totalCredit: ledgerBalance.totalCredit,
          difference: ledgerBalance.difference,
          entryCount: ledgerBalance.entryCount,
        }),
        discrepancy: safeFinancialRound(ledgerBalance.difference),
        expectedValue: safeFinancialRound(ledgerBalance.totalDebit),
        actualValue: safeFinancialRound(ledgerBalance.totalCredit),
        companyId: companyId,
        checkedBy: security.user.name,
      },
    });
    results.push(ledgerLog);

    // ============================================================
    // 2. StockReconciliation: Verify openingStock = SUM(IN) - SUM(OUT) (company-scoped)
    // ============================================================
    const productWhere: Record<string, unknown> = { isActive: true };
    if (companyId) productWhere.companyId = companyId;

    const products = await db.product.findMany({
      where: productWhere,
      select: { id: true, productCode: true, name: true, openingStock: true },
    });

    let stockDiscrepancies = 0;
    let stockTotalChecked = 0;
    const stockDetails: Record<string, unknown>[] = [];

    for (const product of products) {
      const [inAgg, outAgg] = await Promise.all([
        db.stockEntry.aggregate({
          where: { productId: product.id, type: 'IN', isActive: true },
          _sum: { quantity: true },
        }),
        db.stockEntry.aggregate({
          where: { productId: product.id, type: 'OUT', isActive: true },
          _sum: { quantity: true },
        }),
      ]);

      // STAGE 13: Use safeFinancialSubtract for stock calculation
      const totalIn = inAgg._sum.quantity || 0;
      const totalOut = outAgg._sum.quantity || 0;
      const calculatedStock = safeFinancialSubtract(totalIn, totalOut);
      const discrepancy = safeFinancialRound(Math.abs(safeFinancialSubtract(product.openingStock, calculatedStock)));

      stockTotalChecked = safeFinancialAdd(stockTotalChecked, 1);

      if (discrepancy > 0.01) {
        stockDiscrepancies = safeFinancialAdd(stockDiscrepancies, 1);
        stockDetails.push({
          productId: product.id,
          productCode: product.productCode,
          name: product.name,
          expectedStock: calculatedStock,
          actualStock: product.openingStock,
          discrepancy,
        });
      }
    }

    const stockCode = await generateCode('dataIntegrityLog', 'DIL-');
    const stockLog = await db.dataIntegrityLog.create({
      data: {
        code: stockCode,
        checkType: 'StockReconciliation',
        status: stockDiscrepancies === 0 ? 'Passed' : (stockDiscrepancies > products.length * 0.1 ? 'Failed' : 'Warning'),
        module: 'Stock',
        details: JSON.stringify({
          totalChecked: stockTotalChecked,
          discrepancies: stockDiscrepancies,
          items: stockDetails.slice(0, 50), // Limit stored details
        }),
        discrepancy: safeFinancialRound(stockDiscrepancies),
        expectedValue: safeFinancialRound(stockTotalChecked),
        actualValue: safeFinancialSubtract(stockTotalChecked, stockDiscrepancies),
        companyId: companyId,
        checkedBy: security.user.name,
      },
    });
    results.push(stockLog);

    // ============================================================
    // 3. AccountConsistency: Verify each LedgerEntry has a valid
    //    accountId pointing to an active ChartOfAccount (company-scoped)
    // ============================================================
    const ledgerEntryWhere: Record<string, unknown> = {
      isActive: true,
      accountId: { not: null },
    };
    if (companyId) ledgerEntryWhere.companyId = companyId;

    const ledgerEntriesWithoutAccount = await db.ledgerEntry.findMany({
      where: ledgerEntryWhere,
      select: { id: true, entryCode: true, accountId: true, account: true },
    });

    let invalidAccountEntries = 0;
    const invalidAccountDetails: Record<string, unknown>[] = [];

    for (const entry of ledgerEntriesWithoutAccount) {
      if (entry.accountId) {
        const coaWhere: Record<string, unknown> = { id: entry.accountId, isActive: true };
        if (companyId) coaWhere.companyId = companyId;

        const coaExists = await db.chartOfAccount.findFirst({ where: coaWhere });

        if (!coaExists) {
          invalidAccountEntries = safeFinancialAdd(invalidAccountEntries, 1);
          invalidAccountDetails.push({
            entryId: entry.id,
            entryCode: entry.entryCode,
            accountId: entry.accountId,
          });
        }
      }
    }

    const accountCode = await generateCode('dataIntegrityLog', 'DIL-');
    const accountLog = await db.dataIntegrityLog.create({
      data: {
        code: accountCode,
        checkType: 'AccountConsistency',
        status: invalidAccountEntries === 0 ? 'Passed' : 'Failed',
        module: 'Ledger',
        details: JSON.stringify({
          totalChecked: ledgerEntriesWithoutAccount.length,
          invalidEntries: invalidAccountEntries,
          items: invalidAccountDetails.slice(0, 50),
        }),
        discrepancy: safeFinancialRound(invalidAccountEntries),
        expectedValue: safeFinancialRound(ledgerEntriesWithoutAccount.length),
        actualValue: safeFinancialSubtract(ledgerEntriesWithoutAccount.length, invalidAccountEntries),
        companyId: companyId,
        checkedBy: security.user.name,
      },
    });
    results.push(accountLog);

    // ============================================================
    // 4. VATReconciliation: Verify VAT amounts on SO/PO match
    //    line-level VAT totals (company-scoped via product relation)
    // ============================================================
    let vatDiscrepancies = 0;
    let vatTotalChecked = 0;
    const vatDetails: Record<string, unknown>[] = [];

    // Check Sales Orders — filter products by companyId if available
    // SalesOrder doesn't have companyId directly, so we check line-level products
    const salesOrders = await db.salesOrder.findMany({
      where: { isActive: true, vatAmount: { gt: 0 } },
      include: { lines: { include: { product: true } } },
    });

    for (const so of salesOrders) {
      // STAGE 13: If companyId is set, skip SOs whose products don't belong to this company
      if (companyId && so.lines.length > 0) {
        const hasCompanyProduct = so.lines.some((line: { product: { companyId: string | null } | null }) =>
          line.product?.companyId === companyId || line.product?.companyId === null
        );
        if (!hasCompanyProduct) continue;
      }

      const lineVatTotal = safeFinancialRound(
        so.lines.reduce(
          (sum: number, line: { vatAmount: number | null }) => safeFinancialAdd(sum, line.vatAmount || 0),
          0
        )
      );
      const discrepancy = safeFinancialRound(Math.abs(safeFinancialSubtract(so.vatAmount, lineVatTotal)));

      vatTotalChecked = safeFinancialAdd(vatTotalChecked, 1);

      if (discrepancy > 0.01) {
        vatDiscrepancies = safeFinancialAdd(vatDiscrepancies, 1);
        vatDetails.push({
          type: 'SalesOrder',
          code: so.invoiceNo,
          headerVat: so.vatAmount,
          lineVatTotal,
          discrepancy,
        });
      }
    }

    // Check Purchase Orders
    const purchaseOrders = await db.purchaseOrder.findMany({
      where: { isActive: true, vatAmount: { gt: 0 } },
      include: { lines: { include: { product: true } } },
    });

    for (const po of purchaseOrders) {
      // STAGE 13: If companyId is set, skip POs whose products don't belong to this company
      if (companyId && po.lines.length > 0) {
        const hasCompanyProduct = po.lines.some((line: { product: { companyId: string | null } | null }) =>
          line.product?.companyId === companyId || line.product?.companyId === null
        );
        if (!hasCompanyProduct) continue;
      }

      const lineVatTotal = safeFinancialRound(
        po.lines.reduce(
          (sum: number, line: { vatAmount: number | null }) => safeFinancialAdd(sum, line.vatAmount || 0),
          0
        )
      );
      const discrepancy = safeFinancialRound(Math.abs(safeFinancialSubtract(po.vatAmount, lineVatTotal)));

      vatTotalChecked = safeFinancialAdd(vatTotalChecked, 1);

      if (discrepancy > 0.01) {
        vatDiscrepancies = safeFinancialAdd(vatDiscrepancies, 1);
        vatDetails.push({
          type: 'PurchaseOrder',
          code: po.poNumber,
          headerVat: po.vatAmount,
          lineVatTotal,
          discrepancy,
        });
      }
    }

    const vatCode = await generateCode('dataIntegrityLog', 'DIL-');
    const vatLog = await db.dataIntegrityLog.create({
      data: {
        code: vatCode,
        checkType: 'VATReconciliation',
        status: vatDiscrepancies === 0 ? 'Passed' : (vatDiscrepancies > vatTotalChecked * 0.1 ? 'Failed' : 'Warning'),
        module: 'Tax',
        details: JSON.stringify({
          totalChecked: vatTotalChecked,
          discrepancies: vatDiscrepancies,
          items: vatDetails.slice(0, 50),
        }),
        discrepancy: safeFinancialRound(vatDiscrepancies),
        expectedValue: safeFinancialRound(vatTotalChecked),
        actualValue: safeFinancialSubtract(vatTotalChecked, vatDiscrepancies),
        companyId: companyId,
        checkedBy: security.user.name,
      },
    });
    results.push(vatLog);

    // Activity log with Audit-Integrity-Sentinel module token
    await logUserActivity({
      action: 'CREATE',
      module: 'Audit-Integrity-Sentinel',
      recordLabel: 'Run All Checks',
      userId: security.user.id,
      userName: security.user.name,
      details: JSON.stringify({
        checksRun: results.length,
        summary: {
          ledgerBalance: ledgerBalance.balanced ? 'Passed' : 'Failed',
          stockReconciliation: stockDiscrepancies === 0 ? 'Passed' : 'Warning',
          accountConsistency: invalidAccountEntries === 0 ? 'Passed' : 'Failed',
          vatReconciliation: vatDiscrepancies === 0 ? 'Passed' : 'Warning',
        },
      }),
    });

    return NextResponse.json({
      checks: results,
      summary: {
        totalChecks: results.length,
        passed: results.filter((r: Record<string, unknown>) => r.status === 'Passed').length,
        failed: results.filter((r: Record<string, unknown>) => r.status === 'Failed').length,
        warnings: results.filter((r: Record<string, unknown>) => r.status === 'Warning').length,
      },
    });
  } catch (error) {
    console.error('Data integrity run-check error:', error);

    // Log failure via Audit-Integrity-Sentinel
    await logUserActivity({
      action: 'CREATE',
      module: 'Audit-Integrity-Sentinel',
      userId: security.user.id,
      userName: security.user.name,
      details: JSON.stringify({
        action: 'run-check',
        error: error instanceof Error ? error.message : 'Unknown error',
        checksCompletedBeforeFailure: results.length,
      }),
    });

    return NextResponse.json({ error: 'Failed to run integrity checks' }, { status: 500 });
  }
}
