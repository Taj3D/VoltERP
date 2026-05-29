// ============================================================
// NOTIFICATIONS API — Full CRUD + Auto-Generate + Header Polling
// Group 5: Financial Auditing, Automated Ledgers & Data Integrity
// STAGE 13: companyId isolation, checkNotificationDismissPermission,
//   Audit-Integrity-Sentinel token, comprehensive VAT masking,
//   companyId filtering on all source data in generateNotifications
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  safeFinancialSubtract,
  checkNotificationDismissPermission,
  type UserRole,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// Zero-padded immutable auto-code generator: NOT-XXXXX
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

// VAT Auditor masking for notification message content
function maskForVat(value: any, isVatAuditor: boolean): any {
  if (!isVatAuditor) return value;
  return 'N/A (Audit Mode)';
}

// Comprehensive monetary pattern masking within message strings
function maskVatInMessage(message: string, isVatAuditor: boolean): string {
  if (!isVatAuditor) return message;
  // Mask BDT currency patterns: ৳1,200.00 or ৳575,000.00
  let masked = message.replace(/৳[\d,]+\.?\d*/g, 'N/A (Audit Mode)');
  // Mask plain number patterns preceded by currency keywords
  masked = masked.replace(/(?:amount|balance|limit|total|due|remaining|outstanding|overdue|exceeded|difference|debit|credit|cost|value|price|paid)[\s:]*[\d,]+\.?\d*/gi, (match) =>
    match.replace(/[\d,]+\.?\d*$/, 'N/A (Audit Mode)')
  );
  return masked;
}

// Modules where VAT Auditor masking applies to currency values
const VAT_MASKED_MODULES = ['Ledger', 'Financial', 'PeriodClose', 'HireSales'];

// Role-based notification module filter
function getRoleModuleFilter(role: UserRole, companyId?: string | null): Record<string, unknown> {
  const baseFilter: Record<string, unknown> = {
    ...(companyId ? { companyId } : {}),
  };
  switch (role) {
    case 'admin':
    case 'manager':
      // Admin/Manager: see all modules (integrity, financial, stock, personnel)
      return baseFilter;
    case 'sr':
      // SR: only low-stock, hire-sales, personnel status — NO Ledger/Financial
      return { ...baseFilter, module: { notIn: ['Ledger', 'Financial', 'PeriodClose'] } };
    case 'dealer':
      // Dealer: only low-stock and order-status notifications
      return { ...baseFilter, type: { in: ['LowStock', 'System'] } };
    case 'vat_auditor':
      // VAT Auditor: see all modules but financial values are masked
      return baseFilter;
    default:
      return baseFilter;
  }
}

// GET /api/notifications — List + Count + Auto-Generate
// Returns: { success: true, count: <unreadCount>, data: [...] }
// Enhanced: all=true returns both read and unread notifications
// Enhanced: countOnly returns severity breakdown { count, critical, warning, info }
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Notifications', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const userRole = security.user.role as UserRole;
    const isVatAuditor = userRole === 'vat_auditor';
    const companyId = security.user.companyId;

    // Optional action: auto-generate notifications before fetching
    const action = searchParams.get('action');
    if (action === 'generate') {
      return await generateNotifications(security, isVatAuditor);
    }

    // Build role-based module filter (includes companyId)
    const roleFilter = getRoleModuleFilter(userRole, companyId);

    // Additional query filters
    const type = searchParams.get('type');
    const severity = searchParams.get('severity');
    const isRead = searchParams.get('isRead');
    const isDismissed = searchParams.get('isDismissed');
    const modFilter = searchParams.get('module');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const countOnly = searchParams.get('countOnly') === 'true';
    const all = searchParams.get('all') === 'true';

    // Merge filters
    const where: Record<string, unknown> = {
      ...roleFilter,
      isDismissed: false, // Never show dismissed in header polling
    };

    if (type) where.type = type;
    if (severity) where.severity = severity;

    // When all=true, don't filter by isRead (return both read AND unread)
    if (all) {
      // No isRead filter — return all notifications
    } else if (isRead !== null && isRead !== undefined && isRead !== '') {
      where.isRead = isRead === 'true';
    }

    if (modFilter) {
      // SR: block Ledger/Financial module filter
      if (userRole === 'sr' && (modFilter === 'Ledger' || modFilter === 'Financial')) {
        return NextResponse.json({ success: true, count: 0, data: [], total: 0 });
      }
      where.module = modFilter;
    }

    // Count-only mode for lightweight header badge polling
    // Enhanced: also return severity breakdown
    if (countOnly) {
      const baseWhere = { ...roleFilter, isDismissed: false };

      // If all=true, don't filter by isRead for count either
      const countWhere = all
        ? baseWhere
        : { ...baseWhere, isRead: false };

      const [unreadCount, criticalCount, warningCount, infoCount] = await Promise.all([
        db.notification.count({ where: countWhere }),
        db.notification.count({ where: { ...countWhere, severity: 'Critical' } }),
        db.notification.count({ where: { ...countWhere, severity: 'Warning' } }),
        db.notification.count({ where: { ...countWhere, severity: 'Info' } }),
      ]);

      return NextResponse.json({
        success: true,
        count: unreadCount,
        critical: criticalCount,
        warning: warningCount,
        info: infoCount,
        data: [],
      });
    }

    // Full fetch: unread first, then newest
    const [notifications, total, unreadCount] = await Promise.all([
      db.notification.findMany({
        where,
        orderBy: [{ isRead: 'asc' }, { createdAt: 'desc' }],
        take: limit,
        skip: offset,
      }),
      db.notification.count({ where }),
      db.notification.count({
        where: { ...roleFilter, isRead: false, isDismissed: false },
      }),
    ]);

    // Apply VAT Auditor masking to message content for financial + hire-sales modules
    const masked = notifications.map((n: any) => ({
      ...n,
      message: isVatAuditor && VAT_MASKED_MODULES.includes(n.module)
        ? maskVatInMessage(maskForVat(n.message, true), true)
        : n.message,
      title: isVatAuditor && VAT_MASKED_MODULES.includes(n.module)
        ? maskVatInMessage(n.title, true)
        : n.title,
    }));

    return NextResponse.json({
      success: true,
      count: unreadCount,
      total,
      data: masked,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Notifications GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
  }
}

// POST /api/notifications — Create a notification or auto-generate batch
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Notifications', 'POST');
  if (!security.authorized) return security.response;

  try {
    const userRole = security.user.role as UserRole;
    const companyId = security.user.companyId;

    // Dealer blocked entirely from creating
    if (userRole === 'dealer') {
      return NextResponse.json(
        { error: 'Access denied. Dealers cannot create notifications.' },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Auto-generate mode
    if (body.action === 'generate') {
      return await generateNotifications(security, userRole === 'vat_auditor');
    }

    const { type, severity, title, message, module, referenceId, referenceCode, actionUrl } = body;

    if (!type || !title || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: type, title, message' },
        { status: 400 }
      );
    }

    // SR cannot create notifications for Ledger or Financial modules
    if (userRole === 'sr' && (module === 'Ledger' || module === 'Financial')) {
      return NextResponse.json(
        { error: 'Access denied. SRs cannot create Ledger or Financial notifications.' },
        { status: 403 }
      );
    }

    const code = await generateCode('notification', 'NOT-');

    const notification = await db.notification.create({
      data: {
        code,
        type,
        severity: severity || 'Info',
        title,
        message,
        module: module || null,
        referenceId: referenceId || null,
        referenceCode: referenceCode || null,
        actionUrl: actionUrl || null,
        ...(companyId ? { companyId } : {}),
      },
    });

    // Audit log with Integrity Sentinel token
    await logUserActivity({
      action: 'CREATE',
      module: 'Audit-Integrity-Sentinel',
      recordId: notification.id,
      recordLabel: notification.code,
      userId: security.user.id,
      userName: security.user.name,
      details: JSON.stringify({ type, title, module }),
    });

    return NextResponse.json({ success: true, data: notification }, { status: 201 });
  } catch (error) {
    console.error('Notifications POST error:', error);
    return NextResponse.json({ error: 'Failed to create notification' }, { status: 500 });
  }
}

// PUT /api/notifications — Mark as read, mark all read, or dismiss
export async function PUT(request: NextRequest) {
  const security = await withApiSecurity(request, 'Notifications', 'PUT');
  if (!security.authorized) return security.response;

  try {
    const userRole = security.user.role as UserRole;
    const companyId = security.user.companyId;

    if (userRole === 'dealer') {
      return NextResponse.json(
        { error: 'Access denied. Dealers cannot update notifications.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { id, action, isRead, isDismissed, dismissedBy } = body;

    // Mark ALL as read
    if (action === 'mark-all-read') {
      const roleFilter = getRoleModuleFilter(userRole, companyId);
      const result = await db.notification.updateMany({
        where: { ...roleFilter, isRead: false, isDismissed: false },
        data: { isRead: true },
      });

      // Audit log with Integrity Sentinel token
      await logUserActivity({
        action: 'UPDATE',
        module: 'Audit-Integrity-Sentinel',
        recordLabel: 'Mark All Read',
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({ affected: result.count }),
      });

      return NextResponse.json({ success: true, affected: result.count });
    }

    // Single notification update
    if (!id) {
      return NextResponse.json({ error: 'Missing required field: id' }, { status: 400 });
    }

    const existing = await db.notification.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }

    // Cross-tenant check: if user has companyId, notification must belong to same company
    if (companyId && existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }

    // SR cannot update Ledger or Financial module notifications
    if (userRole === 'sr' && (existing.module === 'Ledger' || existing.module === 'Financial')) {
      return NextResponse.json(
        { error: 'Access denied. SRs cannot update Ledger or Financial notifications.' },
        { status: 403 }
      );
    }

    const updateData: Record<string, unknown> = {};

    // Support action-based updates from frontend
    if (action === 'mark-read' || isRead === true) {
      updateData.isRead = true;
    }

    // Dismiss action requires admin permission
    if (action === 'dismiss' || isDismissed === true) {
      const dismissCheck = checkNotificationDismissPermission(userRole);
      if (dismissCheck) return dismissCheck;

      updateData.isDismissed = true;
      updateData.dismissedAt = new Date();
      updateData.dismissedBy = dismissedBy || security.user.name;
    }

    if (isRead !== undefined && action !== 'mark-read') {
      updateData.isRead = isRead;
    }
    if (isDismissed !== undefined && action !== 'dismiss') {
      updateData.isDismissed = isDismissed;
      if (isDismissed) {
        // Double-check dismiss permission for isDismissed flag
        const dismissCheck = checkNotificationDismissPermission(userRole);
        if (dismissCheck) return dismissCheck;

        updateData.dismissedAt = new Date();
        updateData.dismissedBy = dismissedBy || security.user.name;
      }
    }

    const notification = await db.notification.update({
      where: { id },
      data: updateData,
    });

    // Audit log with Integrity Sentinel token
    await logUserActivity({
      action: 'UPDATE',
      module: 'Audit-Integrity-Sentinel',
      recordId: notification.id,
      recordLabel: notification.code,
      userId: security.user.id,
      userName: security.user.name,
      details: JSON.stringify(updateData),
    });

    return NextResponse.json({ success: true, data: notification });
  } catch (error) {
    console.error('Notifications PUT error:', error);
    return NextResponse.json({ error: 'Failed to update notification' }, { status: 500 });
  }
}

// ============================================================
// AUTO-GENERATE NOTIFICATIONS
// Scans for: LowStock, OverdueInstallment, DataIntegrity, PeriodClose,
//            BalanceMismatch, CreditLimitExceeded, TransferDelay
// All inserts within db.$transaction() for atomic consistency
// STAGE 13: All source data filtered by companyId,
//   all created notifications include companyId
// ============================================================
async function generateNotifications(
  security: { authorized: true; user: { id: string; email: string; name: string; role: string; companyId: string | null } },
  _isVatAuditor: boolean
) {
  const userRole = security.user.role as UserRole;
  const companyId = security.user.companyId;

  if (userRole === 'dealer') {
    return NextResponse.json(
      { error: 'Access denied. Dealers cannot generate notifications.' },
      { status: 403 }
    );
  }

  const created: any[] = [];

  try {
    await db.$transaction(async (tx: any) => {
      // Company-scoped filter helper
      const companyFilter = companyId ? { companyId } : {};

      // ─────────────────────────────────────────────────────────
      // 1. LOW STOCK ALERTS
      //    Products where openingStock <= reorderLevel (filtered by companyId)
      // ─────────────────────────────────────────────────────────
      const lowStockProducts = await tx.product.findMany({
        where: { isActive: true, ...companyFilter },
        select: {
          id: true,
          productCode: true,
          name: true,
          openingStock: true,
          reorderLevel: true,
        },
        take: 100,
      });

      const actualLowStock = lowStockProducts.filter(
        (p: any) => p.openingStock <= (p.reorderLevel || 5)
      );

      for (const product of actualLowStock) {
        const existing = await tx.notification.findFirst({
          where: {
            type: 'LowStock',
            referenceId: product.id,
            isDismissed: false,
            ...companyFilter,
          },
        });

        if (!existing) {
          const code = await generateCodeInTx(tx, 'NOT-');
          const notification = await tx.notification.create({
            data: {
              code,
              type: 'LowStock',
              severity: product.openingStock === 0 ? 'Critical' : 'Warning',
              title: `Low Stock: ${product.name}`,
              message: `Product ${product.name} (${product.productCode}) has stock ${product.openingStock}, below reorder level ${product.reorderLevel || 5}.`,
              module: 'Stock',
              referenceId: product.id,
              referenceCode: product.productCode,
              actionUrl: '/stock',
              ...companyFilter,
            },
          });
          created.push(notification);
        }
      }

      // ─────────────────────────────────────────────────────────
      // 2. OVERDUE HIRE-SALE INSTALLMENTS
      //    Pending/Partial installments past their dueDate
      //    Filtered by hireSales with companyId
      // ─────────────────────────────────────────────────────────
      const overdueInstallments = await tx.hireInstallment.findMany({
        where: {
          status: { in: ['Pending', 'Partial'] },
          dueDate: { lt: new Date() },
          ...(companyId ? { hireSales: { companyId } } : {}),
        },
        include: {
          hireSales: {
            select: {
              invoiceNo: true,
              customerId: true,
              customer: { select: { name: true } },
            },
          },
        },
        take: 50,
      });

      for (const inst of overdueInstallments) {
        const existing = await tx.notification.findFirst({
          where: {
            type: 'OverdueInstallment',
            referenceId: inst.id,
            isDismissed: false,
            ...companyFilter,
          },
        });

        if (!existing) {
          const remaining = safeFinancialSubtract(inst.amount, inst.paidAmount);
          const code = await generateCodeInTx(tx, 'NOT-');
          const notification = await tx.notification.create({
            data: {
              code,
              type: 'OverdueInstallment',
              severity: 'Critical',
              title: `Overdue Installment: ${inst.hireSales.invoiceNo}`,
              message: `Installment #${inst.installmentNo} for ${inst.hireSales.customer.name} is overdue. Amount: ৳${remaining.toLocaleString()} remaining. Due: ${inst.dueDate.toISOString().split('T')[0]}`,
              module: 'HireSales',
              referenceId: inst.id,
              referenceCode: inst.hireSales.invoiceNo,
              actionUrl: '/hire-sales',
              ...companyFilter,
            },
          });
          created.push(notification);
        }
      }

      // Update overdue installment statuses
      await tx.hireInstallment.updateMany({
        where: { status: 'Pending', dueDate: { lt: new Date() } },
        data: { status: 'Overdue' },
      });

      // ─────────────────────────────────────────────────────────
      // 3. DATA INTEGRITY ALERTS
      //    Check for failed/warning data integrity logs (filtered by companyId)
      // ─────────────────────────────────────────────────────────
      if (userRole === 'admin' || userRole === 'manager') {
        const integrityIssues = await tx.dataIntegrityLog.findMany({
          where: {
            status: { in: ['Failed', 'Warning'] },
            ...companyFilter,
          },
          take: 20,
          orderBy: { createdAt: 'desc' },
        });

        for (const issue of integrityIssues) {
          const existing = await tx.notification.findFirst({
            where: {
              type: 'DataIntegrity',
              referenceId: issue.id,
              isDismissed: false,
              ...companyFilter,
            },
          });

          if (!existing) {
            const code = await generateCodeInTx(tx, 'NOT-');
            const notification = await tx.notification.create({
              data: {
                code,
                type: 'DataIntegrity',
                severity: issue.status === 'Failed' ? 'Critical' : 'Warning',
                title: `Data Integrity: ${issue.checkType || 'Check Failed'}`,
                message: issue.details || `Data integrity issue detected: ${issue.checkType || 'Unknown'}. Discrepancy: ${issue.discrepancy}`,
                module: issue.module || 'Ledger',
                referenceId: issue.id,
                referenceCode: issue.code,
                actionUrl: '/chart-of-accounts',
                ...companyFilter,
              },
            });
            created.push(notification);
          }
        }
      }

      // ─────────────────────────────────────────────────────────
      // 4. PERIOD CLOSE REMINDERS
      //    Alert if current month has no period close record yet (filtered by companyId)
      // ─────────────────────────────────────────────────────────
      if (userRole === 'admin' || userRole === 'manager') {
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();

        const periodRecord = await tx.periodClose.findFirst({
          where: { periodMonth: currentMonth, periodYear: currentYear, ...companyFilter },
        });

        // If we're past day 5 and no period close exists for current month, alert
        if (!periodRecord && now.getDate() > 5) {
          const existing = await tx.notification.findFirst({
            where: {
              type: 'PeriodClose',
              isDismissed: false,
              ...companyFilter,
              createdAt: {
                gte: new Date(currentYear, currentMonth - 1, 1),
              },
            },
          });

          if (!existing) {
            const code = await generateCodeInTx(tx, 'NOT-');
            const notification = await tx.notification.create({
              data: {
                code,
                type: 'PeriodClose',
                severity: 'Warning',
                title: `Period Close Pending: ${currentMonth}/${currentYear}`,
                message: `The accounting period for ${currentMonth}/${currentYear} has not been closed yet. Please review and close the period to ensure data integrity.`,
                module: 'PeriodClose',
                actionUrl: '/balance-sheet',
                ...companyFilter,
              },
            });
            created.push(notification);
          }
        }
      }

      // ─────────────────────────────────────────────────────────
      // 5. BALANCE MISMATCH ALERTS (Ledger Integrity)
      //    Groups LedgerEntry by date, checks if SUM(debit) !== SUM(credit)
      //    Only visible to Admin/Manager roles
      //    Filtered by companyId on LedgerEntry
      // ─────────────────────────────────────────────────────────
      if (userRole === 'admin' || userRole === 'manager') {
        // Fetch all active ledger entries filtered by companyId
        const ledgerEntries = await tx.ledgerEntry.findMany({
          where: { isActive: true, ...companyFilter },
          select: {
            id: true,
            entryCode: true,
            date: true,
            debit: true,
            credit: true,
          },
          orderBy: { date: 'desc' },
        });

        // Group by date and compute totals
        const dateGroups: Record<string, { totalDebit: number; totalCredit: number; entryCodes: string[] }> = {};
        for (const entry of ledgerEntries) {
          const dateKey = new Date(entry.date).toISOString().split('T')[0];
          if (!dateGroups[dateKey]) {
            dateGroups[dateKey] = { totalDebit: 0, totalCredit: 0, entryCodes: [] };
          }
          dateGroups[dateKey].totalDebit += entry.debit || 0;
          dateGroups[dateKey].totalCredit += entry.credit || 0;
          dateGroups[dateKey].entryCodes.push(entry.entryCode);
        }

        // Check for imbalances
        for (const [dateKey, totals] of Object.entries(dateGroups)) {
          const difference = Math.abs(totals.totalDebit - totals.totalCredit);
          // Use a small epsilon to avoid floating point false positives
          if (difference > 0.01) {
            // Check if a BalanceMismatch notification already exists for this date
            const existing = await tx.notification.findFirst({
              where: {
                type: 'BalanceMismatch',
                isDismissed: false,
                title: { contains: dateKey },
                ...companyFilter,
              },
            });

            if (!existing) {
              const code = await generateCodeInTx(tx, 'NOT-');
              const notification = await tx.notification.create({
                data: {
                  code,
                  type: 'BalanceMismatch',
                  severity: 'Critical',
                  title: `Balance Mismatch: ${dateKey}`,
                  message: `Ledger imbalance detected on ${dateKey}. Debit total: ৳${totals.totalDebit.toLocaleString()}, Credit total: ৳${totals.totalCredit.toLocaleString()}, Difference: ৳${difference.toLocaleString()}. Affected entries: ${totals.entryCodes.slice(0, 5).join(', ')}${totals.entryCodes.length > 5 ? ` and ${totals.entryCodes.length - 5} more` : ''}.`,
                  module: 'Ledger',
                  referenceCode: totals.entryCodes[0] || null,
                  actionUrl: '/chart-of-accounts',
                  ...companyFilter,
                },
              });
              created.push(notification);
            }
          }
        }
      }

      // ─────────────────────────────────────────────────────────
      // 6. CREDIT LIMIT EXCEEDED ALERTS
      //    Customers with outstanding balance (Dr) exceeding creditLimit
      //    Only visible to Admin/Manager roles
      //    Filtered by companyId via product relation
      // ─────────────────────────────────────────────────────────
      if (userRole === 'admin' || userRole === 'manager') {
        const customersOverLimit = await tx.customer.findMany({
          where: {
            isActive: true,
            openingBalanceType: 'Dr',
            creditLimit: { gt: 0 },
            ...companyFilter,
          },
          select: {
            id: true,
            customerCode: true,
            name: true,
            openingBalance: true,
            openingBalanceType: true,
            creditLimit: true,
            customerType: true,
          },
        });

        const exceededCustomers = customersOverLimit.filter(
          (c: any) => c.openingBalance > c.creditLimit
        );

        for (const customer of exceededCustomers) {
          const existing = await tx.notification.findFirst({
            where: {
              type: 'CreditLimitExceeded',
              referenceId: customer.id,
              isDismissed: false,
              ...companyFilter,
            },
          });

          if (!existing) {
            const code = await generateCodeInTx(tx, 'NOT-');
            const overAmount = safeFinancialSubtract(customer.openingBalance, customer.creditLimit);
            const notification = await tx.notification.create({
              data: {
                code,
                type: 'CreditLimitExceeded',
                severity: 'Warning',
                title: `Credit Limit Exceeded: ${customer.name}`,
                message: `Customer ${customer.name} (${customer.customerCode}) has outstanding balance ৳${customer.openingBalance.toLocaleString()} (Dr) exceeding credit limit ৳${customer.creditLimit.toLocaleString()} by ৳${overAmount.toLocaleString()}. Type: ${customer.customerType}.`,
                module: 'Financial',
                referenceId: customer.id,
                referenceCode: customer.customerCode,
                actionUrl: '/customers',
                ...companyFilter,
              },
            });
            created.push(notification);
          }
        }
      }

      // ─────────────────────────────────────────────────────────
      // 7. STOCK TRANSFER DELAY ALERTS
      //    StockTransfers with shippingStatus = "In-Transit" and
      //    shipped more than 3 days ago without delivery
      //    Filtered by companyId via product relation (StockTransferLine → Product)
      // ─────────────────────────────────────────────────────────
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      const delayedTransfers = await tx.stockTransfer.findMany({
        where: {
          shippingStatus: 'In-Transit',
          shippedAt: { lt: threeDaysAgo },
          isActive: true,
          ...(companyId ? { lines: { some: { product: { companyId } } } } : {}),
        },
        include: {
          fromGodown: { select: { name: true } },
          toGodown: { select: { name: true } },
        },
        take: 50,
      });

      for (const transfer of delayedTransfers) {
        const existing = await tx.notification.findFirst({
          where: {
            type: 'TransferDelay',
            referenceId: transfer.id,
            isDismissed: false,
            ...companyFilter,
          },
        });

        if (!existing) {
          const code = await generateCodeInTx(tx, 'NOT-');
          const shippedDate = transfer.shippedAt
            ? new Date(transfer.shippedAt).toISOString().split('T')[0]
            : 'unknown';
          const daysInTransit = transfer.shippedAt
            ? Math.floor((Date.now() - new Date(transfer.shippedAt).getTime()) / (1000 * 60 * 60 * 24))
            : 0;
          const notification = await tx.notification.create({
            data: {
              code,
              type: 'TransferDelay',
              severity: 'Warning',
              title: `Transfer Delayed: ${transfer.transferNo}`,
              message: `Stock transfer ${transfer.transferNo} from ${transfer.fromGodown.name} to ${transfer.toGodown.name} has been in-transit for ${daysInTransit} days (shipped: ${shippedDate}). Expected delivery within 3 days.`,
              module: 'Stock',
              referenceId: transfer.id,
              referenceCode: transfer.transferNo,
              actionUrl: '/stock',
              ...companyFilter,
            },
          });
          created.push(notification);
        }
      }
    });

    // Audit log for generation with Integrity Sentinel token
    await logUserActivity({
      action: 'CREATE',
      module: 'Audit-Integrity-Sentinel',
      recordLabel: 'Auto-Generate',
      userId: security.user.id,
      userName: security.user.name,
      details: JSON.stringify({
        generatedCount: created.length,
        types: ['LowStock', 'OverdueInstallment', 'DataIntegrity', 'PeriodClose', 'BalanceMismatch', 'CreditLimitExceeded', 'TransferDelay'],
      }),
    });

    // Return fresh count after generation with severity breakdown
    const roleFilter = getRoleModuleFilter(userRole as UserRole, companyId);
    const [unreadCount, criticalCount, warningCount, infoCount] = await Promise.all([
      db.notification.count({
        where: { ...roleFilter, isRead: false, isDismissed: false },
      }),
      db.notification.count({
        where: { ...roleFilter, isRead: false, isDismissed: false, severity: 'Critical' },
      }),
      db.notification.count({
        where: { ...roleFilter, isRead: false, isDismissed: false, severity: 'Warning' },
      }),
      db.notification.count({
        where: { ...roleFilter, isRead: false, isDismissed: false, severity: 'Info' },
      }),
    ]);

    return NextResponse.json({
      success: true,
      generated: created.length,
      count: unreadCount,
      critical: criticalCount,
      warning: warningCount,
      info: infoCount,
      data: created,
    });
  } catch (error) {
    console.error('Notification generate error:', error);
    return NextResponse.json({ error: 'Failed to generate notifications' }, { status: 500 });
  }
}

// Transaction-safe code generator
async function generateCodeInTx(tx: any, prefix: string): Promise<string> {
  const latest = await tx.notification.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: 'desc' },
    select: { code: true },
  });
  if (!latest) return `${prefix}00001`;
  const num = parseInt(latest.code.replace(prefix, ''), 10) || 0;
  return `${prefix}${String(num + 1).padStart(5, '0')}`;
}
