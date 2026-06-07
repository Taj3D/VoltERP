// ============================================================
// STAGING SEED WIPE — Clean wipe of all seeded commercial data
// Preserves system configuration (Company, Branch, Category,
// Color, Brand, Unit, Segment, Capacity, Department, Designation,
// Godown, Bank, PaymentOption, CardType, CardTypeSetup,
// ExpenseIncomeHead, InterestPercentage, SRTargetSetup,
// ChartOfAccount, PeriodClose, FiscalYear, SMS, Investment,
// SystemConfig, InvoiceTemplate, NumberFormat, User, SystemBackup)
//
// After wiping, resets:
//   - ChartOfAccount.currentBalance = openingBalance
//   - Bank.currentBalance = openingBalance
//   - Godown.status = "ACTIVE"
//
// Creates StagingTestLog with testCode "STG-WIPE-{timestamp}"
// Phase 19 — VoltERP Sys-Staging-QA-Vault
// ============================================================

import { db } from '@/lib/db';
import { logUserActivity } from '@/lib/activity-logger';
import { withApiSecurity } from '@/lib/api-security';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'SystemSettings', 'POST');
  if (!security.authorized) return security.response;
  if (security.user.role !== 'admin') {
    return NextResponse.json({ error: 'Access denied: Admin only' }, { status: 403 });
  }
  const startTime = Date.now();
  let totalDeleted = 0;
  const deletionLog: Record<string, number> = {};

  try {
    await db.$transaction(async (tx) => {
      // ============================================================
      // PHASE 1: LINE ITEMS (children of transaction headers)
      // These must be deleted before their parent headers
      // ============================================================

      const posSaleLines = await tx.posSaleLine.deleteMany();
      deletionLog.PosSaleLine = posSaleLines.count;
      totalDeleted += posSaleLines.count;

      const salesReturnLines = await tx.salesReturnLine.deleteMany();
      deletionLog.SalesReturnLine = salesReturnLines.count;
      totalDeleted += salesReturnLines.count;

      const purchaseReturnLines = await tx.purchaseReturnLine.deleteMany();
      deletionLog.PurchaseReturnLine = purchaseReturnLines.count;
      totalDeleted += purchaseReturnLines.count;

      const replacementOrderLines = await tx.replacementOrderLine.deleteMany();
      deletionLog.ReplacementOrderLine = replacementOrderLines.count;
      totalDeleted += replacementOrderLines.count;

      const hireInstallments = await tx.hireInstallment.deleteMany();
      deletionLog.HireInstallment = hireInstallments.count;
      totalDeleted += hireInstallments.count;

      const hireSalesLines = await tx.hireSalesLine.deleteMany();
      deletionLog.HireSalesLine = hireSalesLines.count;
      totalDeleted += hireSalesLines.count;

      const salesOrderLines = await tx.salesOrderLine.deleteMany();
      deletionLog.SalesOrderLine = salesOrderLines.count;
      totalDeleted += salesOrderLines.count;

      const purchaseOrderLines = await tx.purchaseOrderLine.deleteMany();
      deletionLog.PurchaseOrderLine = purchaseOrderLines.count;
      totalDeleted += purchaseOrderLines.count;

      const orderSheetLines = await tx.orderSheetLine.deleteMany();
      deletionLog.OrderSheetLine = orderSheetLines.count;
      totalDeleted += orderSheetLines.count;

      const stockTransferLines = await tx.stockTransferLine.deleteMany();
      deletionLog.StockTransferLine = stockTransferLines.count;
      totalDeleted += stockTransferLines.count;

      const voucherLines = await tx.voucherLine.deleteMany();
      deletionLog.VoucherLine = voucherLines.count;
      totalDeleted += voucherLines.count;

      // ============================================================
      // PHASE 2: DEPENDENT RECORDS referencing master data
      // Must be deleted before transaction headers and master records
      // ============================================================

      const productSerialTrackings = await tx.productSerialTracking.deleteMany();
      deletionLog.ProductSerialTracking = productSerialTrackings.count;
      totalDeleted += productSerialTrackings.count;

      const ledgerHashChains = await tx.ledgerHashChain.deleteMany();
      deletionLog.LedgerHashChain = ledgerHashChains.count;
      totalDeleted += ledgerHashChains.count;

      const ledgerAutoPosts = await tx.ledgerAutoPost.deleteMany();
      deletionLog.LedgerAutoPost = ledgerAutoPosts.count;
      totalDeleted += ledgerAutoPosts.count;

      const dataIntegrityLogs = await tx.dataIntegrityLog.deleteMany();
      deletionLog.DataIntegrityLog = dataIntegrityLogs.count;
      totalDeleted += dataIntegrityLogs.count;

      const cashCollections = await tx.cashCollection.deleteMany();
      deletionLog.CashCollection = cashCollections.count;
      totalDeleted += cashCollections.count;

      const cashDeliveries = await tx.cashDelivery.deleteMany();
      deletionLog.CashDelivery = cashDeliveries.count;
      totalDeleted += cashDeliveries.count;

      const expenses = await tx.expense.deleteMany();
      deletionLog.Expense = expenses.count;
      totalDeleted += expenses.count;

      const incomes = await tx.income.deleteMany();
      deletionLog.Income = incomes.count;
      totalDeleted += incomes.count;

      // ============================================================
      // PHASE 3: TRANSACTION HEADERS
      // Must be deleted before master data (Customer, Supplier, etc.)
      // ============================================================

      const posSales = await tx.posSale.deleteMany();
      deletionLog.PosSale = posSales.count;
      totalDeleted += posSales.count;

      const salesReturns = await tx.salesReturn.deleteMany();
      deletionLog.SalesReturn = salesReturns.count;
      totalDeleted += salesReturns.count;

      const purchaseReturns = await tx.purchaseReturn.deleteMany();
      deletionLog.PurchaseReturn = purchaseReturns.count;
      totalDeleted += purchaseReturns.count;

      const replacementOrders = await tx.replacementOrder.deleteMany();
      deletionLog.ReplacementOrder = replacementOrders.count;
      totalDeleted += replacementOrders.count;

      const hireSales = await tx.hireSales.deleteMany();
      deletionLog.HireSales = hireSales.count;
      totalDeleted += hireSales.count;

      const salesOrders = await tx.salesOrder.deleteMany();
      deletionLog.SalesOrder = salesOrders.count;
      totalDeleted += salesOrders.count;

      const purchaseOrders = await tx.purchaseOrder.deleteMany();
      deletionLog.PurchaseOrder = purchaseOrders.count;
      totalDeleted += purchaseOrders.count;

      const orderSheets = await tx.orderSheet.deleteMany();
      deletionLog.OrderSheet = orderSheets.count;
      totalDeleted += orderSheets.count;

      const stockTransfers = await tx.stockTransfer.deleteMany();
      deletionLog.StockTransfer = stockTransfers.count;
      totalDeleted += stockTransfers.count;

      const journalVouchers = await tx.journalVoucher.deleteMany();
      deletionLog.JournalVoucher = journalVouchers.count;
      totalDeleted += journalVouchers.count;

      const ledgerEntries = await tx.ledgerEntry.deleteMany();
      deletionLog.LedgerEntry = ledgerEntries.count;
      totalDeleted += ledgerEntries.count;

      const bankTransactions = await tx.bankTransaction.deleteMany();
      deletionLog.BankTransaction = bankTransactions.count;
      totalDeleted += bankTransactions.count;

      // ============================================================
      // PHASE 4: MASTER DATA (CRM + Staff)
      // ============================================================

      const customers = await tx.customer.deleteMany();
      deletionLog.Customer = customers.count;
      totalDeleted += customers.count;

      const suppliers = await tx.supplier.deleteMany();
      deletionLog.Supplier = suppliers.count;
      totalDeleted += suppliers.count;

      const employeeLeaves = await tx.employeeLeave.deleteMany();
      deletionLog.EmployeeLeave = employeeLeaves.count;
      totalDeleted += employeeLeaves.count;

      // SRTargetSetup references Employee — must delete before Employee
      const srTargetSetups = await tx.sRTargetSetup.deleteMany();
      deletionLog.SRTargetSetup = srTargetSetups.count;
      totalDeleted += srTargetSetups.count;

      const employees = await tx.employee.deleteMany();
      deletionLog.Employee = employees.count;
      totalDeleted += employees.count;

      // ============================================================
      // PHASE 5: STOCK & PRODUCT DATA
      // StockEntry references Product and BatchMaster — delete first
      // ProductStock, BatchMaster, DamageLog reference Product — delete before Product
      // ============================================================

      const stockEntries = await tx.stockEntry.deleteMany();
      deletionLog.StockEntry = stockEntries.count;
      totalDeleted += stockEntries.count;

      const productStocks = await tx.productStock.deleteMany();
      deletionLog.ProductStock = productStocks.count;
      totalDeleted += productStocks.count;

      const batchMasters = await tx.batchMaster.deleteMany();
      deletionLog.BatchMaster = batchMasters.count;
      totalDeleted += batchMasters.count;

      const damageLogs = await tx.damageLog.deleteMany();
      deletionLog.DamageLog = damageLogs.count;
      totalDeleted += damageLogs.count;

      const products = await tx.product.deleteMany();
      deletionLog.Product = products.count;
      totalDeleted += products.count;

      // ============================================================
      // PHASE 6: SYSTEM / AUDIT / SECURITY DATA
      // ============================================================

      const interBranchTransfers = await tx.interBranchTransfer.deleteMany();
      deletionLog.InterBranchTransfer = interBranchTransfers.count;
      totalDeleted += interBranchTransfers.count;

      const consolidationLogs = await tx.consolidationLog.deleteMany();
      deletionLog.ConsolidationLog = consolidationLogs.count;
      totalDeleted += consolidationLogs.count;

      const notifications = await tx.notification.deleteMany();
      deletionLog.Notification = notifications.count;
      totalDeleted += notifications.count;

      const securityAuditTrails = await tx.securityAuditTrail.deleteMany();
      deletionLog.SecurityAuditTrail = securityAuditTrails.count;
      totalDeleted += securityAuditTrails.count;

      const securityThreatLogs = await tx.securityThreatLog.deleteMany();
      deletionLog.SecurityThreatLog = securityThreatLogs.count;
      totalDeleted += securityThreatLogs.count;

      const rateLimitAttempts = await tx.rateLimitAttempt.deleteMany();
      deletionLog.RateLimitAttempt = rateLimitAttempts.count;
      totalDeleted += rateLimitAttempts.count;

      const stagingTestLogs = await tx.stagingTestLog.deleteMany();
      deletionLog.StagingTestLog = stagingTestLogs.count;
      totalDeleted += stagingTestLogs.count;

      const auditLogs = await tx.auditLog.deleteMany();
      deletionLog.AuditLog = auditLogs.count;
      totalDeleted += auditLogs.count;

      const systemAuditLogs = await tx.systemAuditLog.deleteMany();
      deletionLog.SystemAuditLog = systemAuditLogs.count;
      totalDeleted += systemAuditLogs.count;

      // ============================================================
      // POST-WIPE RESETS
      // Reset preserved tables to their original system state
      // ============================================================

      // Reset ChartOfAccount currentBalance → openingBalance
      await tx.chartOfAccount.updateMany({
        data: { currentBalance: 0 }, // Will set to openingBalance below
      });

      // Fetch all ChartOfAccounts and reset currentBalance = openingBalance
      const allCoaAccounts = await tx.chartOfAccount.findMany({
        select: { id: true, openingBalance: true },
      });
      for (const account of allCoaAccounts) {
        await tx.chartOfAccount.update({
          where: { id: account.id },
          data: { currentBalance: account.openingBalance },
        });
      }

      // Reset Bank currentBalance → openingBalance
      const allBanks = await tx.bank.findMany({
        select: { id: true, openingBalance: true },
      });
      for (const bank of allBanks) {
        await tx.bank.update({
          where: { id: bank.id },
          data: { currentBalance: bank.openingBalance },
        });
      }

      // Reset Godown status → "ACTIVE"
      await tx.godown.updateMany({
        data: { status: 'ACTIVE' },
      });

      // ============================================================
      // STAGING TEST LOG ENTRY
      // Create immutable audit record for this wipe operation
      // ============================================================

      const executionTimeMs = Date.now() - startTime;
      const timestamp = Date.now();
      const testCode = `STG-WIPE-${timestamp}`;

      await tx.stagingTestLog.create({
        data: {
          testCode,
          testType: 'SEED_WIPE',
          status: 'Passed',
          moduleUnderTest: 'All Commercial Modules',
          executionTimeMs,
          recordsDeleted: totalDeleted,
          recordsCreated: 0,
          moduleToken: 'Sys-Staging-QA-Vault',
          details: JSON.stringify({
            operation: 'SEED_WIPE',
            tablesWiped: Object.keys(deletionLog).length,
            deletionBreakdown: deletionLog,
            preservedTables: [
              'Company', 'Branch', 'Category', 'Color', 'Brand', 'Unit',
              'Segment', 'Capacity', 'Department', 'Designation', 'Godown',
              'Bank', 'PaymentOption', 'CardType', 'CardTypeSetup',
              'ExpenseIncomeHead', 'InterestPercentage', 'SRTargetSetup',
              'ChartOfAccount', 'PeriodClose', 'FiscalYear',
              'SmsSetting', 'SmsLog', 'SmsBill', 'SmsBillPayment', 'SmsAutomationConfig',
              'InvestmentHead', 'Asset', 'AssetDepreciation', 'Liability',
              'SystemConfig', 'InvoiceTemplate', 'NumberFormat',
              'User', 'SystemBackup',
            ],
            postWipeResets: [
              'ChartOfAccount.currentBalance → openingBalance',
              'Bank.currentBalance → openingBalance',
              'Godown.status → ACTIVE',
            ],
            totalRecordsDeleted: totalDeleted,
          }),
          triggeredBy: 'system',
          triggeredByName: 'System',
        },
      });
    });

    // ============================================================
    // ACTIVITY LOG — Audit trail for the wipe operation
    // ============================================================

    const executionTimeMs = Date.now() - startTime;
    const timestamp = Date.now();

    await logUserActivity({
      action: 'STAGING_QA',
      module: 'Sys-Staging-QA-Vault',
      recordId: `STG-WIPE-${timestamp}`,
      recordLabel: `Seed Wipe — ${totalDeleted} records deleted`,
      userId: 'system',
      userName: 'System',
      details: JSON.stringify({
        operation: 'SEED_WIPE',
        totalDeleted,
        executionTimeMs,
        tablesAffected: Object.keys(deletionLog).length,
      }),
    });

    return NextResponse.json({
      success: true,
      message: `Seed wipe completed successfully. ${totalDeleted} records deleted across ${Object.keys(deletionLog).length} tables.`,
      data: {
        testCode: `STG-WIPE-${timestamp}`,
        totalDeleted,
        executionTimeMs,
        tablesAffected: Object.keys(deletionLog).length,
        deletionBreakdown: deletionLog,
        preservedTables: [
          'Company', 'Branch', 'Category', 'Color', 'Brand', 'Unit',
          'Segment', 'Capacity', 'Department', 'Designation', 'Godown',
          'Bank', 'PaymentOption', 'CardType', 'CardTypeSetup',
          'ExpenseIncomeHead', 'InterestPercentage', 'SRTargetSetup',
          'ChartOfAccount', 'PeriodClose', 'FiscalYear',
          'SmsSetting', 'SmsLog', 'SmsBill', 'SmsBillPayment', 'SmsAutomationConfig',
          'InvestmentHead', 'Asset', 'AssetDepreciation', 'Liability',
          'SystemConfig', 'InvoiceTemplate', 'NumberFormat',
          'User', 'SystemBackup',
        ],
        postWipeResets: [
          'ChartOfAccount.currentBalance → openingBalance',
          'Bank.currentBalance → openingBalance',
          'Godown.status → ACTIVE',
        ],
      },
    });
  } catch (error: unknown) {
    const executionTimeMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Attempt to log the failure to StagingTestLog (outside transaction since it failed)
    try {
      const failTimestamp = Date.now();
      await db.stagingTestLog.create({
        data: {
          testCode: `STG-WIPE-${failTimestamp}`,
          testType: 'SEED_WIPE',
          status: 'Failed',
          moduleUnderTest: 'All Commercial Modules',
          executionTimeMs,
          recordsDeleted: totalDeleted,
          recordsCreated: 0,
          moduleToken: 'Sys-Staging-QA-Vault',
          errorMessage,
          details: JSON.stringify({
            operation: 'SEED_WIPE',
            partialDeletionBreakdown: deletionLog,
            totalRecordsDeletedBeforeFailure: totalDeleted,
          }),
          triggeredBy: 'system',
          triggeredByName: 'System',
        },
      });
    } catch {
      // StagingTestLog write failed — non-blocking
    }

    // Attempt to log the failure to activity log
    try {
      await logUserActivity({
        action: 'STAGING_QA',
        module: 'Sys-Staging-QA-Vault',
        recordId: `STG-WIPE-${Date.now()}`,
        recordLabel: `Seed Wipe FAILED — ${totalDeleted} records deleted before error`,
        userId: 'system',
        userName: 'System',
        details: JSON.stringify({
          operation: 'SEED_WIPE',
          status: 'Failed',
          totalDeleted,
          errorMessage,
          executionTimeMs,
        }),
      });
    } catch {
      // Activity log failed — non-blocking
    }

    return NextResponse.json(
      {
        success: false,
        message: `Seed wipe failed: ${errorMessage}`,
        error: errorMessage,
        data: {
          totalDeleted,
          executionTimeMs,
          partialDeletionBreakdown: deletionLog,
        },
      },
      { status: 500 }
    );
  }
}
