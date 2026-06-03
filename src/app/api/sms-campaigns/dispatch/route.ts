import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/api-security';

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
  try {
    const body = await request.json();
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
    if (activeSetting.creditBalanceLimit > 0) {
      // Calculate estimated cost: count total SMS units that would be sent
      const estimatedCost = campaign.totalSmsUnits || (campaign.recipientCount * campaign.smsUnitsPerMsg);
      if (estimatedCost > activeSetting.creditBalanceLimit) {
        return NextResponse.json(
          { error: `Insufficient SMS API credits. Estimated cost: ${estimatedCost} units, available limit: ${activeSetting.creditBalanceLimit} units. Please top up your SMS credits.` },
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
    if (campaign.filterZone) {
      customerWhere.area = campaign.filterZone;
    }
    if (campaign.filterCustType) {
      customerWhere.customerType = campaign.filterCustType;
    }
    if (campaign.filterDueMin != null) {
      customerWhere.openingBalance = { ...((customerWhere.openingBalance as Record<string, unknown>) || {}), gte: campaign.filterDueMin };
    }
    if (campaign.filterDueMax != null) {
      customerWhere.openingBalance = { ...((customerWhere.openingBalance as Record<string, unknown>) || {}), lte: campaign.filterDueMax };
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
          recordLabel: campaign.campaignName,
          userId: security.user?.id || 'system',
          userName: security.user?.name || 'System',
          details: JSON.stringify({
            action: 'Dispatch',
            campaignName: campaign.campaignName,
            totalRecipients: customers.length,
            successCount,
            failCount,
            status: finalStatus,
          }),
        },
      });
    });

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
      if (body.campaignId) {
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
