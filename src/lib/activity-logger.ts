// ============================================================
// ACTIVITY LOGGER - Centralized audit trail logging
// Uses the existing AuditLog Prisma model with module tokens
// for fine-grained activity tracking across all ERP modules.
// Also provides logSystemAudit() for the SystemAuditLog table
// to track key system events (login, logout, password change,
// data modifications).
// ============================================================

import { db } from '@/lib/db';

/**
 * logUserActivity - Centralized activity logging function.
 * Creates an AuditLog entry with a module token for fine-grained tracking.
 *
 * Module Tokens:
 * - SMS-Gateway-Dispatch: Single SMS dispatch operations
 * - SMS-Campaign-Marketing: Bulk SMS campaign broadcasts
 * - SMS-Billing-Settle: SMS bill payment adjustments
 * - Fin-Expense-Head: Expense/Income head management
 * - Fin-Ledger-Transaction: Financial ledger transactions
 * - Fin-Bank-Settlement: Bank balance settlements
 * - Inv-Asset-Ledger: Investment & Asset ledger operations (Phase 3)
 * - Fin-Liability-Core: Liability receive/pay, debt schedules, amortization (Phase 4)
 * - Sys-Catalog-Core: Product catalog, core configurations, vault profiles (Phase 5)
 * - Sys-Structure-Matrix: Departments, Godowns/Warehouses, Segments, Capacity specs (Phase 6)
 * - Sys-Ops-Channels: SR Target Setup, Payment Options, Card Types, Card Type Setup (Phase 7)
 * - HR-Personnel-Core: Designations, Employees, Employee Leaves, Leave Allocations (Phase 8)
 *
 * @param params - Activity log parameters
 */
export async function logUserActivity(params: {
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'EXPORT' | 'IMPORT' | 'AUTO_SMS_SKIPPED' | 'AUTO_SMS_DISPATCH';
  module: string;  // Module token e.g., "SMS-Gateway-Dispatch"
  recordId?: string;
  recordLabel?: string;
  userId?: string;
  userName?: string;
  details?: string;
  ip?: string;
  /** Optional Prisma transaction client — MUST be passed when called inside $transaction()
   *  to avoid SQLite deadlock (db vs tx write lock contention). */
  tx?: any;
}): Promise<void> {
  try {
    const client = params.tx || db;
    await client.auditLog.create({
      data: {
        action: params.action,
        module: params.module,
        recordId: params.recordId || null,
        recordLabel: params.recordLabel || null,
        userId: params.userId || 'system',
        userName: params.userName || 'System',
        details: params.details || null,
        ip: params.ip || null,
      },
    });
  } catch (error) {
    // Non-blocking: activity logging should never crash the main operation
    console.error('[ActivityLogger] Failed to log activity:', error);
  }
}

/**
 * logSystemAudit - Writes to the SystemAuditLog table for key system events.
 *
 * Use this for security-sensitive events that need separate tracking from
 * the regular AuditLog: login, logout, password changes, data modifications
 * that affect system integrity.
 *
 * @param params - System audit log parameters
 */
export async function logSystemAudit(params: {
  actionType: string;           // 'LOGIN', 'LOGOUT', 'PASSWORD_CHANGE', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', etc.
  targetModel?: string;         // Prisma model name e.g., "User", "SalesOrder"
  targetRecordId?: string;      // ID of the affected record
  actorUserId?: string;         // User performing the action
  actorUserName?: string;       // Display name of the actor
  previousState?: string;       // JSON string of the record before change
  newState?: string;            // JSON string of the record after change
  userAgent?: string;           // Browser/client user-agent
  ipAddress?: string;           // Client IP address
  metadata?: string;            // JSON string with additional context
  companyId?: string;           // Multi-tenant isolation
  /** Optional Prisma transaction client */
  tx?: any;
}): Promise<void> {
  try {
    const client = params.tx || db;
    await client.systemAuditLog.create({
      data: {
        actionType: params.actionType,
        targetModel: params.targetModel || null,
        targetRecordId: params.targetRecordId || null,
        actorUserId: params.actorUserId || null,
        actorUserName: params.actorUserName || null,
        previousState: params.previousState || null,
        newState: params.newState || null,
        userAgent: params.userAgent || null,
        ipAddress: params.ipAddress || null,
        metadata: params.metadata || null,
        companyId: params.companyId || null,
      },
    });
  } catch (error) {
    // Non-blocking: system audit logging should never crash the main operation
    console.error('[ActivityLogger] Failed to log system audit:', error);
  }
}
