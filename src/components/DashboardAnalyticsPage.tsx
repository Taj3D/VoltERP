"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  LayoutDashboard, TrendingUp, TrendingDown, Package, Receipt, ShoppingCart,
  DollarSign, Banknote, AlertTriangle, ArrowUpCircle, ArrowDownCircle, RefreshCw,
  BarChart3, Users, Truck, Calendar, Send, Search, ArrowLeftRight, Plus, Clock,
  Activity, CreditCard, Landmark, Scale, Download, FileDown, Printer, Upload,
  UserCheck, Building2, BoxIcon, ShoppingBag, Coins, BarChart2, PieChart as PieChartIcon, Percent,
  Wallet, Database, CircleDollarSign, Info, RotateCcw, Loader2, CheckCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch } from "@/lib/api-client";
import { exportToPDFSimple, exportToCSVSimple } from "@/lib/export-utils";
import { ROLES, ROLE_COLORS_WITH_TEXT, ROLE_LABELS, type Role } from "@/lib/constants";

// ============================================================
// SAFE CURRENCY FORMATTER (prevents Bengali digit output)
// ============================================================

const safeNumberFormatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const safeIntFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

const fmt = (v: any, type?: string) => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string" && (v === "N/A (Audit Mode)" || v === "N/A (Restricted)")) return v;
  if (type === "currency") return `Tk. ${safeNumberFormatter.format(Number(v))}`;
  if (type === "date") { if (!v) return "—"; const dt = new Date(v); return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
  if (type === "percent") return `${Number(v).toFixed(2)}%`;
  return String(v);
};

const fmtDate = (d: string | Date) => { if (!d) return "—"; const dt = new Date(d); return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); };

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell
} from "recharts";

// (apiFetch and useAuth imported from shared modules)

// ============================================================
// CONSTANTS
// ============================================================

const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

// ROLE_LABELS and ROLE_COLORS imported from @/lib/constants
const ROLE_COLORS = ROLE_COLORS_WITH_TEXT;

// ============================================================
// ANIMATED COUNTER HOOK
// ============================================================

function useAnimatedCounter(target: number, duration: number = 1200) {
  const [value, setValue] = useState(0);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    const start = value;
    const diff = target - start;
    if (diff === 0) return;
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      setValue(Math.round(start + diff * eased));
      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate);
      }
    };
    animRef.current = requestAnimationFrame(animate);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [target, duration]);

  return value;
}

// ============================================================
// SPARKLINE SVG COMPONENT
// ============================================================

function Sparkline({ data, color = "#10b981", width = 60, height = 24 }: {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={width} height={height} className="opacity-70">
      <polyline fill="none" stroke={color} strokeWidth={1.5} points={points} />
    </svg>
  );
}

// ============================================================
// KPI CARD COMPONENT
// ============================================================

function KpiCard({ label, value, icon: Icon, color, bg, change, isCurrency, formatType, sparklineData }: {
  label: string;
  value: any;
  icon: React.ElementType;
  color: string;
  bg: string;
  change?: number;
  isCurrency?: boolean;
  formatType?: "currency" | "number" | "percent";
  sparklineData?: number[];
}) {
  const numValue = typeof value === "number" ? value : 0;
  const animated = useAnimatedCounter(numValue);
  const displayValue = typeof value === "string" && value === "N/A (Audit Mode)"
    ? value
    : formatType === "percent"
      ? `${Number(value).toFixed(2)}%`
      : isCurrency
        ? `Tk. ${safeNumberFormatter.format(animated)}`
        : String(animated);

  // Derive gradient colors from bg prop
  const gradientMap: Record<string, string> = {
    "bg-green-50 dark:bg-green-900/30": "from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20",
    "bg-purple-50 dark:bg-purple-900/30": "from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20",
    "bg-teal-50 dark:bg-teal-900/30": "from-teal-50 to-cyan-50 dark:from-teal-900/20 dark:to-cyan-900/20",
    "bg-blue-50 dark:bg-blue-900/30": "from-blue-50 to-sky-50 dark:from-blue-900/20 dark:to-sky-900/20",
    "bg-red-50 dark:bg-red-900/30": "from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20",
    "bg-emerald-50 dark:bg-emerald-900/30": "from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20",
    "bg-cyan-50 dark:bg-cyan-900/30": "from-cyan-50 to-teal-50 dark:from-cyan-900/20 dark:to-teal-900/20",
    "bg-orange-50 dark:bg-orange-900/30": "from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20",
    "bg-amber-50 dark:bg-amber-900/30": "from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20",
    "bg-yellow-50 dark:bg-yellow-900/30": "from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20",
    "bg-rose-50 dark:bg-rose-900/30": "from-rose-50 to-pink-50 dark:from-rose-900/20 dark:to-pink-900/20",
    "bg-indigo-50 dark:bg-indigo-900/30": "from-indigo-50 to-violet-50 dark:from-indigo-900/20 dark:to-violet-900/20",
  };
  const gradient = gradientMap[bg] || "from-gray-50 to-slate-50 dark:from-gray-900/20 dark:to-slate-900/20";

  return (
    <Card className={`kpi-card dashboard-kpi-card bg-gradient-to-br ${gradient} border shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className={`p-2 rounded-lg ${bg} ${color} shadow-sm`}><Icon className="w-5 h-5" /></div>
          {change !== undefined && change !== null && (
            <div className={`flex items-center text-xs font-medium px-1.5 py-0.5 rounded-full ${change >= 0 ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"}`}>
              {change >= 0 ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
              {Math.abs(change).toFixed(1)}%
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold text-slate-900 dark:text-white stat-value">{displayValue}</p>
        {sparklineData && sparklineData.length > 1 && (
          <div className="mt-1">
            <Sparkline data={sparklineData} color={change !== undefined && change >= 0 ? "#10b981" : "#ef4444"} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// RATIO INDICATOR
// ============================================================

function RatioIndicator({ value, label, description, format }: {
  value: any;
  label: string;
  description: string;
  format?: "ratio" | "percent" | "currency";
}) {
  const isMasked = typeof value === "string" && value === "N/A (Audit Mode)";
  const numVal = isMasked ? 0 : Number(value);

  let colorClass = "text-muted-foreground";
  let bgClass = "bg-muted/50";
  if (!isMasked) {
    if (format === "ratio") {
      if (numVal > 1.5) { colorClass = "text-green-600 dark:text-green-400"; bgClass = "bg-green-50 dark:bg-green-900/20"; }
      else if (numVal >= 1) { colorClass = "text-yellow-600 dark:text-yellow-400"; bgClass = "bg-yellow-50 dark:bg-yellow-900/20"; }
      else { colorClass = "text-red-600 dark:text-red-400"; bgClass = "bg-red-50 dark:bg-red-900/20"; }
    } else if (format === "percent") {
      if (numVal > 20) { colorClass = "text-green-600 dark:text-green-400"; bgClass = "bg-green-50 dark:bg-green-900/20"; }
      else if (numVal >= 5) { colorClass = "text-yellow-600 dark:text-yellow-400"; bgClass = "bg-yellow-50 dark:bg-yellow-900/20"; }
      else { colorClass = "text-red-600 dark:text-red-400"; bgClass = "bg-red-50 dark:bg-red-900/20"; }
    } else if (format === "currency") {
      if (numVal > 0) { colorClass = "text-green-600 dark:text-green-400"; bgClass = "bg-green-50 dark:bg-green-900/20"; }
      else { colorClass = "text-red-600 dark:text-red-400"; bgClass = "bg-red-50 dark:bg-red-900/20"; }
    }
  }

  const formattedValue = isMasked
    ? value
    : format === "currency"
      ? fmt(numVal, "currency")
      : format === "percent"
        ? `${numVal.toFixed(2)}%`
        : numVal.toFixed(2);

  return (
    <div className={`rounded-lg p-3 border ${bgClass}`}>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-lg font-bold ${colorClass}`}>{formattedValue}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{description}</p>
    </div>
  );
}

// ============================================================
// SECTION SKELETON
// ============================================================

function SectionSkeleton({ title, rows = 3 }: { title: string; rows?: number }) {
  return (
    <Card>
      <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg">
        <CardTitle className="text-base flex items-center gap-2 text-white">
          <RefreshCw className="w-4 h-4 text-blue-300 animate-spin" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-8 bg-muted animate-pulse rounded" />
        ))}
      </CardContent>
    </Card>
  );
}

// ============================================================
// INSTALLMENT ROW COMPONENT
// ============================================================

function InstallmentRow({ inst, index, fmtDate, fmt, apiFetch, toast, onUpdated }: {
  inst: any;
  index: number;
  fmtDate: (d: string | Date) => string;
  fmt: (v: any, type?: string) => string;
  apiFetch: (path: string, opts?: RequestInit) => Promise<any>;
  toast: (opts: any) => void;
  onUpdated?: () => void;
}) {
  const customerName = inst.customer?.name || inst.customerName || "—";
  const customerCode = inst.customer?.customerCode || inst.customerCode || "—";
  const customerPhone = inst.customer?.phone || "—";
  const productName = inst.products?.[0]?.name || inst.productName || "Not available";
  const salesDate = inst.date || inst.salesDate;
  const paymentDate = inst.nextPaymentDate || inst.paymentDate;
  const balanceAmount = inst.balanceAmount ?? inst.defaultAmount ?? 0;

  const [remindDate, setRemindDate] = useState(inst.nextPaymentDate ? inst.nextPaymentDate.split("T")[0] : "");
  const [updating, setUpdating] = useState(false);

  const handleUpdateRemindDate = async () => {
    if (!remindDate || !inst.id) return;
    setUpdating(true);
    try {
      await apiFetch(`/api/hire-sales/${inst.id}`, {
        method: "PUT",
        body: JSON.stringify({ nextPaymentDate: remindDate }),
      });
      toast({ title: "Updated", description: "Remind date updated successfully" });
      onUpdated?.();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setUpdating(false);
    }
  };

  return (
    <TableRow>
      <TableCell>{index + 1}</TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Input
            type="date"
            value={remindDate}
            onChange={e => setRemindDate(e.target.value)}
            className="w-[120px] h-7 text-xs"
          />
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-7"
            disabled={updating || !remindDate}
            onClick={handleUpdateRemindDate}
          >
            {updating ? "..." : "Set"}
          </Button>
        </div>
      </TableCell>
      <TableCell className="font-mono">{inst.invoiceNo || "—"}</TableCell>
      <TableCell>{salesDate ? fmtDate(salesDate) : "—"}</TableCell>
      <TableCell>{paymentDate ? fmtDate(paymentDate) : "—"}</TableCell>
      <TableCell className="font-mono">{customerCode}</TableCell>
      <TableCell className="font-medium text-slate-900 dark:text-white">{customerName}</TableCell>
      <TableCell>{customerPhone}</TableCell>
      <TableCell>{productName}</TableCell>
      <TableCell className="font-mono">{fmt(inst.installmentAmount, "currency")}</TableCell>
      <TableCell className="font-mono">{fmt(balanceAmount, "currency")}</TableCell>
    </TableRow>
  );
}

// ============================================================
// EXPORT UTILITIES
// ============================================================

function exportStockAlertsCSV(data: any[]) {
  try {
    const headers = ["Product Code", "Product Name", "Category", "Current Stock", "Reorder Level", "Deficit", "Godown"];
    const rows = data.map(d => [d.productCode, d.productName, d.category, String(d.currentStock ?? ""), String(d.reorderLevel ?? ""), String(d.deficit ?? ""), d.godown ?? ""]);
    exportToCSVSimple("Stock Alerts", headers, rows);
  } catch (e: any) {
    console.error("Export Stock Alerts CSV Error:", e);
  }
}

function exportStockAlertsPDF(data: any[], kpiData?: Record<string, any>, printedBy?: string) {
  try {
    const headers = ["Product Code", "Product Name", "Category", "Current Stock", "Reorder Level", "Deficit", "Godown"];
    const body = data.map(d => [d.productCode, d.productName, d.category, String(d.currentStock ?? ""), String(d.reorderLevel ?? ""), String(d.deficit ?? ""), d.godown ?? ""]);
    const subtitle = kpiData
      ? `KPI: Revenue ${fmt(kpiData.totalRevenue, "currency")} | Purchases ${fmt(kpiData.totalPurchases, "currency")} | Profit ${typeof kpiData.netProfit === "string" ? kpiData.netProfit : fmt(kpiData.netProfit, "currency")} | Today's Sales ${fmt(kpiData.todaysSales, "currency")}`
      : undefined;
    exportToPDFSimple("Stock Alerts & KPI Summary", headers, body, "landscape", subtitle, undefined, { preparedBy: printedBy || "System", checkedBy: "", authorizedBy: "", printedBy: printedBy || "System" });
  } catch (e: any) {
    console.error("Export Stock Alerts PDF Error:", e);
  }
}

function exportFinancialRatiosCSV(ratios: Record<string, any>) {
  try {
    const headers = ["Ratio", "Value"];
    const rows = Object.entries(ratios).filter(([k]) => k !== "type" && k !== "vatMode" && k !== "vatAuditMode").map(([k, v]) => [k.replace(/([A-Z])/g, " $1").trim(), String(v)]);
    exportToCSVSimple("Financial Ratios", headers, rows);
  } catch (e: any) {
    console.error("Export Financial Ratios CSV Error:", e);
  }
}

function exportFinancialRatiosPDF(ratios: Record<string, any>, printedBy?: string) {
  try {
    const headers = ["Ratio", "Value"];
    const body = Object.entries(ratios).filter(([k]) => k !== "type" && k !== "vatMode" && k !== "vatAuditMode").map(([k, v]) => [k.replace(/([A-Z])/g, " $1").trim(), String(v)]);
    exportToPDFSimple("Financial Ratios", headers, body, "portrait", undefined, undefined, { preparedBy: printedBy || "System", checkedBy: "", authorizedBy: "", printedBy: printedBy || "System" });
  } catch (e: any) {
    console.error("Export Financial Ratios PDF Error:", e);
  }
}

function exportDashboardCSV(stockData: any[], ratios: Record<string, any>) {
  try {
    const stockHeaders = ["Product Code", "Product Name", "Category", "Current Stock", "Reorder Level", "Deficit", "Godown"];
    const stockRows = stockData.map(d => [d.productCode, d.productName, d.category, String(d.currentStock ?? ""), String(d.reorderLevel ?? ""), String(d.deficit ?? ""), d.godown ?? ""]);
    exportToCSVSimple("Stock Alerts", stockHeaders, stockRows);

    const ratioHeaders = ["Ratio", "Value"];
    const ratioRows = Object.entries(ratios).filter(([k]) => k !== "type" && k !== "vatMode" && k !== "vatAuditMode").map(([k, v]) => [k, String(v)]);
    exportToCSVSimple("Financial Ratios", ratioHeaders, ratioRows);
  } catch (e: any) {
    console.error("Export Dashboard CSV Error:", e);
  }
}

// ============================================================
// MAIN DASHBOARD ANALYTICS PAGE
// ============================================================

interface DashboardAnalyticsPageProps {
  onNavigate?: (page: string) => void;
}

export default function DashboardAnalyticsPage({ onNavigate }: DashboardAnalyticsPageProps = {}) {
  const { toast } = useToast();
  const auth = useAuth();
  const isVatAuditor = auth.isVatAuditor;
  const isSR = auth.isSR;
  const isDealer = auth.isDealer;
  const userName = auth.user?.displayName || auth.user?.name || "User";

  // Clock
  const [clock, setClock] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Date Range Picker state
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Data states
  const [kpiData, setKpiData] = useState<any>({});
  const [monthlyTrend, setMonthlyTrend] = useState<any[]>([]);
  const [categoryTurnover, setCategoryTurnover] = useState<any[]>([]);
  const [stockAlerts, setStockAlerts] = useState<any>({ data: [], alertCount: 0, criticalCount: 0 });
  const [financialRatios, setFinancialRatios] = useState<any>({});
  const [topPerformers, setTopPerformers] = useState<any>({ topProducts: [], topCustomers: [], topSRs: [] });
  const [paymentMix, setPaymentMix] = useState<any[]>([]);
  const [receivablesAging, setReceivablesAging] = useState<any>({});
  const [installments, setInstallments] = useState<any[]>([]);
  const [todaysInstallments, setTodaysInstallments] = useState<any[]>([]);
  const [stockSearchQuery, setStockSearchQuery] = useState('');
  const [stockSearchResults, setStockSearchResults] = useState<any[]>([]);
  const [stockSearchLoading, setStockSearchLoading] = useState(false);
  const stockSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dailySalesTrend, setDailySalesTrend] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sectionErrors, setSectionErrors] = useState<Record<string, string>>({});
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Helper to build date range query params
  const dateParams = useMemo(() => {
    let params = "";
    if (startDate) params += `&startDate=${startDate}`;
    if (endDate) params += `&endDate=${endDate}`;
    return params;
  }, [startDate, endDate]);

  // Fetch all data in parallel with per-section error tracking
  const fetchAllData = useCallback(async () => {
    setLoading(true);
    setSectionErrors({});
    const errors: Record<string, string> = {};

    const vatParam = isVatAuditor ? "&vatMode=true" : "";
    const dp = dateParams;

    const fetchSection = async (key: string, url: string, fallback: any) => {
      try {
        return await apiFetch(url);
      } catch (e: any) {
        errors[key] = e.message || "Failed to load";
        return fallback;
      }
    };

    const [
      kpiRes,
      trendRes,
      catRes,
      stockRes,
      ratioRes,
      perfRes,
      payRes,
      agingRes,
      dashRes,
      dailyRes,
    ] = await Promise.all([
      fetchSection("kpi", `/api/dashboard-analytics?type=kpi${vatParam}${dp}`, {}),
      fetchSection("trend", `/api/dashboard-analytics?type=monthly-trend&months=12${vatParam}${dp}`, { data: [] }),
      fetchSection("category", `/api/dashboard-analytics?type=category-turnover${vatParam}${dp}`, { data: [] }),
      fetchSection("stock", `/api/dashboard-analytics?type=stock-alerts${dp}`, { data: [], alertCount: 0, criticalCount: 0 }),
      fetchSection("ratios", `/api/dashboard-analytics?type=financial-ratios${vatParam}${dp}`, {}),
      fetchSection("performers", `/api/dashboard-analytics?type=top-performers&limit=5${vatParam}${dp}`, { topProducts: [], topCustomers: [], topSRs: [] }),
      fetchSection("payment", `/api/dashboard-analytics?type=payment-mix${vatParam}${dp}`, { data: [] }),
      fetchSection("aging", `/api/dashboard-analytics?type=receivables-aging${vatParam}${dp}`, {}),
      fetchSection("dashboard", "/api/dashboard", {}),
      fetchSection("daily", `/api/dashboard-analytics?type=daily-sales-trend${vatParam}${dp}`, { data: [] }),
    ]);

    setKpiData(kpiRes);
    setMonthlyTrend(trendRes.data || []);
    setCategoryTurnover(catRes.data || []);
    setStockAlerts(stockRes);
    setFinancialRatios(ratioRes);
    setTopPerformers(perfRes);
    setPaymentMix(payRes.data || []);
    setReceivablesAging(agingRes);
    setInstallments(dashRes.hireInstallments || []);
    setTodaysInstallments(dashRes.todaysInstallments || []);
    setDailySalesTrend(dailyRes.data || []);
    setSectionErrors(errors);
    setLastUpdated(new Date());
    setLoading(false);

    if (Object.keys(errors).length > 0) {
      toast({ title: "Partial Load", description: `${Object.keys(errors).length} section(s) failed to load. Click Refresh to retry.`, variant: "destructive" });
    }
  }, [isVatAuditor, dateParams, toast]);

  const [fetchTrigger, setFetchTrigger] = useState(0);
  useEffect(() => {
    const doFetch = async () => { await fetchAllData(); };
    doFetch();
  }, [fetchTrigger]);

  const refreshAll = useCallback(() => {
    setFetchTrigger(prev => prev + 1);
    toast({ title: "Refreshed", description: "Dashboard data updated" });
  }, [toast]);

  // Quick Stock Search with debounce
  const handleStockSearch = useCallback((query: string) => {
    setStockSearchQuery(query);
    if (stockSearchTimerRef.current) clearTimeout(stockSearchTimerRef.current);
    if (!query.trim()) {
      setStockSearchResults([]);
      setStockSearchLoading(false);
      return;
    }
    setStockSearchLoading(true);
    stockSearchTimerRef.current = setTimeout(async () => {
      try {
        const results = await apiFetch(`/api/products?search=${encodeURIComponent(query.trim())}&limit=10`);
        setStockSearchResults(Array.isArray(results) ? results : []);
      } catch {
        setStockSearchResults([]);
      } finally {
        setStockSearchLoading(false);
      }
    }, 400);
  }, []);

  // Print Today's Installments
  const handlePrintInstallments = useCallback(() => {
    const headers = ['Sl', 'Invoice No', 'Customer', 'Code', 'Phone', 'Product', 'Installment Amt', 'Balance', 'Due Date', 'Status'];
    const body = todaysInstallments.map((inst: any, i: number) => [
      String(i + 1),
      inst.invoiceNo || '—',
      inst.customer?.name || inst.customerName || '—',
      inst.customer?.customerCode || '—',
      inst.customer?.phone || '—',
      inst.products?.[0]?.name || inst.productName || '—',
      fmt(inst.installmentAmount, 'currency'),
      fmt(inst.balanceAmount ?? inst.defaultAmount ?? 0, 'currency'),
      inst.nextPaymentDate ? fmtDate(inst.nextPaymentDate) : '—',
      inst.currentStatus || '—',
    ]);
    exportToPDFSimple(
      `Today's Installment Payments — ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`,
      headers,
      body,
      'landscape',
      `Total: ${todaysInstallments.length} installment(s) due today`,
      undefined,
      { preparedBy: userName, checkedBy: '', authorizedBy: '', printedBy: userName },
    );
  }, [todaysInstallments, userName]);

  // Import CSV for reorder level configuration
  const importCSV = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv";
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      const lines = text.split("\n").filter(l => l.trim());
      if (lines.length < 2) {
        toast({ title: "Error", description: "CSV file is empty", variant: "destructive" });
        return;
      }
      const csvHeaders = lines[0].split(",").map(h => h.trim().replace(/"/g, ""));
      const productCodeIdx = csvHeaders.indexOf("Product Code");
      const reorderLevelIdx = csvHeaders.indexOf("Reorder Level");
      if (productCodeIdx < 0 || reorderLevelIdx < 0) {
        toast({ title: "Error", description: "CSV must have 'Product Code' and 'Reorder Level' columns", variant: "destructive" });
        return;
      }
      let imported = 0;
      let failed = 0;
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(",").map(v => v.trim().replace(/"/g, ""));
        const productCode = values[productCodeIdx];
        const reorderLevel = Number(values[reorderLevelIdx]);
        if (!productCode || isNaN(reorderLevel)) { failed++; continue; }
        try {
          const products = await apiFetch(`/api/products?search=${encodeURIComponent(productCode)}`);
          const product = Array.isArray(products) ? products.find((p: any) => p.productCode === productCode) : null;
          if (product?.id) {
            await apiFetch(`/api/products/${product.id}`, {
              method: "PUT",
              body: JSON.stringify({ reorderLevel }),
            });
            imported++;
          } else {
            failed++;
          }
        } catch {
          failed++;
        }
      }
      toast({
        title: "Import Complete",
        description: `${imported} reorder levels updated, ${failed} failed`,
        variant: failed > imported ? "destructive" : "default",
      });
      setFetchTrigger(prev => prev + 1);
    };
    input.click();
  }, [toast]);

  // ─── RBAC Filtered Data (20 KPIs with YoY comparisons) ─────────────────

  const visibleKpis = useMemo(() => {
    // Calculate YoY change percentages
    const revenueChange = kpiData.lastYearRevenue > 0
      ? ((kpiData.totalRevenue - kpiData.lastYearRevenue) / kpiData.lastYearRevenue) * 100
      : undefined;
    const purchasesChange = kpiData.lastYearPurchases > 0
      ? ((kpiData.totalPurchases - kpiData.lastYearPurchases) / kpiData.lastYearPurchases) * 100
      : undefined;

    const sparkline = kpiData.sparklineData || [];

    const all = [
      { label: "Total Revenue", value: kpiData.totalRevenue || 0, icon: TrendingUp, color: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-900/30", isCurrency: true, formatType: "currency" as const, change: revenueChange as number | undefined, sparklineData: sparkline },
      { label: "Total Purchases", value: kpiData.totalPurchases || 0, icon: ShoppingCart, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-900/30", isCurrency: true, formatType: "currency" as const, change: purchasesChange as number | undefined, sparklineData: sparkline },
      { label: "Gross Profit", value: isVatAuditor ? "N/A (Audit Mode)" : (kpiData.grossProfit || 0), icon: DollarSign, color: "text-teal-600 dark:text-teal-400", bg: "bg-teal-50 dark:bg-teal-900/30", isCurrency: !isVatAuditor, formatType: "currency" as const, change: undefined, sparklineData: undefined },
      { label: "Net Profit", value: isVatAuditor ? "N/A (Audit Mode)" : (kpiData.netProfit || 0), icon: Banknote, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-900/30", isCurrency: !isVatAuditor, formatType: "currency" as const, change: undefined, sparklineData: undefined },
      { label: "Total Expenses", value: kpiData.totalExpenses || 0, icon: TrendingDown, color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-900/30", isCurrency: true, formatType: "currency" as const, change: undefined, sparklineData: undefined },
      { label: "Total Incomes", value: kpiData.totalIncomes || 0, icon: TrendingUp, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/30", isCurrency: true, formatType: "currency" as const, change: undefined, sparklineData: undefined },
      { label: "Bank Balance", value: kpiData.totalBankBalance || 0, icon: Landmark, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/30", isCurrency: true, formatType: "currency" as const, change: undefined, sparklineData: undefined },
      { label: "Total Receivables", value: kpiData.totalReceivables || 0, icon: ArrowUpCircle, color: "text-cyan-600 dark:text-cyan-400", bg: "bg-cyan-50 dark:bg-cyan-900/30", isCurrency: true, formatType: "currency" as const, change: undefined, sparklineData: undefined },
      { label: "Total Payables", value: kpiData.totalPayables || 0, icon: ArrowDownCircle, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-900/30", isCurrency: true, formatType: "currency" as const, change: undefined, sparklineData: undefined },
      { label: "Low Stock Alerts", value: kpiData.lowStockCount || 0, icon: AlertTriangle, color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-900/30", isCurrency: false, formatType: "number" as const, change: undefined, sparklineData: undefined },
      { label: "Today's Sales", value: kpiData.todaysSales || 0, icon: Receipt, color: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-900/30", isCurrency: true, formatType: "currency" as const, change: undefined, sparklineData: undefined },
      { label: "Today's Purchases", value: kpiData.todaysPurchases || 0, icon: ShoppingBag, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-900/30", isCurrency: true, formatType: "currency" as const, change: undefined, sparklineData: undefined },
      { label: "Total Customers", value: kpiData.totalCustomers || 0, icon: UserCheck, color: "text-cyan-600 dark:text-cyan-400", bg: "bg-cyan-50 dark:bg-cyan-900/30", isCurrency: false, formatType: "number" as const, change: undefined, sparklineData: undefined },
      { label: "Total Suppliers", value: kpiData.totalSuppliers || 0, icon: Building2, color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-50 dark:bg-indigo-900/30", isCurrency: false, formatType: "number" as const, change: undefined, sparklineData: undefined },
      { label: "Total Products", value: kpiData.totalProducts || 0, icon: BoxIcon, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/30", isCurrency: false, formatType: "number" as const, change: undefined, sparklineData: undefined },
      { label: "Today's Collections", value: kpiData.todaysCollections || 0, icon: Coins, color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-900/30", isCurrency: true, formatType: "currency" as const, change: undefined, sparklineData: undefined },
      { label: "Month-to-Date Sales", value: kpiData.monthToDateSales || 0, icon: BarChart2, color: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-900/30", isCurrency: true, formatType: "currency" as const, change: undefined, sparklineData: undefined },
      { label: "Month-to-Date Purchases", value: kpiData.monthToDatePurchases || 0, icon: ShoppingCart, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-900/30", isCurrency: true, formatType: "currency" as const, change: undefined, sparklineData: undefined },
      { label: "Asset Turnover Ratio", value: isVatAuditor ? "N/A (Audit Mode)" : (kpiData.assetTurnoverRatio || 0), icon: PieChartIcon, color: "text-teal-600 dark:text-teal-400", bg: "bg-teal-50 dark:bg-teal-900/30", isCurrency: false, formatType: "percent" as const, change: undefined, sparklineData: undefined },
      { label: "Return on Sales", value: isVatAuditor ? "N/A (Audit Mode)" : (kpiData.returnOnSales || 0), icon: Percent, color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-50 dark:bg-rose-900/30", isCurrency: false, formatType: "percent" as const, change: undefined, sparklineData: undefined },
    ];

    if (isSR) {
      return all.filter(k => ["Total Receivables"].includes(k.label));
    }
    if (isDealer) {
      return all.filter(k => ["Low Stock Alerts", "Total Products"].includes(k.label));
    }
    return all;
  }, [kpiData, isVatAuditor, isSR, isDealer]);

  // ─── Receivables Aging Bar ─────────────────────────────────

  const agingData = useMemo(() => {
    const isAgingMasked = typeof receivablesAging.totalOutstanding === "string";
    const total = isAgingMasked ? 0 : (typeof receivablesAging.totalOutstanding === "number" ? receivablesAging.totalOutstanding : 0);
    const current = isAgingMasked ? 0 : (typeof receivablesAging.current === "number" ? receivablesAging.current : 0);
    const d31to60 = isAgingMasked ? 0 : (typeof receivablesAging.days31to60 === "number" ? receivablesAging.days31to60 : 0);
    const d61to90 = isAgingMasked ? 0 : (typeof receivablesAging.days61to90 === "number" ? receivablesAging.days61to90 : 0);
    const d90plus = isAgingMasked ? 0 : (typeof receivablesAging.days90plus === "number" ? receivablesAging.days90plus : 0);
    return { total, current, d31to60, d61to90, d90plus, isMasked: isAgingMasked };
  }, [receivablesAging]);

  // ─── RENDER ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="page-enter space-y-6">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
          <h2 className="text-xl font-bold">Dashboard</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4 space-y-2">
              <div className="h-4 bg-muted animate-pulse rounded w-2/3" />
              <div className="h-8 bg-muted animate-pulse rounded w-3/4" />
            </CardContent></Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SectionSkeleton title="Loading Charts..." />
          <SectionSkeleton title="Loading Charts..." />
        </div>
        <SectionSkeleton title="Loading Financial Ratios..." rows={2} />
        <SectionSkeleton title="Loading Stock Alerts..." rows={4} />
      </div>
    );
  }

  return (
    <div className="page-enter space-y-6">
      {/* Stock Alert Flash Animation CSS */}
      <style>{`
        @keyframes stock-flash {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .stock-alert-row { animation: stock-flash 2s ease-in-out infinite; }
        .stock-critical-row { animation: stock-flash 1s ease-in-out infinite; }
      `}</style>

      {/* ═══════════════════════════════════════════════════════════
          1. WELCOME HEADER
          ═══════════════════════════════════════════════════════════ */}
      <div className="flex items-center justify-between flex-wrap gap-3 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <div>
            <h2 className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white">Dashboard</h2>
            <p className="text-muted-foreground text-xs sm:text-sm">Welcome, {userName} — Here&apos;s your business overview</p>
          </div>
          {isVatAuditor && (
            <Badge className="bg-amber-500 text-black text-xs px-3 py-1">VAT AUDIT MODE</Badge>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Export buttons */}
          {!isSR && !isDealer && (
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => exportDashboardCSV(stockAlerts.data, financialRatios)}>
                <Download className="w-3.5 h-3.5 mr-1" />CSV
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => exportStockAlertsPDF(stockAlerts.data, kpiData, userName)}>
                <FileDown className="w-3.5 h-3.5 mr-1" />PDF
              </Button>
            </div>
          )}
          {/* Date Range Picker */}
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-[120px] sm:w-[140px] h-8 text-xs"
              placeholder="Start Date"
            />
            <span className="text-muted-foreground text-xs">to</span>
            <Input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-[120px] sm:w-[140px] h-8 text-xs"
              placeholder="End Date"
            />
            {(startDate || endDate) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => { setStartDate(""); setEndDate(""); }}
              >
                Clear
              </Button>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={refreshAll}>
            <RefreshCw className="w-4 h-4 mr-1" />Refresh
          </Button>
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
      </div>

      {/* Last Updated & Error Summary */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        {lastUpdated && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Last updated: {lastUpdated.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </p>
        )}
        {Object.keys(sectionErrors).length > 0 && (
          <div className="flex items-center gap-2">
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Failed sections: {Object.keys(sectionErrors).join(", ")}
            </p>
            <Button variant="outline" size="sm" className="h-6 text-xs" onClick={refreshAll}>
              <RotateCcw className="w-3 h-3 mr-1" />Retry All
            </Button>
          </div>
        )}
      </div>

      {/* VAT Auditor persistent banner */}
      {isVatAuditor && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <Badge className="bg-amber-500 text-black">VAT AUDIT MODE</Badge>
          <span className="text-sm text-amber-700 dark:text-amber-400">Cost prices, profit margins, and internal adjustments are masked. All financial ratios compute purely from legal invoice tax records.</span>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          QUICK STOCK SEARCH
          ═══════════════════════════════════════════════════════════ */}
      {!isSR && !isDealer && (
        <Card className="shadow-sm hover:shadow-md transition-shadow border border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                <Search className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Quick Stock Search</p>
                <p className="text-xs text-muted-foreground">Search by product name, code, SKU, or barcode</p>
              </div>
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Type to search products..."
                  value={stockSearchQuery}
                  onChange={e => handleStockSearch(e.target.value)}
                  className="pl-9 h-9"
                />
                {stockSearchLoading && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                )}
              </div>
            </div>
            {stockSearchResults.length > 0 && (
              <div className="mt-3 max-h-64 overflow-x-auto overflow-y-auto rounded-md border" style={{ scrollbarWidth: 'thin', scrollbarColor: '#94a3b8 transparent' }}>
                <Table className="min-w-[500px]">
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Product Name</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead>Godown</TableHead>
                      <TableHead className="text-right">MRP</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stockSearchResults.map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium text-slate-900 dark:text-white text-sm">{p.name}</TableCell>
                        <TableCell className="font-mono text-xs">{p.productCode || p.sku || '—'}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          <Badge variant={p.currentStock === 0 ? 'destructive' : p.stockStatus === 'Low Stock' ? 'outline' : 'default'} className="text-xs">
                            {p.currentStock ?? 0}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{p.godown?.name || '—'}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmt(p.salePrice, 'currency')}</TableCell>
                        <TableCell>
                          <Badge variant={p.stockStatus === 'In Stock' ? 'default' : p.stockStatus === 'Low Stock' ? 'outline' : 'destructive'} className="text-xs">
                            {p.stockStatus || '—'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {stockSearchQuery.trim() && stockSearchResults.length === 0 && !stockSearchLoading && (
              <div className="mt-3 text-center py-4 text-muted-foreground text-sm">
                <Package className="w-6 h-6 mx-auto mb-1 opacity-50" />
                <p>No products found matching &quot;{stockSearchQuery}&quot;</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════════
          2. KPI SUMMARY CARDS (20 KPIs with YoY & sparklines)
          ═══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
        {visibleKpis.map((kpi, i) => (
          <KpiCard
            key={i}
            label={kpi.label}
            value={kpi.value}
            icon={kpi.icon}
            color={kpi.color}
            bg={kpi.bg}
            isCurrency={kpi.isCurrency}
            formatType={kpi.formatType}
            change={kpi.change}
            sparklineData={kpi.sparklineData}
          />
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════
          3. QUICK STATS SUMMARY ROW
          ═══════════════════════════════════════════════════════════ */}
      {!isSR && !isDealer && !isVatAuditor && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="bg-gradient-to-r from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20 border-emerald-200 dark:border-emerald-700">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-3 rounded-xl bg-emerald-200 dark:bg-emerald-800"><Wallet className="w-6 h-6 text-emerald-700 dark:text-emerald-300" /></div>
              <div>
                <p className="text-xs text-emerald-600 dark:text-emerald-400">Cash in Hand</p>
                <p className="text-xl font-bold text-emerald-800 dark:text-emerald-200">{fmt(kpiData.cashInHand || 0, "currency")}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-r from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-800/20 border-amber-200 dark:border-amber-700">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-3 rounded-xl bg-amber-200 dark:bg-amber-800"><Database className="w-6 h-6 text-amber-700 dark:text-amber-300" /></div>
              <div>
                <p className="text-xs text-amber-600 dark:text-amber-400">Inventory Value</p>
                <p className="text-xl font-bold text-amber-800 dark:text-amber-200">{fmt(kpiData.inventoryValue || 0, "currency")}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-r from-teal-50 to-teal-100 dark:from-teal-900/20 dark:to-teal-800/20 border-teal-200 dark:border-teal-700">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-3 rounded-xl bg-teal-200 dark:bg-teal-800"><CircleDollarSign className="w-6 h-6 text-teal-700 dark:text-teal-300" /></div>
              <div>
                <p className="text-xs text-teal-600 dark:text-teal-400">Total Assets</p>
                <p className="text-xl font-bold text-teal-800 dark:text-teal-200">{fmt(kpiData.totalAssets || 0, "currency")}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          4. CHARTS SECTION (2-column grid)
          ═══════════════════════════════════════════════════════════ */}
      {!isSR && !isDealer && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Monthly Sales vs Purchases Trend - LineChart */}
          <Card className="w-full overflow-hidden">
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg">
              <CardTitle className="text-base flex items-center gap-2 text-white">
                <Activity className="w-4 h-4 text-blue-300" />
                Monthly Sales vs Purchases Trend
                {sectionErrors.trend && <Badge variant="destructive" className="text-xs ml-2">Error</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 min-h-[250px] sm:min-h-[300px]">
              {monthlyTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={monthlyTrend} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: "12px" }} />
                    <Line type="monotone" dataKey="sales" name="Sales" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="purchases" name="Purchases" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                    {!isVatAuditor && (
                      <Line type="monotone" dataKey="net" name="Net" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 5" />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[320px] text-muted-foreground">No trend data available</div>
              )}
            </CardContent>
          </Card>

          {/* Category Turnover Pie Chart */}
          <Card className="w-full overflow-hidden">
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg">
              <CardTitle className="text-base flex items-center gap-2 text-white">
                <BarChart3 className="w-4 h-4 text-blue-300" />
                Category Turnover
                {sectionErrors.category && <Badge variant="destructive" className="text-xs ml-2">Error</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 min-h-[250px] sm:min-h-[300px]">
              {categoryTurnover.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <PieChart>
                    <Pie
                      data={categoryTurnover}
                      cx="50%"
                      cy="50%"
                      labelLine={true}
                      label={({ name, percent }: { name: string; percent: number }) => `${name} (${(percent * 100).toFixed(1)}%)`}
                      outerRadius={120}
                      dataKey="value"
                    >
                      {categoryTurnover.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                      formatter={(value: any, name: string) => [fmt(value, "currency"), name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[320px] text-muted-foreground">No category data available</div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          5. DAILY SALES TREND (last 30 days)
          ═══════════════════════════════════════════════════════════ */}
      {!isSR && !isDealer && dailySalesTrend.length > 0 && (
        <Card className="w-full overflow-hidden">
          <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg">
            <CardTitle className="text-base flex items-center gap-2 text-white">
              <TrendingUp className="w-4 h-4 text-green-300" />
              Daily Sales Trend (Last 30 Days)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={dailySalesTrend} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} interval={2} />
                <YAxis tick={{ fontSize: 10 }} />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(value: any, name: string) => [fmt(value, "currency"), name]}
                />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Bar dataKey="sales" name="Sales" fill="#10b981" radius={[2, 2, 0, 0]} />
                <Bar dataKey="expenses" name="Expenses" fill="#ef4444" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════════
          6. FINANCIAL RATIOS PANEL (10 ratios)
          ═══════════════════════════════════════════════════════════ */}
      {!isSR && !isDealer && (
        <Card>
          <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2 text-white">
                <Scale className="w-4 h-4 text-blue-300" />
                Financial Ratios
                {sectionErrors.ratios && <Badge variant="destructive" className="text-xs ml-2">Error</Badge>}
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="text-white hover:text-white hover:bg-white/10" onClick={() => exportFinancialRatiosCSV(financialRatios)}>
                  <Download className="w-4 h-4 mr-1" />CSV
                </Button>
                <Button variant="ghost" size="sm" className="text-white hover:text-white hover:bg-white/10" onClick={() => exportFinancialRatiosPDF(financialRatios, userName)}>
                  <FileDown className="w-4 h-4 mr-1" />PDF
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3">
              <RatioIndicator
                label="Current Ratio"
                value={financialRatios.currentRatio}
                description="Current Assets / Current Liabilities"
                format="ratio"
              />
              <RatioIndicator
                label="Quick Ratio"
                value={financialRatios.quickRatio}
                description="(Current Assets - Inventory) / Liabilities"
                format="ratio"
              />
              <RatioIndicator
                label="Debt-to-Equity"
                value={financialRatios.debtToEquityRatio}
                description="Total Liabilities / Total Equity"
                format="ratio"
              />
              <RatioIndicator
                label="Gross Profit Margin"
                value={financialRatios.grossProfitMargin}
                description="(Revenue - COGS) / Revenue"
                format="percent"
              />
              <RatioIndicator
                label="Net Profit Margin"
                value={financialRatios.netProfitMargin}
                description="Net Profit / Revenue"
                format="percent"
              />
              <RatioIndicator
                label="Asset Turnover"
                value={financialRatios.assetTurnover}
                description="Revenue / Total Assets"
                format="ratio"
              />
              <RatioIndicator
                label="Inventory Turnover"
                value={financialRatios.inventoryTurnover}
                description="COGS / Average Inventory"
                format="ratio"
              />
              <RatioIndicator
                label="Receivables Turnover"
                value={financialRatios.receivablesTurnover}
                description="Revenue / Receivables"
                format="ratio"
              />
              <RatioIndicator
                label="Payables Turnover"
                value={financialRatios.payablesTurnover}
                description="Purchases / Payables"
                format="ratio"
              />
              <RatioIndicator
                label="Working Capital"
                value={financialRatios.workingCapital}
                description="Current Assets - Current Liabilities"
                format="currency"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════════
          7. STOCK ALERTS SECTION
          ═══════════════════════════════════════════════════════════ */}
      {!isSR && (
        <Card>
          <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2 text-white">
                <AlertTriangle className="w-4 h-4 text-red-300" />
                Low Stock Alerts
                {stockAlerts.criticalCount > 0 && (
                  <Badge className="bg-red-500 text-white ml-2">{stockAlerts.criticalCount} Critical</Badge>
                )}
                {sectionErrors.stock && <Badge variant="destructive" className="text-xs ml-2">Error</Badge>}
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="text-white hover:text-white hover:bg-white/10" onClick={importCSV}>
                  <Upload className="w-4 h-4 mr-1" />Import CSV
                </Button>
                <Button variant="ghost" size="sm" className="text-white hover:text-white hover:bg-white/10" onClick={() => exportDashboardCSV(stockAlerts.data, financialRatios)}>
                  <Download className="w-4 h-4 mr-1" />Export CSV
                </Button>
                <Button variant="ghost" size="sm" className="text-white hover:text-white hover:bg-white/10" onClick={() => exportStockAlertsPDF(stockAlerts.data, kpiData, userName)}>
                  <FileDown className="w-4 h-4 mr-1" />Export PDF
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            {stockAlerts.data && stockAlerts.data.length > 0 ? (
              <div className="max-h-96 overflow-x-auto overflow-y-auto rounded-md border" style={{ scrollbarWidth: "thin", scrollbarColor: "#94a3b8 transparent" }}>
              <div className="overflow-x-auto">
                <Table className="min-w-[600px]">
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Product Code</TableHead>
                      <TableHead>Product Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Current Stock</TableHead>
                      <TableHead className="text-right">Reorder Level</TableHead>
                      <TableHead className="text-right">Deficit</TableHead>
                      <TableHead>Godown</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stockAlerts.data.map((alert: any, i: number) => (
                      <TableRow
                        key={i}
                        className={
                          alert.currentStock === 0
                            ? "stock-critical-row bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30"
                            : "stock-alert-row bg-yellow-50 dark:bg-yellow-900/10 hover:bg-yellow-100 dark:hover:bg-yellow-900/20"
                        }
                      >
                        <TableCell className="font-mono">{alert.productCode || "—"}</TableCell>
                        <TableCell className="font-medium text-slate-900 dark:text-white">{alert.productName || "—"}</TableCell>
                        <TableCell>{alert.category || "—"}</TableCell>
                        <TableCell className="text-right font-mono">
                          <Badge variant={alert.currentStock === 0 ? "destructive" : "outline"} className="text-xs">
                            {alert.currentStock}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">{alert.reorderLevel}</TableCell>
                        <TableCell className="text-right font-mono font-bold text-red-600 dark:text-red-400">{alert.deficit}</TableCell>
                        <TableCell>{alert.godown || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>All products are above reorder levels</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════════
          8. TOP PERFORMERS SECTION (4-column grid)
          ═══════════════════════════════════════════════════════════ */}
      {!isSR && !isDealer && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Top Products */}
          <Card className="min-w-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-500" />
                Top Products
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topPerformers.topProducts && topPerformers.topProducts.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topPerformers.topProducts.map((p: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="font-bold text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium text-slate-900 dark:text-white text-sm">{p.name}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {typeof p.totalRevenue === "string" ? p.totalRevenue : fmt(p.totalRevenue, "currency")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center py-4 text-sm text-muted-foreground">No product data</p>
              )}
            </CardContent>
          </Card>

          {/* Top Customers */}
          <Card className="min-w-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4 text-green-500" />
                Top Customers
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topPerformers.topCustomers && topPerformers.topCustomers.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topPerformers.topCustomers.map((c: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="font-bold text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium text-slate-900 dark:text-white text-sm">{c.customerName}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmt(c.totalPurchase, "currency")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center py-4 text-sm text-muted-foreground">No customer data</p>
              )}
            </CardContent>
          </Card>

          {/* Top Suppliers */}
          <Card className="min-w-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="w-4 h-4 text-orange-500" />
                Top Suppliers
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topPerformers.topSuppliers && topPerformers.topSuppliers.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topPerformers.topSuppliers.map((s: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="font-bold text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium text-slate-900 dark:text-white text-sm">{s.supplierName}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {typeof s.totalPurchaseValue === "string" ? s.totalPurchaseValue : fmt(s.totalPurchaseValue, "currency")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center py-4 text-sm text-muted-foreground">No supplier data</p>
              )}
            </CardContent>
          </Card>

          {/* Top SRs */}
          <Card className="min-w-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Truck className="w-4 h-4 text-purple-500" />
                Top SRs
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topPerformers.topSRs && topPerformers.topSRs.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="text-right">Target</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topPerformers.topSRs.map((s: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="font-bold text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium text-slate-900 dark:text-white text-sm">{s.employeeName}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmt(s.targetAmount, "currency")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center py-4 text-sm text-muted-foreground">No SR data</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          9. PAYMENT MIX (DONUT) + RECEIVABLES AGING
          ═══════════════════════════════════════════════════════════ */}
      {!isSR && !isDealer && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="w-full overflow-hidden">
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg">
              <CardTitle className="text-base flex items-center gap-2 text-white">
                <CreditCard className="w-4 h-4 text-blue-300" />
                Sales by Payment Method
                {sectionErrors.payment && <Badge variant="destructive" className="text-xs ml-2">Error</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {paymentMix.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={paymentMix}
                      cx="50%"
                      cy="50%"
                      labelLine={true}
                      label={({ name, percent }: { name: string; percent: number }) => `${name} (${(percent * 100).toFixed(1)}%)`}
                      outerRadius={100}
                      innerRadius={50}
                      dataKey="value"
                    >
                      {paymentMix.map((_, index) => (
                        <Cell key={`pm-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                      formatter={(value: any, name: string) => [fmt(value, "currency"), name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[280px] text-muted-foreground">
                  No payment data available
                </div>
              )}
            </CardContent>
          </Card>

          {/* Receivables Aging Widget */}
          <Card>
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base flex items-center gap-2 text-white">
                  <Clock className="w-4 h-4 text-blue-300" />
                  Receivables Aging
                </CardTitle>
                {agingData.isMasked && (
                  <Badge className="bg-amber-500 text-black text-xs">VAT AUDIT MODE</Badge>
                )}
                {sectionErrors.aging && <Badge variant="destructive" className="text-xs ml-2">Error</Badge>}
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Total Outstanding</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {agingData.isMasked
                    ? "N/A (Audit Mode)"
                    : agingData.total > 0
                      ? fmt(agingData.total, "currency")
                      : "Tk. 0.00"}
                </p>
              </div>

              {agingData.isMasked ? (
                <div>
                  <div className="flex w-full h-8 rounded-lg overflow-hidden opacity-50">
                    <div className="bg-gray-300 dark:bg-gray-600 flex items-center justify-center" style={{ width: "25%" }}>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 font-bold">N/A</span>
                    </div>
                    <div className="bg-gray-300 dark:bg-gray-600 flex items-center justify-center" style={{ width: "25%" }}>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 font-bold">N/A</span>
                    </div>
                    <div className="bg-gray-300 dark:bg-gray-600 flex items-center justify-center" style={{ width: "25%" }}>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 font-bold">N/A</span>
                    </div>
                    <div className="bg-gray-300 dark:bg-gray-600 flex items-center justify-center" style={{ width: "25%" }}>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 font-bold">N/A</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                    {["Current (0-30d)", "31-60 Days", "61-90 Days", "90+ Days"].map(label => (
                      <div key={label} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm bg-gray-300 dark:bg-gray-600" />
                        <div>
                          <p className="text-[10px] text-muted-foreground">{label}</p>
                          <p className="text-xs font-bold text-gray-400">N/A (Audit Mode)</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : agingData.total > 0 ? (
                <div>
                  {/* Stacked horizontal bar */}
                  <div className="flex w-full h-8 rounded-lg overflow-hidden">
                    {agingData.current > 0 && (
                      <div
                        className="bg-green-500 flex items-center justify-center"
                        style={{ width: `${(agingData.current / agingData.total) * 100}%` }}
                      >
                        {((agingData.current / agingData.total) * 100) > 10 && (
                          <span className="text-[10px] text-white font-bold">{((agingData.current / agingData.total) * 100).toFixed(0)}%</span>
                        )}
                      </div>
                    )}
                    {agingData.d31to60 > 0 && (
                      <div
                        className="bg-yellow-500 flex items-center justify-center"
                        style={{ width: `${(agingData.d31to60 / agingData.total) * 100}%` }}
                      >
                        {((agingData.d31to60 / agingData.total) * 100) > 10 && (
                          <span className="text-[10px] text-black font-bold">{((agingData.d31to60 / agingData.total) * 100).toFixed(0)}%</span>
                        )}
                      </div>
                    )}
                    {agingData.d61to90 > 0 && (
                      <div
                        className="bg-orange-500 flex items-center justify-center"
                        style={{ width: `${(agingData.d61to90 / agingData.total) * 100}%` }}
                      >
                        {((agingData.d61to90 / agingData.total) * 100) > 10 && (
                          <span className="text-[10px] text-white font-bold">{((agingData.d61to90 / agingData.total) * 100).toFixed(0)}%</span>
                        )}
                      </div>
                    )}
                    {agingData.d90plus > 0 && (
                      <div
                        className="bg-red-500 flex items-center justify-center"
                        style={{ width: `${(agingData.d90plus / agingData.total) * 100}%` }}
                      >
                        {((agingData.d90plus / agingData.total) * 100) > 10 && (
                          <span className="text-[10px] text-white font-bold">{((agingData.d90plus / agingData.total) * 100).toFixed(0)}%</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Legend */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm bg-green-500" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Current (0-30d)</p>
                        <p className="text-xs font-bold text-slate-900 dark:text-white">{fmt(agingData.current, "currency")}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm bg-yellow-500" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">31-60 Days</p>
                        <p className="text-xs font-bold text-slate-900 dark:text-white">{fmt(agingData.d31to60, "currency")}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm bg-orange-500" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">61-90 Days</p>
                        <p className="text-xs font-bold text-slate-900 dark:text-white">{fmt(agingData.d61to90, "currency")}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm bg-red-500" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">90+ Days</p>
                        <p className="text-xs font-bold text-slate-900 dark:text-white">{fmt(agingData.d90plus, "currency")}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 text-muted-foreground text-sm">No outstanding receivables</div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          10a. TODAY'S INSTALLMENT PAYMENTS
          ═══════════════════════════════════════════════════════════ */}
      <Card className="shadow-sm hover:shadow-md transition-shadow border border-border">
        <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2 text-white">
              <Calendar className="w-4 h-4 text-green-300" />
              Today&apos;s Installment Payments
              {todaysInstallments.length > 0 && (
                <Badge className="bg-green-500 text-white text-xs">{todaysInstallments.length} due</Badge>
              )}
            </CardTitle>
            {todaysInstallments.length > 0 && (
              <Button variant="ghost" size="sm" className="text-white hover:text-white hover:bg-white/10" onClick={handlePrintInstallments}>
                <Printer className="w-4 h-4 mr-1" />Print
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {todaysInstallments.length > 0 ? (
            <div className="overflow-x-auto -mx-2 sm:mx-0">
              <Table className="min-w-[700px]">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-10">Sl</TableHead>
                    <TableHead>Invoice No</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Installment Amt</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {todaysInstallments.map((inst: any, i: number) => {
                    const customerName = inst.customer?.name || inst.customerName || '—';
                    const productName = inst.products?.[0]?.name || inst.productName || '—';
                    const balanceAmount = inst.balanceAmount ?? inst.defaultAmount ?? 0;
                    const dueDate = inst.nextPaymentDate;
                    return (
                      <TableRow key={inst.id || i} className="hover:bg-green-50/50 dark:hover:bg-green-900/10">
                        <TableCell className="font-bold text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-mono">{inst.invoiceNo || '—'}</TableCell>
                        <TableCell className="font-medium text-slate-900 dark:text-white">{customerName}</TableCell>
                        <TableCell>{productName}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(inst.installmentAmount, 'currency')}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(balanceAmount, 'currency')}</TableCell>
                        <TableCell>{dueDate ? fmtDate(dueDate) : '—'}</TableCell>
                        <TableCell>
                          <Badge variant={inst.currentStatus === 'Overdue' ? 'destructive' : inst.currentStatus === 'Active' ? 'default' : 'outline'} className="text-xs">
                            {inst.currentStatus || 'Due'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No installments due today</p>
              <p className="text-xs mt-1">All installment payments are up to date</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════════════════
          10b. RECENT INSTALLMENTS (all)
          ═══════════════════════════════════════════════════════════ */}
      <Card className="shadow-sm hover:shadow-md transition-shadow border border-border">
        <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg">
          <CardTitle className="text-base flex items-center gap-2 text-white">
            <Calendar className="w-4 h-4 text-blue-300" />
            Recent Installments
            {installments.length > 0 && <Badge className="bg-blue-500 text-white text-xs">{installments.length}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          {installments.length > 0 ? (
            <div className="overflow-x-auto -mx-2 sm:mx-0">
              <Table className="min-w-[800px]">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>#</TableHead>
                    <TableHead>Remind Date</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Sales Date</TableHead>
                    <TableHead>Payment Date</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Installment</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {installments.slice(0, 10).map((inst: any, i: number) => (
                    <InstallmentRow
                      key={inst.id || i}
                      inst={inst}
                      index={i}
                      fmtDate={fmtDate}
                      fmt={fmt}
                      apiFetch={apiFetch}
                      toast={toast}
                      onUpdated={refreshAll}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No recent installments</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* YoY Comparison Footer */}
      {!isSR && !isDealer && !isVatAuditor && kpiData.lastYearRevenue > 0 && (
        <Card className="bg-muted/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Info className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-medium text-muted-foreground">Year-over-Year Comparison</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">Revenue:</span>
                <span className="text-sm font-medium">This year: {fmt(kpiData.totalRevenue, "currency")}</span>
                <span className="text-sm text-muted-foreground">vs Last year: {fmt(kpiData.lastYearRevenue, "currency")}</span>
                <Badge variant={kpiData.totalRevenue >= kpiData.lastYearRevenue ? "default" : "destructive"} className="text-xs">
                  {kpiData.lastYearRevenue > 0 ? `${((kpiData.totalRevenue - kpiData.lastYearRevenue) / kpiData.lastYearRevenue * 100).toFixed(1)}%` : "N/A"}
                </Badge>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">Purchases:</span>
                <span className="text-sm font-medium">This year: {fmt(kpiData.totalPurchases, "currency")}</span>
                <span className="text-sm text-muted-foreground">vs Last year: {fmt(kpiData.lastYearPurchases, "currency")}</span>
                <Badge variant={kpiData.totalPurchases <= kpiData.lastYearPurchases ? "default" : "destructive"} className="text-xs">
                  {kpiData.lastYearPurchases > 0 ? `${((kpiData.totalPurchases - kpiData.lastYearPurchases) / kpiData.lastYearPurchases * 100).toFixed(1)}%` : "N/A"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
