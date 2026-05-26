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
  dealer: ['PurchaseOrders', 'PurchaseReturns', 'SalesReturns', 'Replacements', 'Expenses', 'Incomes', 'CashCollections', 'CashDeliveries', 'BankTransactions', 'ChartOfAccounts', 'LedgerEntries', 'PeriodClose', 'MISReports', 'Designations', 'Employees', 'EmployeeLeaves', 'Suppliers', 'SystemConfig', 'InvoiceTemplates', 'NumberFormats', 'AuditTrail'],
  vat_auditor: ['SmsSettings', 'SmsLogs', 'SmsBills', 'SmsBillPayments'],
};

// Write (POST/PUT/DELETE) deny per role
const WRITE_DENY: Record<UserRole, string[]> = {
  admin: [],
  manager: [],
  sr: ['PurchaseOrders', 'PurchaseReturns', 'Expenses', 'CashDeliveries', 'BankTransactions', 'ChartOfAccounts', 'PeriodClose', 'MISReports', 'InvestmentHeads', 'Assets', 'Liabilities', 'Suppliers', 'SystemConfig', 'InvoiceTemplates', 'NumberFormats', 'AuditTrail'],
  dealer: ['PurchaseOrders', 'PurchaseReturns', 'SalesReturns', 'Replacements', 'Expenses', 'Incomes', 'CashCollections', 'CashDeliveries', 'BankTransactions', 'ChartOfAccounts', 'PeriodClose', 'MISReports', 'InvestmentHeads', 'Assets', 'Liabilities', 'StockTransfers', 'SRTargets', 'Employees', 'EmployeeLeaves', 'SystemConfig', 'InvoiceTemplates', 'NumberFormats', 'AuditTrail'],
  vat_auditor: [], // VAT Auditor is completely read-only (all writes denied)
};

// Modules exempt from auth (public endpoints)
const AUTH_EXEMPT_MODULES = ['Auth', 'Seed'];

export interface ApiSecurityResult {
  authorized: true;
  user: { id: string; email: string; name: string; role: UserRole };
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
      user: { id: 'system', email: 'system@ems.local', name: 'System', role: 'admin' },
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
    select: { id: true, email: true, name: true, role: true, isActive: true },
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
    user: { id: user.id, email: user.email, name: user.name, role },
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
export function maskForVatAuditor<T extends Record<string, unknown>>(
  data: T,
  role: UserRole,
  sensitiveFields: string[] = ['costPrice', 'wholesalePrice', 'dealerPrice', 'discount', 'discountPercent', 'discountAmount', 'margin', 'profit']
): T {
  if (role !== 'vat_auditor') return data;

  const masked = { ...data };
  for (const field of sensitiveFields) {
    if (field in masked) {
      (masked as Record<string, unknown>)[field] = 'N/A (Audit Mode)';
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
