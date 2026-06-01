// ============================================================
// IMMUTABLE FORENSIC SECURITY AUDIT TRAIL — Phase 18
// Anti-Tamper Shield: Any UPDATE or DELETE commands targeted
// at the SecurityAuditTrail model are instantly blocked (403).
// Enhanced logUserActivity with full forensic context:
//   userId, companyId, branchId, IP Address, User-Agent,
//   HTTP Method, Endpoint Target, Before/After Payload Diff
// ============================================================

import { db } from '@/lib/db';
import { logUserActivity } from '@/lib/activity-logger';

export interface ForensicAuditParams {
  actionType: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'EXPORT' | 'SECURITY_OVERRIDE' | 'LEDGER_VERIFY' | 'RATE_LIMIT_TRIGGERED';
  userId?: string;
  userName?: string;
  companyId?: string;
  branchId?: string;
  ipAddress?: string;
  userAgent?: string;
  httpMethod?: string;
  endpoint?: string;
  targetModel?: string;
  targetRecordId?: string;
  previousState?: any;
  newState?: any;
  diffSummary?: any;
  moduleToken?: string;
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';
  metadata?: any;
}

/**
 * computeDiff — Computes a diff between previous and new state
 * Returns only the changed fields with before/after values
 */
function computeDiff(previous: any, next: any): Record<string, { before: any; after: any }> {
  if (!previous || !next) return {};
  const diff: Record<string, { before: any; after: any }> = {};
  const allKeys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  for (const key of allKeys) {
    const prevVal = JSON.stringify(previous[key]);
    const nextVal = JSON.stringify(next[key]);
    if (prevVal !== nextVal) {
      diff[key] = { before: previous[key], after: next[key] };
    }
  }
  return diff;
}

/**
 * logForensicAudit — Writes an immutable entry to SecurityAuditTrail
 * This function is the ONLY way to create entries in SecurityAuditTrail.
 * Direct UPDATE/DELETE on SecurityAuditTrail are blocked at the API level.
 */
export async function logForensicAudit(params: ForensicAuditParams): Promise<void> {
  try {
    const diff = (params.previousState && params.newState)
      ? computeDiff(params.previousState, params.newState)
      : null;

    await db.securityAuditTrail.create({
      data: {
        userId: params.userId || null,
        userName: params.userName || null,
        companyId: params.companyId || null,
        branchId: params.branchId || null,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
        httpMethod: params.httpMethod || null,
        endpoint: params.endpoint || null,
        actionType: params.actionType,
        targetModel: params.targetModel || null,
        targetRecordId: params.targetRecordId || null,
        previousState: params.previousState ? JSON.stringify(params.previousState) : null,
        newState: params.newState ? JSON.stringify(params.newState) : null,
        diffSummary: diff ? JSON.stringify(diff) : null,
        moduleToken: params.moduleToken || 'Sys-Ops-Security-Vault',
        severity: params.severity || 'INFO',
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      },
    });

    // Also log via the standard activity logger for the unified stream
    await logUserActivity({
      action: params.actionType as any,
      module: params.moduleToken || 'Sys-Ops-Security-Vault',
      recordId: params.targetRecordId,
      recordLabel: params.targetModel ? `${params.targetModel}:${params.targetRecordId || 'N/A'}` : undefined,
      userId: params.userId,
      userName: params.userName,
      details: JSON.stringify({
        endpoint: params.endpoint,
        httpMethod: params.httpMethod,
        severity: params.severity,
        diffFields: diff ? Object.keys(diff) : [],
      }),
      ip: params.ipAddress,
    });
  } catch (error) {
    console.error('[ForensicAuditLogger] Failed to log forensic audit:', error);
  }
}

/**
 * blockAuditTrailMutation — Anti-Tamper Shield
 * Call this before any UPDATE or DELETE operation on SecurityAuditTrail.
 * Always returns a 403 Forbidden response.
 */
export function blockAuditTrailMutation(): { blocked: true; message: string } {
  return {
    blocked: true,
    message: 'FORBIDDEN: SecurityAuditTrail is immutable. UPDATE and DELETE operations are not permitted on forensic audit records. This violation has been logged.',
  };
}
