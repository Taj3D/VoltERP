// ============================================================
// SMS GATEWAY DISPATCHER — Multi-Gateway SMS Delivery Engine
// Supports common Bangladesh SMS gateways:
//   - BulkSMSBD
//   - SmartSMS
//   - Metronet
//   - SSLWireless
//   - Generic (any standard HTTP SMS API)
//
// Design Principles:
//   1. Each message is dispatched independently — one failure
//      does NOT block the remaining messages.
//   2. Gateway responses are captured for audit trail.
//   3. Cost calculation uses the SmsSetting rates and encoding.
//   4. When no gateway is configured, messages stay Pending.
//   5. All errors are caught per-message; the caller receives
//      a full results array with success/failure per recipient.
// ============================================================

import { computeSmsSegments, safeFinancialRound } from '@/lib/api-security';

// ── Type Definitions ──────────────────────────────────────────

/** Configuration from the SmsSetting model. */
export interface SmsGatewayConfig {
  apiUrl: string;
  apiKey: string;
  senderId: string;
  maskingName?: string | null;
  gatewayName?: string | null;
  ratePerSms: number;
  unicodeRate: number;
}

/** A single outbound SMS message to dispatch. */
export interface OutboundSmsMessage {
  smsLogId: string;
  recipient: string;
  message: string;
}

/** Result of dispatching a single message. */
export interface SingleDispatchResult {
  smsLogId: string;
  recipient: string;
  success: boolean;
  status: 'Sent' | 'Failed' | 'Pending';
  gatewayResponse: string | null;
  cost: number;
  error?: string;
}

/** Aggregated result of a batch dispatch. */
export interface BatchDispatchResult {
  total: number;
  sent: number;
  failed: number;
  pending: number;
  results: SingleDispatchResult[];
}

// ── Gateway-Specific Parameter Builders ───────────────────────

/**
 * Each gateway has slightly different parameter names.
 * These builders return the query/form parameters expected by each provider.
 */
function buildBulkSmsBdParams(
  config: SmsGatewayConfig,
  recipient: string,
  message: string
): Record<string, string> {
  return {
    api_key: config.apiKey,
    sender_id: config.senderId,
    mobile: recipient.replace(/^\+?880/, '0'), // BulkSMSBD expects 01XXX...
    message,
  };
}

function buildSmartSmsParams(
  config: SmsGatewayConfig,
  recipient: string,
  message: string
): Record<string, string> {
  return {
    api_key: config.apiKey,
    sender: config.senderId,
    mobile: recipient.replace(/^\+?880/, '0'),
    message,
  };
}

function buildMetronetParams(
  config: SmsGatewayConfig,
  recipient: string,
  message: string
): Record<string, string> {
  return {
    api_key: config.apiKey,
    masking: config.maskingName || config.senderId,
    recipient: recipient.replace(/^\+?880/, '0'),
    message,
  };
}

function buildSslWirelessParams(
  config: SmsGatewayConfig,
  recipient: string,
  message: string
): Record<string, string> {
  return {
    apiToken: config.apiKey,
    sid: config.senderId,
    msisdn: recipient.replace(/^\+?880/, '880'), // SSL expects 8801XXX...
    sms: message,
  };
}

function buildGenericParams(
  config: SmsGatewayConfig,
  recipient: string,
  message: string
): Record<string, string> {
  // Generic fallback — most Bangladesh gateways follow this convention
  return {
    apiKey: config.apiKey,
    senderId: config.senderId,
    recipient,
    message,
  };
}

/**
 * Selects the correct parameter builder based on the gateway name.
 * Falls back to generic if the gateway is unknown.
 */
function buildGatewayParams(
  config: SmsGatewayConfig,
  recipient: string,
  message: string
): Record<string, string> {
  const gateway = (config.gatewayName || '').toLowerCase().replace(/[\s_-]/g, '');

  if (gateway.includes('bulksmsbd') || gateway.includes('bulksms')) {
    return buildBulkSmsBdParams(config, recipient, message);
  }
  if (gateway.includes('smart')) {
    return buildSmartSmsParams(config, recipient, message);
  }
  if (gateway.includes('metronet')) {
    return buildMetronetParams(config, recipient, message);
  }
  if (gateway.includes('ssl') || gateway.includes('sslwireless')) {
    return buildSslWirelessParams(config, recipient, message);
  }

  return buildGenericParams(config, recipient, message);
}

// ── Gateway HTTP Method Selection ─────────────────────────────

/**
 * Determines whether the gateway expects GET or POST.
 * Most Bangladesh SMS gateways use POST, but some use GET.
 */
function getGatewayHttpMethod(gatewayName: string | null | undefined): 'POST' | 'GET' {
  const gateway = (gatewayName || '').toLowerCase().replace(/[\s_-]/g, '');

  // SSLWireless uses POST with JSON body
  if (gateway.includes('ssl') || gateway.includes('sslwireless')) {
    return 'POST';
  }

  // BulkSMSBD supports both GET and POST; we use POST for reliability
  if (gateway.includes('bulksmsbd') || gateway.includes('bulksms')) {
    return 'POST';
  }

  // Default to POST for all others
  return 'POST';
}

// ── Single Message Dispatch ───────────────────────────────────

/**
 * dispatchSingleSms — Sends one SMS message through the configured gateway.
 *
 * This function:
 *   1. Builds gateway-specific request parameters
 *   2. Makes the HTTP request (GET or POST depending on gateway)
 *   3. Parses the response to determine success/failure
 *   4. Calculates the actual cost based on encoding and rates
 *
 * Returns a SingleDispatchResult regardless of success or failure.
 */
export async function dispatchSingleSms(
  config: SmsGatewayConfig,
  sms: OutboundSmsMessage
): Promise<SingleDispatchResult> {
  // ─── Compute cost based on encoding ───
  const { isUnicode, segmentCount } = computeSmsSegments(sms.message);
  const applicableRate = isUnicode ? config.unicodeRate : config.ratePerSms;
  const cost = safeFinancialRound(segmentCount * applicableRate);

  // ─── Guard: No gateway URL configured ───
  if (!config.apiUrl || !config.apiKey) {
    return {
      smsLogId: sms.smsLogId,
      recipient: sms.recipient,
      success: false,
      status: 'Pending',
      gatewayResponse: null,
      cost,
      error: 'No SMS gateway URL or API key configured',
    };
  }

  try {
    const params = buildGatewayParams(config, sms.recipient, sms.message);
    const httpMethod = getGatewayHttpMethod(config.gatewayName);

    let responseText: string;

    if (httpMethod === 'GET') {
      // GET: Append params as query string
      const queryString = new URLSearchParams(params).toString();
      const url = `${config.apiUrl}${config.apiUrl.includes('?') ? '&' : '?'}${queryString}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json, text/plain' },
        signal: AbortSignal.timeout(30_000), // 30-second timeout
      });

      responseText = await response.text();
    } else {
      // POST: Send params as form-encoded or JSON depending on gateway
      const gateway = (config.gatewayName || '').toLowerCase().replace(/[\s_-]/g, '');
      const isJsonGateway = gateway.includes('ssl') || gateway.includes('sslwireless');

      const response = await fetch(config.apiUrl, {
        method: 'POST',
        headers: isJsonGateway
          ? { 'Content-Type': 'application/json', 'Accept': 'application/json' }
          : { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json, text/plain' },
        body: isJsonGateway ? JSON.stringify(params) : new URLSearchParams(params).toString(),
        signal: AbortSignal.timeout(30_000), // 30-second timeout
      });

      responseText = await response.text();
    }

    // ─── Parse gateway response to determine success/failure ───
    // Each gateway has its own response format, but most return:
    //   - A numeric code (200, 4010, etc.)
    //   - A JSON object with status/error fields
    //   - A plain text "SUCCESS" or "FAILED" string
    const isSuccess = isGatewayResponseSuccessful(responseText, config.gatewayName);

    return {
      smsLogId: sms.smsLogId,
      recipient: sms.recipient,
      success: isSuccess,
      status: isSuccess ? 'Sent' : 'Failed',
      gatewayResponse: responseText.substring(0, 500), // Truncate to prevent DB overflow
      cost,
      error: isSuccess ? undefined : `Gateway returned failure: ${responseText.substring(0, 200)}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Network errors, timeouts, DNS failures — mark as Pending for retry
    const isRetryable = isRetryableError(errorMessage);

    return {
      smsLogId: sms.smsLogId,
      recipient: sms.recipient,
      success: false,
      status: isRetryable ? 'Pending' : 'Failed',
      gatewayResponse: null,
      cost,
      error: `Dispatch error: ${errorMessage}`,
    };
  }
}

// ── Response Parsing ──────────────────────────────────────────

/**
 * isGatewayResponseSuccessful — Determines if the gateway response
 * indicates a successful SMS delivery.
 *
 * Common Bangladesh gateway response patterns:
 *   - BulkSMSBD:   { "response_code": 200, ... } or plain "2020" (success)
 *   - SmartSMS:    { "status": "SUCCESS", ... }
 *   - Metronet:    { "status": "SUCCESS", ... }
 *   - SSLWireless: { "status": "SUCCESS", ... } or { "status_code": "200" }
 */
function isGatewayResponseSuccessful(
  responseBody: string,
  gatewayName: string | null | undefined
): boolean {
  const gateway = (gatewayName || '').toLowerCase().replace(/[\s_-]/g, '');
  const body = responseBody.trim();

  // ─── Gateway-specific parsing ───
  if (gateway.includes('bulksmsbd') || gateway.includes('bulksms')) {
    // BulkSMSBD: response_code 200 or plain "2020"
    if (body === '2020' || body.includes('"response_code": 200') || body.includes('"response_code":200')) {
      return true;
    }
    try {
      const json = JSON.parse(body);
      return json.response_code === 200 || json.response_code === '200' || json.status === 'SUCCESS';
    } catch {
      return false;
    }
  }

  if (gateway.includes('ssl') || gateway.includes('sslwireless')) {
    // SSLWireless: status "SUCCESS" or status_code "200"
    try {
      const json = JSON.parse(body);
      return json.status === 'SUCCESS' || json.status_code === '200' || json.status_code === 200;
    } catch {
      return body.toUpperCase().includes('SUCCESS');
    }
  }

  // ─── Generic parsing (applies to SmartSMS, Metronet, and unknown gateways) ───
  // Try JSON parse first
  try {
    const json = JSON.parse(body);
    if (json.status === 'SUCCESS' || json.status === 'success') return true;
    if (json.status === 'FAILED' || json.status === 'error') return false;
    if (json.response_code === 200 || json.response_code === '200') return true;
    if (json.code === 200 || json.code === '200') return true;
    if (json.success === true || json.success === 1) return true;
    if (json.error !== undefined && json.error !== null && json.error !== 0 && json.error !== '') return false;
    // If JSON parsed but no clear status, check for common success indicators
    if (json.message_id || json.msgid || json.sms_count) return true;
    return false;
  } catch {
    // Not JSON — check plain text
  }

  // Plain text success indicators
  const upperBody = body.toUpperCase();
  if (upperBody.includes('SUCCESS') || upperBody.includes('OK') || upperBody.includes('DELIVERED')) {
    return true;
  }
  if (upperBody.includes('FAIL') || upperBody.includes('ERROR') || upperBody.includes('INVALID')) {
    return false;
  }

  // If the body is a numeric string, treat common codes as success
  if (/^\d+$/.test(body)) {
    const code = parseInt(body, 10);
    return code >= 200 && code < 300;
  }

  // Default: if we can't determine, assume failure
  return false;
}

// ── Error Classification ──────────────────────────────────────

/**
 * isRetryableError — Determines if a dispatch error is transient
 * and worth retrying (network timeout, DNS failure, etc.).
 * Retryable errors leave the status as "Pending" for the
 * dispatch-pending route to pick up later.
 */
function isRetryableError(errorMessage: string): boolean {
  const msg = errorMessage.toLowerCase();
  return (
    msg.includes('timeout') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    msg.includes('econnreset') ||
    msg.includes('socket hang up') ||
    msg.includes('network') ||
    msg.includes('abort') ||
    msg.includes('epipe')
  );
}

// ── Batch Dispatch ────────────────────────────────────────────

/**
 * dispatchSmsBatch — Dispatches a batch of SMS messages through the
 * configured gateway. Each message is dispatched independently;
 * one failure does NOT block the remaining messages.
 *
 * @param config - The SmsSetting configuration object
 * @param messages - Array of outbound messages to dispatch
 * @param options - Optional settings (concurrency, delay between messages)
 * @returns BatchDispatchResult with per-message results
 */
export async function dispatchSmsBatch(
  config: SmsGatewayConfig,
  messages: OutboundSmsMessage[],
  options?: {
    concurrency?: number; // Max parallel dispatches (default: 5)
    delayMs?: number;     // Delay between dispatches in ms (default: 100)
  }
): Promise<BatchDispatchResult> {
  const { concurrency = 5, delayMs = 100 } = options || {};

  const results: SingleDispatchResult[] = [];
  let sent = 0;
  let failed = 0;
  let pending = 0;

  // ─── Guard: No gateway configured ───
  if (!config.apiUrl || !config.apiKey) {
    console.warn('[sms-gateway-dispatcher] No gateway URL or API key configured. All messages will stay Pending.');
    return {
      total: messages.length,
      sent: 0,
      failed: 0,
      pending: messages.length,
      results: messages.map((sms) => {
        const { isUnicode, segmentCount } = computeSmsSegments(sms.message);
        const applicableRate = isUnicode ? config.unicodeRate : config.ratePerSms;
        const cost = safeFinancialRound(segmentCount * applicableRate);
        return {
          smsLogId: sms.smsLogId,
          recipient: sms.recipient,
          success: false,
          status: 'Pending' as const,
          gatewayResponse: null,
          cost,
          error: 'No SMS gateway configured',
        };
      }),
    };
  }

  // ─── Process in chunks for rate limiting ───
  for (let i = 0; i < messages.length; i += concurrency) {
    const chunk = messages.slice(i, i + concurrency);

    const chunkResults = await Promise.all(
      chunk.map((sms) => dispatchSingleSms(config, sms))
    );

    for (const result of chunkResults) {
      results.push(result);
      if (result.status === 'Sent') sent++;
      else if (result.status === 'Failed') failed++;
      else pending++;
    }

    // Rate limiting: delay between chunks (skip for last chunk)
    if (i + concurrency < messages.length && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return {
    total: messages.length,
    sent,
    failed,
    pending,
    results,
  };
}

// ── Helper: Build Config from SmsSetting Record ───────────────

/**
 * buildGatewayConfig — Constructs an SmsGatewayConfig from a Prisma
 * SmsSetting record. This is a convenience helper for callers that
 * have a full SmsSetting object from the database.
 */
export function buildGatewayConfig(smsSetting: {
  apiUrl: string;
  apiKey: string;
  senderId: string;
  maskingName?: string | null;
  gatewayName?: string | null;
  ratePerSms: number;
  unicodeRate: number;
}): SmsGatewayConfig {
  return {
    apiUrl: smsSetting.apiUrl,
    apiKey: smsSetting.apiKey,
    senderId: smsSetting.senderId,
    maskingName: smsSetting.maskingName,
    gatewayName: smsSetting.gatewayName,
    ratePerSms: smsSetting.ratePerSms,
    unicodeRate: smsSetting.unicodeRate,
  };
}
