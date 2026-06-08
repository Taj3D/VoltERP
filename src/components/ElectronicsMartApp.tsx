"use client";
// ============================================================
// ELECTRONICS MART - INVENTORY MANAGEMENT SYSTEM
// Complete SPA with 80+ Module Pages
// Theme: Deep Navy Blue (#0a1628, #132240, #2563eb)
// Footer: Developed & Copyright by NextGen Digital Studio
// ============================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  LayoutDashboard, TrendingUp, Building2, Tag, Palette, Package, Banknote,
  Building, Warehouse, Percent, Layers, Box, Target, CreditCard, Settings, Archive, Calculator,
  Hash, Ruler,
  Users, UserCircle, ClipboardList, ShoppingCart, Truck, Receipt, RotateCcw,
  ArrowLeftRight, BarChart3, MessageSquare, FileText, Search, Bell, Moon,
  Sun, Menu, X, ChevronDown, ChevronRight, Plus, Edit, Trash2, Download,
  Upload, RefreshCw, Eye, Filter, Printer, Home, LogOut, Lock, User,
  DollarSign, ArrowUpCircle, ArrowDownCircle, Send, Inbox, Phone,
  Calendar, CheckCircle, AlertTriangle, XCircle, Info, ChevronLeft,
  MoreVertical, Copy, FileSpreadsheet, FileDown, ArrowUpDown, Activity,
  KeyRound, ShieldCheck, Shield, Pencil, Loader2, ChevronsRight
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { CommandDialog, CommandInput, CommandList, CommandGroup, CommandItem, CommandEmpty } from "@/components/ui/command";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "next-themes";
import ErrorBoundary from "@/components/erp/ui/ErrorBoundary";
import ImageUploadField from "@/components/erp/ui/ImageUploadField";

// ─── Lazy-loaded page components for performance ───
// Heavy components are loaded on-demand when the user navigates to them,
// reducing the initial bundle size significantly.
const AccountManagementPage = React.lazy(() => import("@/components/AccountManagementPage"));
const ChartOfAccountsLedgerPage = React.lazy(() => import("@/components/ChartOfAccountsLedgerPage"));
const AccountingReportsPage = React.lazy(() => import("@/components/AccountingReportsPage"));
const BalanceSheetPeriodClosePage = React.lazy(() => import("@/components/BalanceSheetPeriodClosePage"));
const DashboardAnalyticsPage = React.lazy(() => import("@/components/DashboardAnalyticsPage"));
const MISReportEngine = React.lazy(() => import("@/components/MISReportEngine"));
const CustomerSupplierLedgerPage = React.lazy(() => import("@/components/CustomerSupplierLedgerPage"));
const SMSAnalyticsPage = React.lazy(() => import("@/components/SMSAnalyticsPage"));
const InvestmentGroupPage = React.lazy(() => import("@/components/InvestmentGroupPage"));
const BasicModulesGroupPage = React.lazy(() => import("@/components/BasicModulesGroupPage"));
const OperationsModulePage = React.lazy(() => import("@/components/OperationsModulePage"));
const StructureModulePage = React.lazy(() => import("@/components/StructureModulePage"));
const InterestPercentageEnginePage = React.lazy(() => import("@/components/InterestPercentageEnginePage"));
const PersonnelCRMGroupPage = React.lazy(() => import("@/components/PersonnelCRMGroupPage"));
const InventoryGroupPage = React.lazy(() => import("@/components/InventoryGroupPage"));
const SalesModulePage = React.lazy(() => import("@/components/SalesModulePage"));
const StockModulePage = React.lazy(() => import("@/components/StockModulePage"));
const ReturnReplacementModulePage = React.lazy(() => import("@/components/ReturnReplacementModulePage"));
const FinancialAuditGroupPage = React.lazy(() => import("@/components/FinancialAuditGroupPage"));
const SystemSettingsGroupPage = React.lazy(() => import("@/components/SystemSettingsGroupPage"));
const AuditTrailViewer = React.lazy(() => import("@/components/AuditTrailViewer"));
const ProfileCenter = React.lazy(() => import("@/components/ProfileCenter"));

// ─── Lazy-load fallback skeleton with pulse animation ───
function LazyFallback({ name }: { name?: string }) {
  return (
    <div className="min-h-[400px] p-6 space-y-6 animate-in fade-in duration-300">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-7 w-48 bg-muted rounded-md animate-pulse" />
        <div className="h-4 w-72 bg-muted rounded-md animate-pulse" />
      </div>
      {/* Stat cards skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-4 space-y-3">
            <div className="h-4 w-20 bg-muted rounded animate-pulse" />
            <div className="h-7 w-24 bg-muted rounded animate-pulse" />
            <div className="h-3 w-16 bg-muted rounded animate-pulse" />
          </div>
        ))}
      </div>
      {/* Table skeleton */}
      <div className="rounded-lg border bg-card">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="h-5 w-32 bg-muted rounded animate-pulse" />
          <div className="flex gap-2">
            <div className="h-8 w-20 bg-muted rounded animate-pulse" />
            <div className="h-8 w-20 bg-muted rounded animate-pulse" />
          </div>
        </div>
        {/* Table header row */}
        <div className="border-b px-4 py-3 flex gap-6">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-4 flex-1 bg-muted rounded animate-pulse" />
          ))}
        </div>
        {/* Table body rows */}
        {[...Array(6)].map((_, row) => (
          <div key={row} className="px-4 py-3 flex gap-6 border-b last:border-0">
            {[...Array(5)].map((_, col) => (
              <div key={col} className="h-4 flex-1 bg-muted rounded animate-pulse" style={{ animationDelay: `${(row * 5 + col) * 50}ms` }} />
            ))}
          </div>
        ))}
      </div>
      {/* Loading text */}
      <div className="flex items-center justify-center gap-2 pt-2">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">{name ? `Loading ${name}...` : "Loading..."}</span>
      </div>
    </div>
  );
}
import AppHeader from "@/components/erp/layout/AppHeader";
import { exportToPDF, exportToPDFSimple, exportToCSV, exportToCSVSimple, importFromCSV, getVatMaskedKeys, VAT_MASKED_COLUMNS } from "@/lib/export-utils";
import type { ColumnDef as ExportColumnDef, FieldDef as ExportFieldDef, PDFOptions, CSVOptions, CompanyProfile as ExportCompanyProfile } from "@/lib/export-utils";

// ============================================================
// TYPES & INTERFACES
// ============================================================

type UserRole = "admin" | "manager" | "sr" | "dealer" | "vat_auditor";

interface AuthUser {
  name: string;
  email: string;
  role: UserRole;
  displayName: string;
}

interface ColumnDef {
  key: string;
  label: string;
  type?: "text" | "number" | "boolean" | "date" | "currency" | "select";
  options?: { value: string; label: string }[];
}

interface FieldDef {
  key: string;
  label: string;
  type: "text" | "number" | "email" | "password" | "textarea" | "select" | "checkbox" | "date" | "image";
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  defaultValue?: any;
  step?: string;
}

interface SidebarItem {
  key: string;
  label: string;
  icon?: React.ElementType;
  parent?: string;
  apiPath?: string;
  columns?: ColumnDef[];
  formFields?: FieldDef[];
  isReport?: boolean;
  reportType?: string;
}

interface SidebarGroup {
  key: string;
  label: string;
  icon: React.ElementType;
  items: SidebarItem[];
}

// ============================================================
// RBAC AUTH ENGINE - 5 Roles with Permissions
// ============================================================

const ROLE_ACCESS: Record<UserRole, string[]> = {
  admin: ["*"],
  manager: ["investment", "basic-modules", "staff", "customers-suppliers", "inventory", "account", "sms", "accounting-report", "financial-audit", "mis-report", "system-settings"],
  sr: ["basic-modules", "staff", "customers-suppliers", "inventory", "sms"],
  dealer: ["basic-modules", "customers-suppliers", "inventory"],
  vat_auditor: ["basic-modules", "customers-suppliers", "inventory", "accounting-report", "financial-audit", "mis-report", "system-settings"],
};

const ROLE_COLORS: Record<UserRole, string> = {
  admin: "bg-blue-500",
  manager: "bg-green-500",
  sr: "bg-yellow-500",
  dealer: "bg-purple-500",
  vat_auditor: "bg-amber-500",
};

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  manager: "Manager",
  sr: "SR",
  dealer: "Dealer",
  vat_auditor: "VAT Auditor",
};

// Item-level RBAC: restrict specific sidebar items per role
const ITEM_ACCESS_DENIED: Record<UserRole, string[]> = {
  admin: [],
  manager: [],
  dealer: ["purchase-orders", "auto-po", "purchase-returns", "sales-returns", "replacements", "expenses", "incomes", "cash-collections", "cash-deliveries", "bank-transactions", "expense-income-heads", "chart-of-accounts", "cash-in-hand", "trial-balance", "profit-loss", "balance-sheet", "designations", "employees", "employee-leaves", "suppliers", "dashboard-kpi", "ledger-auto-post", "inventory-aging", "product-lifecycle", "notifications-integrity", "employee-information-report", "product-information-report", "stock-details-report", "stock-summary-report", "stock-ledger-report", "stock-qty-report", "stock-forecast-product", "stock-forecast-concern", "supplier-ledger-report", "daily-purchase-report", "supplier-wise-purchase", "supplier-cash-delivery-report", "supplier-due-report", "model-wise-purchase", "vat-report", "daily-sales-report", "replacement-report", "model-wise-sales", "installment-collection", "upcoming-installment", "defaulting-customer", "default-customer-summary", "hire-account-details", "sr-wise-sales-report", "sr-wise-sales-details", "sr-wise-customer-due", "sr-wise-customer-summary", "sr-visit-report", "sr-wise-customer-status", "sr-wise-cash-collection", "sr-commission-report", "customer-wise-sales", "category-wise-customer-due", "customer-ledger-report", "customer-due-report", "customer-cash-collection", "customer-ledger-summary", "expense-report", "management-report", "advance-search", "bank-report", "bank-transaction-report", "bank-balance-report", "company-settings", "invoice-templates", "number-formats", "audit-trail", "performance-cache", "sms-inbox", "send-sms", "sms-bills", "sms-bill-payments", "sms-settings", "send-bulk-sms", "sms-report"],
  sr: ["purchase-orders", "auto-po", "purchase-returns", "expenses", "cash-deliveries", "bank-transactions", "expense-income-heads", "chart-of-accounts", "cash-in-hand", "trial-balance", "profit-loss", "balance-sheet", "suppliers", "dashboard-kpi", "ledger-auto-post", "inventory-aging", "product-lifecycle", "notifications-integrity", "employee-information-report", "product-information-report", "stock-details-report", "stock-summary-report", "stock-ledger-report", "stock-qty-report", "stock-forecast-product", "stock-forecast-concern", "supplier-ledger-report", "daily-purchase-report", "supplier-wise-purchase", "supplier-cash-delivery-report", "supplier-due-report", "model-wise-purchase", "vat-report", "daily-sales-report", "replacement-report", "model-wise-sales", "installment-collection", "upcoming-installment", "defaulting-customer", "default-customer-summary", "hire-account-details", "sr-wise-sales-report", "sr-wise-sales-details", "sr-wise-customer-due", "sr-wise-customer-summary", "sr-visit-report", "sr-wise-customer-status", "sr-wise-cash-collection", "sr-commission-report", "customer-wise-sales", "category-wise-customer-due", "customer-ledger-report", "customer-due-report", "customer-cash-collection", "customer-ledger-summary", "expense-report", "management-report", "advance-search", "bank-report", "bank-transaction-report", "bank-balance-report", "company-settings", "invoice-templates", "number-formats", "audit-trail", "performance-cache", "sms-bills", "sms-bill-payments", "sms-settings", "send-bulk-sms"],
  vat_auditor: ["sms-inbox", "send-sms", "sms-bills", "sms-bill-payments", "sms-settings", "send-bulk-sms", "sms-report"],
};

function hasItemAccess(role: UserRole, itemKey: string): boolean {
  const denied = ITEM_ACCESS_DENIED[role] || [];
  return !denied.includes(itemKey);
}

let authState = {
  isAuthenticated: false,
  user: null as AuthUser | null,
  accessToken: null as string | null,
  refreshToken: null as string | null,
  tokenExpiry: null as number | null, // epoch ms when access token expires
};

let authListeners: Array<() => void> = [];

// ── JWT Token Auto-Refresh ──
// Proactively refreshes the access token 5 minutes before expiry
// Prevents unexpected logouts during active sessions
let refreshTimerRef: ReturnType<typeof setTimeout> | null = null;

function scheduleTokenRefresh() {
  // Clear any existing refresh timer
  if (refreshTimerRef) {
    clearTimeout(refreshTimerRef);
    refreshTimerRef = null;
  }

  if (!authState.refreshToken || !authState.tokenExpiry) return;

  const now = Date.now();
  const expiresAt = authState.tokenExpiry;
  const refreshThreshold = 5 * 60 * 1000; // 5 minutes before expiry

  const timeUntilRefresh = expiresAt - now - refreshThreshold;

  if (timeUntilRefresh <= 0) {
    // Token already within refresh window or expired — refresh immediately
    performTokenRefresh();
    return;
  }

  // Schedule refresh for 5 minutes before expiry
  refreshTimerRef = setTimeout(() => {
    performTokenRefresh();
  }, timeUntilRefresh);
}

async function performTokenRefresh() {
  if (!authState.refreshToken) return;

  try {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: authState.refreshToken }),
    });

    if (!res.ok) {
      // Refresh token expired — force re-login
      authState = { isAuthenticated: false, user: null, accessToken: null, refreshToken: null, tokenExpiry: null };
      localStorage.removeItem("ems_auth");
      authListeners.forEach(l => l());
      return;
    }

    const data = await res.json();

    // Decode new access token to get expiry
    let tokenExpiry: number | null = null;
    try {
      const payload = JSON.parse(atob(data.accessToken.split(".")[1]));
      tokenExpiry = payload.exp * 1000;
    } catch {}

    authState = {
      ...authState,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken || authState.refreshToken,
      tokenExpiry,
    };
    localStorage.setItem("ems_auth", JSON.stringify(authState));
    authListeners.forEach(l => l());

    // Schedule next refresh
    scheduleTokenRefresh();
  } catch {
    // Network error — don't force logout, just skip this refresh cycle
    // Will retry on next scheduled interval or on next API call
  }
}

function useAuth() {
  const [, forceUpdate] = useState({});
  useEffect(() => {
    const listener = () => forceUpdate({});
    authListeners.push(listener);
    return () => { authListeners = authListeners.filter(l => l !== listener); };
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("ems_auth");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);

        // ── Stale Session Migration ──
        // If the stored session has no JWT access token (pre-Phase 3 session),
        // force a clean re-login instead of proceeding with broken auth
        if (parsed.isAuthenticated && !parsed.accessToken) {
          // Clear stale session — user must re-login to get JWT tokens
          authState = { isAuthenticated: false, user: null, accessToken: null, refreshToken: null, tokenExpiry: null };
          localStorage.removeItem("ems_auth");
          authListeners.forEach(l => l());
          return;
        }

        // ── Expired Token Check ──
        // If the access token has already expired and no refresh token, force re-login
        if (parsed.tokenExpiry && parsed.tokenExpiry < Date.now() && !parsed.refreshToken) {
          authState = { isAuthenticated: false, user: null, accessToken: null, refreshToken: null, tokenExpiry: null };
          localStorage.removeItem("ems_auth");
          authListeners.forEach(l => l());
          return;
        }

        authState = parsed;

        // If token is expired but we have a refresh token, try refreshing immediately
        if (parsed.tokenExpiry && parsed.tokenExpiry < Date.now() && parsed.refreshToken) {
          performTokenRefresh();
        } else {
          // Schedule proactive refresh for valid token
          scheduleTokenRefresh();
        }

        authListeners.forEach(l => l());
      } catch {
        // Corrupted localStorage — clear and force re-login
        authState = { isAuthenticated: false, user: null, accessToken: null, refreshToken: null, tokenExpiry: null };
        localStorage.removeItem("ems_auth");
        authListeners.forEach(l => l());
      }
    }
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    // Server-side auth: validates against DB, auto-seeds all 5 role users
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: username, password }),
      });
      if (!res.ok) return false;
      const serverUser = await res.json();
      // Map server response to client-side auth state
      const resolvedDisplayName = serverUser.displayName || serverUser.name || username;

      // Decode access token to get expiry timestamp
      let tokenExpiry: number | null = null;
      try {
        const payload = JSON.parse(atob(serverUser.accessToken.split(".")[1]));
        tokenExpiry = payload.exp * 1000;
      } catch {}

      authState = {
        isAuthenticated: true,
        user: {
          name: resolvedDisplayName, // Always use display name, never raw username
          email: serverUser.email || username, // Use DB email for server-side RBAC lookup
          role: (serverUser.role as UserRole) || "admin",
          displayName: resolvedDisplayName,
        },
        accessToken: serverUser.accessToken || null,
        refreshToken: serverUser.refreshToken || null,
        tokenExpiry,
      };
      localStorage.setItem("ems_auth", JSON.stringify(authState));
      authListeners.forEach(l => l());

      // Schedule proactive token refresh
      scheduleTokenRefresh();

      return true;
    } catch {
      // Network error — return false so the login form shows its error message
      return false;
    }
  };

  const logout = () => {
    // Revoke the JWT token on the server (fire-and-forget)
    if (authState.accessToken) {
      fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authState.accessToken}`,
        },
        body: JSON.stringify({ refreshToken: authState.refreshToken }),
      }).catch(() => {}); // Non-blocking
    }
    // Clear refresh timer
    if (refreshTimerRef) {
      clearTimeout(refreshTimerRef);
      refreshTimerRef = null;
    }
    authState = { isAuthenticated: false, user: null, accessToken: null, refreshToken: null, tokenExpiry: null };
    localStorage.removeItem("ems_auth");
    authListeners.forEach(l => l());
  };

  const hasAccess = (groupKey: string): boolean => {
    if (!authState.user) return false;
    const access = ROLE_ACCESS[authState.user.role];
    if (!access) return false;
    return access.includes("*") || access.includes(groupKey);
  };

  const isVatAuditor = authState.user?.role === "vat_auditor";

  return { ...authState, login, logout, hasAccess, isVatAuditor };
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

const bdCurrencyFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmt = (v: any, type?: string) => {
  if (v === null || v === undefined) return "—";
  if (type === "currency") return `৳${bdCurrencyFmt.format(Number(v))}`;
  if (type === "date") return v ? new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  if (type === "boolean") return v ? "Active" : "Inactive";
  return String(v);
};

const fmtDate = (d: string | Date) => d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

async function apiFetch(path: string, opts?: RequestInit) {
  // Server-side RBAC: send JWT Bearer token in Authorization header
  // Falls back to X-User-Email for backward compatibility
  const authHeaders: Record<string, string> = { "Content-Type": "application/json" };
  if (authState.accessToken) {
    authHeaders["Authorization"] = `Bearer ${authState.accessToken}`;
  }
  if (authState.user?.email && !authState.accessToken) {
    // Legacy fallback: send email header if no JWT token
    authHeaders["X-User-Email"] = authState.user.email;
  }
  const res = await fetch(path, { headers: { ...authHeaders, ...opts?.headers }, ...opts });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    // If 401 with expired token, try to refresh once before forcing logout
    if (res.status === 401 && authState.refreshToken && err.expired) {
      try {
        const refreshRes = await fetch("/api/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: authState.refreshToken }),
        });
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          let tokenExpiry: number | null = null;
          try {
            const payload = JSON.parse(atob(data.accessToken.split(".")[1]));
            tokenExpiry = payload.exp * 1000;
          } catch {}
          authState = {
            ...authState,
            accessToken: data.accessToken,
            refreshToken: data.refreshToken || authState.refreshToken,
            tokenExpiry,
          };
          localStorage.setItem("ems_auth", JSON.stringify(authState));
          authListeners.forEach(l => l());
          scheduleTokenRefresh();

          // Retry the original request with new token
          const retryHeaders: Record<string, string> = { "Content-Type": "application/json", "Authorization": `Bearer ${data.accessToken}` };
          const retryRes = await fetch(path, { headers: { ...retryHeaders, ...opts?.headers }, ...opts });
          if (!retryRes.ok) {
            const retryErr = await retryRes.json().catch(() => ({ error: retryRes.statusText }));
            if (retryRes.status === 401) {
              // Even after refresh, still 401 — force logout
              authState = { isAuthenticated: false, user: null, accessToken: null, refreshToken: null, tokenExpiry: null };
              localStorage.removeItem("ems_auth");
              authListeners.forEach(l => l());
            }
            throw new Error(retryErr.error || "Request failed");
          }
          return retryRes.json();
        }
      } catch (retryError) {
        // Refresh failed — fall through to logout
      }
    }
    // If 401 without refresh possibility, force logout (session expired)
    if (res.status === 401) {
      authState = { isAuthenticated: false, user: null, accessToken: null, refreshToken: null, tokenExpiry: null };
      localStorage.removeItem("ems_auth");
      authListeners.forEach(l => l());
    }
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

// ============================================================
// SIDEBAR CONFIGURATION - Complete Navigation
// ============================================================

const SIDEBAR_CONFIG: SidebarGroup[] = [
  {
    key: "investment",
    label: "Investment",
    icon: TrendingUp,
    items: [
      { key: "investment-heads", label: "Investment Heads" },
      { key: "investment", label: "Investment" },
      { key: "fixed-asset", label: "Fixed Asset", parent: "Asset" },
      { key: "current-asset", label: "Current Asset", parent: "Asset" },
      { key: "liability-receive", label: "Liability Receive", parent: "Liability" },
      { key: "liability-pay", label: "Liability Pay", parent: "Liability" },
      { key: "liability-report", label: "Liability Report", parent: "Liability" },
    ],
  },
  {
    key: "basic-modules",
    label: "Basic Modules",
    icon: Building2,
    items: [
      { key: "companies", label: "Companies", icon: Building2, parent: "Core Config" },
      { key: "categories", label: "Categories", icon: Tag, parent: "Core Config" },
      { key: "colors", label: "Colors", icon: Palette, parent: "Core Config" },
      { key: "brands", label: "Brands", icon: Box, parent: "Core Config" },
      { key: "units", label: "Units", icon: Hash, parent: "Core Config" },
      { key: "products", label: "Products", icon: Package },
      { key: "banks", label: "Bank", icon: Banknote, apiPath: "/api/banks", columns: [{ key: "bankName", label: "Bank Name", type: "text" }, { key: "bankType", label: "Type", type: "text" }, { key: "branch", label: "Branch", type: "text" }, { key: "accountNo", label: "Account No", type: "text" }, { key: "accountHolder", label: "Account Holder", type: "text" }, { key: "openingBalance", label: "Opening Balance", type: "currency" }, { key: "currentBalance", label: "Current Balance", type: "currency" }, { key: "chartOfAccount.name", label: "CoA Mapping", type: "text" }, { key: "isActive", label: "Status", type: "boolean" }], formFields: [{ key: "bankName", label: "Bank Name", type: "text", required: true }, { key: "bankType", label: "Account Type", type: "select", required: true, options: [{ value: "Bank", label: "Bank Account" }, { value: "MFS", label: "Mobile Financial Service (Bkash/Nagad)" }, { value: "CashDrawer", label: "Physical Cash Drawer" }] }, { key: "branch", label: "Branch", type: "text" }, { key: "accountNo", label: "Account No", type: "text", required: true }, { key: "accountHolder", label: "Account Holder", type: "text", required: true }, { key: "openingBalance", label: "Opening Balance", type: "number", defaultValue: 0, step: "0.01" }, { key: "isActive", label: "Active", type: "checkbox", defaultValue: true }] },
      { key: "departments", label: "Department", icon: Building, parent: "Structure" },
      { key: "godowns", label: "Godowns", icon: Warehouse, parent: "Structure" },
      { key: "interest-percentages", label: "Interest % Engine", icon: Percent, parent: "Structure" },
      { key: "segments", label: "Segment", icon: Layers, parent: "Structure" },
      { key: "capacities", label: "Capacity", icon: Hash, parent: "Structure" },
      { key: "sr-targets", label: "SR Target Setup", icon: Target, parent: "Operations" },
      { key: "payment-options", label: "Payment Option", icon: CreditCard, parent: "Operations" },
      { key: "card-types", label: "CardType", icon: CreditCard, parent: "Operations" },
      { key: "card-type-setup", label: "CardType Setup", icon: Settings, parent: "Operations" },
    ],
  },
  {
    key: "staff",
    label: "Staff",
    icon: Users,
    items: [
      { key: "designations", label: "Designations", apiPath: "/api/designations", columns: [{ key: "name", label: "Name", type: "text" }, { key: "departmentId", label: "Department", type: "text" }, { key: "isActive", label: "Status", type: "boolean" }], formFields: [{ key: "name", label: "Name", type: "text", required: true }, { key: "departmentId", label: "Department", type: "select", required: true, options: [] }, { key: "isActive", label: "Active", type: "checkbox", defaultValue: true }] },
      { key: "employees", label: "Employees", apiPath: "/api/employees", columns: [{ key: "employeeCode", label: "Code", type: "text" }, { key: "name", label: "Name", type: "text" }, { key: "designationId", label: "Designation", type: "text" }, { key: "departmentId", label: "Department", type: "text" }, { key: "phone", label: "Phone", type: "text" }, { key: "isActive", label: "Status", type: "boolean" }], formFields: [{ key: "name", label: "Name", type: "text", required: true }, { key: "designationId", label: "Designation", type: "select", required: true, options: [] }, { key: "departmentId", label: "Department", type: "select", required: true, options: [] }, { key: "joiningDate", label: "Joining Date", type: "date", required: true }, { key: "phone", label: "Phone", type: "text" }, { key: "address", label: "Address", type: "textarea" }, { key: "isActive", label: "Active", type: "checkbox", defaultValue: true }] },
      { key: "employee-leaves", label: "Employee Leave", apiPath: "/api/employee-leaves", columns: [{ key: "employeeId", label: "Employee", type: "text" }, { key: "leaveType", label: "Leave Type", type: "text" }, { key: "fromDate", label: "From", type: "date" }, { key: "toDate", label: "To", type: "date" }, { key: "status", label: "Status", type: "text" }], formFields: [{ key: "employeeId", label: "Employee", type: "select", required: true, options: [] }, { key: "leaveType", label: "Leave Type", type: "select", required: true, options: [{ value: "Casual", label: "Casual" }, { value: "Sick", label: "Sick" }, { value: "Annual", label: "Annual" }, { value: "Maternity", label: "Maternity" }] }, { key: "fromDate", label: "From Date", type: "date", required: true }, { key: "toDate", label: "To Date", type: "date", required: true }, { key: "reason", label: "Reason", type: "textarea" }, { key: "status", label: "Status", type: "select", options: [{ value: "Pending", label: "Pending" }, { value: "Approved", label: "Approved" }, { value: "Rejected", label: "Rejected" }], defaultValue: "Pending" }] },
    ],
  },
  {
    key: "customers-suppliers",
    label: "Customers & Suppliers",
    icon: UserCircle,
    items: [
      { key: "customers", label: "Customers", apiPath: "/api/customers", columns: [{ key: "customerCode", label: "Code", type: "text" }, { key: "name", label: "Name", type: "text" }, { key: "phone", label: "Phone", type: "text" }, { key: "customerType", label: "Type", type: "text" }, { key: "openingBalance", label: "Opening Balance", type: "currency" }, { key: "openingBalanceType", label: "Dr/Cr", type: "text" }, { key: "creditLimit", label: "Credit Limit", type: "currency" }, { key: "isActive", label: "Status", type: "boolean" }], formFields: [{ key: "customerCode", label: "Code", type: "text", required: false, placeholder: "Auto-generated" }, { key: "name", label: "Customer Name", type: "text", required: true }, { key: "phone", label: "Phone", type: "text" }, { key: "email", label: "Email", type: "email" }, { key: "address", label: "Address", type: "textarea" }, { key: "customerType", label: "Customer Type", type: "select", required: true, options: [{ value: "Regular", label: "Regular" }, { value: "Dealer", label: "Dealer" }] }, { key: "openingBalance", label: "Opening Balance", type: "number", defaultValue: 0 }, { key: "openingBalanceType", label: "Opening Type", type: "select", options: [{ value: "Dr", label: "Dr (Debit)" }, { value: "Cr", label: "Cr (Credit)" }] }, { key: "creditLimit", label: "Credit Limit", type: "number", defaultValue: 0 }, { key: "isActive", label: "Active", type: "checkbox", defaultValue: true }] },
      { key: "suppliers", label: "Suppliers", apiPath: "/api/suppliers", columns: [{ key: "supplierCode", label: "Code", type: "text" }, { key: "name", label: "Name", type: "text" }, { key: "phone", label: "Phone", type: "text" }, { key: "openingBalance", label: "Opening Balance", type: "currency" }, { key: "openingBalanceType", label: "Dr/Cr", type: "text" }, { key: "creditLimit", label: "Credit Limit", type: "currency" }, { key: "isActive", label: "Status", type: "boolean" }], formFields: [{ key: "supplierCode", label: "Code", type: "text", required: false, placeholder: "Auto-generated" }, { key: "name", label: "Supplier Name", type: "text", required: true }, { key: "phone", label: "Phone", type: "text" }, { key: "email", label: "Email", type: "email" }, { key: "address", label: "Address", type: "textarea" }, { key: "openingBalance", label: "Opening Balance", type: "number", defaultValue: 0 }, { key: "openingBalanceType", label: "Opening Type", type: "select", options: [{ value: "Cr", label: "Cr (Credit)" }, { value: "Dr", label: "Dr (Debit)" }] }, { key: "creditLimit", label: "Credit Limit", type: "number", defaultValue: 0 }, { key: "isActive", label: "Active", type: "checkbox", defaultValue: true }] },
    ],
  },
  {
    key: "inventory",
    label: "Inventory Management",
    icon: ClipboardList,
    items: [
      { key: "company-ordersheet", label: "Company Ordersheet", parent: "Order Sheet", apiPath: "/api/order-sheets", columns: [{ key: "sheetNo", label: "Sheet No", type: "text" }, { key: "date", label: "Date", type: "date" }, { key: "companyId", label: "Company", type: "text" }, { key: "status", label: "Status", type: "text" }], formFields: [{ key: "sheetNo", label: "Sheet No", type: "text", required: true }, { key: "companyId", label: "Company", type: "select", options: [] }, { key: "date", label: "Date", type: "date", required: true }, { key: "status", label: "Status", type: "select", options: [{ value: "Draft", label: "Draft" }, { value: "Confirmed", label: "Confirmed" }, { value: "Completed", label: "Completed" }], defaultValue: "Draft" }, { key: "notes", label: "Notes", type: "textarea" }] },
      { key: "customer-ordersheet", label: "Customer Ordersheet", parent: "Order Sheet", apiPath: "/api/order-sheets", columns: [{ key: "sheetNo", label: "Sheet No", type: "text" }, { key: "date", label: "Date", type: "date" }, { key: "customerId", label: "Customer", type: "text" }, { key: "status", label: "Status", type: "text" }], formFields: [{ key: "sheetNo", label: "Sheet No", type: "text", required: true }, { key: "customerId", label: "Customer", type: "select", options: [] }, { key: "date", label: "Date", type: "date", required: true }, { key: "status", label: "Status", type: "select", options: [{ value: "Draft", label: "Draft" }, { value: "Confirmed", label: "Confirmed" }, { value: "Completed", label: "Completed" }], defaultValue: "Draft" }, { key: "notes", label: "Notes", type: "textarea" }] },
      { key: "ordersheet-report", label: "Ordersheet Report", parent: "Order Sheet", isReport: true, reportType: "ordersheet" },
      { key: "purchase-orders", label: "Purchase Order", icon: ShoppingCart },
      { key: "auto-po", label: "Auto PO", isReport: true, reportType: "auto-po" },
      { key: "sales-orders", label: "Sales Order", icon: Receipt },
      { key: "hire-sales", label: "Hire Sales", icon: DollarSign },
      { key: "sales-returns", label: "Sales Return", icon: RotateCcw },
      { key: "purchase-returns", label: "Purchase Return", icon: RotateCcw },
      { key: "replacements", label: "Replacement Order", apiPath: "/api/replacements", columns: [{ key: "replacementNo", label: "Replacement No", type: "text" }, { key: "date", label: "Date", type: "date" }, { key: "reason", label: "Reason", type: "text" }, { key: "status", label: "Status", type: "text" }], formFields: [{ key: "replacementNo", label: "Replacement No", type: "text", required: true }, { key: "salesOrderId", label: "Sales Order", type: "select", options: [] }, { key: "date", label: "Date", type: "date", required: true }, { key: "reason", label: "Reason", type: "textarea" }, { key: "status", label: "Status", type: "select", options: [{ value: "Pending", label: "Pending" }, { value: "Approved", label: "Approved" }, { value: "Completed", label: "Completed" }], defaultValue: "Pending" }] },
      { key: "stock", label: "Stock", icon: Package },
      { key: "stock-details", label: "Stock Details", icon: BarChart3 },
      { key: "stock-transfers", label: "Transfer", icon: ArrowLeftRight },
      { key: "opening-stock", label: "Opening Stock", icon: Archive },
      { key: "batch-master", label: "Batch Master", icon: Layers },
      { key: "valuation", label: "Valuation", icon: Calculator },
    ],
  },
  {
    key: "account",
    label: "Account Management",
    icon: DollarSign,
    items: [
      { key: "expense-income-heads", label: "Expense/Income Head", apiPath: "/api/expense-income-heads", columns: [{ key: "name", label: "Name", type: "text" }, { key: "type", label: "Type", type: "text" }, { key: "isActive", label: "Status", type: "boolean" }], formFields: [{ key: "name", label: "Name", type: "text", required: true }, { key: "type", label: "Type", type: "select", required: true, options: [{ value: "Expense", label: "Expense" }, { value: "Income", label: "Income" }] }, { key: "isActive", label: "Active", type: "checkbox", defaultValue: true }] },
      { key: "expenses", label: "Expense", icon: ArrowDownCircle },
      { key: "incomes", label: "Income", icon: ArrowUpCircle },
      { key: "cash-collections", label: "Cash Collection", icon: DollarSign },
      { key: "cash-deliveries", label: "Cash Delivery", icon: Send },
      { key: "bank-transactions", label: "Bank Transaction", icon: Banknote },
    ],
  },
  {
    key: "sms",
    label: "SMS Service",
    icon: MessageSquare,
    items: [
      { key: "sms-inbox", label: "SMS Inbox", apiPath: "/api/sms-logs", columns: [{ key: "recipient", label: "Recipient", type: "text" }, { key: "message", label: "Message", type: "text" }, { key: "status", label: "Status", type: "text" }, { key: "sentAt", label: "Sent At", type: "date" }, { key: "cost", label: "Cost", type: "currency" }] },
      { key: "send-sms", label: "Send SMS", formFields: [{ key: "recipient", label: "Recipient", type: "text", required: true }, { key: "message", label: "Message", type: "textarea", required: true }] },
      { key: "sms-bills", label: "SMS Bill", apiPath: "/api/sms-bills", columns: [{ key: "period", label: "Period", type: "text" }, { key: "totalSms", label: "Total SMS", type: "number" }, { key: "totalCost", label: "Total Cost", type: "currency" }, { key: "paidAmount", label: "Paid", type: "currency" }, { key: "status", label: "Status", type: "text" }], formFields: [{ key: "period", label: "Period", type: "text", required: true }, { key: "totalSms", label: "Total SMS", type: "number", required: true }, { key: "totalCost", label: "Total Cost", type: "number", required: true }, { key: "paidAmount", label: "Paid Amount", type: "number", defaultValue: 0 }, { key: "status", label: "Status", type: "select", options: [{ value: "Unpaid", label: "Unpaid" }, { value: "Partial", label: "Partial" }, { value: "Paid", label: "Paid" }], defaultValue: "Unpaid" }] },
      { key: "sms-report", label: "SMS Report", isReport: true, reportType: "sms" },
      { key: "sms-settings", label: "SMS Service Setting", apiPath: "/api/sms-settings", columns: [{ key: "apiUrl", label: "API URL", type: "text" }, { key: "apiKey", label: "API Key", type: "text" }, { key: "senderId", label: "Sender ID", type: "text" }, { key: "isActive", label: "Status", type: "boolean" }], formFields: [{ key: "apiUrl", label: "API URL", type: "text", required: true }, { key: "apiKey", label: "API Key", type: "text", required: true }, { key: "senderId", label: "Sender ID", type: "text", required: true }, { key: "isActive", label: "Active", type: "checkbox", defaultValue: true }] },
      { key: "sms-bill-payments", label: "SMS Bill Payment", apiPath: "/api/sms-bill-payments", columns: [{ key: "smsBillId", label: "SMS Bill", type: "text" }, { key: "amount", label: "Amount", type: "currency" }, { key: "date", label: "Date", type: "date" }, { key: "method", label: "Method", type: "text" }], formFields: [{ key: "smsBillId", label: "SMS Bill", type: "select", required: true, options: [] }, { key: "amount", label: "Amount", type: "number", required: true }, { key: "date", label: "Date", type: "date", required: true }, { key: "method", label: "Method", type: "select", options: [{ value: "Cash", label: "Cash" }, { value: "Bank Transfer", label: "Bank Transfer" }] }, { key: "notes", label: "Notes", type: "textarea" }] },
      { key: "send-bulk-sms", label: "Send Bulk SMS", formFields: [{ key: "recipients", label: "Recipients (comma-separated)", type: "textarea", required: true }, { key: "message", label: "Message", type: "textarea", required: true }] },
    ],
  },
  {
    key: "accounting-report",
    label: "Accounting Report",
    icon: FileText,
    items: [
      { key: "chart-of-accounts", label: "Chart of Accounts & Ledger" },
      { key: "cash-in-hand", label: "Cash In Hand" },
      { key: "trial-balance", label: "Trial Balance" },
      { key: "profit-loss", label: "Profit and Loss Account" },
      { key: "balance-sheet", label: "Balance Sheet & Period Close" },
    ],
  },
  {
    key: "financial-audit",
    label: "Financial Audit",
    icon: ShieldCheck,
    items: [
      { key: "dashboard-kpi", label: "Dashboard KPI", parent: "Audit & Integrity" },
      { key: "fraud-detection", label: "Fraud Detection", parent: "Audit & Integrity" },
      { key: "ledger-auto-post", label: "Ledger Auto-Post", parent: "Audit & Integrity" },
      { key: "inventory-aging", label: "Inventory Aging", parent: "Audit & Integrity" },
      { key: "product-lifecycle", label: "Product Lifecycle", parent: "Audit & Integrity" },
      { key: "specialized-reports", label: "Specialized Reports", parent: "Audit & Integrity" },
      { key: "notifications-integrity", label: "Notifications & Integrity", parent: "Audit & Integrity" },
    ],
  },
  {
    key: "mis-report",
    label: "MIS Report",
    icon: BarChart3,
    items: [
      { key: "employee-information-report", label: "Employee Information", parent: "Basic Report", isReport: true, reportType: "employee-information" },
      { key: "product-information-report", label: "Product Information", parent: "Basic Report", isReport: true, reportType: "product-information" },
      { key: "stock-details-report", label: "Stock Details Report", parent: "Basic Report", isReport: true, reportType: "stock-details" },
      { key: "stock-summary-report", label: "Stock Summary Report", parent: "Basic Report", isReport: true, reportType: "stock-summary" },
      { key: "stock-ledger-report", label: "Stock Ledger", parent: "Basic Report", isReport: true, reportType: "stock-ledger" },
      { key: "stock-qty-report", label: "Stock Quantity Report", parent: "Basic Report", isReport: true, reportType: "stock-qty" },
      { key: "stock-forecast-product", label: "Stock Forcasting (Product Wise)", parent: "Basic Report", isReport: true, reportType: "stock-forecast-product" },
      { key: "stock-forecast-concern", label: "Stock Forcasting (Concern Wise)", parent: "Basic Report", isReport: true, reportType: "stock-forecast-concern" },
      { key: "stock-trends-report", label: "Stock Trend Analysis", parent: "Basic Report", isReport: true, reportType: "stock-trends" },
      { key: "supplier-status-report", label: "Supplier Status Grid", parent: "Basic Report", isReport: true, reportType: "supplier-status" },
      { key: "sales-performance-report", label: "Sales Performance", parent: "Basic Report", isReport: true, reportType: "sales-performance" },
      { key: "employee-records-report", label: "Employee Records", parent: "Basic Report", isReport: true, reportType: "employee-records" },
      { key: "supplier-ledger-report", label: "Supplier Ledger", parent: "Purchase Report", isReport: true, reportType: "supplier-ledger" },
      { key: "daily-purchase-report", label: "Daily Purchase Report", parent: "Purchase Report", isReport: true, reportType: "daily-purchase" },
      { key: "supplier-wise-purchase", label: "Suppliers Wise Purchase", parent: "Purchase Report", isReport: true, reportType: "supplier-wise-purchase" },
      { key: "supplier-cash-delivery-report", label: "Supplier Cash Delivery", parent: "Purchase Report", isReport: true, reportType: "supplier-cash-delivery" },
      { key: "supplier-due-report", label: "Suppliers Due Report", parent: "Purchase Report", isReport: true, reportType: "supplier-due" },
      { key: "model-wise-purchase", label: "Model Wise Purchase", parent: "Purchase Report", isReport: true, reportType: "model-wise-purchase" },
      { key: "vat-report", label: "Vat Report", parent: "Purchase Report", isReport: true, reportType: "vat" },
      { key: "daily-sales-report", label: "Daily Sales Report", parent: "Sales Report", isReport: true, reportType: "daily-sales" },
      { key: "replacement-report", label: "Replacement Report", parent: "Sales Report", isReport: true, reportType: "replacement" },
      { key: "model-wise-sales", label: "Model Wise Sales", parent: "Sales Report", isReport: true, reportType: "model-wise-sales" },
      { key: "installment-collection", label: "Installment Collection", parent: "Hire Sales Report", isReport: true, reportType: "installment-collection" },
      { key: "upcoming-installment", label: "Upcoming Installment", parent: "Hire Sales Report", isReport: true, reportType: "upcoming-installment" },
      { key: "defaulting-customer", label: "Defaulting Customer", parent: "Hire Sales Report", isReport: true, reportType: "defaulting-customer" },
      { key: "default-customer-summary", label: "Default Customer Summary", parent: "Hire Sales Report", isReport: true, reportType: "default-customer-summary" },
      { key: "hire-account-details", label: "Hire Account Details", parent: "Hire Sales Report", isReport: true, reportType: "hire-account-details" },
      { key: "sr-wise-sales-report", label: "SR Wise Sales Report", parent: "SR Report", isReport: true, reportType: "sr-wise-sales" },
      { key: "sr-wise-sales-details", label: "SR Wise Sales Details", parent: "SR Report", isReport: true, reportType: "sr-wise-sales-details" },
      { key: "sr-wise-customer-due", label: "SR Wise Customer Due", parent: "SR Report", isReport: true, reportType: "sr-wise-customer-due" },
      { key: "sr-wise-customer-summary", label: "SR Wise Customer Sales Summary", parent: "SR Report", isReport: true, reportType: "sr-wise-customer-summary" },
      { key: "sr-visit-report", label: "SR Visit Report", parent: "SR Report", isReport: true, reportType: "sr-visit" },
      { key: "sr-wise-customer-status", label: "SR Wise Customer Status", parent: "SR Report", isReport: true, reportType: "sr-wise-customer-status" },
      { key: "sr-wise-cash-collection", label: "SR Wise Cash Collection", parent: "SR Report", isReport: true, reportType: "sr-wise-cash-collection" },
      { key: "sr-commission-report", label: "SR Commission Report", parent: "SR Report", isReport: true, reportType: "sr-commission" },
      { key: "customer-wise-sales", label: "Customer Wise Sales Report", parent: "Customer Wise Report", isReport: true, reportType: "customer-wise-sales" },
      { key: "category-wise-customer-due", label: "Category Wise Customer Due", parent: "Customer Wise Report", isReport: true, reportType: "category-wise-customer-due" },
      { key: "customer-ledger-report", label: "Customer Ledger Report", parent: "Customer Wise Report", isReport: true, reportType: "customer-ledger" },
      { key: "customer-due-report", label: "Customer Due Report [Date Wise]", parent: "Customer Wise Report", isReport: true, reportType: "customer-due" },
      { key: "customer-cash-collection", label: "Customer Cash Collection", parent: "Customer Wise Report", isReport: true, reportType: "customer-cash-collection" },
      { key: "customer-ledger-summary", label: "Customer Ledger Summary", parent: "Customer Wise Report", isReport: true, reportType: "customer-ledger-summary" },
      { key: "expense-report", label: "Expense Report", parent: "Management Report", isReport: true, reportType: "expense" },
      { key: "product-wise-benefit", label: "Product Wise Benefit Report", parent: "Management Report", isReport: true, reportType: "product-wise-benefit" },
      { key: "income-report", label: "Income Report", parent: "Management Report", isReport: true, reportType: "income" },
      { key: "adjustment-report", label: "Adjustment Report", parent: "Management Report", isReport: true, reportType: "adjustment" },
      { key: "transaction-summary", label: "Transaction Summary Report", parent: "Management Report", isReport: true, reportType: "transaction-summary" },
      { key: "monthly-transaction", label: "Monthly Transaction Report", parent: "Management Report", isReport: true, reportType: "monthly-transaction" },
      { key: "showroom-analysis", label: "Showroom Analysis Report", parent: "Management Report", isReport: true, reportType: "showroom-analysis" },
      { key: "advance-search", label: "Advance Search", isReport: true, reportType: "advance-search" },
      { key: "bank-transaction-report", label: "Bank Transaction Report", parent: "Bank Report", isReport: true, reportType: "bank-transaction" },
      { key: "bank-ledger-report", label: "Bank Ledger", parent: "Bank Report", isReport: true, reportType: "bank-ledger" },
      { key: "transfer-report", label: "Transfer Report", parent: "Bank Report", isReport: true, reportType: "transfer-report" },
    ],
  },
  {
    key: "system-settings",
    label: "System Settings",
    icon: Settings,
    items: [
      { key: "company-settings", label: "Company Settings", parent: "Configuration" },
      { key: "invoice-templates", label: "Invoice Templates", parent: "Configuration" },
      { key: "number-formats", label: "Number Formats", parent: "Configuration" },
      { key: "audit-trail", label: "Audit Trail Viewer", parent: "Audit & Search" },
      { key: "performance-cache", label: "Performance & Cache", parent: "Audit & Search" },
    ],
  },
];

// ============================================================
// DYNAMIC OPTIONS MAPPING - For select fields in forms
// ============================================================

const DYNAMIC_OPTIONS_MAP: Record<string, { apiPath: string; labelKey: string; valueKey: string }> = {
  departmentId: { apiPath: "/api/departments", labelKey: "name", valueKey: "id" },
  categoryId: { apiPath: "/api/categories", labelKey: "name", valueKey: "id" },
  supplierId: { apiPath: "/api/suppliers", labelKey: "name", valueKey: "id" },
  customerId: { apiPath: "/api/customers", labelKey: "name", valueKey: "id" },
  employeeId: { apiPath: "/api/employees", labelKey: "name", valueKey: "id" },
  bankId: { apiPath: "/api/banks", labelKey: "bankName", valueKey: "id" },
  paymentOptionId: { apiPath: "/api/payment-options", labelKey: "name", valueKey: "id" },
  headId: { apiPath: "/api/expense-income-heads", labelKey: "name", valueKey: "id" },
  cardTypeId: { apiPath: "/api/card-types", labelKey: "name", valueKey: "id" },
  investmentHeadId: { apiPath: "/api/investment-heads", labelKey: "name", valueKey: "id" },
  godownId: { apiPath: "/api/godowns", labelKey: "name", valueKey: "id" },
  companyId: { apiPath: "/api/companies", labelKey: "name", valueKey: "id" },
  colorId: { apiPath: "/api/colors", labelKey: "name", valueKey: "id" },
  brandId: { apiPath: "/api/brands", labelKey: "name", valueKey: "id" },
  segmentId: { apiPath: "/api/segments", labelKey: "name", valueKey: "id" },
  designationId: { apiPath: "/api/designations", labelKey: "name", valueKey: "id" },
  salesOrderId: { apiPath: "/api/sales-orders", labelKey: "invoiceNo", valueKey: "id" },
  purchaseOrderId: { apiPath: "/api/purchase-orders", labelKey: "poNumber", valueKey: "id" },
  smsBillId: { apiPath: "/api/sms-bills", labelKey: "period", valueKey: "id" },
  fromGodownId: { apiPath: "/api/godowns", labelKey: "name", valueKey: "id" },
  toGodownId: { apiPath: "/api/godowns", labelKey: "name", valueKey: "id" },
  parentCategoryId: { apiPath: "/api/categories", labelKey: "name", valueKey: "id" },
};

async function fetchDynamicOptions(fieldKey: string): Promise<{ value: string; label: string }[]> {
  const config = DYNAMIC_OPTIONS_MAP[fieldKey];
  if (!config) return [];
  try {
    const res = await apiFetch(config.apiPath);
    const items = Array.isArray(res) ? res : res.data || [];
    return items.map((item: any) => ({
      value: String(item[config.valueKey] || ""),
      label: String(item[config.labelKey] || item.name || item.bankName || ""),
    }));
  } catch {
    return [];
  }
}

// ============================================================
// LOGIN PAGE COMPONENT
// ============================================================

function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [rateLimitSeconds, setRateLimitSeconds] = useState(0);
  const { login } = useAuth();

  // Check if we were redirected due to session expiry
  const sessionExpired = typeof window !== "undefined" && !localStorage.getItem("ems_auth");

  // Rate limit countdown
  useEffect(() => {
    if (rateLimitSeconds <= 0) return;
    const timer = setTimeout(() => setRateLimitSeconds(prev => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [rateLimitSeconds]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const success = await login(username, password);
      if (!success) {
        setError("Invalid username or password. Please check your credentials.");
      }
    } catch (err) {
      // Check for rate limit response
      if (err instanceof Error && err.message.includes("Rate limit")) {
        const match = err.message.match(/(\d+)/);
        const seconds = match ? parseInt(match[1]) : 60;
        setRateLimitSeconds(seconds);
        setError(`Too many failed attempts. Please wait ${seconds} seconds before trying again.`);
      } else {
        setError("Login failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0a1628] via-[#132240] to-[#0a1628] login-bg-pattern p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-[#2563eb] shadow-lg shadow-blue-500/25 mb-4">
            <Package className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">Electronics Mart</h1>
          <p className="text-slate-400 mt-2">Inventory Management System</p>
        </div>
        <Card className="border-0 shadow-2xl bg-white/95 dark:bg-[#132240]/95 backdrop-blur-sm overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-blue-500 via-blue-600 to-blue-400" />
          <CardHeader className="pb-4 pt-5">
            <CardTitle className="text-xl text-center text-slate-900 dark:text-white">Sign In</CardTitle>
            <CardDescription className="text-center">Enter your credentials to continue</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-start gap-2 animate-in fade-in duration-200">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
                    {rateLimitSeconds > 0 && (
                      <p className="text-xs text-red-500 mt-1">Retry in {rateLimitSeconds}s</p>
                    )}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="username">User Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="username" placeholder="Enter username" value={username} onChange={e => setUsername(e.target.value)} className="pl-10 transition-all duration-200 focus:ring-2 focus:ring-blue-500/20" required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="password" type="password" placeholder="Enter your password" value={password} onChange={e => setPassword(e.target.value)} className="pl-10 transition-all duration-200 focus:ring-2 focus:ring-blue-500/20" required />
                </div>
              </div>
              <Button type="submit" className="w-full bg-[#2563eb] hover:bg-[#1d4ed8] text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all duration-200 h-11" disabled={loading || !username.trim() || !password || rateLimitSeconds > 0}>
                {loading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <ArrowUpCircle className="w-4 h-4 mr-2" />}
                {loading ? "Signing In..." : rateLimitSeconds > 0 ? `Wait ${rateLimitSeconds}s` : "Sign In"}
              </Button>
              <div className="flex items-center justify-center gap-4 pt-1">
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  System Online
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Shield className="w-3 h-3" />
                  Secured
                </div>
                <span className="text-xs text-slate-300">v2.1</span>
              </div>
            </form>
          </CardContent>
        </Card>
        <p className="text-center text-slate-500 text-xs mt-6">© {new Date().getFullYear()} NextGen Digital Studio — All Rights Reserved</p>
      </div>
    </div>
  );
}

// ============================================================
// GENERIC MODULE PAGE - Data-driven CRUD
// ============================================================

function singularize(word: string): string {
  if (word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.endsWith("ses") || word.endsWith("xes") || word.endsWith("zes")) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function GenericModulePage({ title, apiPath, columns, formFields }: {
  title: string; apiPath: string; columns: ColumnDef[]; formFields: FieldDef[];
}) {
  const { toast } = useToast();
  const { isVatAuditor } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, { value: string; label: string }[]>>({});
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [categoryLookup, setCategoryLookup] = useState<Record<string, string>>({});

  // VAT Auditor: columns to hide
  const VAT_HIDDEN_COLS = ["costPrice", "wholesalePrice", "dealerPrice"];
  const visibleColumns = useMemo(() => {
    if (!isVatAuditor) return columns;
    return columns.filter(c => !VAT_HIDDEN_COLS.includes(c.key));
  }, [columns, isVatAuditor]);

  // VAT Auditor: form fields to hide
  const visibleFormFields = useMemo(() => {
    if (!isVatAuditor) return formFields;
    return formFields.filter(f => !VAT_HIDDEN_COLS.includes(f.key));
  }, [formFields, isVatAuditor]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(apiPath);
      const items = Array.isArray(res) ? res : res.data || res.logs || [];
      setData(items);
      // For categories, build parent name lookup
      if (apiPath === "/api/categories") {
        const lookup: Record<string, string> = {};
        items.forEach((cat: any) => { if (cat.id) lookup[cat.id] = cat.name; });
        setCategoryLookup(lookup);
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [apiPath, toast]);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredData = useMemo(() => {
    if (!search) return data;
    const s = search.toLowerCase();
    return data.filter((item: any) =>
      columns.some(col => String(item[col.key] ?? "").toLowerCase().includes(s))
    );
  }, [data, search, columns]);

  const activeCount = data.filter((d: any) => d.isActive !== false).length;
  const inactiveCount = data.length - activeCount;

  const loadDynamicOptions = useCallback(async () => {
    const selectFields = formFields.filter(f => f.type === "select" && (!f.options || f.options.length === 0));
    if (selectFields.length === 0) return;
    const results = await Promise.all(
      selectFields.map(async (f) => {
        const options = await fetchDynamicOptions(f.key);
        return { key: f.key, options };
      })
    );
    const newOptions: Record<string, { value: string; label: string }[]> = {};
    results.forEach(r => { newOptions[r.key] = r.options; });
    setDynamicOptions(prev => ({ ...prev, ...newOptions }));
  }, [formFields]);

  const openCreate = async () => {
    const defaults: Record<string, any> = {};
    formFields.forEach(f => { defaults[f.key] = f.defaultValue ?? (f.type === "checkbox" ? false : f.type === "number" ? 0 : ""); });
    // Auto-generate code if field exists
    const codeField = formFields.find(f => f.key === "code");
    if (codeField && !editItem) {
      try {
        if (apiPath === "/api/categories") {
          // Categories use CAT-NNN format
          const maxNum = data.length > 0 ? Math.max(...data.map((d: any) => {
            const m = (d.code || "").match(/CAT-(\d+)/);
            return m ? parseInt(m[1], 10) : 0;
          })) : 0;
          defaults.code = `CAT-${String(maxNum + 1).padStart(3, "0")}`;
        } else {
          // Default: NNNNN 5-digit padded format
          const nextCode = data.length > 0 ? String(Math.max(...data.map((d: any) => parseInt(d.code || "0", 10) || 0)) + 1).padStart(5, "0") : "00001";
          defaults.code = nextCode;
        }
      } catch { defaults.code = apiPath === "/api/categories" ? "CAT-001" : "00001"; }
    }
    setFormData(defaults);
    setEditItem(null);
    setShowForm(true);
    loadDynamicOptions();
  };

  const openEdit = (item: any) => {
    const vals: Record<string, any> = {};
    formFields.forEach(f => { vals[f.key] = item[f.key] ?? f.defaultValue ?? ""; });
    setFormData(vals);
    setEditItem(item);
    setShowForm(true);
    loadDynamicOptions();
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editItem) {
        await apiFetch(`${apiPath}/${editItem.id}`, { method: "PUT", body: JSON.stringify(formData) });
        toast({ title: "Updated", description: `${title} updated successfully` });
      } else {
        await apiFetch(apiPath, { method: "POST", body: JSON.stringify(formData) });
        toast({ title: "Created", description: `${title} created successfully` });
      }
      setShowForm(false);
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    try {
      await apiFetch(`${apiPath}/${deleteItem.id}`, { method: "DELETE" });
      toast({ title: "Deactivated", description: `${title} deactivated successfully` });
      setDeleteItem(null);
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const exportCSV = () => { try { exportToCSV({ title, columns: visibleColumns, data: filteredData, isVatAuditor, vatMaskedColumns: getVatMaskedKeys(visibleColumns) }); toast({ title: "Exported", description: `${title} exported to CSV` }); } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); } };

  const exportPDF = () => { try { exportToPDF({ title: `Existing ${title}`, columns: visibleColumns, data: filteredData, isVatAuditor, vatMaskedColumns: getVatMaskedKeys(visibleColumns) }); toast({ title: "Exported", description: `${title} exported to PDF` }); } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); } };

  const importCSV = () => { importFromCSV({ apiPath, formFields }).then(result => { toast({ title: "Import Complete", description: `Imported: ${result.imported}, Failed: ${result.failed}${result.errors.length > 0 ? ` (${result.errors.slice(0, 3).join("; ")})` : ""}`, variant: result.failed > 0 ? "destructive" : "default" }); loadData(); }); };

  return (
    <div className="page-enter space-y-4">
      {isVatAuditor && (
        <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg p-2 mb-4 flex items-center gap-2">
          <Lock className="w-4 h-4 text-amber-600" />
          <span className="text-sm font-medium text-amber-700 dark:text-amber-400">VAT AUDIT MODE — Internal margins hidden</span>
        </div>
      )}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Existing {title}</h2>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={importCSV}><Upload className="w-4 h-4 sm:mr-1" /><span className="hidden sm:inline">Import CSV</span></Button>
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="w-4 h-4 sm:mr-1" /><span className="hidden sm:inline">Export CSV</span></Button>
          <Button variant="outline" size="sm" onClick={exportPDF}><FileDown className="w-4 h-4 sm:mr-1" /><span className="hidden sm:inline">Export PDF</span></Button>
          <Button size="sm" className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={openCreate}><Plus className="w-4 h-4 sm:mr-1" /><span className="hidden sm:inline">Create new {singularize(title)}</span></Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { label: "Total", value: data.length, icon: BarChart3, color: "text-blue-600" },
          { label: "Active", value: activeCount, icon: CheckCircle, color: "text-green-600" },
          { label: "Inactive", value: inactiveCount, icon: XCircle, color: "text-red-600" },
        ].map((stat, i) => (
          <Card key={i} className="stat-mini-card">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-blue-50 dark:bg-blue-900/30 ${stat.color}`}><stat.icon className="w-5 h-5" /></div>
              <div><p className="text-xs text-muted-foreground">{stat.label}</p><p className="text-xl font-bold text-slate-900 dark:text-white">{stat.value}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-4">
            <div className="relative flex-1 max-w-full sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
            </div>
            <Button variant="outline" size="sm" onClick={loadData}><RefreshCw className="w-4 h-4" /></Button>
          </div>
          <div className="w-full overflow-x-auto">
          <div className="table-container overflow-auto max-h-[65vh] rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-10">+</TableHead>
                  <TableHead className="w-12">Sl</TableHead>
                  {visibleColumns.map(col => <TableHead key={col.key}>{col.label}</TableHead>)}
                  <TableHead className="w-24 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={visibleColumns.length + 3} className="h-24 text-center"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                ) : filteredData.length === 0 ? (
                  <TableRow><TableCell colSpan={visibleColumns.length + 3} className="h-24 text-center text-muted-foreground">No data found</TableCell></TableRow>
                ) : filteredData.map((item: any, idx: number) => (
                  <React.Fragment key={item.id}>
                    <TableRow className="data-table-row hover:bg-muted/50">
                      <TableCell>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setExpandedRows(prev => { const next = new Set(prev); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })}>
                          {expandedRows.has(item.id) ? "−" : "+"}
                        </Button>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                      {visibleColumns.map(col => (
                        <TableCell key={col.key}>
                          {col.key === "code" ? (
                            <span className="font-mono text-xs">{item[col.key] || "—"}</span>
                          ) : col.key === "parentCategoryId" ? (
                            <span>{categoryLookup[item[col.key]] || item.parent?.name || item[col.key] || "—"}</span>
                          ) : col.type === "boolean" ? (
                            <Badge variant={item[col.key] ? "default" : "secondary"} className={item[col.key] ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}>
                              {item[col.key] ? "Active" : "Inactive"}
                            </Badge>
                          ) : col.type === "currency" ? (
                            <span className="font-mono">{fmt(item[col.key], "currency")}</span>
                          ) : isVatAuditor && VAT_HIDDEN_COLS.includes(col.key) ? (
                            <span className="text-amber-600 italic">N/A (Audit Mode)</span>
                          ) : (
                            <span>{fmt(item[col.key], col.type)}</span>
                          )}
                        </TableCell>
                      ))}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(item)} className="text-blue-600 hover:text-blue-800 h-8 w-8 sm:w-auto sm:h-auto p-0 sm:px-2"><Pencil className="w-3.5 h-3.5 sm:hidden" /><span className="hidden sm:inline">Edit</span></Button>
                          <span className="text-muted-foreground hidden sm:inline">|</span>
                          <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 h-8 w-8 sm:w-auto sm:h-auto p-0 sm:px-2" onClick={() => setDeleteItem(item)}><Trash2 className="w-3.5 h-3.5 sm:hidden" /><span className="hidden sm:inline">Delete</span></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedRows.has(item.id) && (
                      <TableRow className="bg-muted/30">
                        <TableCell colSpan={visibleColumns.length + 3} className="p-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                            {Object.entries(item).filter(([k]) => k !== "id" && !visibleColumns.some(c => c.key === k) && (isVatAuditor ? !VAT_HIDDEN_COLS.includes(k) : true)).map(([key, val]) => (
                              <div key={key}>
                                <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, " $1")}: </span>
                                <span className="font-medium text-slate-900 dark:text-white">{String(val ?? "—")}</span>
                              </div>
                            ))}
                            {item._count && Object.entries(item._count).map(([key, val]) => (
                              <div key={key}>
                                <span className="text-muted-foreground capitalize">{key}: </span>
                                <span className="font-medium text-slate-900 dark:text-white">{String(val)}</span>
                              </div>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">Showing {filteredData.length} of {data.length} records</div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit" : "Create"} {singularize(title)}</DialogTitle>
            <DialogDescription>{editItem ? "Update the details below" : "Fill in the details below"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {visibleFormFields.map(field => (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={field.key}>{field.label} {field.required && <span className="text-red-500">*</span>}</Label>
                {field.key === "code" ? (
                  <Input id={field.key} value={formData[field.key] ?? ""} readOnly className="bg-muted cursor-not-allowed" />
                ) : field.type === "textarea" ? (
                  <Textarea id={field.key} placeholder={field.placeholder} value={formData[field.key] ?? ""} onChange={e => setFormData({ ...formData, [field.key]: e.target.value })} />
                ) : field.type === "select" ? (
                  <Select value={String(formData[field.key] ?? "")} onValueChange={v => setFormData({ ...formData, [field.key]: v })}>
                    <SelectTrigger><SelectValue placeholder={`Select ${field.label}`} /></SelectTrigger>
                    <SelectContent>
                      {(dynamicOptions[field.key] || field.options || []).map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : field.type === "checkbox" ? (
                  <div className="flex items-center gap-2">
                    <Switch checked={formData[field.key] ?? false} onCheckedChange={v => setFormData({ ...formData, [field.key]: v })} />
                    <span className="text-sm">{formData[field.key] ? "Active" : "Inactive"}</span>
                  </div>
                ) : field.type === "date" ? (
                  <Input id={field.key} type="date" value={formData[field.key] ?? ""} onChange={e => setFormData({ ...formData, [field.key]: e.target.value })} />
                ) : (
                  <Input id={field.key} type={field.type} step={field.step} placeholder={field.placeholder} value={formData[field.key] ?? ""} onChange={e => setFormData({ ...formData, [field.key]: field.type === "number" ? Number(e.target.value) : e.target.value })} />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={handleSave} disabled={saving}>
              {saving ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />}
              {editItem ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-500" />Confirm Deactivate</DialogTitle>
            <DialogDescription>Are you sure you want to deactivate this record? It will be marked as inactive but can be restored by an admin.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteItem(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Deactivate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// PRODUCTS PAGE (Dedicated - with filters)
// ============================================================

function ProductsPage() {
  const { toast } = useToast();
  const { isVatAuditor } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [imeiSearch, setImeiSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, { value: string; label: string }[]>>({});
  const [companyProfile, setCompanyProfile] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, cRes] = await Promise.all([apiFetch("/api/products"), apiFetch("/api/categories")]);
      setData(Array.isArray(pRes) ? pRes : pRes.data || []);
      setCategories(Array.isArray(cRes) ? cRes : cRes.data || []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // Load company profile for white-label PDF
  useEffect(() => {
    const loadCompanyProfile = async () => {
      try {
        const profile = await apiFetch("/api/company-branding");
        setCompanyProfile(profile);
      } catch {}
    };
    loadCompanyProfile();
  }, []);

  const loadDynamicOpts = useCallback(async () => {
    const keys = ["colorId", "brandId", "godownId", "segmentId", "companyId"];
    const results = await Promise.all(keys.map(async (k) => {
      const options = await fetchDynamicOptions(k);
      return { key: k, options };
    }));
    const newOpts: Record<string, { value: string; label: string }[]> = {};
    results.forEach(r => { newOpts[r.key] = r.options; });
    setDynamicOptions(prev => ({ ...prev, ...newOpts }));
  }, []);

  // ── Currency Sanitization Filter: Eliminates corrupted floating-point digits in financial figures ──
  const sanitizeCurrency = (val: any): number => {
    const num = Number(val);
    if (isNaN(num) || !isFinite(num)) return 0;
    return Math.round(num * 100) / 100;
  };

  const filtered = useMemo(() => {
    let result = data;
    if (search) { const s = search.toLowerCase(); result = result.filter((p: any) => p.name?.toLowerCase().includes(s) || p.productCode?.toLowerCase().includes(s) || p.sku?.toLowerCase().includes(s) || p.barcode?.toLowerCase().includes(s) || p.brand?.name?.toLowerCase().includes(s)); }
    if (imeiSearch) { const s = imeiSearch.toLowerCase(); result = result.filter((p: any) => p.imeiNumber?.toLowerCase().includes(s)); }
    if (catFilter !== "all") result = result.filter((p: any) => p.categoryId === catFilter);
    // Use computed currentStock & stockStatus from enhanced API
    if (stockFilter === "in") result = result.filter((p: any) => (p.stockStatus || (p.currentStock != null ? (p.currentStock > (p.reorderLevel || 0) ? "In Stock" : p.currentStock > 0 ? "Low Stock" : "Out of Stock") : ((p.openingStock || 0) > (p.reorderLevel || 0) ? "In Stock" : (p.openingStock || 0) > 0 ? "Low Stock" : "Out of Stock"))) === "In Stock");
    if (stockFilter === "low") result = result.filter((p: any) => (p.stockStatus || (p.currentStock != null ? (p.currentStock > (p.reorderLevel || 0) ? "In Stock" : p.currentStock > 0 ? "Low Stock" : "Out of Stock") : ((p.openingStock || 0) > (p.reorderLevel || 0) ? "In Stock" : (p.openingStock || 0) > 0 ? "Low Stock" : "Out of Stock"))) === "Low Stock");
    if (stockFilter === "out") result = result.filter((p: any) => (p.stockStatus || (p.currentStock != null ? (p.currentStock > (p.reorderLevel || 0) ? "In Stock" : p.currentStock > 0 ? "Low Stock" : "Out of Stock") : ((p.openingStock || 0) > (p.reorderLevel || 0) ? "In Stock" : (p.openingStock || 0) > 0 ? "Low Stock" : "Out of Stock"))) === "Out of Stock");
    return result;
  }, [data, search, imeiSearch, catFilter, stockFilter]);

  const VAT_HIDDEN = ["costPrice", "wholesalePrice", "dealerPrice"];

  const fields: FieldDef[] = useMemo(() => {
    const base: FieldDef[] = [
      { key: "name", label: "Product Name", type: "text", required: true },
      { key: "productCode", label: "Product Code", type: "text", required: false, placeholder: "Auto-generated" },
      { key: "sku", label: "SKU", type: "text", required: false, placeholder: "Unique Stock Keeping Unit" },
      { key: "barcode", label: "Barcode", type: "text", required: false, placeholder: "Unique barcode identifier" },
      { key: "categoryId", label: "Category", type: "select", required: true, options: categories.map(c => ({ value: c.id, label: c.name })) },
      { key: "brandId", label: "Brand", type: "select", options: dynamicOptions.brandId || [] },
      { key: "unit", label: "Unit", type: "text" },
      { key: "sizeCapacity", label: "Size/Capacity", type: "text" },
      { key: "costPrice", label: "Cost Price", type: "number", defaultValue: 0 },
      { key: "salePrice", label: "Sale Price (MRP)", type: "number", defaultValue: 0 },
      { key: "wholesalePrice", label: "Wholesale Price", type: "number", defaultValue: 0 },
      { key: "dealerPrice", label: "Dealer Price", type: "number", defaultValue: 0 },
      { key: "imeiNumber", label: "IMEI Number", type: "text" },
      { key: "openingStock", label: "Opening Stock", type: "number", defaultValue: 0 },
      { key: "reorderLevel", label: "Reorder Level", type: "number", defaultValue: 0 },
      { key: "godownId", label: "Godown", type: "select", options: dynamicOptions.godownId || [] },
      { key: "segmentId", label: "Segment", type: "select", options: dynamicOptions.segmentId || [] },
      { key: "companyId", label: "Company", type: "select", options: dynamicOptions.companyId || [] },
      { key: "image", label: "Product Image", type: "image" },
      { key: "isActive", label: "Active", type: "checkbox", defaultValue: true },
    ];
    if (isVatAuditor) return base.filter(f => !VAT_HIDDEN.includes(f.key));
    return base;
  }, [categories, dynamicOptions, isVatAuditor]);

  const openCreate = () => {
    const defaults: Record<string, any> = {};
    fields.forEach(f => { defaults[f.key] = f.defaultValue ?? (f.type === "checkbox" ? false : ""); });
    // Auto-generate productCode — leave empty for API to generate PROD-XXXXX
    defaults.productCode = "";
    setFormData(defaults); setEditItem(null); setShowForm(true);
    loadDynamicOpts();
  };

  const openEdit = (item: any) => {
    const vals: Record<string, any> = {};
    fields.forEach(f => { vals[f.key] = item[f.key] ?? f.defaultValue ?? ""; });
    setFormData(vals); setEditItem(item); setShowForm(true);
    loadDynamicOpts();
  };

  const handleSave = async () => {
    setSaveError(null);
    setSaving(true);
    try {
      if (editItem) {
        await apiFetch(`/api/products/${editItem.id}`, { method: "PUT", body: JSON.stringify(formData) });
        toast({ title: "Updated", description: "Product updated" });
      } else {
        await apiFetch("/api/products", { method: "POST", body: JSON.stringify(formData) });
        toast({ title: "Created", description: "Product created" });
      }
      setShowForm(false); load();
    } catch (e: any) {
      const msg = e.message || "Failed to save";
      if (msg.includes("SKU_COLLISION") || msg.includes("BARCODE_COLLISION") || msg.includes("DUPLICATE_NAME") || msg.includes("already exists")) {
        setSaveError(msg);
      }
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    try {
      await apiFetch(`/api/products/${deleteItem.id}`, { method: "DELETE" });
      toast({ title: "Deactivated" }); setDeleteItem(null); load();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const getCatName = (id: string) => categories.find((c: any) => c.id === id)?.name || "—";

  const exportCSV = () => {
    try {
      const csvColumns: ColumnDef[] = isVatAuditor
        ? [
            { key: "productCode", label: "Code", type: "text" as const },
            { key: "sku", label: "SKU", type: "text" as const },
            { key: "name", label: "Name", type: "text" as const },
            { key: "category", label: "Category", type: "text" as const },
            { key: "salePrice", label: "MRP", type: "currency" as const },
            { key: "currentStock", label: "Stock", type: "number" as const },
            { key: "stockStatus", label: "Status", type: "text" as const },
            { key: "skuStatus", label: "SKU Status", type: "text" as const },
          ]
        : [
            { key: "productCode", label: "Code", type: "text" as const },
            { key: "sku", label: "SKU", type: "text" as const },
            { key: "barcode", label: "Barcode", type: "text" as const },
            { key: "name", label: "Name", type: "text" as const },
            { key: "category", label: "Category", type: "text" as const },
            { key: "brand", label: "Brand", type: "text" as const },
            { key: "costPrice", label: "Cost Price", type: "currency" as const },
            { key: "salePrice", label: "MRP", type: "currency" as const },
            { key: "wholesalePrice", label: "Wholesale", type: "currency" as const },
            { key: "dealerPrice", label: "Dealer", type: "currency" as const },
            { key: "currentStock", label: "Stock", type: "number" as const },
            { key: "reorderLevel", label: "Reorder Level", type: "number" as const },
            { key: "stockStatus", label: "Status", type: "text" as const },
            { key: "skuStatus", label: "SKU Status", type: "text" as const },
          ];
      const csvData = filtered.map((item: any) => {
        const cs = item.currentStock != null ? item.currentStock : (item.openingStock || 0);
        const ss = item.stockStatus || (cs <= 0 ? "Out of Stock" : cs <= (item.reorderLevel || 0) ? "Low Stock" : "In Stock");
        const sks = item.skuStatus || (item.sku && item.barcode ? "Active" : item.sku ? "No Barcode" : "No SKU");
        return {
          productCode: item.productCode || "",
          sku: item.sku || "",
          barcode: item.barcode || "",
          name: item.name || "",
          category: getCatName(item.categoryId),
          brand: item.brand?.name || "—",
          costPrice: sanitizeCurrency(item.costPrice),
          salePrice: sanitizeCurrency(item.salePrice),
          wholesalePrice: sanitizeCurrency(item.wholesalePrice),
          dealerPrice: sanitizeCurrency(item.dealerPrice),
          currentStock: cs,
          reorderLevel: item.reorderLevel || 0,
          stockStatus: ss,
          skuStatus: sks,
        };
      });
      exportToCSV({
        title: "Products",
        columns: csvColumns,
        data: csvData,
        isVatAuditor,
        vatMaskedColumns: isVatAuditor ? ["costPrice", "wholesalePrice", "dealerPrice"] : [],
      });
      toast({ title: "Exported", description: "Products exported to CSV" });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const exportPDF = () => {
    try {
      const pdfColumns: ColumnDef[] = isVatAuditor
        ? [
            { key: "productCode", label: "Code", type: "text" as const },
            { key: "sku", label: "SKU", type: "text" as const },
            { key: "name", label: "Name", type: "text" as const },
            { key: "category", label: "Category", type: "text" as const },
            { key: "salePrice", label: "MRP", type: "currency" as const },
            { key: "currentStock", label: "Stock", type: "number" as const },
            { key: "stockStatus", label: "Status", type: "text" as const },
            { key: "skuStatus", label: "SKU Status", type: "text" as const },
          ]
        : [
            { key: "productCode", label: "Code", type: "text" as const },
            { key: "sku", label: "SKU", type: "text" as const },
            { key: "barcode", label: "Barcode", type: "text" as const },
            { key: "name", label: "Name", type: "text" as const },
            { key: "category", label: "Category", type: "text" as const },
            { key: "brand", label: "Brand", type: "text" as const },
            { key: "costPrice", label: "Cost", type: "currency" as const },
            { key: "salePrice", label: "MRP", type: "currency" as const },
            { key: "wholesalePrice", label: "Wholesale", type: "currency" as const },
            { key: "dealerPrice", label: "Dealer", type: "currency" as const },
            { key: "currentStock", label: "Stock", type: "number" as const },
            { key: "reorderLevel", label: "Reorder", type: "number" as const },
            { key: "stockStatus", label: "Status", type: "text" as const },
          ];
      const pdfData = filtered.map((item: any) => {
        const cs = item.currentStock != null ? item.currentStock : (item.openingStock || 0);
        const ss = item.stockStatus || (cs <= 0 ? "Out of Stock" : cs <= (item.reorderLevel || 0) ? "Low Stock" : "In Stock");
        const sks = item.skuStatus || (item.sku && item.barcode ? "Active" : item.sku ? "No Barcode" : "No SKU");
        return {
          productCode: item.productCode || "",
          sku: item.sku || "",
          barcode: item.barcode || "",
          name: item.name || "",
          category: getCatName(item.categoryId),
          brand: item.brand?.name || "—",
          costPrice: sanitizeCurrency(item.costPrice),
          salePrice: sanitizeCurrency(item.salePrice),
          wholesalePrice: sanitizeCurrency(item.wholesalePrice),
          dealerPrice: sanitizeCurrency(item.dealerPrice),
          currentStock: cs,
          reorderLevel: item.reorderLevel || 0,
          stockStatus: ss,
          skuStatus: sks,
        };
      });
      // Compute summary rows for PDF
      const totalProducts = pdfData.length;
      const inStock = pdfData.filter(d => d.stockStatus === "In Stock").length;
      const lowStock = pdfData.filter(d => d.stockStatus === "Low Stock").length;
      const outOfStock = pdfData.filter(d => d.stockStatus === "Out of Stock").length;
      const activeSKUs = pdfData.filter(d => d.skuStatus === "Active").length;
      const totalInventoryValue = !isVatAuditor ? pdfData.reduce((sum, d) => sum + sanitizeCurrency(d.costPrice * d.currentStock), 0) : 0;
      const summaryRowsData = [
        { label: "Total Products", value: String(totalProducts) },
        { label: "In Stock", value: String(inStock) },
        { label: "Low Stock", value: String(lowStock) },
        { label: "Out of Stock", value: String(outOfStock) },
        { label: "Active SKUs", value: String(activeSKUs) },
        ...(isVatAuditor ? [] : [{ label: "Total Inventory Value", value: `৳${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(sanitizeCurrency(totalInventoryValue))}` }]),
      ];
      const summaryRows = summaryRowsData.map(r => ({ cells: [r.label, r.value] }));
      const user = authState.user;
      exportToPDF({
        title: "Product Master List",
        subtitle: `Total: ${totalProducts} | In Stock: ${inStock} | Low: ${lowStock} | Out: ${outOfStock}`,
        orientation: "landscape",
        columns: pdfColumns,
        data: pdfData,
        isVatAuditor,
        vatMaskedColumns: isVatAuditor ? ["costPrice", "wholesalePrice", "dealerPrice"] : [],
        summaryRows,
        company: companyProfile ? {
          name: companyProfile.name,
          address: companyProfile.address,
          phone: companyProfile.phone,
          mobile: companyProfile.mobile,
          email: companyProfile.email,
          logo: companyProfile.logo || companyProfile.brandLogo,
          logoWidth: companyProfile.logoWidth,
          logoHeight: companyProfile.logoHeight,
          vatNumber: companyProfile.vatNumber,
          tradeLicense: companyProfile.tradeLicense,
        } : undefined,
        financialFooter: {
          preparedBy: user?.displayName || user?.name || "",
          checkedBy: "",
          authorizedBy: "",
          printedBy: user?.displayName || "System",
        },
      });
      toast({ title: "Exported", description: "Product Master List exported to PDF with enterprise branding" });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const importCSV = () => {
    importFromCSV({
      apiPath: "/api/products",
      formFields: [
        { key: "productCode", label: "Code", type: "text" },
        { key: "name", label: "Name", type: "text", required: true },
        { key: "categoryId", label: "Category", type: "text" },
        { key: "costPrice", label: "Cost Price", type: "number" },
        { key: "salePrice", label: "MRP", type: "number" },
        { key: "wholesalePrice", label: "Wholesale", type: "number" },
        { key: "dealerPrice", label: "Dealer", type: "number" },
        { key: "openingStock", label: "Stock", type: "number" },
      ]
    }).then(result => {
      toast({ title: "Import Complete", description: `Imported: ${result.imported}, Failed: ${result.failed}${result.errors.length > 0 ? ` (${result.errors.slice(0, 3).join("; ")})` : ""}`, variant: result.failed > 0 ? "destructive" : "default" });
      load();
    });
  };

  // Determine table column count for colSpan
  const colCount = isVatAuditor ? 11 : 14;

  return (
    <div className="page-enter space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Existing Products</h2>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={importCSV}><Upload className="w-4 h-4 mr-1" />Import CSV</Button>
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="w-4 h-4 mr-1" />Export CSV</Button>
          <Button variant="outline" size="sm" onClick={exportPDF}><FileDown className="w-4 h-4 mr-1" />Export PDF</Button>
          <Button size="sm" className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={openCreate}><Plus className="w-4 h-4 mr-1" />Create new product</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Total Products", value: data.length, icon: Package, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/30" },
          { label: "In Stock", value: data.filter((p: any) => { const ss = p.stockStatus || ((p.currentStock != null ? p.currentStock : (p.openingStock || 0)) > (p.reorderLevel || 0) ? "In Stock" : "Low Stock"); return ss === "In Stock"; }).length, icon: CheckCircle, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/30" },
          { label: "Low Stock", value: data.filter((p: any) => { const cs = p.currentStock != null ? p.currentStock : (p.openingStock || 0); const ss = p.stockStatus || (cs <= 0 ? "Out of Stock" : cs <= (p.reorderLevel || 0) ? "Low Stock" : "In Stock"); return ss === "Low Stock"; }).length, icon: AlertTriangle, color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-900/30" },
          { label: "Out of Stock", value: data.filter((p: any) => { const cs = p.currentStock != null ? p.currentStock : (p.openingStock || 0); const ss = p.stockStatus || (cs <= 0 ? "Out of Stock" : cs <= (p.reorderLevel || 0) ? "Low Stock" : "In Stock"); return ss === "Out of Stock"; }).length, icon: XCircle, color: "text-red-600", bg: "bg-red-50 dark:bg-red-900/30" },
          { label: "Active SKUs", value: data.filter((p: any) => { const sks = p.skuStatus || (p.sku && p.barcode ? "Active" : "No SKU"); return sks === "Active"; }).length, icon: Tag, color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-900/30" },
        ].map((stat, i) => (
          <Card key={i} className="stat-mini-card"><CardContent className="p-3 flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${stat.bg} ${stat.color}`}><stat.icon className="w-4 h-4" /></div>
            <div><p className="text-xs text-muted-foreground">{stat.label}</p><p className="text-lg font-bold text-slate-900 dark:text-white">{stat.value}</p></div>
          </CardContent></Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search product..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
            </div>
            <div className="relative min-w-[160px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search IMEI..." value={imeiSearch} onChange={e => setImeiSearch(e.target.value)} className="pl-10" />
            </div>
            <Select value={catFilter} onValueChange={setCatFilter}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={stockFilter} onValueChange={setStockFilter}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Stock Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="in">In Stock</SelectItem>
                <SelectItem value="low">Low Stock</SelectItem>
                <SelectItem value="out">Out of Stock</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
          </div>
          <div className="table-container overflow-auto max-h-[60vh] rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Barcode</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  {!isVatAuditor && <TableHead>Brand</TableHead>}
                  {!isVatAuditor && <TableHead>Cost Price</TableHead>}
                  <TableHead>MRP</TableHead>
                  {!isVatAuditor && <TableHead>Wholesale</TableHead>}
                  {!isVatAuditor && <TableHead>Dealer</TableHead>}
                  <TableHead>Stock</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>SKU Status</TableHead>
                  <TableHead className="w-20 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={colCount} className="h-24 text-center"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={colCount} className="h-24 text-center text-muted-foreground">No products found</TableCell></TableRow>
                ) : filtered.map((item: any, idx: number) => {
                  const cs = item.currentStock != null ? item.currentStock : (item.openingStock || 0);
                  const ss = item.stockStatus || (cs <= 0 ? "Out of Stock" : cs <= (item.reorderLevel || 0) ? "Low Stock" : "In Stock");
                  const sks = item.skuStatus || (item.sku && item.barcode ? "Active" : item.sku ? "No Barcode" : "No SKU");
                  const stockStatus = ss === "Out of Stock" ? "out" : ss === "Low Stock" ? "low" : "in";
                  return (
                    <TableRow key={item.id} className="data-table-row hover:bg-muted/50">
                      <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell className="font-mono text-xs">{item.productCode}</TableCell>
                      <TableCell className="font-mono text-xs">{item.sku || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{item.barcode || "—"}</TableCell>
                      <TableCell className="font-medium text-slate-900 dark:text-white">
                        {item.name}
                        {(!item.category?.isActive || (item.brand && !item.brand?.isActive)) && (
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800 text-[10px] ml-1">
                            <AlertTriangle className="h-3 w-3 mr-1" />Parent {(!item.category?.isActive) ? "Category" : "Brand"} Suspended
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell><Badge variant="outline">{getCatName(item.categoryId)}</Badge></TableCell>
                      {!isVatAuditor && <TableCell>{item.brand?.name || "—"}</TableCell>}
                      {!isVatAuditor && <TableCell className="font-mono text-right">{fmt(item.costPrice, "currency")}</TableCell>}
                      <TableCell className="font-mono text-right">{fmt(item.salePrice, "currency")}</TableCell>
                      {!isVatAuditor && <TableCell className="font-mono text-right">{fmt(item.wholesalePrice, "currency")}</TableCell>}
                      {!isVatAuditor && <TableCell className="font-mono text-right">{fmt(item.dealerPrice, "currency")}</TableCell>}
                      <TableCell>
                        <span className={`font-mono font-medium ${stockStatus === "out" ? "text-red-500" : stockStatus === "low" ? "text-yellow-600" : "text-green-600"}`}>{cs}</span>
                      </TableCell>
                      <TableCell>
                        <Badge className={stockStatus === "out" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : stockStatus === "low" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"}>
                          {ss}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={sks === "Active" ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800" : sks === "No Barcode" ? "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800" : "bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-900/20 dark:text-gray-400 dark:border-gray-700"}>
                          {sks}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(item)}><Edit className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="sm" className="text-red-500" onClick={() => setDeleteItem(item)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">Showing {filtered.length} of {data.length} products</div>
        </CardContent>
      </Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editItem ? "Edit" : "Create"} Product</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            {fields.map(field => (
              <div key={field.key} className={field.key === "isActive" ? "col-span-2" : field.type === "image" ? "col-span-2 sm:col-span-1" : ""}>
                {field.type === "image" ? (
                  <ImageUploadField
                    value={formData[field.key] || null}
                    onChange={(base64) => setFormData({ ...formData, [field.key]: base64 || "" })}
                    label={field.label}
                    placeholder={field.placeholder || `Upload ${field.label.toLowerCase()}`}
                  />
                ) : (
                  <>
                    <Label className="text-sm">{field.label} {field.required && <span className="text-red-500">*</span>}</Label>
                    {field.key === "productCode" && !editItem ? (
                      <Input className="mt-1 bg-muted cursor-not-allowed" value={formData[field.key] ?? ""} readOnly />
                    ) : field.type === "select" ? (
                      <Select value={String(formData[field.key] ?? "")} onValueChange={v => setFormData({ ...formData, [field.key]: v })}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder={`Select ${field.label}`} /></SelectTrigger>
                        <SelectContent>{(dynamicOptions[field.key] || field.options || []).map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : field.type === "checkbox" ? (
                      <div className="flex items-center gap-2 mt-2"><Switch checked={formData[field.key] ?? false} onCheckedChange={v => setFormData({ ...formData, [field.key]: v })} /><span className="text-sm">{formData[field.key] ? "Active" : "Inactive"}</span></div>
                    ) : field.type === "textarea" ? (
                      <Textarea className="mt-1" value={formData[field.key] ?? ""} onChange={e => setFormData({ ...formData, [field.key]: e.target.value })} />
                    ) : (
                      <Input className="mt-1" type={field.type} step={field.step} placeholder={field.placeholder} value={formData[field.key] ?? ""} onChange={e => setFormData({ ...formData, [field.key]: field.type === "number" ? Number(e.target.value) : e.target.value })} />
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
          {saveError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-center gap-2 mb-4">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <span className="text-sm text-red-700 dark:text-red-400 font-medium">Data Collision: {saveError}</span>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={handleSave} disabled={saving}>
              {saving ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Validating Catalog Collisions & Mapping Liquid Asset Trees...</>
              ) : editItem ? "Update Product" : "Save Master Product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-500" />Confirm Deactivate</DialogTitle></DialogHeader>
          <DialogDescription>Are you sure? The record will be marked as inactive but preserved in the system.</DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteItem(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Deactivate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// STOCK PAGE
// ============================================================

function StockPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch("/api/stock");
        setData(Array.isArray(res) ? res : res.data || []);
      } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
      finally { setLoading(false); }
    })();
  }, [toast]);

  const filtered = useMemo(() => {
    if (!search) return data;
    const s = search.toLowerCase();
    return data.filter((item: any) => item.productName?.toLowerCase().includes(s) || item.productCode?.toLowerCase().includes(s));
  }, [data, search]);

  return (
    <div className="page-enter space-y-4">
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Stock Overview</h2>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search stock..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
            </div>
          </div>
          <div className="table-container overflow-auto max-h-[65vh] rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>#</TableHead>
                  <TableHead>Product Code</TableHead>
                  <TableHead>Product Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Stock Qty</TableHead>
                  <TableHead>Cost Price</TableHead>
                  <TableHead>Sale Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="h-24 text-center"><RefreshCw className="w-5 h-5 animate-spin mx-auto" /></TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">No stock data</TableCell></TableRow>
                ) : filtered.map((item: any, idx: number) => (
                  <TableRow key={idx} className="data-table-row hover:bg-muted/50">
                    <TableCell>{idx + 1}</TableCell>
                    <TableCell className="font-mono text-xs">{item.productCode}</TableCell>
                    <TableCell className="font-medium text-slate-900 dark:text-white">{item.productName}</TableCell>
                    <TableCell>{item.category || "—"}</TableCell>
                    <TableCell><span className={`font-mono font-medium ${(item.totalStock || 0) <= 0 ? "text-red-500" : (item.totalStock || 0) <= (item.reorderLevel || 5) ? "text-yellow-600" : "text-green-600"}`}>{item.totalStock || 0}</span></TableCell>
                    <TableCell className="font-mono">{fmt(item.costPrice, "currency")}</TableCell>
                    <TableCell className="font-mono">{fmt(item.salePrice, "currency")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// STOCK DETAILS PAGE
// ============================================================

function StockDetailsPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");
  const [showCreateEntry, setShowCreateEntry] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [entryForm, setEntryForm] = useState<Record<string, any>>({
    productId: "", type: "IN", quantity: 0, reference: "", referenceType: "PurchaseOrder", date: new Date().toISOString().split("T")[0], notes: "",
  });
  const [savingEntry, setSavingEntry] = useState(false);
  const { toast } = useToast();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/stock-entries");
      setData(Array.isArray(res) ? res : res.data || []);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { loadData(); }, [loadData]);

  const openCreateEntry = async () => {
    try {
      const res = await apiFetch("/api/products");
      setProducts(Array.isArray(res) ? res : res.data || []);
    } catch { setProducts([]); }
    setEntryForm({ productId: "", type: "IN", quantity: 0, reference: "", referenceType: "PurchaseOrder", date: new Date().toISOString().split("T")[0], notes: "" });
    setShowCreateEntry(true);
  };

  const handleCreateEntry = async () => {
    if (!entryForm.productId || !entryForm.type || !entryForm.quantity || !entryForm.date) {
      toast({ title: "Error", description: "Product, type, quantity, and date are required", variant: "destructive" });
      return;
    }
    setSavingEntry(true);
    try {
      await apiFetch("/api/stock-entries", { method: "POST", body: JSON.stringify(entryForm) });
      toast({ title: "Created", description: "Stock entry created successfully" });
      setShowCreateEntry(false);
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSavingEntry(false); }
  };

  const filtered = useMemo(() => {
    if (typeFilter === "all") return data;
    return data.filter((item: any) => item.type === typeFilter);
  }, [data, typeFilter]);

  const totalIn = data.filter((d: any) => d.type === "IN").reduce((s: number, d: any) => s + (d.quantity || 0), 0);
  const totalOut = data.filter((d: any) => d.type === "OUT").reduce((s: number, d: any) => s + (d.quantity || 0), 0);

  return (
    <div className="page-enter space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Stock Details</h2>
        <Button size="sm" className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={openCreateEntry}>
          <Plus className="w-4 h-4 mr-1" />Create Stock Entry
        </Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Total IN", value: totalIn, icon: ArrowUpCircle, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/30" },
          { label: "Total OUT", value: totalOut, icon: ArrowDownCircle, color: "text-red-600", bg: "bg-red-50 dark:bg-red-900/30" },
          { label: "Total Entries", value: data.length, icon: Activity, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/30" },
        ].map((stat, i) => (
          <Card key={i} className="stat-mini-card"><CardContent className="p-3 flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${stat.bg} ${stat.color}`}><stat.icon className="w-4 h-4" /></div>
            <div><p className="text-xs text-muted-foreground">{stat.label}</p><p className="text-lg font-bold text-slate-900 dark:text-white">{stat.value}</p></div>
          </CardContent></Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Entry Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="IN">IN</SelectItem>
                <SelectItem value="OUT">OUT</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="table-container overflow-auto max-h-[60vh] rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>#</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="h-24 text-center"><RefreshCw className="w-5 h-5 animate-spin mx-auto" /></TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">No stock entries</TableCell></TableRow>
                ) : filtered.map((item: any, idx: number) => (
                  <TableRow key={item.id} className={`data-table-row hover:bg-muted/50 ${item.type === "IN" ? "bg-green-50/50 dark:bg-green-900/10" : item.type === "OUT" ? "bg-red-50/50 dark:bg-red-900/10" : ""}`}>
                    <TableCell>{idx + 1}</TableCell>
                    <TableCell className="font-medium text-slate-900 dark:text-white">{item.product?.name || item.productId || "—"}</TableCell>
                    <TableCell><Badge className={item.type === "IN" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}>{item.type}</Badge></TableCell>
                    <TableCell className="font-mono">{item.quantity}</TableCell>
                    <TableCell>{item.reference || "—"}</TableCell>
                    <TableCell>{fmtDate(item.date)}</TableCell>
                    <TableCell className="text-muted-foreground">{item.notes || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create Stock Entry Dialog */}
      <Dialog open={showCreateEntry} onOpenChange={setShowCreateEntry}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Stock Entry</DialogTitle>
            <DialogDescription>Add a new stock entry (IN/OUT)</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Product <span className="text-red-500">*</span></Label>
              <Select value={entryForm.productId} onValueChange={v => setEntryForm({ ...entryForm, productId: v })}>
                <SelectTrigger><SelectValue placeholder="Select Product" /></SelectTrigger>
                <SelectContent>
                  {products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.productCode})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Type <span className="text-red-500">*</span></Label>
                <Select value={entryForm.type} onValueChange={v => setEntryForm({ ...entryForm, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IN">IN</SelectItem>
                    <SelectItem value="OUT">OUT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Quantity <span className="text-red-500">*</span></Label>
                <Input type="number" min={1} value={entryForm.quantity} onChange={e => setEntryForm({ ...entryForm, quantity: Number(e.target.value) })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reference</Label>
              <Input placeholder="PO-001, SO-001, etc." value={entryForm.reference} onChange={e => setEntryForm({ ...entryForm, reference: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Reference Type</Label>
                <Select value={entryForm.referenceType} onValueChange={v => setEntryForm({ ...entryForm, referenceType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PurchaseOrder">Purchase Order</SelectItem>
                    <SelectItem value="SalesOrder">Sales Order</SelectItem>
                    <SelectItem value="Transfer">Transfer</SelectItem>
                    <SelectItem value="Return">Return</SelectItem>
                    <SelectItem value="Adjustment">Adjustment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Date <span className="text-red-500">*</span></Label>
                <Input type="date" value={entryForm.date} onChange={e => setEntryForm({ ...entryForm, date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea placeholder="Optional notes..." value={entryForm.notes} onChange={e => setEntryForm({ ...entryForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateEntry(false)}>Cancel</Button>
            <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={handleCreateEntry} disabled={savingEntry}>
              {savingEntry ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
              Create Entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// GENERIC REPORT PAGE
// ============================================================

function GenericReportPage({ title, reportType }: { title: string; reportType: string }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0]);
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [generated, setGenerated] = useState(false);
  const { toast } = useToast();

  const generate = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/reports?type=${reportType}&from=${dateFrom}&to=${dateTo}`);
      setData(Array.isArray(res) ? res : res.data || []);
      setGenerated(true);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const exportPDF = () => {
    if (data.length === 0) return;
    const dynamicColumns = Object.keys(data[0]).filter(k => k !== "id").map(k => ({ key: k, label: k }));
    try { exportToPDF({ title, columns: dynamicColumns, data: data, orientation: "portrait", subtitle: `Period: ${dateFrom} to ${dateTo}` }); } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const exportCSVReport = () => {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]).filter(k => k !== "id");
    const rows = data.map((row: any) => headers.map(h => String(row[h] ?? "—")));
    try { exportToCSVSimple(title, headers, rows); toast({ title: "Exported", description: `${title} exported to CSV` }); } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const columns = data.length > 0 ? Object.keys(data[0]).filter(k => k !== "id") : [];

  return (
    <div className="page-enter space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{title}</h2>
        {generated && <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportPDF}><FileDown className="w-4 h-4 mr-1" />PDF</Button>
          <Button variant="outline" size="sm" onClick={exportCSVReport}><Download className="w-4 h-4 mr-1" />CSV</Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="w-4 h-4 mr-1" />Print</Button>
        </div>}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div><Label className="text-sm">From Date</Label><Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="mt-1" /></div>
            <div><Label className="text-sm">To Date</Label><Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="mt-1" /></div>
            <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={generate} disabled={loading}>
              {loading ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Search className="w-4 h-4 mr-1" />}Generate Report
            </Button>
          </div>

          {!generated ? (
            <div className="text-center py-16 text-muted-foreground">
              <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Select date range and click Generate Report</p>
            </div>
          ) : data.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No data found for the selected period</p>
            </div>
          ) : (
            <>
              <div className="mb-2 text-sm text-muted-foreground">Showing {data.length} records</div>
              <div className="table-container overflow-auto max-h-[55vh] rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>#</TableHead>
                      {columns.map(col => <TableHead key={col}>{col.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.map((row: any, idx: number) => (
                      <TableRow key={idx} className="data-table-row hover:bg-muted/50">
                        <TableCell>{idx + 1}</TableCell>
                        {columns.map(col => <TableCell key={col}>{String(row[col] ?? "—")}</TableCell>)}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// SEND SMS PAGE
// ============================================================

function SendSMSPage({ bulk = false }: { bulk?: boolean }) {
  const [recipient, setRecipient] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const handleSend = async () => {
    if (!recipient || !message) { toast({ title: "Error", description: "Please fill all fields", variant: "destructive" }); return; }
    setSending(true);
    try {
      await apiFetch("/api/sms-logs", { method: "POST", body: JSON.stringify({ recipient, message, status: "Sent", cost: 0.5 }) });
      toast({ title: "SMS Sent", description: bulk ? "Bulk SMS sent successfully" : "SMS sent successfully" });
      setRecipient(""); setMessage("");
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSending(false); }
  };

  return (
    <div className="page-enter space-y-4">
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{bulk ? "Send Bulk SMS" : "Send SMS"}</h2>
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="space-y-2">
            <Label>{bulk ? "Recipients (comma-separated)" : "Recipient"}</Label>
            {bulk ? <Textarea placeholder="01711XXXXXX, 01811XXXXXX" value={recipient} onChange={e => setRecipient(e.target.value)} rows={3} /> : <Input placeholder="01711XXXXXX" value={recipient} onChange={e => setRecipient(e.target.value)} />}
          </div>
          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea placeholder="Type your message..." value={message} onChange={e => setMessage(e.target.value)} rows={4} maxLength={160} />
            <p className="text-xs text-muted-foreground">{message.length}/160 characters</p>
          </div>
          <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={handleSend} disabled={sending}>
            {sending ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
            {bulk ? "Send Bulk SMS" : "Send SMS"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// CHANGE PASSWORD PAGE
// ============================================================

function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const auth = useAuth();

  // Only admin can access this page
  if (auth.user?.role !== "admin") {
    return (
      <div className="page-enter space-y-4 flex flex-col items-center justify-center min-h-[300px]">
        <ShieldCheck className="w-12 h-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Access Denied</h2>
        <p className="text-muted-foreground text-center">Only administrators can change passwords.</p>
      </div>
    );
  }

  const handleSave = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({ title: "Validation Error", description: "All fields are required", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "Error", description: "New password must be at least 6 characters", variant: "destructive" });
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      toast({ title: "Error", description: "New password must contain at least one uppercase letter", variant: "destructive" });
      return;
    }
    if (!/[0-9]/.test(newPassword)) {
      toast({ title: "Error", description: "New password must contain at least one number", variant: "destructive" });
      return;
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword)) {
      toast({ title: "Error", description: "New password must contain at least one special character (!@#$%etc)", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Error", description: "New password and confirm password do not match", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-User-Email": auth.user?.email || "" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "Success", description: "Password changed successfully" });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        toast({ title: "Error", description: data.error || "Failed to change password", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to change password", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-enter space-y-4">
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Change Password</h2>
      <Card className="max-w-lg">
        <CardContent className="p-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">Current Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input id="currentPassword" type="password" placeholder="Enter current password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="pl-10" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="newPassword">New Password</Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input id="newPassword" type="password" placeholder="Enter new password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="pl-10" />
            </div>
            <p className="text-[10px] text-muted-foreground">Min 6 chars, 1 uppercase, 1 number, 1 special character</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm New Password</Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input id="confirmPassword" type="password" placeholder="Confirm new password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="pl-10" />
            </div>
          </div>
          <Button className="bg-[#2563eb] hover:bg-[#1d4ed8] w-full" onClick={handleSave} disabled={saving}>
            {saving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
            Save Password
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// PROFILE PAGE - Complete user profile with photo, info, and export tracking
// ============================================================

function ProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [profileData, setProfileData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    role: "",
    photo: "",
    createdAt: "",
    pdfExports: 0,
    csvImports: 0,
    csvExports: 0,
  });
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>("");

  const loadProfile = useCallback(async () => {
    if (!user?.email) return;
    setLoading(true);
    try {
      const res = await fetch("/api/users/profile", {
        headers: { "Content-Type": "application/json", "X-User-Email": user.email },
      });
      if (res.ok) {
        const data = await res.json();
        setProfileData({
          name: data.name || "",
          email: data.email || "",
          phone: data.phone || "",
          address: data.address || "",
          role: data.role || "",
          photo: data.photo || "",
          createdAt: data.createdAt || "",
          pdfExports: data.pdfExports || 0,
          csvImports: data.csvImports || 0,
          csvExports: data.csvExports || 0,
        });
      }
      // Load company branding for logo display
      try {
        const compRes = await fetch("/api/company-branding");
        if (compRes.ok) {
          const compData = await compRes.json();
          setCompanyLogo(compData.logo || compData.brandLogo || null);
          setCompanyName(compData.name || "");
        }
      } catch { /* silent */ }
    } catch {
      toast({ title: "Error", description: "Failed to load profile", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [user?.email, toast]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const handleSave = async () => {
    if (!user?.email) return;
    setSaving(true);
    try {
      const res = await fetch("/api/users/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-User-Email": user.email },
        body: JSON.stringify({
          name: profileData.name,
          phone: profileData.phone,
          address: profileData.address,
          photo: profileData.photo,
        }),
      });
      if (res.ok) {
        toast({ title: "Success", description: "Profile updated successfully" });
        setEditing(false);
        // Update displayName in auth state
        const stored = localStorage.getItem("ems_auth");
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (parsed.user) {
              parsed.user.displayName = profileData.name;
              localStorage.setItem("ems_auth", JSON.stringify(parsed));
              authState = parsed;
              authListeners.forEach(l => l());
            }
          } catch { /* silent */ }
        }
      } else {
        const err = await res.json().catch(() => ({ error: "Failed to update profile" }));
        toast({ title: "Error", description: err.error || "Failed to update profile", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to update profile", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // File type validation
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast({ title: "Error", description: "Only JPEG, PNG, and WebP files are allowed", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Error", description: "Image must be less than 5MB", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setProfileData(prev => ({ ...prev, photo: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const roleLabels: Record<string, string> = {
    admin: "Administrator",
    manager: "Manager",
    sr: "Sales Representative",
    dealer: "Dealer",
    vat_auditor: "VAT Auditor",
  };

  if (loading) {
    return (
      <div className="page-enter space-y-6 flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="page-enter space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">My Profile</h2>
        <Button
          className={editing ? "bg-green-600 hover:bg-green-700" : "bg-[#2563eb] hover:bg-[#1d4ed8]"}
          onClick={() => editing ? handleSave() : setEditing(true)}
          disabled={saving}
        >
          {saving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : editing ? <CheckCircle className="w-4 h-4 mr-2" /> : <Pencil className="w-4 h-4 mr-2" />}
          {saving ? "Saving..." : editing ? "Save Changes" : "Edit Profile"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Avatar and basic info */}
        <Card className="lg:col-span-1">
          <CardContent className="p-6 flex flex-col items-center text-center space-y-4">
            {/* Avatar */}
            <div className="relative group">
              {profileData.photo ? (
                <img
                  src={profileData.photo}
                  alt="Profile photo"
                  className="w-28 h-28 rounded-full object-cover border-4 border-[#2563eb]/20 shadow-lg"
                />
              ) : (
                <div className="w-28 h-28 rounded-full bg-gradient-to-br from-[#2563eb] to-[#1d4ed8] flex items-center justify-center text-white text-4xl font-bold shadow-lg">
                  {profileData.name?.charAt(0)?.toUpperCase() || "U"}
                </div>
              )}
              {editing && (
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                  <label className="cursor-pointer p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors">
                    <Upload className="w-5 h-5 text-white" />
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={handlePhotoUpload}
                    />
                  </label>
                  {profileData.photo && (
                    <button
                      type="button"
                      onClick={() => setProfileData(prev => ({ ...prev, photo: "" }))}
                      className="p-1.5 rounded-full bg-red-500/60 hover:bg-red-500/80 transition-colors"
                    >
                      <X className="w-5 h-5 text-white" />
                    </button>
                  )}
                </div>
              )}
            </div>
            {editing && (
              <p className="text-[10px] text-muted-foreground/60">JPEG / PNG / WebP, max 5MB</p>
            )}
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{profileData.name || "User"}</h3>
              <p className="text-sm text-muted-foreground">{profileData.email}</p>
            </div>

            {/* Role badge */}
            <Badge className="bg-[#2563eb] text-white px-3 py-1">
              {roleLabels[profileData.role] || profileData.role}
            </Badge>

            {/* Join date */}
            {profileData.createdAt && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Calendar className="w-3.5 h-3.5" />
                <span>Joined {new Date(profileData.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</span>
              </div>
            )}

            {/* Company logo */}
            {(companyLogo || companyName) && (
              <div className="w-full border-t pt-4 mt-2">
                <div className="flex items-center gap-3 justify-center">
                  {companyLogo && (
                    <img src={companyLogo} alt="Company logo" className="h-8 w-auto object-contain" />
                  )}
                  {companyName && (
                    <span className="text-xs text-muted-foreground font-medium">{companyName}</span>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: Profile info and export tracking */}
        <div className="lg:col-span-2 space-y-6">
          {/* Personal Information */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="w-4 h-4 text-[#2563eb]" />
                Personal Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  {editing ? (
                    <Input
                      value={profileData.name}
                      onChange={e => setProfileData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Enter your full name"
                    />
                  ) : (
                    <p className="text-sm font-medium text-slate-900 dark:text-white py-2">{profileData.name || "--"}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <p className="text-sm font-medium text-slate-900 dark:text-white py-2">{profileData.email || "--"}</p>
                  <p className="text-xs text-muted-foreground">Email cannot be changed</p>
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  {editing ? (
                    <Input
                      value={profileData.phone}
                      onChange={e => setProfileData(prev => ({ ...prev, phone: e.target.value }))}
                      placeholder="Enter phone number"
                    />
                  ) : (
                    <p className="text-sm font-medium text-slate-900 dark:text-white py-2">{profileData.phone || "--"}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <p className="text-sm font-medium text-slate-900 dark:text-white py-2">{roleLabels[profileData.role] || profileData.role}</p>
                  <p className="text-xs text-muted-foreground">Role is managed by administrator</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Address</Label>
                {editing ? (
                  <Textarea
                    value={profileData.address}
                    onChange={e => setProfileData(prev => ({ ...prev, address: e.target.value }))}
                    placeholder="Enter your address"
                    rows={3}
                  />
                ) : (
                  <p className="text-sm font-medium text-slate-900 dark:text-white py-2">{profileData.address || "--"}</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Export Activity Tracking */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#2563eb]" />
                Export Activity
              </CardTitle>
              <CardDescription>Track your data export and import activity</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex flex-col items-center p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50">
                  <FileText className="w-8 h-8 text-red-500 mb-2" />
                  <span className="text-2xl font-bold text-slate-900 dark:text-white">{profileData.pdfExports}</span>
                  <span className="text-xs text-muted-foreground mt-1">PDF Exports</span>
                </div>
                <div className="flex flex-col items-center p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50">
                  <Upload className="w-8 h-8 text-green-500 mb-2" />
                  <span className="text-2xl font-bold text-slate-900 dark:text-white">{profileData.csvImports}</span>
                  <span className="text-xs text-muted-foreground mt-1">CSV Imports</span>
                </div>
                <div className="flex flex-col items-center p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50">
                  <Download className="w-8 h-8 text-blue-500 mb-2" />
                  <span className="text-2xl font-bold text-slate-900 dark:text-white">{profileData.csvExports}</span>
                  <span className="text-xs text-muted-foreground mt-1">CSV Exports</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function DashboardChart() {
  const [chartData, setChartData] = useState<any[]>([]);
  const [chartLoading, setChartLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch("/api/dashboard-analytics?type=monthly-trend&months=6");
        const months = res.data || [];
        const formatted = months.map((m: any) => ({
          name: m.month,
          Sales: m.sales || 0,
          Purchase: m.purchases || 0,
        }));
        setChartData(formatted);
      } catch {
        setChartData([
          { name: "6 months ago", Sales: 45000, Purchase: 32000 },
          { name: "5 months ago", Sales: 52000, Purchase: 38000 },
          { name: "4 months ago", Sales: 48000, Purchase: 41000 },
          { name: "3 months ago", Sales: 61000, Purchase: 45000 },
          { name: "2 months ago", Sales: 55000, Purchase: 39000 },
          { name: "Last month", Sales: 67000, Purchase: 48000 },
        ]);
      } finally {
        setChartLoading(false);
      }
    })();
  }, []);

  if (chartLoading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
          <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
          <RechartsTooltip
            formatter={(value: number) => [`৳${new Intl.NumberFormat('en-US').format(value)}`, ""]}
            contentStyle={{ borderRadius: "8px", fontSize: "12px" }}
          />
          <Legend wrapperStyle={{ fontSize: "12px" }} />
          <Bar dataKey="Sales" fill="#2563eb" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Purchase" fill="#f59e0b" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================================
// DASHBOARD PAGE
// ============================================================

function DashboardPage() {
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [clock, setClock] = useState(new Date());
  const { toast } = useToast();

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    (async () => {
      try { const res = await apiFetch("/api/dashboard"); setStats(res); }
      catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
      finally { setLoading(false); }
    })();
  }, [toast]);

  const kpis = [
    { label: "Total Products", value: stats.totalProducts || 0, icon: Package, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-900/30", gradient: "from-blue-500/10 to-transparent", border: "border-blue-200 dark:border-blue-800/50" },
    { label: "Today's Sales", value: fmt(stats.todaysSales || 0, "currency"), icon: Receipt, color: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-900/30", gradient: "from-green-500/10 to-transparent", border: "border-green-200 dark:border-green-800/50" },
    { label: "Today's Purchase", value: fmt(stats.todaysPurchases || 0, "currency"), icon: ShoppingCart, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-900/30", gradient: "from-purple-500/10 to-transparent", border: "border-purple-200 dark:border-purple-800/50" },
    { label: "Low Stock Items", value: stats.lowStockProducts?.length || 0, icon: AlertTriangle, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-900/30", gradient: "from-orange-500/10 to-transparent", border: "border-orange-200 dark:border-orange-800/50" },
    { label: "Total Customers", value: stats.totalCustomers || 0, icon: Users, color: "text-cyan-600 dark:text-cyan-400", bg: "bg-cyan-50 dark:bg-cyan-900/30", gradient: "from-cyan-500/10 to-transparent", border: "border-cyan-200 dark:border-cyan-800/50" },
    { label: "Total Suppliers", value: stats.totalSuppliers || 0, icon: Truck, color: "text-teal-600 dark:text-teal-400", bg: "bg-teal-50 dark:bg-teal-900/30", gradient: "from-teal-500/10 to-transparent", border: "border-teal-200 dark:border-teal-800/50" },
    { label: "Bank Balance", value: fmt(stats.cashBalance || 0, "currency"), icon: Banknote, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/30", gradient: "from-emerald-500/10 to-transparent", border: "border-emerald-200 dark:border-emerald-800/50" },
    { label: "Total Expenses", value: fmt(stats.totalExpenses, "currency"), icon: ArrowDownCircle, color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-900/30", gradient: "from-red-500/10 to-transparent", border: "border-red-200 dark:border-red-800/50" },
  ];

  const auth = useAuth();
  const userName = auth.user?.displayName || auth.user?.name || "User";
  const isVatAuditor = auth.isVatAuditor;
  const AUDIT_MASK = "N/A (Audit Mode)";

  // Filter KPIs for VAT Auditor (mask all monetary values)
  const visibleKpis = isVatAuditor
    ? kpis.map(k => ({
        ...k,
        value: ["Total Products", "Low Stock Items", "Total Customers", "Total Suppliers"].includes(k.label) ? k.value : AUDIT_MASK,
      }))
    : kpis;

  return (
    <div className="page-enter space-y-6">
      {/* VAT Auditor Badge */}
      {isVatAuditor && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <Badge className="bg-amber-500 text-white">VAT AUDIT MODE</Badge>
          <span className="text-sm text-amber-700 dark:text-amber-400">All monetary values are masked. Only legal outward/inward invoice tax records shown.</span>
        </div>
      )}
      {/* Welcome & Clock */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Welcome, {userName}</h2>
          <p className="text-muted-foreground">Here&apos;s your business overview</p>
        </div>
        <Card className="bg-gradient-to-r from-[#132240] to-[#0a1628] text-white border-0 shadow-lg">
          <CardContent className="p-3 px-5 flex items-center gap-3">
            <Calendar className="w-5 h-5 text-blue-300" />
            <div>
              <p className="text-xs text-blue-200">{clock.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
              <p className="text-lg font-bold font-mono tabular-nums">{clock.toLocaleTimeString()}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {visibleKpis.map((kpi, i) => (
          <Card key={i} className={`kpi-card dashboard-kpi-card relative overflow-hidden ${kpi.border}`}>
            <div className={`absolute inset-0 bg-gradient-to-br ${kpi.gradient} pointer-events-none`} />
            <CardContent className="p-4 relative">
              <div className="flex items-center justify-between mb-3">
                <div className={`p-2.5 rounded-xl ${kpi.bg} ${kpi.color}`}><kpi.icon className="w-5 h-5" /></div>
              </div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{kpi.label}</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white stat-value tracking-tight">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Monthly Sales vs Purchase Chart */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-blue-500" />
            Monthly Sales vs Purchase
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DashboardChart />
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-500" />
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {[
              { label: "New Sale", icon: Receipt, color: "text-green-600 bg-green-50 hover:bg-green-100 dark:text-green-400 dark:bg-green-900/30 dark:hover:bg-green-900/50" },
              { label: "New Purchase", icon: ShoppingCart, color: "text-purple-600 bg-purple-50 hover:bg-purple-100 dark:text-purple-400 dark:bg-purple-900/30 dark:hover:bg-purple-900/50" },
              { label: "Add Product", icon: Plus, color: "text-blue-600 bg-blue-50 hover:bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30 dark:hover:bg-blue-900/50" },
              { label: "View Reports", icon: BarChart3, color: "text-cyan-600 bg-cyan-50 hover:bg-cyan-100 dark:text-cyan-400 dark:bg-cyan-900/30 dark:hover:bg-cyan-900/50" },
              { label: "Transfer Stock", icon: ArrowLeftRight, color: "text-amber-600 bg-amber-50 hover:bg-amber-100 dark:text-amber-400 dark:bg-amber-900/30 dark:hover:bg-amber-900/50" },
              { label: "Record Expense", icon: DollarSign, color: "text-red-600 bg-red-50 hover:bg-red-100 dark:text-red-400 dark:bg-red-900/30 dark:hover:bg-red-900/50" },
              { label: "Send SMS", icon: Send, color: "text-teal-600 bg-teal-50 hover:bg-teal-100 dark:text-teal-400 dark:bg-teal-900/30 dark:hover:bg-teal-900/50" },
              { label: "Print Report", icon: Printer, color: "text-slate-600 bg-slate-50 hover:bg-slate-100 dark:text-slate-400 dark:bg-slate-900/30 dark:hover:bg-slate-900/50" },
            ].map((action, i) => (
              <Button key={i} variant="ghost" size="sm" className={`justify-start gap-2 h-9 ${action.color} transition-all duration-200`}>
                <action.icon className="w-4 h-4" />
                <span className="text-xs font-medium">{action.label}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Stock Info & Advance Search */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Package className="w-4 h-4 text-blue-500" />Stock Info</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input placeholder="Search product or code..." className="flex-1" />
              <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]"><Search className="w-4 h-4 mr-1" />Search Stock</Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Search className="w-4 h-4 text-green-500" />Advance Search</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input placeholder="Search by product, invoice, customer..." className="flex-1" />
              <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]"><Search className="w-4 h-4 mr-1" />Advance Search</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Today's Installments */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Today&apos;s Installments</CardTitle>
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="w-4 h-4 mr-1" />Print</Button>
          </div>
        </CardHeader>
        <CardContent>
          {(stats.hireInstallments || []).length > 0 ? (
            <div className="table-container overflow-auto max-h-60 rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Sl</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Invoice No</TableHead>
                    <TableHead>Sales Date</TableHead>
                    <TableHead>Payment Date</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Customer Name</TableHead>
                    <TableHead>Address & Contact</TableHead>
                    <TableHead>Product Name</TableHead>
                    <TableHead>Installment</TableHead>
                    <TableHead>Default Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(stats.hireInstallments || []).slice(0, 10).map((inst: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell><Button variant="outline" size="sm" className="text-xs h-7">Update Remind Date</Button></TableCell>
                      <TableCell className="font-mono">{inst.invoiceNo || "—"}</TableCell>
                      <TableCell>{inst.salesDate ? fmtDate(inst.salesDate) : "—"}</TableCell>
                      <TableCell>{inst.paymentDate ? fmtDate(inst.paymentDate) : "—"}</TableCell>
                      <TableCell className="font-mono">{inst.customerCode || "—"}</TableCell>
                      <TableCell className="font-medium text-slate-900 dark:text-white">{inst.customerName || "—"}</TableCell>
                      <TableCell>{inst.customerAddress || "—"}</TableCell>
                      <TableCell>{inst.productName || "Not available"}</TableCell>
                      <TableCell className="font-mono">{isVatAuditor ? "N/A (Audit Mode)" : fmt(inst.installmentAmount, "currency")}</TableCell>
                      <TableCell className="font-mono">{isVatAuditor ? "N/A (Audit Mode)" : fmt(inst.defaultAmount || 0, "currency")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground"><p>No installments due today</p></div>
          )}
        </CardContent>
      </Card>

      {/* Recent Activities */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-500" />
            Recent Activities
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(stats.recentActivities || []).length > 0 ? (
            <div className="relative activity-timeline pl-6 space-y-4">
              {(stats.recentActivities || []).slice(0, 6).map((act: any, i: number) => (
                <div key={i} className="relative flex items-start gap-3 text-sm">
                  <div className="absolute -left-6 top-1 w-3 h-3 rounded-full bg-blue-500 border-2 border-white dark:border-[#132240] timeline-dot-pulse" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 dark:text-white truncate">{act.action || act.label || "Activity"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{act.details || act.description || ""} — {act.time || act.createdAt || ""}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No recent activities</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// SIDEBAR COMPONENT
// ============================================================

function Sidebar({ currentPage, onNavigate, collapsed, onToggle }: {
  currentPage: string; onNavigate: (key: string) => void; collapsed: boolean; onToggle: () => void;
}) {
  const { hasAccess, user, isVatAuditor } = useAuth();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(SIDEBAR_CONFIG.map(g => g.key)));
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(new Set());

  // Filter sidebar groups based on RBAC
  const visibleGroups = useMemo(() => {
    if (!user) return [];
    return SIDEBAR_CONFIG.filter(g => hasAccess(g.key)).map(g => ({
      ...g,
      items: g.items.filter(item => hasItemAccess(user.role, item.key)),
    })).filter(g => g.items.length > 0);
  }, [hasAccess, user]);

  // Compute auto-expanded sub-group for current page
  const autoExpandSub = useMemo(() => {
    for (const group of visibleGroups) {
      for (const item of group.items) {
        if (item.key === currentPage && item.parent) {
          return `${group.key}-${item.parent}`;
        }
      }
    }
    return null;
  }, [currentPage, visibleGroups]);

  // Merge user-expanded and auto-expanded sub-groups
  const allExpandedSubs = useMemo(() => {
    const result = new Set(expandedSubs);
    if (autoExpandSub) result.add(autoExpandSub);
    return result;
  }, [expandedSubs, autoExpandSub]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => { const next = new Set(prev); if (next.has(key)) { next.delete(key); } else { next.add(key); } return next; });
  };

  const toggleSub = (key: string) => {
    setExpandedSubs(prev => { const next = new Set(prev); if (next.has(key)) { next.delete(key); } else { next.add(key); } return next; });
  };

  const getActiveParent = (itemKey: string): string | null => {
    for (const group of visibleGroups) {
      for (const item of group.items) {
        if (item.key === itemKey && item.parent) return `${group.key}-${item.parent}`;
      }
    }
    return null;
  };

  // Group items by parent
  const groupItems = (items: SidebarItem[]) => {
    const result: { parent: string | null; items: SidebarItem[] }[] = [];
    let currentParent: string | null = null;
    let currentItems: SidebarItem[] = [];

    items.forEach(item => {
      if (item.parent && item.parent !== currentParent) {
        if (currentItems.length > 0 && currentParent) {
          result.push({ parent: currentParent, items: currentItems });
        } else if (currentItems.length > 0) {
          result.push({ parent: null, items: currentItems });
        }
        currentParent = item.parent;
        currentItems = [item];
      } else if (item.parent) {
        currentItems.push(item);
      } else {
        if (currentItems.length > 0 && currentParent) {
          result.push({ parent: currentParent, items: currentItems });
          currentParent = null;
          currentItems = [];
        }
        result.push({ parent: null, items: [item] });
      }
    });
    if (currentItems.length > 0) {
      result.push({ parent: currentParent, items: currentItems });
    }
    return result;
  };

  return (
    <aside className={`fixed left-0 top-0 z-40 h-full bg-[#0a1628] dark:bg-[#060e1a] text-slate-300 transition-all duration-300 ${collapsed ? "w-16" : "w-64"} flex flex-col overflow-hidden shadow-xl`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#2563eb] flex items-center justify-center shadow-md shadow-blue-500/20">
              <Package className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white leading-tight">Electronics Mart</h1>
              <p className="text-[10px] text-slate-400 leading-tight">IMS v2.0</p>
            </div>
          </div>
        )}
        {collapsed && (
          <button
            onClick={onToggle}
            className="w-11 h-11 rounded-lg bg-[#2563eb] flex items-center justify-center shadow-md shadow-blue-500/20 mx-auto hover:bg-[#1d4ed8] active:scale-95 transition-all cursor-pointer"
            title="Expand sidebar"
            aria-label="Expand sidebar"
          >
            <ChevronsRight className="w-5 h-5 text-white" />
          </button>
        )}
        {!collapsed && (
          <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white hover:bg-white/10 h-8 w-8 p-0" onClick={onToggle} title="Collapse sidebar" aria-label="Collapse sidebar">
            <ChevronLeft className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Navigation */}
      <div className="flex-1 min-h-0 overflow-y-auto py-2 sidebar-scroll" style={{ scrollbarGutter: 'stable' }}>
        <nav className="space-y-0.5 px-2">
          {visibleGroups.map(group => (
            <div key={group.key}>
              <button
                onClick={() => collapsed ? onNavigate(group.items[0]?.key || group.key) : toggleGroup(group.key)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors hover:bg-white/10 hover:text-white ${expandedGroups.has(group.key) ? "text-blue-300" : ""} ${collapsed ? "justify-center" : ""}`}
                title={collapsed ? group.label : undefined}
              >
                <group.icon className="w-4 h-4 shrink-0" />
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left">{group.label}</span>
                    <ChevronDown className={`w-3 h-3 transition-transform ${expandedGroups.has(group.key) ? "rotate-180" : ""}`} />
                  </>
                )}
              </button>
              {/* Collapsed: show active indicator dot if any item in this group is active */}
              {collapsed && group.items.some(item => item.key === currentPage) && (
                <div className="flex justify-center">
                  <span className="w-1 h-1 rounded-full bg-blue-400" />
                </div>
              )}
              {expandedGroups.has(group.key) && !collapsed && (
                <div className="ml-3 mt-0.5 space-y-0.5">
                  {groupItems(group.items).map((grouped, gi) => {
                    if (grouped.parent) {
                      const subKey = `${group.key}-${grouped.parent}`;
                      const isSubExpanded = allExpandedSubs.has(subKey);
                      const activeParent = getActiveParent(currentPage);
                      const isParentActive = activeParent === subKey;
                      return (
                        <div key={gi}>
                          <button
                            onClick={() => toggleSub(subKey)}
                            className={`w-full flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition-colors hover:bg-white/10 hover:text-white ${isParentActive ? "text-blue-300 bg-white/5" : "text-slate-400"}`}
                          >
                            <ChevronRight className={`w-3 h-3 transition-transform ${isSubExpanded ? "rotate-90" : ""}`} />
                            <span className="flex-1 text-left">{grouped.parent}</span>
                          </button>
                          {isSubExpanded && grouped.items.map(item => (
                            <button
                              key={item.key}
                              onClick={() => onNavigate(item.key)}
                              className={`w-full flex items-center gap-2 pl-8 pr-3 py-1.5 rounded text-xs transition-colors hover:bg-white/10 hover:text-white ${currentPage === item.key ? "bg-blue-500/20 text-blue-300 sidebar-item-active" : "text-slate-400"}`}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      );
                    }
                    return grouped.items.map(item => (
                      <button
                        key={item.key}
                        onClick={() => onNavigate(item.key)}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 rounded text-xs transition-colors hover:bg-white/10 hover:text-white ${currentPage === item.key ? "bg-blue-500/20 text-blue-300 sidebar-item-active" : "text-slate-400"}`}
                      >
                        {item.icon && <item.icon className="w-3.5 h-3.5" />}
                        {item.label}
                      </button>
                    ));
                  })}
                </div>
              )}
            </div>
          ))}
        </nav>
      </div>

      {/* User section at bottom */}
      {!collapsed && (
        <div className="p-3 border-t border-white/10">
          <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-slate-400">
            <UserCircle className="w-4 h-4" />
            <span className="truncate">{user?.displayName || user?.name || "User"}</span>
          </div>
        </div>
      )}
      {collapsed && (
        <div className="p-2 border-t border-white/10 flex justify-center">
          <div
            className={`w-7 h-7 rounded-full ${user?.role ? ROLE_COLORS[user.role] : "bg-[#2563eb]"} flex items-center justify-center text-white text-[10px] font-bold`}
            title={user?.displayName || user?.name || "User"}
          >
            {(user?.displayName || user?.name)?.charAt(0).toUpperCase() || "U"}
          </div>
        </div>
      )}
    </aside>
  );
}

// ============================================================
// PURCHASE ORDERS PAGE - Dedicated Transaction Page
// ============================================================

function PurchaseOrdersPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { toast } = useToast();
  const { isVatAuditor, user } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Dynamic options
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [godowns, setGodowns] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  // Form state
  const [formData, setFormData] = useState<Record<string, any>>({ supplierId: "", date: new Date().toISOString().split("T")[0], godownId: "", notes: "", status: "Draft", discount: 0, vatPercentage: 15 });
  const [lines, setLines] = useState<any[]>([{ productId: "", qty: 1, rate: 0, discPercent: 0, discAmt: 0, vatAmt: 0, total: 0 }]);

  // Dealer restriction
  const isDealer = user?.role === "dealer";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/purchase-orders");
      setData(Array.isArray(res) ? res : res.data || []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const loadOptions = useCallback(async () => {
    try {
      const [sRes, gRes, pRes] = await Promise.all([
        apiFetch("/api/suppliers").catch(() => []),
        apiFetch("/api/godowns").catch(() => []),
        apiFetch("/api/products").catch(() => []),
      ]);
      setSuppliers(Array.isArray(sRes) ? sRes : sRes.data || []);
      setGodowns(Array.isArray(gRes) ? gRes : gRes.data || []);
      setProducts(Array.isArray(pRes) ? pRes : pRes.data || []);
    } catch { /* silent */ }
  }, []);

  const filtered = useMemo(() => {
    if (!search) return data;
    const s = search.toLowerCase();
    return data.filter((item: any) =>
      item.poNumber?.toLowerCase().includes(s) ||
      item.supplierName?.toLowerCase().includes(s) ||
      item.status?.toLowerCase().includes(s)
    );
  }, [data, search]);

  // Stats
  const totalPOs = data.length;
  const totalValue = data.reduce((s: number, d: any) => s + (d.grandTotal || 0), 0);
  const draftCount = data.filter((d: any) => d.status === "Draft").length;
  const receivedCount = data.filter((d: any) => d.status === "Received").length;

  // Line calculations
  const calcLine = (line: any) => {
    const qty = Number(line.qty) || 0;
    const rate = Number(line.rate) || 0;
    const discPercent = Number(line.discPercent) || 0;
    const discAmt = rate * qty * discPercent / 100;
    const afterDisc = rate * qty - discAmt;
    const vatPct = Number(formData.vatPercentage) || 0;
    const vatAmt = afterDisc * vatPct / 100;
    const total = afterDisc + vatAmt;
    return { ...line, discAmt, vatAmt, total };
  };

  const updateLine = (idx: number, field: string, value: any) => {
    setLines(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      next[idx] = calcLine(next[idx]);
      return next;
    });
  };

  const addLine = () => {
    setLines(prev => [...prev, { productId: "", qty: 1, rate: 0, discPercent: 0, discAmt: 0, vatAmt: 0, total: 0 }]);
  };

  const removeLine = (idx: number) => {
    setLines(prev => prev.filter((_, i) => i !== idx));
  };

  // Summary
  const subTotal = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0);
  const totalDisc = lines.reduce((s, l) => s + (Number(l.discAmt) || 0), 0);
  const totalVat = lines.reduce((s, l) => s + (Number(l.vatAmt) || 0), 0);
  const grandTotal = subTotal - totalDisc + totalVat;

  const openCreate = () => {
    const nextNum = data.length > 0 ? String(Math.max(...data.map((d: any) => parseInt(d.poNumber?.replace("PO-", "") || "0", 10) || 0)) + 1).padStart(5, "0") : "00001";
    setFormData({ supplierId: "", date: new Date().toISOString().split("T")[0], godownId: "", notes: "", status: "Draft", discount: 0, vatPercentage: 15, poNumber: `PO-${nextNum}` });
    setLines([{ productId: "", qty: 1, rate: 0, discPercent: 0, discAmt: 0, vatAmt: 0, total: 0 }]);
    setEditItem(null);
    setShowForm(true);
    loadOptions();
  };

  const openEdit = (item: any) => {
    setFormData({
      supplierId: item.supplierId || "",
      date: item.date ? item.date.split("T")[0] : "",
      godownId: item.godownId || "",
      notes: item.notes || "",
      status: item.status || "Draft",
      discount: item.discount || 0,
      vatPercentage: item.vatPercentage || 15,
      poNumber: item.poNumber || "",
    });
    setLines(item.lines && item.lines.length > 0 ? item.lines.map((l: any) => ({
      productId: l.productId, qty: l.quantity || 1, rate: l.rate || 0, discPercent: l.discountPercent || 0, discAmt: l.discountAmount || 0, vatAmt: l.vatAmount || 0, total: l.total || 0
    })) : [{ productId: "", qty: 1, rate: 0, discPercent: 0, discAmt: 0, vatAmt: 0, total: 0 }]);
    setEditItem(item);
    setShowForm(true);
    loadOptions();
  };

  const handleSave = async () => {
    if (!formData.supplierId || !formData.date) {
      toast({ title: "Error", description: "Supplier and Date are required", variant: "destructive" });
      return;
    }
    const validLines = lines.filter(l => l.productId);
    if (validLines.length === 0) {
      toast({ title: "Error", description: "Add at least one line item", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        supplierId: formData.supplierId,
        date: formData.date,
        godownId: formData.godownId || null,
        notes: formData.notes,
        status: formData.status,
        discount: totalDisc,
        vatPercentage: Number(formData.vatPercentage) || 0,
        subTotal,
        vatAmount: totalVat,
        grandTotal,
        lines: validLines.map(l => ({
          productId: l.productId,
          quantity: Number(l.qty) || 0,
          rate: Number(l.rate) || 0,
          discountPercent: Number(l.discPercent) || 0,
          discountAmount: Number(l.discAmt) || 0,
          vatAmount: Number(l.vatAmt) || 0,
          total: Number(l.total) || 0,
        })),
      };
      if (editItem) {
        await apiFetch(`/api/purchase-orders/${editItem.id}`, { method: "PUT", body: JSON.stringify(payload) });
        toast({ title: "Updated", description: "Purchase Order updated" });
      } else {
        await apiFetch("/api/purchase-orders", { method: "POST", body: JSON.stringify(payload) });
        toast({ title: "Created", description: "Purchase Order created" });
      }
      setShowForm(false); load();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    try {
      await apiFetch(`/api/purchase-orders/${deleteItem.id}`, { method: "DELETE" });
      toast({ title: "Deactivated" }); setDeleteItem(null); load();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const exportCSV = () => {
    const headers = ["PO Number", "Supplier", "Date", "Sub Total", "VAT %", "VAT Amount", "Grand Total", "Status"];
    const rows = filtered.map((item: any) => [item.poNumber, item.supplierName || "—", fmtDate(item.date), item.subTotal || 0, item.vatPercentage || 0, item.vatAmount || 0, item.grandTotal || 0, item.status].map(String));
    try { exportToCSVSimple("Purchase Orders", headers, rows); toast({ title: "Exported", description: "Purchase Orders exported to CSV" }); } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const exportPDF = () => {
    const headers = ["PO Number", "Supplier", "Date", "Sub Total", "VAT %", "VAT Amount", "Grand Total", "Status"];
    const body = filtered.map((item: any) => [item.poNumber, item.supplierName || "—", fmtDate(item.date), fmt(item.subTotal, "currency"), String(item.vatPercentage || 0), fmt(item.vatAmount, "currency"), fmt(item.grandTotal, "currency"), item.status]);
    try { exportToPDFSimple("Purchase Orders", headers, body, "landscape"); toast({ title: "Exported", description: "Purchase Orders exported to PDF" }); } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const importCSV = () => {
    importFromCSV({
      apiPath: "/api/purchase-orders",
      formFields: [
        { key: "poNumber", label: "PO Number", type: "text", required: true },
        { key: "supplierId", label: "Supplier", type: "text", required: true },
        { key: "date", label: "Date", type: "date", required: true },
        { key: "status", label: "Status", type: "text" },
      ]
    }).then(result => {
      toast({ title: "Import Complete", description: `Imported: ${result.imported}, Failed: ${result.failed}${result.errors.length > 0 ? ` (${result.errors.slice(0, 3).join("; ")})` : ""}`, variant: result.failed > 0 ? "destructive" : "default" });
      load();
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedRows(prev => { const next = new Set(prev); if (next.has(id)) { next.delete(id); } else { next.add(id); } return next; });
  };

  const getSupplierName = (id: string) => suppliers.find((s: any) => s.id === id)?.name || "—";

  const statusColor = (status: string) => {
    switch (status) {
      case "Draft": return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "Confirmed": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
      case "Received": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      default: return "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400";
    }
  };

  const colCount = isVatAuditor ? 8 : 9;

  // Dealer restriction - early return AFTER all hooks
  if (isDealer) {
    return (
      <div className="page-enter flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full"><CardContent className="p-8 text-center">
          <Lock className="w-12 h-12 mx-auto mb-4 text-red-500" />
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Access Restricted</h3>
          <p className="text-muted-foreground">Dealers cannot access Purchase Orders. Please contact your administrator.</p>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="page-enter space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Purchase Orders</h2>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={importCSV}><Upload className="w-4 h-4 mr-1" />Import CSV</Button>
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="w-4 h-4 mr-1" />Export CSV</Button>
          <Button variant="outline" size="sm" onClick={exportPDF}><FileDown className="w-4 h-4 mr-1" />Export PDF</Button>
          <Button size="sm" className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={openCreate}><Plus className="w-4 h-4 mr-1" />Create PO</Button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total POs", value: totalPOs, icon: ShoppingCart, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/30" },
          { label: "Total Value", value: fmt(totalValue, "currency"), icon: DollarSign, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/30" },
          { label: "Draft", value: draftCount, icon: FileText, color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-900/30" },
          { label: "Received", value: receivedCount, icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/30" },
        ].map((stat, i) => (
          <Card key={i} className="stat-mini-card"><CardContent className="p-3 flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${stat.bg} ${stat.color}`}><stat.icon className="w-4 h-4" /></div>
            <div><p className="text-xs text-muted-foreground">{stat.label}</p><p className="text-lg font-bold text-slate-900 dark:text-white">{stat.value}</p></div>
          </CardContent></Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search POs..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
            </div>
            <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
          </div>
          <div className="table-container overflow-auto max-h-[60vh] rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-10">+</TableHead>
                  <TableHead>PO Number</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Sub Total</TableHead>
                  {!isVatAuditor && <TableHead>VAT %</TableHead>}
                  <TableHead>VAT Amount</TableHead>
                  <TableHead>Grand Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-20 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={colCount} className="h-24 text-center"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={colCount} className="h-24 text-center text-muted-foreground">No purchase orders found</TableCell></TableRow>
                ) : filtered.map((item: any) => (
                  <React.Fragment key={item.id}>
                    <TableRow className="data-table-row hover:bg-muted/50">
                      <TableCell>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => toggleExpand(item.id)}>
                          {expandedRows.has(item.id) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        </Button>
                      </TableCell>
                      <TableCell className="font-mono font-medium text-slate-900 dark:text-white">{item.poNumber}</TableCell>
                      <TableCell>{onNavigate ? <span className="cursor-pointer text-blue-600 hover:underline" onClick={() => onNavigate('suppliers')}>{item.supplierName || getSupplierName(item.supplierId)}</span> : (item.supplierName || getSupplierName(item.supplierId))}</TableCell>
                      <TableCell>{fmtDate(item.date)}</TableCell>
                      <TableCell className="font-mono">{isVatAuditor ? "N/A (Audit Mode)" : fmt(item.subTotal, "currency")}</TableCell>
                      {!isVatAuditor && <TableCell className="font-mono">{item.vatPercentage || 0}%</TableCell>}
                      <TableCell className="font-mono">{fmt(item.vatAmount, "currency")}</TableCell>
                      <TableCell className="font-mono font-medium">{fmt(item.grandTotal, "currency")}</TableCell>
                      <TableCell><Badge className={statusColor(item.status)}>{item.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(item)}><Edit className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="sm" className="text-red-500" onClick={() => setDeleteItem(item)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedRows.has(item.id) && (
                      <TableRow>
                        <TableCell colSpan={colCount} className="bg-muted/30 p-3">
                          <div className="text-xs font-medium mb-2 text-slate-900 dark:text-white">Line Items</div>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Product</TableHead>
                                <TableHead>Qty</TableHead>
                                {!isVatAuditor && <TableHead>Rate</TableHead>}
                                <TableHead>Disc%</TableHead>
                                <TableHead>Disc Amt</TableHead>
                                <TableHead>VAT Amt</TableHead>
                                <TableHead>Total</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(item.lines || []).map((line: any, li: number) => (
                                <TableRow key={li}>
                                  <TableCell>{line.productName || line.productId || "—"}</TableCell>
                                  <TableCell className="font-mono">{line.qty}</TableCell>
                                  {!isVatAuditor && <TableCell className="font-mono">{fmt(line.rate, "currency")}</TableCell>}
                                  <TableCell className="font-mono">{line.discPercent}%</TableCell>
                                  <TableCell className="font-mono">{fmt(line.discAmt, "currency")}</TableCell>
                                  <TableCell className="font-mono">{fmt(line.vatAmt, "currency")}</TableCell>
                                  <TableCell className="font-mono font-medium">{fmt(line.total, "currency")}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">Showing {filtered.length} of {data.length} purchase orders</div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editItem ? "Edit" : "Create"} Purchase Order</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {/* Header Fields */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>PO Number</Label>
                <Input className="bg-muted cursor-not-allowed" value={formData.poNumber || ""} readOnly />
              </div>
              <div className="space-y-1.5">
                <Label>Supplier <span className="text-red-500">*</span></Label>
                <Select value={formData.supplierId || ""} onValueChange={v => setFormData({ ...formData, supplierId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select Supplier" /></SelectTrigger>
                  <SelectContent>{suppliers.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Date <span className="text-red-500">*</span></Label>
                <Input type="date" value={formData.date || ""} onChange={e => setFormData({ ...formData, date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Godown</Label>
                <Select value={formData.godownId || ""} onValueChange={v => setFormData({ ...formData, godownId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select Godown" /></SelectTrigger>
                  <SelectContent>{godowns.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={formData.status || "Draft"} onValueChange={v => setFormData({ ...formData, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Draft">Draft</SelectItem>
                    <SelectItem value="Confirmed">Confirmed</SelectItem>
                    <SelectItem value="Received">Received</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>VAT Percentage</Label>
                <Input type="number" value={formData.vatPercentage ?? 15} onChange={e => setFormData({ ...formData, vatPercentage: Number(e.target.value) })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={formData.notes || ""} onChange={e => setFormData({ ...formData, notes: e.target.value })} />
            </div>

            {/* Line Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-semibold">Line Items</Label>
                <Button variant="outline" size="sm" onClick={addLine}><Plus className="w-3 h-3 mr-1" />Add Line</Button>
              </div>
              <div className="overflow-auto rounded-md border max-h-60">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Product</TableHead>
                      <TableHead className="w-20">Qty</TableHead>
                      <TableHead className="w-24">Rate</TableHead>
                      <TableHead className="w-20">Disc%</TableHead>
                      <TableHead className="w-24">Disc Amt</TableHead>
                      <TableHead className="w-24">VAT Amt</TableHead>
                      <TableHead className="w-24">Total</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <Select value={line.productId || ""} onValueChange={v => {
                            const prod = products.find((p: any) => p.id === v);
                            updateLine(idx, "productId", v);
                            if (prod) updateLine(idx, "rate", prod.costPrice || prod.salePrice || 0);
                          }}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Product" /></SelectTrigger>
                            <SelectContent>{products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell><Input type="number" className="h-8 text-xs w-16" value={line.qty} onChange={e => updateLine(idx, "qty", Number(e.target.value))} /></TableCell>
                        <TableCell><Input type="number" className="h-8 text-xs w-20" value={line.rate} onChange={e => updateLine(idx, "rate", Number(e.target.value))} /></TableCell>
                        <TableCell><Input type="number" className="h-8 text-xs w-16" value={line.discPercent} onChange={e => updateLine(idx, "discPercent", Number(e.target.value))} /></TableCell>
                        <TableCell className="font-mono text-xs">{fmt(line.discAmt, "currency")}</TableCell>
                        <TableCell className="font-mono text-xs">{fmt(line.vatAmt, "currency")}</TableCell>
                        <TableCell className="font-mono text-xs font-medium">{fmt(line.total, "currency")}</TableCell>
                        <TableCell>{lines.length > 1 && <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => removeLine(idx)}><X className="w-3 h-3" /></Button>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Summary */}
            <Card className="bg-muted/30">
              <CardContent className="p-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div><span className="text-muted-foreground">Sub Total:</span><p className="font-mono font-bold text-slate-900 dark:text-white">{fmt(subTotal, "currency")}</p></div>
                  <div><span className="text-muted-foreground">Discount:</span><p className="font-mono font-bold text-red-600">{fmt(totalDisc, "currency")}</p></div>
                  <div><span className="text-muted-foreground">VAT ({formData.vatPercentage}%):</span><p className="font-mono font-bold text-slate-900 dark:text-white">{fmt(totalVat, "currency")}</p></div>
                  <div><span className="text-muted-foreground">Grand Total:</span><p className="font-mono font-bold text-lg text-slate-900 dark:text-white">{fmt(grandTotal, "currency")}</p></div>
                </div>
              </CardContent>
            </Card>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={handleSave} disabled={saving}>
              {saving ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />}{editItem ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-500" />Confirm Deactivate</DialogTitle></DialogHeader>
          <DialogDescription>Deactivate Purchase Order {deleteItem?.poNumber}? It will be marked as inactive but preserved in the system.</DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteItem(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Deactivate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// SALES ORDERS PAGE - Dedicated Transaction Page
// ============================================================

function SalesOrdersPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { toast } = useToast();
  const { isVatAuditor, user } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Dynamic options
  const [customers, setCustomers] = useState<any[]>([]);
  const [godowns, setGodowns] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [paymentOptions, setPaymentOptions] = useState<any[]>([]);

  // Form state
  const [formData, setFormData] = useState<Record<string, any>>({ customerId: "", date: new Date().toISOString().split("T")[0], godownId: "", paymentOptionId: "", notes: "", status: "Draft", discount: 0, vatPercentage: 15 });
  const [lines, setLines] = useState<any[]>([{ productId: "", qty: 1, rate: 0, discPercent: 0, discAmt: 0, vatAmt: 0, total: 0 }]);

  // SR role check
  const isSR = user?.role === "sr";

  // Selected customer info for credit limit
  const selectedCustomer = useMemo(() => {
    if (!formData.customerId) return null;
    return customers.find((c: any) => c.id === formData.customerId);
  }, [formData.customerId, customers]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/sales-orders");
      setData(Array.isArray(res) ? res : res.data || []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const loadOptions = useCallback(async () => {
    try {
      const [cRes, gRes, pRes, poRes] = await Promise.all([
        apiFetch("/api/customers").catch(() => []),
        apiFetch("/api/godowns").catch(() => []),
        apiFetch("/api/products").catch(() => []),
        apiFetch("/api/payment-options").catch(() => []),
      ]);
      setCustomers(Array.isArray(cRes) ? cRes : cRes.data || []);
      setGodowns(Array.isArray(gRes) ? gRes : gRes.data || []);
      setProducts(Array.isArray(pRes) ? pRes : pRes.data || []);
      setPaymentOptions((Array.isArray(poRes) ? poRes : poRes.data || []).filter((p: any) => p.status !== "INACTIVE"));
    } catch { /* silent */ }
  }, []);

  const filtered = useMemo(() => {
    if (!search) return data;
    const s = search.toLowerCase();
    return data.filter((item: any) =>
      item.invoiceNo?.toLowerCase().includes(s) ||
      item.customerName?.toLowerCase().includes(s) ||
      item.status?.toLowerCase().includes(s)
    );
  }, [data, search]);

  // Stats
  const totalSales = data.length;
  const totalValue = data.reduce((s: number, d: any) => s + (d.grandTotal || 0), 0);
  const draftCount = data.filter((d: any) => d.status === "Draft").length;
  const deliveredCount = data.filter((d: any) => d.status === "Delivered").length;

  // Line calculations
  const calcLine = (line: any) => {
    const qty = Number(line.qty) || 0;
    const rate = Number(line.rate) || 0;
    const discPercent = Number(line.discPercent) || 0;
    const discAmt = rate * qty * discPercent / 100;
    const afterDisc = rate * qty - discAmt;
    const vatPct = Number(formData.vatPercentage) || 0;
    const vatAmt = afterDisc * vatPct / 100;
    const total = afterDisc + vatAmt;
    return { ...line, discAmt, vatAmt, total };
  };

  const updateLine = (idx: number, field: string, value: any) => {
    setLines(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      next[idx] = calcLine(next[idx]);
      return next;
    });
  };

  const addLine = () => {
    setLines(prev => [...prev, { productId: "", qty: 1, rate: 0, discPercent: 0, discAmt: 0, vatAmt: 0, total: 0 }]);
  };

  const removeLine = (idx: number) => {
    setLines(prev => prev.filter((_, i) => i !== idx));
  };

  // Summary
  const subTotal = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0);
  const totalDisc = lines.reduce((s, l) => s + (Number(l.discAmt) || 0), 0);
  const totalVat = lines.reduce((s, l) => s + (Number(l.vatAmt) || 0), 0);
  const grandTotal = subTotal - totalDisc + totalVat;

  // Credit limit check
  const creditExceeded = useMemo(() => {
    if (!selectedCustomer) return false;
    const limit = Number(selectedCustomer.creditLimit) || 0;
    const outstanding = Number(selectedCustomer.openingBalance) || 0;
    return limit > 0 && (grandTotal + outstanding) > limit;
  }, [selectedCustomer, grandTotal]);

  const openCreate = () => {
    const nextNum = data.length > 0 ? String(Math.max(...data.map((d: any) => parseInt(d.invoiceNo?.replace("SO-", "") || "0", 10) || 0)) + 1).padStart(5, "0") : "00001";
    setFormData({ customerId: "", date: new Date().toISOString().split("T")[0], godownId: "", paymentOptionId: "", notes: "", status: "Draft", discount: 0, vatPercentage: 15, invoiceNo: `SO-${nextNum}` });
    setLines([{ productId: "", qty: 1, rate: 0, discPercent: 0, discAmt: 0, vatAmt: 0, total: 0 }]);
    setEditItem(null);
    setShowForm(true);
    loadOptions();
  };

  const openEdit = (item: any) => {
    setFormData({
      customerId: item.customerId || "",
      date: item.date ? item.date.split("T")[0] : "",
      godownId: item.godownId || "",
      paymentOptionId: item.paymentOptionId || "",
      notes: item.notes || "",
      status: item.status || "Draft",
      discount: item.discount || 0,
      vatPercentage: item.vatPercentage || 15,
      invoiceNo: item.invoiceNo || "",
    });
    setLines(item.lines && item.lines.length > 0 ? item.lines.map((l: any) => ({
      productId: l.productId, qty: l.quantity || 1, rate: l.rate || 0, discPercent: l.discountPercent || 0, discAmt: l.discountAmount || 0, vatAmt: l.vatAmount || 0, total: l.total || 0
    })) : [{ productId: "", qty: 1, rate: 0, discPercent: 0, discAmt: 0, vatAmt: 0, total: 0 }]);
    setEditItem(item);
    setShowForm(true);
    loadOptions();
  };

  const handleSave = async () => {
    if (!formData.customerId || !formData.date) {
      toast({ title: "Error", description: "Customer and Date are required", variant: "destructive" });
      return;
    }
    const validLines = lines.filter(l => l.productId);
    if (validLines.length === 0) {
      toast({ title: "Error", description: "Add at least one line item", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        customerId: formData.customerId,
        date: formData.date,
        godownId: formData.godownId || null,
        paymentOptionId: formData.paymentOptionId || null,
        notes: formData.notes,
        status: formData.status,
        discount: totalDisc,
        vatPercentage: Number(formData.vatPercentage) || 0,
        subTotal,
        vatAmount: totalVat,
        grandTotal,
        lines: validLines.map(l => ({
          productId: l.productId,
          quantity: Number(l.qty) || 0,
          rate: Number(l.rate) || 0,
          discountPercent: Number(l.discPercent) || 0,
          discountAmount: Number(l.discAmt) || 0,
          vatAmount: Number(l.vatAmt) || 0,
          total: Number(l.total) || 0,
        })),
      };
      if (editItem) {
        await apiFetch(`/api/sales-orders/${editItem.id}`, { method: "PUT", body: JSON.stringify(payload) });
        toast({ title: "Updated", description: "Sales Order updated" });
      } else {
        await apiFetch("/api/sales-orders", { method: "POST", body: JSON.stringify(payload) });
        toast({ title: "Created", description: "Sales Order created" });
      }
      setShowForm(false); load();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    try {
      await apiFetch(`/api/sales-orders/${deleteItem.id}`, { method: "DELETE" });
      toast({ title: "Deactivated" }); setDeleteItem(null); load();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const exportCSV = () => {
    const headers = ["Invoice No", "Customer", "Date", "Sub Total", "Discount", "VAT %", "VAT Amount", "Grand Total", "Payment", "Status"];
    const rows = filtered.map((item: any) => [item.invoiceNo, item.customerName || "—", fmtDate(item.date), item.subTotal || 0, item.discount || 0, item.vatPercentage || 0, item.vatAmount || 0, item.grandTotal || 0, item.paymentOptionId || "—", item.status].map(String));
    try { exportToCSVSimple("Sales Orders", headers, rows); toast({ title: "Exported", description: "Sales Orders exported to CSV" }); } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const exportPDF = () => {
    const headers = ["Invoice No", "Customer", "Date", "Sub Total", "Discount", "VAT %", "VAT Amount", "Grand Total", "Status"];
    const body = filtered.map((item: any) => [item.invoiceNo, item.customerName || "—", fmtDate(item.date), fmt(item.subTotal, "currency"), fmt(item.discount, "currency"), String(item.vatPercentage || 0), fmt(item.vatAmount, "currency"), fmt(item.grandTotal, "currency"), item.status]);
    try { exportToPDFSimple("Sales Orders", headers, body, "landscape"); toast({ title: "Exported", description: "Sales Orders exported to PDF" }); } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const importCSV = () => {
    importFromCSV({
      apiPath: "/api/sales-orders",
      formFields: [
        { key: "invoiceNo", label: "Invoice No", type: "text", required: true },
        { key: "customerId", label: "Customer", type: "text", required: true },
        { key: "date", label: "Date", type: "date", required: true },
        { key: "status", label: "Status", type: "text" },
      ]
    }).then(result => {
      toast({ title: "Import Complete", description: `Imported: ${result.imported}, Failed: ${result.failed}${result.errors.length > 0 ? ` (${result.errors.slice(0, 3).join("; ")})` : ""}`, variant: result.failed > 0 ? "destructive" : "default" });
      load();
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedRows(prev => { const next = new Set(prev); if (next.has(id)) { next.delete(id); } else { next.add(id); } return next; });
  };

  const getCustomerName = (id: string) => customers.find((c: any) => c.id === id)?.name || "—";

  const statusColor = (status: string) => {
    switch (status) {
      case "Draft": return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "Confirmed": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
      case "Delivered": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      default: return "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400";
    }
  };

  return (
    <div className="page-enter space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Sales Orders</h2>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={importCSV}><Upload className="w-4 h-4 mr-1" />Import CSV</Button>
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="w-4 h-4 mr-1" />Export CSV</Button>
          <Button variant="outline" size="sm" onClick={exportPDF}><FileDown className="w-4 h-4 mr-1" />Export PDF</Button>
          <Button size="sm" className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={openCreate}><Plus className="w-4 h-4 mr-1" />Create Sales Order</Button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Sales", value: totalSales, icon: Receipt, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/30" },
          { label: "Total Value", value: fmt(totalValue, "currency"), icon: DollarSign, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/30" },
          { label: "Draft", value: draftCount, icon: FileText, color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-900/30" },
          { label: "Delivered", value: deliveredCount, icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/30" },
        ].map((stat, i) => (
          <Card key={i} className="stat-mini-card"><CardContent className="p-3 flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${stat.bg} ${stat.color}`}><stat.icon className="w-4 h-4" /></div>
            <div><p className="text-xs text-muted-foreground">{stat.label}</p><p className="text-lg font-bold text-slate-900 dark:text-white">{stat.value}</p></div>
          </CardContent></Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search sales orders..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
            </div>
            <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
          </div>
          <div className="table-container overflow-auto max-h-[60vh] rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-10">+</TableHead>
                  <TableHead>Invoice No</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Sub Total</TableHead>
                  <TableHead>Discount</TableHead>
                  {isVatAuditor && <TableHead className="bg-amber-50 dark:bg-amber-900/20">VAT %</TableHead>}
                  <TableHead className={isVatAuditor ? "bg-amber-50 dark:bg-amber-900/20" : ""}>VAT Amount</TableHead>
                  <TableHead>Grand Total</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-20 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={isVatAuditor ? 12 : 11} className="h-24 text-center"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={isVatAuditor ? 12 : 11} className="h-24 text-center text-muted-foreground">No sales orders found</TableCell></TableRow>
                ) : filtered.map((item: any) => (
                  <React.Fragment key={item.id}>
                    <TableRow className="data-table-row hover:bg-muted/50">
                      <TableCell>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => toggleExpand(item.id)}>
                          {expandedRows.has(item.id) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        </Button>
                      </TableCell>
                      <TableCell className="font-mono font-medium text-slate-900 dark:text-white">{item.invoiceNo}</TableCell>
                      <TableCell>{onNavigate ? <span className="cursor-pointer text-blue-600 hover:underline" onClick={() => onNavigate('customers')}>{item.customerName || getCustomerName(item.customerId)}</span> : (item.customerName || getCustomerName(item.customerId))}</TableCell>
                      <TableCell>{fmtDate(item.date)}</TableCell>
                      <TableCell className="font-mono">{fmt(item.subTotal, "currency")}</TableCell>
                      <TableCell className="font-mono">{fmt(item.discount, "currency")}</TableCell>
                      {isVatAuditor && <TableCell className="font-mono bg-amber-50 dark:bg-amber-900/20">{item.vatPercentage || 0}%</TableCell>}
                      <TableCell className={`font-mono ${isVatAuditor ? "bg-amber-50 dark:bg-amber-900/20 font-bold" : ""}`}>{fmt(item.vatAmount, "currency")}</TableCell>
                      <TableCell className="font-mono font-medium">{fmt(item.grandTotal, "currency")}</TableCell>
                      <TableCell>{item.paymentOptionId || "—"}</TableCell>
                      <TableCell><Badge className={statusColor(item.status)}>{item.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(item)}><Edit className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="sm" className="text-red-500" onClick={() => setDeleteItem(item)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedRows.has(item.id) && (
                      <TableRow>
                        <TableCell colSpan={isVatAuditor ? 12 : 11} className="bg-muted/30 p-3">
                          <div className="text-xs font-medium mb-2 text-slate-900 dark:text-white">Line Items</div>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Product</TableHead>
                                <TableHead>Qty</TableHead>
                                <TableHead>Rate</TableHead>
                                <TableHead>Disc%</TableHead>
                                <TableHead>Disc Amt</TableHead>
                                <TableHead>VAT Amt</TableHead>
                                <TableHead>Total</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(item.lines || []).map((line: any, li: number) => (
                                <TableRow key={li}>
                                  <TableCell>{line.productName || line.productId || "—"}</TableCell>
                                  <TableCell className="font-mono">{line.qty}</TableCell>
                                  <TableCell className="font-mono">{fmt(line.rate, "currency")}</TableCell>
                                  <TableCell className="font-mono">{line.discPercent}%</TableCell>
                                  <TableCell className="font-mono">{fmt(line.discAmt, "currency")}</TableCell>
                                  <TableCell className="font-mono">{fmt(line.vatAmt, "currency")}</TableCell>
                                  <TableCell className="font-mono font-medium">{fmt(line.total, "currency")}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">Showing {filtered.length} of {data.length} sales orders</div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editItem ? "Edit" : "Create"} Sales Order</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {/* Header Fields */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Invoice No</Label>
                <Input className="bg-muted cursor-not-allowed" value={formData.invoiceNo || ""} readOnly />
              </div>
              <div className="space-y-1.5">
                <Label>Customer <span className="text-red-500">*</span></Label>
                <Select value={formData.customerId || ""} onValueChange={v => setFormData({ ...formData, customerId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select Customer" /></SelectTrigger>
                  <SelectContent>{customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Date <span className="text-red-500">*</span></Label>
                <Input type="date" value={formData.date || ""} onChange={e => setFormData({ ...formData, date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Godown</Label>
                <Select value={formData.godownId || ""} onValueChange={v => setFormData({ ...formData, godownId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select Godown" /></SelectTrigger>
                  <SelectContent>{godowns.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Payment Option</Label>
                <Select value={formData.paymentOptionId || ""} onValueChange={v => setFormData({ ...formData, paymentOptionId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select Payment" /></SelectTrigger>
                  <SelectContent>{paymentOptions.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={formData.status || "Draft"} onValueChange={v => setFormData({ ...formData, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Draft">Draft</SelectItem>
                    <SelectItem value="Confirmed">Confirmed</SelectItem>
                    <SelectItem value="Delivered">Delivered</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>VAT Percentage</Label>
                <Input type="number" value={formData.vatPercentage ?? 15} onChange={e => setFormData({ ...formData, vatPercentage: Number(e.target.value) })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={formData.notes || ""} onChange={e => setFormData({ ...formData, notes: e.target.value })} />
            </div>

            {/* Credit Limit Info */}
            {selectedCustomer && (
              <Card className={creditExceeded ? "border-red-500 bg-red-50 dark:bg-red-900/20" : "bg-muted/30"}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-3 text-sm">
                    {creditExceeded && <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />}
                    <div className="flex flex-wrap gap-4">
                      <span>Credit Limit: <strong className="font-mono">{fmt(selectedCustomer.creditLimit, "currency")}</strong></span>
                      <span>Outstanding: <strong className="font-mono">{fmt(selectedCustomer.openingBalance, "currency")}</strong></span>
                      <span>This Order: <strong className="font-mono">{fmt(grandTotal, "currency")}</strong></span>
                    </div>
                  </div>
                  {creditExceeded && <p className="text-red-600 text-xs mt-1 font-medium">⚠ Grand Total + Outstanding exceeds Credit Limit!</p>}
                </CardContent>
              </Card>
            )}

            {/* Line Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-semibold">Line Items</Label>
                <Button variant="outline" size="sm" onClick={addLine}><Plus className="w-3 h-3 mr-1" />Add Line</Button>
              </div>
              <div className="overflow-auto rounded-md border max-h-60">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Product</TableHead>
                      <TableHead className="w-20">Qty</TableHead>
                      <TableHead className="w-24">Rate</TableHead>
                      <TableHead className="w-20">Disc%</TableHead>
                      <TableHead className="w-24">Disc Amt</TableHead>
                      <TableHead className="w-24">VAT Amt</TableHead>
                      <TableHead className="w-24">Total</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <Select value={line.productId || ""} onValueChange={v => {
                            const prod = products.find((p: any) => p.id === v);
                            updateLine(idx, "productId", v);
                            if (prod && (isSR || !editItem)) updateLine(idx, "rate", prod.salePrice || 0);
                            else if (prod) updateLine(idx, "rate", prod.salePrice || 0);
                          }}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Product" /></SelectTrigger>
                            <SelectContent>{products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell><Input type="number" className="h-8 text-xs w-16" value={line.qty} onChange={e => updateLine(idx, "qty", Number(e.target.value))} /></TableCell>
                        <TableCell>
                          {isSR ? (
                            <Input type="number" className="h-8 text-xs w-20 bg-muted cursor-not-allowed" value={line.rate} readOnly />
                          ) : (
                            <Input type="number" className="h-8 text-xs w-20" value={line.rate} onChange={e => updateLine(idx, "rate", Number(e.target.value))} />
                          )}
                        </TableCell>
                        <TableCell><Input type="number" className="h-8 text-xs w-16" value={line.discPercent} onChange={e => updateLine(idx, "discPercent", Number(e.target.value))} /></TableCell>
                        <TableCell className="font-mono text-xs">{fmt(line.discAmt, "currency")}</TableCell>
                        <TableCell className="font-mono text-xs">{fmt(line.vatAmt, "currency")}</TableCell>
                        <TableCell className="font-mono text-xs font-medium">{fmt(line.total, "currency")}</TableCell>
                        <TableCell>{lines.length > 1 && <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => removeLine(idx)}><X className="w-3 h-3" /></Button>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {isSR && <p className="text-xs text-muted-foreground mt-1">🔒 Rate is locked to product MRP for SR role</p>}
            </div>

            {/* Summary */}
            <Card className="bg-muted/30">
              <CardContent className="p-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div><span className="text-muted-foreground">Sub Total:</span><p className="font-mono font-bold text-slate-900 dark:text-white">{fmt(subTotal, "currency")}</p></div>
                  <div><span className="text-muted-foreground">Discount:</span><p className="font-mono font-bold text-red-600">{fmt(totalDisc, "currency")}</p></div>
                  <div><span className="text-muted-foreground">VAT ({formData.vatPercentage}%):</span><p className="font-mono font-bold text-slate-900 dark:text-white">{fmt(totalVat, "currency")}</p></div>
                  <div><span className="text-muted-foreground">Grand Total:</span><p className="font-mono font-bold text-lg text-slate-900 dark:text-white">{fmt(grandTotal, "currency")}</p></div>
                </div>
              </CardContent>
            </Card>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={handleSave} disabled={saving}>
              {saving ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />}{editItem ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-500" />Confirm Deactivate</DialogTitle></DialogHeader>
          <DialogDescription>Deactivate Sales Order {deleteItem?.invoiceNo}? It will be marked as inactive but preserved in the system.</DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteItem(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Deactivate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// HIRE SALES PAGE - Dedicated Transaction Page
// ============================================================

function HireSalesPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { toast } = useToast();
  const { isVatAuditor, user } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Dynamic options
  const [customers, setCustomers] = useState<any[]>([]);
  const [godowns, setGodowns] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  // Form state
  const [formData, setFormData] = useState<Record<string, any>>({ customerId: "", date: new Date().toISOString().split("T")[0], godownId: "", notes: "", downPayment: 0, duration: 12, hireRate: 0, vatPercentage: 15 });
  const [lines, setLines] = useState<any[]>([{ productId: "", qty: 1, rate: 0, discPercent: 0, discAmt: 0, vatAmt: 0, total: 0 }]);

  // SR role check
  const isSR = user?.role === "sr";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/hire-sales");
      setData(Array.isArray(res) ? res : res.data || []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const loadOptions = useCallback(async () => {
    try {
      const [cRes, gRes, pRes] = await Promise.all([
        apiFetch("/api/customers").catch(() => []),
        apiFetch("/api/godowns").catch(() => []),
        apiFetch("/api/products").catch(() => []),
      ]);
      setCustomers(Array.isArray(cRes) ? cRes : cRes.data || []);
      setGodowns(Array.isArray(gRes) ? gRes : gRes.data || []);
      setProducts(Array.isArray(pRes) ? pRes : pRes.data || []);
    } catch { /* silent */ }
  }, []);

  const filtered = useMemo(() => {
    if (!search) return data;
    const s = search.toLowerCase();
    return data.filter((item: any) =>
      item.invoiceNo?.toLowerCase().includes(s) ||
      item.customerName?.toLowerCase().includes(s) ||
      item.currentStatus?.toLowerCase().includes(s)
    );
  }, [data, search]);

  // Stats
  const totalHire = data.length;
  const activeCount = data.filter((d: any) => d.currentStatus === "Active" || d.status === "Active").length;
  const totalValue = data.reduce((s: number, d: any) => s + (d.grandTotal || 0), 0);
  const overdueCount = data.filter((d: any) => d.currentStatus === "Overdue" || d.status === "Overdue").length;

  // Line calculations
  const calcLine = (line: any) => {
    const qty = Number(line.qty) || 0;
    const rate = Number(line.rate) || 0;
    const discPercent = Number(line.discPercent) || 0;
    const discAmt = rate * qty * discPercent / 100;
    const afterDisc = rate * qty - discAmt;
    const vatPct = Number(formData.vatPercentage) || 0;
    const vatAmt = afterDisc * vatPct / 100;
    const total = afterDisc + vatAmt;
    return { ...line, discAmt, vatAmt, total };
  };

  const updateLine = (idx: number, field: string, value: any) => {
    setLines(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      next[idx] = calcLine(next[idx]);
      return next;
    });
  };

  const addLine = () => {
    setLines(prev => [...prev, { productId: "", qty: 1, rate: 0, discPercent: 0, discAmt: 0, vatAmt: 0, total: 0 }]);
  };

  const removeLine = (idx: number) => {
    setLines(prev => prev.filter((_, i) => i !== idx));
  };

  // Summary
  const subTotal = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0);
  const totalDisc = lines.reduce((s, l) => s + (Number(l.discAmt) || 0), 0);
  const totalVat = lines.reduce((s, l) => s + (Number(l.vatAmt) || 0), 0);
  const grandTotal = subTotal - totalDisc + totalVat;
  const downPayment = Number(formData.downPayment) || 0;
  const duration = Number(formData.duration) || 1;
  const balanceAfterDP = grandTotal - downPayment;
  const monthlyInstallment = balanceAfterDP > 0 ? balanceAfterDP / duration : 0;

  // Installment schedule preview
  const installmentSchedule = useMemo(() => {
    if (duration <= 0 || monthlyInstallment <= 0) return [];
    const schedule: { installmentNo: number; dueDate: string; amount: number; status: string }[] = [];
    const orderDate = formData.date ? new Date(formData.date) : new Date();
    for (let i = 1; i <= duration; i++) {
      const dueDate = new Date(orderDate);
      dueDate.setMonth(dueDate.getMonth() + i);
      schedule.push({
        installmentNo: i,
        dueDate: dueDate.toISOString().split("T")[0],
        amount: monthlyInstallment,
        status: "Pending",
      });
    }
    return schedule;
  }, [duration, monthlyInstallment, formData.date]);

  const openCreate = () => {
    const nextNum = data.length > 0 ? String(Math.max(...data.map((d: any) => parseInt(d.invoiceNo?.replace("HIR-", "") || "0", 10) || 0)) + 1).padStart(5, "0") : "00001";
    setFormData({ customerId: "", date: new Date().toISOString().split("T")[0], godownId: "", notes: "", downPayment: 0, duration: 12, hireRate: 0, vatPercentage: 15, invoiceNo: `HIR-${nextNum}` });
    setLines([{ productId: "", qty: 1, rate: 0, discPercent: 0, discAmt: 0, vatAmt: 0, total: 0 }]);
    setEditItem(null);
    setShowForm(true);
    loadOptions();
  };

  const openEdit = (item: any) => {
    setFormData({
      customerId: item.customerId || "",
      date: item.date ? item.date.split("T")[0] : "",
      godownId: item.godownId || "",
      notes: item.notes || "",
      downPayment: item.downPayment || 0,
      duration: item.duration || 12,
      hireRate: item.hireRate || 0,
      vatPercentage: item.vatPercentage || 15,
      invoiceNo: item.invoiceNo || "",
    });
    setLines(item.lines && item.lines.length > 0 ? item.lines.map((l: any) => ({
      productId: l.productId, qty: l.quantity || 1, rate: l.rate || 0, discPercent: l.discountPercent || 0, discAmt: l.discountAmount || 0, total: l.total || 0
    })) : [{ productId: "", qty: 1, rate: 0, discPercent: 0, discAmt: 0, vatAmt: 0, total: 0 }]);
    setEditItem(item);
    setShowForm(true);
    loadOptions();
  };

  const handleSave = async () => {
    if (!formData.customerId || !formData.date) {
      toast({ title: "Error", description: "Customer and Date are required", variant: "destructive" });
      return;
    }
    const validLines = lines.filter(l => l.productId);
    if (validLines.length === 0) {
      toast({ title: "Error", description: "Add at least one line item", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        customerId: formData.customerId,
        date: formData.date,
        godownId: formData.godownId || null,
        notes: formData.notes,
        downPayment,
        duration,
        hireRate: Number(formData.hireRate) || 0,
        vatPercentage: Number(formData.vatPercentage) || 0,
        subTotal,
        vatAmount: totalVat,
        grandTotal,
        balanceAfterDP,
        installmentAmount: monthlyInstallment,
        lines: validLines.map(l => ({
          productId: l.productId,
          quantity: Number(l.qty) || 0,
          rate: Number(l.rate) || 0,
          discountPercent: Number(l.discPercent) || 0,
          discountAmount: Number(l.discAmt) || 0,
          total: Number(l.total) || 0,
        })),
      };
      if (editItem) {
        await apiFetch(`/api/hire-sales/${editItem.id}`, { method: "PUT", body: JSON.stringify(payload) });
        toast({ title: "Updated", description: "Hire Sale updated" });
      } else {
        await apiFetch("/api/hire-sales", { method: "POST", body: JSON.stringify(payload) });
        toast({ title: "Created", description: "Hire Sale created" });
      }
      setShowForm(false); load();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    try {
      await apiFetch(`/api/hire-sales/${deleteItem.id}`, { method: "DELETE" });
      toast({ title: "Deactivated" }); setDeleteItem(null); load();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const exportCSV = () => {
    const headers = ["Invoice No", "Customer", "Date", "Sub Total", "Down Payment", "Grand Total", "Duration", "Installment Amt", "Balance", "Next Payment", "Status"];
    const rows = filtered.map((item: any) => [item.invoiceNo, item.customerName || "—", fmtDate(item.date), item.subTotal || 0, item.downPayment || 0, item.grandTotal || 0, item.duration || 0, item.installmentAmount || 0, item.balanceAfterDP || 0, item.nextPaymentDate || "—", item.currentStatus || item.status].map(String));
    try { exportToCSVSimple("Hire Sales", headers, rows); toast({ title: "Exported", description: "Hire Sales exported to CSV" }); } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const exportPDF = () => {
    const headers = ["Invoice No", "Customer", "Date", "Down Payment", "Grand Total", "Duration", "Installment", "Status"];
    const body = filtered.map((item: any) => [item.invoiceNo, item.customerName || "—", fmtDate(item.date), fmt(item.downPayment, "currency"), fmt(item.grandTotal, "currency"), String(item.duration || 0), fmt(item.installmentAmount, "currency"), item.currentStatus || item.status]);
    try { exportToPDFSimple("Hire Sales", headers, body, "landscape"); toast({ title: "Exported", description: "Hire Sales exported to PDF" }); } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const importCSV = () => {
    importFromCSV({
      apiPath: "/api/hire-sales",
      formFields: [
        { key: "invoiceNo", label: "Invoice No", type: "text", required: true },
        { key: "customerId", label: "Customer", type: "text", required: true },
        { key: "date", label: "Date", type: "date", required: true },
        { key: "downPayment", label: "Down Payment", type: "number" },
        { key: "duration", label: "Duration", type: "number" },
      ]
    }).then(result => {
      toast({ title: "Import Complete", description: `Imported: ${result.imported}, Failed: ${result.failed}${result.errors.length > 0 ? ` (${result.errors.slice(0, 3).join("; ")})` : ""}`, variant: result.failed > 0 ? "destructive" : "default" });
      load();
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedRows(prev => { const next = new Set(prev); if (next.has(id)) { next.delete(id); } else { next.add(id); } return next; });
  };

  const getCustomerName = (id: string) => customers.find((c: any) => c.id === id)?.name || "—";

  const statusColor = (status: string) => {
    switch (status) {
      case "Active": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      case "Completed": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
      case "Overdue": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
      case "Draft": return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
      default: return "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400";
    }
  };

  return (
    <div className="page-enter space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Hire Sales</h2>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={importCSV}><Upload className="w-4 h-4 mr-1" />Import CSV</Button>
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="w-4 h-4 mr-1" />Export CSV</Button>
          <Button variant="outline" size="sm" onClick={exportPDF}><FileDown className="w-4 h-4 mr-1" />Export PDF</Button>
          <Button size="sm" className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={openCreate}><Plus className="w-4 h-4 mr-1" />Create Hire Sale</Button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Hire", value: totalHire, icon: DollarSign, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/30" },
          { label: "Active", value: activeCount, icon: CheckCircle, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/30" },
          { label: "Total Value", value: fmt(totalValue, "currency"), icon: Banknote, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/30" },
          { label: "Overdue", value: overdueCount, icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50 dark:bg-red-900/30" },
        ].map((stat, i) => (
          <Card key={i} className="stat-mini-card"><CardContent className="p-3 flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${stat.bg} ${stat.color}`}><stat.icon className="w-4 h-4" /></div>
            <div><p className="text-xs text-muted-foreground">{stat.label}</p><p className="text-lg font-bold text-slate-900 dark:text-white">{stat.value}</p></div>
          </CardContent></Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search hire sales..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
            </div>
            <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
          </div>
          <div className="table-container overflow-auto max-h-[60vh] rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-10">+</TableHead>
                  <TableHead>Invoice No</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Sub Total</TableHead>
                  <TableHead>Down Payment</TableHead>
                  <TableHead>Grand Total</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Installment Amt</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Next Payment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-20 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={13} className="h-24 text-center"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={13} className="h-24 text-center text-muted-foreground">No hire sales found</TableCell></TableRow>
                ) : filtered.map((item: any) => (
                  <React.Fragment key={item.id}>
                    <TableRow className="data-table-row hover:bg-muted/50">
                      <TableCell>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => toggleExpand(item.id)}>
                          {expandedRows.has(item.id) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        </Button>
                      </TableCell>
                      <TableCell className="font-mono font-medium text-slate-900 dark:text-white">{item.invoiceNo}</TableCell>
                      <TableCell>{onNavigate ? <span className="cursor-pointer text-blue-600 hover:underline" onClick={() => onNavigate('customers')}>{item.customerName || getCustomerName(item.customerId)}</span> : (item.customerName || getCustomerName(item.customerId))}</TableCell>
                      <TableCell>{fmtDate(item.date)}</TableCell>
                      <TableCell className="font-mono">{fmt(item.subTotal, "currency")}</TableCell>
                      <TableCell className="font-mono">{fmt(item.downPayment, "currency")}</TableCell>
                      <TableCell className="font-mono font-medium">{fmt(item.grandTotal, "currency")}</TableCell>
                      <TableCell>{item.duration || 0} mo</TableCell>
                      <TableCell className="font-mono">{fmt(item.installmentAmount, "currency")}</TableCell>
                      <TableCell className="font-mono">{fmt(item.balanceAfterDP, "currency")}</TableCell>
                      <TableCell>{item.nextPaymentDate ? fmtDate(item.nextPaymentDate) : "—"}</TableCell>
                      <TableCell><Badge className={statusColor(item.currentStatus || item.status)}>{item.currentStatus || item.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(item)}><Edit className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="sm" className="text-red-500" onClick={() => setDeleteItem(item)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedRows.has(item.id) && (
                      <TableRow>
                        <TableCell colSpan={13} className="bg-muted/30 p-3">
                          {/* Line Items */}
                          <div className="text-xs font-medium mb-2 text-slate-900 dark:text-white">Line Items</div>
                          <Table className="mb-3">
                            <TableHeader>
                              <TableRow>
                                <TableHead>Product</TableHead>
                                <TableHead>Qty</TableHead>
                                <TableHead>Rate</TableHead>
                                <TableHead>Disc%</TableHead>
                                <TableHead>Disc Amt</TableHead>
                                <TableHead>VAT Amt</TableHead>
                                <TableHead>Total</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(item.lines || []).map((line: any, li: number) => (
                                <TableRow key={li}>
                                  <TableCell>{line.productName || line.productId || "—"}</TableCell>
                                  <TableCell className="font-mono">{line.qty}</TableCell>
                                  <TableCell className="font-mono">{fmt(line.rate, "currency")}</TableCell>
                                  <TableCell className="font-mono">{line.discPercent}%</TableCell>
                                  <TableCell className="font-mono">{fmt(line.discAmt, "currency")}</TableCell>
                                  <TableCell className="font-mono">{fmt(line.vatAmt, "currency")}</TableCell>
                                  <TableCell className="font-mono font-medium">{fmt(line.total, "currency")}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                          {/* Installment Schedule */}
                          {(item.installments || []).length > 0 && (
                            <>
                              <div className="text-xs font-medium mb-2 text-slate-900 dark:text-white">Installment Schedule</div>
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Installment #</TableHead>
                                    <TableHead>Due Date</TableHead>
                                    <TableHead>Amount</TableHead>
                                    <TableHead>Status</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {item.installments.map((inst: any, ii: number) => (
                                    <TableRow key={ii}>
                                      <TableCell>{inst.installmentNo || ii + 1}</TableCell>
                                      <TableCell>{fmtDate(inst.dueDate)}</TableCell>
                                      <TableCell className="font-mono">{fmt(inst.amount, "currency")}</TableCell>
                                      <TableCell>
                                        <Badge className={inst.status === "Paid" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : inst.status === "Overdue" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"}>
                                          {inst.status || "Pending"}
                                        </Badge>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">Showing {filtered.length} of {data.length} hire sales</div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editItem ? "Edit" : "Create"} Hire Sale</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {/* Header Fields */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Invoice No</Label>
                <Input className="bg-muted cursor-not-allowed" value={formData.invoiceNo || ""} readOnly />
              </div>
              <div className="space-y-1.5">
                <Label>Customer <span className="text-red-500">*</span></Label>
                <Select value={formData.customerId || ""} onValueChange={v => setFormData({ ...formData, customerId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select Customer" /></SelectTrigger>
                  <SelectContent>{customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Date <span className="text-red-500">*</span></Label>
                <Input type="date" value={formData.date || ""} onChange={e => setFormData({ ...formData, date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Godown</Label>
                <Select value={formData.godownId || ""} onValueChange={v => setFormData({ ...formData, godownId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select Godown" /></SelectTrigger>
                  <SelectContent>{godowns.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={formData.notes || ""} onChange={e => setFormData({ ...formData, notes: e.target.value })} />
            </div>

            {/* Hire Parameters */}
            <Card className="bg-muted/30">
              <CardContent className="p-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <Label>Down Payment</Label>
                    <Input type="number" value={formData.downPayment ?? 0} onChange={e => setFormData({ ...formData, downPayment: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Duration (Months)</Label>
                    <Input type="number" min={1} value={formData.duration ?? 12} onChange={e => setFormData({ ...formData, duration: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Hire Rate %</Label>
                    <Input type="number" value={formData.hireRate ?? 0} onChange={e => setFormData({ ...formData, hireRate: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>VAT %</Label>
                    <Input type="number" value={formData.vatPercentage ?? 15} onChange={e => setFormData({ ...formData, vatPercentage: Number(e.target.value) })} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Line Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-semibold">Line Items</Label>
                <Button variant="outline" size="sm" onClick={addLine}><Plus className="w-3 h-3 mr-1" />Add Line</Button>
              </div>
              <div className="overflow-auto rounded-md border max-h-60">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Product</TableHead>
                      <TableHead className="w-20">Qty</TableHead>
                      <TableHead className="w-24">Rate</TableHead>
                      <TableHead className="w-20">Disc%</TableHead>
                      <TableHead className="w-24">Disc Amt</TableHead>
                      <TableHead className="w-24">VAT Amt</TableHead>
                      <TableHead className="w-24">Total</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <Select value={line.productId || ""} onValueChange={v => {
                            const prod = products.find((p: any) => p.id === v);
                            updateLine(idx, "productId", v);
                            if (prod) updateLine(idx, "rate", prod.salePrice || 0);
                          }}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Product" /></SelectTrigger>
                            <SelectContent>{products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell><Input type="number" className="h-8 text-xs w-16" value={line.qty} onChange={e => updateLine(idx, "qty", Number(e.target.value))} /></TableCell>
                        <TableCell>
                          {isSR ? (
                            <Input type="number" className="h-8 text-xs w-20 bg-muted cursor-not-allowed" value={line.rate} readOnly />
                          ) : (
                            <Input type="number" className="h-8 text-xs w-20" value={line.rate} onChange={e => updateLine(idx, "rate", Number(e.target.value))} />
                          )}
                        </TableCell>
                        <TableCell><Input type="number" className="h-8 text-xs w-16" value={line.discPercent} onChange={e => updateLine(idx, "discPercent", Number(e.target.value))} /></TableCell>
                        <TableCell className="font-mono text-xs">{fmt(line.discAmt, "currency")}</TableCell>
                        <TableCell className="font-mono text-xs">{fmt(line.vatAmt, "currency")}</TableCell>
                        <TableCell className="font-mono text-xs font-medium">{fmt(line.total, "currency")}</TableCell>
                        <TableCell>{lines.length > 1 && <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => removeLine(idx)}><X className="w-3 h-3" /></Button>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {isSR && <p className="text-xs text-muted-foreground mt-1">🔒 Rate is locked to product MRP for SR role</p>}
            </div>

            {/* Summary */}
            <Card className="bg-muted/30">
              <CardContent className="p-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div><span className="text-muted-foreground">Sub Total:</span><p className="font-mono font-bold text-slate-900 dark:text-white">{fmt(subTotal, "currency")}</p></div>
                  <div><span className="text-muted-foreground">Down Payment:</span><p className="font-mono font-bold text-green-600">{fmt(downPayment, "currency")}</p></div>
                  <div><span className="text-muted-foreground">Balance After DP:</span><p className="font-mono font-bold text-slate-900 dark:text-white">{fmt(balanceAfterDP, "currency")}</p></div>
                  <div><span className="text-muted-foreground">VAT ({formData.vatPercentage}%):</span><p className="font-mono font-bold text-slate-900 dark:text-white">{fmt(totalVat, "currency")}</p></div>
                  <div><span className="text-muted-foreground">Grand Total:</span><p className="font-mono font-bold text-lg text-slate-900 dark:text-white">{fmt(grandTotal, "currency")}</p></div>
                  <div><span className="text-muted-foreground">Monthly Installment:</span><p className="font-mono font-bold text-lg text-[#2563eb]">{fmt(monthlyInstallment, "currency")}</p></div>
                </div>
              </CardContent>
            </Card>

            {/* Installment Schedule Preview */}
            {installmentSchedule.length > 0 && (
              <Card className="bg-muted/30">
                <CardHeader className="pb-2"><CardTitle className="text-sm">Installment Schedule Preview</CardTitle></CardHeader>
                <CardContent className="p-3">
                  <div className="overflow-auto max-h-48 rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Installment #</TableHead>
                          <TableHead>Due Date</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {installmentSchedule.map((inst, i) => (
                          <TableRow key={i}>
                            <TableCell>{inst.installmentNo}</TableCell>
                            <TableCell>{fmtDate(inst.dueDate)}</TableCell>
                            <TableCell className="font-mono">{fmt(inst.amount, "currency")}</TableCell>
                            <TableCell><Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">Pending</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={handleSave} disabled={saving}>
              {saving ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />}{editItem ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-500" />Confirm Deactivate</DialogTitle></DialogHeader>
          <DialogDescription>Deactivate Hire Sale {deleteItem?.invoiceNo}? It will be marked as inactive but preserved in the system.</DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteItem(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Deactivate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// SALES RETURNS PAGE - Dedicated Transaction Page
// ============================================================

function SalesReturnsPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { toast } = useToast();
  const { isVatAuditor, user } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Dynamic options
  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [godowns, setGodowns] = useState<any[]>([]);

  // Form state
  const [formData, setFormData] = useState<Record<string, any>>({ salesOrderId: "", customerId: "", godownId: "", date: new Date().toISOString().split("T")[0], reason: "", discount: 0, vatPercentage: 15, returnNo: "" });
  const [lines, setLines] = useState<any[]>([{ productId: "", qty: 1, rate: 0, discPercent: 0, discAmt: 0, vatAmt: 0, total: 0, maxQty: 0 }]);
  const [qtyErrors, setQtyErrors] = useState<string[]>([]);

  // RBAC
  const isDealer = user?.role === "dealer";

  // Selected SO info
  const selectedSO = useMemo(() => {
    if (!formData.salesOrderId) return null;
    return salesOrders.find((so: any) => so.id === formData.salesOrderId);
  }, [formData.salesOrderId, salesOrders]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/sales-returns");
      setData(Array.isArray(res) ? res : res.data || []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const loadOptions = useCallback(async () => {
    try {
      const [soRes, cRes, gRes] = await Promise.all([
        apiFetch("/api/sales-orders").catch(() => []),
        apiFetch("/api/customers").catch(() => []),
        apiFetch("/api/godowns").catch(() => []),
      ]);
      setSalesOrders(Array.isArray(soRes) ? soRes : soRes.data || []);
      setCustomers(Array.isArray(cRes) ? cRes : cRes.data || []);
      setGodowns(Array.isArray(gRes) ? gRes : gRes.data || []);
    } catch { /* silent */ }
  }, []);

  const filtered = useMemo(() => {
    if (!search) return data;
    const s = search.toLowerCase();
    return data.filter((item: any) =>
      item.returnNo?.toLowerCase().includes(s) ||
      item.customer?.name?.toLowerCase().includes(s) ||
      item.salesOrder?.invoiceNo?.toLowerCase().includes(s) ||
      item.status?.toLowerCase().includes(s)
    );
  }, [data, search]);

  // Stats
  const totalReturns = data.length;
  const totalValue = data.reduce((s: number, d: any) => s + (d.grandTotal || 0), 0);
  const pendingCount = data.filter((d: any) => d.status === "Pending").length;
  const approvedCount = data.filter((d: any) => d.status === "Approved").length;

  // Line calculations
  const calcLine = (line: any) => {
    const qty = Number(line.qty) || 0;
    const rate = Number(line.rate) || 0;
    const discPercent = Number(line.discPercent) || 0;
    const discAmt = rate * qty * discPercent / 100;
    const afterDisc = rate * qty - discAmt;
    const vatPct = Number(formData.vatPercentage) || 0;
    const vatAmt = afterDisc * vatPct / 100;
    const total = afterDisc + vatAmt;
    return { ...line, discAmt, vatAmt, total };
  };

  const updateLine = (idx: number, field: string, value: any) => {
    setLines(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      next[idx] = calcLine(next[idx]);
      return next;
    });
  };

  const addLine = () => {
    setLines(prev => [...prev, { productId: "", qty: 1, rate: 0, discPercent: 0, discAmt: 0, vatAmt: 0, total: 0, maxQty: 0 }]);
  };

  const removeLine = (idx: number) => {
    setLines(prev => prev.filter((_, i) => i !== idx));
  };

  // Qty validation
  const validateQty = useCallback(() => {
    const errors: string[] = [];
    lines.forEach((line, idx) => {
      if (line.productId && line.maxQty > 0 && Number(line.qty) > line.maxQty) {
        errors.push(`Line ${idx + 1}: Return qty (${line.qty}) exceeds original SO qty (${line.maxQty})`);
      }
    });
    setQtyErrors(errors);
    return errors.length === 0;
  }, [lines]);

  useEffect(() => { validateQty(); }, [validateQty]);

  // Summary
  const subTotal = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0);
  const totalDisc = lines.reduce((s, l) => s + (Number(l.discAmt) || 0), 0);
  const totalVat = lines.reduce((s, l) => s + (Number(l.vatAmt) || 0), 0);
  const grandTotal = subTotal - totalDisc + totalVat;

  const openCreate = () => {
    const nextNum = data.length > 0 ? String(Math.max(...data.map((d: any) => parseInt(d.returnNo?.replace("SRT-", "") || "0", 10) || 0)) + 1).padStart(5, "0") : "00001";
    setFormData({ salesOrderId: "", customerId: "", godownId: "", date: new Date().toISOString().split("T")[0], reason: "", discount: 0, vatPercentage: 15, returnNo: `SRT-${nextNum}` });
    setLines([{ productId: "", qty: 1, rate: 0, discPercent: 0, discAmt: 0, vatAmt: 0, total: 0, maxQty: 0 }]);
    setQtyErrors([]);
    setEditItem(null);
    setShowForm(true);
    loadOptions();
  };

  const openEdit = (item: any) => {
    setFormData({
      salesOrderId: item.salesOrderId || "",
      customerId: item.customerId || "",
      godownId: item.godownId || "",
      date: item.date ? item.date.split("T")[0] : "",
      reason: item.reason || "",
      discount: item.discount || 0,
      vatPercentage: item.vatPercentage || 15,
      returnNo: item.returnNo || "",
    });
    setLines(item.lines && item.lines.length > 0 ? item.lines.map((l: any) => ({
      productId: l.productId, qty: l.quantity || 1, rate: l.rate || 0, discPercent: l.discountPercent || 0, discAmt: l.discountAmount || 0, vatAmt: l.vatAmount || 0, total: l.total || 0, maxQty: l.quantity || 0
    })) : [{ productId: "", qty: 1, rate: 0, discPercent: 0, discAmt: 0, vatAmt: 0, total: 0, maxQty: 0 }]);
    setQtyErrors([]);
    setEditItem(item);
    setShowForm(true);
    loadOptions();
  };

  const handleSOSelect = (soId: string) => {
    const so = salesOrders.find((s: any) => s.id === soId);
    if (so) {
      const customerId = so.customerId || "";
      setFormData(prev => ({ ...prev, salesOrderId: soId, customerId }));
      if (so.lines && so.lines.length > 0) {
        setLines(so.lines.map((l: any) => ({
          productId: l.productId || l.product?.id || "",
          qty: 1,
          rate: l.rate || l.product?.salePrice || 0,
          discPercent: l.discountPercent || 0,
          discAmt: 0,
          vatAmt: 0,
          total: 0,
          maxQty: l.quantity || 0,
          productName: l.product?.name || l.productId || "",
        })).map((l: any) => calcLine(l)));
      }
    } else {
      setFormData(prev => ({ ...prev, salesOrderId: soId }));
    }
  };

  const handleSave = async () => {
    if (!formData.salesOrderId || !formData.customerId || !formData.date) {
      toast({ title: "Error", description: "Sales Order, Customer, and Date are required", variant: "destructive" });
      return;
    }
    const validLines = lines.filter(l => l.productId);
    if (validLines.length === 0) {
      toast({ title: "Error", description: "Add at least one line item", variant: "destructive" });
      return;
    }
    if (!validateQty()) {
      toast({ title: "Error", description: "Return quantity exceeds original SO quantity. Fix errors before submitting.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        salesOrderId: formData.salesOrderId,
        customerId: formData.customerId,
        godownId: formData.godownId || null,
        date: formData.date,
        subTotal,
        discount: totalDisc,
        vatPercentage: Number(formData.vatPercentage) || 0,
        vatAmount: totalVat,
        grandTotal,
        reason: formData.reason,
        lines: validLines.map(l => ({
          productId: l.productId,
          quantity: Number(l.qty) || 0,
          rate: Number(l.rate) || 0,
          discountPercent: Number(l.discPercent) || 0,
          discountAmount: Number(l.discAmt) || 0,
          vatAmount: Number(l.vatAmt) || 0,
          total: Number(l.total) || 0,
        })),
      };
      if (editItem) {
        await apiFetch(`/api/sales-returns/${editItem.id}`, { method: "PUT", body: JSON.stringify({ ...payload, status: formData.status || "Pending" }) });
        toast({ title: "Updated", description: "Sales Return updated" });
      } else {
        await apiFetch("/api/sales-returns", { method: "POST", body: JSON.stringify(payload) });
        toast({ title: "Created", description: "Sales Return created" });
      }
      setShowForm(false); load();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    try {
      await apiFetch(`/api/sales-returns/${deleteItem.id}`, { method: "DELETE" });
      toast({ title: "Deactivated" }); setDeleteItem(null); load();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const exportCSV = () => {
    const headers = ["Return No", "SO Invoice", "Customer", "Date", "SubTotal", "VAT", "GrandTotal", "Status"];
    const rows = filtered.map((item: any) => [item.returnNo, item.salesOrder?.invoiceNo || "—", item.customer?.name || "—", fmtDate(item.date), item.subTotal || 0, item.vatAmount || 0, item.grandTotal || 0, item.status].map(String));
    try { exportToCSVSimple("Sales Returns", headers, rows); toast({ title: "Exported", description: "Sales Returns exported to CSV" }); } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const exportPDF = () => {
    const headers = ["Return No", "SO Invoice", "Customer", "Date", "SubTotal", "VAT", "GrandTotal", "Status"];
    const body = filtered.map((item: any) => [item.returnNo, item.salesOrder?.invoiceNo || "—", item.customer?.name || "—", fmtDate(item.date), fmt(item.subTotal, "currency"), fmt(item.vatAmount, "currency"), fmt(item.grandTotal, "currency"), item.status]);
    try { exportToPDFSimple("Sales Returns", headers, body, "landscape"); toast({ title: "Exported", description: "Sales Returns exported to PDF" }); } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const importCSV = () => {
    importFromCSV({
      apiPath: "/api/sales-returns",
      formFields: [
        { key: "returnNo", label: "Return No", type: "text", required: true },
        { key: "salesOrderId", label: "Sales Order", type: "text", required: true },
        { key: "customerId", label: "Customer", type: "text", required: true },
        { key: "date", label: "Date", type: "date", required: true },
        { key: "status", label: "Status", type: "text" },
      ]
    }).then(result => {
      toast({ title: "Import Complete", description: `Imported: ${result.imported}, Failed: ${result.failed}${result.errors.length > 0 ? ` (${result.errors.slice(0, 3).join("; ")})` : ""}`, variant: result.failed > 0 ? "destructive" : "default" });
      load();
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedRows(prev => { const next = new Set(prev); if (next.has(id)) { next.delete(id); } else { next.add(id); } return next; });
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "Pending": return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "Approved": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      case "Rejected": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
      default: return "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400";
    }
  };

  const colCount = isVatAuditor ? 9 : 10;

  // Dealer restriction - early return AFTER all hooks
  if (isDealer) {
    return (
      <div className="page-enter flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full"><CardContent className="p-8 text-center">
          <Lock className="w-12 h-12 mx-auto mb-4 text-red-500" />
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Access Restricted</h3>
          <p className="text-muted-foreground">You don&apos;t have permission to view Sales Returns. Please contact your administrator.</p>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="page-enter space-y-4">
      {/* VAT Auditor Mode Badge */}
      {isVatAuditor && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <Badge className="bg-amber-500 text-white">VAT AUDIT MODE</Badge>
          <span className="text-sm text-amber-700 dark:text-amber-400">Cost/rate fields hidden for audit compliance</span>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2"><RotateCcw className="w-6 h-6" />Sales Returns</h2>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={importCSV}><Upload className="w-4 h-4 mr-1" />Import CSV</Button>
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="w-4 h-4 mr-1" />Export CSV</Button>
          <Button variant="outline" size="sm" onClick={exportPDF}><FileDown className="w-4 h-4 mr-1" />Export PDF</Button>
          <Button size="sm" className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={openCreate}><Plus className="w-4 h-4 mr-1" />Create Return</Button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Returns", value: totalReturns, icon: RotateCcw, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/30" },
          { label: "Total Value", value: fmt(totalValue, "currency"), icon: DollarSign, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/30" },
          { label: "Pending", value: pendingCount, icon: FileText, color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-900/30" },
          { label: "Approved", value: approvedCount, icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/30" },
        ].map((stat, i) => (
          <Card key={i} className="stat-mini-card"><CardContent className="p-3 flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${stat.bg} ${stat.color}`}><stat.icon className="w-4 h-4" /></div>
            <div><p className="text-xs text-muted-foreground">{stat.label}</p><p className="text-lg font-bold text-slate-900 dark:text-white">{stat.value}</p></div>
          </CardContent></Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search by return no, customer..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
            </div>
            <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
          </div>
          <div className="table-container overflow-auto max-h-[60vh] rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-10">+</TableHead>
                  <TableHead>Return No</TableHead>
                  <TableHead>SO Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  {!isVatAuditor && <TableHead>SubTotal</TableHead>}
                  <TableHead>VAT</TableHead>
                  <TableHead>GrandTotal</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-20 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={colCount} className="h-24 text-center"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={colCount} className="h-24 text-center text-muted-foreground">No sales returns found</TableCell></TableRow>
                ) : filtered.map((item: any) => (
                  <React.Fragment key={item.id}>
                    <TableRow className="data-table-row hover:bg-muted/50">
                      <TableCell>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => toggleExpand(item.id)}>
                          {expandedRows.has(item.id) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        </Button>
                      </TableCell>
                      <TableCell className="font-mono font-medium text-slate-900 dark:text-white">{item.returnNo}</TableCell>
                      <TableCell>{item.salesOrder?.invoiceNo || "—"}</TableCell>
                      <TableCell>{onNavigate ? <span className="cursor-pointer text-blue-600 hover:underline" onClick={() => onNavigate('customers')}>{item.customer?.name || "—"}</span> : (item.customer?.name || "—")}</TableCell>
                      <TableCell>{fmtDate(item.date)}</TableCell>
                      {!isVatAuditor && <TableCell className="font-mono">{fmt(item.subTotal, "currency")}</TableCell>}
                      <TableCell className="font-mono">{isVatAuditor ? "N/A (Audit Mode)" : fmt(item.vatAmount, "currency")}</TableCell>
                      <TableCell className="font-mono font-medium">{fmt(item.grandTotal, "currency")}</TableCell>
                      <TableCell><Badge className={statusColor(item.status)}>{item.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(item)}><Edit className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="sm" className="text-red-500" onClick={() => setDeleteItem(item)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedRows.has(item.id) && (
                      <TableRow>
                        <TableCell colSpan={colCount} className="bg-muted/30 p-3">
                          <div className="text-xs font-medium mb-2 text-slate-900 dark:text-white">Line Items</div>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Product</TableHead>
                                <TableHead>Qty</TableHead>
                                {!isVatAuditor && <TableHead>Rate</TableHead>}
                                <TableHead>Disc%</TableHead>
                                <TableHead>Disc Amt</TableHead>
                                <TableHead>VAT Amt</TableHead>
                                <TableHead>Total</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(item.lines || []).map((line: any, li: number) => (
                                <TableRow key={li}>
                                  <TableCell>{line.product?.name || line.productId || "—"}</TableCell>
                                  <TableCell className="font-mono">{line.quantity}</TableCell>
                                  {!isVatAuditor && <TableCell className="font-mono">{fmt(line.rate, "currency")}</TableCell>}
                                  <TableCell className="font-mono">{line.discountPercent || 0}%</TableCell>
                                  <TableCell className="font-mono">{fmt(line.discountAmount, "currency")}</TableCell>
                                  <TableCell className="font-mono">{fmt(line.vatAmount, "currency")}</TableCell>
                                  <TableCell className="font-mono font-medium">{fmt(line.total, "currency")}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">Showing {filtered.length} of {data.length} sales returns</div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editItem ? "Edit" : "Create"} Sales Return</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Return No</Label>
                <Input className="bg-muted cursor-not-allowed" value={formData.returnNo || ""} readOnly />
              </div>
              <div className="space-y-1.5">
                <Label>Sales Order <span className="text-red-500">*</span></Label>
                <Select value={formData.salesOrderId || ""} onValueChange={v => handleSOSelect(v)}>
                  <SelectTrigger><SelectValue placeholder="Select Sales Order" /></SelectTrigger>
                  <SelectContent>{salesOrders.map((so: any) => <SelectItem key={so.id} value={so.id}>{so.invoiceNo || so.id}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Customer</Label>
                <Input className="bg-muted cursor-not-allowed" value={selectedSO?.customer?.name || formData.customerId || ""} readOnly />
              </div>
              <div className="space-y-1.5">
                <Label>Godown (Restock To)</Label>
                <Select value={formData.godownId || ""} onValueChange={v => setFormData({ ...formData, godownId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select Godown" /></SelectTrigger>
                  <SelectContent>{godowns.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Date <span className="text-red-500">*</span></Label>
                <Input type="date" value={formData.date || ""} onChange={e => setFormData({ ...formData, date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>VAT Percentage</Label>
                <Input type="number" step="0.01" value={formData.vatPercentage ?? 15} onChange={e => setFormData({ ...formData, vatPercentage: Number(e.target.value) })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Textarea value={formData.reason || ""} onChange={e => setFormData({ ...formData, reason: e.target.value })} placeholder="Reason for return..." />
            </div>

            {/* Qty Validation Errors */}
            {qtyErrors.length > 0 && (
              <Card className="border-red-500 bg-red-50 dark:bg-red-900/20">
                <CardContent className="p-3">
                  {qtyErrors.map((err, i) => (
                    <p key={i} className="text-red-600 text-sm font-medium flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{err}</p>
                  ))}
                  <p className="text-red-700 text-xs mt-1 font-bold">Return quantity cannot exceed original Sales Order quantity!</p>
                </CardContent>
              </Card>
            )}

            {/* Line Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-semibold">Line Items {selectedSO && <span className="text-muted-foreground text-xs">(from SO)</span>}</Label>
                <Button variant="outline" size="sm" onClick={addLine}><Plus className="w-3 h-3 mr-1" />Add Line</Button>
              </div>
              <div className="overflow-auto rounded-md border max-h-60">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Product</TableHead>
                      <TableHead className="w-20">Qty {selectedSO && <span className="text-xs text-muted-foreground">(max)</span>}</TableHead>
                      {!isVatAuditor && <TableHead className="w-24">Rate</TableHead>}
                      <TableHead className="w-20">Disc%</TableHead>
                      <TableHead className="w-24">Disc Amt</TableHead>
                      <TableHead className="w-24">VAT Amt</TableHead>
                      <TableHead className="w-24">Total</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line, idx) => (
                      <TableRow key={idx} className={line.maxQty > 0 && Number(line.qty) > line.maxQty ? "bg-red-50 dark:bg-red-900/10" : ""}>
                        <TableCell>
                          {line.productName ? (
                            <span className="text-xs">{line.productName}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">From SO</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input type="number" className="h-8 text-xs w-16" min={1} max={line.maxQty || undefined} value={line.qty} onChange={e => updateLine(idx, "qty", Number(e.target.value))} />
                          {line.maxQty > 0 && <span className="text-[10px] text-muted-foreground block">max: {line.maxQty}</span>}
                        </TableCell>
                        {!isVatAuditor && (
                          <TableCell>
                            <Input type="number" step="0.01" className="h-8 text-xs w-20 bg-muted cursor-not-allowed" value={line.rate} readOnly />
                          </TableCell>
                        )}
                        <TableCell><Input type="number" step="0.01" className="h-8 text-xs w-16" value={line.discPercent} onChange={e => updateLine(idx, "discPercent", Number(e.target.value))} /></TableCell>
                        <TableCell className="font-mono text-xs">{fmt(line.discAmt, "currency")}</TableCell>
                        <TableCell className="font-mono text-xs">{fmt(line.vatAmt, "currency")}</TableCell>
                        <TableCell className="font-mono text-xs font-medium">{fmt(line.total, "currency")}</TableCell>
                        <TableCell>{lines.length > 1 && <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => removeLine(idx)}><X className="w-3 h-3" /></Button>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Summary */}
            <Card className="bg-muted/30">
              <CardContent className="p-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div><span className="text-muted-foreground">Sub Total:</span><p className="font-mono font-bold text-slate-900 dark:text-white">{fmt(subTotal, "currency")}</p></div>
                  <div><span className="text-muted-foreground">Discount:</span><p className="font-mono font-bold text-red-600">{fmt(totalDisc, "currency")}</p></div>
                  <div><span className="text-muted-foreground">VAT ({formData.vatPercentage}%):</span><p className="font-mono font-bold text-slate-900 dark:text-white">{fmt(totalVat, "currency")}</p></div>
                  <div><span className="text-muted-foreground">Grand Total:</span><p className="font-mono font-bold text-lg text-slate-900 dark:text-white">{fmt(grandTotal, "currency")}</p></div>
                </div>
              </CardContent>
            </Card>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={handleSave} disabled={saving || qtyErrors.length > 0}>
              {saving ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />}{editItem ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-500" />Confirm Deactivate</DialogTitle></DialogHeader>
          <DialogDescription>Deactivate Sales Return {deleteItem?.returnNo}? It will be marked as inactive but preserved in the system.</DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteItem(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Deactivate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// PURCHASE RETURNS PAGE - Dedicated Transaction Page
// ============================================================

function PurchaseReturnsPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { toast } = useToast();
  const { isVatAuditor, user } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Dynamic options
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);

  // Form state
  const [formData, setFormData] = useState<Record<string, any>>({ purchaseOrderId: "", supplierId: "", date: new Date().toISOString().split("T")[0], reason: "", challanRef: "", discount: 0, vatPercentage: 15, returnNo: "" });
  const [lines, setLines] = useState<any[]>([{ productId: "", qty: 1, rate: 0, discPercent: 0, discAmt: 0, vatAmt: 0, total: 0, maxQty: 0 }]);
  const [qtyErrors, setQtyErrors] = useState<string[]>([]);

  // RBAC
  const isDealer = user?.role === "dealer";
  const isSR = user?.role === "sr";

  // Selected PO info
  const selectedPO = useMemo(() => {
    if (!formData.purchaseOrderId) return null;
    return purchaseOrders.find((po: any) => po.id === formData.purchaseOrderId);
  }, [formData.purchaseOrderId, purchaseOrders]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/purchase-returns");
      setData(Array.isArray(res) ? res : res.data || []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const loadOptions = useCallback(async () => {
    try {
      const [poRes, sRes] = await Promise.all([
        apiFetch("/api/purchase-orders").catch(() => []),
        apiFetch("/api/suppliers").catch(() => []),
      ]);
      setPurchaseOrders(Array.isArray(poRes) ? poRes : poRes.data || []);
      setSuppliers(Array.isArray(sRes) ? sRes : sRes.data || []);
    } catch { /* silent */ }
  }, []);

  const filtered = useMemo(() => {
    if (!search) return data;
    const s = search.toLowerCase();
    return data.filter((item: any) =>
      item.returnNo?.toLowerCase().includes(s) ||
      item.purchaseOrder?.poNumber?.toLowerCase().includes(s) ||
      item.purchaseOrder?.supplier?.name?.toLowerCase().includes(s) ||
      item.status?.toLowerCase().includes(s)
    );
  }, [data, search]);

  // Stats
  const totalReturns = data.length;
  const totalValue = data.reduce((s: number, d: any) => s + (d.grandTotal || 0), 0);
  const pendingCount = data.filter((d: any) => d.status === "Pending").length;
  const approvedCount = data.filter((d: any) => d.status === "Approved").length;

  // Line calculations
  const calcLine = (line: any) => {
    const qty = Number(line.qty) || 0;
    const rate = Number(line.rate) || 0;
    const discPercent = Number(line.discPercent) || 0;
    const discAmt = rate * qty * discPercent / 100;
    const afterDisc = rate * qty - discAmt;
    const vatPct = Number(formData.vatPercentage) || 0;
    const vatAmt = afterDisc * vatPct / 100;
    const total = afterDisc + vatAmt;
    return { ...line, discAmt, vatAmt, total };
  };

  const updateLine = (idx: number, field: string, value: any) => {
    setLines(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      next[idx] = calcLine(next[idx]);
      return next;
    });
  };

  const addLine = () => {
    setLines(prev => [...prev, { productId: "", qty: 1, rate: 0, discPercent: 0, discAmt: 0, vatAmt: 0, total: 0, maxQty: 0 }]);
  };

  const removeLine = (idx: number) => {
    setLines(prev => prev.filter((_, i) => i !== idx));
  };

  // Qty validation
  const validateQty = useCallback(() => {
    const errors: string[] = [];
    lines.forEach((line, idx) => {
      if (line.productId && line.maxQty > 0 && Number(line.qty) > line.maxQty) {
        errors.push(`Line ${idx + 1}: Return qty (${line.qty}) exceeds original PO qty (${line.maxQty})`);
      }
    });
    setQtyErrors(errors);
    return errors.length === 0;
  }, [lines]);

  useEffect(() => { validateQty(); }, [validateQty]);

  // Summary
  const subTotal = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0);
  const totalDisc = lines.reduce((s, l) => s + (Number(l.discAmt) || 0), 0);
  const totalVat = lines.reduce((s, l) => s + (Number(l.vatAmt) || 0), 0);
  const grandTotal = subTotal - totalDisc + totalVat;

  const openCreate = () => {
    const nextNum = data.length > 0 ? String(Math.max(...data.map((d: any) => parseInt(d.returnNo?.replace("PRT-", "") || d.returnNo?.replace("PR-", "") || "0", 10) || 0)) + 1).padStart(5, "0") : "00001";
    setFormData({ purchaseOrderId: "", supplierId: "", date: new Date().toISOString().split("T")[0], reason: "", challanRef: "", discount: 0, vatPercentage: 15, returnNo: `PRT-${nextNum}` });
    setLines([{ productId: "", qty: 1, rate: 0, discPercent: 0, discAmt: 0, vatAmt: 0, total: 0, maxQty: 0 }]);
    setQtyErrors([]);
    setEditItem(null);
    setShowForm(true);
    loadOptions();
  };

  const openEdit = (item: any) => {
    setFormData({
      purchaseOrderId: item.purchaseOrderId || "",
      supplierId: item.supplierId || item.purchaseOrder?.supplierId || "",
      date: item.date ? item.date.split("T")[0] : "",
      reason: item.reason || "",
      challanRef: item.challanRef || "",
      discount: item.discount || 0,
      vatPercentage: item.vatPercentage || 15,
      returnNo: item.returnNo || "",
    });
    setLines(item.lines && item.lines.length > 0 ? item.lines.map((l: any) => ({
      productId: l.productId, qty: l.quantity || 1, rate: l.rate || 0, discPercent: l.discountPercent || 0, discAmt: l.discountAmount || 0, vatAmt: l.vatAmount || 0, total: l.total || 0, maxQty: l.quantity || 0
    })) : [{ productId: "", qty: 1, rate: 0, discPercent: 0, discAmt: 0, vatAmt: 0, total: 0, maxQty: 0 }]);
    setQtyErrors([]);
    setEditItem(item);
    setShowForm(true);
    loadOptions();
  };

  const handlePOSelect = (poId: string) => {
    const po = purchaseOrders.find((p: any) => p.id === poId);
    if (po) {
      const supplierId = po.supplierId || "";
      setFormData(prev => ({ ...prev, purchaseOrderId: poId, supplierId }));
      if (po.lines && po.lines.length > 0) {
        setLines(po.lines.map((l: any) => ({
          productId: l.productId || l.product?.id || "",
          qty: 1,
          rate: l.rate || l.product?.costPrice || 0,
          discPercent: l.discountPercent || 0,
          discAmt: 0,
          vatAmt: 0,
          total: 0,
          maxQty: l.quantity || 0,
          productName: l.product?.name || l.productId || "",
        })).map((l: any) => calcLine(l)));
      }
    } else {
      setFormData(prev => ({ ...prev, purchaseOrderId: poId }));
    }
  };

  const handleSave = async () => {
    if (!formData.purchaseOrderId || !formData.supplierId || !formData.date) {
      toast({ title: "Error", description: "Purchase Order, Supplier, and Date are required", variant: "destructive" });
      return;
    }
    const validLines = lines.filter(l => l.productId);
    if (validLines.length === 0) {
      toast({ title: "Error", description: "Add at least one line item", variant: "destructive" });
      return;
    }
    if (!validateQty()) {
      toast({ title: "Error", description: "Return quantity exceeds original PO quantity. Fix errors before submitting.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        purchaseOrderId: formData.purchaseOrderId,
        supplierId: formData.supplierId,
        date: formData.date,
        subTotal,
        discount: totalDisc,
        vatPercentage: Number(formData.vatPercentage) || 0,
        vatAmount: totalVat,
        grandTotal,
        reason: formData.reason,
        challanRef: formData.challanRef,
        lines: validLines.map(l => ({
          productId: l.productId,
          quantity: Number(l.qty) || 0,
          rate: Number(l.rate) || 0,
          discountPercent: Number(l.discPercent) || 0,
          discountAmount: Number(l.discAmt) || 0,
          vatAmount: Number(l.vatAmt) || 0,
          total: Number(l.total) || 0,
        })),
      };
      if (editItem) {
        await apiFetch(`/api/purchase-returns/${editItem.id}`, { method: "PUT", body: JSON.stringify({ ...payload, status: formData.status || "Pending" }) });
        toast({ title: "Updated", description: "Purchase Return updated" });
      } else {
        await apiFetch("/api/purchase-returns", { method: "POST", body: JSON.stringify(payload) });
        toast({ title: "Created", description: "Purchase Return created" });
      }
      setShowForm(false); load();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    try {
      await apiFetch(`/api/purchase-returns/${deleteItem.id}`, { method: "DELETE" });
      toast({ title: "Deactivated" }); setDeleteItem(null); load();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const exportCSV = () => {
    const headers = ["Return No", "PO Number", "Supplier", "Date", "GrandTotal", "Status"];
    const rows = filtered.map((item: any) => [item.returnNo, item.purchaseOrder?.poNumber || "—", item.purchaseOrder?.supplier?.name || "—", fmtDate(item.date), item.grandTotal || 0, item.status].map(String));
    try { exportToCSVSimple("Purchase Returns", headers, rows); toast({ title: "Exported", description: "Purchase Returns exported to CSV" }); } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const exportPDF = () => {
    const headers = ["Return No", "PO Number", "Supplier", "Date", "GrandTotal", "Status"];
    const body = filtered.map((item: any) => [item.returnNo, item.purchaseOrder?.poNumber || "—", item.purchaseOrder?.supplier?.name || "—", fmtDate(item.date), fmt(item.grandTotal, "currency"), item.status]);
    try { exportToPDFSimple("Purchase Returns", headers, body, "landscape"); toast({ title: "Exported", description: "Purchase Returns exported to PDF" }); } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const importCSV = () => {
    importFromCSV({
      apiPath: "/api/purchase-returns",
      formFields: [
        { key: "returnNo", label: "Return No", type: "text", required: true },
        { key: "purchaseOrderId", label: "Purchase Order", type: "text", required: true },
        { key: "supplierId", label: "Supplier", type: "text", required: true },
        { key: "date", label: "Date", type: "date", required: true },
        { key: "status", label: "Status", type: "text" },
      ]
    }).then(result => {
      toast({ title: "Import Complete", description: `Imported: ${result.imported}, Failed: ${result.failed}${result.errors.length > 0 ? ` (${result.errors.slice(0, 3).join("; ")})` : ""}`, variant: result.failed > 0 ? "destructive" : "default" });
      load();
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedRows(prev => { const next = new Set(prev); if (next.has(id)) { next.delete(id); } else { next.add(id); } return next; });
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "Pending": return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "Approved": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      case "Rejected": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
      default: return "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400";
    }
  };

  const colCount = isVatAuditor ? 7 : 8;

  // RBAC restriction - Dealer AND SR cannot access
  if (isDealer) {
    return (
      <div className="page-enter flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full"><CardContent className="p-8 text-center">
          <Lock className="w-12 h-12 mx-auto mb-4 text-red-500" />
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Access Restricted</h3>
          <p className="text-muted-foreground">Dealers cannot access Purchase Returns. Please contact your administrator.</p>
        </CardContent></Card>
      </div>
    );
  }

  if (isSR) {
    return (
      <div className="page-enter flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full"><CardContent className="p-8 text-center">
          <Lock className="w-12 h-12 mx-auto mb-4 text-red-500" />
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Access Restricted</h3>
          <p className="text-muted-foreground">Sales Representatives cannot access Purchase Returns. Please contact your administrator.</p>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="page-enter space-y-4">
      {/* VAT Auditor Mode Badge */}
      {isVatAuditor && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <Badge className="bg-amber-500 text-white">VAT AUDIT MODE</Badge>
          <span className="text-sm text-amber-700 dark:text-amber-400">Cost/rate/margin fields hidden for audit compliance</span>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2"><RotateCcw className="w-6 h-6" />Purchase Returns</h2>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={importCSV}><Upload className="w-4 h-4 mr-1" />Import CSV</Button>
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="w-4 h-4 mr-1" />Export CSV</Button>
          <Button variant="outline" size="sm" onClick={exportPDF}><FileDown className="w-4 h-4 mr-1" />Export PDF</Button>
          <Button size="sm" className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={openCreate}><Plus className="w-4 h-4 mr-1" />Create Return</Button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Returns", value: totalReturns, icon: RotateCcw, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/30" },
          { label: "Total Value", value: fmt(totalValue, "currency"), icon: DollarSign, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/30" },
          { label: "Pending", value: pendingCount, icon: FileText, color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-900/30" },
          { label: "Approved", value: approvedCount, icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/30" },
        ].map((stat, i) => (
          <Card key={i} className="stat-mini-card"><CardContent className="p-3 flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${stat.bg} ${stat.color}`}><stat.icon className="w-4 h-4" /></div>
            <div><p className="text-xs text-muted-foreground">{stat.label}</p><p className="text-lg font-bold text-slate-900 dark:text-white">{stat.value}</p></div>
          </CardContent></Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search by return no, supplier..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
            </div>
            <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
          </div>
          <div className="table-container overflow-auto max-h-[60vh] rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-10">+</TableHead>
                  <TableHead>Return No</TableHead>
                  <TableHead>PO Number</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Date</TableHead>
                  {!isVatAuditor && <TableHead>GrandTotal</TableHead>}
                  <TableHead>Status</TableHead>
                  <TableHead className="w-20 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={colCount} className="h-24 text-center"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={colCount} className="h-24 text-center text-muted-foreground">No purchase returns found</TableCell></TableRow>
                ) : filtered.map((item: any) => (
                  <React.Fragment key={item.id}>
                    <TableRow className="data-table-row hover:bg-muted/50">
                      <TableCell>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => toggleExpand(item.id)}>
                          {expandedRows.has(item.id) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        </Button>
                      </TableCell>
                      <TableCell className="font-mono font-medium text-slate-900 dark:text-white">{item.returnNo}</TableCell>
                      <TableCell>{item.purchaseOrder?.poNumber || "—"}</TableCell>
                      <TableCell>{onNavigate ? <span className="cursor-pointer text-blue-600 hover:underline" onClick={() => onNavigate('suppliers')}>{item.purchaseOrder?.supplier?.name || "—"}</span> : (item.purchaseOrder?.supplier?.name || "—")}</TableCell>
                      <TableCell>{fmtDate(item.date)}</TableCell>
                      {!isVatAuditor && <TableCell className="font-mono font-medium">{fmt(item.grandTotal, "currency")}</TableCell>}
                      <TableCell><Badge className={statusColor(item.status)}>{item.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(item)}><Edit className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="sm" className="text-red-500" onClick={() => setDeleteItem(item)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedRows.has(item.id) && (
                      <TableRow>
                        <TableCell colSpan={colCount} className="bg-muted/30 p-3">
                          <div className="text-xs font-medium mb-2 text-slate-900 dark:text-white">Line Items</div>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Product</TableHead>
                                <TableHead>Qty</TableHead>
                                {!isVatAuditor && <TableHead>Rate</TableHead>}
                                <TableHead>Disc%</TableHead>
                                <TableHead>Disc Amt</TableHead>
                                <TableHead>VAT Amt</TableHead>
                                <TableHead>Total</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(item.lines || []).map((line: any, li: number) => (
                                <TableRow key={li}>
                                  <TableCell>{line.product?.name || line.productId || "—"}</TableCell>
                                  <TableCell className="font-mono">{line.quantity}</TableCell>
                                  {!isVatAuditor && <TableCell className="font-mono">{fmt(line.rate, "currency")}</TableCell>}
                                  <TableCell className="font-mono">{line.discountPercent || 0}%</TableCell>
                                  <TableCell className="font-mono">{fmt(line.discountAmount, "currency")}</TableCell>
                                  <TableCell className="font-mono">{fmt(line.vatAmount, "currency")}</TableCell>
                                  <TableCell className="font-mono font-medium">{fmt(line.total, "currency")}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">Showing {filtered.length} of {data.length} purchase returns</div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editItem ? "Edit" : "Create"} Purchase Return</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Return No</Label>
                <Input className="bg-muted cursor-not-allowed" value={formData.returnNo || ""} readOnly />
              </div>
              <div className="space-y-1.5">
                <Label>Purchase Order <span className="text-red-500">*</span></Label>
                <Select value={formData.purchaseOrderId || ""} onValueChange={v => handlePOSelect(v)}>
                  <SelectTrigger><SelectValue placeholder="Select Purchase Order" /></SelectTrigger>
                  <SelectContent>{purchaseOrders.map((po: any) => <SelectItem key={po.id} value={po.id}>{po.poNumber || po.id}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Supplier</Label>
                <Input className="bg-muted cursor-not-allowed" value={selectedPO?.supplier?.name || formData.supplierId || ""} readOnly />
              </div>
              <div className="space-y-1.5">
                <Label>Date <span className="text-red-500">*</span></Label>
                <Input type="date" value={formData.date || ""} onChange={e => setFormData({ ...formData, date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Challan Reference</Label>
                <Input value={formData.challanRef || ""} onChange={e => setFormData({ ...formData, challanRef: e.target.value })} placeholder="Challan reference..." />
              </div>
              <div className="space-y-1.5">
                <Label>VAT Percentage</Label>
                <Input type="number" step="0.01" value={formData.vatPercentage ?? 15} onChange={e => setFormData({ ...formData, vatPercentage: Number(e.target.value) })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Textarea value={formData.reason || ""} onChange={e => setFormData({ ...formData, reason: e.target.value })} placeholder="Reason for return..." />
            </div>

            {/* Qty Validation Errors */}
            {qtyErrors.length > 0 && (
              <Card className="border-red-500 bg-red-50 dark:bg-red-900/20">
                <CardContent className="p-3">
                  {qtyErrors.map((err, i) => (
                    <p key={i} className="text-red-600 text-sm font-medium flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{err}</p>
                  ))}
                  <p className="text-red-700 text-xs mt-1 font-bold">Return quantity cannot exceed original Purchase Order quantity!</p>
                </CardContent>
              </Card>
            )}

            {/* Line Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-semibold">Line Items {selectedPO && <span className="text-muted-foreground text-xs">(from PO)</span>}</Label>
                <Button variant="outline" size="sm" onClick={addLine}><Plus className="w-3 h-3 mr-1" />Add Line</Button>
              </div>
              <div className="overflow-auto rounded-md border max-h-60">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Product</TableHead>
                      <TableHead className="w-20">Qty {selectedPO && <span className="text-xs text-muted-foreground">(max)</span>}</TableHead>
                      {!isVatAuditor && <TableHead className="w-24">Rate</TableHead>}
                      <TableHead className="w-20">Disc%</TableHead>
                      <TableHead className="w-24">Disc Amt</TableHead>
                      <TableHead className="w-24">VAT Amt</TableHead>
                      <TableHead className="w-24">Total</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line, idx) => (
                      <TableRow key={idx} className={line.maxQty > 0 && Number(line.qty) > line.maxQty ? "bg-red-50 dark:bg-red-900/10" : ""}>
                        <TableCell>
                          {line.productName ? (
                            <span className="text-xs">{line.productName}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">From PO</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input type="number" className="h-8 text-xs w-16" min={1} max={line.maxQty || undefined} value={line.qty} onChange={e => updateLine(idx, "qty", Number(e.target.value))} />
                          {line.maxQty > 0 && <span className="text-[10px] text-muted-foreground block">max: {line.maxQty}</span>}
                        </TableCell>
                        {!isVatAuditor && (
                          <TableCell>
                            <Input type="number" step="0.01" className="h-8 text-xs w-20 bg-muted cursor-not-allowed" value={line.rate} readOnly />
                          </TableCell>
                        )}
                        <TableCell><Input type="number" step="0.01" className="h-8 text-xs w-16" value={line.discPercent} onChange={e => updateLine(idx, "discPercent", Number(e.target.value))} /></TableCell>
                        <TableCell className="font-mono text-xs">{fmt(line.discAmt, "currency")}</TableCell>
                        <TableCell className="font-mono text-xs">{fmt(line.vatAmt, "currency")}</TableCell>
                        <TableCell className="font-mono text-xs font-medium">{fmt(line.total, "currency")}</TableCell>
                        <TableCell>{lines.length > 1 && <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => removeLine(idx)}><X className="w-3 h-3" /></Button>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Summary */}
            <Card className="bg-muted/30">
              <CardContent className="p-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div><span className="text-muted-foreground">Sub Total:</span><p className="font-mono font-bold text-slate-900 dark:text-white">{fmt(subTotal, "currency")}</p></div>
                  <div><span className="text-muted-foreground">Discount:</span><p className="font-mono font-bold text-red-600">{fmt(totalDisc, "currency")}</p></div>
                  <div><span className="text-muted-foreground">VAT ({formData.vatPercentage}%):</span><p className="font-mono font-bold text-slate-900 dark:text-white">{fmt(totalVat, "currency")}</p></div>
                  <div><span className="text-muted-foreground">Grand Total:</span><p className="font-mono font-bold text-lg text-slate-900 dark:text-white">{fmt(grandTotal, "currency")}</p></div>
                </div>
              </CardContent>
            </Card>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={handleSave} disabled={saving || qtyErrors.length > 0}>
              {saving ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />}{editItem ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-500" />Confirm Deactivate</DialogTitle></DialogHeader>
          <DialogDescription>Deactivate Purchase Return {deleteItem?.returnNo}? It will be marked as inactive but preserved in the system.</DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteItem(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Deactivate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// STOCK TRANSFERS PAGE - Dedicated Transaction Page
// ============================================================

function StockTransfersPage() {
  const { toast } = useToast();
  const { isVatAuditor, user } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Dynamic options
  const [godowns, setGodowns] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  // Form state
  const [formData, setFormData] = useState<Record<string, any>>({ fromGodownId: "", toGodownId: "", date: new Date().toISOString().split("T")[0], notes: "", transferNo: "" });
  const [lines, setLines] = useState<any[]>([{ productId: "", quantity: 1 }]);

  // RBAC
  const isDealer = user?.role === "dealer";
  const isSR = user?.role === "sr";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/transfers");
      setData(Array.isArray(res) ? res : res.data || []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const loadOptions = useCallback(async () => {
    try {
      const [gRes, pRes] = await Promise.all([
        apiFetch("/api/godowns").catch(() => []),
        apiFetch("/api/products").catch(() => []),
      ]);
      setGodowns(Array.isArray(gRes) ? gRes : gRes.data || []);
      setProducts(Array.isArray(pRes) ? pRes : pRes.data || []);
    } catch { /* silent */ }
  }, []);

  const filtered = useMemo(() => {
    if (!search) return data;
    const s = search.toLowerCase();
    return data.filter((item: any) =>
      item.transferNo?.toLowerCase().includes(s) ||
      item.fromGodown?.name?.toLowerCase().includes(s) ||
      item.toGodown?.name?.toLowerCase().includes(s) ||
      item.shippingStatus?.toLowerCase().includes(s)
    );
  }, [data, search]);

  // Stats
  const totalTransfers = data.length;
  const pendingCount = data.filter((d: any) => d.shippingStatus === "Pending").length;
  const inTransitCount = data.filter((d: any) => d.shippingStatus === "In-Transit").length;
  const deliveredCount = data.filter((d: any) => d.shippingStatus === "Delivered").length;

  // Auto-calculate totals
  const totalItems = lines.filter(l => l.productId).length;
  const totalQuantity = lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);

  // Godown validation
  const sameGodownError = formData.fromGodownId && formData.toGodownId && formData.fromGodownId === formData.toGodownId;

  const openCreate = () => {
    const nextNum = data.length > 0 ? String(Math.max(...data.map((d: any) => parseInt(d.transferNo?.replace("TRF-", "") || d.transferNo?.replace("TRN-", "") || "0", 10) || 0)) + 1).padStart(5, "0") : "00001";
    setFormData({ fromGodownId: "", toGodownId: "", date: new Date().toISOString().split("T")[0], notes: "", transferNo: `TRN-${nextNum}` });
    setLines([{ productId: "", quantity: 1 }]);
    setEditItem(null);
    setShowForm(true);
    loadOptions();
  };

  const openEdit = (item: any) => {
    setFormData({
      fromGodownId: item.fromGodownId || "",
      toGodownId: item.toGodownId || "",
      date: item.date ? item.date.split("T")[0] : "",
      notes: item.notes || "",
      transferNo: item.transferNo || "",
      shippingStatus: item.shippingStatus || "Pending",
    });
    setLines(item.lines && item.lines.length > 0 ? item.lines.map((l: any) => ({
      productId: l.productId, quantity: l.quantity || 1
    })) : [{ productId: "", quantity: 1 }]);
    setEditItem(item);
    setShowForm(true);
    loadOptions();
  };

  const handleSave = async () => {
    if (!formData.fromGodownId || !formData.toGodownId || !formData.date) {
      toast({ title: "Error", description: "From Godown, To Godown, and Date are required", variant: "destructive" });
      return;
    }
    if (sameGodownError) {
      toast({ title: "Error", description: "From Godown and To Godown cannot be the same", variant: "destructive" });
      return;
    }
    const validLines = lines.filter(l => l.productId);
    if (validLines.length === 0) {
      toast({ title: "Error", description: "Add at least one line item", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        fromGodownId: formData.fromGodownId,
        toGodownId: formData.toGodownId,
        date: formData.date,
        notes: formData.notes,
        totalItems,
        totalQuantity,
        lines: validLines.map(l => ({
          productId: l.productId,
          quantity: Number(l.quantity) || 0,
        })),
      };
      if (editItem) {
        await apiFetch(`/api/transfers/${editItem.id}`, { method: "PUT", body: JSON.stringify({ ...payload, status: formData.shippingStatus || "Pending" }) });
        toast({ title: "Updated", description: "Stock Transfer updated" });
      } else {
        await apiFetch("/api/transfers", { method: "POST", body: JSON.stringify(payload) });
        toast({ title: "Created", description: "Stock Transfer created" });
      }
      setShowForm(false); load();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    try {
      await apiFetch(`/api/transfers/${deleteItem.id}`, { method: "DELETE" });
      toast({ title: "Deactivated" }); setDeleteItem(null); load();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const handleShippingStatusUpdate = async (item: any, newStatus: string) => {
    try {
      const updateData: Record<string, any> = { shippingStatus: newStatus, status: newStatus };
      if (newStatus === "In-Transit") updateData.shippedAt = new Date().toISOString();
      if (newStatus === "Delivered") updateData.deliveredAt = new Date().toISOString();
      await apiFetch(`/api/transfers/${item.id}`, { method: "PUT", body: JSON.stringify(updateData) });
      toast({ title: "Status Updated", description: `Transfer marked as ${newStatus}` });
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const exportCSV = () => {
    const headers = ["Transfer No", "From Godown", "To Godown", "Date", "Shipping Status", "Total Items", "Total Qty"];
    const rows = filtered.map((item: any) => [item.transferNo, item.fromGodown?.name || "—", item.toGodown?.name || "—", fmtDate(item.date), item.shippingStatus || "Pending", item.totalItems || 0, item.totalQuantity || 0].map(String));
    try { exportToCSVSimple("Stock Transfers", headers, rows); toast({ title: "Exported", description: "Stock Transfers exported to CSV" }); } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const exportPDF = () => {
    const headers = ["Transfer No", "From", "To", "Date", "Status", "Items", "Qty"];
    const body = filtered.map((item: any) => [item.transferNo, item.fromGodown?.name || "—", item.toGodown?.name || "—", fmtDate(item.date), item.shippingStatus || "Pending", String(item.totalItems || 0), String(item.totalQuantity || 0)]);
    try { exportToPDFSimple("Stock Transfers", headers, body, "landscape"); toast({ title: "Exported", description: "Stock Transfers exported to PDF" }); } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const importCSV = () => {
    importFromCSV({
      apiPath: "/api/transfers",
      formFields: [
        { key: "transferNo", label: "Transfer No", type: "text", required: true },
        { key: "fromGodownId", label: "From Godown", type: "text", required: true },
        { key: "toGodownId", label: "To Godown", type: "text", required: true },
        { key: "date", label: "Date", type: "date", required: true },
        { key: "notes", label: "Notes", type: "text" },
      ]
    }).then(result => {
      toast({ title: "Import Complete", description: `Imported: ${result.imported}, Failed: ${result.failed}${result.errors.length > 0 ? ` (${result.errors.slice(0, 3).join("; ")})` : ""}`, variant: result.failed > 0 ? "destructive" : "default" });
      load();
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedRows(prev => { const next = new Set(prev); if (next.has(id)) { next.delete(id); } else { next.add(id); } return next; });
  };

  const shippingStatusColor = (status: string) => {
    switch (status) {
      case "Pending": return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "In-Transit": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
      case "Delivered": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      default: return "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400";
    }
  };

  // Dealer restriction
  if (isDealer) {
    return (
      <div className="page-enter flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full"><CardContent className="p-8 text-center">
          <Lock className="w-12 h-12 mx-auto mb-4 text-red-500" />
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Access Restricted</h3>
          <p className="text-muted-foreground">You don&apos;t have permission to view internal warehouse tracking. Please contact your administrator.</p>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="page-enter space-y-4">
      {/* VAT Auditor Mode Badge */}
      {isVatAuditor && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <Badge className="bg-amber-500 text-white">VAT AUDIT MODE</Badge>
          <span className="text-sm text-amber-700 dark:text-amber-400">Cost/margin tracking hidden — shipping status and godown info only</span>
        </div>
      )}

      {/* SR Approval Banner */}
      {isSR && (
        <div className="flex items-center gap-2 px-4 py-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <Lock className="w-4 h-4 text-yellow-600" />
          <span className="text-sm text-yellow-700 dark:text-yellow-400">View-only mode — Stock Transfers require Manager approval to create or edit</span>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2"><ArrowLeftRight className="w-6 h-6" />Stock Transfers</h2>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={importCSV}><Upload className="w-4 h-4 mr-1" />Import CSV</Button>
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="w-4 h-4 mr-1" />Export CSV</Button>
          <Button variant="outline" size="sm" onClick={exportPDF}><FileDown className="w-4 h-4 mr-1" />Export PDF</Button>
          {!isSR && (
            <Button size="sm" className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={openCreate}><Plus className="w-4 h-4 mr-1" />Create Transfer</Button>
          )}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Transfers", value: totalTransfers, icon: ArrowLeftRight, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/30" },
          { label: "Pending", value: pendingCount, icon: FileText, color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-900/30" },
          { label: "In-Transit", value: inTransitCount, icon: Truck, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/30" },
          { label: "Delivered", value: deliveredCount, icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/30" },
        ].map((stat, i) => (
          <Card key={i} className="stat-mini-card"><CardContent className="p-3 flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${stat.bg} ${stat.color}`}><stat.icon className="w-4 h-4" /></div>
            <div><p className="text-xs text-muted-foreground">{stat.label}</p><p className="text-lg font-bold text-slate-900 dark:text-white">{stat.value}</p></div>
          </CardContent></Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search by transfer no, godown..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
            </div>
            <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
          </div>
          <div className="table-container overflow-auto max-h-[60vh] rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-10">+</TableHead>
                  <TableHead>Transfer No</TableHead>
                  <TableHead>From Godown</TableHead>
                  <TableHead>To Godown</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Shipping Status</TableHead>
                  <TableHead>Total Items</TableHead>
                  <TableHead>Total Qty</TableHead>
                  {!isSR && <TableHead className="w-28 text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={isSR ? 8 : 9} className="h-24 text-center"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={isSR ? 8 : 9} className="h-24 text-center text-muted-foreground">No stock transfers found</TableCell></TableRow>
                ) : filtered.map((item: any) => (
                  <React.Fragment key={item.id}>
                    <TableRow className="data-table-row hover:bg-muted/50">
                      <TableCell>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => toggleExpand(item.id)}>
                          {expandedRows.has(item.id) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        </Button>
                      </TableCell>
                      <TableCell className="font-mono font-medium text-slate-900 dark:text-white">{item.transferNo}</TableCell>
                      <TableCell>{item.fromGodown?.name || "—"}</TableCell>
                      <TableCell>{item.toGodown?.name || "—"}</TableCell>
                      <TableCell>{fmtDate(item.date)}</TableCell>
                      <TableCell><Badge className={shippingStatusColor(item.shippingStatus)}>{item.shippingStatus || "Pending"}</Badge></TableCell>
                      <TableCell className="font-mono">{item.totalItems || item.lines?.length || 0}</TableCell>
                      <TableCell className="font-mono">{item.totalQuantity || item.lines?.reduce((s: number, l: any) => s + (l.quantity || 0), 0) || 0}</TableCell>
                      {!isSR && (
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {item.shippingStatus === "Pending" && (
                              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleShippingStatusUpdate(item, "In-Transit")}><Truck className="w-3 h-3 mr-1" />In-Transit</Button>
                            )}
                            {item.shippingStatus === "In-Transit" && (
                              <Button variant="outline" size="sm" className="h-7 text-xs border-green-500 text-green-600" onClick={() => handleShippingStatusUpdate(item, "Delivered")}><CheckCircle className="w-3 h-3 mr-1" />Delivered</Button>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => openEdit(item)}><Edit className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm" className="text-red-500" onClick={() => setDeleteItem(item)}><Trash2 className="w-3.5 h-3.5" /></Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                    {expandedRows.has(item.id) && (
                      <TableRow>
                        <TableCell colSpan={isSR ? 8 : 9} className="bg-muted/30 p-3">
                          {/* Shipping Info */}
                          <div className="flex flex-wrap gap-4 mb-3 text-sm">
                            {item.shippedAt && <span className="text-slate-900 dark:text-white">Shipped: <strong>{fmtDate(item.shippedAt)}</strong></span>}
                            {item.deliveredAt && <span className="text-slate-900 dark:text-white">Delivered: <strong>{fmtDate(item.deliveredAt)}</strong></span>}
                          </div>
                          {/* Line Items */}
                          <div className="text-xs font-medium mb-2 text-slate-900 dark:text-white">Line Items</div>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Product</TableHead>
                                <TableHead>Quantity</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(item.lines || []).map((line: any, li: number) => (
                                <TableRow key={li}>
                                  <TableCell>{line.product?.name || line.productId || "—"}</TableCell>
                                  <TableCell className="font-mono">{line.quantity}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">Showing {filtered.length} of {data.length} stock transfers</div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editItem ? "Edit" : "Create"} Stock Transfer</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Transfer No</Label>
                <Input className="bg-muted cursor-not-allowed" value={formData.transferNo || ""} readOnly />
              </div>
              <div className="space-y-1.5">
                <Label>From Godown <span className="text-red-500">*</span></Label>
                <Select value={formData.fromGodownId || ""} onValueChange={v => setFormData({ ...formData, fromGodownId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select Source Godown" /></SelectTrigger>
                  <SelectContent>{godowns.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>To Godown <span className="text-red-500">*</span></Label>
                <Select value={formData.toGodownId || ""} onValueChange={v => setFormData({ ...formData, toGodownId: v })}>
                  <SelectTrigger className={sameGodownError ? "border-red-500" : ""}><SelectValue placeholder="Select Destination Godown" /></SelectTrigger>
                  <SelectContent>{godowns.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Date <span className="text-red-500">*</span></Label>
                <Input type="date" value={formData.date || ""} onChange={e => setFormData({ ...formData, date: e.target.value })} />
              </div>
            </div>

            {sameGodownError && (
              <Card className="border-red-500 bg-red-50 dark:bg-red-900/20">
                <CardContent className="p-3">
                  <p className="text-red-600 text-sm font-medium flex items-center gap-1"><AlertTriangle className="w-4 h-4" />From Godown and To Godown cannot be the same!</p>
                </CardContent>
              </Card>
            )}

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={formData.notes || ""} onChange={e => setFormData({ ...formData, notes: e.target.value })} placeholder="Transfer notes..." />
            </div>

            {/* Line Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-semibold">Products to Transfer</Label>
                <Button variant="outline" size="sm" onClick={() => setLines(prev => [...prev, { productId: "", quantity: 1 }])}><Plus className="w-3 h-3 mr-1" />Add Line</Button>
              </div>
              <div className="overflow-auto rounded-md border max-h-60">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Product</TableHead>
                      <TableHead className="w-24">Quantity</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <Select value={line.productId || ""} onValueChange={v => {
                            setLines(prev => { const next = [...prev]; next[idx] = { ...next[idx], productId: v }; return next; });
                          }}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select Product" /></SelectTrigger>
                            <SelectContent>{products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell><Input type="number" className="h-8 text-xs w-20" min={1} value={line.quantity} onChange={e => {
                          setLines(prev => { const next = [...prev]; next[idx] = { ...next[idx], quantity: Number(e.target.value) || 1 }; return next; });
                        }} /></TableCell>
                        <TableCell>{lines.length > 1 && <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => setLines(prev => prev.filter((_, i) => i !== idx))}><X className="w-3 h-3" /></Button>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Summary */}
            <Card className="bg-muted/30">
              <CardContent className="p-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-muted-foreground">Total Items:</span><p className="font-mono font-bold text-slate-900 dark:text-white">{totalItems}</p></div>
                  <div><span className="text-muted-foreground">Total Quantity:</span><p className="font-mono font-bold text-lg text-slate-900 dark:text-white">{totalQuantity}</p></div>
                </div>
              </CardContent>
            </Card>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            {isSR ? (
              <Button className="bg-gray-400 cursor-not-allowed" disabled>
                <Lock className="w-4 h-4 mr-1" />Approval Required
              </Button>
            ) : (
              <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={handleSave} disabled={saving || sameGodownError}>
                {saving ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />}{editItem ? "Update" : "Create"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-500" />Confirm Deactivate</DialogTitle></DialogHeader>
          <DialogDescription>Deactivate Stock Transfer {deleteItem?.transferNo}? It will be marked as inactive but preserved in the system.</DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteItem(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Deactivate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// MAIN APP LAYOUT
// ============================================================

function AppLayout() {
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { logout, user, isVatAuditor, hasAccess } = useAuth();
  const userRole = user?.role || "admin";
  const { theme, setTheme } = useTheme();
  const [searchOpen, setSearchOpen] = useState(false);

  // Cmd/Ctrl+K to open search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Build flat search items from sidebar config (RBAC-filtered)
  const searchItems = useMemo(() => {
    const items: { key: string; label: string; group: string; parent?: string }[] = [];
    for (const group of SIDEBAR_CONFIG) {
      if (!hasAccess(group.key)) continue;
      for (const item of group.items) {
        if (!hasItemAccess(user?.role as UserRole, item.key)) continue;
        items.push({ key: item.key, label: item.label, group: group.label, parent: item.parent });
      }
    }
    items.push({ key: "dashboard", label: "Dashboard", group: "Home" });
    items.push({ key: "profile", label: "My Profile", group: "Account" });
    if (user?.role === "admin") {
      items.push({ key: "change-password", label: "Change Password", group: "Account" });
    }
    items.push({ key: "audit-logs", label: "Audit Logs", group: "System" });
    // System Settings items are already included from SIDEBAR_CONFIG above, avoid duplicates
    return items;
  }, [hasAccess, user]);

  const navigate = (key: string) => {
    setCurrentPage(key);
    setMobileMenuOpen(false);
    setSearchOpen(false);
  };

  // Find current page config
  const findPageConfig = (key: string): SidebarItem | null => {
    for (const group of SIDEBAR_CONFIG) {
      for (const item of group.items) {
        if (item.key === key) return item;
      }
    }
    return null;
  };

  const currentPageConfig = findPageConfig(currentPage);
  const currentGroupLabel = currentPageConfig ? (SIDEBAR_CONFIG.find(g => g.items.some(i => i.key === currentPage))?.label || "") : (currentPage === "change-password" || currentPage === "profile") ? "Account" : "";

  // Render current page content
  const renderPage = () => {
    if (currentPage === "dashboard") return <DashboardAnalyticsPage onNavigate={(page) => setCurrentPage(page)} />;
    if (currentPage === "products") return <ProductsPage />;
    if (currentPage === "stock") return <StockPage />;
    if (currentPage === "stock-details") return <StockDetailsPage />;
    if (currentPage === "send-sms") return <SMSAnalyticsPage key={currentPage} initialTab="send" />;
    if (currentPage === "send-bulk-sms") return <SMSAnalyticsPage key={currentPage} initialTab="campaigns" />;
    if (currentPage === "sms-inbox") return <SMSAnalyticsPage key={currentPage} initialTab="inbox" />;
    if (currentPage === "sms-bills") return <SMSAnalyticsPage key={currentPage} initialTab="billing" />;
    if (currentPage === "sms-report") return <SMSAnalyticsPage key={currentPage} initialTab="dashboard" />;
    if (currentPage === "sms-settings") return <SMSAnalyticsPage key={currentPage} initialTab="settings" />;
    if (currentPage === "sms-bill-payments") return <SMSAnalyticsPage key={currentPage} initialTab="billing" />;
    if (currentPage === "change-password") return <ChangePasswordPage />;
    if (currentPage === "profile") return <ProfileCenter />;
    // GROUP 4: Logistical Inventory Management Pipelines — dedicated InventoryGroupPage component
    // Core Sales Module — dedicated SalesModulePage component (COGS, AR, Hire Installment Engine)
    const salesModuleKeys = new Set(["sales-orders", "hire-sales", "sales-returns"]);
    if (salesModuleKeys.has(currentPage)) return <SalesModulePage currentPage={currentPage} userRole={userRole} isVatAuditor={isVatAuditor} />;
    // Return & Replacement Module — dedicated ReturnReplacementModulePage (AP, COGS reversal, Financial Adjustment)
    const returnReplacementKeys = new Set(["purchase-returns", "replacements"]);
    if (returnReplacementKeys.has(currentPage)) return <ReturnReplacementModulePage currentPage={currentPage} userRole={userRole} isVatAuditor={isVatAuditor} />;
    const stockModuleKeys = new Set(["stock", "stock-details", "stock-transfers", "opening-stock", "batch-master", "valuation"]);
    if (stockModuleKeys.has(currentPage)) return <StockModulePage currentPage={currentPage} isVatAuditor={isVatAuditor} userRole={userRole} />;
    const inventoryGroupKeys = new Set(["company-ordersheet", "customer-ordersheet", "ordersheet-report", "purchase-orders", "auto-po"]);
    if (inventoryGroupKeys.has(currentPage)) return <InventoryGroupPage currentPage={currentPage} isVatAuditor={isVatAuditor} userRole={userRole} />;
    if (["expenses", "incomes", "cash-collections", "cash-deliveries", "bank-transactions", "expense-income-heads"].includes(currentPage)) return <AccountManagementPage key={currentPage} initialTab={currentPage} />;
    if (currentPage === "chart-of-accounts") return <ChartOfAccountsLedgerPage />;
    if (currentPage === "cash-in-hand") return <AccountingReportsPage key={currentPage} initialTab="cash-in-hand" />;
    if (currentPage === "trial-balance") return <AccountingReportsPage key={currentPage} initialTab="trial-balance" />;
    if (currentPage === "profit-loss") return <AccountingReportsPage key={currentPage} initialTab="profit-loss" />;
    if (currentPage === "balance-sheet") return <BalanceSheetPeriodClosePage key={currentPage} initialTab="balance-sheet" />;
    // GROUP 1: Investment & Asset Balances — dedicated InvestmentGroupPage component
    const investmentGroupKeys = new Set(["investment-heads", "investment", "fixed-asset", "current-asset", "liability-receive", "liability-pay", "liability-report"]);
    if (investmentGroupKeys.has(currentPage)) return <InvestmentGroupPage key={currentPage} initialTab={currentPage} />;

    // GROUP 2a: Structure Module — dedicated StructureModulePage with warehouse routing
    const structureKeys = new Set(["departments", "godowns", "segments", "capacities"]);
    if (structureKeys.has(currentPage)) return <StructureModulePage key={currentPage} activeModule={currentPage} userRole={userRole} isVatAuditor={isVatAuditor} />;

    // GROUP 2b: Interest Percentage Engine — dedicated InterestPercentageEnginePage
    if (currentPage === "interest-percentages") return <InterestPercentageEnginePage userRole={userRole} isVatAuditor={isVatAuditor} />;

    // GROUP 2c: Basic Foundation Modules — dedicated BasicModulesGroupPage component (Core Config only)
    const basicModuleKeys = new Set(["companies", "categories", "colors", "brands", "units", "products", "banks"]);
    if (basicModuleKeys.has(currentPage)) return <BasicModulesGroupPage activeModule={currentPage} />;

    // GROUP 2d: Operations Module — dedicated OperationsModulePage with Live Target Tracking, Payment Channel Mapping, Branded PDF/CSV
    const operationsModuleKeys = new Set(["sr-targets", "payment-options", "card-types", "card-type-setup"]);
    if (operationsModuleKeys.has(currentPage)) return <OperationsModulePage activeModule={currentPage} />;

    // GROUP 3: Personnel & CRM Ecosystem — dedicated PersonnelCRMGroupPage component
    const personnelCRMKeys = new Set(["designations", "employees", "employee-leaves", "customers", "suppliers"]);
    if (personnelCRMKeys.has(currentPage)) return <PersonnelCRMGroupPage activeModule={currentPage} />;

    // GROUP 5: Financial Auditing, Automated Ledgers & Data Integrity — dedicated FinancialAuditGroupPage component
    const financialAuditKeys = new Set(["dashboard-kpi", "fraud-detection", "ledger-auto-post", "inventory-aging", "product-lifecycle", "specialized-reports", "notifications-integrity"]);
    if (financialAuditKeys.has(currentPage)) return <FinancialAuditGroupPage key={currentPage} initialTab={currentPage} isVatAuditor={isVatAuditor} userRole={userRole} />;

    // GROUP 6: Core Performance Configurations & System Settings — dedicated components
    const systemSettingsKeys = new Set(["company-settings", "invoice-templates", "number-formats", "performance-cache"]);
    if (systemSettingsKeys.has(currentPage)) return <SystemSettingsGroupPage key={currentPage} initialTab={currentPage} />;
    if (currentPage === "audit-trail") return <AuditTrailViewer />;

    if (currentPage === "audit-logs") return <GenericModulePage title="Audit Logs" apiPath="/api/audit-logs" columns={[{ key: "action", label: "Action", type: "text" }, { key: "module", label: "Module", type: "text" }, { key: "recordLabel", label: "Record", type: "text" }, { key: "userName", label: "User", type: "text" }, { key: "createdAt", label: "Date", type: "date" }]} formFields={[]} />;

    // MIS Report Engine - route all MIS report sidebar items to dedicated component
    const misReportKeys = new Set([
      "employee-information-report", "product-information-report", "stock-details-report", "stock-summary-report",
      "stock-ledger-report", "stock-qty-report", "stock-forecast-product", "stock-forecast-concern",
      "stock-trends-report", "supplier-status-report", "sales-performance-report", "employee-records-report",
      "daily-purchase-report", "supplier-wise-purchase", "supplier-cash-delivery-report", "supplier-due-report",
      "model-wise-purchase", "vat-report", "daily-sales-report", "replacement-report", "model-wise-sales",
      "installment-collection", "upcoming-installment", "defaulting-customer", "default-customer-summary",
      "hire-account-details", "sr-wise-sales-report", "sr-wise-sales-details", "sr-wise-customer-due",
      "sr-wise-customer-summary", "sr-visit-report", "sr-wise-customer-status", "sr-wise-cash-collection",
      "sr-commission-report", "customer-wise-sales", "category-wise-customer-due",
      "customer-due-report", "customer-cash-collection", "customer-ledger-summary",
      "expense-report", "management-report", "advance-search", "bank-transaction-report", "bank-balance-report",
      "product-wise-benefit", "income-report", "adjustment-report", "transaction-summary",
      "monthly-transaction", "showroom-analysis", "bank-ledger-report", "transfer-report",
    ]);
    if (misReportKeys.has(currentPage)) return <MISReportEngine key={currentPage} initialReport={currentPage} />;

    // Customer & Supplier Ledger - dedicated page with aging buckets
    const customerLedgerKeys = new Set(["customer-ledger-report"]);
    const supplierLedgerKeys = new Set(["supplier-ledger-report"]);
    if (customerLedgerKeys.has(currentPage)) return <CustomerSupplierLedgerPage key={currentPage} initialTab="customer" />;
    if (supplierLedgerKeys.has(currentPage)) return <CustomerSupplierLedgerPage key={currentPage} initialTab="supplier" />;

    const config = currentPageConfig;
    if (!config) return <div className="text-center py-16 text-muted-foreground">Page not found</div>;

    if (config.isReport) return <GenericReportPage title={config.label} reportType={config.reportType || config.key} />;

    if (config.apiPath && config.columns && config.formFields) {
      return <GenericModulePage title={config.label} apiPath={config.apiPath} columns={config.columns} formFields={config.formFields} />;
    }

    // Fallback for pages without full config
    if (config.apiPath && config.columns) {
      return <GenericModulePage title={config.label} apiPath={config.apiPath} columns={config.columns} formFields={config.formFields || config.columns.map(c => ({ key: c.key, label: c.label, type: c.type === "currency" || c.type === "number" ? "number" : c.type === "boolean" ? "checkbox" : c.type === "date" ? "date" : c.type === "select" ? "select" : "text", required: c.key !== "isActive" && c.key !== "description" && c.key !== "notes" }))} />;
    }

    return <div className="text-center py-16 text-muted-foreground"><p className="text-lg font-medium">Page Not Available</p><p className="text-sm mt-1">{config.label} does not have a valid configuration</p></div>;
  };

  return (
    <div className="h-dvh flex flex-col bg-background overflow-hidden">
      {/* Header — Delegated to AppHeader component with live notification polling */}
      <AppHeader
        user={user}
        isVatAuditor={isVatAuditor}
        currentGroupLabel={currentGroupLabel}
        currentPage={currentPage}
        currentPageLabel={currentPageConfig?.label || ""}
        sidebarCollapsed={sidebarCollapsed}
        theme={theme || "light"}
        accessToken={authState.accessToken}
        tokenExpiry={authState.tokenExpiry}
        onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
        onNavigate={navigate}
        onToggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)}
        onOpenSearch={() => setSearchOpen(true)}
        onChangePassword={() => navigate("change-password")}
        onLogout={logout}
        onProfile={() => navigate("profile")}
      />

      {/* Search Dialog */}
      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen} title="Search Navigation" description="Search across all pages and modules">
        <CommandInput placeholder="Type to search pages..." />
        <CommandList>
          <CommandEmpty>No pages found.</CommandEmpty>
          {(() => {
            const grouped: Record<string, typeof searchItems> = {};
            searchItems.forEach(item => {
              if (!grouped[item.group]) grouped[item.group] = [];
              grouped[item.group].push(item);
            });
            return Object.entries(grouped).map(([group, items]) => (
              <CommandGroup key={group} heading={group}>
                {items.map(item => (
                  <CommandItem key={item.key} onSelect={() => navigate(item.key)} className="cursor-pointer">
                    <span>{item.parent ? `${item.parent} / ` : ""}{item.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ));
          })()}
        </CommandList>
      </CommandDialog>

      {/* Mobile sidebar — Sheet component for proper drawer behavior */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="p-0 w-[280px] sm:w-[300px] bg-sidebar border-sidebar-border">
          <Sidebar currentPage={currentPage} onNavigate={navigate} collapsed={false} onToggle={() => setMobileMenuOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Desktop sidebar */}
      <div className="hidden md:contents">
        <Sidebar currentPage={currentPage} onNavigate={navigate} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      </div>

      {/* VAT Auditor Banner */}
      {isVatAuditor && (
        <div className={`fixed top-12 sm:top-14 right-0 z-20 bg-amber-500 text-white text-center py-1.5 text-sm font-medium shadow-md transition-all duration-300 left-0 ${sidebarCollapsed ? 'md:left-16' : 'md:left-64'}`}>
          🔒 VAT Auditor Mode — Internal margins and adjustments are hidden
        </div>
      )}

      {/* Main content */}
      <main className={`flex-1 min-h-0 overflow-y-auto pt-12 sm:pt-14 transition-[margin] duration-300 ${sidebarCollapsed ? "md:ml-16" : "md:ml-64"} ${isVatAuditor ? "mt-10" : ""}`}>
        <div className="px-3 sm:px-4 md:px-6 max-w-[1600px] pb-8">
          <ErrorBoundary fallbackTitle={currentPageConfig?.label || "Page"}>
            <React.Suspense fallback={<LazyFallback name={currentPageConfig?.label} />}>
              {renderPage()}
            </React.Suspense>
          </ErrorBoundary>
        </div>
      </main>

      {/* Footer */}
      <footer className={`mt-auto bg-[#0a1628] dark:bg-[#060e1a] text-slate-400 text-center py-3 text-xs transition-[margin] duration-300 border-t border-white/5 ml-0 ${sidebarCollapsed ? "md:ml-16" : "md:ml-64"}`}>
        <span className="text-slate-500">© {new Date().getFullYear()}</span>{" "}<span className="text-slate-300 font-medium">NextGen Digital Studio</span>{" "}<span className="text-slate-500">— All Rights Reserved</span>
      </footer>
    </div>
  );
}

// ============================================================
// APP ENTRY POINT
// ============================================================

export default function ElectronicsMartApp() {
  const { isAuthenticated } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { requestAnimationFrame(() => setMounted(true)); }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0a1628] via-[#132240] to-[#0a1628]">
        <div className="text-center">
          <Package className="w-12 h-12 text-blue-400 animate-pulse mx-auto mb-4" />
          <p className="text-slate-400">Loading Electronics Mart...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return <LoginPage />;
  return <AppLayout />;
}
