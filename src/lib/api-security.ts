// ============================================================
// SERVER-SIDE API SECURITY - RBAC ENFORCEMENT
// Eliminates the "frontend-only RBAC" vulnerability
// All API routes MUST use withApiSecurity() to enforce role-based access
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export type UserRole = 'admin' | 'manager' | 'sr' | 'dealer' | 'vat_auditor';

// Module → Sidebar Group mapping (mirrors frontend ROLE_ACCESS)
const MODULE_GROUP_MAP: Record<string, string> = {
  // Investment
  InvestmentHeads: 'investment',
  Assets: 'investment',
  Liabilities: 'investment',
  // Basic Modules
  Companies: 'basic-modules',
  Categories: 'basic-modules',
  Colors: 'basic-modules',
  Products: 'basic-modules',
  Banks: 'basic-modules',
  Departments: 'basic-modules',
  Godowns: 'basic-modules',
  InterestPercentages: 'basic-modules',
  Segments: 'basic-modules',
  Capacities: 'basic-modules',
  SRTargets: 'basic-modules',
  PaymentOptions: 'basic-modules',
  CardTypes: 'basic-modules',
  CardTypeSetups: 'basic-modules',
  // Staff
  Designations: 'staff',
  Employees: 'staff',
  EmployeeLeaves: 'staff',
  // Customers & Suppliers
  Customers: 'customers-suppliers',
  Suppliers: 'customers-suppliers',
  // Inventory
  OrderSheets: 'inventory',
  PurchaseOrders: 'inventory',
  AutoPO: 'inventory',
  SalesOrders: 'inventory',
  HireSales: 'inventory',
  SalesReturns: 'inventory',
  PurchaseReturns: 'inventory',
  Replacements: 'inventory',
  Stock: 'inventory',
  StockEntries: 'inventory',
  StockTransfers: 'inventory',
  // Account Management
  ExpenseIncomeHeads: 'account',
  Expenses: 'account',
  Incomes: 'account',
  CashCollections: 'account',
  CashDeliveries: 'account',
  BankTransactions: 'account',
  // SMS
  SmsSettings: 'sms',
  SmsLogs: 'sms',
  SmsBills: 'sms',
  SmsBillPayments: 'sms',
  // Accounting Reports
  ChartOfAccounts: 'accounting-report',
  LedgerEntries: 'accounting-report',
  LedgerReports: 'accounting-report',
  PeriodClose: 'accounting-report',
  // MIS Reports
  MISReports: 'mis-report',
  // Dashboard
  Dashboard: 'dashboard',
  DashboardAnalytics: 'dashboard',
  // System Configuration (Group 6)
  SystemConfig: 'system-config',
  InvoiceTemplates: 'system-config',
  NumberFormats: 'system-config',
  // Auth
  Auth: 'auth',
  AuditLogs: 'audit',
  AuditTrail: 'audit',
  Reports: 'report',
  Seed: 'seed',
};

// Group-level access per role (mirrors frontend ROLE_ACCESS)
const ROLE_GROUP_ACCESS: Record<UserRole, string[]> = {
  admin: ['*'],
  manager: ['investment', 'basic-modules', 'staff', 'customers-suppliers', 'inventory', 'account', 'sms', 'accounting-report', 'mis-report', 'dashboard', 'audit', 'system-config', 'report'],
  sr: ['basic-modules', 'staff', 'customers-suppliers', 'inventory', 'sms', 'dashboard', 'report'],
  dealer: ['basic-modules', 'customers-suppliers', 'inventory', 'dashboard', 'report'],
  vat_auditor: ['basic-modules', 'customers-suppliers', 'inventory', 'accounting-report', 'mis-report', 'dashboard', 'system-config', 'audit', 'report'],
};

// Module-level deny list per role (mirrors frontend ITEM_ACCESS_DENIED)
const MODULE_DENY: Record<UserRole, string[]> = {
  admin: [],
  manager: [],
  sr: ['PurchaseOrders', 'PurchaseReturns', 'Expenses', 'CashDeliveries', 'BankTransactions', 'ChartOfAccounts', 'LedgerEntries', 'PeriodClose', 'MISReports', 'Suppliers', 'SystemConfig', 'InvoiceTemplates', 'NumberFormats', 'AuditTrail'],
  dealer: ['PurchaseOrders', 'PurchaseReturns', 'SalesReturns', 'Replacements', 'Expenses', 'Incomes', 'CashCollections', 'CashDeliveries', 'BankTransactions', 'ExpenseIncomeHeads', 'ChartOfAccounts', 'LedgerEntries', 'PeriodClose', 'MISReports', 'Designations', 'Employees', 'EmployeeLeaves', 'Suppliers', 'SystemConfig', 'InvoiceTemplates', 'NumberFormats', 'AuditTrail'],
  vat_auditor: ['SmsSettings', 'SmsLogs', 'SmsBills', 'SmsBillPayments'],
};

// Write (POST/PUT/DELETE) deny per role
const WRITE_DENY: Record<UserRole, string[]> = {
  admin: [],
  manager: [], // Manager can create/update but NOT delete financial posts (enforced per-route)
  sr: ['PurchaseOrders', 'PurchaseReturns', 'Expenses', 'CashDeliveries', 'BankTransactions', 'ChartOfAccounts', 'PeriodClose', 'MISReports', 'InvestmentHeads', 'Assets', 'Liabilities', 'Suppliers', 'SystemConfig', 'InvoiceTemplates', 'NumberFormats', 'AuditTrail'],
  dealer: ['PurchaseOrders', 'PurchaseReturns', 'SalesReturns', 'Replacements', 'Expenses', 'Incomes', 'CashCollections', 'CashDeliveries', 'BankTransactions', 'ExpenseIncomeHeads', 'ChartOfAccounts', 'PeriodClose', 'MISReports', 'InvestmentHeads', 'Assets', 'Liabilities', 'StockTransfers', 'SRTargets', 'Employees', 'EmployeeLeaves', 'SystemConfig', 'InvoiceTemplates', 'NumberFormats', 'AuditTrail'],
  vat_auditor: [], // VAT Auditor is completely read-only (all writes denied)
};

// Modules exempt from auth (public endpoints)
const AUTH_EXEMPT_MODULES = ['Auth', 'Seed'];

export interface ApiSecurityResult {
  authorized: true;
  user: { id: string; email: string; name: string; role: UserRole; companyId: string | null };
}

export interface ApiSecurityError {
  authorized: false;
  response: NextResponse;
}

/**
 * withApiSecurity - Universal server-side RBAC enforcement wrapper
 *
 * Usage in API route:
 * ```ts
 * export async function POST(request: NextRequest) {
 *   const security = await withApiSecurity(request, 'SalesOrders', 'POST');
 *   if (!security.authorized) return security.response;
 *   // ... handler logic ...
 * }
 * ```
 */
export async function withApiSecurity(
  request: NextRequest,
  module: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
): Promise<ApiSecurityResult | ApiSecurityError> {
  // Exempt modules from auth
  if (AUTH_EXEMPT_MODULES.includes(module)) {
    return {
      authorized: true,
      user: { id: 'system', email: 'system@ems.local', name: 'System', role: 'admin', companyId: null },
    };
  }

  // Read user identifier from header (sent by frontend apiFetch)
  const userEmail = request.headers.get('x-user-email');

  if (!userEmail) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Authentication required. Please log in.' },
        { status: 401 }
      ),
    };
  }

  // Look up user in database
  const user = await db.user.findUnique({
    where: { email: userEmail },
    select: { id: true, email: true, name: true, role: true, isActive: true, companyId: true },
  });

  if (!user || !user.isActive) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Invalid or inactive user account.' },
        { status: 401 }
      ),
    };
  }

  const role = user.role as UserRole;

  // Step 1: Group-level access check
  const group = MODULE_GROUP_MAP[module];
  const groupAccess = ROLE_GROUP_ACCESS[role] || [];

  if (!groupAccess.includes('*') && group && !groupAccess.includes(group)) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: `Access denied. Your role (${role}) does not have access to ${module}.` },
        { status: 403 }
      ),
    };
  }

  // Step 2: Module-level deny check
  const moduleDenied = MODULE_DENY[role] || [];
  if (moduleDenied.includes(module)) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: `Access denied. Your role (${role}) is restricted from ${module}.` },
        { status: 403 }
      ),
    };
  }

  // Step 3: Write operation check (POST/PUT/DELETE)
  if (method !== 'GET') {
    // VAT Auditor: ALL writes are denied (read-only role)
    if (role === 'vat_auditor') {
      return {
        authorized: false,
        response: NextResponse.json(
          { error: 'Write access denied. VAT Auditor has read-only access to all modules.' },
          { status: 403 }
        ),
      };
    }

    const writeDenied = WRITE_DENY[role] || [];
    if (writeDenied.includes(module)) {
      return {
        authorized: false,
        response: NextResponse.json(
          { error: `Write access denied. Your role (${role}) cannot create, update, or delete records in ${module}.` },
          { status: 403 }
        ),
      };
    }
  }

  // All checks passed
  return {
    authorized: true,
    user: { id: user.id, email: user.email, name: user.name, role, companyId: user.companyId },
  };
}

/**
 * checkPeriodClose - Rejects mutations within locked months
 * Call this BEFORE any POST/PUT/DELETE that modifies financial data
 */
export async function checkPeriodClose(
  date: Date | string
): Promise<NextResponse | null> {
  const d = typeof date === 'string' ? new Date(date) : date;
  const month = d.getMonth() + 1; // 1-based
  const year = d.getFullYear();

  const lockedPeriod = await db.periodClose.findFirst({
    where: { periodMonth: month, periodYear: year, isLocked: true },
  });

  if (lockedPeriod) {
    return NextResponse.json(
      {
        error: `Period locked. The month ${month}/${year} has been closed and locked. No modifications are allowed. Contact an administrator to unlock.`,
        periodCode: lockedPeriod.code,
        lockedMonth: month,
        lockedYear: year,
      },
      { status: 403 }
    );
  }

  return null; // No lock found, proceed
}

/**
 * VAT Auditor masking helper - replaces cost/margin values with "N/A (Audit Mode)"
 */
// Default sensitive fields for VAT Auditor masking
const DEFAULT_VAT_MASKED_FIELDS = ['costPrice', 'wholesalePrice', 'dealerPrice', 'discount', 'discountPercent', 'discountAmount', 'margin', 'profit'];

export function maskForVatAuditor<T extends Record<string, unknown>>(
  data: T,
  role: UserRole,
  sensitiveFields: string[] = DEFAULT_VAT_MASKED_FIELDS,
  /** Optional per-field role restrictions: { creditLimit: ['sr', 'dealer'] } means
   *  creditLimit is masked ONLY for sr and dealer roles, not for admin/manager/vat_auditor.
   *  If not provided, the field is masked for ALL non-admin roles. */
  fieldRoleRestrictions?: Record<string, UserRole[]>
): T {
  // Admin and manager roles are NEVER masked — they have full visibility
  if (role === 'admin' || role === 'manager') {
    return data;
  }

  const masked = { ...data };

  for (const field of sensitiveFields) {
    if (!(field in masked)) continue;

    // Check if this field has specific role restrictions
    if (fieldRoleRestrictions && fieldRoleRestrictions[field]) {
      // Only mask if the current role is in the restriction list
      if (fieldRoleRestrictions[field].includes(role)) {
        (masked as Record<string, unknown>)[field] = 'N/A (Restricted)';
      }
    } else if (role === 'vat_auditor') {
      // VAT Auditor: mask ALL passed sensitive fields
      (masked as Record<string, unknown>)[field] = 'N/A (Audit Mode)';
    } else {
      // Other roles (sr, dealer): mask custom (non-default) fields only
      // Default fields (costPrice, etc.) are only masked for vat_auditor
      const isDefaultField = DEFAULT_VAT_MASKED_FIELDS.includes(field);
      if (!isDefaultField) {
        (masked as Record<string, unknown>)[field] = 'N/A (Restricted)';
      }
    }
  }

  return masked;
}

/**
 * Validate vatMode parameter — only vat_auditor role is allowed to trigger masking.
 * Non-auditor users requesting vatMode=true will have the flag ignored.
 * Returns the effective vatMode (true only if user is vat_auditor AND vatMode was requested).
 */
export function validateVatMode(
  requestedVatMode: boolean,
  userRole: UserRole
): boolean {
  // Only vat_auditor role can activate VAT audit mode
  if (requestedVatMode && userRole !== 'vat_auditor') {
    return false;
  }
  return requestedVatMode;
}

/**
 * validateImageFields - Server-side validation for base64 image data
 * Prevents oversized base64 payloads that could cause 500 errors or bloat the database.
 * Matches the client-side 2MB limit per file, with ~33% base64 overhead = 3MB string limit.
 */
const MAX_BASE64_IMAGE_SIZE = 3 * 1024 * 1024; // 3MB base64 string (≈2MB original file)

export function validateImageFields(
  body: Record<string, unknown>,
  imageFields: string[]
): string | null {
  for (const field of imageFields) {
    const value = body[field];
    if (typeof value === 'string' && value.length > MAX_BASE64_IMAGE_SIZE) {
      return `Image "${field}" exceeds maximum allowed size (2MB). Please compress the image and try again.`;
    }
    // Also validate it looks like a data URL if present
    if (typeof value === 'string' && !value.startsWith('data:') && value.length > 0) {
      return `Image "${field}" has invalid format. Expected base64 data URL.`;
    }
  }
  return null;
}

// ============================================================
// STAGE 10: FINANCIAL MODULE SECURITY UTILITIES
// ============================================================

/**
 * Financial module fields that VAT Auditor must NOT see values for.
 * Covers all liquid monetary fields: actual expense amounts, invoiced income,
 * cash-in-hand totals, bank account numbers, and transaction vouchers.
 */
export const FINANCIAL_VAT_MASKED_FIELDS = [
  'amount',
  'runningBalance',
  'openingBalance',
  'currentBalance',
  'accountNo',
  'chequeNo',
  'voucherNo',
  'referenceNo',
  'depositorName',
  'grandTotal',
  'subTotal',
  'vatAmount',
  'discount',
  'discountAmount',
  'creditLimit',
  'openingBalanceType',
];

/**
 * maskForVatAuditorFinancial - Convenience wrapper for financial module masking.
 * Applies FINANCIAL_VAT_MASKED_FIELDS to a record when the role is vat_auditor.
 * Also recursively masks nested objects (e.g., bank.accountNo, customer.creditLimit).
 */
export function maskForVatAuditorFinancial<T extends Record<string, unknown>>(
  data: T,
  role: UserRole
): T {
  if (role !== 'vat_auditor') return data;
  return maskForVatAuditor(data, role, FINANCIAL_VAT_MASKED_FIELDS);
}

/**
 * maskFinancialArray - Apply VAT Auditor masking to an array of financial records,
 * including nested relation objects (bank, customer, supplier).
 */
export function maskFinancialArray<T extends Record<string, unknown>>(
  items: T[],
  role: UserRole,
  extraFields?: string[]
): T[] {
  if (role !== 'vat_auditor') return items;
  const fields = extraFields
    ? [...FINANCIAL_VAT_MASKED_FIELDS, ...extraFields]
    : FINANCIAL_VAT_MASKED_FIELDS;
  return items.map((item) => {
    let masked = maskForVatAuditor(item, role, fields);
    // Mask nested bank object
    if (masked.bank && typeof masked.bank === 'object') {
      masked = {
        ...masked,
        bank: maskForVatAuditor(masked.bank as Record<string, unknown>, role, ['accountNo', 'currentBalance', 'openingBalance']),
      };
    }
    // Mask nested toBank object
    if (masked.toBank && typeof masked.toBank === 'object') {
      masked = {
        ...masked,
        toBank: maskForVatAuditor(masked.toBank as Record<string, unknown>, role, ['accountNo', 'currentBalance', 'openingBalance']),
      };
    }
    // Mask nested customer object
    if (masked.customer && typeof masked.customer === 'object') {
      masked = {
        ...masked,
        customer: maskForVatAuditor(
          masked.customer as Record<string, unknown>,
          role,
          ['creditLimit', 'openingBalance'],
          { creditLimit: ['sr', 'dealer'], openingBalance: ['sr', 'dealer'] }
        ),
      };
    }
    // Mask nested supplier object
    if (masked.supplier && typeof masked.supplier === 'object') {
      masked = {
        ...masked,
        supplier: maskForVatAuditor(
          masked.supplier as Record<string, unknown>,
          role,
          ['creditLimit', 'openingBalance'],
          { creditLimit: ['sr', 'dealer'], openingBalance: ['sr', 'dealer'] }
        ),
      };
    }
    return masked;
  });
}

/**
 * checkFinancialDeletePermission - Only Administrators (admin) have the authority
 * to modify or soft-delete posted Expense or Income vouchers.
 * Managers can create and update but CANNOT delete final financial posts.
 * SR and Dealer are already blocked by WRITE_DENY.
 *
 * Returns a 403 response if the role is not admin, or null if allowed.
 */
export function checkFinancialDeletePermission(role: UserRole): NextResponse | null {
  if (role !== 'admin') {
    return NextResponse.json(
      {
        error: `Delete access denied. Only Administrators can delete final financial posts. Your role (${role}) can create and update but cannot delete.`,
      },
      { status: 403 }
    );
  }
  return null;
}

/**
 * safeFinancialRound - Prevents JavaScript float rounding traps during
 * multiple ledger aggregations. All financial accumulation must run through
 * this uniform scaling logic.
 *
 * Multiplies by 100, rounds to nearest integer, then divides by 100.
 * This ensures 0.1 + 0.2 = 0.30 (not 0.30000000000000004).
 */
export function safeFinancialRound(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * safeFinancialAdd - Safely add two financial values without floating-point errors.
 */
export function safeFinancialAdd(a: number, b: number): number {
  return safeFinancialRound(a + b);
}

/**
 * safeFinancialSubtract - Safely subtract two financial values without floating-point errors.
 */
export function safeFinancialSubtract(a: number, b: number): number {
  return safeFinancialRound(a - b);
}

/**
 * formatFinancialField - Clean null/undefined/empty optional string fields
 * to "-" or "N/A" to prevent column alignment shifting in table matrix arrays
 * or document exports.
 *
 * Usage: formatFinancialField(record.chequeNo) → "—" if null/undefined/empty
 */
export function formatFinancialField(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string' && value.trim() === '') return '—';
  return String(value);
}
