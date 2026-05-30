// ============================================================
// SMS AUTOMATION TRIGGER API ROUTE — Block 12 (Domain 19)
// Auto-SMS dispatch trigger endpoint (server-to-server)
//
// This endpoint is called by other API routes (sales, collections,
// purchase, HR) when an event occurs. It checks the automation
// config and dispatches auto-SMS if the appropriate toggle is ON.
//
// CRITICAL: This route does NOT use withApiSecurity since it's
// called internally by other API routes (server-to-server).
// Instead, it validates the companyId directly and checks a
// header for internal authorization.
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  computeSmsSegments,
  safeFinancialRound,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';

// Valid trigger types mapped to their config toggle field names
const TRIGGER_TOGGLE_MAP: Record<string, string> = {
  purchase: 'smsAlertOnPurchase',
  collection: 'smsAlertOnCollection',
  stock_receive: 'smsAlertOnStockReceive',
  hr_lifecycle: 'smsAlertOnHrLifecycle',
};

const VALID_TRIGGER_TYPES = Object.keys(TRIGGER_TOGGLE_MAP);

// Internal auth header key — other API routes must include this header
const INTERNAL_AUTH_HEADER = 'x-internal-api-call';

// ─────────────────────────────────────────────────────────────
// POST /api/sms-automation/trigger — Auto-SMS dispatch trigger
// ─────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    // Verify the request is from an authorized internal source
    const internalAuth = request.headers.get(INTERNAL_AUTH_HEADER);
    if (!internalAuth || internalAuth !== 'true') {
      return NextResponse.json(
        { error: 'Unauthorized. This endpoint is reserved for internal server-to-server calls only.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { triggerType, recipient, message, companyId, referenceData } = body;

    // ─── Step 1: Validate triggerType ───
    if (!triggerType || !VALID_TRIGGER_TYPES.includes(triggerType)) {
      return NextResponse.json(
        {
          error: `Invalid triggerType. Must be one of: ${VALID_TRIGGER_TYPES.join(', ')}`,
          code: 'INVALID_TRIGGER_TYPE',
        },
        { status: 400 }
      );
    }

    // ─── Step 2: Validate recipient ───
    if (!recipient || typeof recipient !== 'string' || recipient.trim() === '') {
      return NextResponse.json(
        { error: 'Missing or invalid recipient phone number.', code: 'INVALID_RECIPIENT' },
        { status: 400 }
      );
    }

    // Validate phone number format (basic international format check)
    const phoneRegex = /^\+?\d{7,15}$/;
    const trimmedRecipient = recipient.trim();
    if (!phoneRegex.test(trimmedRecipient)) {
      return NextResponse.json(
        { error: 'Invalid recipient phone number format. Expected international format (e.g., +8801XXXXXXXXX).', code: 'INVALID_RECIPIENT_FORMAT' },
        { status: 400 }
      );
    }

    // ─── Step 3: Validate message ───
    if (!message || typeof message !== 'string' || message.trim() === '') {
      return NextResponse.json(
        { error: 'Missing or empty message text.', code: 'INVALID_MESSAGE' },
        { status: 400 }
      );
    }

    // ─── Step 4: Validate companyId ───
    if (!companyId || typeof companyId !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid companyId.', code: 'INVALID_COMPANY_ID' },
        { status: 400 }
      );
    }

    // Verify the company actually exists
    const company = await db.company.findUnique({
      where: { id: companyId },
      select: { id: true, isActive: true },
    });

    if (!company || !company.isActive) {
      return NextResponse.json(
        { error: 'Company not found or inactive.', code: 'INVALID_COMPANY' },
        { status: 400 }
      );
    }

    // ─── Step 5: Look up the SmsAutomationConfig for the given companyId ───
    const automationConfig = await db.smsAutomationConfig.findFirst({
      where: {
        isActive: true,
        companyId,
      },
      orderBy: { createdAt: 'desc' },
    });

    // ─── Step 6: Check the corresponding toggle ───
    const toggleField = TRIGGER_TOGGLE_MAP[triggerType];

    if (!automationConfig || !(automationConfig as Record<string, unknown>)[toggleField]) {
      return NextResponse.json({
        dispatched: false,
        reason: 'Trigger disabled',
        triggerType,
        toggleField,
      });
    }

    // ─── Step 7: Toggle is ON — look up tenant's active SmsSetting for rate calculation ───
    const activeSetting = await db.smsSetting.findFirst({
      where: {
        isActive: true,
        companyId,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!activeSetting) {
      return NextResponse.json(
        {
          error: 'No active SMS gateway settings found for this tenant. Cannot dispatch auto-SMS.',
          code: 'NO_SMS_SETTINGS',
        },
        { status: 400 }
      );
    }

    // ─── Step 8: Compute SMS segments ───
    const { charCount, isUnicode, segmentCount } = computeSmsSegments(message);
    const applicableRate = isUnicode ? activeSetting.unicodeRate : activeSetting.ratePerSms;
    const cost = safeFinancialRound(segmentCount * applicableRate);
    const availableCredits = activeSetting.lastKnownCreditBalance || 0;

    // ─── Step 9: Credit balance check (Campaign Balance Shield) ───
    if (availableCredits > 0 && cost > availableCredits) {
      return NextResponse.json(
        {
          dispatched: false,
          reason: `Insufficient SMS credits. Required: ${cost.toFixed(2)}, Available: ${availableCredits.toFixed(2)}`,
          code: 'INSUFFICIENT_SMS_CREDITS',
          required: cost,
          available: availableCredits,
        },
        { status: 400 }
      );
    }

    // ─── Step 10: Create SmsLog entry ───
    const result = await db.$transaction(async (tx) => {
      const smsLog = await tx.smsLog.create({
        data: {
          recipient: trimmedRecipient,
          message: message.trim(),
          charCount,
          smsSegmentCount: segmentCount,
          isUnicode,
          status: 'Pending',
          sentAt: new Date(),
          cost,
          campaignName: `Auto-SMS: ${triggerType}`,
          isActive: true,
          companyId,
        },
      });

      // Update the SmsSetting's lastKnownCreditBalance
      if (availableCredits > 0) {
        const newBalance = Math.max(0, availableCredits - cost);
        await tx.smsSetting.update({
          where: { id: activeSetting.id },
          data: { lastKnownCreditBalance: safeFinancialRound(newBalance) },
        });
      }

      // Log activity with Comm-SMS-Marketing module token
      await logUserActivity({
        action: 'AUTO_SMS_DISPATCH',
        module: 'Comm-SMS-Marketing',
        recordId: smsLog.id,
        recordLabel: `Auto-SMS: ${triggerType} → ${trimmedRecipient}`,
        userId: 'system',
        userName: 'System (Auto-Dispatch)',
        details: JSON.stringify({
          triggerType,
          toggleField,
          recipient: trimmedRecipient,
          charCount,
          isUnicode,
          segmentCount,
          cost,
          campaignName: smsLog.campaignName,
          companyId,
          creditsBefore: availableCredits,
          creditsAfter: Math.max(0, availableCredits - cost),
          referenceData: referenceData || null,
        }),
      });

      return smsLog;
    });

    // ─── Step 11: Return dispatch confirmation ───
    return NextResponse.json({
      dispatched: true,
      smsLogId: result.id,
      cost,
      segmentCount,
      isUnicode,
      charCount,
      triggerType,
      recipient: trimmedRecipient,
      creditsRemaining: Math.max(0, availableCredits - cost),
    });
  } catch (error) {
    console.error('[SmsAutomation/Trigger] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to process auto-SMS trigger', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
