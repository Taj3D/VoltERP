"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Lock, Search, RefreshCw, Download, FileDown, Upload, BarChart3, Filter,
  ArrowUpDown, ChevronDown, ChevronUp, ChevronRight, Calendar, TrendingUp,
  PieChart as PieChartIcon, FileSpreadsheet, Eye
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { exportToPDFSimple, exportToCSVSimple, importFromCSV } from "@/lib/export-utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";

// ============================================================
// CONSTANTS
// ============================================================

const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

type ReportCategoryKey =
  | "basic"
  | "purchase"
  | "sales"
  | "hire-sales"
  | "sr"
  | "customer-wise"
  | "management"
  | "bank"
  | "advance-search";

interface SubReport {
  value: string;
  label: string;
}

interface ReportCategory {
  apiType: string;
  subtypes: SubReport[];
}

const REPORT_CATEGORIES: Record<ReportCategoryKey, ReportCategory> = {
  basic: {
    apiType: "basic",
    subtypes: [
      { value: "employee-information", label: "Employee Information" },
      { value: "product-information", label: "Product Information" },
      { value: "stock-details", label: "Stock Details Report" },
      { value: "stock-summary", label: "Stock Summary Report" },
      { value: "stock-ledger", label: "Stock Ledger" },
      { value: "stock-qty", label: "Stock Quantity Report" },
      { value: "stock-forecast-product", label: "Stock Forecasting (Product Wise)" },
      { value: "stock-forecast-concern", label: "Stock Forecasting (Concern Wise)" },
      { value: "stock-trends", label: "Stock Trend Analysis" },
      { value: "supplier-status", label: "Supplier Status Grid" },
      { value: "sales-performance", label: "Sales Performance Indicators" },
      { value: "employee-records", label: "Enhanced Employee Records" },
    ],
  },
  purchase: {
    apiType: "purchase",
    subtypes: [
      { value: "supplier-ledger", label: "Supplier Ledger" },
      { value: "daily-purchase", label: "Daily Purchase Report" },
      { value: "supplier-wise-purchase", label: "Suppliers Wise Purchase" },
      { value: "supplier-cash-delivery", label: "Supplier Cash Delivery" },
      { value: "supplier-due", label: "Suppliers Due Report" },
      { value: "model-wise-purchase", label: "Model Wise Purchase" },
      { value: "vat-report", label: "VAT Report" },
    ],
  },
  sales: {
    apiType: "sales",
    subtypes: [
      { value: "daily-sales", label: "Daily Sales Report" },
      { value: "replacement-report", label: "Replacement Report" },
      { value: "model-wise-sales", label: "Model Wise Sales" },
    ],
  },
  "hire-sales": {
    apiType: "hire-sales",
    subtypes: [
      { value: "installment-collection", label: "Installment Collection" },
      { value: "upcoming-installment", label: "Upcoming Installment" },
      { value: "defaulting-customer", label: "Defaulting Customer" },
      { value: "default-customer-summary", label: "Default Customer Summary" },
      { value: "hire-account-details", label: "Hire Account Details" },
    ],
  },
  sr: {
    apiType: "sr",
    subtypes: [
      { value: "sr-wise-sales", label: "SR Wise Sales Report" },
      { value: "sr-wise-sales-details", label: "SR Wise Sales Details" },
      { value: "sr-wise-customer-due", label: "SR Wise Customer Due" },
      { value: "sr-wise-customer-summary", label: "SR Wise Customer Summary" },
      { value: "sr-visit-report", label: "SR Visit Report" },
      { value: "sr-wise-customer-status", label: "SR Wise Customer Status" },
      { value: "sr-wise-cash-collection", label: "SR Wise Cash Collection" },
      { value: "sr-commission-report", label: "SR Commission Report" },
    ],
  },
  "customer-wise": {
    apiType: "customer-wise",
    subtypes: [
      { value: "customer-wise-sales", label: "Customer Wise Sales" },
      { value: "category-wise-customer-due", label: "Category Wise Customer Due" },
      { value: "customer-ledger", label: "Customer Ledger" },
      { value: "customer-due-report", label: "Customer Due Report" },
      { value: "customer-cash-collection", label: "Customer Cash Collection" },
      { value: "customer-ledger-summary", label: "Customer Ledger Summary" },
    ],
  },
  management: {
    apiType: "management",
    subtypes: [
      { value: "expense-report", label: "Expense Report" },
      { value: "product-wise-benefit", label: "Product Wise Benefit Report" },
      { value: "income-report", label: "Income Report" },
      { value: "adjustment-report", label: "Adjustment Report" },
      { value: "transaction-summary", label: "Transaction Summary Report" },
      { value: "monthly-transaction", label: "Monthly Transaction Report" },
      { value: "showroom-analysis", label: "Showroom Analysis Report" },
    ],
  },
  bank: {
    apiType: "bank",
    subtypes: [
      { value: "bank-transaction-report", label: "Bank Transaction Report" },
      { value: "bank-ledger-report", label: "Bank Ledger" },
      { value: "transfer-report", label: "Transfer Report" },
    ],
  },
  "advance-search": {
    apiType: "advance-search",
    subtypes: [
      { value: "advance-search", label: "Advance Search" },
    ],
  },
};

// Map sidebar report keys to (category, subtype) pairs
const SIDEBAR_REPORT_MAP: Record<string, { category: ReportCategoryKey; subtype: string }> = {
  // Basic Report
  "employee-information-report": { category: "basic", subtype: "employee-information" },
  "product-information-report": { category: "basic", subtype: "product-information" },
  "stock-details-report": { category: "basic", subtype: "stock-details" },
  "stock-summary-report": { category: "basic", subtype: "stock-summary" },
  "stock-ledger-report": { category: "basic", subtype: "stock-ledger" },
  "stock-qty-report": { category: "basic", subtype: "stock-qty" },
  "stock-forecast-product": { category: "basic", subtype: "stock-forecast-product" },
  "stock-forecast-concern": { category: "basic", subtype: "stock-forecast-concern" },
  "stock-trends-report": { category: "basic", subtype: "stock-trends" },
  "supplier-status-report": { category: "basic", subtype: "supplier-status" },
  "sales-performance-report": { category: "basic", subtype: "sales-performance" },
  "employee-records-report": { category: "basic", subtype: "employee-records" },
  // Purchase Report
  "supplier-ledger-report": { category: "purchase", subtype: "supplier-ledger" },
  "daily-purchase-report": { category: "purchase", subtype: "daily-purchase" },
  "supplier-wise-purchase": { category: "purchase", subtype: "supplier-wise-purchase" },
  "supplier-cash-delivery-report": { category: "purchase", subtype: "supplier-cash-delivery" },
  "supplier-due-report": { category: "purchase", subtype: "supplier-due" },
  "model-wise-purchase": { category: "purchase", subtype: "model-wise-purchase" },
  "vat-report": { category: "purchase", subtype: "vat-report" },
  // Sales Report
  "daily-sales-report": { category: "sales", subtype: "daily-sales" },
  "replacement-report": { category: "sales", subtype: "replacement-report" },
  "model-wise-sales": { category: "sales", subtype: "model-wise-sales" },
  // Hire Sales Report
  "installment-collection": { category: "hire-sales", subtype: "installment-collection" },
  "upcoming-installment": { category: "hire-sales", subtype: "upcoming-installment" },
  "defaulting-customer": { category: "hire-sales", subtype: "defaulting-customer" },
  "default-customer-summary": { category: "hire-sales", subtype: "default-customer-summary" },
  "hire-account-details": { category: "hire-sales", subtype: "hire-account-details" },
  // SR Report
  "sr-wise-sales-report": { category: "sr", subtype: "sr-wise-sales" },
  "sr-wise-sales-details": { category: "sr", subtype: "sr-wise-sales-details" },
  "sr-wise-customer-due": { category: "sr", subtype: "sr-wise-customer-due" },
  "sr-wise-customer-summary": { category: "sr", subtype: "sr-wise-customer-summary" },
  "sr-visit-report": { category: "sr", subtype: "sr-visit-report" },
  "sr-wise-customer-status": { category: "sr", subtype: "sr-wise-customer-status" },
  "sr-wise-cash-collection": { category: "sr", subtype: "sr-wise-cash-collection" },
  "sr-commission-report": { category: "sr", subtype: "sr-commission-report" },
  // Customer Wise Report
  "customer-wise-sales": { category: "customer-wise", subtype: "customer-wise-sales" },
  "category-wise-customer-due": { category: "customer-wise", subtype: "category-wise-customer-due" },
  "customer-ledger-report": { category: "customer-wise", subtype: "customer-ledger" },
  "customer-due-report": { category: "customer-wise", subtype: "customer-due-report" },
  "customer-cash-collection": { category: "customer-wise", subtype: "customer-cash-collection" },
  "customer-ledger-summary": { category: "customer-wise", subtype: "customer-ledger-summary" },
  // Management Report
  "expense-report": { category: "management", subtype: "expense-report" },
  "product-wise-benefit": { category: "management", subtype: "product-wise-benefit" },
  "income-report": { category: "management", subtype: "income-report" },
  "adjustment-report": { category: "management", subtype: "adjustment-report" },
  "transaction-summary": { category: "management", subtype: "transaction-summary" },
  "monthly-transaction": { category: "management", subtype: "monthly-transaction" },
  "showroom-analysis": { category: "management", subtype: "showroom-analysis" },
  // Bank Report
  "bank-transaction-report": { category: "bank", subtype: "bank-transaction-report" },
  "bank-ledger-report": { category: "bank", subtype: "bank-ledger-report" },
  "transfer-report": { category: "bank", subtype: "transfer-report" },
  // Advance Search
  "advance-search": { category: "advance-search", subtype: "advance-search" },
};

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
      } catch {
        /* ignore */
      }
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
// UTILITY FUNCTIONS
// ============================================================

const misCurrencyFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmt = (v: unknown, type?: string) => {
  if (v === null || v === undefined) return "—";
  if (type === "currency")
    return `৳${misCurrencyFmt.format(Number(v))}`;
  if (type === "date")
    return v
      ? new Date(v as string).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "—";
  if (type === "percent") return `${Number(v).toFixed(2)}%`;
  return String(v);
};

const detectColumnType = (key: string): string => {
  const lk = key.toLowerCase();
  if (
    lk.includes("amount") ||
    lk.includes("price") ||
    lk.includes("cost") ||
    lk.includes("total") ||
    lk.includes("due") ||
    lk.includes("balance") ||
    lk.includes("paid") ||
    lk.includes("vat") ||
    lk.includes("discount") ||
    lk.includes("installment") ||
    lk.includes("commission") ||
    lk.includes("expense") ||
    lk.includes("income") ||
    lk.includes("revenue") ||
    lk.includes("value") ||
    lk.includes("grandtotal") ||
    lk.includes("subtotal") ||
    lk.includes("margin") ||
    lk.includes("profit")
  )
    return "currency";
  if (
    lk.includes("date") ||
    lk.includes("createdat") ||
    lk.includes("updatedat")
  )
    return "date";
  if (
    lk.includes("percent") ||
    lk.includes("rate") ||
    lk.includes("ratio") ||
    lk.includes("growth")
  )
    return "percent";
  return "text";
};

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
// COMPONENT
// ============================================================

interface MISReportEngineProps {
  initialReport?: string;
}

export default function MISReportEngine({ initialReport }: MISReportEngineProps = {}) {
  const { toast } = useToast();
  const { isVatAuditor, isSR, isDealer, user } = useAuth();

  // --- Resolve initial tab and subtype from sidebar key ---
  const resolved = initialReport ? SIDEBAR_REPORT_MAP[initialReport] : null;

  // --- Active tab ---
  const [activeTab, setActiveTab] = useState<ReportCategoryKey>(resolved ? resolved.category : "basic");

  // --- Filter state ---
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const [fromDate, setFromDate] = useState(
    monthStart.toISOString().split("T")[0]
  );
  const [toDate, setToDate] = useState(today.toISOString().split("T")[0]);
  const [subtype, setSubtype] = useState(resolved ? resolved.subtype : "");
  const [entityFilter, setEntityFilter] = useState("");
  const [keyword, setKeyword] = useState("");
  const [groupBy, setGroupBy] = useState("");
  const [sortField, setSortField] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [filtersOpen, setFiltersOpen] = useState(true);

  // --- Report data ---
  const [reportData, setReportData] = useState<{
    title: string;
    columns: { key: string; label: string }[];
    rows: Record<string, unknown>[];
    summary: Record<string, unknown>;
    chartData?: { name: string; value: number; [k: string]: unknown }[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [tableSortField, setTableSortField] = useState("");
  const [tableSortOrder, setTableSortOrder] = useState<"asc" | "desc">("asc");

  // --- Entity options for filters ---
  const [entityOptions, setEntityOptions] = useState<
    { id: string; name: string }[]
  >([]);

  // --- Derived: current category config ---
  const currentCategory = REPORT_CATEGORIES[activeTab];

  // --- Sync activeTab and subtype when initialReport prop changes (sidebar navigation) ---
  useEffect(() => {
    if (!initialReport) return;
    const mapped = SIDEBAR_REPORT_MAP[initialReport];
    if (mapped) {
      if (mapped.category !== activeTab) setActiveTab(mapped.category);
      setSubtype(mapped.subtype);
    }
  }, [initialReport]);

  // --- Set default subtype when tab changes ---
  useEffect(() => {
    const subs = REPORT_CATEGORIES[activeTab].subtypes;
    setSubtype(subs.length > 0 ? subs[0].value : "");
    setEntityFilter("");
    setKeyword("");
    setGroupBy("");
    setSortField("");
    setReportData(null);
    setTableSortField("");
  }, [activeTab]);

  // --- Load entity options based on category ---
  useEffect(() => {
    const loadEntities = async () => {
      let apiPath = "";
      const cat = activeTab;
      if (cat === "basic") apiPath = "/api/categories";
      else if (cat === "purchase") apiPath = "/api/suppliers";
      else if (cat === "sales" || cat === "hire-sales" || cat === "customer-wise")
        apiPath = "/api/customers";
      else if (cat === "sr") apiPath = "/api/employees";
      else if (cat === "bank") apiPath = "/api/banks";
      else {
        setEntityOptions([]);
        return;
      }
      try {
        const res = await apiFetch(apiPath);
        const list = Array.isArray(res) ? res : res.data || [];
        setEntityOptions(
          list.map((e: Record<string, unknown>) => ({
            id: String(e.id),
            name: String(e.name || e.bankName || e.customerName || e.supplierName || e.employeeName || e.id),
          }))
        );
      } catch {
        setEntityOptions([]);
      }
    };
    loadEntities();
  }, [activeTab]);

  // --- Entity filter label based on category ---
  const entityFilterLabel = useMemo(() => {
    switch (activeTab) {
      case "basic":
        return "Category / Company / Godown";
      case "purchase":
        return "Supplier";
      case "sales":
      case "hire-sales":
      case "customer-wise":
        return "Customer";
      case "sr":
        return "Employee";
      case "bank":
        return "Bank";
      default:
        return "Entity";
    }
  }, [activeTab]);

  // --- Dynamic group-by options from report columns ---
  const groupByOptions = useMemo(() => {
    if (!reportData?.columns) return [];
    return reportData.columns.filter((col) => {
      const t = detectColumnType(col.key);
      return t === "text";
    });
  }, [reportData]);

  // --- Sorted rows for display ---
  const sortedRows = useMemo(() => {
    if (!reportData?.rows) return [];
    const rows = [...reportData.rows];
    const sf = tableSortField || sortField;
    if (!sf) return rows;
    const colType = detectColumnType(sf);
    rows.sort((a, b) => {
      const va = a[sf];
      const vb = b[sf];
      let cmp = 0;
      if (colType === "currency" || colType === "percent") {
        cmp = (Number(va) || 0) - (Number(vb) || 0);
      } else if (colType === "date") {
        cmp =
          (va ? new Date(va as string).getTime() : 0) -
          (vb ? new Date(vb as string).getTime() : 0);
      } else {
        cmp = String(va || "").localeCompare(String(vb || ""));
      }
      return tableSortOrder === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [reportData, tableSortField, sortField, tableSortOrder]);

  // --- Summary stat cards ---
  const statCards = useMemo(() => {
    if (!reportData?.summary) return [];
    const cards: { label: string; value: string; icon: typeof TrendingUp; color: string; bg: string }[] = [];
    const entries = Object.entries(reportData.summary);
    entries.slice(0, 4).forEach(([key, val]) => {
      const lk = key.toLowerCase();
      const isAmount =
        lk.includes("amount") ||
        lk.includes("total") ||
        lk.includes("value") ||
        lk.includes("due") ||
        lk.includes("balance") ||
        lk.includes("cost") ||
        lk.includes("revenue");
      const displayVal = isVatAuditor && isAmount
        ? "N/A (Audit Mode)"
        : isAmount
          ? fmt(val, "currency")
          : lk.includes("percent") || lk.includes("rate")
            ? fmt(val, "percent")
            : String(val);
      cards.push({
        label: key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()),
        value: displayVal,
        icon: isAmount ? TrendingUp : BarChart3,
        color: isAmount
          ? "text-emerald-600"
          : "text-blue-600",
        bg: isAmount
          ? "bg-emerald-50 dark:bg-emerald-900/30"
          : "bg-blue-50 dark:bg-blue-900/30",
      });
    });
    return cards;
  }, [reportData, isVatAuditor]);

  // --- Grand total row ---
  const grandTotalRow = useMemo(() => {
    if (!reportData?.summary || !reportData?.columns) return null;
    const totalEntries = Object.entries(reportData.summary).filter(([k]) =>
      /total|amount|due|balance|cost|revenue|value/i.test(k)
    );
    if (totalEntries.length === 0) return null;
    const row: Record<string, unknown> = {};
    reportData.columns.forEach((col) => {
      const match = totalEntries.find(([k]) =>
        col.key.toLowerCase().includes(k.toLowerCase()) ||
        k.toLowerCase().includes(col.key.toLowerCase())
      );
      if (match) {
        row[col.key] = isVatAuditor ? "N/A (Audit Mode)" : fmt(match[1], "currency");
      }
    });
    return row;
  }, [reportData, isVatAuditor]);

  // ============================================================
  // GENERATE REPORT
  // ============================================================

  const generateReport = useCallback(async () => {
    if (!subtype) {
      toast({
        title: "Validation",
        description: "Please select a sub-report type",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    setReportData(null);
    try {
      const apiType = currentCategory.apiType;
      let url = `/api/mis-reports?type=${apiType}&subtype=${subtype}&from=${fromDate}&to=${toDate}`;
      if (entityFilter && activeTab !== "advance-search" && activeTab !== "management")
        url += `&entityId=${entityFilter}`;
      if (keyword && activeTab === "advance-search")
        url += `&keyword=${encodeURIComponent(keyword)}`;
      if (sortField) url += `&sortField=${sortField}&sortOrder=${sortOrder}`;
      if (groupBy) url += `&groupBy=${groupBy}`;
      if (isVatAuditor) url += `&vatMode=true`;

      const data = await apiFetch(url);
      setReportData(data);
      setTableSortField("");
      setTableSortOrder("asc");
      toast({
        title: "Report Generated",
        description: data.title || "Report loaded successfully",
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to generate report";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [subtype, currentCategory, fromDate, toDate, entityFilter, keyword, sortField, sortOrder, groupBy, isVatAuditor, activeTab, toast]);

  // ============================================================
  // TRIPLE UTILITY BUNDLE
  // ============================================================

  const exportCSV = useCallback(() => {
    if (!reportData) {
      toast({ title: "No Data", description: "Generate a report first", variant: "destructive" });
      return;
    }
    try {
      const headers = reportData.columns.map((c) => c.label);
      const rows = sortedRows.map((row) =>
        reportData.columns.map((col) => {
          const val = row[col.key];
          const ct = detectColumnType(col.key);
          if (isVatAuditor && ct === "currency") return "N/A (Audit Mode)";
          if (ct === "currency") return fmt(val, "currency");
          if (ct === "date") return fmt(val, "date");
          return String(val ?? "");
        })
      );
      exportToCSVSimple(reportData.title || "MIS Report", headers, rows);
      toast({ title: "Exported", description: "CSV exported successfully" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }, [reportData, sortedRows, isVatAuditor, toast]);

  const exportPDF = useCallback(() => {
    if (!reportData) {
      toast({ title: "No Data", description: "Generate a report first", variant: "destructive" });
      return;
    }
    try {
      const headers = reportData.columns.map((c) => c.label);
      const body = sortedRows.map((row) =>
        reportData.columns.map((col) => {
          const val = row[col.key];
          const ct = detectColumnType(col.key);
          if (isVatAuditor && ct === "currency") return "N/A";
          if (ct === "currency") return fmt(val, "currency");
          if (ct === "date") return fmt(val, "date");
          return String(val ?? "");
        })
      );
      const subtitle = `Period: ${fmt(fromDate, "date")} - ${fmt(toDate, "date")}${isVatAuditor ? " | VAT AUDIT MODE" : ""}`;
      const printedBy = user?.displayName || user?.name || "System";
      exportToPDFSimple(reportData.title || "MIS Report", headers, body, "landscape", subtitle, undefined, {
        preparedBy: printedBy,
        checkedBy: "",
        authorizedBy: "",
        printedBy,
      });
      toast({ title: "Exported", description: "PDF exported successfully" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }, [reportData, sortedRows, isVatAuditor, fromDate, toDate, user, toast]);

  const importCSV = useCallback(() => {
    if (!reportData) {
      toast({ title: "No Data", description: "Generate a report first", variant: "destructive" });
      return;
    }
    // MIS Report import is for validation/review only — not data insertion
    const formFields = reportData.columns.map((col) => ({
      key: col.key,
      label: col.label,
      type: (detectColumnType(col.key) === "currency" ? "number" : detectColumnType(col.key) === "date" ? "date" : "text") as "text" | "number" | "date",
    }));
    importFromCSV({
      apiPath: "/api/mis-reports",
      formFields,
    }).then(result => {
      toast({
        title: "Import CSV",
        description: `File validated: ${result.imported} rows parsed, ${result.failed} failed`,
        variant: result.failed > 0 ? "destructive" : "default",
      });
    });
  }, [reportData, toast]);

  // ============================================================
  // TABLE COLUMN CLICK SORT
  // ============================================================

  const handleColumnSort = useCallback((colKey: string) => {
    if (tableSortField === colKey) {
      setTableSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setTableSortField(colKey);
      setTableSortOrder("asc");
    }
  }, [tableSortField]);

  // ============================================================
  // RBAC: SR and Dealer → 403 Forbidden
  // ============================================================

  if (isSR || isDealer) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full border-red-300 dark:border-red-800">
          <CardContent className="p-8 text-center">
            <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <Lock className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-2">
              403 - Access Denied
            </h3>
            <p className="text-muted-foreground mb-4">
              {isSR
                ? "Sales Representatives do not have access to MIS Reports. Please contact your administrator for assistance."
                : "Dealers do not have access to MIS Reports. This module is restricted to Admin, Manager, and VAT Auditor roles."}
            </p>
            <Badge variant="outline" className="text-red-500 border-red-300">
              {isSR ? "SR Role" : "Dealer Role"} — No MIS Access
            </Badge>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ============================================================
  // MAIN RENDER
  // ============================================================

  return (
    <div className="space-y-4">
      {/* ============ HEADER ============ */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[#132240] dark:bg-[#0a1628]">
            <BarChart3 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
              MIS Report Engine
            </h2>
            <p className="text-sm text-muted-foreground">
              Comprehensive business intelligence & analytics
            </p>
          </div>
          {isVatAuditor && (
            <Badge className="bg-amber-500 text-white hover:bg-amber-600 ml-2">
              VAT AUDIT MODE
            </Badge>
          )}
        </div>

        {/* Triple Utility Bundle */}
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={importCSV}>
            <Upload className="w-4 h-4 mr-1" /> Import CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="w-4 h-4 mr-1" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportPDF}>
            <FileDown className="w-4 h-4 mr-1" /> Export PDF
          </Button>
        </div>
      </div>

      {/* ============ VAT AUDITOR MODE BANNER ============ */}
      {isVatAuditor && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <Badge className="bg-amber-500 text-white">VAT AUDIT MODE</Badge>
          <span className="text-sm text-amber-700 dark:text-amber-400">
            Cost prices, profit margins, and internal adjustments are masked. Data maps to legal outward/inward invoicing sets only.
          </span>
        </div>
      )}

      {/* ============ REPORT CATEGORY TABS ============ */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as ReportCategoryKey)}
      >
        <TabsList className="flex overflow-x-auto scrollbar-none h-auto gap-1 bg-muted/50 p-1">
          {(
            [
              ["basic", "Basic Report"],
              ["purchase", "Purchase Report"],
              ["sales", "Sales Report"],
              ["hire-sales", "Hire Sales Report"],
              ["sr", "SR Report"],
              ["customer-wise", "Customer Wise"],
              ["management", "Management Report"],
              ["bank", "Bank Report"],
              ["advance-search", "Advance Search"],
            ] as [ReportCategoryKey, string][]
          ).map(([key, label]) => (
            <TabsTrigger
              key={key}
              value={key}
              className="text-xs sm:text-sm data-[state=active]:bg-[#2563eb] data-[state=active]:text-white"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* All tabs share same content layout */}
        {(
          [
            "basic",
            "purchase",
            "sales",
            "hire-sales",
            "sr",
            "customer-wise",
            "management",
            "bank",
            "advance-search",
          ] as ReportCategoryKey[]
        ).map((tabKey) => (
          <TabsContent key={tabKey} value={tabKey}>
            {/* ============ DYNAMIC FILTER PANEL ============ */}
            <Card className="mb-4">
              <CardHeader
                className="cursor-pointer select-none py-3 px-4"
                onClick={() => setFiltersOpen(!filtersOpen)}
              >
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium flex items-center gap-2 text-slate-900 dark:text-white">
                    <Filter className="w-4 h-4 text-[#2563eb]" />
                    Report Filters
                  </CardTitle>
                  {filtersOpen ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
              </CardHeader>

              {filtersOpen && (
                <CardContent className="pt-0 px-4 pb-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* From Date */}
                    <div className="space-y-1.5">
                      <Label className="text-xs flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> From Date
                      </Label>
                      <Input
                        type="date"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                      />
                    </div>

                    {/* To Date */}
                    <div className="space-y-1.5">
                      <Label className="text-xs flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> To Date
                      </Label>
                      <Input
                        type="date"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                      />
                    </div>

                    {/* Sub-Report Select */}
                    <div className="space-y-1.5">
                      <Label className="text-xs">Sub-Report</Label>
                      <Select value={subtype} onValueChange={setSubtype}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select sub-report" />
                        </SelectTrigger>
                        <SelectContent>
                          {REPORT_CATEGORIES[tabKey].subtypes.map((st) => (
                            <SelectItem key={st.value} value={st.value}>
                              {st.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Entity Filter or Keyword */}
                    {tabKey === "advance-search" ? (
                      <div className="space-y-1.5">
                        <Label className="text-xs flex items-center gap-1">
                          <Search className="w-3 h-3" /> Keyword
                        </Label>
                        <Input
                          placeholder="Search keyword..."
                          value={keyword}
                          onChange={(e) => setKeyword(e.target.value)}
                        />
                      </div>
                    ) : tabKey === "management" ? null : (
                      <div className="space-y-1.5">
                        <Label className="text-xs">{entityFilterLabel}</Label>
                        <Select
                          value={entityFilter}
                          onValueChange={setEntityFilter}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={`All ${entityFilterLabel}s`} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">
                              All {entityFilterLabel}s
                            </SelectItem>
                            {entityOptions.map((opt) => (
                              <SelectItem key={opt.id} value={opt.id}>
                                {opt.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Group By */}
                    <div className="space-y-1.5">
                      <Label className="text-xs">Group By</Label>
                      <Select value={groupBy} onValueChange={setGroupBy}>
                        <SelectTrigger>
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {groupByOptions.map((col) => (
                            <SelectItem key={col.key} value={col.key}>
                              {col.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Sort By */}
                    <div className="space-y-1.5">
                      <Label className="text-xs">Sort By</Label>
                      <Select value={sortField} onValueChange={setSortField}>
                        <SelectTrigger>
                          <SelectValue placeholder="Default" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">Default</SelectItem>
                          {reportData?.columns.map((col) => (
                            <SelectItem key={col.key} value={col.key}>
                              {col.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Sort Order Toggle */}
                    <div className="space-y-1.5">
                      <Label className="text-xs">Sort Order</Label>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() =>
                          setSortOrder((p) => (p === "asc" ? "desc" : "asc"))
                        }
                      >
                        <ArrowUpDown className="w-3 h-3 mr-1" />
                        {sortOrder === "asc" ? "Ascending" : "Descending"}
                        {sortOrder === "asc" ? (
                          <ChevronUp className="w-3 h-3 ml-auto" />
                        ) : (
                          <ChevronDown className="w-3 h-3 ml-auto" />
                        )}
                      </Button>
                    </div>

                    {/* Generate Report Button */}
                    <div className="space-y-1.5 flex items-end">
                      <Button
                        className="w-full bg-[#2563eb] hover:bg-[#1d4ed8]"
                        onClick={generateReport}
                        disabled={loading}
                      >
                        {loading ? (
                          <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                        ) : (
                          <Search className="w-4 h-4 mr-1" />
                        )}
                        Generate Report
                      </Button>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* ============ LOADING STATE ============ */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="w-8 h-8 animate-spin text-[#2563eb]" />
          <span className="ml-3 text-muted-foreground">
            Generating report...
          </span>
        </div>
      )}

      {/* ============ REPORT RESULTS ============ */}
      {reportData && !loading && (
        <div className="space-y-4">
          {/* ---- Summary Stat Cards ---- */}
          {statCards.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3">
              {statCards.map((stat, i) => (
                <Card key={i} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div
                      className={`p-2 rounded-lg ${stat.bg} ${stat.color}`}
                    >
                      <stat.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {stat.label}
                      </p>
                      <p className="text-lg font-bold text-slate-900 dark:text-white">
                        {stat.value}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* ---- Chart Panel ---- */}
          {reportData.chartData && reportData.chartData.length > 0 && (
            <Card>
              <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg">
                <CardTitle className="text-white flex items-center gap-2">
                  {reportData.chartData[0] &&
                  "value" in reportData.chartData[0] &&
                  !("amount" in reportData.chartData[0] ||
                    "sales" in reportData.chartData[0] ||
                    "purchase" in reportData.chartData[0]) ? (
                    <PieChartIcon className="w-5 h-5" />
                  ) : (
                    <BarChart3 className="w-5 h-5" />
                  )}
                  {reportData.title} — Chart View
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                {/* Determine chart type: if all items have just name+value → Pie; otherwise → Bar */}
                {(() => {
                  const cd = reportData.chartData;
                  if (!cd || cd.length === 0) return null;
                  const keys = Object.keys(cd[0]).filter(
                    (k) => k !== "name" && k !== "color"
                  );
                  const isPieFormat =
                    keys.length === 1 && keys[0] === "value";

                  if (isPieFormat) {
                    return (
                      <ResponsiveContainer width="100%" height={350}>
                        <PieChart>
                          <Pie
                            data={cd}
                            cx="50%"
                            cy="50%"
                            outerRadius={130}
                            dataKey="value"
                            nameKey="name"
                            label={({ name, percent }: { name: string; percent: number }) =>
                              `${name}: ${(percent * 100).toFixed(1)}%`
                            }
                          >
                            {cd.map((_entry, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={
                                  PIE_COLORS[index % PIE_COLORS.length]
                                }
                              />
                            ))}
                          </Pie>
                          <RechartsTooltip
                            formatter={(value: number) =>
                              isVatAuditor
                                ? "N/A"
                                : fmt(value, "currency")
                            }
                          />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    );
                  }

                  // Bar chart for comparison data
                  const numericKeys = keys.filter((k) =>
                    cd.some((item) => typeof item[k] === "number")
                  );

                  return (
                    <ResponsiveContainer width="100%" height={350}>
                      <BarChart data={cd}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <RechartsTooltip
                          formatter={(value: number, name: string) => [
                            isVatAuditor ? "N/A" : fmt(value, "currency"),
                            name,
                          ]}
                        />
                        <Legend />
                        {numericKeys.map((k, idx) => (
                          <Bar
                            key={k}
                            dataKey={k}
                            fill={PIE_COLORS[idx % PIE_COLORS.length]}
                            radius={[4, 4, 0, 0]}
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          {/* ---- Data Table ---- */}
          <Card>
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-[#2563eb]" />
                  {reportData.title}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={generateReport}
                    disabled={loading}
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[55vh] overflow-x-auto overflow-y-auto styled-scrollbar -mx-2 sm:mx-0">
                <Table className="min-w-[700px]">
                  <TableHeader>
                    <TableRow className="bg-muted/60 hover:bg-muted/60 sticky top-0 z-10">
                      <TableHead className="w-12 text-center">#</TableHead>
                      {reportData.columns.map((col) => {
                        const isActive = tableSortField === col.key;
                        return (
                          <TableHead
                            key={col.key}
                            className="cursor-pointer select-none hover:bg-muted/80 transition-colors whitespace-nowrap"
                            onClick={() => handleColumnSort(col.key)}
                          >
                            <span className="flex items-center gap-1">
                              {col.label}
                              {isActive ? (
                                tableSortOrder === "asc" ? (
                                  <ChevronUp className="w-3 h-3 text-[#2563eb]" />
                                ) : (
                                  <ChevronDown className="w-3 h-3 text-[#2563eb]" />
                                )
                              ) : (
                                <ArrowUpDown className="w-3 h-3 opacity-30" />
                              )}
                            </span>
                          </TableHead>
                        );
                      })}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedRows.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={reportData.columns.length + 1}
                          className="h-24 text-center text-muted-foreground"
                        >
                          <div className="flex flex-col items-center gap-2">
                            <Eye className="w-8 h-8 opacity-30" />
                            No data found for the selected filters
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      sortedRows.map((row, idx) => (
                        <TableRow
                          key={idx}
                          className={
                            idx % 2 === 0
                              ? "bg-background"
                              : "bg-muted/20 hover:bg-muted/40"
                          }
                        >
                          <TableCell className="text-center text-xs text-muted-foreground font-mono">
                            {idx + 1}
                          </TableCell>
                          {reportData.columns.map((col) => {
                            const val = row[col.key];
                            const ct = detectColumnType(col.key);
                            const isMasked =
                              isVatAuditor &&
                              ct === "currency" &&
                              (col.key.toLowerCase().includes("cost") ||
                                col.key.toLowerCase().includes("margin") ||
                                col.key.toLowerCase().includes("profit") ||
                                col.key.toLowerCase().includes("internal"));
                            return (
                              <TableCell
                                key={col.key}
                                className={`whitespace-nowrap ${
                                  ct === "currency"
                                    ? "font-mono text-right"
                                    : ct === "date"
                                      ? "font-mono"
                                      : ""
                                } ${
                                  isMasked
                                    ? "text-amber-500 italic"
                                    : ""
                                }`}
                              >
                                {isMasked
                                  ? "N/A (Audit Mode)"
                                  : ct === "currency"
                                    ? fmt(val, "currency")
                                    : ct === "date"
                                      ? fmt(val, "date")
                                      : ct === "percent"
                                        ? fmt(val, "percent")
                                        : String(val ?? "—")}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))
                    )}

                    {/* Grand Total Row */}
                    {grandTotalRow && sortedRows.length > 0 && (
                      <TableRow className="bg-[#132240] dark:bg-[#0a1628] hover:bg-[#132240] dark:hover:bg-[#0a1628] font-bold sticky bottom-0 z-10">
                        <TableCell className="text-center text-white font-mono">
                          ∑
                        </TableCell>
                        {reportData.columns.map((col) => (
                          <TableCell
                            key={col.key}
                            className={`whitespace-nowrap text-white ${
                              detectColumnType(col.key) === "currency"
                                ? "font-mono text-right"
                                : ""
                            }`}
                          >
                            {String(grandTotalRow[col.key] || "")}
                          </TableCell>
                        ))}
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Record count */}
              <div className="px-4 py-2 border-t text-xs text-muted-foreground flex items-center justify-between">
                <span>
                  Showing {sortedRows.length} record
                  {sortedRows.length !== 1 ? "s" : ""}
                </span>
                {reportData.title && (
                  <span className="text-muted-foreground/60">
                    {reportData.title}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ============ EMPTY STATE (no report generated yet) ============ */}
      {!reportData && !loading && (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="mx-auto mb-4 w-20 h-20 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
              <BarChart3 className="w-10 h-10 text-[#2563eb]" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
              Generate a Report
            </h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Select a report category, choose a sub-report type, set your date
              range and filters, then click &quot;Generate Report&quot; to view
              the data.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ============ CUSTOM SCROLLBAR STYLES ============ */}
      <style jsx global>{`
        .styled-scrollbar::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .styled-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .styled-scrollbar::-webkit-scrollbar-thumb {
          background: #94a3b8;
          border-radius: 4px;
        }
        .styled-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #64748b;
        }
        @media (prefers-color-scheme: dark) {
          .styled-scrollbar::-webkit-scrollbar-thumb {
            background: #475569;
          }
          .styled-scrollbar::-webkit-scrollbar-thumb:hover {
            background: #64748b;
          }
        }
      `}</style>
    </div>
  );
}
