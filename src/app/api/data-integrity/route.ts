// ============================================================
// DATA INTEGRITY API — Audit & Integrity Checks
// Group 5: Financial Auditing, Automated Ledgers & Data Integrity
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, type UserRole } from '@/lib/api-security';
import { verifyLedgerBalance } from '@/lib/accounting-utils';

// Inline code generator for DataIntegrityLog
async function generateCode(model: string, prefix: string): Promise<string> {
  const latest = await (db as any)[model].findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: 'desc' },
    select: { code: true },
  });
  if (!latest) return `${prefix}00001`;
  const num = parseInt(latest.code.replace(prefix, ''), 10) || 0;
  return `${prefix}${String(num + 1).padStart(5, '0')}`;
}

function maskForVat(value: any, isVatAuditor: boolean): any {
  if (!isVatAuditor) return value;
  return 'N/A (Audit Mode)';
}

// GET /api/data-integrity — List integrity logs with filters
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'LedgerEntries', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const userRole = security.user.role as UserRole;
    const isVatAuditor = userRole === 'vat_auditor';

    // SR and Dealer get 403
    if (userRole === 'sr' || userRole === 'dealer') {
      return NextResponse.json(
        { error: 'Access denied. SR and Dealer roles cannot access data integrity logs.' },
        { status: 403 }
      );
    }

    const where: Record<string, unknown> = {};

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

    // Mask amounts for VAT Auditor
    const masked = logs.map((log: any) => ({
      ...log,
      discrepancy: isVatAuditor ? maskForVat(log.discrepancy, true) : log.discrepancy,
      expectedValue: isVatAuditor ? maskForVat(log.expectedValue, true) : log.expectedValue,
      actualValue: isVatAuditor ? maskForVat(log.actualValue, true) : log.actualValue,
    }));

    return NextResponse.json({ logs: masked, total, limit, offset });
  } catch (error) {
    console.error('Data integrity GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch integrity logs' }, { status: 500 });
  }
}

// POST /api/data-integrity — Run integrity checks
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'LedgerEntries', 'POST');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const userRole = security.user.role as UserRole;

    // SR and Dealer get 403
    if (userRole === 'sr' || userRole === 'dealer') {
      return NextResponse.json(
        { error: 'Access denied. SR and Dealer roles cannot run integrity checks.' },
        { status: 403 }
      );
    }

    // VAT Auditor: read-only (cannot run checks)
    if (userRole === 'vat_auditor') {
      return NextResponse.json(
        { error: 'Write access denied. VAT Auditor has read-only access.' },
        { status: 403 }
      );
    }

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
  security: { authorized: true; user: { id: string; email: string; name: string; role: string } }
) {
  const results: any[] = [];

  try {
    // 1. LedgerBalance: Verify total debits = total credits
    const ledgerBalance = await verifyLedgerBalance();
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
        discrepancy: ledgerBalance.difference,
        expectedValue: ledgerBalance.totalDebit,
        actualValue: ledgerBalance.totalCredit,
        checkedBy: security.user.name,
      },
    });
    results.push(ledgerLog);

    // 2. StockReconciliation: For each product, verify openingStock = SUM(stock entries IN) - SUM(stock entries OUT)
    const products = await db.product.findMany({
      where: { isActive: true },
      select: { id: true, productCode: true, name: true, openingStock: true },
    });

    let stockDiscrepancies = 0;
    let stockTotalChecked = 0;
    const stockDetails: any[] = [];

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

      const totalIn = inAgg._sum.quantity || 0;
      const totalOut = outAgg._sum.quantity || 0;
      const calculatedStock = totalIn - totalOut;
      const discrepancy = Math.abs(product.openingStock - calculatedStock);

      stockTotalChecked++;

      if (discrepancy > 0.01) {
        stockDiscrepancies++;
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
        discrepancy: stockDiscrepancies,
        expectedValue: stockTotalChecked,
        actualValue: stockTotalChecked - stockDiscrepancies,
        checkedBy: security.user.name,
      },
    });
    results.push(stockLog);

    // 3. AccountConsistency: Verify each LedgerEntry has a valid accountId pointing to an active ChartOfAccount
    const ledgerEntriesWithoutAccount = await db.ledgerEntry.findMany({
      where: {
        isActive: true,
        accountId: { not: null },
      },
      select: { id: true, entryCode: true, accountId: true, account: true },
    });

    let invalidAccountEntries = 0;
    const invalidAccountDetails: any[] = [];

    for (const entry of ledgerEntriesWithoutAccount) {
      if (entry.accountId) {
        const coaExists = await db.chartOfAccount.findFirst({
          where: { id: entry.accountId, isActive: true },
        });

        if (!coaExists) {
          invalidAccountEntries++;
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
        discrepancy: invalidAccountEntries,
        expectedValue: ledgerEntriesWithoutAccount.length,
        actualValue: ledgerEntriesWithoutAccount.length - invalidAccountEntries,
        checkedBy: security.user.name,
      },
    });
    results.push(accountLog);

    // 4. VATReconciliation: Verify VAT amounts on SO/PO match line-level VAT totals
    let vatDiscrepancies = 0;
    let vatTotalChecked = 0;
    const vatDetails: any[] = [];

    // Check Sales Orders
    const salesOrders = await db.salesOrder.findMany({
      where: { isActive: true, vatAmount: { gt: 0 } },
      include: { lines: true },
    });

    for (const so of salesOrders) {
      const lineVatTotal = so.lines.reduce((sum: number, line: any) => sum + (line.vatAmount || 0), 0);
      const discrepancy = Math.abs(so.vatAmount - lineVatTotal);

      vatTotalChecked++;
      if (discrepancy > 0.01) {
        vatDiscrepancies++;
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
      include: { lines: true },
    });

    for (const po of purchaseOrders) {
      const lineVatTotal = po.lines.reduce((sum: number, line: any) => sum + (line.vatAmount || 0), 0);
      const discrepancy = Math.abs(po.vatAmount - lineVatTotal);

      vatTotalChecked++;
      if (discrepancy > 0.01) {
        vatDiscrepancies++;
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
        discrepancy: vatDiscrepancies,
        expectedValue: vatTotalChecked,
        actualValue: vatTotalChecked - vatDiscrepancies,
        checkedBy: security.user.name,
      },
    });
    results.push(vatLog);

    // Audit log
    await db.auditLog.create({
      data: {
        action: 'CREATE',
        module: 'DataIntegrity',
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
      },
    });

    return NextResponse.json({
      checks: results,
      summary: {
        totalChecks: results.length,
        passed: results.filter((r: any) => r.status === 'Passed').length,
        failed: results.filter((r: any) => r.status === 'Failed').length,
        warnings: results.filter((r: any) => r.status === 'Warning').length,
      },
    });
  } catch (error) {
    console.error('Data integrity run-check error:', error);
    return NextResponse.json({ error: 'Failed to run integrity checks' }, { status: 500 });
  }
}
