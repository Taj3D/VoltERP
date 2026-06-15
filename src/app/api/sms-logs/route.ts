// ============================================================
// SMS LOGS API ROUTE — Stage 11 Rebuild
// Multi-tenant companyId isolation, RBAC, VAT Auditor masking,
// SMS character computation (computeSmsSegments), Activity logging
// with SMS-Gateway-Dispatch (single) / SMS-Campaign-Marketing (bulk)
// NOW: Actually dispatches SMS through the gateway (not just Pending)
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  maskSmsArray,
  computeSmsSegments,
  safeFinancialRound,
  formatFinancialField,
  stripHtml,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';
import { getCachedSmsSettings } from '@/lib/sms-settings-cache';
import { dispatchSingleSms, dispatchSmsBatch, buildGatewayConfig } from '@/lib/sms-gateway-dispatcher';

// Helper: convert empty string to null
function nullIfEmpty(val: string | undefined | null): string | null {
  if (val === undefined || val === null || val.trim() === '') return null;
  return val;
}

// GET /api/sms-logs — List all active SMS logs for current tenant
export async function GET(request: NextRequest) {
  const security = await withApiSecurity(request, 'SmsLogs', 'GET');
  if (!security.authorized) return security.response;

  try {
    const companyId = security.user.companyId;
    const where: Record<string, unknown> = { isActive: true };
    if (companyId) {
      where.companyId = companyId;
    }

    const items = await db.smsLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    // Apply VAT Auditor masking + format empty fields
    const masked = maskSmsArray(
      items.map((item) => ({
        ...item,
        gatewayResponse: formatFinancialField(item.gatewayResponse),
        campaignName: formatFinancialField(item.campaignName),
      })),
      security.user.role
    );

    return NextResponse.json(masked);
  } catch (error) {
    console.error('[SmsLogs] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch SMS logs' },
      { status: 500 }
    );
  }
}

// POST /api/sms-logs — Create SMS log (single or bulk) AND dispatch through gateway
// SR can dispatch individual SMS (not blocked by WRITE_DENY for SmsLogs)
// Bulk mode uses SMS-Campaign-Marketing module token
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'SmsLogs', 'POST');
  if (!security.authorized) return security.response;

  try {
    const body = await request.json();
    const companyId = security.user.companyId;

    // Bulk mode: array of recipients with same message
    if (body.batchMode && Array.isArray(body.recipients)) {
      const message: string = body.message || '';
      const campaignName = nullIfEmpty(body.campaignName);

      if (!message || body.recipients.length === 0) {
        return NextResponse.json(
          { error: 'Missing required fields: message, recipients (non-empty array)' },
          { status: 400 }
        );
      }

      // Sanitize message to prevent XSS
      const sanitizedMessage = stripHtml(message);
      const sanitizedCampaignName = campaignName ? stripHtml(campaignName) : null;

      // Deduplicate recipients
      const uniqueRecipients = [...new Set(body.recipients.map((r: string) => r.trim()).filter(Boolean))];

      // Get tenant's active SmsSetting for rate calculation (cached)
      let ratePerSms = 0;
      let unicodeRate = 0;
      const activeSetting = await getCachedSmsSettings(companyId);
      if (activeSetting) {
        ratePerSms = activeSetting.ratePerSms;
        unicodeRate = activeSetting.unicodeRate;
      }

      // Compute SMS segments
      const { charCount, isUnicode, segmentCount } = computeSmsSegments(sanitizedMessage);
      const applicableRate = isUnicode ? unicodeRate : ratePerSms;
      const costPerRecipient = safeFinancialRound(segmentCount * applicableRate);

      // 1. Create SmsLog entries inside a transaction
      const createdRecords = await db.$transaction(async (tx) => {
        const records = [];

        for (const recipient of uniqueRecipients) {
          if (!recipient || typeof recipient !== 'string') continue;

          const record = await tx.smsLog.create({
            data: {
              recipient: recipient.trim(),
              message: sanitizedMessage,
              charCount,
              smsSegmentCount: segmentCount,
              isUnicode,
              status: 'Pending',
              gatewayResponse: nullIfEmpty(body.gatewayResponse),
              sentAt: new Date(),
              cost: costPerRecipient,
              campaignName: sanitizedCampaignName,
              isActive: body.isActive ?? true,
              ...(companyId && { companyId }),
            },
          });
          records.push(record);
        }

        // Activity log with SMS-Campaign-Marketing module token for bulk
        await logUserActivity({
          tx: tx,
          action: 'CREATE',
          module: 'SMS-Campaign-Marketing',
          recordId: 'BATCH',
          recordLabel: sanitizedCampaignName || `Bulk: ${records.length} recipients`,
          userId: security.user.id,
          userName: security.user.name,
          details: JSON.stringify({
            batchMode: true,
            recipientCount: records.length,
            campaignName: sanitizedCampaignName,
            charCount,
            isUnicode,
            segmentCount,
            costPerRecipient,
            totalCost: safeFinancialRound(records.length * costPerRecipient),
          }),
        });

        return records;
      });

      // 2. AFTER transaction commits: dispatch through gateway
      if (activeSetting) {
        const gatewayConfig = buildGatewayConfig(activeSetting);
        const batchResult = await dispatchSmsBatch(
          gatewayConfig,
          createdRecords.map((record) => ({
            smsLogId: record.id,
            recipient: record.recipient,
            message: record.message,
          })),
          { concurrency: 5, delayMs: 100 }
        );

        // Update each SmsLog with its individual gateway result
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
            console.error(`[SmsLogs] Failed to update bulk SmsLog ${result.smsLogId}:`, updateErr);
          }
        }

        // Update createdRecords with dispatch results for response
        const resultMap = new Map(batchResult.results.map((r) => [r.smsLogId, r]));
        for (const record of createdRecords) {
          const dispatchResult = resultMap.get(record.id);
          if (dispatchResult) {
            (record as Record<string, unknown>).status = dispatchResult.status;
            (record as Record<string, unknown>).gatewayResponse = dispatchResult.gatewayResponse;
            (record as Record<string, unknown>).cost = dispatchResult.cost;
            if (dispatchResult.status === 'Sent') {
              (record as Record<string, unknown>).sentAt = new Date();
            }
          }
        }
      }
      // If no activeSetting, records stay as "Pending" — dispatch-pending route can retry later

      // Apply VAT Auditor masking
      const masked = maskSmsArray(
        createdRecords.map((item) => ({
          ...item,
          gatewayResponse: formatFinancialField(item.gatewayResponse as string | null),
          campaignName: formatFinancialField(item.campaignName as string | null),
        })),
        security.user.role
      );

      return NextResponse.json(masked, { status: 201 });
    }

    // Single SMS dispatch mode
    const { recipient, message } = body;
    if (!recipient || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: recipient, message' },
        { status: 400 }
      );
    }

    // Sanitize to prevent XSS
    const sanitizedRecipient = stripHtml(recipient);
    const sanitizedMessage = stripHtml(message);

    // Get tenant's active SmsSetting for rate calculation (cached)
    let ratePerSms = 0;
    let unicodeRate = 0;
    const activeSetting = await getCachedSmsSettings(companyId);
    if (activeSetting) {
      ratePerSms = activeSetting.ratePerSms;
      unicodeRate = activeSetting.unicodeRate;
    }

    // Compute SMS segments
    const { charCount, isUnicode, segmentCount } = computeSmsSegments(sanitizedMessage);
    const applicableRate = isUnicode ? unicodeRate : ratePerSms;
    const cost = safeFinancialRound(segmentCount * applicableRate);

    // 1. Create SmsLog entry inside a transaction
    const item = await db.$transaction(async (tx) => {
      const record = await tx.smsLog.create({
        data: {
          recipient: sanitizedRecipient,
          message: sanitizedMessage,
          charCount,
          smsSegmentCount: segmentCount,
          isUnicode,
          status: 'Pending',
          gatewayResponse: nullIfEmpty(body.gatewayResponse),
          sentAt: new Date(),
          cost,
          campaignName: nullIfEmpty(body.campaignName ? stripHtml(body.campaignName) : undefined),
          isActive: body.isActive ?? true,
          ...(companyId && { companyId }),
        },
      });

      // Activity log with SMS-Gateway-Dispatch module token for single dispatch
      await logUserActivity({
          tx: tx,
        action: 'CREATE',
        module: 'SMS-Gateway-Dispatch',
        recordId: record.id,
        recordLabel: record.recipient || record.id,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          recipient: record.recipient,
          charCount,
          isUnicode,
          segmentCount,
          cost: record.cost,
          status: record.status,
        }),
      });

      return record;
    });

    // 2. AFTER transaction commits: dispatch through gateway
    let finalStatus = item.status;
    let finalGatewayResponse = item.gatewayResponse;
    let finalCost = item.cost;
    let finalSentAt: Date | null = item.sentAt;

    if (activeSetting) {
      try {
        const gatewayConfig = buildGatewayConfig(activeSetting);
        const dispatchResult = await dispatchSingleSms(gatewayConfig, {
          smsLogId: item.id,
          recipient: sanitizedRecipient,
          message: sanitizedMessage,
        });

        finalStatus = dispatchResult.status;
        finalGatewayResponse = dispatchResult.gatewayResponse;
        finalCost = dispatchResult.cost;
        finalSentAt = dispatchResult.status === 'Sent' ? new Date() : item.sentAt;

        // Update the SmsLog with the gateway result
        await db.smsLog.update({
          where: { id: item.id },
          data: {
            status: dispatchResult.status,
            gatewayResponse: dispatchResult.gatewayResponse,
            cost: dispatchResult.cost,
            ...(dispatchResult.status === 'Sent' && { sentAt: new Date() }),
          },
        });
      } catch (dispatchErr) {
        // Gateway dispatch failed — mark as Failed
        finalStatus = 'Failed';
        finalGatewayResponse = dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr);

        await db.smsLog.update({
          where: { id: item.id },
          data: {
            status: 'Failed',
            gatewayResponse: finalGatewayResponse,
          },
        });
      }
    }
    // If no activeSetting, the SmsLog stays as "Pending" — dispatch-pending route can retry later

    // Apply VAT Auditor masking on response
    const masked = maskSmsArray(
      [
        {
          ...item,
          status: finalStatus,
          gatewayResponse: formatFinancialField(finalGatewayResponse),
          campaignName: formatFinancialField(item.campaignName),
          cost: finalCost,
          sentAt: finalSentAt,
        },
      ],
      security.user.role
    );

    return NextResponse.json(masked[0], { status: 201 });
  } catch (error) {
    console.error('[SmsLogs] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to create SMS log' },
      { status: 500 }
    );
  }
}
