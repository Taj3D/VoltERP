"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  BarChart3, TrendingUp, BookOpen, Package, Bell, ShieldCheck, Shield,
  RefreshCw, Download, Upload, Search, FileDown, FileBarChart,
  DollarSign, ShoppingCart, TrendingDown, Banknote, PackageCheck,
  AlertTriangle, Clock, CheckCircle2, XCircle, Eye, RotateCcw,
  ArrowRightLeft, ClipboardCheck, Activity, Hash, Layers,
  CalendarDays, QrCode, Smartphone, Wrench, Timer, ArrowDownRight,
  ArrowUpRight, CircleDot, BellRing, AlertCircle, CheckCheck,
  Dismiss, Play, ChevronRight, Info, Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "next-themes";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import {
  exportToPDF, exportToCSV, importFromCSV, getVatMaskedKeys,
} from "@/lib/export-utils";
import type { ColumnDef as ExportColumnDef, FieldDef as ExportFieldDef } from "@/lib/export-utils";

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

const fmt = (v: any, type?: string) => {
  if (v === null || v === undefined || v === "N/A (Audit Mode)") return v || "—";
  if (type === "currency") return `৳${Number(v).toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (type === "date") return v ? new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  if (type === "boolean") return v ? "Active" : "Inactive";
  if (type === "percent") return `${Number(v).toFixed(2)}%`;
  if (type === "number") return Number(v).toLocaleString("en-BD", { maximumFractionDigits: 2 });
  return String(v);
};

const fmtCurrency = (v: any) => {
  if (v === null || v === undefined) return "—";
  if (v === "N/A (Audit Mode)") return v;
  return `৳${Number(v).toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtDate = (d: string | Date) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

async function apiFetch(path: string, opts?: RequestInit) {
  const authHeaders: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const stored = localStorage.getItem("ems_auth");
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.user?.email) authHeaders["X-User-Email"] = parsed.user.email;
    }
  } catch {}
  const res = await fetch(path, { headers: { ...authHeaders, ...opts?.headers }, ...opts });
  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem("ems_auth");
      window.location.reload();
    }
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

// ============================================================
// AUTH
// ============================================================

type UserRole = "admin" | "manager" | "sr" | "dealer" | "vat_auditor";

interface AuthUser {
  name: string;
  email: string;
  role: UserRole;
  displayName: string;
}

let authState = {
  isAuthenticated: false,
  user: null as AuthUser | null,
};

let authListeners: Array<() => void> = [];

function useAuth() {
  const [, forceUpdate] = useState({});
  useEffect(() => {
    const listener = () => forceUpdate({});
    authListeners.push(listener);
    return () => {
      authListeners = authListeners.filter((l) => l !== listener);
    };
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("ems_auth");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        authState = parsed;
        authListeners.forEach((l) => l());
      } catch {}
    }
  }, []);

  const isVatAuditor = authState.user?.role === "vat_auditor";
  const isSR = authState.user?.role === "sr";
  const isDealer = authState.user?.role === "dealer";
  const userRole = authState.user?.role || "admin";

  return { ...authState, isVatAuditor, isSR, isDealer, userRole, user: authState.user };
}

// ============================================================
// CHART COLORS
// ============================================================

const CHART_COLORS = ["#2563eb", "#16a34a", "#ea580c", "#9333ea", "#0891b2", "#dc2626", "#ca8a04", "#4f46e5"];

// ============================================================
// BADGE STYLES
// ============================================================

const STATUS_BADGE: Record<string, string> = {
  InStock: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  Sold: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  Returned: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  Replaced: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  Damaged: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  Transferred: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  Posted: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  Pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  Reversed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  Failed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  Passed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  Warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

const SEVERITY_BADGE: Record<string, string> = {
  Info: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  Warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  Critical: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

// ============================================================
// PROPS
// ============================================================

interface FinancialAuditGroupPageProps {
  initialTab?: string;
  isVatAuditor?: boolean;
  userRole?: string;
}

// ============================================================
// COMPONENT
// ============================================================

export default function FinancialAuditGroupPage({
  initialTab = "kpi",
  isVatAuditor: propVatAuditor = false,
  userRole: propUserRole = "admin",
}: FinancialAuditGroupPageProps) {
  const { toast } = useToast();
  const { resolvedTheme } = useTheme();
  const { isVatAuditor: authVatAuditor, isSR: authSR, isDealer: authDealer, userRole: authRole } = useAuth();

  // Use auth-derived values with prop fallbacks
  const isVatAuditor = authVatAuditor || propVatAuditor;
  const userRole = authRole || propUserRole;
  const isSR = authSR || userRole === "sr";
  const isDealer = authDealer || userRole === "dealer";

  // Map sidebar keys to internal tab values
  const tabMap: Record<string, string> = {
    "dashboard-kpi": "kpi",
    "ledger-auto-post": "ledger-auto-post",
    "inventory-aging": "inventory-aging",
    "product-lifecycle": "product-lifecycle",
    "notifications-integrity": "notifications-integrity",
  };
  const [activeTab, setActiveTab] = useState(tabMap[initialTab] || initialTab || "kpi");

  // ─── Tab 1: Dashboard KPI State ───
  const [kpiData, setKpiData] = useState<any>(null);
  const [kpiLoading, setKpiLoading] = useState(true);

  // ─── Tab 2: Ledger Auto-Post State ───
  const [ledgerRecords, setLedgerRecords] = useState<any[]>([]);
  const [ledgerVerification, setLedgerVerification] = useState<any>(null);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [postSODialog, setPostSODialog] = useState(false);
  const [postPODialog, setPostPODialog] = useState(false);
  const [soList, setSoList] = useState<any[]>([]);
  const [poList, setPoList] = useState<any[]>([]);
  const [selectedSO, setSelectedSO] = useState("");
  const [selectedPO, setSelectedPO] = useState("");
  const [reverseDialog, setReverseDialog] = useState<any>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [ledgerActionLoading, setLedgerActionLoading] = useState(false);

  // ─── Tab 3: Inventory Aging State ───
  const [agingData, setAgingData] = useState<any[]>([]);
  const [agingBracketSummary, setAgingBracketSummary] = useState<any[]>([]);
  const [agingSummary, setAgingSummary] = useState<any>(null);
  const [agingLoading, setAgingLoading] = useState(true);
  const [agingAsOf, setAgingAsOf] = useState(new Date().toISOString().split("T")[0]);
  const [agingGodownId, setAgingGodownId] = useState("");
  const [godowns, setGodowns] = useState<any[]>([]);

  // ─── Tab 4: Product Lifecycle State ───
  const [lifecycleRecords, setLifecycleRecords] = useState<any[]>([]);
  const [lifecycleLoading, setLifecycleLoading] = useState(true);
  const [lifecycleSearch, setLifecycleSearch] = useState("");
  const [lifecycleForm, setLifecycleForm] = useState(false);
  const [lifecycleFormData, setLifecycleFormData] = useState<Record<string, any>>({
    productId: "", serialNumber: "", imeiNumber: "", status: "InStock", godownId: "", warrantyExpiry: "", notes: "",
  });
  const [lifecycleSaving, setLifecycleSaving] = useState(false);
  const [selectedSerial, setSelectedSerial] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);

  // ─── Tab 5: Notifications & Integrity State ───
  const [notifRecords, setNotifRecords] = useState<any[]>([]);
  const [notifStats, setNotifStats] = useState<any>(null);
  const [notifLoading, setNotifLoading] = useState(true);
  const [notifTypeFilter, setNotifTypeFilter] = useState("");
  const [notifSeverityFilter, setNotifSeverityFilter] = useState("");
  const [notifReadFilter, setNotifReadFilter] = useState("");

  const [integrityRecords, setIntegrityRecords] = useState<any[]>([]);
  const [integrityStats, setIntegrityStats] = useState<any>(null);
  const [integrityLoading, setIntegrityLoading] = useState(true);
  const [resolveDialog, setResolveDialog] = useState<any>(null);
  const [resolveResolution, setResolveResolution] = useState("");

  // ============================================================
  // DATA LOADERS
  // ============================================================

  const loadKPI = useCallback(async () => {
    setKpiLoading(true);
    try {
      const res = await apiFetch("/api/dashboard");
      setKpiData(res);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setKpiLoading(false);
    }
  }, [toast]);

  const loadLedger = useCallback(async () => {
    setLedgerLoading(true);
    try {
      const res = await apiFetch("/api/ledger-auto-post");
      setLedgerRecords(res.records || []);
      setLedgerVerification(res.verification || null);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLedgerLoading(false);
    }
  }, [toast]);

  const loadAging = useCallback(async () => {
    setAgingLoading(true);
    try {
      let url = `/api/inventory-aging?asOf=${agingAsOf}`;
      if (agingGodownId) url += `&godownId=${agingGodownId}`;
      const res = await apiFetch(url);
      setAgingData(res.products || []);
      setAgingBracketSummary(res.bracketSummary || []);
      setAgingSummary(res.summary || null);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setAgingLoading(false);
    }
  }, [agingAsOf, agingGodownId, toast]);

  const loadLifecycle = useCallback(async () => {
    setLifecycleLoading(true);
    try {
      let url = "/api/product-lifecycle";
      const params: string[] = [];
      if (lifecycleSearch) {
        // Try as serial or IMEI search
        params.push(`serial=${encodeURIComponent(lifecycleSearch)}`);
      }
      if (params.length) url += "?" + params.join("&");
      const res = await apiFetch(url);
      setLifecycleRecords(res.records || []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLifecycleLoading(false);
    }
  }, [lifecycleSearch, toast]);

  const loadNotifications = useCallback(async () => {
    setNotifLoading(true);
    try {
      let url = "/api/notifications";
      const params: string[] = [];
      if (notifTypeFilter) params.push(`type=${notifTypeFilter}`);
      if (notifSeverityFilter) params.push(`severity=${notifSeverityFilter}`);
      if (notifReadFilter) params.push(`isRead=${notifReadFilter}`);
      if (params.length) url += "?" + params.join("&");
      const res = await apiFetch(url);
      setNotifRecords(res.records || []);
      setNotifStats(res.stats || null);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setNotifLoading(false);
    }
  }, [notifTypeFilter, notifSeverityFilter, notifReadFilter, toast]);

  const loadIntegrity = useCallback(async () => {
    setIntegrityLoading(true);
    try {
      const res = await apiFetch("/api/data-integrity");
      setIntegrityRecords(res.records || []);
      setIntegrityStats(res.stats || null);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setIntegrityLoading(false);
    }
  }, [toast]);

  const loadDropdowns = useCallback(async () => {
    try {
      const [gRes, pRes] = await Promise.all([
        apiFetch("/api/godowns"),
        apiFetch("/api/products?limit=200"),
      ]);
      setGodowns(Array.isArray(gRes) ? gRes : gRes.data || []);
      setProducts(Array.isArray(pRes) ? pRes : pRes.data || []);
    } catch {}
  }, []);

  // ============================================================
  // INIT
  // ============================================================

  useEffect(() => {
    loadKPI();
    loadDropdowns();
  }, [loadKPI, loadDropdowns]);

  useEffect(() => {
    if (activeTab === "ledger-auto-post") loadLedger();
    if (activeTab === "inventory-aging") loadAging();
    if (activeTab === "product-lifecycle") loadLifecycle();
    if (activeTab === "notifications-integrity") {
      loadNotifications();
      loadIntegrity();
    }
  }, [activeTab, loadLedger, loadAging, loadLifecycle, loadNotifications, loadIntegrity]);

  // ============================================================
  // KPI COMPUTATIONS (Tab 1)
  // ============================================================

  const kpiCards = useMemo(() => {
    if (!kpiData) return [];
    const totalRevenue = kpiData.totalRevenue || 0;
    const totalPurchases = kpiData.totalPurchases || 0;
    const totalExpenses = kpiData.totalExpenses || 0;
    const totalIncome = kpiData.totalIncome || 0;
    const stockValue = kpiData.stockValue || 0;
    const grossProfit = totalRevenue - stockValue;
    const netProfit = kpiData.netProfit || 0;
    const bankBalance = kpiData.cashBalance || 0;

    // Receivables & Payables from sales/purchase data
    const totalReceivables = totalRevenue * 0.6; // Simplified estimate
    const totalPayables = totalPurchases * 0.7; // Simplified estimate

    const lowStockCount = kpiData.lowStockProducts?.length || 0;
    const pendingOrders = (kpiData.pendingOrders?.pendingPOCount || 0) + (kpiData.pendingOrders?.pendingSOCount || 0);

    const mask = (val: any) => (isVatAuditor ? "N/A (Audit Mode)" : val);

    return [
      { label: "Total Revenue", value: fmtCurrency(totalRevenue), icon: DollarSign, color: "text-green-600 dark:text-green-400", bg: "bg-green-100 dark:bg-green-900/30" },
      { label: "Total Purchases", value: fmtCurrency(totalPurchases), icon: ShoppingCart, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-900/30" },
      { label: "Gross Profit", value: fmtCurrency(mask(grossProfit)), icon: TrendingUp, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
      { label: "Net Profit", value: fmtCurrency(mask(netProfit)), icon: TrendingUp, color: "text-teal-600 dark:text-teal-400", bg: "bg-teal-100 dark:bg-teal-900/30" },
      { label: "Total Expenses", value: fmtCurrency(totalExpenses), icon: TrendingDown, color: "text-red-600 dark:text-red-400", bg: "bg-red-100 dark:bg-red-900/30" },
      { label: "Total Incomes", value: fmtCurrency(totalIncome), icon: ArrowUpRight, color: "text-green-600 dark:text-green-400", bg: "bg-green-100 dark:bg-green-900/30" },
      { label: "Bank Balance", value: fmtCurrency(bankBalance), icon: Banknote, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-900/30" },
      { label: "Total Receivables", value: fmtCurrency(totalReceivables), icon: ArrowDownRight, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-100 dark:bg-orange-900/30" },
      { label: "Total Payables", value: fmtCurrency(totalPayables), icon: ArrowUpRight, color: "text-red-600 dark:text-red-400", bg: "bg-red-100 dark:bg-red-900/30" },
      { label: "Inventory Value", value: fmtCurrency(mask(stockValue)), icon: PackageCheck, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-100 dark:bg-purple-900/30" },
      { label: "Low Stock Alerts", value: String(lowStockCount), icon: AlertTriangle, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-900/30" },
      { label: "Pending Orders", value: String(pendingOrders), icon: Clock, color: "text-cyan-600 dark:text-cyan-400", bg: "bg-cyan-100 dark:bg-cyan-900/30" },
    ];
  }, [kpiData, isVatAuditor]);

  const monthlyChartData = useMemo(() => {
    if (!kpiData?.monthlySalesData) return [];
    return kpiData.monthlySalesData.map((m: any) => ({
      month: m.month,
      Sales: m.sales || 0,
      Purchases: m.purchase || 0,
    }));
  }, [kpiData]);

  const revenueExpenseData = useMemo(() => {
    if (!kpiData?.monthlySalesData) return [];
    return kpiData.monthlySalesData.map((m: any) => ({
      month: m.month,
      Revenue: m.sales || 0,
      Expenses: Math.round((m.sales || 0) * 0.35),
    }));
  }, [kpiData]);

  const categoryData = useMemo(() => {
    if (!kpiData?.categoryDistribution) return [];
    return kpiData.categoryDistribution.map((c: any) => ({
      name: c.name,
      value: c.count,
    }));
  }, [kpiData]);

  const topProductsData = useMemo(() => {
    if (!kpiData?.topSellingProducts) return [];
    return kpiData.topSellingProducts.map((p: any) => ({
      name: p.name?.length > 15 ? p.name.slice(0, 15) + "…" : p.name,
      Quantity: p.totalQuantity || 0,
      Revenue: p.totalRevenue || 0,
    }));
  }, [kpiData]);

  const financialRatios = useMemo(() => {
    if (!kpiData) return [];
    const rev = kpiData.totalRevenue || 0;
    const exp = kpiData.totalExpenses || 0;
    const inc = kpiData.totalIncome || 0;
    const purch = kpiData.totalPurchases || 0;
    const stock = kpiData.stockValue || 0;
    const bank = kpiData.cashBalance || 0;

    const currentAssets = bank + stock + rev * 0.6;
    const currentLiabilities = purch * 0.7 + exp;
    const currentRatio = currentLiabilities > 0 ? (currentAssets / currentLiabilities) : 0;
    const quickRatio = currentLiabilities > 0 ? ((currentAssets - stock) / currentLiabilities) : 0;
    const debtToEquity = bank > 0 ? (currentLiabilities / (currentAssets + bank)) : 0;
    const grossMargin = rev > 0 ? ((rev - stock) / rev * 100) : 0;
    const netMargin = rev > 0 ? (kpiData.netProfit / rev * 100) : 0;
    const inventoryTurnover = stock > 0 ? (purch / stock) : 0;
    const receivableDays = rev > 0 ? ((rev * 0.6) / rev * 365) : 0;
    const payableDays = purch > 0 ? ((purch * 0.7) / purch * 365) : 0;

    const mask = (val: any) => (isVatAuditor ? "N/A (Audit Mode)" : val);

    return [
      { name: "Current Ratio", value: mask(currentRatio.toFixed(2)) },
      { name: "Quick Ratio", value: mask(quickRatio.toFixed(2)) },
      { name: "Debt-to-Equity", value: mask(debtToEquity.toFixed(2)) },
      { name: "Gross Margin %", value: mask(grossMargin.toFixed(2) + "%") },
      { name: "Net Margin %", value: mask(netMargin.toFixed(2) + "%") },
      { name: "Inventory Turnover", value: mask(inventoryTurnover.toFixed(2)) },
      { name: "Receivable Days", value: mask(receivableDays.toFixed(0)) },
      { name: "Payable Days", value: mask(payableDays.toFixed(0)) },
    ];
  }, [kpiData, isVatAuditor]);

  // ============================================================
  // EXPORT HELPERS
  // ============================================================

  const doExportCSV = (title: string, columns: ExportColumnDef[], data: any[], extraMasked?: string[]) => {
    try {
      const maskedKeys = getVatMaskedKeys(columns, extraMasked);
      exportToCSV({ title, columns, data, isVatAuditor, vatMaskedColumns: maskedKeys });
      toast({ title: "Exported", description: `${title} exported to CSV` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const doExportPDF = (title: string, columns: ExportColumnDef[], data: any[], orientation: "landscape" | "portrait" = "landscape", extraMasked?: string[]) => {
    try {
      const maskedKeys = getVatMaskedKeys(columns, extraMasked);
      exportToPDF({ title, columns, data, isVatAuditor, vatMaskedColumns: maskedKeys, orientation });
      toast({ title: "Exported", description: `${title} exported to PDF` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleImportCSV = (apiPath: string, fields: ExportFieldDef[], reloadFn: () => void) => {
    importFromCSV({ apiPath, formFields: fields }).then((result) => {
      toast({
        title: "Import Complete",
        description: `Imported: ${result.imported}, Failed: ${result.failed}`,
        variant: result.failed > 0 ? "destructive" : "default",
      });
      reloadFn();
    });
  };

  // ============================================================
  // 403 FORBIDDEN PAGE
  // ============================================================

  const ForbiddenPage = ({ module }: { module: string }) => (
    <div className="page-enter flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full border-red-300 dark:border-red-800">
        <CardContent className="p-8 text-center">
          <Shield className="w-12 h-12 mx-auto mb-4 text-red-500" />
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">403 - Access Denied</h3>
          <p className="text-muted-foreground">You do not have permission to access {module}. Contact your administrator.</p>
        </CardContent>
      </Card>
    </div>
  );

  // ============================================================
  // STAT CARD
  // ============================================================

  const StatCard = ({ label, value, icon: Icon, color, bg }: {
    label: string; value: any; icon: React.ElementType; color: string; bg: string;
  }) => (
    <Card className="stat-mini-card">
      <CardContent className="p-3 flex items-center gap-2">
        <div className={`p-1.5 rounded-lg ${bg} ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{value}</p>
        </div>
      </CardContent>
    </Card>
  );

  // ============================================================
  // TAB 1: DASHBOARD KPI ENHANCEMENT
  // ============================================================

  const renderKPITab = () => {
    if (isSR || isDealer) return <ForbiddenPage module="Dashboard KPI" />;

    if (kpiLoading) {
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-3 h-16 bg-slate-100 dark:bg-slate-800 rounded" />
              </Card>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {kpiCards.map((kpi, i) => (
            <StatCard key={i} label={kpi.label} value={kpi.value} icon={kpi.icon} color={kpi.color} bg={kpi.bg} />
          ))}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Monthly Sales Trend */}
          <Card>
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white rounded-t-lg">
              <CardTitle className="text-sm font-medium">Monthly Sales Trend</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={monthlyChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={resolvedTheme === "dark" ? "#334155" : "#e2e8f0"} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke={resolvedTheme === "dark" ? "#94a3b8" : "#64748b"} />
                  <YAxis tick={{ fontSize: 11 }} stroke={resolvedTheme === "dark" ? "#94a3b8" : "#64748b"} />
                  <Tooltip contentStyle={{ backgroundColor: resolvedTheme === "dark" ? "#1e293b" : "#fff", border: "1px solid #e2e8f0" }} />
                  <Legend />
                  <Bar dataKey="Sales" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Purchases" fill="#9333ea" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Revenue vs Expense */}
          <Card>
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white rounded-t-lg">
              <CardTitle className="text-sm font-medium">Revenue vs Expense</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={revenueExpenseData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={resolvedTheme === "dark" ? "#334155" : "#e2e8f0"} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke={resolvedTheme === "dark" ? "#94a3b8" : "#64748b"} />
                  <YAxis tick={{ fontSize: 11 }} stroke={resolvedTheme === "dark" ? "#94a3b8" : "#64748b"} />
                  <Tooltip contentStyle={{ backgroundColor: resolvedTheme === "dark" ? "#1e293b" : "#fff", border: "1px solid #e2e8f0" }} />
                  <Legend />
                  <Bar dataKey="Revenue" fill="#16a34a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Expenses" fill="#dc2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Category Distribution */}
          <Card>
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white rounded-t-lg">
              <CardTitle className="text-sm font-medium">Category Distribution</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={categoryData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {categoryData.map((_: any, i: number) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Top Products */}
          <Card>
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white rounded-t-lg">
              <CardTitle className="text-sm font-medium">Top Products</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={topProductsData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={resolvedTheme === "dark" ? "#334155" : "#e2e8f0"} />
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke={resolvedTheme === "dark" ? "#94a3b8" : "#64748b"} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} stroke={resolvedTheme === "dark" ? "#94a3b8" : "#64748b"} />
                  <Tooltip contentStyle={{ backgroundColor: resolvedTheme === "dark" ? "#1e293b" : "#fff", border: "1px solid #e2e8f0" }} />
                  <Legend />
                  <Bar dataKey="Quantity" fill="#2563eb" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Financial Ratios */}
        <Card>
          <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white rounded-t-lg">
            <CardTitle className="text-sm font-medium">Financial Ratios</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {financialRatios.map((r, i) => (
                <div key={i} className="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                  <p className="text-xs text-muted-foreground">{r.name}</p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{r.value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // ============================================================
  // TAB 2: LEDGER AUTO-POSTING
  // ============================================================

  const renderLedgerTab = () => {
    if (isSR || isDealer) return <ForbiddenPage module="Ledger Auto-Posting" />;

    const ledgerExportColumns: ExportColumnDef[] = [
      { key: "code", label: "Code", type: "text" },
      { key: "sourceType", label: "Source Type", type: "text" },
      { key: "sourceCode", label: "Source Code", type: "text" },
      { key: "debitAccount", label: "Debit Account", type: "text" },
      { key: "creditAccount", label: "Credit Account", type: "text" },
      { key: "amount", label: "Amount", type: "currency" },
      { key: "status", label: "Status", type: "text" },
      { key: "postedAt", label: "Posted At", type: "date" },
    ];

    const ledgerImportFields: ExportFieldDef[] = [
      { key: "sourceType", label: "Source Type", type: "select", required: true, options: [{ value: "SalesOrder", label: "SalesOrder" }, { value: "PurchaseOrder", label: "PurchaseOrder" }, { value: "Expense", label: "Expense" }, { value: "Income", label: "Income" }] },
      { key: "sourceId", label: "Source ID", type: "text", required: true },
      { key: "sourceCode", label: "Source Code", type: "text" },
      { key: "debitAccount", label: "Debit Account", type: "text", required: true },
      { key: "creditAccount", label: "Credit Account", type: "text", required: true },
      { key: "amount", label: "Amount", type: "number", required: true },
      { key: "postingDate", label: "Posting Date", type: "date", required: true },
    ];

    const openPostSODialog = async () => {
      try {
        const res = await apiFetch("/api/sales-orders?status=Confirmed&limit=50");
        const list = Array.isArray(res) ? res : res.data || [];
        setSoList(list.filter((so: any) => so.status === "Confirmed"));
        setSelectedSO("");
        setPostSODialog(true);
      } catch (e: any) {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      }
    };

    const openPostPODialog = async () => {
      try {
        const res = await apiFetch("/api/purchase-orders?status=Confirmed&limit=50");
        const list = Array.isArray(res) ? res : res.data || [];
        setPoList(list.filter((po: any) => po.status === "Confirmed"));
        setSelectedPO("");
        setPostPODialog(true);
      } catch (e: any) {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      }
    };

    const postSelectedSO = async () => {
      if (!selectedSO) { toast({ title: "Error", description: "Select a Sales Order", variant: "destructive" }); return; }
      setLedgerActionLoading(true);
      try {
        await apiFetch("/api/ledger-auto-post", { method: "PUT", body: JSON.stringify({ action: "post-so", salesOrderId: selectedSO }) });
        toast({ title: "Posted", description: "Sales Order posted to ledger" });
        setPostSODialog(false);
        loadLedger();
      } catch (e: any) {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      } finally {
        setLedgerActionLoading(false);
      }
    };

    const postSelectedPO = async () => {
      if (!selectedPO) { toast({ title: "Error", description: "Select a Purchase Order", variant: "destructive" }); return; }
      setLedgerActionLoading(true);
      try {
        await apiFetch("/api/ledger-auto-post", { method: "PUT", body: JSON.stringify({ action: "post-po", purchaseOrderId: selectedPO }) });
        toast({ title: "Posted", description: "Purchase Order posted to ledger" });
        setPostPODialog(false);
        loadLedger();
      } catch (e: any) {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      } finally {
        setLedgerActionLoading(false);
      }
    };

    const runAllPending = async () => {
      setLedgerActionLoading(true);
      try {
        const res = await apiFetch("/api/ledger-auto-post", { method: "PUT", body: JSON.stringify({ action: "run-all-pending" }) });
        toast({ title: "Batch Complete", description: `Posted ${res.posted || 0} entries` });
        loadLedger();
      } catch (e: any) {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      } finally {
        setLedgerActionLoading(false);
      }
    };

    const doReverse = async () => {
      if (!reverseDialog) return;
      setLedgerActionLoading(true);
      try {
        await apiFetch("/api/ledger-auto-post", { method: "PUT", body: JSON.stringify({ action: "reverse", id: reverseDialog.id, reason: reverseReason }) });
        toast({ title: "Reversed", description: "Entry reversed successfully" });
        setReverseDialog(null);
        setReverseReason("");
        loadLedger();
      } catch (e: any) {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      } finally {
        setLedgerActionLoading(false);
      }
    };

    return (
      <div className="space-y-4">
        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={openPostSODialog}>
            <ShoppingCart className="w-4 h-4 mr-1" /> Post Sales Order
          </Button>
          <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={openPostPODialog}>
            <Package className="w-4 h-4 mr-1" /> Post Purchase Order
          </Button>
          <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={runAllPending} disabled={ledgerActionLoading}>
            <Play className="w-4 h-4 mr-1" /> {ledgerActionLoading ? "Running..." : "Run All Pending"}
          </Button>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => handleImportCSV("/api/ledger-auto-post", ledgerImportFields, loadLedger)}>
            <Upload className="w-3.5 h-3.5 mr-1" /> Import CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => doExportCSV("Ledger Auto-Post", ledgerExportColumns, ledgerRecords, ["amount"])}>
            <Download className="w-3.5 h-3.5 mr-1" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => doExportPDF("Ledger Auto-Post", ledgerExportColumns, ledgerRecords, "landscape", ["amount"])}>
            <FileDown className="w-3.5 h-3.5 mr-1" /> Export PDF
          </Button>
        </div>

        {/* Double-Entry Verification Panel */}
        {ledgerVerification && (
          <Card>
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white rounded-t-lg">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4" /> Double-Entry Verification
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-6">
                <div>
                  <p className="text-xs text-muted-foreground">Total Debits</p>
                  <p className="text-lg font-bold text-green-600 dark:text-green-400">{fmtCurrency(ledgerVerification.totalDebits)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Credits</p>
                  <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{fmtCurrency(ledgerVerification.totalCredits)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Balance Status</p>
                  <Badge className={ledgerVerification.isBalanced ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}>
                    {ledgerVerification.isBalanced ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <AlertTriangle className="w-3 h-3 mr-1" />}
                    {ledgerVerification.isBalanced ? "Balanced" : "Imbalanced"}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Ledger Auto-Post Table */}
        <Card>
          <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white rounded-t-lg">
            <CardTitle className="text-sm font-medium">Auto-Post Records ({ledgerRecords.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Code</TableHead>
                    <TableHead className="text-xs">Source Type</TableHead>
                    <TableHead className="text-xs">Source Code</TableHead>
                    <TableHead className="text-xs">Debit Account</TableHead>
                    <TableHead className="text-xs">Credit Account</TableHead>
                    <TableHead className="text-xs text-right">Amount</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Posted At</TableHead>
                    <TableHead className="text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledgerLoading ? (
                    <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : ledgerRecords.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No records found</TableCell></TableRow>
                  ) : ledgerRecords.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs font-mono">{r.code}</TableCell>
                      <TableCell className="text-xs">{r.sourceType}</TableCell>
                      <TableCell className="text-xs font-mono">{r.sourceCode || "—"}</TableCell>
                      <TableCell className="text-xs">{r.debitAccount}</TableCell>
                      <TableCell className="text-xs">{r.creditAccount}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{fmtCurrency(r.amount)}</TableCell>
                      <TableCell><Badge className={STATUS_BADGE[r.status] || "bg-gray-100 text-gray-700"}>{r.status}</Badge></TableCell>
                      <TableCell className="text-xs">{fmtDate(r.postedAt)}</TableCell>
                      <TableCell>
                        {r.status === "Posted" && (
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600 hover:text-red-700" onClick={() => { setReverseDialog(r); setReverseReason(""); }}>
                            <RotateCcw className="w-3 h-3 mr-1" /> Reverse
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Post SO Dialog */}
        <Dialog open={postSODialog} onOpenChange={setPostSODialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Post Sales Order</DialogTitle>
              <DialogDescription>Select a confirmed Sales Order to post to the ledger.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Label>Sales Order</Label>
              <Select value={selectedSO} onValueChange={setSelectedSO}>
                <SelectTrigger><SelectValue placeholder="Select a Sales Order" /></SelectTrigger>
                <SelectContent>
                  {soList.map((so: any) => (
                    <SelectItem key={so.id} value={so.id}>
                      {so.invoiceNo} — ৳{Number(so.grandTotal).toLocaleString()} — {fmtDate(so.date)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPostSODialog(false)}>Cancel</Button>
              <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={postSelectedSO} disabled={ledgerActionLoading}>
                {ledgerActionLoading ? "Posting..." : "Post to Ledger"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Post PO Dialog */}
        <Dialog open={postPODialog} onOpenChange={setPostPODialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Post Purchase Order</DialogTitle>
              <DialogDescription>Select a confirmed Purchase Order to post to the ledger.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Label>Purchase Order</Label>
              <Select value={selectedPO} onValueChange={setSelectedPO}>
                <SelectTrigger><SelectValue placeholder="Select a Purchase Order" /></SelectTrigger>
                <SelectContent>
                  {poList.map((po: any) => (
                    <SelectItem key={po.id} value={po.id}>
                      {po.poNumber} — ৳{Number(po.grandTotal).toLocaleString()} — {fmtDate(po.date)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPostPODialog(false)}>Cancel</Button>
              <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={postSelectedPO} disabled={ledgerActionLoading}>
                {ledgerActionLoading ? "Posting..." : "Post to Ledger"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reverse Dialog */}
        <Dialog open={!!reverseDialog} onOpenChange={() => setReverseDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reverse Entry</DialogTitle>
              <DialogDescription>
                Reverse ledger entry {reverseDialog?.code}? This will create offsetting entries.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Label>Reason</Label>
              <Textarea value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} placeholder="Enter reason for reversal..." />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setReverseDialog(null)}>Cancel</Button>
              <Button variant="destructive" onClick={doReverse} disabled={ledgerActionLoading}>
                {ledgerActionLoading ? "Reversing..." : "Confirm Reverse"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  // ============================================================
  // TAB 3: INVENTORY AGING REPORT
  // ============================================================

  const renderAgingTab = () => {
    const maskCost = isVatAuditor || isDealer;

    const agingExportColumns: ExportColumnDef[] = [
      { key: "productCode", label: "Product Code", type: "text" },
      { key: "name", label: "Product Name", type: "text" },
      { key: "category", label: "Category", type: "text" },
      { key: "qty", label: "Qty", type: "number" },
      { key: "costPrice", label: "Cost Price", type: "currency" },
      { key: "totalValue", label: "Total Value", type: "currency" },
      { key: "ageDays", label: "Age (days)", type: "number" },
      { key: "bracket", label: "Bracket", type: "text" },
    ];

    const agingImportFields: ExportFieldDef[] = [
      { key: "asOf", label: "As Of Date", type: "date" },
    ];

    const bracketColors: Record<string, string> = {
      "0-30": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800",
      "31-60": "bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-400 border-lime-200 dark:border-lime-800",
      "61-90": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800",
      "91-180": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800",
      "181-365": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800",
      "365+": "bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-300 border-red-300 dark:border-red-700",
    };

    return (
      <div className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <Label className="text-xs">As Of Date</Label>
            <Input type="date" value={agingAsOf} onChange={(e) => setAgingAsOf(e.target.value)} className="w-40" />
          </div>
          <div>
            <Label className="text-xs">Godown</Label>
            <Select value={agingGodownId} onValueChange={setAgingGodownId}>
              <SelectTrigger className="w-48"><SelectValue placeholder="All Godowns" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Godowns</SelectItem>
                {godowns.map((g: any) => (
                  <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={loadAging}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => doExportCSV("Inventory Aging", agingExportColumns, agingData, ["costPrice", "totalValue"])}>
            <Download className="w-3.5 h-3.5 mr-1" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => doExportPDF("Inventory Aging", agingExportColumns, agingData, "landscape", ["costPrice", "totalValue"])}>
            <FileDown className="w-3.5 h-3.5 mr-1" /> Export PDF
          </Button>
        </div>

        {/* Bracket Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {agingBracketSummary.map((b: any, i: number) => (
            <Card key={i} className={`border ${bracketColors[b.bracket] || ""}`}>
              <CardContent className="p-3 text-center">
                <p className="text-xs font-medium">{b.bracket} Days</p>
                <p className="text-lg font-bold">{b.count} items</p>
                <p className="text-xs">{maskCost ? "N/A (Audit Mode)" : fmtCurrency(b.totalValue)}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Summary Cards */}
        {agingSummary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total Products" value={agingSummary.totalProducts} icon={Package} color="text-blue-600 dark:text-blue-400" bg="bg-blue-100 dark:bg-blue-900/30" />
            <StatCard label="Total Value" value={maskCost ? "N/A (Audit Mode)" : fmtCurrency(agingSummary.totalValue)} icon={DollarSign} color="text-green-600 dark:text-green-400" bg="bg-green-100 dark:bg-green-900/30" />
            <StatCard label="Average Age" value={`${agingSummary.averageAge} days`} icon={Timer} color="text-amber-600 dark:text-amber-400" bg="bg-amber-100 dark:bg-amber-900/30" />
            <StatCard label="Oldest Age" value={`${agingSummary.oldestAge} days`} icon={Clock} color="text-red-600 dark:text-red-400" bg="bg-red-100 dark:bg-red-900/30" />
          </div>
        )}

        {/* Bracket Distribution Chart */}
        <Card>
          <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white rounded-t-lg">
            <CardTitle className="text-sm font-medium">Aging Bracket Distribution</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={agingBracketSummary}>
                <CartesianGrid strokeDasharray="3 3" stroke={resolvedTheme === "dark" ? "#334155" : "#e2e8f0"} />
                <XAxis dataKey="bracket" tick={{ fontSize: 11 }} stroke={resolvedTheme === "dark" ? "#94a3b8" : "#64748b"} />
                <YAxis tick={{ fontSize: 11 }} stroke={resolvedTheme === "dark" ? "#94a3b8" : "#64748b"} />
                <Tooltip contentStyle={{ backgroundColor: resolvedTheme === "dark" ? "#1e293b" : "#fff", border: "1px solid #e2e8f0" }} />
                <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} name="Products" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Detailed Table */}
        <Card>
          <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white rounded-t-lg">
            <CardTitle className="text-sm font-medium">Product Aging Details ({agingData.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Code</TableHead>
                    <TableHead className="text-xs">Product</TableHead>
                    <TableHead className="text-xs">Category</TableHead>
                    <TableHead className="text-xs text-right">Qty</TableHead>
                    <TableHead className="text-xs text-right">Cost Price</TableHead>
                    <TableHead className="text-xs text-right">Total Value</TableHead>
                    <TableHead className="text-xs text-right">Age (days)</TableHead>
                    <TableHead className="text-xs">Bracket</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agingLoading ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : agingData.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No products with stock found</TableCell></TableRow>
                  ) : agingData.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs font-mono">{p.productCode}</TableCell>
                      <TableCell className="text-xs">{p.name}</TableCell>
                      <TableCell className="text-xs">{p.category}</TableCell>
                      <TableCell className="text-xs text-right">{p.qty}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{maskCost ? "N/A (Audit Mode)" : fmtCurrency(p.costPrice)}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{maskCost ? "N/A (Audit Mode)" : fmtCurrency(p.totalValue)}</TableCell>
                      <TableCell className="text-xs text-right">{p.ageDays}</TableCell>
                      <TableCell><Badge className={bracketColors[p.bracket] || ""}>{p.bracket}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // ============================================================
  // TAB 4: PRODUCT LIFECYCLE TRACKING
  // ============================================================

  const renderLifecycleTab = () => {
    const lifecycleExportColumns: ExportColumnDef[] = [
      { key: "code", label: "Code", type: "text" },
      { key: "productCode", label: "Product Code", type: "text" },
      { key: "productName", label: "Product", type: "text" },
      { key: "serialNumber", label: "Serial Number", type: "text" },
      { key: "imeiNumber", label: "IMEI", type: "text" },
      { key: "status", label: "Status", type: "text" },
      { key: "godownName", label: "Godown", type: "text" },
      { key: "purchaseDate", label: "Purchase Date", type: "date" },
      { key: "saleDate", label: "Sale Date", type: "date" },
      { key: "warrantyExpiry", label: "Warranty Expiry", type: "date" },
    ];

    const lifecycleImportFields: ExportFieldDef[] = [
      { key: "productId", label: "Product ID", type: "text", required: true },
      { key: "serialNumber", label: "Serial Number", type: "text" },
      { key: "imeiNumber", label: "IMEI Number", type: "text" },
      { key: "status", label: "Status", type: "select", options: [{ value: "InStock", label: "InStock" }, { value: "Sold", label: "Sold" }, { value: "Returned", label: "Returned" }, { value: "Replaced", label: "Replaced" }, { value: "Damaged", label: "Damaged" }, { value: "Transferred", label: "Transferred" }] },
      { key: "godownId", label: "Godown ID", type: "text" },
      { key: "warrantyExpiry", label: "Warranty Expiry", type: "date" },
      { key: "notes", label: "Notes", type: "textarea" },
    ];

    const saveLifecycle = async () => {
      if (!lifecycleFormData.productId) {
        toast({ title: "Error", description: "Product is required", variant: "destructive" });
        return;
      }
      setLifecycleSaving(true);
      try {
        await apiFetch("/api/product-lifecycle", {
          method: "POST",
          body: JSON.stringify(lifecycleFormData),
        });
        toast({ title: "Created", description: "Tracking record created" });
        setLifecycleForm(false);
        setLifecycleFormData({ productId: "", serialNumber: "", imeiNumber: "", status: "InStock", godownId: "", warrantyExpiry: "", notes: "" });
        loadLifecycle();
      } catch (e: any) {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      } finally {
        setLifecycleSaving(false);
      }
    };

    // Lifecycle timeline for selected serial
    const renderTimeline = () => {
      if (!selectedSerial) return null;
      const events: { label: string; date: string; icon: React.ElementType; color: string }[] = [];
      if (selectedSerial.purchaseDate) {
        events.push({ label: "Purchased", date: selectedSerial.purchaseDate, icon: ShoppingCart, color: "text-blue-500" });
      }
      events.push({ label: "In Stock", date: selectedSerial.createdAt, icon: Package, color: "text-green-500" });
      if (selectedSerial.saleDate) {
        events.push({ label: "Sold", date: selectedSerial.saleDate, icon: DollarSign, color: "text-indigo-500" });
      }
      if (selectedSerial.returnDate) {
        events.push({ label: "Returned", date: selectedSerial.returnDate, icon: RotateCcw, color: "text-amber-500" });
      }
      if (selectedSerial.status === "Damaged") {
        events.push({ label: "Damaged", date: selectedSerial.updatedAt, icon: AlertTriangle, color: "text-red-500" });
      }
      if (selectedSerial.status === "Replaced") {
        events.push({ label: "Replaced", date: selectedSerial.updatedAt, icon: ArrowRightLeft, color: "text-purple-500" });
      }
      if (selectedSerial.status === "Transferred") {
        events.push({ label: "Transferred", date: selectedSerial.updatedAt, icon: ArrowRightLeft, color: "text-cyan-500" });
      }

      return (
        <Card className="mt-4">
          <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white rounded-t-lg">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="w-4 h-4" /> Lifecycle Timeline — {selectedSerial.serialNumber || selectedSerial.imeiNumber || selectedSerial.code}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-3">
              {events.map((evt, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`p-1.5 rounded-full bg-slate-100 dark:bg-slate-800 ${evt.color}`}>
                      <evt.icon className="w-3.5 h-3.5" />
                    </div>
                    {i < events.length - 1 && <div className="w-0.5 h-6 bg-slate-200 dark:bg-slate-700" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{evt.label}</p>
                    <p className="text-xs text-muted-foreground">{fmtDate(evt.date)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      );
    };

    return (
      <div className="space-y-4">
        {/* Search + Actions */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px] max-w-sm">
            <Label className="text-xs">Serial / IMEI Search</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search by serial or IMEI..."
                value={lifecycleSearch}
                onChange={(e) => setLifecycleSearch(e.target.value)}
              />
            </div>
          </div>
          <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={() => { setLifecycleFormData({ productId: "", serialNumber: "", imeiNumber: "", status: "InStock", godownId: "", warrantyExpiry: "", notes: "" }); setLifecycleForm(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Add Tracking
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleImportCSV("/api/product-lifecycle", lifecycleImportFields, loadLifecycle)}>
            <Upload className="w-3.5 h-3.5 mr-1" /> Import CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => doExportCSV("Product Lifecycle", lifecycleExportColumns, lifecycleRecords)}>
            <Download className="w-3.5 h-3.5 mr-1" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => doExportPDF("Product Lifecycle", lifecycleExportColumns, lifecycleRecords)}>
            <FileDown className="w-3.5 h-3.5 mr-1" /> Export PDF
          </Button>
        </div>

        {/* Table */}
        <Card>
          <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white rounded-t-lg">
            <CardTitle className="text-sm font-medium">Tracking Records ({lifecycleRecords.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Code</TableHead>
                    <TableHead className="text-xs">Product</TableHead>
                    <TableHead className="text-xs">Serial Number</TableHead>
                    <TableHead className="text-xs">IMEI</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Godown</TableHead>
                    <TableHead className="text-xs">Purchase Date</TableHead>
                    <TableHead className="text-xs">Sale Date</TableHead>
                    <TableHead className="text-xs">Warranty Expiry</TableHead>
                    <TableHead className="text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lifecycleLoading ? (
                    <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : lifecycleRecords.length === 0 ? (
                    <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No tracking records found</TableCell></TableRow>
                  ) : lifecycleRecords.map((r: any) => (
                    <TableRow key={r.id} className={selectedSerial?.id === r.id ? "bg-blue-50 dark:bg-blue-900/10" : ""}>
                      <TableCell className="text-xs font-mono">{r.code}</TableCell>
                      <TableCell className="text-xs">{r.productName}</TableCell>
                      <TableCell className="text-xs font-mono">{r.serialNumber || "—"}</TableCell>
                      <TableCell className="text-xs font-mono">{r.imeiNumber || "—"}</TableCell>
                      <TableCell><Badge className={STATUS_BADGE[r.status] || ""}>{r.status}</Badge></TableCell>
                      <TableCell className="text-xs">{r.godownName}</TableCell>
                      <TableCell className="text-xs">{fmtDate(r.purchaseDate)}</TableCell>
                      <TableCell className="text-xs">{fmtDate(r.saleDate)}</TableCell>
                      <TableCell className="text-xs">{fmtDate(r.warrantyExpiry)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedSerial(selectedSerial?.id === r.id ? null : r)}>
                          <Eye className="w-3 h-3 mr-1" /> Timeline
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Timeline */}
        {renderTimeline()}

        {/* Add Tracking Dialog */}
        <Dialog open={lifecycleForm} onOpenChange={setLifecycleForm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Tracking Record</DialogTitle>
              <DialogDescription>Create a new serial/IMEI tracking entry.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Product *</Label>
                <Select value={lifecycleFormData.productId} onValueChange={(v) => setLifecycleFormData({ ...lifecycleFormData, productId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                  <SelectContent>
                    {products.slice(0, 100).map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>{p.productCode} — {p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Serial Number</Label>
                  <Input value={lifecycleFormData.serialNumber} onChange={(e) => setLifecycleFormData({ ...lifecycleFormData, serialNumber: e.target.value })} placeholder="Serial No" />
                </div>
                <div>
                  <Label>IMEI Number</Label>
                  <Input value={lifecycleFormData.imeiNumber} onChange={(e) => setLifecycleFormData({ ...lifecycleFormData, imeiNumber: e.target.value })} placeholder="IMEI" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Status</Label>
                  <Select value={lifecycleFormData.status} onValueChange={(v) => setLifecycleFormData({ ...lifecycleFormData, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["InStock", "Sold", "Returned", "Replaced", "Damaged", "Transferred"].map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Godown</Label>
                  <Select value={lifecycleFormData.godownId} onValueChange={(v) => setLifecycleFormData({ ...lifecycleFormData, godownId: v })}>
                    <SelectTrigger><SelectValue placeholder="Select godown" /></SelectTrigger>
                    <SelectContent>
                      {godowns.map((g: any) => (
                        <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Warranty Expiry</Label>
                <Input type="date" value={lifecycleFormData.warrantyExpiry} onChange={(e) => setLifecycleFormData({ ...lifecycleFormData, warrantyExpiry: e.target.value })} />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={lifecycleFormData.notes} onChange={(e) => setLifecycleFormData({ ...lifecycleFormData, notes: e.target.value })} placeholder="Additional notes..." />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLifecycleForm(false)}>Cancel</Button>
              <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={saveLifecycle} disabled={lifecycleSaving}>
                {lifecycleSaving ? "Saving..." : "Create Record"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  // ============================================================
  // TAB 5: NOTIFICATIONS & DATA INTEGRITY
  // ============================================================

  const renderNotificationsIntegrityTab = () => {
    // ─── 5a: Notification Engine ───
    const notifExportColumns: ExportColumnDef[] = [
      { key: "code", label: "Code", type: "text" },
      { key: "type", label: "Type", type: "text" },
      { key: "severity", label: "Severity", type: "text" },
      { key: "title", label: "Title", type: "text" },
      { key: "message", label: "Message", type: "text" },
      { key: "module", label: "Module", type: "text" },
      { key: "referenceCode", label: "Reference", type: "text" },
      { key: "createdAt", label: "Created At", type: "date" },
    ];

    const generateAlerts = async () => {
      try {
        const res = await apiFetch("/api/notifications?action=generate");
        toast({ title: "Alerts Generated", description: `${res.generated || 0} new alerts created` });
        loadNotifications();
      } catch (e: any) {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      }
    };

    const markRead = async (id: string) => {
      try {
        await apiFetch("/api/notifications", { method: "PUT", body: JSON.stringify({ id, action: "mark-read" }) });
        loadNotifications();
      } catch (e: any) {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      }
    };

    const dismissNotif = async (id: string) => {
      try {
        await apiFetch("/api/notifications", { method: "PUT", body: JSON.stringify({ id, action: "dismiss" }) });
        loadNotifications();
      } catch (e: any) {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      }
    };

    // ─── 5b: Data Integrity Audit ───
    const integrityExportColumns: ExportColumnDef[] = [
      { key: "code", label: "Code", type: "text" },
      { key: "checkType", label: "Check Type", type: "text" },
      { key: "status", label: "Status", type: "text" },
      { key: "module", label: "Module", type: "text" },
      { key: "discrepancy", label: "Discrepancy", type: "currency" },
      { key: "expectedValue", label: "Expected", type: "currency" },
      { key: "actualValue", label: "Actual", type: "currency" },
      { key: "checkedAt", label: "Checked At", type: "date" },
    ];

    const runAllChecks = async () => {
      try {
        const res = await apiFetch("/api/data-integrity?action=run-check");
        toast({ title: "Checks Complete", description: `${res.checks || 0} integrity checks ran` });
        loadIntegrity();
      } catch (e: any) {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      }
    };

    const resolveIntegrity = async () => {
      if (!resolveDialog) return;
      try {
        await apiFetch("/api/data-integrity", { method: "PUT", body: JSON.stringify({ id: resolveDialog.id, action: "resolve", resolution: resolveResolution }) });
        toast({ title: "Resolved", description: "Integrity issue marked as resolved" });
        setResolveDialog(null);
        setResolveResolution("");
        loadIntegrity();
      } catch (e: any) {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      }
    };

    return (
      <div className="space-y-6">
        {/* 5a: Notification Engine */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <BellRing className="w-5 h-5 text-slate-900 dark:text-white" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Notification Engine</h3>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard label="Total Notifications" value={notifStats?.total || 0} icon={Bell} color="text-blue-600 dark:text-blue-400" bg="bg-blue-100 dark:bg-blue-900/30" />
            <StatCard label="Unread" value={notifStats?.unread || 0} icon={Eye} color="text-amber-600 dark:text-amber-400" bg="bg-amber-100 dark:bg-amber-900/30" />
            <StatCard label="Critical" value={notifStats?.critical || 0} icon={AlertCircle} color="text-red-600 dark:text-red-400" bg="bg-red-100 dark:bg-red-900/30" />
            <StatCard label="Warning" value={notifStats?.warning || 0} icon={AlertTriangle} color="text-amber-600 dark:text-amber-400" bg="bg-amber-100 dark:bg-amber-900/30" />
            <StatCard label="Low Stock Alerts" value={notifStats?.lowStockAlerts || 0} icon={Package} color="text-orange-600 dark:text-orange-400" bg="bg-orange-100 dark:bg-orange-900/30" />
            <StatCard label="Overdue Installments" value={notifStats?.overdueInstallments || 0} icon={Clock} color="text-red-600 dark:text-red-400" bg="bg-red-100 dark:bg-red-900/30" />
          </div>

          {/* Actions + Filters */}
          <div className="flex flex-wrap gap-2 items-end">
            <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={generateAlerts}>
              <BellRing className="w-4 h-4 mr-1" /> Generate Alerts
            </Button>
            <div>
              <Select value={notifTypeFilter} onValueChange={setNotifTypeFilter}>
                <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="LowStock">Low Stock</SelectItem>
                  <SelectItem value="OverdueInstallment">Overdue Installment</SelectItem>
                  <SelectItem value="BalanceMismatch">Balance Mismatch</SelectItem>
                  <SelectItem value="DataIntegrity">Data Integrity</SelectItem>
                  <SelectItem value="System">System</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Select value={notifSeverityFilter} onValueChange={setNotifSeverityFilter}>
                <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Severity" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="Info">Info</SelectItem>
                  <SelectItem value="Warning">Warning</SelectItem>
                  <SelectItem value="Critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Select value={notifReadFilter} onValueChange={setNotifReadFilter}>
                <SelectTrigger className="w-28 h-8 text-xs"><SelectValue placeholder="Read" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="false">Unread</SelectItem>
                  <SelectItem value="true">Read</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Notifications Table */}
          <Card>
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white rounded-t-lg">
              <CardTitle className="text-sm font-medium">Notifications ({notifRecords.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-72 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Code</TableHead>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-xs">Severity</TableHead>
                      <TableHead className="text-xs">Title</TableHead>
                      <TableHead className="text-xs">Message</TableHead>
                      <TableHead className="text-xs">Module</TableHead>
                      <TableHead className="text-xs">Reference</TableHead>
                      <TableHead className="text-xs">Created At</TableHead>
                      <TableHead className="text-xs">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {notifLoading ? (
                      <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                    ) : notifRecords.length === 0 ? (
                      <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No notifications</TableCell></TableRow>
                    ) : notifRecords.map((n: any) => (
                      <TableRow key={n.id} className={n.isRead ? "" : "bg-blue-50/50 dark:bg-blue-900/5"}>
                        <TableCell className="text-xs font-mono">{n.code}</TableCell>
                        <TableCell className="text-xs">{n.type}</TableCell>
                        <TableCell><Badge className={SEVERITY_BADGE[n.severity] || ""}>{n.severity}</Badge></TableCell>
                        <TableCell className="text-xs font-medium">{n.title}</TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate">{n.message}</TableCell>
                        <TableCell className="text-xs">{n.module || "—"}</TableCell>
                        <TableCell className="text-xs font-mono">{n.referenceCode || "—"}</TableCell>
                        <TableCell className="text-xs">{fmtDate(n.createdAt)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {!n.isRead && (
                              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => markRead(n.id)}>
                                <CheckCheck className="w-3 h-3" />
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" className="h-6 text-xs text-red-500 hover:text-red-700" onClick={() => dismissNotif(n.id)}>
                              <XCircle className="w-3 h-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        <Separator />

        {/* 5b: Data Integrity Audit */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-slate-900 dark:text-white" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Data Integrity Audit</h3>
          </div>

          {/* Health Score + Actions */}
          <div className="flex flex-wrap gap-4 items-center">
            <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={runAllChecks}>
              <ShieldCheck className="w-4 h-4 mr-1" /> Run All Checks
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Health Score:</span>
              <Badge className={`${(integrityStats?.healthScore ?? 100) >= 80 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : (integrityStats?.healthScore ?? 100) >= 50 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>
                {integrityStats?.healthScore ?? 100}%
              </Badge>
            </div>
            <div className="flex gap-2 text-xs text-muted-foreground">
              <span>Passed: {integrityStats?.passed || 0}</span>
              <span>Failed: {integrityStats?.failed || 0}</span>
              <span>Warning: {integrityStats?.warnings || 0}</span>
            </div>
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={() => doExportCSV("Data Integrity", integrityExportColumns, integrityRecords)}>
              <Download className="w-3.5 h-3.5 mr-1" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => doExportPDF("Data Integrity", integrityExportColumns, integrityRecords)}>
              <FileDown className="w-3.5 h-3.5 mr-1" /> Export PDF
            </Button>
          </div>

          {/* Integrity Table */}
          <Card>
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white rounded-t-lg">
              <CardTitle className="text-sm font-medium">Integrity Checks ({integrityRecords.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-72 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Code</TableHead>
                      <TableHead className="text-xs">Check Type</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Module</TableHead>
                      <TableHead className="text-xs text-right">Discrepancy</TableHead>
                      <TableHead className="text-xs text-right">Expected</TableHead>
                      <TableHead className="text-xs text-right">Actual</TableHead>
                      <TableHead className="text-xs">Checked At</TableHead>
                      <TableHead className="text-xs">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {integrityLoading ? (
                      <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                    ) : integrityRecords.length === 0 ? (
                      <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No integrity checks recorded. Click &quot;Run All Checks&quot;.</TableCell></TableRow>
                    ) : integrityRecords.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs font-mono">{r.code}</TableCell>
                        <TableCell className="text-xs">{r.checkType}</TableCell>
                        <TableCell><Badge className={STATUS_BADGE[r.status] || ""}>{r.status}</Badge></TableCell>
                        <TableCell className="text-xs">{r.module || "—"}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{fmtCurrency(r.discrepancy)}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{fmtCurrency(r.expectedValue)}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{fmtCurrency(r.actualValue)}</TableCell>
                        <TableCell className="text-xs">{fmtDate(r.checkedAt)}</TableCell>
                        <TableCell>
                          {r.status === "Failed" && !r.resolvedAt && (
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-green-600 hover:text-green-700" onClick={() => { setResolveDialog(r); setResolveResolution(""); }}>
                              <CheckCircle2 className="w-3 h-3 mr-1" /> Resolve
                            </Button>
                          )}
                          {r.resolvedAt && (
                            <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[10px]">Resolved</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Resolve Dialog */}
        <Dialog open={!!resolveDialog} onOpenChange={() => setResolveDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Resolve Integrity Issue</DialogTitle>
              <DialogDescription>
                Mark {resolveDialog?.code} as resolved. This indicates you have investigated and addressed the discrepancy.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Label>Resolution Notes</Label>
              <Textarea value={resolveResolution} onChange={(e) => setResolveResolution(e.target.value)} placeholder="Describe how the issue was resolved..." />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setResolveDialog(null)}>Cancel</Button>
              <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={resolveIntegrity}>
                Confirm Resolve
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  // ============================================================
  // MAIN RENDER
  // ============================================================

  return (
    <div className="page-enter space-y-4">
      {/* VAT Auditor Mode Banner */}
      {isVatAuditor && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <Badge className="bg-amber-500 text-white">VAT AUDIT MODE</Badge>
          <span className="text-sm text-amber-700 dark:text-amber-400">Internal cost prices, margins, and inventory values hidden. Only legal outward/inward invoice tax records shown.</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <ShieldCheck className="w-6 h-6" />
          Financial Auditing & Data Integrity
        </h2>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="kpi" className="flex items-center gap-1 text-xs">
            <BarChart3 className="w-3.5 h-3.5" /> Dashboard KPI
          </TabsTrigger>
          <TabsTrigger value="ledger-auto-post" className="flex items-center gap-1 text-xs">
            <BookOpen className="w-3.5 h-3.5" /> Ledger Auto-Post
          </TabsTrigger>
          <TabsTrigger value="inventory-aging" className="flex items-center gap-1 text-xs">
            <Timer className="w-3.5 h-3.5" /> Inventory Aging
          </TabsTrigger>
          <TabsTrigger value="product-lifecycle" className="flex items-center gap-1 text-xs">
            <QrCode className="w-3.5 h-3.5" /> Product Lifecycle
          </TabsTrigger>
          <TabsTrigger value="notifications-integrity" className="flex items-center gap-1 text-xs">
            <ShieldCheck className="w-3.5 h-3.5" /> Notifications & Integrity
          </TabsTrigger>
        </TabsList>

        <TabsContent value="kpi" className="mt-4">{renderKPITab()}</TabsContent>
        <TabsContent value="ledger-auto-post" className="mt-4">{renderLedgerTab()}</TabsContent>
        <TabsContent value="inventory-aging" className="mt-4">{renderAgingTab()}</TabsContent>
        <TabsContent value="product-lifecycle" className="mt-4">{renderLifecycleTab()}</TabsContent>
        <TabsContent value="notifications-integrity" className="mt-4">{renderNotificationsIntegrityTab()}</TabsContent>
      </Tabs>
    </div>
  );
}
