// ============================================================
// ACTIVITY LOGGER - Centralized audit trail logging
// Uses the existing AuditLog Prisma model with module tokens
// for fine-grained activity tracking across all ERP modules.
// ============================================================

import { db } from '@/lib/db';

/**
 * logUserActivity - Centralized activity logging function.
 * Creates an AuditLog entry with a module token for fine-grained tracking.
 *
 * Module Tokens:
 * - Comm-SMS-Marketing: Unified SMS module token for all campaign sheets, dispatch logs, CSV exports, billing operations
 * - Fin-Expense-Head: Expense/Income head management
 * - Fin-Ledger-Transaction: Financial ledger transactions
 * - Fin-Bank-Settlement: Bank balance settlements
 * - Sec-Audit-Overhaul: Security audit log viewing, backup operations, and compliance center activities
 * - CRM-Profiles-Core: Customer and Supplier profile management, collision shields, CoA auto-mapping
 * - Inv-Stock-Core: Inventory stock operations, opening stock adjustments, batch master management, stock valuations, godown management
 * - Inv-Orders-Core: Purchase Order, Auto-PO, Sales Order, Credit Shield interlocks, order-to-ledger posting
 * - Inv-Logistics-Core: Damage logs, wastage write-offs, warehouse inter-transfers, intransit valuation state transitions, consignment tracking
 * - Fin-Accounts-Core: Manual journal vouchers, cash/bank receipt & payment vouchers, COA tree modifications, real-time financial ledger posting, account activations/deactivations
 * - Fin-Statements-Core: Financial statements generation (Trial Balance, Income Statement/P&L, Balance Sheet), fiscal year management, year-end closing automation, nominal account wipeout, retained earnings transfers, period interlock enforcement
 *
 * @param params - Activity log parameters
 */
export async function logUserActivity(params: {
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'EXPORT' | 'IMPORT' | 'AUTO_SMS_DISPATCH' | 'AUTO_SMS_SKIPPED' | 'RATE_LIMIT_TRIGGERED';
  module: string;  // Module token e.g., "SMS-Gateway-Dispatch"
  recordId?: string;
  recordLabel?: string;
  userId?: string;
  userName?: string;
  details?: string;
  ip?: string;
}): Promise<void> {
  try {
    await db.auditLog.create({
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
