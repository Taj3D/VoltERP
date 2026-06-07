import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';
import { dispatchSmsBatch, buildGatewayConfig } from '@/lib/sms-gateway-dispatcher';

// ============================================================
// GSM 03.38 Detection Helper
// ============================================================
const GSM_0338_CHARS = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà^{}\\[~]|€';

function detectEncoding(message: string): { encoding: 'GSM' | 'Unicode'; charsPerPart: number; smsUnits: number } {
  const isGsm = [...message].every(ch => GSM_0338_CHARS.includes(ch) || ch.charCodeAt(0) <= 127);
  const encoding = isGsm ? 'GSM' : 'Unicode';
  const charsPerPart = encoding === 'GSM' ? 160 : 70;
  const smsUnits = message.length > 0 ? Math.ceil(message.length / charsPerPart) : 1;
  return { encoding, charsPerPart, smsUnits };
}

// POST /api/sms-campaigns/dispatch - Dispatch a campaign
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'SmsCampaigns', 'POST');
  if (!security.authorized) return security.response;
  let body: any;
  try {
    body = await request.json();
    const { campaignId } = body;

    if (!campaignId) {
      return NextResponse.json({ error: 'Campaign ID is required' }, { status: 400 });
    }

    // Load the campaign and verify ownership
    const campaign = await db.smsCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Verify companyId
    if (campaign.companyId && security.user.companyId && campaign.companyId !== security.user.companyId) {
      return NextResponse.json({ error: 'Access denied: campaign belongs to another company' }, { status: 403 });
    }

    // Can only dispatch Draft or Queued campaigns
    if (campaign.status !== 'Draft' && campaign.status !== 'Queued') {
      return NextResponse.json(
        { error: `Campaign cannot be dispatched in ${campaign.status} status. Only Draft or Queued campaigns can be dispatched.` },
        { status: 400 }
      );
    }

    // Load active SmsSetting for this companyId
    const settingWhere: Record<string, unknown> = { isActive: true };
    if (campaign.companyId) {
      settingWhere.OR = [{ companyId: campaign.companyId }, { companyId: null }];
    }
    const activeSetting = await db.smsSetting.findFirst({
      where: settingWhere,
      orderBy: { createdAt: 'desc' },
    });

    if (!activeSetting) {
      return NextResponse.json(
        { error: 'No active SMS gateway configuration found. Please configure SMS settings first.' },
        { status: 400 }
      );
    }

    // Check credit balance limit
    if ((activeSetting as any).creditBalanceLimit > 0) {
      // Calculate estimated cost: count total SMS units that would be sent
      const estimatedCost = (campaign as any).totalSmsUnits || (campaign.recipientCount * (campaign as any).smsUnitsPerMsg);
      if (estimatedCost > (activeSetting as any).creditBalanceLimit) {
        return NextResponse.json(
          { error: `Insufficient SMS API credits. Estimated cost: ${estimatedCost} units, available limit: ${(activeSetting as any).creditBalanceLimit} units. Please top up your SMS credits.` },
          { status: 400 }
        );
      }
    }

    // Update campaign status to Dispatching
    await db.smsCampaign.update({
      where: { id: campaignId },
      data: { status: 'Dispatching' },
    });

    // Build customer filter based on campaign filters
    const customerWhere: Record<string, unknown> = { isActive: true, phone: { not: null } };
    if (campaign.companyId) {
      customerWhere.OR = [{ companyId: campaign.companyId }, { companyId: null }];
    }
    if ((campaign as any).filterZone) {
      customerWhere.area = (campaign as any).filterZone;
    }
    if ((campaign as any).filterCustType) {
      customerWhere.customerType = (campaign as any).filterCustType;
    }
    if ((campaign as any).filterDueMin != null) {
      customerWhere.openingBalance = { ...((customerWhere.openingBalance as Record<string, unknown>) || {}), gte: (campaign as any).filterDueMin };
    }
    if ((campaign as any).filterDueMax != null) {
      customerWhere.openingBalance = { ...((customerWhere.openingBalance as Record<string, unknown>) || {}), lte: (campaign as any).filterDueMax };
    }

    // Fetch matching customers
    const customers = await db.customer.findMany({
      where: customerWhere,
      select: { id: true, phone: true, name: true },
    });

    // Calculate encoding for the campaign message
    const { encoding: encodingType, smsUnits } = detectEncoding(campaign.message);

    // Dispatch: create SmsLog records for each recipient
    const dispatchResults: { recipient: string; customerName: string; status: string; error?: string }[] = [];
    let successCount = 0;
    let failCount = 0;
    const createdSmsLogIds: string[] = [];

    await db.$transaction(async (tx) => {
      for (const customer of customers) {
        try {
          if (!customer.phone?.trim()) {
            dispatchResults.push({ recipient: customer.name || customer.id, customerName: customer.name || '', status: 'Skipped', error: 'No phone number' });
            failCount++;
            continue;
          }

          const log = await tx.smsLog.create({
            data: {
              recipient: customer.phone.trim(),
              message: campaign.message,
              status: 'Pending',
              sentAt: new Date(),
              cost: 0,
              encodingType,
              smsUnits,
              campaignId: campaign.id,
              isActive: true,
              ...(campaign.companyId && { companyId: campaign.companyId }),
            },
          });

          createdSmsLogIds.push(log.id);
          dispatchResults.push({ recipient: customer.phone.trim(), customerName: customer.name || '', status: log.status });
          successCount++;
        } catch (err: any) {
          dispatchResults.push({ recipient: customer.phone || customer.id, customerName: customer.name || '', status: 'Failed', error: err.message || 'Insert failed' });
          failCount++;
        }
      }

      // Update campaign status and dispatch log
      const finalStatus = failCount === 0 ? 'Completed' : successCount === 0 ? 'Failed' : 'Completed';
      await tx.smsCampaign.update({
        where: { id: campaignId },
        data: {
          status: finalStatus,
          recipientCount: successCount,
          totalSmsUnits: successCount * smsUnits,
          smsUnitsPerMsg: smsUnits,
          encodingType,
          dispatchLog: JSON.stringify(dispatchResults),
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          module: 'SmsCampaigns',
          recordId: campaignId,
          recordLabel: campaign.name,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({
            action: 'Dispatch',
            campaignName: campaign.name,
            totalRecipients: customers.length,
            successCount,
            failCount,
            status: finalStatus,
          }),
        },
      });
    });

    // ─── Gateway Dispatch: Send Pending SmsLog entries through the SMS gateway ───
    // This happens AFTER the transaction completes successfully.
    // Each message is dispatched independently; failures are recorded per-message.
    if (createdSmsLogIds.length > 0 && activeSetting) {
      try {
        // Fetch the created SmsLog entries that need dispatching
        const pendingLogs = await db.smsLog.findMany({
          where: {
            id: { in: createdSmsLogIds },
            status: 'Pending',
          },
          select: { id: true, recipient: true, message: true },
        });

        if (pendingLogs.length > 0) {
          const gatewayConfig = buildGatewayConfig(activeSetting);

          const batchResult = await dispatchSmsBatch(
            gatewayConfig,
            pendingLogs.map((log) => ({
              smsLogId: log.id,
              recipient: log.recipient,
              message: log.message,
            })),
            { concurrency: 5, delayMs: 100 }
          );

          // Update each SmsLog with the gateway dispatch result
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
              console.error(`[sms-campaign-dispatch] Failed to update SmsLog ${result.smsLogId}:`, updateErr);
            }
          }

          // Update dispatch results with actual gateway status
          for (const result of batchResult.results) {
            const existing = dispatchResults.find(
              (dr) => dr.recipient === result.recipient
            );
            if (existing) {
              existing.status = result.status;
              if (result.error) {
                existing.error = result.error;
              }
            }
          }

          // Recount based on actual gateway results
          successCount = batchResult.sent;
          failCount = batchResult.failed + batchResult.pending;

          // Update campaign with actual dispatch stats
          await db.smsCampaign.update({
            where: { id: campaignId },
            data: {
              sentCount: batchResult.sent,
              failedCount: batchResult.failed,
              status: batchResult.failed === 0 && batchResult.pending === 0 ? 'Completed' : 'Completed',
            },
          });
        }
      } catch (gatewayErr) {
        // Gateway dispatch failed — SmsLog entries remain Pending
        // They can be picked up later by the /api/sms/dispatch-pending route
        console.error('[sms-campaign-dispatch] Gateway dispatch error (entries remain Pending):', gatewayErr);
      }
    }

    return NextResponse.json({
      campaignId,
      totalRecipients: customers.length,
      successCount,
      failCount,
      results: dispatchResults,
    });
  } catch (error) {
    console.error('Error dispatching SMS campaign:', error);
    // Try to mark the campaign as Failed
    try {
      if (body?.campaignId) {
        await db.smsCampaign.update({
          where: { id: body.campaignId },
          data: { status: 'Failed' },
        });
      }
    } catch {
      // Ignore cleanup errors
    }
    return NextResponse.json(
      { error: 'Failed to dispatch SMS campaign' },
      { status: 500 }
    );
  }
}
