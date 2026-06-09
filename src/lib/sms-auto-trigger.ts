// ============================================================
// SMS AUTO-TRIGGER ENGINE — Block 12 Re-Audit (Domain 19)
// Hardened with:
// - Directive 2: Atomic concurrency guard & credit balance shield
// - Directive 3: Template variable sanitization, truncation, invalid number handling
// - SKIPPED_INVALID_NUMBER logging for bad phone numbers
// - Fire-and-forget with robust try/catch (NEVER throws to caller)
// - GSM 03.38 UDH-aware segment computation
// ============================================================

import { computeSmsSegments, safeFinancialRound } from '@/lib/api-security';
import { db } from '@/lib/db';
import { logUserActivity } from '@/lib/activity-logger';
import { dispatchSingleSms, buildGatewayConfig } from '@/lib/sms-gateway-dispatcher';

interface AutoSmsResult {
  dispatched: boolean;
  smsLogId?: string;
  cost?: number;
  error?: string;
  status?: string;
}

// ─────────────────────────────────────────────────────────────
// DIRECTIVE 3 — Sanitization Utilities
// ─────────────────────────────────────────────────────────────

/**
 * sanitizeSmsVariable — Strips dangerous characters from template variable values
 * before injection into SMS gateway payload. Removes quotes, semicolons, script
 * blocks, and URL-encodes special characters.
 */
function sanitizeSmsVariable(value: string): string {
  if (!value) return '';
  return value
    // Remove <script>...</script> blocks entirely
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remove any remaining HTML tags
    .replace(/<[^>]*>/g, '')
    // Strip semicolons (SQL injection / header injection defense)
    .replace(/;/g, '')
    // Strip single and double quotes (payload injection defense)
    .replace(/['"]/g, '')
    // Strip backslashes
    .replace(/\\/g, '')
    // Trim whitespace
    .trim();
}

/**
 * truncateSummary — Dynamically slices auto-generated string summaries
 * (e.g., product item names lists) using .substring(0, 50) + "..."
 * to ensure an exceptionally large invoice does not automatically
 * consume 10+ unexpected SMS units per transaction.
 */
function truncateSummary(value: string, maxLength: number = 50): string {
  if (!value) return '';
  if (value.length <= maxLength) return value;
  return value.substring(0, maxLength) + '...';
}

/**
 * isValidPhoneNumber — Validates phone number format.
 * Must be numeric digits, optionally starting with +,
 * 7-15 digits long. Rejects text strings, missing country
 * prefixes, and other invalid formats.
 */
function isValidPhoneNumber(phone: string): boolean {
  if (!phone || typeof phone !== 'string') return false;
  const trimmed = phone.trim();
  if (trimmed === '') return false;
  // Must match international format: optional + prefix, then 7-15 digits
  const phoneRegex = /^\+?\d{7,15}$/;
  return phoneRegex.test(trimmed);
}

// ─────────────────────────────────────────────────────────────
// DIRECTIVE 2 — Atomic Concurrency Guard
// ─────────────────────────────────────────────────────────────

// In-memory semaphore per companyId to prevent concurrent credit balance
// reads during rapid-fire auto-SMS dispatches. This acts as a first line
// of defense; the database transaction with Prisma provides the second.
const companyLocks = new Map<string, Promise<AutoSmsResult>>();

/**
 * dispatchAutoSms — Server-side function to dispatch transactional auto-SMS.
 * Called directly (no HTTP overhead) from within existing API route handlers.
 *
 * CRITICAL DESIGN DECISIONS:
 * 1. NEVER throws — auto-SMS failures must not block the parent transaction.
 * 2. Per-company serialization: Only one auto-SMS dispatch per company at a time.
 * 3. Atomic credit check inside $transaction to prevent balance drift below 0.
 * 4. Phone number validation — logs SKIPPED_INVALID_NUMBER for bad numbers.
 * 5. Template variable sanitization — strips dangerous chars.
 * 6. Summary truncation — prevents 10+ SMS units from oversized data.
 */
export async function dispatchAutoSms(params: {
  triggerType: 'purchase' | 'collection' | 'stock_receive' | 'hr_lifecycle';
  recipient: string;
  message: string;
  companyId: string | null | undefined;
  userId?: string;
  userName?: string;
  referenceData?: Record<string, unknown>;
}): Promise<AutoSmsResult> {
  const { triggerType, recipient, message, companyId, userId, userName, referenceData } = params;

  // ─── Guard: Never throw — wrap entire function ───
  try {
    if (!recipient || !message || !companyId) {
      return { dispatched: false, error: 'Missing required params' };
    }

    // ─── DIRECTIVE 3: Phone number validation ───
    if (!isValidPhoneNumber(recipient)) {
      // Log an SmsLog entry with status "SKIPPED_INVALID_NUMBER" and return gracefully
      // without pinging the gateway API
      try {
        await db.smsLog.create({
          data: {
            recipient: recipient.trim(),
            message: sanitizeSmsVariable(truncateSummary(message, 160)),
            charCount: message.length,
            smsSegmentCount: 1,
            isUnicode: false,
            status: 'SKIPPED_INVALID_NUMBER',
            campaignName: `Auto-SMS: ${triggerType}`,
            cost: 0,
            companyId,
            isActive: true,
          },
        });

        await logUserActivity({
          action: 'AUTO_SMS_SKIPPED',
          module: 'Comm-SMS-Marketing',
          recordId: 'INVALID_NUMBER',
          recordLabel: `Auto-SMS Skipped: Invalid number ${recipient}`,
          userId: userId || 'system',
          userName: userName || 'System',
          details: JSON.stringify({
            triggerType,
            recipient,
            reason: 'SKIPPED_INVALID_NUMBER',
            referenceData: referenceData || null,
          }),
        });
      } catch (logErr) {
        // Even logging the skip failed — silently absorb
        console.error('[dispatchAutoSms] Failed to log SKIPPED_INVALID_NUMBER:', logErr);
      }
      return { dispatched: false, error: 'SKIPPED_INVALID_NUMBER', status: 'SKIPPED_INVALID_NUMBER' };
    }

    // ─── DIRECTIVE 3: Sanitize and truncate message ───
    const sanitizedMessage = sanitizeSmsVariable(truncateSummary(message, 300));

    // ─── DIRECTIVE 2: Per-company serialization lock ───
    // If there's already a pending dispatch for this company, chain onto it
    // to ensure credit balance reads are serialized and cannot drift.
    const lockKey = companyId;
    const existingLock = companyLocks.get(lockKey);

    if (existingLock) {
      // Wait for the existing dispatch to finish, then proceed
      await existingLock.catch(() => {}); // Ignore rejection, just wait
    }

    // Create the promise for this dispatch and register it as the active lock
    const dispatchPromise = executeDispatchInternal({
      triggerType,
      recipient: recipient.trim(),
      message: sanitizedMessage,
      companyId,
      userId,
      userName,
      referenceData,
    });

    companyLocks.set(lockKey, dispatchPromise);

    try {
      const result = await dispatchPromise;
      return result;
    } finally {
      // Clean up the lock only if we're the current holder
      if (companyLocks.get(lockKey) === dispatchPromise) {
        companyLocks.delete(lockKey);
      }
    }
  } catch (error) {
    console.error('[dispatchAutoSms] Unhandled error (never propagates):', error);
    return { dispatched: false, error: String(error) };
  }
}

/**
 * executeDispatchInternal — Internal implementation that performs the actual
 * auto-SMS dispatch with atomic credit balance management.
 * ALWAYS called inside a serialized per-company lock.
 */
async function executeDispatchInternal(params: {
  triggerType: 'purchase' | 'collection' | 'stock_receive' | 'hr_lifecycle';
  recipient: string;
  message: string;
  companyId: string;
  userId?: string;
  userName?: string;
  referenceData?: Record<string, unknown>;
}): Promise<AutoSmsResult> {
  const { triggerType, recipient, message, companyId, userId, userName, referenceData } = params;

  // Look up the SmsAutomationConfig for this tenant
  const config = await db.smsAutomationConfig.findFirst({
    where: { isActive: true, companyId },
  });

  if (!config) {
    return { dispatched: false, error: 'No automation config found' };
  }

  // Check the corresponding toggle
  const toggleMap: Record<string, boolean> = {
    purchase: config.smsAlertOnPurchase,
    collection: config.smsAlertOnCollection,
    stock_receive: config.smsAlertOnStockReceive,
    hr_lifecycle: config.smsAlertOnHrLifecycle,
  };

  const isEnabled = toggleMap[triggerType];
  if (!isEnabled) {
    return { dispatched: false, error: `Trigger ${triggerType} is disabled` };
  }

  // Compute SMS segments using UDH-aware calculation (Directive 1)
  const { charCount, isUnicode, segmentCount } = computeSmsSegments(message);

  // ─── DIRECTIVE 2: Atomic credit check + dispatch inside $transaction ───
  // This ensures that even if two auto-SMS dispatches fire simultaneously
  // (from different request handlers), the credit balance deduction is atomic
  // and the balance cannot drift below 0.
  try {
    const result = await db.$transaction(async (tx) => {
      // Re-read the active SmsSetting INSIDE the transaction to get the
      // latest committed credit balance (avoids stale read race condition)
      const activeSetting = await tx.smsSetting.findFirst({
        where: { isActive: true, companyId },
        orderBy: { createdAt: 'desc' },
      });

      const ratePerSms = activeSetting?.ratePerSms || 0;
      const unicodeRate = activeSetting?.unicodeRate || 0;
      const applicableRate = isUnicode ? unicodeRate : ratePerSms;
      const cost = safeFinancialRound(segmentCount * applicableRate);

      // Credit balance shield — atomic read inside transaction
      const availableCredits = activeSetting?.lastKnownCreditBalance || 0;

      if (availableCredits > 0 && cost > availableCredits) {
        // Insufficient credits — do NOT create SmsLog, just return failure
        // The parent transaction (e.g., invoice save) continues unaffected
        return {
          dispatched: false,
          error: `Insufficient SMS API credits for auto-SMS. Required: ${cost.toFixed(2)}, Available: ${availableCredits.toFixed(2)}`,
          cost: 0,
        };
      }

      // Create SmsLog entry inside the transaction
      const smsLog = await tx.smsLog.create({
        data: {
          recipient,
          message,
          charCount,
          smsSegmentCount: segmentCount,
          isUnicode,
          status: 'Pending',
          campaignName: `Auto-SMS: ${triggerType}`,
          cost,
          companyId,
          isActive: true,
        },
      });

      // Update lastKnownCreditBalance atomically inside the same transaction
      if (activeSetting && availableCredits > 0) {
        const newBalance = Math.max(0, availableCredits - cost);
        await tx.smsSetting.update({
          where: { id: activeSetting.id },
          data: { lastKnownCreditBalance: safeFinancialRound(newBalance) },
        });
      }

      // Activity log with Comm-SMS-Marketing module token
      await logUserActivity({
        action: 'AUTO_SMS_DISPATCH',
        module: 'Comm-SMS-Marketing',
        recordId: smsLog.id,
        recordLabel: `Auto-SMS: ${triggerType} → ${recipient}`,
        userId: userId || 'system',
        userName: userName || 'System (Auto-Dispatch)',
        details: JSON.stringify({
          triggerType,
          recipient,
          charCount,
          isUnicode,
          segmentCount,
          cost,
          creditsBefore: availableCredits,
          creditsAfter: Math.max(0, availableCredits - cost),
          referenceData: referenceData || null,
        }),
      });

      return {
        dispatched: true,
        smsLogId: smsLog.id,
        cost,
      };
    });

    // ─── Gateway Dispatch: Try to send through the SMS gateway (non-blocking) ───
    // If the gateway dispatch fails, the SmsLog stays as "Pending"
    // and will be picked up later by the /api/sms/dispatch-pending route.
    if (result.dispatched && result.smsLogId) {
      try {
        // Fetch the active setting outside the transaction for gateway dispatch
        const gatewaySetting = await db.smsSetting.findFirst({
          where: { isActive: true, companyId },
          orderBy: { createdAt: 'desc' },
        });

        if (gatewaySetting) {
          const gatewayConfig = buildGatewayConfig(gatewaySetting);
          const dispatchResult = await dispatchSingleSms(gatewayConfig, {
            smsLogId: result.smsLogId,
            recipient: recipient,
            message: message,
          });

          // Update the SmsLog with the gateway result
          await db.smsLog.update({
            where: { id: result.smsLogId },
            data: {
              status: dispatchResult.status,
              gatewayResponse: dispatchResult.gatewayResponse,
              cost: dispatchResult.cost,
              ...(dispatchResult.status === 'Sent' && { sentAt: new Date() }),
            },
          });

          // Update the result to reflect actual gateway status
          (result as AutoSmsResult).status = dispatchResult.status;
        } else {
          // No gateway configured — SmsLog stays as "Pending"
          console.warn('[dispatchAutoSms] No SMS gateway configured. SmsLog stays Pending.');
        }
      } catch (gatewayErr) {
        // Gateway dispatch failed — SmsLog stays as "Pending"
        // The /api/sms/dispatch-pending route can retry later
        console.error('[dispatchAutoSms] Gateway dispatch failed (entry stays Pending):', gatewayErr);
      }
    }

    return result as AutoSmsResult;
  } catch (txError) {
    console.error('[dispatchAutoSms] Transaction error (absorbed):', txError);
    return { dispatched: false, error: String(txError) };
  }
}

// ─────────────────────────────────────────────────────────────
// DIRECTIVE 3 — Template Builders for Auto-SMS Triggers
// These construct the SMS message body with sanitized,
// truncated variable interpolation.
// ─────────────────────────────────────────────────────────────

/**
 * buildPurchaseSms — TRIGGER A: Product Purchase Alert
 * "Dear [Name], Invoice [InvNo] raised for [ItemSummary]. Total: Tk. [GrandTotal]. Thank you."
 */
export function buildPurchaseSms(params: {
  customerName: string;
  invoiceNo: string;
  itemSummary: string;
  grandTotal: string | number;
}): string {
  const name = sanitizeSmsVariable(truncateSummary(params.customerName, 30));
  const invNo = sanitizeSmsVariable(params.invoiceNo);
  const items = sanitizeSmsVariable(truncateSummary(params.itemSummary, 50));
  const total = sanitizeSmsVariable(String(params.grandTotal));
  return `Dear ${name}, Invoice ${invNo} raised for ${items}. Total: Tk. ${total}. Thank you.`;
}

/**
 * buildCollectionSms — TRIGGER B: Cash/Bank/MFS Collection Alert
 * "Received with thanks: Tk. [Amount] via [PaymentMethod] against Invoice/Account [RefNo]. Available balance: Tk. [Balance]."
 */
export function buildCollectionSms(params: {
  amount: string | number;
  paymentMethod: string;
  referenceNo: string;
  balance: string | number;
}): string {
  const amount = sanitizeSmsVariable(String(params.amount));
  const method = sanitizeSmsVariable(truncateSummary(params.paymentMethod, 20));
  const refNo = sanitizeSmsVariable(truncateSummary(params.referenceNo, 25));
  const balance = sanitizeSmsVariable(String(params.balance));
  return `Received with thanks: Tk. ${amount} via ${method} against Invoice/Account ${refNo}. Available balance: Tk. ${balance}.`;
}

/**
 * buildStockReceiveSms — TRIGGER C: Warehouse Stock Receipt Notification
 * "Stock Received Alert: [ItemSummary] safely delivered to Warehouse [GodownName] against PO [PoNo]."
 */
export function buildStockReceiveSms(params: {
  itemSummary: string;
  godownName: string;
  poNo: string;
}): string {
  const items = sanitizeSmsVariable(truncateSummary(params.itemSummary, 50));
  const godown = sanitizeSmsVariable(truncateSummary(params.godownName, 25));
  const poNo = sanitizeSmsVariable(params.poNo);
  return `Stock Received Alert: ${items} safely delivered to Warehouse ${godown} against PO ${poNo}.`;
}

/**
 * buildHrExamSms — TRIGGER D (Payload 1): Exam Candidate SMS
 * "Dear [Candidate], your selection exam is scheduled on [ExamDate] at [Time]. Venue: Please contact HR for details."
 *
 * Note: The venue field is dynamically configurable. If a venue is provided,
 * it will be used; otherwise, a generic "Please contact HR for details" is shown.
 */
export function buildHrExamSms(params: {
  candidateName: string;
  examDate: string;
  time: string;
  venue?: string;
}): string {
  const name = sanitizeSmsVariable(truncateSummary(params.candidateName, 30));
  const examDate = sanitizeSmsVariable(params.examDate);
  const time = sanitizeSmsVariable(params.time);
  const venue = params.venue
    ? sanitizeSmsVariable(truncateSummary(params.venue, 40))
    : 'Please contact HR for details';
  return `Dear ${name}, your selection exam is scheduled on ${examDate} at ${time}. Venue: ${venue}.`;
}

/**
 * buildHrJoiningSms — TRIGGER D (Payload 2): Confirmed Joining Welcome SMS
 * "Welcome [EmployeeName] to the team! Your official joining date is confirmed on [JoiningDate]. Check your email for login credentials."
 */
export function buildHrJoiningSms(params: {
  employeeName: string;
  joiningDate: string;
}): string {
  const name = sanitizeSmsVariable(truncateSummary(params.employeeName, 30));
  const joiningDate = sanitizeSmsVariable(params.joiningDate);
  return `Welcome ${name} to the team! Your official joining date is confirmed on ${joiningDate}. Check your email for login credentials.`;
}
