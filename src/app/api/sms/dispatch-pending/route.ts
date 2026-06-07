// ============================================================
// SMS DISPATCH PENDING — Retry / Flush Pending SMS Messages
// POST /api/sms/dispatch-pending
//
// Fetches all SmsLog entries with status 'Pending', dispatches
// them through the configured SmsSetting gateway, and updates
// their status to 'Sent' or 'Failed' with the gateway response.
//
// This can be called:
//   - Manually from the admin panel
//   - By a cron job / scheduled task
//   - After a gateway outage is resolved
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';
import { dispatchSmsBatch, buildGatewayConfig } from '@/lib/sms-gateway-dispatcher';

export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'SmsLogs', 'POST');
  if (!security.authorized) return security.response;

  try {
    const body = await request.json().catch(() => ({}));
    const { companyId, limit } = body as { companyId?: string; limit?: number };

    // ─── Fetch all Pending SmsLog entries ───
    const where: Record<string, unknown> = { status: 'Pending', isActive: true };
    if (companyId) {
      where.companyId = companyId;
    }

    const pendingLogs = await db.smsLog.findMany({
      where,
      select: { id: true, recipient: true, message: true, companyId: true },
      orderBy: { createdAt: 'asc' }, // Dispatch oldest first
      take: limit || 500, // Default max 500 per batch to prevent overload
    });

    if (pendingLogs.length === 0) {
      return NextResponse.json({
        message: 'No pending SMS messages to dispatch',
        total: 0,
        sent: 0,
        failed: 0,
        pending: 0,
      });
    }

    // ─── Group by companyId to use the correct gateway per tenant ───
    const byCompany = new Map<string | null, typeof pendingLogs>();
    for (const log of pendingLogs) {
      const key = log.companyId || null;
      if (!byCompany.has(key)) {
        byCompany.set(key, []);
      }
      byCompany.get(key)!.push(log);
    }

    let totalSent = 0;
    let totalFailed = 0;
    let totalPending = 0;
    const errors: string[] = [];

    for (const [compId, logs] of byCompany) {
      // ─── Load active SmsSetting for this company ───
      const settingWhere: Record<string, unknown> = { isActive: true };
      if (compId) {
        settingWhere.OR = [{ companyId: compId }, { companyId: null }];
      }

      const activeSetting = await db.smsSetting.findFirst({
        where: settingWhere,
        orderBy: { createdAt: 'desc' },
      });

      if (!activeSetting) {
        // No gateway configured for this company — skip, leave as Pending
        errors.push(`No SMS gateway configured for company ${compId || '(global)'}. ${logs.length} messages skipped.`);
        totalPending += logs.length;
        continue;
      }

      // ─── Dispatch the batch ───
      const gatewayConfig = buildGatewayConfig(activeSetting);

      const batchResult = await dispatchSmsBatch(
        gatewayConfig,
        logs.map((log) => ({
          smsLogId: log.id,
          recipient: log.recipient,
          message: log.message,
        })),
        { concurrency: 5, delayMs: 100 }
      );

      totalSent += batchResult.sent;
      totalFailed += batchResult.failed;
      totalPending += batchResult.pending;

      // ─── Update each SmsLog with the gateway result ───
      for (const result of batchResult.results) {
        try {
          await db.smsLog.update({
            where: { id: result.smsLogId },
            data: {
              status: result.status,
              gatewayResponse: result.gatewayResponse,
              cost: result.cost,
              ...(result.status === 'Sent' && { sentAt: new Date() }),
            },
          });
        } catch (updateErr) {
          console.error(`[dispatch-pending] Failed to update SmsLog ${result.smsLogId}:`, updateErr);
        }
      }
    }

    // ─── Audit log ───
    try {
      await db.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'SmsLogs',
          recordId: 'dispatch-pending',
          recordLabel: `Dispatch Pending SMS`,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({
            action: 'DispatchPending',
            totalProcessed: pendingLogs.length,
            sent: totalSent,
            failed: totalFailed,
            pending: totalPending,
            companyId: companyId || null,
          }),
        },
      });
    } catch {
      // Audit log failure should not block the response
    }

    return NextResponse.json({
      message: 'Pending SMS dispatch completed',
      total: pendingLogs.length,
      sent: totalSent,
      failed: totalFailed,
      pending: totalPending,
      ...(errors.length > 0 && { errors }),
    });
  } catch (error) {
    console.error('[dispatch-pending] Error:', error);
    return NextResponse.json(
      { error: 'Failed to dispatch pending SMS messages' },
      { status: 500 }
    );
  }
}

// GET /api/sms/dispatch-pending — Preview count of pending messages
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'SmsLogs', 'GET');
  if (!security.authorized) return security.response;

  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    const where: Record<string, unknown> = { status: 'Pending', isActive: true };
    if (companyId) {
      where.companyId = companyId;
    }

    const pendingCount = await db.smsLog.count({ where });

    // Also count by company for overview
    const byCompany = await db.smsLog.groupBy({
      by: ['companyId'],
      where: { status: 'Pending', isActive: true },
      _count: { id: true },
    });

    return NextResponse.json({
      totalPending: pendingCount,
      byCompany: byCompany.map((entry) => ({
        companyId: entry.companyId,
        count: entry._count.id,
      })),
    });
  } catch (error) {
    console.error('[dispatch-pending] GET Error:', error);
    return NextResponse.json(
      { error: 'Failed to count pending SMS messages' },
      { status: 500 }
    );
  }
}
