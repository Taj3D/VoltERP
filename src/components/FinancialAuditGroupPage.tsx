"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  BarChart3, TrendingUp, BookOpen, Package, Bell, ShieldCheck, Shield,
  RefreshCw, Download, Upload, Search, FileDown, FileBarChart,
  DollarSign, ShoppingCart, TrendingDown, Banknote, PackageCheck,
  AlertTriangle, Clock, CheckCircle2, XCircle, Eye, RotateCcw,
  ArrowRightLeft, ClipboardCheck, Activity, Hash, Layers, Copy,
  CalendarDays, QrCode, Smartphone, Wrench, Timer, ArrowDownRight,
  ArrowUpRight, CircleDot, BellRing, AlertCircle, CheckCheck,
  X, Play, ChevronRight, Info, Plus, Activity as Gauge,
  Search as Fingerprint, FileText as Receipt, Coins as HandCoins,
  Users, CreditCard, Filter, ChevronDown, ChevronUp, Calculator,
  PieChart as PieChartIcon, Target, Award, CircleDollarSign, Wallet,
  BarChart2, ScanSearch,
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
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "next-themes";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts";
import {
  exportToPDF, exportToCSV, importFromCSV, getVatMaskedKeys, exportAuditReportPDF,
} from "@/lib/export-utils";
import type { ColumnDef as ExportColumnDef, FieldDef as ExportFieldDef, CompanyProfile } from "@/lib/export-utils";

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

const bdCurrencyFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmt = (v: any, type?: string) => {
  if (v === null || v === undefined || v === "N/A (Audit Mode)") return v || "—";
  if (type === "currency") return `৳${bdCurrencyFmt.format(Number(v))}`;
  if (type === "date") return v ? new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  if (type === "boolean") return v ? "Active" : "Inactive";
  if (type === "percent") return `${Number(v).toFixed(2)}%`;
  if (type === "number") return bdCurrencyFmt.format(Number(v));
  return String(v);
};

const fmtCurrency = (v: any) => {
  if (v === null || v === undefined) return "—";
  if (v === "N/A (Audit Mode)") return v;
  return `৳${bdCurrencyFmt.format(Number(v))}`;
};

const AUDIT_MASK = "N/A (Audit Mode)";

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
    if (res.status === 401) { localStorage.removeItem("ems_auth"); window.location.reload(); }
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
    return () => { authListeners = authListeners.filter((l) => l !== listener); };
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
const AGE_COLORS = ["#22c55e", "#84cc16", "#eab308", "#f97316", "#ef4444", "#7f1d1d"];

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
  Overdue: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  Paid: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  Partial: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  WrittenOff: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
  Active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  Confirmed: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
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

  const isVatAuditor = authVatAuditor || propVatAuditor;
  const userRole = authRole || propUserRole;
  const isSR = authSR || userRole === "sr";
  const isDealer = authDealer || userRole === "dealer";
  const isAdmin = userRole === "admin";
  const isManager = userRole === "manager";

  const tabMap: Record<string, string> = {
    "dashboard-kpi": "kpi",
    "fraud-detection": "fraud-detection",
    "ledger-auto-post": "ledger-auto-post",
    "inventory-aging": "inventory-aging",
    "product-lifecycle": "product-lifecycle",
    "specialized-reports": "specialized-reports",
    "notifications-integrity": "notifications-integrity",
  };
  const [activeTab, setActiveTab] = useState(tabMap[initialTab] || initialTab || "kpi");

  // ─── Tab 1: Dashboard KPI ───
  const [kpiData, setKpiData] = useState<any>(null);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [healthScore, setHealthScore] = useState<number | null>(null);

  // ─── Tab 2: Fraud Detection ───
  const [fraudData, setFraudData] = useState<any>(null);
  const [fraudLoading, setFraudLoading] = useState(true);

  // ─── Tab 3: Ledger Auto-Post ───
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

  // ─── Tab 4: Inventory Aging ───
  const [agingData, setAgingData] = useState<any[]>([]);
  const [agingBracketSummary, setAgingBracketSummary] = useState<any[]>([]);
  const [agingSummary, setAgingSummary] = useState<any>(null);
  const [agingLoading, setAgingLoading] = useState(true);
  const [agingAsOf, setAgingAsOf] = useState(new Date().toISOString().split("T")[0]);
  const [agingGodownId, setAgingGodownId] = useState("");
  const [godowns, setGodowns] = useState<any[]>([]);

  // ─── Tab 5: Product Lifecycle ───
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

  // ─── Tab 6: Specialized Reports ───
  const [specSubTab, setSpecSubTab] = useState("hire-purchase");
  const [hireData, setHireData] = useState<any>(null);
  const [hireLoading, setHireLoading] = useState(false);
  const [commissionData, setCommissionData] = useState<any>(null);
  const [commissionLoading, setCommissionLoading] = useState(false);
  const [collectionData, setCollectionData] = useState<any>(null);
  const [collectionLoading, setCollectionLoading] = useState(false);
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const [specFrom, setSpecFrom] = useState(monthStart.toISOString().split("T")[0]);
  const [specTo, setSpecTo] = useState(today.toISOString().split("T")[0]);
  const [specEmployeeId, setSpecEmployeeId] = useState("");
  const [specCustomerId, setSpecCustomerId] = useState("");
  const [specStatus, setSpecStatus] = useState("");
  const [employees, setEmployees] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);

  // ─── Tab 7: Notifications & Integrity ───
  const [notifRecords, setNotifRecords] = useState<any[]>([]);
  const [notifStats, setNotifStats] = useState<any>(null);
  const [notifLoading, setNotifLoading] = useState(true);
  const [notifTypeFilter, setNotifTypeFilter] = useState("");
  const [notifSeverityFilter, setNotifSeverityFilter] = useState("");
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);

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

  const loadFraudDetection = useCallback(async () => {
    setFraudLoading(true);
    try {
      const res = await apiFetch("/api/financial-audit/fraud-detection");
      setFraudData(res);
      if (res.overallHealthScore !== undefined) setHealthScore(res.overallHealthScore);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setFraudLoading(false);
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
      if (lifecycleSearch) params.push(`serial=${encodeURIComponent(lifecycleSearch)}`);
      if (params.length) url += "?" + params.join("&");
      const res = await apiFetch(url);
      setLifecycleRecords(res.records || []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLifecycleLoading(false);
    }
  }, [lifecycleSearch, toast]);

  const loadHirePurchase = useCallback(async () => {
    setHireLoading(true);
    try {
      let url = `/api/financial-audit/hire-purchase-report?from=${specFrom}&to=${specTo}`;
      if (specCustomerId) url += `&customerId=${specCustomerId}`;
      if (specStatus) url += `&status=${specStatus}`;
      const res = await apiFetch(url);
      setHireData(res);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setHireLoading(false);
    }
  }, [specFrom, specTo, specCustomerId, specStatus, toast]);

  const loadCommission = useCallback(async () => {
    setCommissionLoading(true);
    try {
      let url = `/api/financial-audit/commission-report?from=${specFrom}&to=${specTo}`;
      if (specEmployeeId) url += `&employeeId=${specEmployeeId}`;
      const res = await apiFetch(url);
      setCommissionData(res);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setCommissionLoading(false);
    }
  }, [specFrom, specTo, specEmployeeId, toast]);

  const loadCollection = useCallback(async () => {
    setCollectionLoading(true);
    try {
      let url = `/api/financial-audit/collection-matrix?from=${specFrom}&to=${specTo}`;
      if (specCustomerId) url += `&customerId=${specCustomerId}`;
      const res = await apiFetch(url);
      setCollectionData(res);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setCollectionLoading(false);
    }
  }, [specFrom, specTo, specCustomerId, toast]);

  const loadNotifications = useCallback(async () => {
    setNotifLoading(true);
    try {
      let url = "/api/notifications";
      const params: string[] = [];
      if (notifTypeFilter) params.push(`type=${notifTypeFilter}`);
      if (notifSeverityFilter) params.push(`severity=${notifSeverityFilter}`);
      if (params.length) url += "?" + params.join("&");
      const res = await apiFetch(url);
      setNotifRecords(res.data || res.records || []);
      setNotifStats(res.stats || null);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setNotifLoading(false);
    }
  }, [notifTypeFilter, notifSeverityFilter, toast]);

  const loadIntegrity = useCallback(async () => {
    setIntegrityLoading(true);
    try {
      const res = await apiFetch("/api/data-integrity");
      setIntegrityRecords(res.logs || res.records || []);
      setIntegrityStats(res.stats || null);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setIntegrityLoading(false);
    }
  }, [toast]);

  const loadDropdowns = useCallback(async () => {
    try {
      const [gRes, pRes, cRes, eRes, custRes, brandRes] = await Promise.all([
        apiFetch("/api/godowns"),
        apiFetch("/api/products?limit=200"),
        apiFetch("/api/company-branding").catch(() => null),
        apiFetch("/api/employees?limit=200").catch(() => null),
        apiFetch("/api/customers?limit=200").catch(() => null),
        apiFetch("/api/financial-audit/fraud-detection").catch(() => null),
      ]);
      setGodowns(Array.isArray(gRes) ? gRes : gRes.data || []);
      setProducts(Array.isArray(pRes) ? pRes : pRes.data || []);
      if (cRes) setCompanyProfile(cRes);
      if (eRes) setEmployees(Array.isArray(eRes) ? eRes : eRes.data || []);
      if (custRes) setCustomers(Array.isArray(custRes) ? custRes : custRes.data || []);
      if (brandRes) { setFraudData(brandRes); if (brandRes.overallHealthScore !== undefined) setHealthScore(brandRes.overallHealthScore); }
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
    if (activeTab === "fraud-detection" && !fraudData) loadFraudDetection();
    if (activeTab === "ledger-auto-post") loadLedger();
    if (activeTab === "inventory-aging") loadAging();
    if (activeTab === "product-lifecycle") loadLifecycle();
    if (activeTab === "notifications-integrity") { loadNotifications(); loadIntegrity(); }
  }, [activeTab]);

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
    const cogs = kpiData.cogs || 0;
    const grossProfit = kpiData.grossProfit !== undefined ? kpiData.grossProfit : (totalRevenue - cogs);
    const netProfit = kpiData.netProfit || 0;
    const bankBalance = kpiData.cashBalance || 0;
    const totalReceivables = kpiData.totalReceivables || 0;
    const totalPayables = kpiData.totalPayables || 0;
    const lowStockCount = kpiData.lowStockProducts?.length || 0;
    const pendingOrders = (kpiData.pendingOrders?.pendingPOCount || 0) + (kpiData.pendingOrders?.pendingSOCount || 0);

    const maskMoney = (val: any) => (isVatAuditor ? AUDIT_MASK : val);
    const fmtMasked = (val: any) => isVatAuditor ? AUDIT_MASK : fmtCurrency(val);

    return [
      { label: "Total Revenue", value: fmtMasked(totalRevenue), icon: DollarSign, color: "text-green-600 dark:text-green-400", bg: "bg-green-100 dark:bg-green-900/30" },
      { label: "Total Purchases", value: fmtMasked(totalPurchases), icon: ShoppingCart, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-900/30" },
      { label: "Gross Profit", value: fmtMasked(maskMoney(grossProfit)), icon: TrendingUp, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
      { label: "Net Profit", value: fmtMasked(maskMoney(netProfit)), icon: TrendingUp, color: "text-teal-600 dark:text-teal-400", bg: "bg-teal-100 dark:bg-teal-900/30" },
      { label: "Total Expenses", value: fmtMasked(totalExpenses), icon: TrendingDown, color: "text-red-600 dark:text-red-400", bg: "bg-red-100 dark:bg-red-900/30" },
      { label: "Total Incomes", value: fmtMasked(totalIncome), icon: ArrowUpRight, color: "text-green-600 dark:text-green-400", bg: "bg-green-100 dark:bg-green-900/30" },
      { label: "Bank Balance", value: fmtMasked(bankBalance), icon: Banknote, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-900/30" },
      { label: "Total Receivables", value: fmtMasked(totalReceivables), icon: ArrowDownRight, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-100 dark:bg-orange-900/30" },
      { label: "Total Payables", value: fmtMasked(totalPayables), icon: ArrowUpRight, color: "text-red-600 dark:text-red-400", bg: "bg-red-100 dark:bg-red-900/30" },
      { label: "Inventory Value", value: fmtMasked(maskMoney(stockValue)), icon: PackageCheck, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-100 dark:bg-purple-900/30" },
      { label: "Low Stock Alerts", value: String(lowStockCount), icon: AlertTriangle, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-900/30" },
      { label: "Pending Orders", value: String(pendingOrders), icon: Clock, color: "text-cyan-600 dark:text-cyan-400", bg: "bg-cyan-100 dark:bg-cyan-900/30" },
    ];
  }, [kpiData, isVatAuditor]);

  const monthlyChartData = useMemo(() => {
    if (!kpiData?.monthlySalesData) return [];
    return kpiData.monthlySalesData.map((m: any) => ({ month: m.month, Sales: m.sales || 0, Purchases: m.purchase || 0 }));
  }, [kpiData]);

  const revenueExpenseData = useMemo(() => {
    if (!kpiData?.monthlySalesData) return [];
    return kpiData.monthlySalesData.map((m: any) => ({ month: m.month, Revenue: m.sales || 0, Expenses: m.expenses || m.purchase || 0 }));
  }, [kpiData]);

  const categoryData = useMemo(() => {
    if (!kpiData?.categoryDistribution) return [];
    return kpiData.categoryDistribution.map((c: any) => ({ name: c.name, value: c.count }));
  }, [kpiData]);

  const topProductsData = useMemo(() => {
    if (!kpiData?.topSellingProducts) return [];
    return kpiData.topSellingProducts.map((p: any) => ({
      name: p.name?.length > 15 ? p.name.slice(0, 15) + "…" : p.name,
      Quantity: p.totalQuantity || 0, Revenue: p.totalRevenue || 0,
    }));
  }, [kpiData]);

  const financialRatios = useMemo(() => {
    if (!kpiData) return [];
    const rev = kpiData.totalRevenue || 0;
    const exp = kpiData.totalExpenses || 0;
    const stock = kpiData.stockValue || 0;
    const cogs = kpiData.cogs || 0;
    const bank = kpiData.cashBalance || 0;
    const receivables = kpiData.totalReceivables || 0;
    const payables = kpiData.totalPayables || 0;
    const currentAssets = bank + stock + receivables;
    const currentLiabilities = payables + exp;
    const currentRatio = currentLiabilities > 0 ? (currentAssets / currentLiabilities) : 0;
    const quickRatio = currentLiabilities > 0 ? ((currentAssets - stock) / currentLiabilities) : 0;
    const grossMargin = rev > 0 ? ((rev - cogs) / rev * 100) : 0;
    const netMargin = rev > 0 ? (kpiData.netProfit / rev * 100) : 0;
    const inventoryTurnover = stock > 0 ? (kpiData.totalPurchases / stock) : 0;
    const receivableDays = rev > 0 ? (receivables / rev * 365) : 0;
    const payableDays = (kpiData.totalPurchases || 0) > 0 ? (payables / kpiData.totalPurchases * 365) : 0;
    const mask = (val: any) => (isVatAuditor ? AUDIT_MASK : val);
    return [
      { name: "Current Ratio", value: mask(currentRatio.toFixed(2)) },
      { name: "Quick Ratio", value: mask(quickRatio.toFixed(2)) },
      { name: "Gross Margin %", value: mask(grossMargin.toFixed(2) + "%") },
      { name: "Net Margin %", value: mask(netMargin.toFixed(2) + "%") },
      { name: "Inventory Turnover", value: mask(inventoryTurnover.toFixed(2)) },
      { name: "Receivable Days", value: mask(receivableDays.toFixed(0)) },
      { name: "Payable Days", value: mask(payableDays.toFixed(0)) },
      { name: "Health Score", value: healthScore !== null ? mask(healthScore + "/100") : mask("—") },
    ];
  }, [kpiData, isVatAuditor, healthScore]);

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
      const userName = authState.user?.displayName || authState.user?.name || "";
      exportToPDF({
        title, columns, data, isVatAuditor, vatMaskedColumns: maskedKeys, orientation,
        company: companyProfile || undefined,
        financialFooter: { preparedBy: userName, checkedBy: "", authorizedBy: "", printedBy: userName || "System" },
      });
      toast({ title: "Exported", description: `${title} exported to PDF` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const doExportAuditPDF = (title: string, columns: ExportColumnDef[], data: any[], integrityScore?: number) => {
    try {
      const maskedKeys = getVatMaskedKeys(columns);
      const userName = authState.user?.displayName || authState.user?.name || "";
      exportAuditReportPDF({
        title, columns, data, isVatAuditor, vatMaskedColumns: maskedKeys,
        integrityScore: integrityScore || 0,
        company: companyProfile || undefined,
        financialFooter: { preparedBy: userName, checkedBy: "", authorizedBy: "", printedBy: userName || "System" },
        classification: "CONFIDENTIAL",
      });
      toast({ title: "Exported", description: `${title} audit report exported to PDF` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // ============================================================
  // SHARED COMPONENTS
  // ============================================================

  const ForbiddenPage = ({ module }: { module: string }) => (
    <div className="page-enter flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full border-red-300 dark:border-red-800">
        <CardContent className="p-8 text-center">
          <Shield className="w-12 h-12 mx-auto mb-4 text-red-500" />
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">403 - Access Denied</h3>
          <p className="text-muted-foreground">You do not have permission to access {module}.</p>
        </CardContent>
      </Card>
    </div>
  );

  const StatCard = ({ label, value, icon: Icon, color, bg }: {
    label: string; value: any; icon: React.ElementType; color: string; bg: string;
  }) => (
    <Card className="stat-mini-card hover:shadow-md transition-shadow">
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

  const SectionHeader = ({ title, icon: Icon, action }: { title: string; icon: React.ElementType; action?: React.ReactNode }) => (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Icon className="w-5 h-5 text-[#2563eb]" />
        <h3 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h3>
      </div>
      {action}
    </div>
  );

  const HealthScoreGauge = ({ score }: { score: number }) => {
    const color = score >= 80 ? "text-green-500" : score >= 50 ? "text-amber-500" : "text-red-500";
    const bgColor = score >= 80 ? "bg-green-100 dark:bg-green-900/30" : score >= 50 ? "bg-amber-100 dark:bg-amber-900/30" : "bg-red-100 dark:bg-red-900/30";
    return (
      <Card className={`${bgColor} border-0`}>
        <CardContent className="p-4 flex flex-col items-center">
          <Gauge className={`w-10 h-10 ${color} mb-1`} />
          <p className="text-3xl font-bold text-slate-900 dark:text-white">{score}</p>
          <p className="text-xs text-muted-foreground">Health Score / 100</p>
          <Progress value={score} className="w-full mt-2 h-2" />
          <p className={`text-xs mt-1 font-medium ${color}`}>
            {score >= 80 ? "Healthy" : score >= 50 ? "Needs Attention" : "Critical"}
          </p>
        </CardContent>
      </Card>
    );
  };

  const LoadingSkeleton = ({ rows = 4 }: { rows?: number }) => (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Card key={i} className="animate-pulse"><CardContent className="p-4 h-12 bg-slate-100 dark:bg-slate-800 rounded" /></Card>
      ))}
    </div>
  );

  // ============================================================
  // TAB 1: DASHBOARD KPI
  // ============================================================

  const renderKPITab = () => {
    if (isSR || isDealer) return <ForbiddenPage module="Dashboard KPI" />;
    if (kpiLoading) return <LoadingSkeleton rows={6} />;

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
          {kpiCards.map((kpi, i) => (
            <StatCard key={i} label={kpi.label} value={kpi.value} icon={kpi.icon} color={kpi.color} bg={kpi.bg} />
          ))}
        </div>

        {healthScore !== null && (
          <div className="max-w-xs">
            <HealthScoreGauge score={healthScore} />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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

          <Card>
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white rounded-t-lg">
              <CardTitle className="text-sm font-medium">Category Distribution</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={categoryData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {categoryData.map((_: any, i: number) => (<Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

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

        <Card>
          <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white rounded-t-lg">
            <CardTitle className="text-sm font-medium">Financial Ratios</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
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
  // TAB 2: FRAUD DETECTION
  // ============================================================

  const renderFraudDetectionTab = () => {
    if (isSR || isDealer) return <ForbiddenPage module="Fraud Detection" />;
    if (fraudLoading) return <LoadingSkeleton rows={6} />;

    const fd = fraudData || {};
    const assetVal = fd.assetValuation || {};
    const ageDist = fd.ageDistribution || {};
    const ledgerInt = fd.ledgerIntegrity || {};
    const anomalies = fd.anomalies || {};
    const score = fd.overallHealthScore || 0;

    const fraudExportColumns: ExportColumnDef[] = [
      { key: "productCode", label: "Product Code", type: "text" },
      { key: "name", label: "Product", type: "text" },
      { key: "bookValue", label: "Book Value", type: "currency" },
      { key: "marketValue", label: "Market Value", type: "currency" },
      { key: "discrepancy", label: "Discrepancy %", type: "number" },
      { key: "riskType", label: "Risk Type", type: "text" },
    ];

    const ageChart = (ageDist.brackets || []).map((b: any, i: number) => ({
      bracket: b.label, value: isVatAuditor ? 0 : (b.totalValue || 0), count: b.count || 0,
    }));

    return (
      <div className="space-y-4">
        {/* Header with Health Score + Export */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <HealthScoreGauge score={score} />
            <div>
              <p className="text-lg font-bold text-slate-900 dark:text-white">Fraud Detection Platform</p>
              <p className="text-sm text-muted-foreground">Live analytical trackers monitoring asset valuation, age distribution, and ledger integrity</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => loadFraudDetection()}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={() => doExportAuditPDF("Fraud Detection Report", fraudExportColumns, assetVal.valuationRisk || [], score)}>
              <FileDown className="w-3.5 h-3.5 mr-1" /> Audit PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => doExportCSV("Fraud Detection", fraudExportColumns, assetVal.valuationRisk || [])}>
              <Download className="w-3.5 h-3.5 mr-1" /> CSV
            </Button>
          </div>
        </div>

        {/* Asset Valuation Metrics */}
        <Card>
          <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white rounded-t-lg py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="w-4 h-4" /> Asset Valuation Metrics
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              <StatCard label="Total Book Value" value={isVatAuditor ? AUDIT_MASK : fmtCurrency(assetVal.totalBookValue || 0)} icon={BookOpen} color="text-blue-600" bg="bg-blue-100 dark:bg-blue-900/30" />
              <StatCard label="Total Market Value" value={isVatAuditor ? AUDIT_MASK : fmtCurrency(assetVal.totalMarketValue || 0)} icon={TrendingUp} color="text-green-600" bg="bg-green-100 dark:bg-green-900/30" />
              <StatCard label="Valuation Gap" value={isVatAuditor ? AUDIT_MASK : fmtCurrency(assetVal.valuationGap || 0)} icon={AlertTriangle} color="text-amber-600" bg="bg-amber-100 dark:bg-amber-900/30" />
              <StatCard label="Risk Products" value={String((assetVal.valuationRisk || []).length)} icon={XCircle} color="text-red-600" bg="bg-red-100 dark:bg-red-900/30" />
            </div>

            {(assetVal.valuationRisk || []).length > 0 && (
              <div className="max-h-64 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Code</TableHead>
                      <TableHead className="text-xs">Product</TableHead>
                      <TableHead className="text-xs text-right">Book Value</TableHead>
                      <TableHead className="text-xs text-right">Market Value</TableHead>
                      <TableHead className="text-xs text-right">Discrepancy %</TableHead>
                      <TableHead className="text-xs">Risk</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(assetVal.valuationRisk || []).slice(0, 20).map((r: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs font-mono">{r.productCode}</TableCell>
                        <TableCell className="text-xs">{r.name}</TableCell>
                        <TableCell className="text-xs text-right">{isVatAuditor ? AUDIT_MASK : fmtCurrency(r.bookValue)}</TableCell>
                        <TableCell className="text-xs text-right">{isVatAuditor ? AUDIT_MASK : fmtCurrency(r.marketValue)}</TableCell>
                        <TableCell className="text-xs text-right font-medium text-amber-600">{r.discrepancy?.toFixed(1)}%</TableCell>
                        <TableCell className="text-xs"><Badge className={SEVERITY_BADGE.Warning}>Valuation Risk</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Age Distribution Logs */}
        <Card>
          <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white rounded-t-lg py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="w-4 h-4" /> Age Distribution Logs
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={ageChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke={resolvedTheme === "dark" ? "#334155" : "#e2e8f0"} />
                    <XAxis dataKey="bracket" tick={{ fontSize: 9 }} stroke={resolvedTheme === "dark" ? "#94a3b8" : "#64748b"} />
                    <YAxis tick={{ fontSize: 10 }} stroke={resolvedTheme === "dark" ? "#94a3b8" : "#64748b"} />
                    <Tooltip contentStyle={{ backgroundColor: resolvedTheme === "dark" ? "#1e293b" : "#fff", border: "1px solid #e2e8f0" }} />
                    <Bar dataKey="value" name="Value" radius={[4, 4, 0, 0]}>
                      {ageChart.map((_: any, i: number) => (<Cell key={i} fill={AGE_COLORS[i % AGE_COLORS.length]} />))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {(ageDist.brackets || []).map((b: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded bg-slate-50 dark:bg-slate-800/50">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full`} style={{ backgroundColor: AGE_COLORS[i % AGE_COLORS.length] }} />
                      <span className="text-xs font-medium text-slate-900 dark:text-white">{b.label}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">{b.count || 0} items</span>
                      <span className="text-xs font-semibold text-slate-900 dark:text-white">{isVatAuditor ? AUDIT_MASK : fmtCurrency(b.totalValue || 0)}</span>
                      {b.isRisk && <Badge className={SEVERITY_BADGE.Critical + " text-[10px]"}>Risk</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Ledger Integrity Status */}
        <Card>
          <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white rounded-t-lg py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> Ledger Integrity Status
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              <StatCard label="Balanced" value={ledgerInt.balanced ? "Yes" : "No"} icon={CheckCircle2} color={ledgerInt.balanced ? "text-green-600" : "text-red-600"} bg={ledgerInt.balanced ? "bg-green-100 dark:bg-green-900/30" : "bg-red-100 dark:bg-red-900/30"} />
              <StatCard label="Orphan Entries" value={String(ledgerInt.orphanEntries || 0)} icon={AlertTriangle} color="text-amber-600" bg="bg-amber-100 dark:bg-amber-900/30" />
              <StatCard label="Duplicate Refs" value={String(ledgerInt.duplicateReferences || 0)} icon={Copy} color="text-amber-600" bg="bg-amber-100 dark:bg-amber-900/30" />
              <StatCard label="Missing Auto-Posts" value={String(ledgerInt.missingAutoPosts || 0)} icon={XCircle} color="text-red-600" bg="bg-red-100 dark:bg-red-900/30" />
            </div>
            {(ledgerInt.unbalancedDates || []).length > 0 && (
              <div className="mt-3 max-h-40 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs text-right">Total Debit</TableHead>
                      <TableHead className="text-xs text-right">Total Credit</TableHead>
                      <TableHead className="text-xs text-right">Difference</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(ledgerInt.unbalancedDates || []).slice(0, 10).map((d: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{d.date}</TableCell>
                        <TableCell className="text-xs text-right">{isVatAuditor ? AUDIT_MASK : fmtCurrency(d.totalDebit)}</TableCell>
                        <TableCell className="text-xs text-right">{isVatAuditor ? AUDIT_MASK : fmtCurrency(d.totalCredit)}</TableCell>
                        <TableCell className="text-xs text-right font-medium text-red-600">{isVatAuditor ? AUDIT_MASK : fmtCurrency(d.difference)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Anomaly Detection */}
        <Card>
          <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white rounded-t-lg py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Fingerprint className="w-4 h-4" /> Anomaly Detection
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Negative Margins */}
              <div>
                <SectionHeader title={`Negative Margins (${(anomalies.negativeMargins || []).length})`} icon={TrendingDown} />
                <div className="max-h-32 overflow-y-auto">
                  {(anomalies.negativeMargins || []).length === 0 ? (
                    <p className="text-xs text-muted-foreground p-2">No negative margin products detected</p>
                  ) : (
                    (anomalies.negativeMargins || []).slice(0, 10).map((p: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-1.5 border-b border-slate-100 dark:border-slate-800">
                        <span className="text-xs">{p.name}</span>
                        <span className="text-xs text-red-600 font-medium">Cost: {fmtCurrency(p.costPrice)} &gt; Sale: {fmtCurrency(p.salePrice)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Concentration Risks */}
              <div>
                <SectionHeader title={`Concentration Risks (${(anomalies.concentrationRisks || []).length})`} icon={Package} />
                <div className="max-h-32 overflow-y-auto">
                  {(anomalies.concentrationRisks || []).length === 0 ? (
                    <p className="text-xs text-muted-foreground p-2">No concentration risks detected</p>
                  ) : (
                    (anomalies.concentrationRisks || []).slice(0, 10).map((p: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-1.5 border-b border-slate-100 dark:border-slate-800">
                        <span className="text-xs">{p.name}</span>
                        <span className="text-xs text-amber-600 font-medium">{p.concentrationPercent?.toFixed(1)}% of total</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Credit Limit Breaches */}
              <div>
                <SectionHeader title={`Credit Limit Breaches (${(anomalies.creditLimitBreaches || []).length})`} icon={CreditCard} />
                <div className="max-h-32 overflow-y-auto">
                  {(anomalies.creditLimitBreaches || []).length === 0 ? (
                    <p className="text-xs text-muted-foreground p-2">No credit limit breaches</p>
                  ) : (
                    (anomalies.creditLimitBreaches || []).slice(0, 10).map((c: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-1.5 border-b border-slate-100 dark:border-slate-800">
                        <span className="text-xs">{c.name}</span>
                        <span className="text-xs text-red-600 font-medium">Over by {fmtCurrency(c.overAmount)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Overdue Suppliers */}
              <div>
                <SectionHeader title={`Overdue Suppliers 90+ days (${(anomalies.overdueSuppliers || []).length})`} icon={Users} />
                <div className="max-h-32 overflow-y-auto">
                  {(anomalies.overdueSuppliers || []).length === 0 ? (
                    <p className="text-xs text-muted-foreground p-2">No overdue suppliers</p>
                  ) : (
                    (anomalies.overdueSuppliers || []).slice(0, 10).map((s: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-1.5 border-b border-slate-100 dark:border-slate-800">
                        <span className="text-xs">{s.name}</span>
                        <span className="text-xs text-red-600 font-medium">{fmtCurrency(s.outstandingAmount)} outstanding</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // ============================================================
  // TAB 3: LEDGER AUTO-POSTING
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
      { key: "postedBy", label: "Posted By", type: "text" },
      { key: "postingDate", label: "Posted At", type: "date" },
    ];

    const openPostSODialog = async () => {
      try {
        const res = await apiFetch("/api/sales-orders?status=Confirmed&limit=50");
        const list = Array.isArray(res) ? res : res.data || [];
        setSoList(list.filter((so: any) => so.status === "Confirmed"));
        setSelectedSO("");
        setPostSODialog(true);
      } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    };

    const openPostPODialog = async () => {
      try {
        const res = await apiFetch("/api/purchase-orders?status=Confirmed&limit=50");
        const list = Array.isArray(res) ? res : res.data || [];
        setPoList(list.filter((po: any) => po.status === "Confirmed"));
        setSelectedPO("");
        setPostPODialog(true);
      } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    };

    const postSelectedSO = async () => {
      if (!selectedSO) { toast({ title: "Error", description: "Select a Sales Order", variant: "destructive" }); return; }
      setLedgerActionLoading(true);
      try {
        await apiFetch("/api/ledger-auto-post?action=post-sales&salesOrderId=" + selectedSO, { method: "POST" });
        toast({ title: "Posted", description: "Sales Order posted to ledger" });
        setPostSODialog(false);
        loadLedger();
      } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
      finally { setLedgerActionLoading(false); }
    };

    const postSelectedPO = async () => {
      if (!selectedPO) { toast({ title: "Error", description: "Select a Purchase Order", variant: "destructive" }); return; }
      setLedgerActionLoading(true);
      try {
        await apiFetch("/api/ledger-auto-post?action=post-purchase&purchaseOrderId=" + selectedPO, { method: "POST" });
        toast({ title: "Posted", description: "Purchase Order posted to ledger" });
        setPostPODialog(false);
        loadLedger();
      } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
      finally { setLedgerActionLoading(false); }
    };

    const runAllPending = async () => {
      setLedgerActionLoading(true);
      try {
        const res = await apiFetch("/api/ledger-auto-post?action=run-all-pending", { method: "POST" });
        toast({ title: "Batch Complete", description: `Posted ${res.summary?.totalPosted || 0} entries` });
        loadLedger();
      } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
      finally { setLedgerActionLoading(false); }
    };

    const doReverse = async () => {
      if (!reverseDialog) return;
      setLedgerActionLoading(true);
      try {
        await apiFetch("/api/ledger-auto-post?action=reverse&autoPostId=" + reverseDialog.id, { method: "POST", body: JSON.stringify({ reason: reverseReason }) });
        toast({ title: "Reversed", description: "Entry reversed successfully" });
        setReverseDialog(null); setReverseReason(""); loadLedger();
      } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
      finally { setLedgerActionLoading(false); }
    };

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {isAdmin && <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={openPostSODialog}><ShoppingCart className="w-4 h-4 mr-1" /> Post Sales Order</Button>}
          {isAdmin && <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={openPostPODialog}><Package className="w-4 h-4 mr-1" /> Post Purchase Order</Button>}
          {isAdmin && <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={runAllPending} disabled={ledgerActionLoading}><Play className="w-4 h-4 mr-1" /> {ledgerActionLoading ? "Running..." : "Run All Pending"}</Button>}
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => doExportCSV("Ledger Auto-Post", ledgerExportColumns, ledgerRecords, ["amount"])}><Download className="w-3.5 h-3.5 mr-1" /> CSV</Button>
          <Button variant="outline" size="sm" onClick={() => doExportPDF("Ledger Auto-Post", ledgerExportColumns, ledgerRecords, "landscape", ["amount"])}><FileDown className="w-3.5 h-3.5 mr-1" /> PDF</Button>
          {(isAdmin || isManager) && <Button variant="outline" size="sm" onClick={() => {
            importFromCSV({
              apiPath: "/api/ledger-auto-post",
              formFields: [
                { key: "accountName", label: "Account Name", type: "text", required: true },
                { key: "amount", label: "Amount", type: "number", required: true },
                { key: "date", label: "Date", type: "date", required: true },
                { key: "description", label: "Description", type: "text" },
                { key: "entryType", label: "Entry Type", type: "select", options: [{ value: "Debit", label: "Debit" }, { value: "Credit", label: "Credit" }] },
              ],
            }).then(result => {
              toast({ title: "Import Complete", description: `${result.imported} imported, ${result.failed} failed` });
              loadLedger();
            }).catch((e: any) => {
              toast({ title: "Import Error", description: e.message, variant: "destructive" });
            });
          }}><Upload className="w-3.5 h-3.5 mr-1" /> Import CSV</Button>}
        </div>

        {/* Double-Entry Verification */}
        {ledgerVerification && (
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                {ledgerVerification.balanced ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-red-500" />}
                <span className="text-sm font-medium text-slate-900 dark:text-white">
                  Ledger {ledgerVerification.balanced ? "Balanced" : "IMBALANCED"}
                </span>
                {!ledgerVerification.balanced && (
                  <span className="text-xs text-red-600 ml-2">Difference: {fmtCurrency(ledgerVerification.difference)}</span>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {ledgerLoading ? <LoadingSkeleton rows={3} /> : (
          <Card>
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white rounded-t-lg py-3 px-4">
              <CardTitle className="text-sm font-medium">Auto-Post Records ({ledgerRecords.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Code</TableHead>
                      <TableHead className="text-xs">Source</TableHead>
                      <TableHead className="text-xs">Dr Account</TableHead>
                      <TableHead className="text-xs">Cr Account</TableHead>
                      <TableHead className="text-xs text-right">Amount</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Date</TableHead>
                      {isAdmin && <TableHead className="text-xs">Action</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledgerRecords.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs font-mono">{r.code}</TableCell>
                        <TableCell className="text-xs">{r.sourceType} - {r.sourceCode}</TableCell>
                        <TableCell className="text-xs">{r.debitAccount}</TableCell>
                        <TableCell className="text-xs">{r.creditAccount}</TableCell>
                        <TableCell className="text-xs text-right">{isVatAuditor ? AUDIT_MASK : fmtCurrency(r.amount)}</TableCell>
                        <TableCell className="text-xs"><Badge className={STATUS_BADGE[r.status] || ""}>{r.status}</Badge></TableCell>
                        <TableCell className="text-xs">{fmtDate(r.postingDate)}</TableCell>
                        {isAdmin && <TableCell className="text-xs">
                          {r.status === "Posted" && <Button variant="ghost" size="sm" className="h-6 text-xs text-red-600" onClick={() => setReverseDialog(r)}><RotateCcw className="w-3 h-3 mr-1" /> Reverse</Button>}
                        </TableCell>}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Post SO Dialog */}
        <Dialog open={postSODialog} onOpenChange={setPostSODialog}>
          <DialogContent className="max-w-[95vw] sm:max-w-md"><DialogHeader><DialogTitle>Post Sales Order to Ledger</DialogTitle><DialogDescription>Select a confirmed sales order to auto-post double-entry ledger records.</DialogDescription></DialogHeader>
            <Select value={selectedSO} onValueChange={setSelectedSO}><SelectTrigger><SelectValue placeholder="Select Sales Order" /></SelectTrigger><SelectContent>{soList.map((so: any) => <SelectItem key={so.id} value={so.id}>{so.invoiceNo} - {fmtCurrency(so.grandTotal)}</SelectItem>)}</SelectContent></Select>
            <DialogFooter><Button onClick={postSelectedSO} disabled={ledgerActionLoading}>{ledgerActionLoading ? "Posting..." : "Post"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Post PO Dialog */}
        <Dialog open={postPODialog} onOpenChange={setPostPODialog}>
          <DialogContent className="max-w-[95vw] sm:max-w-md"><DialogHeader><DialogTitle>Post Purchase Order to Ledger</DialogTitle><DialogDescription>Select a confirmed purchase order to auto-post double-entry ledger records.</DialogDescription></DialogHeader>
            <Select value={selectedPO} onValueChange={setSelectedPO}><SelectTrigger><SelectValue placeholder="Select Purchase Order" /></SelectTrigger><SelectContent>{poList.map((po: any) => <SelectItem key={po.id} value={po.id}>{po.poNumber} - {fmtCurrency(po.grandTotal)}</SelectItem>)}</SelectContent></Select>
            <DialogFooter><Button onClick={postSelectedPO} disabled={ledgerActionLoading}>{ledgerActionLoading ? "Posting..." : "Post"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reverse Dialog */}
        <Dialog open={!!reverseDialog} onOpenChange={() => setReverseDialog(null)}>
          <DialogContent className="max-w-[95vw] sm:max-w-md"><DialogHeader><DialogTitle>Reverse Auto-Post Entry</DialogTitle><DialogDescription>This will create reversing entries for {reverseDialog?.code}.</DialogDescription></DialogHeader>
            <Label className="text-xs">Reversal Reason</Label>
            <Textarea value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} placeholder="Enter reason for reversal..." rows={3} />
            <DialogFooter><Button variant="outline" onClick={() => setReverseDialog(null)}>Cancel</Button><Button variant="destructive" onClick={doReverse} disabled={ledgerActionLoading}>{ledgerActionLoading ? "Reversing..." : "Reverse"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  // ============================================================
  // TAB 4: INVENTORY AGING
  // ============================================================

  const renderAgingTab = () => {
    if (isSR || isDealer) return <ForbiddenPage module="Inventory Aging" />;
    const bracketChart = (agingBracketSummary || []).map((b: any, i: number) => ({
      bracket: b.label, value: isVatAuditor ? 0 : (b.totalValue || 0), count: b.count || 0,
    }));

    const agingExportColumns: ExportColumnDef[] = [
      { key: "productCode", label: "Code", type: "text" },
      { key: "name", label: "Product", type: "text" },
      { key: "category", label: "Category", type: "text" },
      { key: "brand", label: "Brand", type: "text" },
      { key: "stock", label: "Stock Qty", type: "number" },
      { key: "totalValue", label: "Total Value", type: "currency" },
      { key: "ageDays", label: "Age (Days)", type: "number" },
      { key: "earliestEntryDate", label: "Earliest Entry", type: "date" },
    ];

    return (
      <div className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1"><Label className="text-xs">As Of Date</Label><Input type="date" value={agingAsOf} onChange={(e) => setAgingAsOf(e.target.value)} className="h-9" /></div>
          <div className="space-y-1"><Label className="text-xs">Godown</Label><Select value={agingGodownId} onValueChange={setAgingGodownId}><SelectTrigger className="h-9 w-40"><SelectValue placeholder="All" /></SelectTrigger><SelectContent><SelectItem value="all">All Godowns</SelectItem>{godowns.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent></Select></div>
          <Button onClick={loadAging} className="h-9 bg-[#2563eb] hover:bg-[#1d4ed8]"><RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh</Button>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => doExportAuditPDF("Inventory Aging Report", agingExportColumns, agingData, agingSummary?.averageAge)}><FileDown className="w-3.5 h-3.5 mr-1" /> Audit PDF</Button>
          <Button variant="outline" size="sm" onClick={() => doExportCSV("Inventory Aging", agingExportColumns, agingData)}><Download className="w-3.5 h-3.5 mr-1" /> CSV</Button>
          {(isAdmin || isManager) && <Button variant="outline" size="sm" onClick={() => {
            importFromCSV({
              apiPath: "/api/products",
              formFields: [
                { key: "name", label: "Product Name", type: "text", required: true },
                { key: "sku", label: "SKU", type: "text" },
                { key: "category", label: "Category", type: "text" },
                { key: "costPrice", label: "Cost Price", type: "number" },
                { key: "sellPrice", label: "Sell Price", type: "number" },
                { key: "quantity", label: "Quantity", type: "number" },
                { key: "godownId", label: "Godown ID", type: "text" },
              ],
            }).then(result => {
              toast({ title: "Import Complete", description: `${result.imported} imported, ${result.failed} failed` });
              loadAging();
            }).catch((e: any) => {
              toast({ title: "Import Error", description: e.message, variant: "destructive" });
            });
          }}><Upload className="w-3.5 h-3.5 mr-1" /> Import CSV</Button>}
        </div>

        {agingLoading ? <LoadingSkeleton rows={4} /> : (
          <>
            {/* Summary */}
            {agingSummary && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                <StatCard label="Total Products" value={agingSummary.totalProducts || 0} icon={Package} color="text-blue-600" bg="bg-blue-100 dark:bg-blue-900/30" />
                <StatCard label="Total Value" value={isVatAuditor ? AUDIT_MASK : fmtCurrency(agingSummary.totalValue || 0)} icon={DollarSign} color="text-green-600" bg="bg-green-100 dark:bg-green-900/30" />
                <StatCard label="Average Age" value={`${agingSummary.averageAge || 0} days`} icon={Clock} color="text-amber-600" bg="bg-amber-100 dark:bg-amber-900/30" />
                <StatCard label="Oldest Item" value={`${agingSummary.oldestAge || 0} days`} icon={AlertTriangle} color="text-red-600" bg="bg-red-100 dark:bg-red-900/30" />
              </div>
            )}

            {/* Age Distribution Chart */}
            <Card>
              <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white rounded-t-lg py-3 px-4">
                <CardTitle className="text-sm font-medium">Age Distribution</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={bracketChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke={resolvedTheme === "dark" ? "#334155" : "#e2e8f0"} />
                    <XAxis dataKey="bracket" tick={{ fontSize: 10 }} stroke={resolvedTheme === "dark" ? "#94a3b8" : "#64748b"} />
                    <YAxis tick={{ fontSize: 10 }} stroke={resolvedTheme === "dark" ? "#94a3b8" : "#64748b"} />
                    <Tooltip contentStyle={{ backgroundColor: resolvedTheme === "dark" ? "#1e293b" : "#fff", border: "1px solid #e2e8f0" }} />
                    <Bar dataKey="value" name="Value" radius={[4, 4, 0, 0]}>
                      {bracketChart.map((_: any, i: number) => (<Cell key={i} fill={AGE_COLORS[i % AGE_COLORS.length]} />))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Products Table */}
            <Card>
              <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white rounded-t-lg py-3 px-4">
                <CardTitle className="text-sm font-medium">Aged Products ({agingData.length})</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-96 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Code</TableHead>
                        <TableHead className="text-xs">Product</TableHead>
                        <TableHead className="text-xs">Category</TableHead>
                        <TableHead className="text-xs text-right">Stock</TableHead>
                        <TableHead className="text-xs text-right">Value</TableHead>
                        <TableHead className="text-xs text-right">Age (Days)</TableHead>
                        <TableHead className="text-xs">Earliest Entry</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {agingData.map((p: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs font-mono">{p.productCode}</TableCell>
                          <TableCell className="text-xs">{p.name}</TableCell>
                          <TableCell className="text-xs">{p.category}</TableCell>
                          <TableCell className="text-xs text-right">{p.stock}</TableCell>
                          <TableCell className="text-xs text-right">{isVatAuditor ? AUDIT_MASK : fmtCurrency(p.totalValue)}</TableCell>
                          <TableCell className="text-xs text-right"><Badge className={(p.ageDays || 0) > 180 ? SEVERITY_BADGE.Critical : (p.ageDays || 0) > 90 ? SEVERITY_BADGE.Warning : ""}>{p.ageDays}</Badge></TableCell>
                          <TableCell className="text-xs">{fmtDate(p.earliestEntryDate)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    );
  };

  // ============================================================
  // TAB 5: PRODUCT LIFECYCLE
  // ============================================================

  const renderLifecycleTab = () => {
    if (isSR || isDealer) return <ForbiddenPage module="Product Lifecycle" />;

    const saveTracking = async () => {
      setLifecycleSaving(true);
      try {
        await apiFetch("/api/product-lifecycle", { method: "POST", body: JSON.stringify(lifecycleFormData) });
        toast({ title: "Created", description: "Tracking record created" });
        setLifecycleForm(false);
        setLifecycleFormData({ productId: "", serialNumber: "", imeiNumber: "", status: "InStock", godownId: "", warrantyExpiry: "", notes: "" });
        loadLifecycle();
      } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
      finally { setLifecycleSaving(false); }
    };

    const lifecycleExportColumns: ExportColumnDef[] = [
      { key: "code", label: "Code", type: "text" },
      { key: "productCode", label: "Product Code", type: "text" },
      { key: "productName", label: "Product", type: "text" },
      { key: "serialNumber", label: "Serial", type: "text" },
      { key: "imeiNumber", label: "IMEI", type: "text" },
      { key: "status", label: "Status", type: "text" },
      { key: "costPrice", label: "Cost Price", type: "currency" },
      { key: "salePrice", label: "Sale Price", type: "currency" },
    ];

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="space-y-1"><Label className="text-xs">Search Serial/IMEI</Label><Input value={lifecycleSearch} onChange={(e) => setLifecycleSearch(e.target.value)} placeholder="Search..." className="h-9 w-48" /></div>
          <Button onClick={loadLifecycle} className="h-9 bg-[#2563eb] hover:bg-[#1d4ed8]"><Search className="w-3.5 h-3.5 mr-1" /> Search</Button>
          {isAdmin && <Button variant="outline" className="h-9" onClick={() => setLifecycleForm(true)}><Plus className="w-3.5 h-3.5 mr-1" /> New Tracking</Button>}
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => doExportPDF("Product Lifecycle", lifecycleExportColumns, lifecycleRecords, "landscape")}><FileDown className="w-3.5 h-3.5 mr-1" /> PDF</Button>
          <Button variant="outline" size="sm" onClick={() => doExportCSV("Product Lifecycle", lifecycleExportColumns, lifecycleRecords)}><Download className="w-3.5 h-3.5 mr-1" /> CSV</Button>
          {(isAdmin || isManager) && <Button variant="outline" size="sm" onClick={() => {
            importFromCSV({
              apiPath: "/api/products",
              formFields: [
                { key: "name", label: "Product Name", type: "text", required: true },
                { key: "sku", label: "SKU", type: "text" },
                { key: "category", label: "Category", type: "text" },
                { key: "costPrice", label: "Cost Price", type: "number" },
                { key: "sellPrice", label: "Sell Price", type: "number" },
                { key: "quantity", label: "Quantity", type: "number" },
                { key: "godownId", label: "Godown ID", type: "text" },
              ],
            }).then(result => {
              toast({ title: "Import Complete", description: `${result.imported} imported, ${result.failed} failed` });
              loadLifecycle();
            }).catch((e: any) => {
              toast({ title: "Import Error", description: e.message, variant: "destructive" });
            });
          }}><Upload className="w-3.5 h-3.5 mr-1" /> Import CSV</Button>}
        </div>

        {lifecycleLoading ? <LoadingSkeleton rows={4} /> : (
          <Card>
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white rounded-t-lg py-3 px-4">
              <CardTitle className="text-sm font-medium">Serial Tracking Records ({lifecycleRecords.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Code</TableHead>
                      <TableHead className="text-xs">Product</TableHead>
                      <TableHead className="text-xs">Serial</TableHead>
                      <TableHead className="text-xs">IMEI</TableHead>
                      <TableHead className="text-xs text-right">Cost</TableHead>
                      <TableHead className="text-xs text-right">Sale</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lifecycleRecords.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs font-mono">{r.code}</TableCell>
                        <TableCell className="text-xs">{r.productName || r.productCode}</TableCell>
                        <TableCell className="text-xs font-mono">{r.serialNumber || "—"}</TableCell>
                        <TableCell className="text-xs font-mono">{r.imeiNumber || "—"}</TableCell>
                        <TableCell className="text-xs text-right">{isVatAuditor ? AUDIT_MASK : fmtCurrency(r.costPrice)}</TableCell>
                        <TableCell className="text-xs text-right">{fmtCurrency(r.salePrice)}</TableCell>
                        <TableCell className="text-xs"><Badge className={STATUS_BADGE[r.status] || ""}>{r.status}</Badge></TableCell>
                        <TableCell className="text-xs"><Button variant="ghost" size="sm" className="h-6" onClick={() => setSelectedSerial(r)}><Eye className="w-3 h-3" /></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* New Tracking Dialog */}
        <Dialog open={lifecycleForm} onOpenChange={setLifecycleForm}>
          <DialogContent><DialogHeader><DialogTitle>New Serial Tracking Record</DialogTitle><DialogDescription>Add a new product serial/IMEI tracking record.</DialogDescription></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label className="text-xs">Product</Label><Select value={lifecycleFormData.productId} onValueChange={(v) => setLifecycleFormData({ ...lifecycleFormData, productId: v })}><SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger><SelectContent>{products.slice(0, 100).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.productCode} - {p.name}</SelectItem>)}</SelectContent></Select></div>
              <div><Label className="text-xs">Serial Number</Label><Input value={lifecycleFormData.serialNumber} onChange={(e) => setLifecycleFormData({ ...lifecycleFormData, serialNumber: e.target.value })} /></div>
              <div><Label className="text-xs">IMEI Number</Label><Input value={lifecycleFormData.imeiNumber} onChange={(e) => setLifecycleFormData({ ...lifecycleFormData, imeiNumber: e.target.value })} /></div>
              <div><Label className="text-xs">Status</Label><Select value={lifecycleFormData.status} onValueChange={(v) => setLifecycleFormData({ ...lifecycleFormData, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["InStock", "Sold", "Returned", "Replaced", "Damaged", "Transferred"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
              <div><Label className="text-xs">Godown</Label><Select value={lifecycleFormData.godownId} onValueChange={(v) => setLifecycleFormData({ ...lifecycleFormData, godownId: v })}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent><SelectItem value="">None</SelectItem>{godowns.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setLifecycleForm(false)}>Cancel</Button><Button onClick={saveTracking} disabled={lifecycleSaving}>{lifecycleSaving ? "Saving..." : "Create"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Serial Detail Dialog */}
        <Dialog open={!!selectedSerial} onOpenChange={() => setSelectedSerial(null)}>
          <DialogContent><DialogHeader><DialogTitle>Serial Detail: {selectedSerial?.code}</DialogTitle><DialogDescription>Full tracking information for this serial record.</DialogDescription></DialogHeader>
            {selectedSerial && (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Product:</span> {selectedSerial.productName}</div>
                <div><span className="text-muted-foreground">Serial:</span> {selectedSerial.serialNumber || "—"}</div>
                <div><span className="text-muted-foreground">IMEI:</span> {selectedSerial.imeiNumber || "—"}</div>
                <div><span className="text-muted-foreground">Status:</span> <Badge className={STATUS_BADGE[selectedSerial.status] || ""}>{selectedSerial.status}</Badge></div>
                <div><span className="text-muted-foreground">Cost:</span> {isVatAuditor ? AUDIT_MASK : fmtCurrency(selectedSerial.costPrice)}</div>
                <div><span className="text-muted-foreground">Sale:</span> {fmtCurrency(selectedSerial.salePrice)}</div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  // ============================================================
  // TAB 6: SPECIALIZED REPORTS
  // ============================================================

  const renderSpecializedTab = () => {
    if (isSR || isDealer) return <ForbiddenPage module="Specialized Reports" />;

    return (
      <div className="space-y-4">
        {/* Date Filters */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1"><Label className="text-xs">From</Label><Input type="date" value={specFrom} onChange={(e) => setSpecFrom(e.target.value)} className="h-9" /></div>
          <div className="space-y-1"><Label className="text-xs">To</Label><Input type="date" value={specTo} onChange={(e) => setSpecTo(e.target.value)} className="h-9" /></div>
          <Button onClick={() => { if (specSubTab === "hire-purchase") loadHirePurchase(); else if (specSubTab === "commission") loadCommission(); else loadCollection(); }} className="h-9 bg-[#2563eb] hover:bg-[#1d4ed8]"><Search className="w-3.5 h-3.5 mr-1" /> Generate</Button>
        </div>

        <Tabs value={specSubTab} onValueChange={setSpecSubTab}>
          <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/50 p-1">
            <TabsTrigger value="hire-purchase" className="text-xs data-[state=active]:bg-[#2563eb] data-[state=active]:text-white">
              <Receipt className="w-3.5 h-3.5 mr-1" /> Hire Purchase
            </TabsTrigger>
            <TabsTrigger value="commission" className="text-xs data-[state=active]:bg-[#2563eb] data-[state=active]:text-white">
              <HandCoins className="w-3.5 h-3.5 mr-1" /> Commission
            </TabsTrigger>
            <TabsTrigger value="collections" className="text-xs data-[state=active]:bg-[#2563eb] data-[state=active]:text-white">
              <CircleDollarSign className="w-3.5 h-3.5 mr-1" /> Collections
            </TabsTrigger>
          </TabsList>

          <TabsContent value="hire-purchase">
            {renderHirePurchaseSubTab()}
          </TabsContent>
          <TabsContent value="commission">
            {renderCommissionSubTab()}
          </TabsContent>
          <TabsContent value="collections">
            {renderCollectionSubTab()}
          </TabsContent>
        </Tabs>
      </div>
    );
  };

  const renderHirePurchaseSubTab = () => {
    if (hireLoading) return <LoadingSkeleton rows={3} />;
    const hd = hireData || {};
    const records = hd.records || [];
    const summary = hd.summary || {};

    const hpExportColumns: ExportColumnDef[] = [
      { key: "invoiceNo", label: "Invoice", type: "text" },
      { key: "customerName", label: "Customer", type: "text" },
      { key: "totalHirePayable", label: "Hire Payable", type: "currency" },
      { key: "totalPaid", label: "Total Paid", type: "currency" },
      { key: "outstandingBalance", label: "Outstanding", type: "currency" },
      { key: "duration", label: "Duration", type: "text" },
      { key: "hireRate", label: "Hire Rate %", type: "number" },
      { key: "currentStatus", label: "Status", type: "text" },
    ];

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Receipt className="w-5 h-5 text-[#2563eb]" /> Hire Purchase Installments
          </h3>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => doExportPDF("Hire Purchase Report", hpExportColumns, records, "landscape")}><FileDown className="w-3.5 h-3.5 mr-1" /> PDF</Button>
            <Button variant="outline" size="sm" onClick={() => doExportCSV("Hire Purchase", hpExportColumns, records)}><Download className="w-3.5 h-3.5 mr-1" /> CSV</Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <StatCard label="Total Outstanding" value={isVatAuditor ? AUDIT_MASK : fmtCurrency(summary.totalOutstanding || 0)} icon={DollarSign} color="text-amber-600" bg="bg-amber-100 dark:bg-amber-900/30" />
          <StatCard label="Total Overdue" value={isVatAuditor ? AUDIT_MASK : fmtCurrency(summary.totalOverdue || 0)} icon={AlertTriangle} color="text-red-600" bg="bg-red-100 dark:bg-red-900/30" />
          <StatCard label="Collection Rate" value={`${(summary.collectionRate || 0).toFixed(1)}%`} icon={CheckCircle2} color="text-green-600" bg="bg-green-100 dark:bg-green-900/30" />
          <StatCard label="Default Rate" value={`${(summary.defaultRate || 0).toFixed(1)}%`} icon={XCircle} color="text-red-600" bg="bg-red-100 dark:bg-red-900/30" />
        </div>

        {(hd.chartData || []).length > 0 && (
          <Card>
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white rounded-t-lg py-3 px-4">
              <CardTitle className="text-sm font-medium">Monthly Installment Collection</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={hd.chartData || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke={resolvedTheme === "dark" ? "#334155" : "#e2e8f0"} />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke={resolvedTheme === "dark" ? "#94a3b8" : "#64748b"} />
                  <YAxis tick={{ fontSize: 10 }} stroke={resolvedTheme === "dark" ? "#94a3b8" : "#64748b"} />
                  <Tooltip contentStyle={{ backgroundColor: resolvedTheme === "dark" ? "#1e293b" : "#fff", border: "1px solid #e2e8f0" }} />
                  <Bar dataKey="collected" name="Collected" fill="#16a34a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="overdue" name="Overdue" fill="#dc2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-0">
            <div className="max-h-80 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Invoice</TableHead>
                    <TableHead className="text-xs">Customer</TableHead>
                    <TableHead className="text-xs text-right">Hire Payable</TableHead>
                    <TableHead className="text-xs text-right">Total Paid</TableHead>
                    <TableHead className="text-xs text-right">Outstanding</TableHead>
                    <TableHead className="text-xs">Duration</TableHead>
                    <TableHead className="text-xs text-right">Rate %</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Installments</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((r: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs font-mono">{r.invoiceNo}</TableCell>
                      <TableCell className="text-xs">{r.customerName || r.customer}</TableCell>
                      <TableCell className="text-xs text-right">{isVatAuditor ? AUDIT_MASK : fmtCurrency(r.totalHirePayable)}</TableCell>
                      <TableCell className="text-xs text-right">{isVatAuditor ? AUDIT_MASK : fmtCurrency(r.totalPaid)}</TableCell>
                      <TableCell className="text-xs text-right font-medium">{isVatAuditor ? AUDIT_MASK : fmtCurrency(r.outstandingBalance)}</TableCell>
                      <TableCell className="text-xs">{r.duration} mo</TableCell>
                      <TableCell className="text-xs text-right">{r.hireRate}%</TableCell>
                      <TableCell className="text-xs"><Badge className={STATUS_BADGE[r.currentStatus] || ""}>{r.currentStatus}</Badge></TableCell>
                      <TableCell className="text-xs">
                        <span className="text-green-600">{r.paidCount || 0}P</span> /
                        <span className="text-amber-600 ml-1">{r.pendingCount || 0}Pn</span> /
                        <span className="text-red-600 ml-1">{r.overdueCount || 0}O</span>
                      </TableCell>
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

  const renderCommissionSubTab = () => {
    if (commissionLoading) return <LoadingSkeleton rows={3} />;
    const cd = commissionData || {};
    const records = cd.records || [];
    const summary = cd.summary || {};

    const commExportColumns: ExportColumnDef[] = [
      { key: "srName", label: "SR Name", type: "text" },
      { key: "designation", label: "Designation", type: "text" },
      { key: "totalSales", label: "Total Sales", type: "number" },
      { key: "totalRevenue", label: "Total Revenue", type: "currency" },
      { key: "commissionRate", label: "Commission Rate %", type: "number" },
      { key: "earnedCommission", label: "Earned Commission", type: "currency" },
      { key: "targetAmount", label: "Target", type: "currency" },
      { key: "targetAchievement", label: "Achievement %", type: "number" },
    ];

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <HandCoins className="w-5 h-5 text-[#2563eb]" /> Commission Payouts
          </h3>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => doExportPDF("Commission Report", commExportColumns, records, "landscape")}><FileDown className="w-3.5 h-3.5 mr-1" /> PDF</Button>
            <Button variant="outline" size="sm" onClick={() => doExportCSV("Commission Report", commExportColumns, records)}><Download className="w-3.5 h-3.5 mr-1" /> CSV</Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatCard label="Total Commissions" value={isVatAuditor ? AUDIT_MASK : fmtCurrency(summary.totalCommissions || 0)} icon={DollarSign} color="text-green-600" bg="bg-green-100 dark:bg-green-900/30" />
          <StatCard label="Avg Target Achievement" value={`${(summary.avgTargetAchievement || 0).toFixed(1)}%`} icon={Target} color="text-blue-600" bg="bg-blue-100 dark:bg-blue-900/30" />
          <StatCard label="Top Performer" value={summary.topPerformer || "—"} icon={Award} color="text-amber-600" bg="bg-amber-100 dark:bg-amber-900/30" />
        </div>

        {(cd.chartData || []).length > 0 && (
          <Card>
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white rounded-t-lg py-3 px-4">
              <CardTitle className="text-sm font-medium">SR Performance Comparison</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={cd.chartData || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke={resolvedTheme === "dark" ? "#334155" : "#e2e8f0"} />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke={resolvedTheme === "dark" ? "#94a3b8" : "#64748b"} />
                  <YAxis tick={{ fontSize: 10 }} stroke={resolvedTheme === "dark" ? "#94a3b8" : "#64748b"} />
                  <Tooltip contentStyle={{ backgroundColor: resolvedTheme === "dark" ? "#1e293b" : "#fff", border: "1px solid #e2e8f0" }} />
                  <Legend />
                  <Bar dataKey="revenue" name="Revenue" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="commission" name="Commission" fill="#16a34a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-0">
            <div className="max-h-80 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">SR Name</TableHead>
                    <TableHead className="text-xs">Designation</TableHead>
                    <TableHead className="text-xs text-right">Total Sales</TableHead>
                    <TableHead className="text-xs text-right">Revenue</TableHead>
                    <TableHead className="text-xs text-right">Comm. Rate</TableHead>
                    <TableHead className="text-xs text-right">Commission</TableHead>
                    <TableHead className="text-xs text-right">Target</TableHead>
                    <TableHead className="text-xs text-right">Achievement</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((r: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs font-medium">{r.srName || r.name}</TableCell>
                      <TableCell className="text-xs">{r.designation || "—"}</TableCell>
                      <TableCell className="text-xs text-right">{r.totalSales || 0}</TableCell>
                      <TableCell className="text-xs text-right">{isVatAuditor ? AUDIT_MASK : fmtCurrency(r.totalRevenue)}</TableCell>
                      <TableCell className="text-xs text-right">{(r.commissionRate || r.commissionPercentage || 0).toFixed(1)}%</TableCell>
                      <TableCell className="text-xs text-right font-medium text-green-600">{isVatAuditor ? AUDIT_MASK : fmtCurrency(r.earnedCommission)}</TableCell>
                      <TableCell className="text-xs text-right">{isVatAuditor ? AUDIT_MASK : fmtCurrency(r.targetAmount)}</TableCell>
                      <TableCell className="text-xs text-right">
                        <Badge className={(r.targetAchievement || 0) >= 100 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : (r.targetAchievement || 0) >= 50 ? SEVERITY_BADGE.Warning : SEVERITY_BADGE.Critical}>
                          {(r.targetAchievement || 0).toFixed(1)}%
                        </Badge>
                      </TableCell>
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

  const renderCollectionSubTab = () => {
    if (collectionLoading) return <LoadingSkeleton rows={3} />;
    const cd = collectionData || {};
    const records = cd.records || [];
    const summary = cd.summary || {};

    const collExportColumns: ExportColumnDef[] = [
      { key: "customerCode", label: "Code", type: "text" },
      { key: "customerName", label: "Customer", type: "text" },
      { key: "openingBalance", label: "Opening Balance", type: "currency" },
      { key: "totalInvoiced", label: "Total Invoiced", type: "currency" },
      { key: "totalCollected", label: "Total Collected", type: "currency" },
      { key: "totalReturned", label: "Total Returned", type: "currency" },
      { key: "currentBalance", label: "Current Balance", type: "currency" },
      { key: "collectionRate", label: "Collection Rate %", type: "number" },
    ];

    const aging = summary.aging || {};

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <CircleDollarSign className="w-5 h-5 text-[#2563eb]" /> Customer Collection Matrix
          </h3>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => doExportPDF("Collection Matrix", collExportColumns, records, "landscape")}><FileDown className="w-3.5 h-3.5 mr-1" /> PDF</Button>
            <Button variant="outline" size="sm" onClick={() => doExportCSV("Collection Matrix", collExportColumns, records)}><Download className="w-3.5 h-3.5 mr-1" /> CSV</Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <StatCard label="Total Receivables" value={isVatAuditor ? AUDIT_MASK : fmtCurrency(summary.totalReceivables || 0)} icon={ArrowDownRight} color="text-amber-600" bg="bg-amber-100 dark:bg-amber-900/30" />
          <StatCard label="Total Collected" value={isVatAuditor ? AUDIT_MASK : fmtCurrency(summary.totalCollected || 0)} icon={CheckCircle2} color="text-green-600" bg="bg-green-100 dark:bg-green-900/30" />
          <StatCard label="Collection Rate" value={`${(summary.overallCollectionRate || 0).toFixed(1)}%`} icon={TrendingUp} color="text-blue-600" bg="bg-blue-100 dark:bg-blue-900/30" />
          <StatCard label="Avg Days to Collect" value={`${summary.averageDaysToCollect || 0} days`} icon={Clock} color="text-purple-600" bg="bg-purple-100 dark:bg-purple-900/30" />
        </div>

        {/* Receivables Aging */}
        <Card>
          <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white rounded-t-lg py-3 px-4">
            <CardTitle className="text-sm font-medium">Receivables Aging</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-5 gap-3">
              {[
                { label: "Current", value: aging.current || 0 },
                { label: "1-30 days", value: aging["1-30"] || aging["1-30 days"] || 0 },
                { label: "31-60 days", value: aging["31-60"] || aging["31-60 days"] || 0 },
                { label: "61-90 days", value: aging["61-90"] || aging["61-90 days"] || 0 },
                { label: "90+ days", value: aging["90+"] || aging["90+ days"] || 0 },
              ].map((a, i) => (
                <div key={i} className="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                  <p className="text-xs text-muted-foreground">{a.label}</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{isVatAuditor ? AUDIT_MASK : fmtCurrency(a.value)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {(cd.chartData || []).length > 0 && (
          <Card>
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white rounded-t-lg py-3 px-4">
              <CardTitle className="text-sm font-medium">Collection Trends</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={cd.chartData || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke={resolvedTheme === "dark" ? "#334155" : "#e2e8f0"} />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke={resolvedTheme === "dark" ? "#94a3b8" : "#64748b"} />
                  <YAxis tick={{ fontSize: 10 }} stroke={resolvedTheme === "dark" ? "#94a3b8" : "#64748b"} />
                  <Tooltip contentStyle={{ backgroundColor: resolvedTheme === "dark" ? "#1e293b" : "#fff", border: "1px solid #e2e8f0" }} />
                  <Legend />
                  <Bar dataKey="invoiced" name="Invoiced" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="collected" name="Collected" fill="#16a34a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-0">
            <div className="max-h-80 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Code</TableHead>
                    <TableHead className="text-xs">Customer</TableHead>
                    <TableHead className="text-xs text-right">Opening</TableHead>
                    <TableHead className="text-xs text-right">Invoiced</TableHead>
                    <TableHead className="text-xs text-right">Collected</TableHead>
                    <TableHead className="text-xs text-right">Returned</TableHead>
                    <TableHead className="text-xs text-right">Balance</TableHead>
                    <TableHead className="text-xs text-right">Coll. Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((r: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs font-mono">{r.customerCode}</TableCell>
                      <TableCell className="text-xs">{r.customerName || r.name}</TableCell>
                      <TableCell className="text-xs text-right">{isVatAuditor ? AUDIT_MASK : fmtCurrency(r.openingBalance)}</TableCell>
                      <TableCell className="text-xs text-right">{isVatAuditor ? AUDIT_MASK : fmtCurrency(r.totalInvoiced)}</TableCell>
                      <TableCell className="text-xs text-right">{isVatAuditor ? AUDIT_MASK : fmtCurrency(r.totalCollected)}</TableCell>
                      <TableCell className="text-xs text-right">{isVatAuditor ? AUDIT_MASK : fmtCurrency(r.totalReturned)}</TableCell>
                      <TableCell className="text-xs text-right font-medium">{isVatAuditor ? AUDIT_MASK : fmtCurrency(r.currentBalance)}</TableCell>
                      <TableCell className="text-xs text-right">
                        <Badge className={(r.collectionRate || 0) >= 80 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : (r.collectionRate || 0) >= 50 ? SEVERITY_BADGE.Warning : SEVERITY_BADGE.Critical}>
                          {(r.collectionRate || 0).toFixed(1)}%
                        </Badge>
                      </TableCell>
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
  // TAB 7: NOTIFICATIONS & INTEGRITY
  // ============================================================

  const renderNotificationsTab = () => {
    if (isSR || isDealer) return <ForbiddenPage module="Notifications & Integrity" />;

    const markAllRead = async () => {
      try {
        await apiFetch("/api/notifications", { method: "PUT", body: JSON.stringify({ action: "mark-all-read" }) });
        toast({ title: "Done", description: "All notifications marked as read" });
        loadNotifications();
      } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    };

    const dismissNotif = async (id: string) => {
      try {
        await apiFetch("/api/notifications", { method: "PUT", body: JSON.stringify({ id, action: "dismiss" }) });
        loadNotifications();
      } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    };

    const markRead = async (id: string) => {
      try {
        await apiFetch("/api/notifications", { method: "PUT", body: JSON.stringify({ id, action: "mark-read" }) });
        loadNotifications();
      } catch (e: any) {}
    };

    const generateNotifs = async () => {
      try {
        await apiFetch("/api/notifications", { method: "POST", body: JSON.stringify({ action: "generate" }) });
        toast({ title: "Generated", description: "Notifications auto-generated" });
        loadNotifications();
      } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    };

    const runIntegrityCheck = async () => {
      try {
        const res = await apiFetch("/api/data-integrity?action=run-check", { method: "POST" });
        toast({ title: "Checks Complete", description: `${res.summary?.passed || 0} passed, ${res.summary?.failed || 0} failed, ${res.summary?.warnings || 0} warnings` });
        loadIntegrity();
      } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    };

    return (
      <div className="space-y-4">
        {/* Notifications */}
        <Card>
          <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white rounded-t-lg py-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Bell className="w-4 h-4" /> Notifications
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="h-7 text-white hover:text-white hover:bg-white/10" onClick={generateNotifs}><RefreshCw className="w-3 h-3 mr-1" /> Generate</Button>
                <Button variant="ghost" size="sm" className="h-7 text-white hover:text-white hover:bg-white/10" onClick={markAllRead}><CheckCheck className="w-3 h-3 mr-1" /> Mark All Read</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-2 mb-3">
              <Select value={notifTypeFilter} onValueChange={setNotifTypeFilter}><SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="All Types" /></SelectTrigger><SelectContent><SelectItem value="all">All Types</SelectItem>{["LowStock", "OverdueInstallment", "DataIntegrity", "PeriodClose", "BalanceMismatch", "System"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
              <Select value={notifSeverityFilter} onValueChange={setNotifSeverityFilter}><SelectTrigger className="h-8 w-28 text-xs"><SelectValue placeholder="All" /></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem>{["Info", "Warning", "Critical"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
            </div>

            {notifLoading ? <LoadingSkeleton rows={3} /> : (
              <div className="max-h-72 overflow-y-auto space-y-2">
                {notifRecords.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No notifications found</p>
                ) : notifRecords.map((n: any) => (
                  <div key={n.id} className={`flex items-start gap-3 p-3 rounded-lg border ${n.isRead ? "bg-white dark:bg-slate-900" : "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"}`}>
                    <div className="mt-0.5">
                      {n.severity === "Critical" ? <AlertCircle className="w-4 h-4 text-red-500" /> : n.severity === "Warning" ? <AlertTriangle className="w-4 h-4 text-amber-500" /> : <Info className="w-4 h-4 text-blue-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${n.isRead ? "text-slate-700 dark:text-slate-300" : "text-slate-900 dark:text-white"}`}>{n.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge className={SEVERITY_BADGE[n.severity] || ""}>{n.severity}</Badge>
                        <span className="text-[10px] text-muted-foreground">{fmtDate(n.createdAt)}</span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {!n.isRead && <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => markRead(n.id)}><CheckCircle2 className="w-3.5 h-3.5" /></Button>}
                      {isAdmin && <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => dismissNotif(n.id)}><X className="w-3.5 h-3.5" /></Button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Data Integrity */}
        <Card>
          <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white rounded-t-lg py-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" /> Data Integrity Checks
              </CardTitle>
              {isAdmin && <Button variant="ghost" size="sm" className="h-7 text-white hover:text-white hover:bg-white/10" onClick={runIntegrityCheck}><ClipboardCheck className="w-3 h-3 mr-1" /> Run Checks</Button>}
            </div>
          </CardHeader>
          <CardContent className="p-4">
            {integrityLoading ? <LoadingSkeleton rows={2} /> : (
              <div className="max-h-64 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Code</TableHead>
                      <TableHead className="text-xs">Check Type</TableHead>
                      <TableHead className="text-xs">Module</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs text-right">Discrepancy</TableHead>
                      <TableHead className="text-xs">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {integrityRecords.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs font-mono">{r.code}</TableCell>
                        <TableCell className="text-xs">{r.checkType}</TableCell>
                        <TableCell className="text-xs">{r.module}</TableCell>
                        <TableCell className="text-xs"><Badge className={STATUS_BADGE[r.status] || ""}>{r.status}</Badge></TableCell>
                        <TableCell className="text-xs text-right">{isVatAuditor ? AUDIT_MASK : r.discrepancy}</TableCell>
                        <TableCell className="text-xs">{fmtDate(r.checkedAt || r.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  // ============================================================
  // MAIN RENDER
  // ============================================================

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[#132240] dark:bg-[#0a1628]">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Financial Audit Module</h2>
            <p className="text-sm text-muted-foreground">Fraud detection, ledger integrity, inventory aging & specialized reporting</p>
          </div>
          {isVatAuditor && <Badge className="bg-amber-500 text-white hover:bg-amber-600 ml-2">VAT AUDIT MODE</Badge>}
        </div>
        <div className="flex items-center gap-2">
          {healthScore !== null && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800">
              <Gauge className={`w-4 h-4 ${healthScore >= 80 ? "text-green-500" : healthScore >= 50 ? "text-amber-500" : "text-red-500"}`} />
              <span className="text-sm font-bold text-slate-900 dark:text-white">{healthScore}/100</span>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => { loadKPI(); loadFraudDetection(); }}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh All
          </Button>
        </div>
      </div>

      {/* VAT Auditor Banner */}
      {isVatAuditor && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <Badge className="bg-amber-500 text-white">VAT AUDIT MODE</Badge>
          <span className="text-sm text-amber-700 dark:text-amber-400">Cost prices, profit margins, and internal adjustments are masked.</span>
        </div>
      )}

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/50 p-1">
          <TabsTrigger value="kpi" className="text-xs data-[state=active]:bg-[#2563eb] data-[state=active]:text-white">
            <BarChart3 className="w-3.5 h-3.5 mr-1" /> KPI Dashboard
          </TabsTrigger>
          <TabsTrigger value="fraud-detection" className="text-xs data-[state=active]:bg-[#2563eb] data-[state=active]:text-white">
            <Fingerprint className="w-3.5 h-3.5 mr-1" /> Fraud Detection
          </TabsTrigger>
          <TabsTrigger value="ledger-auto-post" className="text-xs data-[state=active]:bg-[#2563eb] data-[state=active]:text-white">
            <BookOpen className="w-3.5 h-3.5 mr-1" /> Ledger Auto-Post
          </TabsTrigger>
          <TabsTrigger value="inventory-aging" className="text-xs data-[state=active]:bg-[#2563eb] data-[state=active]:text-white">
            <Clock className="w-3.5 h-3.5 mr-1" /> Inventory Aging
          </TabsTrigger>
          <TabsTrigger value="product-lifecycle" className="text-xs data-[state=active]:bg-[#2563eb] data-[state=active]:text-white">
            <QrCode className="w-3.5 h-3.5 mr-1" /> Product Lifecycle
          </TabsTrigger>
          <TabsTrigger value="specialized-reports" className="text-xs data-[state=active]:bg-[#2563eb] data-[state=active]:text-white">
            <FileBarChart className="w-3.5 h-3.5 mr-1" /> Specialized Reports
          </TabsTrigger>
          <TabsTrigger value="notifications-integrity" className="text-xs data-[state=active]:bg-[#2563eb] data-[state=active]:text-white">
            <Bell className="w-3.5 h-3.5 mr-1" /> Notifications & Integrity
          </TabsTrigger>
        </TabsList>

        <TabsContent value="kpi">{renderKPITab()}</TabsContent>
        <TabsContent value="fraud-detection">{renderFraudDetectionTab()}</TabsContent>
        <TabsContent value="ledger-auto-post">{renderLedgerTab()}</TabsContent>
        <TabsContent value="inventory-aging">{renderAgingTab()}</TabsContent>
        <TabsContent value="product-lifecycle">{renderLifecycleTab()}</TabsContent>
        <TabsContent value="specialized-reports">{renderSpecializedTab()}</TabsContent>
        <TabsContent value="notifications-integrity">{renderNotificationsTab()}</TabsContent>
      </Tabs>
    </div>
  );
}
