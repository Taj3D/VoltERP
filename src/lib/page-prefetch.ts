// ============================================================
// PAGE PREFETCH UTILITY
// ============================================================
// Pre-loads lazy-loaded page components when the user hovers over
// sidebar items. This makes navigation feel instant because the
// component is already in memory by the time the user clicks.
//
// Usage:
//   import { prefetchPage } from "@/lib/page-prefetch";
//   <button onMouseEnter={() => prefetchPage("products")}>Products</button>
//
// The import is fire-and-forget. If the user never clicks, the
// prefetched module just sits in memory (small cost). If they do
// click, React.lazy reuses the already-resolved promise.
// ============================================================

// Map of page key → dynamic import function.
// These match the React.lazy() calls in ElectronicsMartApp.tsx.
const prefetchMap: Record<string, () => Promise<unknown>> = {
  // Dashboard
  'dashboard': () => import("@/components/DashboardAnalyticsPage"),

  // Investment group
  'investment-heads': () => import("@/components/InvestmentGroupPage"),
  'investment': () => import("@/components/InvestmentGroupPage"),
  'asset': () => import("@/components/InvestmentGroupPage"),
  'liability': () => import("@/components/InvestmentGroupPage"),

  // Basic modules
  'products': () => import("@/components/BasicModulesGroupPage"),
  'bank': () => import("@/components/BasicModulesGroupPage"),
  'structure': () => import("@/components/StructureModulePage"),
  'operations': () => import("@/components/OperationsModulePage"),

  // Staff
  'designations': () => import("@/components/PersonnelCRMGroupPage"),
  'employees': () => import("@/components/PersonnelCRMGroupPage"),
  'employee-leave': () => import("@/components/PersonnelCRMGroupPage"),

  // Customers & Suppliers
  'customers': () => import("@/components/PersonnelCRMGroupPage"),
  'suppliers': () => import("@/components/PersonnelCRMGroupPage"),

  // Inventory
  'order-sheet': () => import("@/components/InventoryGroupPage"),
  'purchase-order': () => import("@/components/InventoryGroupPage"),
  'auto-po': () => import("@/components/InventoryGroupPage"),
  'sales-order': () => import("@/components/SalesModulePage"),
  'hire-sales': () => import("@/components/SalesModulePage"),
  'sales-return': () => import("@/components/ReturnReplacementModulePage"),
  'purchase-return': () => import("@/components/ReturnReplacementModulePage"),
  'replacement-order': () => import("@/components/ReturnReplacementModulePage"),

  // Stock
  'stock': () => import("@/components/StockModulePage"),
  'stock-details': () => import("@/components/StockModulePage"),
  'transfer': () => import("@/components/StockModulePage"),
  'opening-stock': () => import("@/components/StockModulePage"),
  'batch-master': () => import("@/components/StockModulePage"),
  'valuation': () => import("@/components/StockModulePage"),

  // Account management
  'expense-income-head': () => import("@/components/AccountManagementPage"),
  'expense': () => import("@/components/AccountManagementPage"),
  'income': () => import("@/components/AccountManagementPage"),
  'cash-collection': () => import("@/components/AccountManagementPage"),
  'cash-delivery': () => import("@/components/AccountManagementPage"),
  'bank-transaction': () => import("@/components/AccountManagementPage"),

  // SMS
  'sms-inbox': () => import("@/components/SMSAnalyticsPage"),
  'send-sms': () => import("@/components/SMSAnalyticsPage"),
  'sms-bill': () => import("@/components/SMSAnalyticsPage"),
  'sms-report': () => import("@/components/SMSAnalyticsPage"),
  'sms-service-setting': () => import("@/components/SMSAnalyticsPage"),
  'sms-bill-payment': () => import("@/components/SMSAnalyticsPage"),
  'send-bulk-sms': () => import("@/components/SMSAnalyticsPage"),

  // Accounting
  'chart-of-accounts-ledger': () => import("@/components/ChartOfAccountsLedgerPage"),
  'cash-in-hand': () => import("@/components/ChartOfAccountsLedgerPage"),
  'accounting-report': () => import("@/components/AccountingReportsPage"),
  'balance-sheet': () => import("@/components/BalanceSheetPeriodClosePage"),
  'period-close': () => import("@/components/BalanceSheetPeriodClosePage"),

  // Reports
  'mis-reports': () => import("@/components/MISReportEngine"),
  'customer-ledger-report': () => import("@/components/CustomerSupplierLedgerPage"),
  'supplier-ledger-report': () => import("@/components/CustomerSupplierLedgerPage"),
  'financial-audit': () => import("@/components/FinancialAuditGroupPage"),
  'notifications-integrity': () => import("@/components/FinancialAuditGroupPage"),

  // System
  'system-settings': () => import("@/components/SystemSettingsGroupPage"),
  'audit-trail': () => import("@/components/AuditTrailViewer"),
  'profile': () => import("@/components/ProfileCenter"),
};

// Track which modules have already been prefetched to avoid duplicate imports
const prefetched = new Set<string>();

/**
 * Prefetch a page component by its sidebar key.
 * Fire-and-forget — safe to call multiple times.
 */
export function prefetchPage(key: string): void {
  if (prefetched.has(key)) return;
  const importer = prefetchMap[key];
  if (!importer) return;
  prefetched.add(key);
  // Trigger the dynamic import — the result is cached by the bundler
  // so React.lazy will reuse the same resolved promise.
  importer().catch(() => {
    // If prefetch fails, remove from set so it can be retried
    prefetched.delete(key);
  });
}

/**
 * Prefetch multiple pages at once (e.g., all items in a sidebar group).
 */
export function prefetchPages(keys: string[]): void {
  keys.forEach(prefetchPage);
}
