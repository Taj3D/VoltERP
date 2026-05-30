// ============================================================
// AUDIT MIDDLEWARE - Comprehensive system audit logging
// Domain 20: System Audit Logs, Backups & Security Overhaul
// Provides deep-diff before/after state capture with PII masking
// for every mutation across all 20 VoltERP domains.
// ============================================================

import { db } from '@/lib/db';

// ============================================================
// SENSITIVE FIELD MASKING
// ============================================================

/**
 * Field names whose values must ALWAYS be replaced with "********"
 * before persisting to SystemAuditLog. Covers passwords, API secrets,
 * banking identifiers, and payment instrument numbers.
 *
 * Matching is case-insensitive on the object key.
 */
const SENSITIVE_FIELD_PATTERNS = [
  // Authentication secrets
  'password',
  'confirmpassword',
  'newpassword',
  'oldpassword',
  // API & token credentials
  'apikey',
  'apisecret',
  'secretkey',
  'accesstoken',
  'refreshtoken',
  'sessiontoken',
  'token',
  // Banking identifiers
  'bankroutingnumber',
  'routingnumber',
  'swiftcode',
  'iban',
  // Payment instrument numbers
  'cardnumber',
  'cvv',
  'pin',
  'otp',
] as const;

const MASK_VALUE = '********';

/**
 * maskSensitivePayload - Deep-clones the input object and replaces values
 * for sensitive field names with "********". Recursively walks nested
 * objects and arrays. Field name matching is case-insensitive.
 *
 * @param data - The object to mask
 * @returns A deep-cloned copy with sensitive fields masked
 */
export function maskSensitivePayload(
  data: Record<string, unknown>
): Record<string, unknown> {
  return maskRecursive({ ...data }) as Record<string, unknown>;
}

/**
 * Internal recursive masking helper. Walks the entire object tree
 * and masks any key whose lowercase form matches SENSITIVE_FIELD_PATTERNS.
 */
function maskRecursive(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(maskRecursive);
  }

  if (typeof value === 'object' && value.constructor === Object) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const keyLower = key.toLowerCase();
      if (SENSITIVE_FIELD_PATTERNS.includes(keyLower as typeof SENSITIVE_FIELD_PATTERNS[number])) {
        result[key] = MASK_VALUE;
      } else {
        result[key] = maskRecursive(val);
      }
    }
    return result;
  }

  // Primitives (string, number, boolean) pass through unchanged
  return value;
}

// ============================================================
// SYSTEM AUDIT LOG
// ============================================================

export interface SystemAuditParams {
  actorUserId: string;
  companyId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  actionType: 'CREATE' | 'UPDATE' | 'DELETE';
  targetModel: string;
  targetRecordId?: string;
  previousState?: Record<string, unknown> | null;
  newState?: Record<string, unknown> | null;
  metadata?: string;
}

/**
 * logSystemAudit - Creates a SystemAuditLog record with masked
 * previousState and newState. Wrapped in try/catch so it never
 * throws (non-blocking). All sensitive fields are masked before
 * JSON.stringify to prevent credential/PII leakage into the
 * append-only audit trail.
 */
export async function logSystemAudit(params: SystemAuditParams): Promise<void> {
  try {
    const maskedPrevious = params.previousState
      ? JSON.stringify(maskSensitivePayload(params.previousState))
      : null;

    const maskedNew = params.newState
      ? JSON.stringify(maskSensitivePayload(params.newState))
      : null;

    await db.systemAuditLog.create({
      data: {
        actorUserId: params.actorUserId,
        companyId: params.companyId,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        actionType: params.actionType,
        targetModel: params.targetModel,
        targetRecordId: params.targetRecordId || null,
        previousState: maskedPrevious,
        newState: maskedNew,
        metadata: params.metadata || null,
      },
    });
  } catch (error) {
    // Non-blocking: audit logging failures must never crash the main operation
    console.error('[AuditMiddleware] Failed to log system audit:', error);
  }
}

// ============================================================
// WITH AUDIT LOG WRAPPER
// ============================================================

/**
 * withAuditLog - Wrapper function for API routes that automatically
 * captures before/after state for any mutation operation.
 *
 * 1. Gets previousState from the getter (if provided)
 * 2. Runs the operation
 * 3. The return value of operation is used as newState
 * 4. Logs the audit with all sensitive fields masked
 *
 * Audit logging failures are caught and logged to console — they
 * never propagate to the caller.
 */
export async function withAuditLog<T>(
  params: {
    actorUserId: string;
    companyId: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    actionType: 'CREATE' | 'UPDATE' | 'DELETE';
    targetModel: string;
    targetRecordId?: string;
    metadata?: string;
  },
  operation: () => Promise<T>,
  previousStateGetter?: () => Promise<Record<string, unknown> | null>
): Promise<T> {
  // Step 1: Capture previous state (if getter provided)
  let previousState: Record<string, unknown> | null = null;
  if (previousStateGetter) {
    try {
      previousState = await previousStateGetter();
    } catch (error) {
      console.error('[AuditMiddleware] Failed to get previous state:', error);
    }
  }

  // Step 2: Execute the operation
  const result = await operation();

  // Step 3: Determine new state from operation result
  let newState: Record<string, unknown> | null = null;
  if (result !== null && result !== undefined) {
    if (typeof result === 'object' && !Array.isArray(result)) {
      // If the result is a plain object or a Prisma result, use it as newState
      newState = result as Record<string, unknown>;
    }
  }

  // Step 4: Log the audit (non-blocking)
  await logSystemAudit({
    actorUserId: params.actorUserId,
    companyId: params.companyId,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    actionType: params.actionType,
    targetModel: params.targetModel,
    targetRecordId: params.targetRecordId,
    previousState,
    newState,
    metadata: params.metadata,
  });

  return result;
}
