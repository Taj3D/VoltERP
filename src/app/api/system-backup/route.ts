// ============================================================
// SYSTEM BACKUP API — Domain 20: System Audit Logs, Backups & Security Overhaul
// GET: List backup history (admin only)
// POST: Trigger a new multi-tenant database export (admin only)
// Backups export active records across all major models,
// compute checksums, and simulate S3-compatible storage.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';
import { sanitizeError } from '@/lib/exception-sanitizer';
import { db } from '@/lib/db';
import crypto from 'crypto';

// GET /api/system-backup — List backup history (admin only)
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'AuditLogs', 'GET');
  if (!security.authorized) return security.response;

  try {
    // Only admin can see backup history
    if (security.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Access denied. Only Administrators can manage system backups.' },
        { status: 403 }
      );
    }

    const companyId = security.user.companyId;

    // Build where clause with multi-tenant isolation
    const where: Record<string, unknown> = {};
    if (companyId) {
      where.companyId = companyId;
    }

    const backups = await db.systemBackup.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    // Log user activity
    await logUserActivity({
      action: 'EXPORT',
      module: 'Sec-Audit-Overhaul',
      userId: security.user.id,
      userName: security.user.name,
      details: JSON.stringify({
        action: 'view-backup-history',
        backupCount: backups.length,
      }),
    });

    return NextResponse.json({ backups });
  } catch (error) {
    const sanitized = sanitizeError(error, 'system-backup GET');
    return NextResponse.json(
      { error: sanitized.userMessage, errorCode: sanitized.errorCode },
      { status: sanitized.statusCode }
    );
  }
}

// POST /api/system-backup — Trigger a new backup (admin only)
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'AuditLogs', 'POST');
  if (!security.authorized) return security.response;

  try {
    // Only admin can trigger backups
    if (security.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Access denied. Only Administrators can trigger system backups.' },
        { status: 403 }
      );
    }

    const companyId = security.user.companyId;

    // Generate backup code
    const backupCode = await generateBackupCode();

    // Create SystemBackup record with status "PENDING"
    const backup = await db.systemBackup.create({
      data: {
        backupCode,
        companyId: companyId,
        triggeredBy: security.user.id,
        triggeredByName: security.user.name,
        status: 'PENDING',
        backupType: 'FULL',
        startedAt: new Date(),
      },
    });

    try {
      // ============================================================
      // Multi-tenant database export
      // For each major model, findMany where { companyId, isActive: true }
      // ============================================================
      const companyFilter = companyId ? { companyId, isActive: true } : { isActive: true };

      const [
        products,
        customers,
        suppliers,
        salesOrders,
        purchaseOrders,
        banks,
        expenses,
        incomes,
        cashCollections,
        cashDeliveries,
        bankTransactions,
        expenseIncomeHeads,
        chartOfAccounts,
        ledgerEntries,
      ] = await Promise.all([
        db.product.findMany({ where: companyFilter }),
        db.customer.findMany({ where: companyFilter }),
        db.supplier.findMany({ where: companyFilter }),
        db.salesOrder.findMany({ where: companyFilter }),
        db.purchaseOrder.findMany({ where: companyFilter }),
        db.bank.findMany({ where: companyFilter }),
        db.expense.findMany({ where: companyFilter }),
        db.income.findMany({ where: companyFilter }),
        db.cashCollection.findMany({ where: companyFilter }),
        db.cashDelivery.findMany({ where: companyFilter }),
        db.bankTransaction.findMany({ where: companyFilter }),
        db.expenseIncomeHead.findMany({ where: companyFilter }),
        db.chartOfAccount.findMany({ where: companyFilter }),
        db.ledgerEntry.findMany({ where: companyFilter }),
      ]);

      // Build a JSON object with all exported data
      const exportData = {
        exportedAt: new Date().toISOString(),
        backupCode,
        companyId,
        triggeredBy: security.user.id,
        triggeredByName: security.user.name,
        data: {
          products,
          customers,
          suppliers,
          salesOrders,
          purchaseOrders,
          banks,
          expenses,
          incomes,
          cashCollections,
          cashDeliveries,
          bankTransactions,
          expenseIncomeHeads,
          chartOfAccounts,
          ledgerEntries,
        },
      };

      // Compute recordCount
      const recordCount =
        products.length +
        customers.length +
        suppliers.length +
        salesOrders.length +
        purchaseOrders.length +
        banks.length +
        expenses.length +
        incomes.length +
        cashCollections.length +
        cashDeliveries.length +
        bankTransactions.length +
        expenseIncomeHeads.length +
        chartOfAccounts.length +
        ledgerEntries.length;

      // Convert to JSON string and compute size and checksum
      const jsonString = JSON.stringify(exportData);
      const fileSizeBytes = Buffer.byteLength(jsonString, 'utf-8');

      // Generate SHA-256 checksum for integrity verification
      const checksumSha256 = crypto
        .createHash('sha256')
        .update(jsonString)
        .digest('hex');

      // Simulate S3-compatible storage key
      const storageKey = `backups/${companyId || 'global'}/${backupCode}/${new Date().toISOString().split('T')[0]}.json`;

      // Update SystemBackup with status "COMPLETED"
      const completedBackup = await db.systemBackup.update({
        where: { id: backup.id },
        data: {
          status: 'COMPLETED',
          recordCount,
          fileSizeBytes,
          storageKey,
          checksumSha256,
          completedAt: new Date(),
        },
      });

      // Log user activity with Sec-Audit-Overhaul module token
      await logUserActivity({
        action: 'CREATE',
        module: 'Sec-Audit-Overhaul',
        recordId: backup.id,
        recordLabel: backupCode,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          action: 'trigger-backup',
          backupCode,
          recordCount,
          fileSizeBytes,
          checksumSha256,
        }),
      });

      // Return the backup metadata AND the JSON data for download
      // The backup JSON is NOT stored in the database (too large)
      return NextResponse.json({
        backup: completedBackup,
        downloadData: exportData,
      });
    } catch (exportError) {
      // Update SystemBackup with status "FAILED"
      await db.systemBackup.update({
        where: { id: backup.id },
        data: {
          status: 'FAILED',
          errorMessage:
            exportError instanceof Error
              ? exportError.message
              : 'Unknown export error',
        },
      });

      throw exportError;
    }
  } catch (error) {
    const sanitized = sanitizeError(error, 'system-backup POST');
    return NextResponse.json(
      { error: sanitized.userMessage, errorCode: sanitized.errorCode },
      { status: sanitized.statusCode }
    );
  }
}

/**
 * Generate a unique backup code in format BKP-XXXXX
 */
async function generateBackupCode(): Promise<string> {
  const latest = await db.systemBackup.findFirst({
    where: { backupCode: { startsWith: 'BKP-' } },
    orderBy: { backupCode: 'desc' },
    select: { backupCode: true },
  });

  if (!latest) return 'BKP-00001';

  const num = parseInt(latest.backupCode.replace('BKP-', ''), 10) || 0;
  return `BKP-${String(num + 1).padStart(5, '0')}`;
}
