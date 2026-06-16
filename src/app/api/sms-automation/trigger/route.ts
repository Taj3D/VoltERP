// ============================================================
// SMS AUTOMATION TRIGGER API ROUTE — Block 12 Re-Audit (Domain 19)
// Auto-SMS dispatch trigger endpoint (server-to-server)
//
// HARDENED with:
// - Directive 2: Atomic credit balance check inside $transaction
//   to prevent concurrent dispatch from draining balance below 0
// - Directive 3: Template variable sanitization, summary truncation,
//   invalid phone number handling with SKIPPED_INVALID_NUMBER
// - Directive 1: UDH-aware GSM 03.38 segment computation
// - Fire-and-forget: all errors caught, never crashes the caller
// ============================================================

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  computeSmsSegments,
  safeFinancialRound,
} from '@/lib/api-security';
import { logUserActivity } from '@/lib/activity-logger';
import { createHmac, timingSafeEqual } from 'crypto';

// Valid trigger types mapped to their config toggle field names
const TRIGGER_TOGGLE_MAP: Record<string, string> = {
  purchase: 'autoSmsOnPurchase',
  collection: 'autoSmsOnReceipt',
  stock_receive: 'autoSmsOnStockReceive',
  hr_lifecycle: 'autoSmsOnEmployeeEvent',
  payment_received: 'autoSmsOnPaymentReceive',
  purchase_order_received: 'autoSmsOnGodownReceive',
  employee_joined: 'autoSmsOnEmployeeJoin',
  employee_exam_date: 'autoSmsOnEmployeeExam',
};

const VALID_TRIGGER_TYPES = Object.keys(TRIGGER_TOGGLE_MAP);

// ── Internal API Authentication (HMAC-based) ──
// Replaces the insecure static header check with proper HMAC validation.
// Uses INTERNAL_API_SECRET env var as the shared secret.
// The caller must provide an X-Internal-Timestamp header (epoch ms) and
// an X-Internal-Signature header (HMAC-SHA256 of timestamp+requestBody).
const INTERNAL_AUTH_HEADER = 'x-internal-api-call'; // Kept for backward-compat warning
const INTERNAL_TIMESTAMP_HEADER = 'x-internal-timestamp';
const INTERNAL_SIGNATURE_HEADER = 'x-internal-signature';
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * verifyInternalAuth — Validates HMAC-based internal API authentication.
 * Uses timing-safe comparison to prevent timing attacks.
 *
 * @param request - The incoming NextRequest
 * @param body - The raw request body string
 * @returns true if authentication is valid
 */
function verifyInternalAuth(request: NextRequest, body: string): { valid: boolean; reason?: string } {
  const isProduction = process.env.NODE_ENV === 'production';
  const internalSecret = process.env.INTERNAL_API_SECRET;

  // Check for legacy header and warn
  const legacyHeader = request.headers.get(INTERNAL_AUTH_HEADER);
  if (legacyHeader) {
    console.warn(
      '[SmsTrigger] DEPRECATED: x-internal-api-call header detected. ' +
      'Migrate to HMAC-based authentication (X-Internal-Timestamp + X-Internal-Signature).'
    );
  }

  // In production, INTERNAL_API_SECRET MUST be set
  if (isProduction && !internalSecret) {
    console.error('[SmsTrigger] FATAL: INTERNAL_API_SECRET not set in production. Rejecting request.');
    return { valid: false, reason: 'Internal API authentication not configured.' };
  }

  // In development without INTERNAL_API_SECRET, allow with warning + legacy header check
  if (!internalSecret) {
    console.warn(
      '[SmsTrigger] WARNING: INTERNAL_API_SECRET not set. ' +
      'Development fallback: allowing request with legacy x-internal-api-call header.'
    );
    if (legacyHeader === 'true') {
      return { valid: true };
    }
    return { valid: false, reason: 'Unauthorized. Set INTERNAL_API_SECRET for secure authentication.' };
  }

  // HMAC-based authentication
  const timestamp = request.headers.get(INTERNAL_TIMESTAMP_HEADER);
  const signature = request.headers.get(INTERNAL_SIGNATURE_HEADER);

  if (!timestamp || !signature) {
    return { valid: false, reason: 'Missing internal authentication headers (X-Internal-Timestamp, X-Internal-Signature).' };
  }

  // Validate timestamp freshness (replay protection)
  const ts = Number(timestamp);
  if (isNaN(ts) || Math.abs(Date.now() - ts) > TIMESTAMP_TOLERANCE_MS) {
    return { valid: false, reason: 'Request timestamp expired or invalid.' };
  }

  // Compute expected HMAC: HMAC-SHA256(secret, timestamp + "." + body)
  const message = `${timestamp}.${body}`;
  const expectedSig = createHmac('sha256', internalSecret).update(message).digest('hex');

  // Timing-safe comparison
  try {
    const sigBuf = Buffer.from(signature, 'hex');
    const expectedBuf = Buffer.from(expectedSig, 'hex');
    if (sigBuf.length !== expectedBuf.length) {
      return { valid: false, reason: 'Invalid internal authentication signature.' };
    }
    if (!timingSafeEqual(sigBuf, expectedBuf)) {
      return { valid: false, reason: 'Invalid internal authentication signature.' };
    }
  } catch {
    return { valid: false, reason: 'Invalid internal authentication signature.' };
  }

  return { valid: true };
}

// ─────────────────────────────────────────────────────────────
// DIRECTIVE 3 — Sanitization & Validation Utilities
// ─────────────────────────────────────────────────────────────

/**
 * sanitizeSmsVariable — Strips dangerous characters from template variables
 * before injection into SMS gateway payload.
 */
function sanitizeSmsVariable(value: string): string {
  if (!value) return '';
  return value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/;/g, '')
    .replace(/['"]/g, '')
    .replace(/\\/g, '')
    .trim();
}

/**
 * truncateSummary — Dynamically slices auto-generated string summaries
 * to prevent oversized data from consuming 10+ SMS units.
 */
function truncateSummary(value: string, maxLength: number = 50): string {
  if (!value) return '';
  if (value.length <= maxLength) return value;
  return value.substring(0, maxLength) + '...';
}

/**
 * isValidPhoneNumber — Validates phone number format.
 * Must be numeric digits, optionally starting with +,
 * 7-15 digits long.
 */
function isValidPhoneNumber(phone: string): boolean {
  if (!phone || typeof phone !== 'string') return false;
  const trimmed = phone.trim();
  if (trimmed === '') return false;
  const phoneRegex = /^\+?\d{7,15}$/;
  return phoneRegex.test(trimmed);
}

// ─────────────────────────────────────────────────────────────
// POST /api/sms-automation/trigger — Auto-SMS dispatch trigger
// ─────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    // ── Internal API Authentication (HMAC-based) ──
    // Read the raw body first for HMAC signature verification,
    // then parse it as JSON for request processing.
    const rawBody = await request.text();
    const authResult = verifyInternalAuth(request, rawBody);
    if (!authResult.valid) {
      return NextResponse.json(
        { error: authResult.reason || 'Unauthorized. This endpoint is reserved for internal server-to-server calls only.' },
        { status: 401 }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body.', code: 'INVALID_BODY' },
        { status: 400 }
      );
    }

    const { triggerType, recipient, message, companyId, referenceData } = body as {
      triggerType?: string;
      recipient?: string;
      message?: string;
      companyId?: string;
      referenceData?: unknown;
    };

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

    // ─── Step 2: Validate recipient (Directive 3 — enhanced phone validation) ───
    if (!recipient || typeof recipient !== 'string' || recipient.trim() === '') {
      return NextResponse.json(
        { error: 'Missing or invalid recipient phone number.', code: 'INVALID_RECIPIENT' },
        { status: 400 }
      );
    }

    const trimmedRecipient = recipient.trim();

    // ─── DIRECTIVE 3: Enhanced phone number format validation ───
    if (!isValidPhoneNumber(trimmedRecipient)) {
      // If the recipient phone number format is invalid (e.g., missing country
      // prefix, text string instead of numeric digits), log an SmsLog entry
      // with status "SKIPPED_INVALID_NUMBER" and return gracefully without
      // pinging the gateway API.
      try {
        const skippedLog = await db.smsLog.create({
          data: {
            recipient: trimmedRecipient,
            message: sanitizeSmsVariable(truncateSummary(message || '', 160)),
            charCount: (message || '').length,
            smsSegmentCount: 1,
            isUnicode: false,
            status: 'SKIPPED_INVALID_NUMBER',
            campaignName: `Auto-SMS: ${triggerType}`,
            cost: 0,
            companyId: companyId || '',
            isActive: true,
          },
        });

        await logUserActivity({
          action: 'AUTO_SMS_SKIPPED',
          module: 'Comm-SMS-Marketing',
          recordId: skippedLog.id,
          recordLabel: `Auto-SMS Skipped: Invalid number ${trimmedRecipient}`,
          userId: 'system',
          userName: 'System (Auto-Dispatch)',
          details: JSON.stringify({
            triggerType,
            recipient: trimmedRecipient,
            reason: 'SKIPPED_INVALID_NUMBER',
            referenceData: referenceData || null,
          }),
        });
      } catch (logErr) {
        console.error('[SmsAutomation/Trigger] Failed to log SKIPPED_INVALID_NUMBER:', logErr);
      }

      return NextResponse.json({
        dispatched: false,
        reason: 'Invalid recipient phone number format. Expected international format (e.g., +8801XXXXXXXXX).',
        code: 'SKIPPED_INVALID_NUMBER',
        triggerType,
        recipient: trimmedRecipient,
      });
    }

    // ─── Step 3: Validate message (Directive 3 — sanitize + truncate) ───
    if (!message || typeof message !== 'string' || message.trim() === '') {
      return NextResponse.json(
        { error: 'Missing or empty message text.', code: 'INVALID_MESSAGE' },
        { status: 400 }
      );
    }

    // DIRECTIVE 3: Sanitize template variables and truncate summary fields
    const sanitizedMessage = sanitizeSmsVariable(truncateSummary(message, 300));

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

    // ─── Step 7: Compute SMS segments with UDH-aware calculation (Directive 1) ───
    const { charCount, isUnicode, segmentCount } = computeSmsSegments(sanitizedMessage);

    // ─── Step 8: DIRECTIVE 2 — Atomic credit check + dispatch inside $transaction ───
    // The entire credit check + SmsLog creation + balance update happens inside
    // a single database transaction, preventing concurrent requests from reading
    // stale balance and causing balance to drift below 0.
    const result = await db.$transaction(async (tx) => {
      // Re-read the active SmsSetting INSIDE the transaction for latest balance
      const activeSetting = await tx.smsSetting.findFirst({
        where: {
          isActive: true,
          companyId,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!activeSetting) {
        throw new Error('NO_SMS_SETTINGS');
      }

      const applicableRate = isUnicode ? activeSetting.unicodeRate : activeSetting.ratePerSms;
      const cost = safeFinancialRound(segmentCount * applicableRate);
      const availableCredits = activeSetting.lastKnownCreditBalance || 0;

      // ─── Credit balance shield (atomic inside transaction) ───
      if (availableCredits > 0 && cost > availableCredits) {
        return {
          insufficientCredits: true as const,
          required: cost,
          available: availableCredits,
        };
      }

      // Create SmsLog entry inside transaction
      const smsLog = await tx.smsLog.create({
        data: {
          recipient: trimmedRecipient,
          message: sanitizedMessage,
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

      // Update the SmsSetting's lastKnownCreditBalance atomically
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

      return {
        insufficientCredits: false as const,
        smsLog,
        cost,
        creditsRemaining: Math.max(0, availableCredits - cost),
      };
    });

    // ─── Handle insufficient credits result ───
    if (result.insufficientCredits) {
      return NextResponse.json(
        {
          dispatched: false,
          reason: `Insufficient SMS credits. Required: ${result.required.toFixed(2)}, Available: ${result.available.toFixed(2)}`,
          code: 'INSUFFICIENT_SMS_CREDITS',
          required: result.required,
          available: result.available,
        },
        { status: 400 }
      );
    }

    // ─── Return dispatch confirmation ───
    return NextResponse.json({
      dispatched: true,
      smsLogId: result.smsLog!.id,
      cost: result.cost,
      segmentCount,
      isUnicode,
      charCount,
      triggerType,
      recipient: trimmedRecipient,
      creditsRemaining: result.creditsRemaining,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'NO_SMS_SETTINGS') {
      return NextResponse.json(
        {
          error: 'No active SMS gateway settings found for this tenant. Cannot dispatch auto-SMS.',
          code: 'NO_SMS_SETTINGS',
        },
        { status: 400 }
      );
    }
    console.error('[SmsAutomation/Trigger] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to process auto-SMS trigger', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
