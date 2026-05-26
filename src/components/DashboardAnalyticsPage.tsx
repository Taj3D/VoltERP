"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  LayoutDashboard, TrendingUp, TrendingDown, Package, Receipt, ShoppingCart,
  DollarSign, Banknote, AlertTriangle, ArrowUpCircle, ArrowDownCircle, RefreshCw,
  BarChart3, Users, Truck, Calendar, Send, Search, ArrowLeftRight, Plus, Clock,
  Activity, CreditCard, Landmark, Scale, Download, FileDown, Printer, Upload,
  UserCheck, Building2, BoxIcon, ShoppingBag, Coins, BarChart2, PieChart as PieChartIcon, Percent
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell
} from "recharts";

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

const fmt = (v: any, type?: string) => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string" && v === "N/A (Audit Mode)") return v;
  if (type === "currency") return `৳${Number(v).toLocaleString("en-BD", { minimumFractionDigits: 2 })}`;
  if (type === "date") return v ? new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  if (type === "percent") return `${Number(v).toFixed(2)}%`;
  return String(v);
};

const fmtDate = (d: string | Date) => d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json", ...opts?.headers }, ...opts });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

// ============================================================
// AUTH HOOK
// ============================================================

type UserRole = "admin" | "manager" | "sr" | "dealer" | "vat_auditor";

interface AuthUser {
  name: string;
  email: string;
  role: UserRole;
  displayName: string;
}

let authState = { isAuthenticated: false, user: null as AuthUser | null };
let authListeners: Array<() => void> = [];

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
        authState = parsed;
        authListeners.forEach(l => l());
      } catch { /* ignore parse errors */ }
    }
  }, []);
  return {
    ...authState,
    isVatAuditor: authState.user?.role === "vat_auditor",
    isSR: authState.user?.role === "sr",
    isDealer: authState.user?.role === "dealer",
    user: authState.user,
  };
}

// ============================================================
// CONSTANTS
// ============================================================

const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  manager: "Manager",
  sr: "SR",
  dealer: "Dealer",
  vat_auditor: "VAT Auditor",
};

const ROLE_COLORS: Record<UserRole, string> = {
  admin: "bg-blue-500 text-white",
  manager: "bg-green-500 text-white",
  sr: "bg-yellow-500 text-black",
  dealer: "bg-purple-500 text-white",
  vat_auditor: "bg-amber-500 text-black",
};

// ============================================================
// ANIMATED COUNTER HOOK
// ============================================================

function useAnimatedCounter(target: number, duration: number = 1200) {
  const [value, setValue] = useState(0);
  const ref = useRef(target);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    ref.current = target;
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
// KPI CARD COMPONENT
// ============================================================

function KpiCard({ label, value, icon: Icon, color, bg, change, isCurrency, formatType }: {
  label: string;
  value: any;
  icon: React.ElementType;
  color: string;
  bg: string;
  change?: number;
  isCurrency?: boolean;
  formatType?: "currency" | "number" | "percent";
}) {
  const numValue = typeof value === "number" ? value : 0;
  const animated = useAnimatedCounter(numValue);
  const displayValue = typeof value === "string" && value === "N/A (Audit Mode)"
    ? value
    : formatType === "percent"
      ? `${Number(value).toFixed(2)}%`
      : isCurrency
        ? `৳${animated.toLocaleString("en-BD", { minimumFractionDigits: 2 })}`
        : String(animated);

  return (
    <Card className="kpi-card dashboard-kpi-card transition-all hover:shadow-lg">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className={`p-2 rounded-lg ${bg} ${color}`}><Icon className="w-5 h-5" /></div>
          {change !== undefined && (
            <div className={`flex items-center text-xs font-medium ${change >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
              {change >= 0 ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
              {Math.abs(change).toFixed(1)}%
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold text-slate-900 dark:text-white stat-value">{displayValue}</p>
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
// EXPORT UTILITIES
// ============================================================

function exportStockAlertsCSV(data: any[]) {
  const headers = ["Product Code", "Product Name", "Category", "Current Stock", "Reorder Level", "Deficit", "Godown"];
  const rows = data.map(d => [d.productCode, d.productName, d.category, d.currentStock, d.reorderLevel, d.deficit, d.godown].map(v => `"${String(v ?? "")}"`).join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "stock-alerts.csv"; a.click();
  URL.revokeObjectURL(url);
}

function exportStockAlertsPDF(data: any[], kpiData?: Record<string, any>) {
  import("jspdf").then(jsPDF => {
    import("jspdf-autotable").then(() => {
      const doc = new jsPDF.default({ orientation: "landscape" });
      // Corporate header
      doc.setFontSize(18);
      doc.setTextColor(37, 99, 235);
      doc.text("Electronics Mart IMS", 14, 15);
      doc.setFontSize(12);
      doc.setTextColor(100, 100, 100);
      doc.text("Stock Alerts & KPI Summary Report", 14, 21);
      doc.setFontSize(9);
      doc.setTextColor(150, 150, 150);
      doc.text(`Generated: ${new Date().toLocaleDateString("en-GB")} ${new Date().toLocaleTimeString()}`, 14, 26);

      // KPI Summary
      if (kpiData) {
        doc.setFontSize(11);
        doc.setTextColor(37, 99, 235);
        doc.text("KPI Summary", 14, 33);
        const kpiBody = [
          ["Total Revenue", fmt(kpiData.totalRevenue, "currency")],
          ["Total Purchases", fmt(kpiData.totalPurchases, "currency")],
          ["Net Profit", typeof kpiData.netProfit === "string" ? kpiData.netProfit : fmt(kpiData.netProfit, "currency")],
          ["Today's Sales", fmt(kpiData.todaysSales, "currency")],
          ["Low Stock Alerts", String(kpiData.lowStockCount || 0)],
          ["Total Customers", String(kpiData.totalCustomers || 0)],
          ["Total Products", String(kpiData.totalProducts || 0)],
        ];
        (doc as any).autoTable({
          body: kpiBody,
          startY: 36,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [37, 99, 235] },
          columnStyles: { 0: { fontStyle: "bold", cellWidth: 50 }, 1: { cellWidth: 50 } },
          theme: "grid",
        });
      }

      // Stock Alerts table
      const startY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 8 : 36;
      doc.setFontSize(11);
      doc.setTextColor(37, 99, 235);
      doc.text("Stock Alerts", 14, startY);
      const headers = ["Product Code", "Product Name", "Category", "Current Stock", "Reorder Level", "Deficit", "Godown"];
      const body = data.map(d => [d.productCode, d.productName, d.category, d.currentStock, d.reorderLevel, d.deficit, d.godown]);
      (doc as any).autoTable({ head: [headers], body, startY: startY + 3, styles: { fontSize: 7 }, headStyles: { fillColor: [37, 99, 235] } });
      doc.save("stock-alerts-report.pdf");
    });
  });
}

function exportFinancialRatiosCSV(ratios: Record<string, any>) {
  const headers = ["Ratio", "Value"];
  const rows = Object.entries(ratios).filter(([k]) => k !== "type" && k !== "vatMode").map(([k, v]) => `"${k}","${String(v)}"` );
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "financial-ratios.csv"; a.click();
  URL.revokeObjectURL(url);
}

function exportFinancialRatiosPDF(ratios: Record<string, any>) {
  import("jspdf").then(jsPDF => {
    import("jspdf-autotable").then(() => {
      const doc = new jsPDF.default({ orientation: "portrait" });
      doc.setFontSize(16); doc.text("Electronics Mart - Financial Ratios", 14, 15);
      doc.setFontSize(9); doc.text(`Generated: ${new Date().toLocaleDateString("en-GB")}`, 14, 21);
      const headers = ["Ratio", "Value"];
      const body = Object.entries(ratios).filter(([k]) => k !== "type" && k !== "vatMode").map(([k, v]) => [k.replace(/([A-Z])/g, " $1").trim(), String(v)]);
      (doc as any).autoTable({ head: [headers], body, startY: 26, styles: { fontSize: 9 }, headStyles: { fillColor: [37, 99, 235] } });
      doc.save("financial-ratios.pdf");
    });
  });
}

function exportDashboardCSV(stockData: any[], ratios: Record<string, any>) {
  // Combine stock alerts and financial ratios into one CSV
  const stockHeaders = ["Product Code", "Product Name", "Category", "Current Stock", "Reorder Level", "Deficit", "Godown"];
  const stockRows = stockData.map(d => [d.productCode, d.productName, d.category, d.currentStock, d.reorderLevel, d.deficit, d.godown].map(v => `"${String(v ?? "")}"`).join(","));
  const ratioHeaders = ["Ratio", "Value"];
  const ratioRows = Object.entries(ratios).filter(([k]) => k !== "type" && k !== "vatMode").map(([k, v]) => `"${k}","${String(v)}"`);

  const csv = [
    "STOCK ALERTS",
    stockHeaders.join(","),
    ...stockRows,
    "",
    "FINANCIAL RATIOS",
    ratioHeaders.join(","),
    ...ratioRows,
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "dashboard-analytics.csv"; a.click();
  URL.revokeObjectURL(url);
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

  // FIX 3: Date Range Picker state
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
  const [loading, setLoading] = useState(true);

  // FIX 3: Helper to build date range query params
  const dateParams = useMemo(() => {
    let params = "";
    if (startDate) params += `&startDate=${startDate}`;
    if (endDate) params += `&endDate=${endDate}`;
    return params;
  }, [startDate, endDate]);

  // Fetch all data in parallel
  const fetchAllData = useCallback(async () => {
    setLoading(true);
    try {
      const vatParam = isVatAuditor ? "&vatMode=true" : "";
      const dp = dateParams;
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
      ] = await Promise.all([
        apiFetch(`/api/dashboard-analytics?type=kpi${vatParam}${dp}`).catch(() => ({})),
        apiFetch(`/api/dashboard-analytics?type=monthly-trend&months=12${vatParam}${dp}`).catch(() => ({ data: [] })),
        apiFetch(`/api/dashboard-analytics?type=category-turnover${vatParam}${dp}`).catch(() => ({ data: [] })),
        apiFetch(`/api/dashboard-analytics?type=stock-alerts${dp}`).catch(() => ({ data: [], alertCount: 0, criticalCount: 0 })),
        apiFetch(`/api/dashboard-analytics?type=financial-ratios${vatParam}${dp}`).catch(() => ({})),
        apiFetch(`/api/dashboard-analytics?type=top-performers&limit=5${vatParam}${dp}`).catch(() => ({ topProducts: [], topCustomers: [], topSRs: [] })),
        apiFetch(`/api/dashboard-analytics?type=payment-mix${vatParam}${dp}`).catch(() => ({ data: [] })),
        apiFetch(`/api/dashboard-analytics?type=receivables-aging${vatParam}${dp}`).catch(() => ({})),
        apiFetch("/api/dashboard").catch(() => ({})),
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
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [isVatAuditor, dateParams, toast]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const refreshAll = useCallback(async () => {
    await fetchAllData();
    toast({ title: "Refreshed", description: "Dashboard data updated" });
  }, [fetchAllData, toast]);

  // FIX 6: Import CSV for reorder level configuration
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
          // Find product by code, then update reorderLevel
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
      refreshAll();
    };
    input.click();
  }, [toast, refreshAll]);

  // ─── FIX 1: RBAC Filtered Data (now 20 KPIs) ─────────────────

  const visibleKpis = useMemo(() => {
    const all = [
      { label: "Total Revenue", value: kpiData.totalRevenue || 0, icon: TrendingUp, color: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-900/30", isCurrency: true, formatType: "currency" as const, change: undefined as number | undefined },
      { label: "Total Purchases", value: kpiData.totalPurchases || 0, icon: ShoppingCart, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-900/30", isCurrency: true, formatType: "currency" as const, change: undefined as number | undefined },
      { label: "Gross Profit", value: isVatAuditor ? "N/A (Audit Mode)" : (kpiData.grossProfit || 0), icon: DollarSign, color: "text-teal-600 dark:text-teal-400", bg: "bg-teal-50 dark:bg-teal-900/30", isCurrency: !isVatAuditor, formatType: "currency" as const, change: undefined as number | undefined },
      { label: "Net Profit", value: isVatAuditor ? "N/A (Audit Mode)" : (kpiData.netProfit || 0), icon: Banknote, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-900/30", isCurrency: !isVatAuditor, formatType: "currency" as const, change: undefined as number | undefined },
      { label: "Total Expenses", value: kpiData.totalExpenses || 0, icon: TrendingDown, color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-900/30", isCurrency: true, formatType: "currency" as const, change: undefined as number | undefined },
      { label: "Total Incomes", value: kpiData.totalIncomes || 0, icon: TrendingUp, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/30", isCurrency: true, formatType: "currency" as const, change: undefined as number | undefined },
      { label: "Bank Balance", value: kpiData.totalBankBalance || 0, icon: Landmark, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/30", isCurrency: true, formatType: "currency" as const, change: undefined as number | undefined },
      { label: "Total Receivables", value: kpiData.totalReceivables || 0, icon: ArrowUpCircle, color: "text-cyan-600 dark:text-cyan-400", bg: "bg-cyan-50 dark:bg-cyan-900/30", isCurrency: true, formatType: "currency" as const, change: undefined as number | undefined },
      { label: "Total Payables", value: kpiData.totalPayables || 0, icon: ArrowDownCircle, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-900/30", isCurrency: true, formatType: "currency" as const, change: undefined as number | undefined },
      { label: "Low Stock Alerts", value: kpiData.lowStockCount || 0, icon: AlertTriangle, color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-900/30", isCurrency: false, formatType: "number" as const, change: undefined as number | undefined },
      { label: "Today's Sales", value: kpiData.todaysSales || 0, icon: Receipt, color: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-900/30", isCurrency: true, formatType: "currency" as const, change: undefined as number | undefined },
      { label: "Today's Purchases", value: kpiData.todaysPurchases || 0, icon: ShoppingBag, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-900/30", isCurrency: true, formatType: "currency" as const, change: undefined as number | undefined },
      { label: "Total Customers", value: kpiData.totalCustomers || 0, icon: UserCheck, color: "text-cyan-600 dark:text-cyan-400", bg: "bg-cyan-50 dark:bg-cyan-900/30", isCurrency: false, formatType: "number" as const, change: undefined as number | undefined },
      { label: "Total Suppliers", value: kpiData.totalSuppliers || 0, icon: Building2, color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-50 dark:bg-indigo-900/30", isCurrency: false, formatType: "number" as const, change: undefined as number | undefined },
      { label: "Total Products", value: kpiData.totalProducts || 0, icon: BoxIcon, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/30", isCurrency: false, formatType: "number" as const, change: undefined as number | undefined },
      { label: "Today's Collections", value: kpiData.todaysCollections || 0, icon: Coins, color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-900/30", isCurrency: true, formatType: "currency" as const, change: undefined as number | undefined },
      { label: "Month-to-Date Sales", value: kpiData.monthToDateSales || 0, icon: BarChart2, color: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-900/30", isCurrency: true, formatType: "currency" as const, change: undefined as number | undefined },
      { label: "Month-to-Date Purchases", value: kpiData.monthToDatePurchases || 0, icon: ShoppingCart, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-900/30", isCurrency: true, formatType: "currency" as const, change: undefined as number | undefined },
      { label: "Asset Turnover Ratio", value: isVatAuditor ? "N/A (Audit Mode)" : (kpiData.assetTurnoverRatio || 0), icon: PieChartIcon, color: "text-teal-600 dark:text-teal-400", bg: "bg-teal-50 dark:bg-teal-900/30", isCurrency: false, formatType: "percent" as const, change: undefined as number | undefined },
      { label: "Return on Sales", value: isVatAuditor ? "N/A (Audit Mode)" : (kpiData.returnOnSales || 0), icon: Percent, color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-50 dark:bg-rose-900/30", isCurrency: false, formatType: "percent" as const, change: undefined as number | undefined },
    ];

    // FIX 5: SR should only see Customer Outstanding Balance (Total Receivables)
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
    // FIX 4: Handle VAT Auditor "N/A (Audit Mode)" string values
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
      <div className="page-enter flex items-center justify-center min-h-[70vh]">
        <div className="text-center space-y-4">
          <RefreshCw className="w-10 h-10 animate-spin mx-auto text-blue-500" />
          <p className="text-muted-foreground text-sm">Loading analytics dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-enter space-y-6">
      {/* FIX 2: Stock Alert Flash Animation CSS */}
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
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Welcome, {userName}</h2>
            <p className="text-muted-foreground text-sm">Here&apos;s your business overview</p>
          </div>
          {isVatAuditor && (
            <Badge className="bg-amber-500 text-black text-xs px-3 py-1">VAT AUDIT MODE</Badge>
          )}
          {auth.user && (
            <Badge className={`${ROLE_COLORS[auth.user.role]} text-xs`}>
              {ROLE_LABELS[auth.user.role]}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* FIX 3: Date Range Picker */}
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-[140px] h-8 text-xs"
              placeholder="Start Date"
            />
            <span className="text-muted-foreground text-xs">to</span>
            <Input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-[140px] h-8 text-xs"
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

      {/* VAT Auditor persistent banner */}
      {isVatAuditor && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <Badge className="bg-amber-500 text-black">VAT AUDIT MODE</Badge>
          <span className="text-sm text-amber-700 dark:text-amber-400">Cost prices, profit margins, and internal adjustments are masked. All financial ratios compute purely from legal invoice tax records.</span>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          2. KPI SUMMARY CARDS (FIX 1: 20 KPIs, 4-column grid)
          ═══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-3">
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
          />
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════
          3. CHARTS SECTION (2-column grid)
          FIX 5: SR should NOT see monthly trend or category turnover
          ═══════════════════════════════════════════════════════════ */}
      {!isSR && !isDealer && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Monthly Sales vs Purchases Trend - LineChart */}
          <Card>
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg">
              <CardTitle className="text-base flex items-center gap-2 text-white">
                <Activity className="w-4 h-4 text-blue-300" />
                Monthly Sales vs Purchases Trend
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
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
          <Card>
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg">
              <CardTitle className="text-base flex items-center gap-2 text-white">
                <BarChart3 className="w-4 h-4 text-blue-300" />
                Category Turnover
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
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
          4. FINANCIAL RATIOS PANEL
          FIX 5: SR should NOT see financial ratios
          ═══════════════════════════════════════════════════════════ */}
      {!isSR && !isDealer && (
        <Card>
          <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2 text-white">
                <Scale className="w-4 h-4 text-blue-300" />
                Financial Ratios
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="text-white hover:text-white hover:bg-white/10" onClick={() => exportFinancialRatiosCSV(financialRatios)}>
                  <Download className="w-4 h-4 mr-1" />CSV
                </Button>
                <Button variant="ghost" size="sm" className="text-white hover:text-white hover:bg-white/10" onClick={() => exportFinancialRatiosPDF(financialRatios)}>
                  <FileDown className="w-4 h-4 mr-1" />PDF
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <RatioIndicator
                label="Current Ratio"
                value={financialRatios.currentRatio}
                description="Current Assets / Current Liabilities"
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
                label="Working Capital"
                value={financialRatios.workingCapital}
                description="Current Assets - Current Liabilities"
                format="currency"
              />
              <RatioIndicator
                label="Quick Ratio"
                value={financialRatios.quickRatio}
                description="(Current Assets - Inventory) / Liabilities"
                format="ratio"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════════
          5. STOCK ALERTS SECTION
          FIX 2: Flash animation on alert rows
          FIX 5: SR should NOT see stock alerts (except their customers)
          FIX 6: Triple Utility Bundle
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
              </CardTitle>
              {/* FIX 6: Triple Utility Bundle */}
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="text-white hover:text-white hover:bg-white/10" onClick={importCSV}>
                  <Upload className="w-4 h-4 mr-1" />Import CSV
                </Button>
                <Button variant="ghost" size="sm" className="text-white hover:text-white hover:bg-white/10" onClick={() => exportDashboardCSV(stockAlerts.data, financialRatios)}>
                  <Download className="w-4 h-4 mr-1" />Export CSV
                </Button>
                <Button variant="ghost" size="sm" className="text-white hover:text-white hover:bg-white/10" onClick={() => exportStockAlertsPDF(stockAlerts.data, kpiData)}>
                  <FileDown className="w-4 h-4 mr-1" />Export PDF
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            {stockAlerts.data && stockAlerts.data.length > 0 ? (
              <div className="max-h-96 overflow-y-auto rounded-md border" style={{ scrollbarWidth: "thin", scrollbarColor: "#94a3b8 transparent" }}>
                <Table>
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
          6. TOP PERFORMERS SECTION (3-column grid)
          FIX 5: SR should NOT see top performers
          ═══════════════════════════════════════════════════════════ */}
      {!isSR && !isDealer && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Top Products */}
          <Card>
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
          <Card>
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

          {/* Top SRs */}
          <Card>
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
          7. PAYMENT MIX SECTION
          FIX 5: SR should NOT see payment mix chart
          ═══════════════════════════════════════════════════════════ */}
      {!isSR && !isDealer && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg">
              <CardTitle className="text-base flex items-center gap-2 text-white">
                <CreditCard className="w-4 h-4 text-blue-300" />
                Payment Mix
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

          {/* ═══════════════════════════════════════════════════════
              8. RECEIVABLES AGING WIDGET
              FIX 4: Show N/A (Audit Mode) masked values for VAT Auditor
              ═════════════════════════════════════════════════════ */}
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
                      : "৳0.00"}
                </p>
              </div>

              {agingData.isMasked ? (
                /* FIX 4: Show masked/grayed-out aging bar segments for VAT Auditor */
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
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm bg-gray-300 dark:bg-gray-600" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Current (0-30d)</p>
                        <p className="text-xs font-bold text-gray-400">N/A (Audit Mode)</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm bg-gray-300 dark:bg-gray-600" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">31-60 Days</p>
                        <p className="text-xs font-bold text-gray-400">N/A (Audit Mode)</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm bg-gray-300 dark:bg-gray-600" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">61-90 Days</p>
                        <p className="text-xs font-bold text-gray-400">N/A (Audit Mode)</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm bg-gray-300 dark:bg-gray-600" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">90+ Days</p>
                        <p className="text-xs font-bold text-gray-400">N/A (Audit Mode)</p>
                      </div>
                    </div>
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
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
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
                <div className="text-center py-4 text-muted-foreground">
                  <p className="text-sm">No outstanding receivables</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          8B. RECEIVABLES AGING FOR SR (standalone, since SR doesn't see payment mix)
          FIX 5: SR should see Receivables Aging section
          ═══════════════════════════════════════════════════════════ */}
      {isSR && (
        <Card>
          <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg">
            <CardTitle className="text-base flex items-center gap-2 text-white">
              <Clock className="w-4 h-4 text-blue-300" />
              Customer Outstanding Balance
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Total Outstanding</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {agingData.total > 0 ? fmt(agingData.total, "currency") : "৳0.00"}
              </p>
            </div>

            {agingData.total > 0 ? (
              <div>
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

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
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
              <div className="text-center py-4 text-muted-foreground">
                <p className="text-sm">No outstanding receivables</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════════
          9. QUICK ACTIONS BAR
          FIX 7: Wire buttons to onNavigate
          ═══════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <LayoutDashboard className="w-4 h-4 text-blue-500" />
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {[
            { label: "New Sale", icon: Receipt, roles: ["admin", "manager", "sr"], navigate: "sales-orders" },
            { label: "New Purchase", icon: ShoppingCart, roles: ["admin", "manager"], navigate: "purchase-orders" },
            { label: "New Customer", icon: Users, roles: ["admin", "manager", "sr"], navigate: "customers" },
            { label: "New Product", icon: Plus, roles: ["admin", "manager"], navigate: "products" },
            { label: "View Reports", icon: BarChart3, roles: ["admin", "manager", "vat_auditor"], navigate: "cash-in-hand" },
            { label: "Transfer Stock", icon: ArrowLeftRight, roles: ["admin", "manager"], navigate: "stock-transfers" },
            { label: "Record Expense", icon: DollarSign, roles: ["admin", "manager"], navigate: "expenses" },
          ]
            .filter(a => a.roles.includes(auth.user?.role || ""))
            .map((action, i) => (
              <Button
                key={i}
                variant="outline"
                size="sm"
                className="btn-hover-scale"
                onClick={() => onNavigate?.(action.navigate)}
              >
                <action.icon className="w-4 h-4 mr-1" />{action.label}
              </Button>
            ))}
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════════════════
          10. RECENT INSTALLMENTS TABLE
          FIX 5: SR should see installment table
          ═══════════════════════════════════════════════════════════ */}
      {!isDealer && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-500" />
                Recent Installments
              </CardTitle>
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="w-4 h-4 mr-1" />Print
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {installments.length > 0 ? (
              <div className="max-h-96 overflow-y-auto rounded-md border" style={{ scrollbarWidth: "thin", scrollbarColor: "#94a3b8 transparent" }}>
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
                      <TableHead>Address &amp; Contact</TableHead>
                      <TableHead>Product Name</TableHead>
                      <TableHead>Installment</TableHead>
                      <TableHead>Default Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {installments.slice(0, 10).map((inst: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell>{i + 1}</TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm" className="text-xs h-7">Update Remind Date</Button>
                        </TableCell>
                        <TableCell className="font-mono">{inst.invoiceNo || "—"}</TableCell>
                        <TableCell>{inst.salesDate ? fmtDate(inst.salesDate) : "—"}</TableCell>
                        <TableCell>{inst.paymentDate ? fmtDate(inst.paymentDate) : "—"}</TableCell>
                        <TableCell className="font-mono">{inst.customerCode || "—"}</TableCell>
                        <TableCell className="font-medium text-slate-900 dark:text-white">{inst.customerName || "—"}</TableCell>
                        <TableCell>{inst.customerAddress || "—"}</TableCell>
                        <TableCell>{inst.productName || "Not available"}</TableCell>
                        <TableCell className="font-mono">{fmt(inst.installmentAmount, "currency")}</TableCell>
                        <TableCell className="font-mono">{fmt(inst.defaultAmount || 0, "currency")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No installments due today</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
