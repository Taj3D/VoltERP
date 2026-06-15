// ============================================================
// SMS DISPATCH EVENT API ROUTE
// Event-triggered SMS dispatch endpoint.
// Finds active SmsNotificationTrigger for the given eventType,
// replaces {{variable}} placeholders, creates SmsLog entry,
// computes segments and cost, logs activity.
// NOW: Actually dispatches SMS through the gateway (not just Pending)
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  withApiSecurity,
  maskForVatAuditorSms,
  computeSmsSegments,
  safeFinancialRound,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';
import { getCachedSmsSettings } from '@/lib/sms-settings-cache';
import { dispatchSingleSms, buildGatewayConfig } from '@/lib/sms-gateway-dispatcher';

// Valid event types
const VALID_EVENT_TYPES = [
  'SalesConfirmation',
  'FinancialCollection',
  'InventoryIngestion',
  'HRLifecycle',
] as const;

// POST /api/sms-dispatch/event — Event-triggered SMS dispatch
export async function POST(request: NextRequest) {
  const security = await withApiSecurity(request, 'SmsLogs', 'POST');
  if (!security.authorized) return security.response;

  try {
    const body = await request.json();
    const { eventType, recipientPhone, templateVariables, companyId: bodyCompanyId } = body;

    // Validate required fields
    if (!eventType) {
      return NextResponse.json(
        { error: 'Missing required field: eventType' },
        { status: 400 }
      );
    }

    if (!VALID_EVENT_TYPES.includes(eventType as typeof VALID_EVENT_TYPES[number])) {
      return NextResponse.json(
        { error: `Invalid eventType. Must be one of: ${VALID_EVENT_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    if (!recipientPhone || typeof recipientPhone !== 'string' || recipientPhone.trim() === '') {
      return NextResponse.json(
        { error: 'Missing required field: recipientPhone' },
        { status: 400 }
      );
    }

    // Use companyId from security context, fallback to body
    const companyId = security.user.companyId || bodyCompanyId || null;

    // Find active SmsNotificationTrigger for the given eventType and isEnabled=true
    const trigger = await db.smsNotificationTrigger.findFirst({
      where: {
        eventType,
        isEnabled: true,
        isActive: true,
        ...(companyId ? { companyId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    // If no active trigger found, return 200 with not-triggered response
    if (!trigger) {
      return NextResponse.json({
        triggered: false,
        reason: 'No active notification trigger for this event type',
        eventType,
      });
    }

    // Replace {{variable}} placeholders in templateBody with actual values
    let message = trigger.templateBody;
    if (templateVariables && typeof templateVariables === 'object') {
      for (const [key, value] of Object.entries(templateVariables)) {
        const placeholder = `{{${key}}}`;
        message = message.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), String(value));
      }
    }

    // Compute SMS segments and cost
    const { charCount, isUnicode, segmentCount } = computeSmsSegments(message);

    // Get active SmsSetting for rate calculation (cached)
    let ratePerSms = 0;
    let unicodeRate = 0;
    const activeSetting = await getCachedSmsSettings(companyId);
    if (activeSetting) {
      ratePerSms = activeSetting.ratePerSms;
      unicodeRate = activeSetting.unicodeRate;
    }

    const applicableRate = isUnicode ? unicodeRate : ratePerSms;
    const cost = safeFinancialRound(segmentCount * applicableRate);

    // 1. Create SmsLog entry inside a transaction
    const smsLog = await db.$transaction(async (tx) => {
      const record = await tx.smsLog.create({
        data: {
          recipient: recipientPhone.trim(),
          message,
          charCount,
          smsSegmentCount: segmentCount,
          isUnicode,
          status: 'Pending',
          cost,
          triggerType: eventType,
          sentAt: new Date(),
          ...(companyId && { companyId }),
        },
      });

      // Activity log with SMS-Notification-Trigger module token
      await logUserActivity({
        tx,
        action: 'CREATE',
        module: 'SMS-Notification-Trigger',
        recordId: record.id,
        recordLabel: `Event: ${eventType} → ${recipientPhone}`,
        userId: security.user.id,
        userName: security.user.name,
        details: JSON.stringify({
          eventType,
          triggerCode: trigger.code,
          triggerLabel: trigger.label,
          recipient: recipientPhone,
          charCount,
          isUnicode,
          segmentCount,
          cost,
          templateVariables: templateVariables || {},
        }),
      });

      return record;
    });

    // 2. AFTER transaction commits: dispatch through gateway
    let finalStatus = smsLog.status;
    let finalGatewayResponse = smsLog.gatewayResponse;
    let finalCost = smsLog.cost;
    let finalSentAt: Date | null = smsLog.sentAt;

    if (activeSetting) {
      try {
        const gatewayConfig = buildGatewayConfig(activeSetting);
        const dispatchResult = await dispatchSingleSms(gatewayConfig, {
          smsLogId: smsLog.id,
          recipient: recipientPhone.trim(),
          message,
        });

        finalStatus = dispatchResult.status;
        finalGatewayResponse = dispatchResult.gatewayResponse;
        finalCost = dispatchResult.cost;
        finalSentAt = dispatchResult.status === 'Sent' ? new Date() : smsLog.sentAt;

        // Update the SmsLog with the gateway result
        await db.smsLog.update({
          where: { id: smsLog.id },
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
          where: { id: smsLog.id },
          data: {
            status: 'Failed',
            gatewayResponse: finalGatewayResponse,
          },
        });
      }
    }
    // If no activeSetting, the SmsLog stays as "Pending" — dispatch-pending route can retry later

    // Apply VAT Auditor masking
    const masked = maskForVatAuditorSms(
      {
        ...smsLog,
        status: finalStatus,
        gatewayResponse: finalGatewayResponse,
        cost: finalCost,
        sentAt: finalSentAt,
      } as Record<string, unknown>,
      security.user.role
    );

    return NextResponse.json({
      triggered: true,
      smsLog: masked,
      trigger: {
        code: trigger.code,
        label: trigger.label,
        eventType: trigger.eventType,
        recipientType: trigger.recipientType,
      },
    });
  } catch (error) {
    console.error('[SmsDispatch/Event] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to dispatch event-triggered SMS' },
      { status: 500 }
    );
  }
}
