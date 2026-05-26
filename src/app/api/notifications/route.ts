// ============================================================
// NOTIFICATIONS API — CRUD + Auto-Generate
// Group 5: Financial Auditing, Automated Ledgers & Data Integrity
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity, type UserRole } from '@/lib/api-security';

// Inline code generator for models not in generateNextCode
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

// GET /api/notifications — List notifications with filters
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'Reports', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const userRole = security.user.role as UserRole;
    const isVatAuditor = userRole === 'vat_auditor';

    // Dealer blocked entirely
    if (userRole === 'dealer') {
      return NextResponse.json(
        { error: 'Access denied. Dealers cannot access notifications.' },
        { status: 403 }
      );
    }

    const action = searchParams.get('action');

    // Auto-generate notifications
    if (action === 'generate') {
      return await generateNotifications(security, isVatAuditor);
    }

    // Build filter
    const where: Record<string, unknown> = {};

    // SR can only see notifications where module is NOT "Ledger" or "Financial"
    if (userRole === 'sr') {
      where.module = { notIn: ['Ledger', 'Financial'] };
    }

    const type = searchParams.get('type');
    const severity = searchParams.get('severity');
    const isRead = searchParams.get('isRead');
    const isDismissed = searchParams.get('isDismissed');
    const modFilter = searchParams.get('module');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    if (type) where.type = type;
    if (severity) where.severity = severity;
    if (isRead !== null && isRead !== undefined && isRead !== '') {
      where.isRead = isRead === 'true';
    }
    if (isDismissed !== null && isDismissed !== undefined && isDismissed !== '') {
      where.isDismissed = isDismissed === 'true';
    }
    if (modFilter) {
      // If SR, also ensure the module filter doesn't expose Ledger/Financial
      if (userRole === 'sr' && (modFilter === 'Ledger' || modFilter === 'Financial')) {
        return NextResponse.json({ notifications: [], total: 0, limit, offset });
      }
      where.module = modFilter;
    }

    // Fetch notifications: unread first, then by createdAt desc
    const [notifications, total] = await Promise.all([
      db.notification.findMany({
        where,
        orderBy: [{ isRead: 'asc' }, { createdAt: 'desc' }],
        take: limit,
        skip: offset,
      }),
      db.notification.count({ where }),
    ]);

    // Mask for VAT Auditor
    const masked = notifications.map((n: any) => ({
      ...n,
      message: isVatAuditor && (n.module === 'Ledger' || n.module === 'Financial')
        ? maskForVat(n.message, true)
        : n.message,
    }));

    return NextResponse.json({ notifications: masked, total, limit, offset });
  } catch (error) {
    console.error('Notifications GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
  }
}

// POST /api/notifications — Create a notification
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'Reports', 'POST');
  if (!security.authorized) return security.response;

  try {
    const userRole = security.user.role as UserRole;

    // Dealer blocked entirely
    if (userRole === 'dealer') {
      return NextResponse.json(
        { error: 'Access denied. Dealers cannot create notifications.' },
        { status: 403 }
      );
    }

    const body = await request.json();
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
      },
    });

    // Audit log
    await db.auditLog.create({
      data: {
        action: 'CREATE',
        module: 'Notifications',
        recordId: notification.id,
        recordLabel: notification.code,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({ type, title, module }),
      },
    });

    return NextResponse.json({ notification }, { status: 201 });
  } catch (error) {
    console.error('Notifications POST error:', error);
    return NextResponse.json({ error: 'Failed to create notification' }, { status: 500 });
  }
}

// PUT /api/notifications — Mark as read or dismiss
export async function PUT(request: NextRequest) {
  const security = await withApiSecurity(request, 'Reports', 'PUT');
  if (!security.authorized) return security.response;

  try {
    const userRole = security.user.role as UserRole;

    if (userRole === 'dealer') {
      return NextResponse.json(
        { error: 'Access denied. Dealers cannot update notifications.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { id, isRead, isDismissed, dismissedBy } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing required field: id' }, { status: 400 });
    }

    const existing = await db.notification.findUnique({ where: { id } });
    if (!existing) {
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
    if (isRead !== undefined) updateData.isRead = isRead;
    if (isDismissed !== undefined) {
      updateData.isDismissed = isDismissed;
      if (isDismissed) {
        updateData.dismissedAt = new Date();
        updateData.dismissedBy = dismissedBy || security.user.name;
      }
    }

    const notification = await db.notification.update({
      where: { id },
      data: updateData,
    });

    // Audit log
    await db.auditLog.create({
      data: {
        action: 'UPDATE',
        module: 'Notifications',
        recordId: notification.id,
        recordLabel: notification.code,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify(updateData),
      },
    });

    return NextResponse.json({ notification });
  } catch (error) {
    console.error('Notifications PUT error:', error);
    return NextResponse.json({ error: 'Failed to update notification' }, { status: 500 });
  }
}

// Auto-generate notifications for low-stock products and overdue installments
async function generateNotifications(
  security: { authorized: true; user: { id: string; email: string; name: string; role: string } },
  _isVatAuditor: boolean
) {
  const userRole = security.user.role as UserRole;

  if (userRole === 'dealer') {
    return NextResponse.json(
      { error: 'Access denied. Dealers cannot generate notifications.' },
      { status: 403 }
    );
  }

  const created: any[] = [];

  try {
    // 1. Low-stock products
    const lowStockProducts = await db.product.findMany({
      where: {
        isActive: true,
        openingStock: { lte: 5 },
      },
      select: {
        id: true,
        productCode: true,
        name: true,
        openingStock: true,
        reorderLevel: true,
      },
      take: 50,
    });

    // Filter for products where stock <= reorderLevel
    const actualLowStock = lowStockProducts.filter(
      (p: any) => p.openingStock <= (p.reorderLevel || 5)
    );

    for (const product of actualLowStock) {
      // Check if a notification already exists for this product
      const existing = await db.notification.findFirst({
        where: {
          type: 'LowStock',
          referenceId: product.id,
          isDismissed: false,
        },
      });

      if (!existing) {
        const code = await generateCode('notification', 'NOT-');
        const notification = await db.notification.create({
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
          },
        });
        created.push(notification);
      }
    }

    // 2. Overdue installments (SR can see overdue installments since module is HireSales, not Ledger/Financial)
    const overdueInstallments = await db.hireInstallment.findMany({
      where: {
        status: { in: ['Pending', 'Partial'] },
        dueDate: { lt: new Date() },
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
      const existing = await db.notification.findFirst({
        where: {
          type: 'OverdueInstallment',
          referenceId: inst.id,
          isDismissed: false,
        },
      });

      if (!existing) {
        const code = await generateCode('notification', 'NOT-');
        const notification = await db.notification.create({
          data: {
            code,
            type: 'OverdueInstallment',
            severity: 'Critical',
            title: `Overdue Installment: ${inst.hireSales.invoiceNo}`,
            message: `Installment #${inst.installmentNo} for ${inst.hireSales.customer.name} is overdue. Amount: ${inst.amount - inst.paidAmount} remaining. Due: ${inst.dueDate.toISOString().split('T')[0]}`,
            module: 'HireSales',
            referenceId: inst.id,
            referenceCode: inst.hireSales.invoiceNo,
            actionUrl: '/hire-sales',
          },
        });
        created.push(notification);
      }
    }

    // Also mark overdue installments
    await db.hireInstallment.updateMany({
      where: { status: 'Pending', dueDate: { lt: new Date() } },
      data: { status: 'Overdue' },
    });

    // Audit log
    await db.auditLog.create({
      data: {
        action: 'CREATE',
        module: 'Notifications',
        recordLabel: 'Auto-Generate',
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({ generatedCount: created.length, types: ['LowStock', 'OverdueInstallment'] }),
      },
    });

    return NextResponse.json({
      generated: created.length,
      notifications: created,
    });
  } catch (error) {
    console.error('Notification generate error:', error);
    return NextResponse.json({ error: 'Failed to generate notifications' }, { status: 500 });
  }
}
