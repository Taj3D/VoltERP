"use client";
// ============================================================
// VoltERP — ELECTRONICS MART IMS v2.0
// Operations Module Page — Dedicated Component
// SR Target Setup | Payment Options | Card Types | Card Type Setup
// Phase 7: Live Target Tracking, Channel Status Toggles,
// Branded PDF Framework, Transactional CSV Core
// ============================================================

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus, Edit, Trash2, Download, Upload, RefreshCw, Search,
  FileDown, Target, CreditCard, Settings, X, Shield,
  CheckCircle, Loader2, AlertTriangle, Power, Eye,
  TrendingUp, DollarSign, BarChart3, Users, Percent,
  ArrowRight, ChevronRight, Info, Activity,
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  exportToPDF, exportToCSV, importFromCSV,
} from "@/lib/export-utils";
import type { ColumnDef as ExportColumnDef, FieldDef as ExportFieldDef, CompanyProfile as ExportCompanyProfile } from "@/lib/export-utils";

// ============================================================
// CONSTANTS
// ============================================================

const MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const bdFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtCurrency = (v: any) => {
  if (v === null || v === undefined) return "—";
  if (v === "N/A (Audit Mode)") return v;
  return `৳${bdFmt.format(Number(v))}`;
};

const fmtPercent = (v: any) => {
  if (v === null || v === undefined) return "—";
  return `${Number(v).toFixed(2)}%`;
};

const fmtNumber = (v: any) => {
  if (v === null || v === undefined) return "—";
  return bdFmt.format(Number(v));
};

// ============================================================
// API FETCH HELPER
// ============================================================

async function apiFetch(path: string, opts?: RequestInit) {
  const authHeaders: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const stored = localStorage.getItem("ems_auth");
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.accessToken) { authHeaders["Authorization"] = `Bearer ${parsed.accessToken}`; }
    }
  } catch { /* ignore */ }
  const res = await fetch(path, { headers: { ...authHeaders, ...opts?.headers }, ...opts });
  if (!res.ok) {
    if (res.status === 401) { localStorage.removeItem("ems_auth"); window.location.reload(); }
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

// ============================================================
// AUTH (local pattern matching existing components)
// ============================================================

type UserRole = "admin" | "manager" | "sr" | "dealer" | "vat_auditor";

interface AuthUser { name: string; email: string; role: UserRole; displayName: string; }

let authState = { isAuthenticated: false, user: null as AuthUser | null };
let authListeners: Array<() => void> = [];

function useAuth() {
  const [, forceUpdate] = useState({});
  useEffect(() => {
    const listener = () => forceUpdate({});
    authListeners.push(listener);
    return () => { authListeners = authListeners.filter(l => l !== listener); };
  }, []);
  const loadAuth = useCallback(() => {
    try {
      const stored = localStorage.getItem("ems_auth");
      if (stored) { const parsed = JSON.parse(stored); authState = { isAuthenticated: true, user: parsed.user }; }
      else { authState = { isAuthenticated: false, user: null }; }
    } catch { authState = { isAuthenticated: false, user: null }; }
    authListeners.forEach(l => l());
  }, []);
  useEffect(() => { loadAuth(); }, [loadAuth]);
  return authState;
}

// ============================================================
// XSS / CSV SANITIZATION
// ============================================================

const sanitizeInput = (input: string): string => {
  return input.replace(/<[^>]*>/g, '').replace(/\r\n/g, '\n').replace(/  +/g, ' ').trim();
};

const sanitizeCSVInput = (input: string): string => {
  return input
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on(error|load|click|mouseover|focus|blur)=/gi, '')
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/eval\s*\(/gi, '')
    .replace(/document\.cookie/gi, '')
    .replace(/window\.location/gi, '')
    .trim();
};

// Field length validation
const validateFieldLength = (value: string, fieldType: 'name' | 'numeric' | 'percentage'): string | null => {
  if (fieldType === 'name' && value.length > 100) return 'Name fields must be max 100 characters';
  if (fieldType === 'numeric' && value.replace(/[.,\-]/g, '').length > 15) return 'Numeric fields must be max 15 digits';
  if (fieldType === 'percentage' && value.length > 5) return 'Percentage fields must be max 5 characters';
  return null;
};

// ============================================================
// HELPER: Get nested value from object
// ============================================================

function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((acc, part) => acc?.[part], obj);
}

// ============================================================
// COLUMN / FIELD DEFINITIONS FOR EXPORT
// ============================================================

const SR_TARGET_COLUMNS: ExportColumnDef[] = [
  { key: "employee.name", label: "Employee", type: "text" },
  { key: "month", label: "Month", type: "number" },
  { key: "year", label: "Year", type: "number" },
  { key: "targetAmount", label: "Target Amount", type: "currency" },
  { key: "minimumSalesQuota", label: "Min Sales Quota", type: "currency" },
  { key: "commissionPercentage", label: "Commission %", type: "number" },
  { key: "status", label: "Channel Status", type: "text" },
  { key: "isActive", label: "Status", type: "boolean" },
];

const SR_TARGET_FIELDS: ExportFieldDef[] = [
  { key: "employeeId", label: "Employee (SR)", type: "select", required: true, options: [] },
  { key: "month", label: "Month", type: "number", required: true },
  { key: "year", label: "Year", type: "number", required: true },
  { key: "targetAmount", label: "Target Amount (৳)", type: "number", required: true, step: "0.01" },
  { key: "minimumSalesQuota", label: "Minimum Sales Quota (৳)", type: "number", required: true, step: "0.01" },
  { key: "commissionPercentage", label: "Commission Percentage (%)", type: "number", required: true, step: "0.01" },
];

const PAYMENT_OPTION_COLUMNS: ExportColumnDef[] = [
  { key: "name", label: "Payment Option", type: "text" },
  { key: "status", label: "Channel Status", type: "text" },
  { key: "_count.cardTypeSetups", label: "Card Setups", type: "number" },
  { key: "isActive", label: "Status", type: "boolean" },
];

const PAYMENT_OPTION_FIELDS: ExportFieldDef[] = [
  { key: "name", label: "Payment Option Name", type: "text", required: true },
  { key: "status", label: "Channel Status", type: "select", required: true, options: [{ value: "ACTIVE", label: "ACTIVE" }, { value: "INACTIVE", label: "INACTIVE" }] },
  { key: "isActive", label: "Active", type: "checkbox", defaultValue: true },
];

const CARD_TYPE_COLUMNS: ExportColumnDef[] = [
  { key: "name", label: "Card Type", type: "text" },
  { key: "_count.cardTypeSetups", label: "Card Setups", type: "number" },
  { key: "isActive", label: "Status", type: "boolean" },
];

const CARD_TYPE_FIELDS: ExportFieldDef[] = [
  { key: "name", label: "Card Type Name", type: "text", required: true },
  { key: "isActive", label: "Active", type: "checkbox", defaultValue: true },
];

const CARD_TYPE_SETUP_COLUMNS: ExportColumnDef[] = [
  { key: "paymentOption.name", label: "Payment Option", type: "text" },
  { key: "cardType.name", label: "Card Type", type: "text" },
  { key: "chargePercentage", label: "Charge %", type: "number" },
  { key: "bankServiceCharge", label: "BSC %", type: "number" },
  { key: "customerConvFee", label: "Conv. Fee %", type: "number" },
  { key: "isActive", label: "Status", type: "boolean" },
];

const CARD_TYPE_SETUP_FIELDS: ExportFieldDef[] = [
  { key: "paymentOptionId", label: "Payment Option", type: "select", required: true, options: [] },
  { key: "cardTypeId", label: "Card Type", type: "select", required: true, options: [] },
  { key: "chargePercentage", label: "Charge Percentage (%)", type: "number", defaultValue: 0, step: "0.01" },
  { key: "bankServiceCharge", label: "Bank Service Charge BSC (%)", type: "number", defaultValue: 0, step: "0.01" },
  { key: "customerConvFee", label: "Customer Conv. Fee (%)", type: "number", defaultValue: 0, step: "0.01" },
];

// ============================================================
// SR PERFORMANCE DATA INTERFACE
// ============================================================

interface SRPerformanceData {
  employeeId: string;
  month: number;
  year: number;
  actualSales: number;
  achievementPct: number;
  commissionProjection: number;
  remainingAmount: number;
}

// ============================================================
// SR TARGET SETUP TAB — Live Performance Dashboard
// ============================================================

function SRTargetSetupTab({ userRole, isVatAuditor }: { userRole: UserRole; isVatAuditor: boolean }) {
  const { toast } = useToast();
  const [data, setData] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [performanceData, setPerformanceData] = useState<Record<string, SRPerformanceData>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [companyProfile, setCompanyProfile] = useState<any>(null);
  const [snapshot, setSnapshot] = useState<any[] | null>(null);
  const [srTargetError, setSrTargetError] = useState<string | null>(null);
  const [performanceDialogOpen, setPerformanceDialogOpen] = useState(false);
  const [performanceDialogTarget, setPerformanceDialogTarget] = useState<any>(null);
  const [performanceDialogData, setPerformanceDialogData] = useState<any[]>([]);

  // Filters
  const [filterMonth, setFilterMonth] = useState<string>("all");
  const [filterYear, setFilterYear] = useState<string>("all");
  const [filterEmployee, setFilterEmployee] = useState<string>("all");

  const canMutate = userRole === "admin" || userRole === "manager";
  const maskedColumns = isVatAuditor ? ["targetAmount", "minimumSalesQuota", "commissionPercentage", "achievementPct", "remainingAmount", "commissionProjection"] : [];

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch("/api/sr-targets");
      setData(Array.isArray(result) ? result : []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Load employees for dropdown
  const loadEmployees = useCallback(async () => {
    try {
      const result = await apiFetch("/api/employees");
      setEmployees(Array.isArray(result) ? result : []);
    } catch { setEmployees([]); }
  }, []);

  // Load company profile
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const profile = await apiFetch("/api/company-branding");
        setCompanyProfile(profile);
      } catch { /* ignore */ }
    };
    loadProfile();
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { loadEmployees(); }, [loadEmployees]);

  // Load SR performance data — single API call fetches all periods
  useEffect(() => {
    const loadPerformance = async () => {
      const perfMap: Record<string, SRPerformanceData> = {};
      try {
        const result = await apiFetch("/api/sr-performance");
        if (result && result.periods && Array.isArray(result.periods)) {
          for (const period of result.periods) {
            const key = `${period.employeeId}-${period.month}-${period.year}`;
            perfMap[key] = {
              employeeId: period.employeeId,
              month: period.month,
              year: period.year,
              actualSales: Number(period.actualSales || 0),
              achievementPct: Number(period.achievementPercentage || 0),
              commissionProjection: Number(period.commissionProjection || 0),
              remainingAmount: Number(period.remainingAmount || 0),
            };
          }
        }
      } catch {
        // Performance API may not be available yet; set default zero values
        for (const target of data) {
          const key = `${target.employeeId}-${target.month}-${target.year}`;
          if (!perfMap[key]) {
            perfMap[key] = {
              employeeId: target.employeeId,
              month: target.month,
              year: target.year,
              actualSales: 0,
              achievementPct: 0,
              commissionProjection: 0,
              remainingAmount: Number(target.targetAmount || 0),
            };
          }
        }
      }
      setPerformanceData(perfMap);
    };
    if (data.length > 0) loadPerformance();
  }, [data]);

  // Filtered data
  const filteredData = useMemo(() => {
    let result = data;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(item =>
        SR_TARGET_COLUMNS.some(col =>
          String(getNestedValue(item, col.key) ?? "").toLowerCase().includes(q)
        )
      );
    }
    if (filterMonth !== "all") result = result.filter(d => d.month === Number(filterMonth));
    if (filterYear !== "all") result = result.filter(d => d.year === Number(filterYear));
    if (filterEmployee !== "all") result = result.filter(d => d.employeeId === filterEmployee);
    return result;
  }, [data, search, filterMonth, filterYear, filterEmployee]);

  // KPI stats
  const kpiStats = useMemo(() => {
    const totalTargets = data.length;
    const totalTargetAmount = data.reduce((sum, d) => sum + Number(d.targetAmount || 0), 0);
    const avgTarget = totalTargets > 0 ? totalTargetAmount / totalTargets : 0;
    const totalAchieved = Object.values(performanceData).reduce((sum, p) => sum + p.actualSales, 0);
    const totalCommissionProjection = Object.values(performanceData).reduce((sum, p) => sum + p.commissionProjection, 0);
    return { totalTargets, totalTargetAmount, avgTarget, totalAchieved, totalCommissionProjection };
  }, [data, performanceData]);

  // Open create dialog
  const openCreate = () => {
    setEditingItem(null);
    setSrTargetError(null);
    setFormData({ employeeId: "", month: "", year: new Date().getFullYear(), targetAmount: "", minimumSalesQuota: "", commissionPercentage: "" });
    setDialogOpen(true);
  };

  // Open edit dialog
  const openEdit = (item: any) => {
    setEditingItem(item);
    setSrTargetError(null);
    const values: Record<string, any> = {};
    SR_TARGET_FIELDS.forEach(f => {
      const val = getNestedValue(item, f.key);
      if (val !== undefined && val !== null) values[f.key] = val;
      else if (f.defaultValue !== undefined) values[f.key] = f.defaultValue;
      else values[f.key] = f.type === "checkbox" ? true : "";
    });
    setFormData(values);
    setDialogOpen(true);
  };

  // Save
  const handleSave = async () => {
    // Validate required fields
    for (const f of SR_TARGET_FIELDS) {
      if (f.required && !formData[f.key] && formData[f.key] !== 0) {
        toast({ title: "Validation Error", description: `${f.label} is required`, variant: "destructive" });
        return;
      }
    }

    // Financial Benchmark Shields
    const targetAmt = Number(formData.targetAmount);
    const minQuota = Number(formData.minimumSalesQuota);
    const commPct = Number(formData.commissionPercentage);

    if (!targetAmt || targetAmt <= 0) {
      setSrTargetError("Target Amount must be greater than zero");
      toast({ title: "Financial Benchmark Shield", description: "Target Amount must be greater than zero", variant: "destructive" });
      return;
    }
    if (!minQuota || minQuota <= 0) {
      setSrTargetError("Minimum Sales Quota must be greater than zero");
      toast({ title: "Financial Benchmark Shield", description: "Minimum Sales Quota must be greater than zero", variant: "destructive" });
      return;
    }
    if (isNaN(commPct) || commPct < 0) {
      setSrTargetError("Commission Percentage must be zero or positive");
      toast({ title: "Financial Benchmark Shield", description: "Commission Percentage must be zero or positive", variant: "destructive" });
      return;
    }
    // Month validation
    const monthNum = Number(formData.month);
    if (!Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) {
      setSrTargetError("Month must be between 1 and 12");
      toast({ title: "Validation Error", description: "Month must be between 1 and 12", variant: "destructive" });
      return;
    }
    // Year validation
    const yearNum = Number(formData.year);
    if (!Number.isInteger(yearNum) || yearNum < 2000 || yearNum > 2100) {
      setSrTargetError("Year must be between 2000 and 2100");
      toast({ title: "Validation Error", description: "Year must be between 2000 and 2100", variant: "destructive" });
      return;
    }
    setSrTargetError(null);

    // Sanitize string fields
    const sanitizedData: Record<string, any> = {};
    for (const [key, value] of Object.entries(formData)) {
      if (typeof value === "string") sanitizedData[key] = sanitizeInput(value);
      else sanitizedData[key] = value;
    }

    setSaving(true);
    setSnapshot([...data]);

    try {
      if (editingItem) {
        const res = await apiFetch(`/api/sr-targets/${editingItem.id}`, {
          method: "PUT", body: JSON.stringify(sanitizedData),
        });
        if (res?.error) throw new Error(res.error);
        toast({ title: "Updated", description: "SR Target updated successfully" });
      } else {
        const res = await apiFetch("/api/sr-targets", {
          method: "POST", body: JSON.stringify(sanitizedData),
        });
        if (res?.error) throw new Error(res.error);
        toast({ title: "Created", description: "SR Target created successfully" });
      }
      setDialogOpen(false);
      if (editingItem) {
        setData(prev => prev.map(d => d.id === editingItem.id ? { ...d, ...sanitizedData } : d));
      }
      loadData();
    } catch (e: any) {
      const msg = e.message || "Failed to save";
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("Network request failed")) {
        setData(snapshot || []);
        toast({ title: "Connection Lost — Rollback", description: "Rolled back to pre-save state.", variant: "destructive", duration: 8000 });
      } else if (msg.includes("already exists") || msg.includes("overlap") || msg.includes("duplicate") || msg.includes("Duplicate")) {
        setSrTargetError(msg);
        toast({ title: "Duplicate Detected", description: msg, variant: "destructive" });
      } else {
        toast({ title: "Error", description: msg, variant: "destructive" });
      }
    } finally {
      setSaving(false);
    }
  };

  // Delete
  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/api/sr-targets/${id}`, { method: "DELETE" });
      toast({ title: "Deactivated", description: "SR Target deactivated successfully" });
      setDeleteConfirm(null);
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // View Performance
  const handleViewPerformance = async (item: any) => {
    setPerformanceDialogTarget(item);
    setPerformanceDialogOpen(true);
    try {
      // Load monthly performance for the entire year
      const monthlyData: { month: number; monthName: string; actualSales: number; achievementPct: number }[] = [];
      for (let m = 1; m <= 12; m++) {
        const key = `${item.employeeId}-${m}-${item.year}`;
        const perf = performanceData[key];
        monthlyData.push({
          month: m,
          monthName: MONTH_NAMES[m],
          actualSales: perf?.actualSales || 0,
          achievementPct: perf?.achievementPct || 0,
        });
      }
      setPerformanceDialogData(monthlyData);
    } catch {
      setPerformanceDialogData([]);
    }
  };

  // Export PDF
  const handleExportPDF = () => {
    try {
      const exportData = filteredData.map(item => {
        const row: Record<string, any> = {};
        SR_TARGET_COLUMNS.forEach(col => {
          let val = getNestedValue(item, col.key);
          if (isVatAuditor && maskedColumns.includes(col.key)) val = "N/A (Audit Mode)";
          row[col.key] = val;
        });
        // Add computed fields
        const perfKey = `${item.employeeId}-${item.month}-${item.year}`;
        const perf = performanceData[perfKey];
        row.achievementPct = perf?.achievementPct || 0;
        row.remainingAmount = perf?.remainingAmount || Number(item.targetAmount || 0);
        row.commissionProjection = perf?.commissionProjection || 0;
        return row;
      });

      const authUser = authState.user;
      const exportColumns = [
        ...SR_TARGET_COLUMNS,
        { key: "achievementPct", label: "Achievement %", type: "number" as const },
        { key: "remainingAmount", label: "Remaining Amount", type: "currency" as const },
        { key: "commissionProjection", label: "Commission Projection", type: "currency" as const },
      ];

      exportToPDF({
        title: "SR Target Setup",
        subtitle: `Total Records: ${filteredData.length} | ${filterYear !== "all" ? `Year: ${filterYear}` : "All Years"}`,
        orientation: "landscape",
        columns: exportColumns,
        data: exportData,
        isVatAuditor,
        vatMaskedColumns: maskedColumns,
        systemNotice: "SR Target Performance Report — Confidential",
        company: companyProfile ? {
          name: companyProfile.name, address: companyProfile.address,
          phone: companyProfile.phone, email: companyProfile.email,
          logo: companyProfile.logo || companyProfile.brandLogo,
          vatNumber: companyProfile.vatNumber,
        } : undefined,
        financialFooter: {
          preparedBy: authUser?.displayName || "System",
          checkedBy: "", authorizedBy: "", approvedBy: "",
          printedBy: authUser?.displayName || "System",
        },
      });
      toast({ title: "PDF Exported", description: "SR Target report exported with compliance footer" });
    } catch (e: any) {
      toast({ title: "Export Error", description: e.message, variant: "destructive" });
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    try {
      const exportData = filteredData.map(item => {
        const row: Record<string, any> = {};
        SR_TARGET_COLUMNS.forEach(col => {
          let val = getNestedValue(item, col.key);
          if (isVatAuditor && maskedColumns.includes(col.key)) val = "N/A (Audit Mode)";
          row[col.key] = val;
        });
        return row;
      });
      exportToCSV({ title: "SR Target Setup", columns: SR_TARGET_COLUMNS, data: exportData, isVatAuditor, vatMaskedColumns: maskedColumns });
      toast({ title: "CSV Exported", description: "SR Target data exported" });
    } catch (e: any) {
      toast({ title: "Export Error", description: e.message, variant: "destructive" });
    }
  };

  // Import CSV with duplicate detection
  const handleImportCSV = () => {
    importFromCSV({
      apiPath: "/api/sr-targets",
      formFields: SR_TARGET_FIELDS,
    }).then((result) => {
      // Post-import duplicate detection for SR targets
      const duplicateErrors = (result.fieldErrors || []).filter(
        fe => fe.message.includes("already exists") || fe.message.includes("duplicate") || fe.message.includes("overlap")
      );
      if (duplicateErrors.length > 0) {
        toast({
          title: "Import: Duplicate Detection",
          description: `${duplicateErrors.length} row(s) had duplicate employee+month+year combinations`,
          variant: "destructive",
          duration: 8000,
        });
      }
      toast({
        title: "Import Complete",
        description: `${result.imported} imported, ${result.failed} failed${result.errors.length > 0 ? ` (${result.errors.slice(0, 3).join("; ")})` : ""}`,
        variant: result.failed > 0 ? "destructive" : "default",
      });
      loadData();
    });
  };

  // Get achievement color
  const getAchievementColor = (pct: number) => {
    if (pct >= 80) return "text-emerald-600";
    if (pct >= 50) return "text-amber-600";
    return "text-red-600";
  };

  const getAchievementBarColor = (pct: number) => {
    if (pct >= 80) return "bg-emerald-500";
    if (pct >= 50) return "bg-amber-500";
    return "bg-red-500";
  };

  // Year options
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 11 }, (_, i) => currentYear - 5 + i);

  return (
    <div className="space-y-4">
      {/* ── KPI Performance Dashboard ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="border-slate-200 dark:border-slate-700">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[#2563eb]/10 flex items-center justify-center">
              <Target className="h-5 w-5 text-[#2563eb]" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Total Targets Set</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{kpiStats.totalTargets}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 dark:border-slate-700">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Total Target Amount</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(kpiStats.totalTargetAmount)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 dark:border-slate-700">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Avg Target</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(kpiStats.avgTarget)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 dark:border-slate-700">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-violet-500" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Total Achieved</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(kpiStats.totalAchieved)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 dark:border-slate-700">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-rose-500/10 flex items-center justify-center">
              <Percent className="h-5 w-5 text-rose-500" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Commission Projections</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(kpiStats.totalCommissionProjection)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search SR targets..." className="pl-8" />
        </div>
        <Select value={filterMonth} onValueChange={setFilterMonth}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Month" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Months</SelectItem>
            {MONTH_NAMES.slice(1).map((name, i) => (
              <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterYear} onValueChange={setFilterYear}>
          <SelectTrigger className="w-[120px]"><SelectValue placeholder="Year" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Years</SelectItem>
            {yearOptions.map(y => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterEmployee} onValueChange={setFilterEmployee}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Employee" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Employees</SelectItem>
            {employees.map((emp: any) => (
              <SelectItem key={emp.id} value={emp.id}>{emp.name || emp.employeeCode}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canMutate && (
          <Button onClick={openCreate} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
            <Plus className="h-4 w-4 mr-1" /> Add Target
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={handleExportCSV}><Download className="h-4 w-4 mr-1" /> CSV</Button>
        <Button variant="outline" size="sm" onClick={handleExportPDF}><FileDown className="h-4 w-4 mr-1" /> PDF</Button>
        {canMutate && (
          <Button variant="outline" size="sm" onClick={handleImportCSV}><Upload className="h-4 w-4 mr-1" /> Import</Button>
        )}
        <Button variant="ghost" size="sm" onClick={loadData}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button>
      </div>

      {/* ── VAT Audit Mode Banner ── */}
      {isVatAuditor && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center gap-2">
          <Shield className="h-4 w-4 text-amber-600" />
          <span className="text-sm text-amber-700 dark:text-amber-400 font-medium">VAT AUDIT MODE — Financial columns are masked</span>
        </div>
      )}

      {/* ── Data Table ── */}
      <Card className="border-slate-200 dark:border-slate-700">
        <CardContent className="p-0">
          <div className="overflow-x-auto -mx-2 sm:mx-0">
            <Table className="min-w-[600px]">
              <TableHeader>
                <TableRow className="bg-[#132240] dark:bg-[#0a1628]">
                  <TableHead className="text-white font-semibold w-12">#</TableHead>
                  <TableHead className="text-white font-semibold">Employee</TableHead>
                  <TableHead className="text-white font-semibold">Month</TableHead>
                  <TableHead className="text-white font-semibold">Year</TableHead>
                  <TableHead className="text-white font-semibold text-right">Target Amount</TableHead>
                  <TableHead className="text-white font-semibold text-right">Min Sales Quota</TableHead>
                  <TableHead className="text-white font-semibold text-right">Commission %</TableHead>
                  <TableHead className="text-white font-semibold">Channel Status</TableHead>
                  <TableHead className="text-white font-semibold text-right">Achievement %</TableHead>
                  <TableHead className="text-white font-semibold text-right">Remaining</TableHead>
                  <TableHead className="text-white font-semibold text-center">Performance</TableHead>
                  {canMutate && <TableHead className="text-white font-semibold w-32">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={canMutate ? 12 : 11} className="text-center py-8 text-slate-400">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                      Synchronizing Field Targets & Financial Processing Fees...
                    </TableCell>
                  </TableRow>
                ) : filteredData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canMutate ? 12 : 11} className="text-center py-8 text-slate-400">
                      No SR targets found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredData.map((item, idx) => {
                    const perfKey = `${item.employeeId}-${item.month}-${item.year}`;
                    const perf = performanceData[perfKey];
                    const achievementPct = perf?.achievementPct || 0;
                    const remaining = perf?.remainingAmount || Number(item.targetAmount || 0);
                    const commissionProj = perf?.commissionProjection || 0;

                    return (
                      <TableRow key={item.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <TableCell className="text-slate-500 text-xs">{idx + 1}</TableCell>
                        <TableCell className="font-medium text-slate-900 dark:text-white">
                          {item.employee?.name || item.employeeId}
                        </TableCell>
                        <TableCell>{MONTH_NAMES[item.month] || item.month}</TableCell>
                        <TableCell>{item.year}</TableCell>
                        <TableCell className="text-right font-mono">
                          {isVatAuditor && maskedColumns.includes("targetAmount") ? "N/A (Audit Mode)" : fmtCurrency(item.targetAmount)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {isVatAuditor && maskedColumns.includes("minimumSalesQuota") ? "N/A (Audit Mode)" : fmtCurrency(item.minimumSalesQuota)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {isVatAuditor && maskedColumns.includes("commissionPercentage") ? "N/A (Audit Mode)" : fmtPercent(item.commissionPercentage)}
                        </TableCell>
                        <TableCell>
                          <Badge className={
                            item.status === "ACTIVE"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                              : item.status === "INACTIVE"
                                ? "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                          }>
                            {item.status === "SUSPENDED" && <AlertTriangle className="h-3 w-3 mr-1" />}
                            {item.status || "ACTIVE"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end gap-1">
                            <span className={`font-semibold ${isVatAuditor ? "text-slate-400" : getAchievementColor(achievementPct)}`}>
                              {isVatAuditor ? "N/A (Audit Mode)" : `${achievementPct.toFixed(1)}%`}
                            </span>
                            {!isVatAuditor && (
                              <div className="w-20 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${getAchievementBarColor(achievementPct)}`} style={{ width: `${Math.min(achievementPct, 100)}%` }} />
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(remaining)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button variant="ghost" size="sm" onClick={() => handleViewPerformance(item)} title="View Performance">
                            <Eye className="h-4 w-4 text-[#2563eb]" />
                          </Button>
                        </TableCell>
                        {canMutate && (
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openEdit(item)}><Edit className="h-3.5 w-3.5" /></Button>
                              <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={() => setDeleteConfirm(item.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Create/Edit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit SR Target" : "Add SR Target"}</DialogTitle>
            <DialogDescription>{editingItem ? "Update target configuration" : "Set a new sales target for an SR"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {srTargetError && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                <span className="text-sm text-red-700 dark:text-red-400">{srTargetError}</span>
              </div>
            )}
            <div className="space-y-2">
              <Label>Employee (SR) *</Label>
              <Select value={String(formData.employeeId || "")} onValueChange={(v) => setFormData(prev => ({ ...prev, employeeId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select Employee" /></SelectTrigger>
                <SelectContent>
                  {employees.map((emp: any) => (
                    <SelectItem key={emp.id} value={emp.id}>{emp.name || emp.employeeCode}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Month *</Label>
                <Select value={String(formData.month || "")} onValueChange={(v) => setFormData(prev => ({ ...prev, month: Number(v) }))}>
                  <SelectTrigger><SelectValue placeholder="Select Month" /></SelectTrigger>
                  <SelectContent>
                    {MONTH_NAMES.slice(1).map((name, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Year *</Label>
                <Input type="number" value={String(formData.year || "")} onChange={(e) => setFormData(prev => ({ ...prev, year: Number(e.target.value) }))} placeholder="2024" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Target Amount (৳) *</Label>
              <Input type="number" step="0.01" value={String(formData.targetAmount || "")} onChange={(e) => setFormData(prev => ({ ...prev, targetAmount: Number(e.target.value) }))} placeholder="0.00" className={srTargetError && ["Target"].some(k => srTargetError.includes(k)) ? "border-red-500" : ""} />
            </div>
            <div className="space-y-2">
              <Label>Minimum Sales Quota (৳) *</Label>
              <Input type="number" step="0.01" value={String(formData.minimumSalesQuota || "")} onChange={(e) => setFormData(prev => ({ ...prev, minimumSalesQuota: Number(e.target.value) }))} placeholder="0.00" className={srTargetError && ["Quota"].some(k => srTargetError.includes(k)) ? "border-red-500" : ""} />
            </div>
            <div className="space-y-2">
              <Label>Commission Percentage (%) *</Label>
              <Input type="number" step="0.01" value={String(formData.commissionPercentage || "")} onChange={(e) => setFormData(prev => ({ ...prev, commissionPercentage: Number(e.target.value) }))} placeholder="0.00" className={srTargetError && ["Commission"].some(k => srTargetError.includes(k)) ? "border-red-500" : ""} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {editingItem ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm Dialog ── */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Confirm Deactivate</DialogTitle>
            <DialogDescription>Are you sure you want to deactivate this SR target? It will be marked as inactive but can be restored by an admin.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>Deactivate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Performance Detail Dialog ── */}
      <Dialog open={performanceDialogOpen} onOpenChange={setPerformanceDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle>SR Performance — {performanceDialogTarget?.employee?.name || "Employee"}</DialogTitle>
            <DialogDescription>
              Year {performanceDialogTarget?.year || "—"} — Monthly Performance Breakdown
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {performanceDialogData.length > 0 ? performanceDialogData.map((md: any) => {
              const targetForMonth = data.find(
                (t: any) => t.employeeId === performanceDialogTarget?.employeeId && t.month === md.month && t.year === performanceDialogTarget?.year
              );
              const targetAmt = Number(targetForMonth?.targetAmount || 0);
              const commPct = Number(targetForMonth?.commissionPercentage || 0);
              const achPct = targetAmt > 0 ? (md.actualSales / targetAmt) * 100 : 0;
              const commProj = achPct * targetAmt * commPct / 10000;

              return (
                <div key={md.month} className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div className="w-24 font-medium text-sm text-slate-700 dark:text-slate-300">{md.monthName}</div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-500">Target: {fmtCurrency(targetAmt)}</span>
                      <span className={`font-semibold ${getAchievementColor(achPct)}`}>{achPct.toFixed(1)}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${getAchievementBarColor(achPct)}`} style={{ width: `${Math.min(achPct, 100)}%` }} />
                    </div>
                    <div className="flex justify-between text-xs mt-1 text-slate-500">
                      <span>Actual: {fmtCurrency(md.actualSales)}</span>
                      <span>Commission: {fmtCurrency(commProj)}</span>
                    </div>
                  </div>
                </div>
              );
            }) : (
              <p className="text-sm text-slate-400 text-center py-4">No performance data available</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPerformanceDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// PAYMENT OPTIONS TAB — Channel Config with Status Toggles
// ============================================================

function PaymentOptionsTab({ userRole, isVatAuditor }: { userRole: UserRole; isVatAuditor: boolean }) {
  const { toast } = useToast();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [companyProfile, setCompanyProfile] = useState<any>(null);
  const [snapshot, setSnapshot] = useState<any[] | null>(null);

  const canMutate = userRole === "admin" || userRole === "manager";

  // Load data with counts
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch("/api/payment-options");
      setData(Array.isArray(result) ? result : []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadData(); }, [loadData]);

  // Load company profile
  useEffect(() => {
    const loadProfile = async () => {
      try { setCompanyProfile(await apiFetch("/api/company-branding")); } catch { /* ignore */ }
    };
    loadProfile();
  }, []);

  // Filtered data
  const filteredData = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter(item =>
      PAYMENT_OPTION_COLUMNS.some(col =>
        String(getNestedValue(item, col.key) ?? "").toLowerCase().includes(q)
      )
    );
  }, [data, search]);

  // KPI stats
  const stats = useMemo(() => {
    const total = data.length;
    const active = data.filter(d => d.status === "ACTIVE").length;
    const inactive = data.filter(d => d.status === "INACTIVE").length;
    const totalCardSetups = data.reduce((sum, d) => sum + (d._count?.cardTypeSetups || 0), 0);
    return { total, active, inactive, totalCardSetups };
  }, [data]);

  // Open create dialog
  const openCreate = () => {
    setEditingItem(null);
    setFormData({ name: "", status: "ACTIVE", isActive: true });
    setDialogOpen(true);
  };

  // Open edit dialog
  const openEdit = (item: any) => {
    setEditingItem(item);
    const values: Record<string, any> = {};
    PAYMENT_OPTION_FIELDS.forEach(f => {
      const val = getNestedValue(item, f.key);
      if (val !== undefined && val !== null) values[f.key] = val;
      else if (f.defaultValue !== undefined) values[f.key] = f.defaultValue;
      else values[f.key] = f.type === "checkbox" ? true : "";
    });
    setFormData(values);
    setDialogOpen(true);
  };

  // Status toggle with optimistic UI + snapshot rollback
  const handleStatusToggle = async (item: any) => {
    const newStatus = item.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setSnapshot([...data]);
    // Optimistic update
    setData(prev => prev.map(d => d.id === item.id ? { ...d, status: newStatus } : d));

    try {
      await apiFetch(`/api/payment-options/${item.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...item, status: newStatus }),
      });
      toast({
        title: newStatus === "ACTIVE" ? "Channel Activated" : "Channel Deactivated",
        description: newStatus === "INACTIVE"
          ? `${item.name} is now INACTIVE and will be filtered out from all Invoice/Collection dropdowns.`
          : `${item.name} is now ACTIVE and available in all dropdowns.`,
        variant: newStatus === "INACTIVE" ? "destructive" : "default",
      });
      loadData();
    } catch (e: any) {
      // Rollback on failure
      setData(snapshot || []);
      toast({
        title: "Connection Lost — Rollback",
        description: "Status change failed. Rolled back to previous state.",
        variant: "destructive",
        duration: 8000,
      });
    }
  };

  // Save
  const handleSave = async () => {
    for (const f of PAYMENT_OPTION_FIELDS) {
      if (f.required && !formData[f.key] && formData[f.key] !== 0) {
        toast({ title: "Validation Error", description: `${f.label} is required`, variant: "destructive" });
        return;
      }
    }

    // Name length validation
    const nameLenError = validateFieldLength(String(formData.name || ""), 'name');
    if (nameLenError) {
      toast({ title: "Validation Error", description: nameLenError, variant: "destructive" });
      return;
    }

    const sanitizedData: Record<string, any> = {};
    for (const [key, value] of Object.entries(formData)) {
      if (typeof value === "string") sanitizedData[key] = sanitizeInput(value);
      else sanitizedData[key] = value;
    }

    setSaving(true);
    setSnapshot([...data]);

    try {
      if (editingItem) {
        const res = await apiFetch(`/api/payment-options/${editingItem.id}`, {
          method: "PUT", body: JSON.stringify(sanitizedData),
        });
        if (res?.error) throw new Error(res.error);
        toast({ title: "Updated", description: "Payment Option updated successfully" });
      } else {
        const res = await apiFetch("/api/payment-options", {
          method: "POST", body: JSON.stringify(sanitizedData),
        });
        if (res?.error) throw new Error(res.error);
        toast({ title: "Created", description: "Payment Option created successfully" });
      }
      setDialogOpen(false);
      if (editingItem) {
        setData(prev => prev.map(d => d.id === editingItem.id ? { ...d, ...sanitizedData } : d));
      }
      loadData();
    } catch (e: any) {
      const msg = e.message || "Failed to save";
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
        setData(snapshot || []);
        toast({ title: "Connection Lost — Rollback", description: "Rolled back to pre-save state.", variant: "destructive", duration: 8000 });
      } else {
        toast({ title: "Error", description: msg, variant: "destructive" });
      }
    } finally {
      setSaving(false);
    }
  };

  // Delete
  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/api/payment-options/${id}`, { method: "DELETE" });
      toast({ title: "Deleted", description: "Payment Option deleted successfully" });
      setDeleteConfirm(null);
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // Export PDF
  const handleExportPDF = () => {
    try {
      const exportData = filteredData.map(item => {
        const row: Record<string, any> = {};
        PAYMENT_OPTION_COLUMNS.forEach(col => { row[col.key] = getNestedValue(item, col.key); });
        return row;
      });
      const authUser = authState.user;
      exportToPDF({
        title: "Payment Options",
        subtitle: `Total Records: ${filteredData.length}`,
        orientation: "landscape",
        columns: PAYMENT_OPTION_COLUMNS,
        data: exportData,
        isVatAuditor: false,
        systemNotice: "Payment Channel Configuration Report — Confidential",
        company: companyProfile ? {
          name: companyProfile.name, address: companyProfile.address,
          phone: companyProfile.phone, email: companyProfile.email,
          logo: companyProfile.logo || companyProfile.brandLogo,
          vatNumber: companyProfile.vatNumber,
        } : undefined,
        financialFooter: {
          preparedBy: authUser?.displayName || "System",
          checkedBy: "", authorizedBy: "", approvedBy: "",
          printedBy: authUser?.displayName || "System",
        },
      });
      toast({ title: "PDF Exported", description: "Payment Options report exported with compliance footer" });
    } catch (e: any) {
      toast({ title: "Export Error", description: e.message, variant: "destructive" });
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    try {
      const exportData = filteredData.map(item => {
        const row: Record<string, any> = {};
        PAYMENT_OPTION_COLUMNS.forEach(col => { row[col.key] = getNestedValue(item, col.key); });
        return row;
      });
      exportToCSV({ title: "Payment Options", columns: PAYMENT_OPTION_COLUMNS, data: exportData });
      toast({ title: "CSV Exported", description: "Payment Options data exported" });
    } catch (e: any) {
      toast({ title: "Export Error", description: e.message, variant: "destructive" });
    }
  };

  // Import CSV
  const handleImportCSV = () => {
    importFromCSV({ apiPath: "/api/payment-options", formFields: PAYMENT_OPTION_FIELDS }).then((result) => {
      toast({
        title: "Import Complete",
        description: `${result.imported} imported, ${result.failed} failed${result.errors.length > 0 ? ` (${result.errors.slice(0, 3).join("; ")})` : ""}`,
        variant: result.failed > 0 ? "destructive" : "default",
      });
      loadData();
    });
  };

  // Inactive channel count for warning
  const inactiveCount = data.filter(d => d.status === "INACTIVE").length;

  return (
    <div className="space-y-4">
      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="border-slate-200 dark:border-slate-700">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[#2563eb]/10 flex items-center justify-center">
              <CreditCard className="h-5 w-5 text-[#2563eb]" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Total Channels</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{stats.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 dark:border-slate-700">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Active</p>
              <p className="text-xl font-bold text-emerald-600">{stats.active}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 dark:border-slate-700">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-slate-500/10 flex items-center justify-center">
              <X className="h-5 w-5 text-slate-500" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Inactive</p>
              <p className="text-xl font-bold text-slate-500">{stats.inactive}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 dark:border-slate-700">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
              <Settings className="h-5 w-5 text-violet-500" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Total Card Setups</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{stats.totalCardSetups}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search payment options..." className="pl-8" />
        </div>
        {canMutate && (
          <Button onClick={openCreate} className="bg-[#2563eb] hover:bg-[#1d4ed8]"><Plus className="h-4 w-4 mr-1" /> Add</Button>
        )}
        <Button variant="outline" size="sm" onClick={handleExportCSV}><Download className="h-4 w-4 mr-1" /> CSV</Button>
        <Button variant="outline" size="sm" onClick={handleExportPDF}><FileDown className="h-4 w-4 mr-1" /> PDF</Button>
        {canMutate && (
          <Button variant="outline" size="sm" onClick={handleImportCSV}><Upload className="h-4 w-4 mr-1" /> Import</Button>
        )}
        <Button variant="ghost" size="sm" onClick={loadData}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button>
      </div>

      {/* ── Inactive Channel Warning Banner ── */}
      {inactiveCount > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
          <span className="text-sm text-red-700 dark:text-red-400 font-medium">
            {inactiveCount} payment channel(s) are INACTIVE — they are filtered out from all Invoice/Collection dropdowns
          </span>
        </div>
      )}

      {/* ── Data Table ── */}
      <Card className="border-slate-200 dark:border-slate-700">
        <CardContent className="p-0">
          <div className="overflow-x-auto -mx-2 sm:mx-0">
            <Table className="min-w-[600px]">
              <TableHeader>
                <TableRow className="bg-[#132240] dark:bg-[#0a1628]">
                  <TableHead className="text-white font-semibold w-12">#</TableHead>
                  <TableHead className="text-white font-semibold">Name</TableHead>
                  <TableHead className="text-white font-semibold">Channel Status</TableHead>
                  <TableHead className="text-white font-semibold text-right">Card Setups</TableHead>
                  <TableHead className="text-white font-semibold text-right">Linked Expenses</TableHead>
                  <TableHead className="text-white font-semibold text-right">Linked Sales</TableHead>
                  <TableHead className="text-white font-semibold text-right">Linked Cash Collections</TableHead>
                  {canMutate && <TableHead className="text-white font-semibold text-center">Toggle</TableHead>}
                  {canMutate && <TableHead className="text-white font-semibold w-24">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={canMutate ? 9 : 7} className="text-center py-8 text-slate-400">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                      Authorizing Payment Channel...
                    </TableCell>
                  </TableRow>
                ) : filteredData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canMutate ? 9 : 7} className="text-center py-8 text-slate-400">No payment options found</TableCell>
                  </TableRow>
                ) : (
                  filteredData.map((item, idx) => (
                    <TableRow key={item.id || idx} className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 ${item.status === "INACTIVE" ? "bg-red-50/30 dark:bg-red-900/5" : ""}`}>
                      <TableCell className="text-slate-500 text-xs">{idx + 1}</TableCell>
                      <TableCell className="font-medium text-slate-900 dark:text-white">{item.name}</TableCell>
                      <TableCell>
                        <Badge className={
                          item.status === "ACTIVE"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        }>
                          {item.status === "INACTIVE" && <AlertTriangle className="h-3 w-3 mr-1" />}
                          {item.status || "ACTIVE"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{item._count?.cardTypeSetups ?? 0}</TableCell>
                      <TableCell className="text-right">{item._count?.expenses ?? 0}</TableCell>
                      <TableCell className="text-right">{item._count?.salesOrders ?? 0}</TableCell>
                      <TableCell className="text-right">{item._count?.cashCollections ?? 0}</TableCell>
                      {canMutate && (
                        <TableCell className="text-center">
                          <Button variant="ghost" size="sm" onClick={() => handleStatusToggle(item)} title={item.status === "ACTIVE" ? "Deactivate Channel" : "Activate Channel"}>
                            <Power className={`h-4 w-4 ${item.status === "ACTIVE" ? "text-emerald-500" : "text-red-500"}`} />
                          </Button>
                        </TableCell>
                      )}
                      {canMutate && (
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(item)}><Edit className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={() => setDeleteConfirm(item.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Create/Edit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Payment Option" : "Add Payment Option"}</DialogTitle>
            <DialogDescription>{editingItem ? "Update channel configuration" : "Create a new payment channel"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Payment Option Name *</Label>
              <Input value={String(formData.name || "")} onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g. Bkash, Visa, MasterCard" />
            </div>
            <div className="space-y-2">
              <Label>Channel Status *</Label>
              <Select value={String(formData.status || "ACTIVE")} onValueChange={(v) => setFormData(prev => ({ ...prev, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                  <SelectItem value="INACTIVE">INACTIVE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={!!formData.isActive} onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))} className="h-4 w-4 rounded border-slate-300" />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {editingItem ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm Dialog ── */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Confirm Deactivate</DialogTitle>
            <DialogDescription>Are you sure you want to deactivate this payment option? It will be marked as inactive but can be restored by an admin.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>Deactivate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// CARD TYPES TAB — Card Classification Management
// ============================================================

function CardTypesTab({ userRole, isVatAuditor }: { userRole: UserRole; isVatAuditor: boolean }) {
  const { toast } = useToast();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [companyProfile, setCompanyProfile] = useState<any>(null);
  const [snapshot, setSnapshot] = useState<any[] | null>(null);

  const canMutate = userRole === "admin" || userRole === "manager";

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch("/api/card-types");
      setData(Array.isArray(result) ? result : []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const loadProfile = async () => {
      try { setCompanyProfile(await apiFetch("/api/company-branding")); } catch { /* ignore */ }
    };
    loadProfile();
  }, []);

  const filteredData = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter(item =>
      CARD_TYPE_COLUMNS.some(col =>
        String(getNestedValue(item, col.key) ?? "").toLowerCase().includes(q)
      )
    );
  }, [data, search]);

  const stats = useMemo(() => {
    const total = data.length;
    const active = data.filter(d => d.isActive !== false).length;
    const inactive = total - active;
    const totalSetups = data.reduce((sum, d) => sum + (d._count?.cardTypeSetups || 0), 0);
    return { total, active, inactive, totalSetups };
  }, [data]);

  const openCreate = () => {
    setEditingItem(null);
    setFormData({ name: "", isActive: true });
    setDialogOpen(true);
  };

  const openEdit = (item: any) => {
    setEditingItem(item);
    const values: Record<string, any> = {};
    CARD_TYPE_FIELDS.forEach(f => {
      const val = getNestedValue(item, f.key);
      if (val !== undefined && val !== null) values[f.key] = val;
      else if (f.defaultValue !== undefined) values[f.key] = f.defaultValue;
      else values[f.key] = f.type === "checkbox" ? true : "";
    });
    setFormData(values);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    for (const f of CARD_TYPE_FIELDS) {
      if (f.required && !formData[f.key] && formData[f.key] !== 0) {
        toast({ title: "Validation Error", description: `${f.label} is required`, variant: "destructive" });
        return;
      }
    }

    const nameLenError = validateFieldLength(String(formData.name || ""), 'name');
    if (nameLenError) {
      toast({ title: "Validation Error", description: nameLenError, variant: "destructive" });
      return;
    }

    const sanitizedData: Record<string, any> = {};
    for (const [key, value] of Object.entries(formData)) {
      if (typeof value === "string") sanitizedData[key] = sanitizeInput(sanitizeCSVInput(value));
      else sanitizedData[key] = value;
    }

    setSaving(true);
    setSnapshot([...data]);

    try {
      if (editingItem) {
        const res = await apiFetch(`/api/card-types/${editingItem.id}`, {
          method: "PUT", body: JSON.stringify(sanitizedData),
        });
        if (res?.error) throw new Error(res.error);
        toast({ title: "Updated", description: "Card Type updated successfully" });
      } else {
        const res = await apiFetch("/api/card-types", {
          method: "POST", body: JSON.stringify(sanitizedData),
        });
        if (res?.error) throw new Error(res.error);
        toast({ title: "Created", description: "Card Type created successfully" });
      }
      setDialogOpen(false);
      if (editingItem) {
        setData(prev => prev.map(d => d.id === editingItem.id ? { ...d, ...sanitizedData } : d));
      }
      loadData();
    } catch (e: any) {
      const msg = e.message || "Failed to save";
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
        setData(snapshot || []);
        toast({ title: "Connection Lost — Rollback", description: "Rolled back to pre-save state.", variant: "destructive", duration: 8000 });
      } else {
        toast({ title: "Error", description: msg, variant: "destructive" });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/api/card-types/${id}`, { method: "DELETE" });
      toast({ title: "Deactivated", description: "Card Type deactivated successfully" });
      setDeleteConfirm(null);
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleExportPDF = () => {
    try {
      const exportData = filteredData.map(item => {
        const row: Record<string, any> = {};
        CARD_TYPE_COLUMNS.forEach(col => { row[col.key] = getNestedValue(item, col.key); });
        return row;
      });
      const authUser = authState.user;
      exportToPDF({
        title: "Card Types",
        subtitle: `Total Records: ${filteredData.length}`,
        orientation: "landscape",
        columns: CARD_TYPE_COLUMNS,
        data: exportData,
        isVatAuditor: false,
        systemNotice: "Card Classification Report — Confidential",
        company: companyProfile ? {
          name: companyProfile.name, address: companyProfile.address,
          phone: companyProfile.phone, email: companyProfile.email,
          logo: companyProfile.logo || companyProfile.brandLogo,
          vatNumber: companyProfile.vatNumber,
        } : undefined,
        financialFooter: {
          preparedBy: authUser?.displayName || "System",
          checkedBy: "", authorizedBy: "", approvedBy: "",
          printedBy: authUser?.displayName || "System",
        },
      });
      toast({ title: "PDF Exported", description: "Card Types report exported with compliance footer" });
    } catch (e: any) {
      toast({ title: "Export Error", description: e.message, variant: "destructive" });
    }
  };

  const handleExportCSV = () => {
    try {
      const exportData = filteredData.map(item => {
        const row: Record<string, any> = {};
        CARD_TYPE_COLUMNS.forEach(col => { row[col.key] = getNestedValue(item, col.key); });
        return row;
      });
      exportToCSV({ title: "Card Types", columns: CARD_TYPE_COLUMNS, data: exportData });
      toast({ title: "CSV Exported", description: "Card Types data exported" });
    } catch (e: any) {
      toast({ title: "Export Error", description: e.message, variant: "destructive" });
    }
  };

  const handleImportCSV = () => {
    importFromCSV({ apiPath: "/api/card-types", formFields: CARD_TYPE_FIELDS }).then((result) => {
      toast({
        title: "Import Complete",
        description: `${result.imported} imported, ${result.failed} failed${result.errors.length > 0 ? ` (${result.errors.slice(0, 3).join("; ")})` : ""}`,
        variant: result.failed > 0 ? "destructive" : "default",
      });
      loadData();
    });
  };

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="border-slate-200 dark:border-slate-700">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[#2563eb]/10 flex items-center justify-center">
              <CreditCard className="h-5 w-5 text-[#2563eb]" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Total Card Types</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{stats.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 dark:border-slate-700">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Active</p>
              <p className="text-xl font-bold text-emerald-600">{stats.active}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 dark:border-slate-700">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-slate-500/10 flex items-center justify-center">
              <X className="h-5 w-5 text-slate-500" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Inactive</p>
              <p className="text-xl font-bold text-slate-500">{stats.inactive}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 dark:border-slate-700">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
              <Settings className="h-5 w-5 text-violet-500" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Total Card Setups</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{stats.totalSetups}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search card types..." className="pl-8" />
        </div>
        {canMutate && <Button onClick={openCreate} className="bg-[#2563eb] hover:bg-[#1d4ed8]"><Plus className="h-4 w-4 mr-1" /> Add</Button>}
        <Button variant="outline" size="sm" onClick={handleExportCSV}><Download className="h-4 w-4 mr-1" /> CSV</Button>
        <Button variant="outline" size="sm" onClick={handleExportPDF}><FileDown className="h-4 w-4 mr-1" /> PDF</Button>
        {canMutate && <Button variant="outline" size="sm" onClick={handleImportCSV}><Upload className="h-4 w-4 mr-1" /> Import</Button>}
        <Button variant="ghost" size="sm" onClick={loadData}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button>
      </div>

      {/* Data Table */}
      <Card className="border-slate-200 dark:border-slate-700">
        <CardContent className="p-0">
          <div className="overflow-x-auto -mx-2 sm:mx-0">
            <Table className="min-w-[600px]">
              <TableHeader>
                <TableRow className="bg-[#132240] dark:bg-[#0a1628]">
                  <TableHead className="text-white font-semibold w-12">#</TableHead>
                  <TableHead className="text-white font-semibold">Card Type</TableHead>
                  <TableHead className="text-white font-semibold text-right">Card Setups</TableHead>
                  <TableHead className="text-white font-semibold">Status</TableHead>
                  {canMutate && <TableHead className="text-white font-semibold w-24">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={canMutate ? 5 : 4} className="text-center py-8 text-slate-400">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                      Registering Card Type Classification...
                    </TableCell>
                  </TableRow>
                ) : filteredData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canMutate ? 5 : 4} className="text-center py-8 text-slate-400">No card types found</TableCell>
                  </TableRow>
                ) : (
                  filteredData.map((item, idx) => (
                    <TableRow key={item.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <TableCell className="text-slate-500 text-xs">{idx + 1}</TableCell>
                      <TableCell className="font-medium text-slate-900 dark:text-white">{item.name}</TableCell>
                      <TableCell className="text-right">{item._count?.cardTypeSetups ?? 0}</TableCell>
                      <TableCell>
                        <Badge className={item.isActive !== false
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                          : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                        }>
                          {item.isActive !== false ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      {canMutate && (
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(item)}><Edit className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={() => setDeleteConfirm(item.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Card Type" : "Add Card Type"}</DialogTitle>
            <DialogDescription>{editingItem ? "Update card type classification" : "Create a new card type"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Card Type Name *</Label>
              <Input value={String(formData.name || "")} onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g. Visa Classic, MasterCard Gold" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={!!formData.isActive} onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))} className="h-4 w-4 rounded border-slate-300" />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {editingItem ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Confirm Deactivate</DialogTitle>
            <DialogDescription>Are you sure you want to deactivate this card type? It will be marked as inactive but can be restored by an admin.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>Deactivate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// CARD TYPE SETUP TAB — Fee Matrix with Effective Rate Calculation
// ============================================================

function CardTypeSetupTab({ userRole, isVatAuditor }: { userRole: UserRole; isVatAuditor: boolean }) {
  const { toast } = useToast();
  const [data, setData] = useState<any[]>([]);
  const [paymentOptions, setPaymentOptions] = useState<any[]>([]);
  const [cardTypes, setCardTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [companyProfile, setCompanyProfile] = useState<any>(null);
  const [snapshot, setSnapshot] = useState<any[] | null>(null);
  const [cardFeeError, setCardFeeError] = useState<string | null>(null);

  const canMutate = userRole === "admin" || userRole === "manager";
  const maskedColumns = isVatAuditor ? ["chargePercentage", "bankServiceCharge", "customerConvFee"] : [];

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch("/api/card-type-setup");
      setData(Array.isArray(result) ? result : []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadDropdowns = useCallback(async () => {
    try {
      const [poResult, ctResult] = await Promise.all([
        apiFetch("/api/payment-options"),
        apiFetch("/api/card-types"),
      ]);
      setPaymentOptions(Array.isArray(poResult) ? poResult : []);
      setCardTypes(Array.isArray(ctResult) ? ctResult : []);
    } catch {
      setPaymentOptions([]);
      setCardTypes([]);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { loadDropdowns(); }, [loadDropdowns]);

  useEffect(() => {
    const loadProfile = async () => {
      try { setCompanyProfile(await apiFetch("/api/company-branding")); } catch { /* ignore */ }
    };
    loadProfile();
  }, []);

  const filteredData = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter(item =>
      CARD_TYPE_SETUP_COLUMNS.some(col =>
        String(getNestedValue(item, col.key) ?? "").toLowerCase().includes(q)
      )
    );
  }, [data, search]);

  // KPI with effective rate stats
  const stats = useMemo(() => {
    const total = data.length;
    const active = data.filter(d => d.isActive !== false).length;
    const avgEffectiveRate = total > 0
      ? data.reduce((sum, d) => {
          const rate = Number(d.chargePercentage || 0) + Number(d.bankServiceCharge || 0) + Number(d.customerConvFee || 0);
          return sum + rate;
        }, 0) / total
      : 0;
    const highRateCount = data.filter(d => {
      const rate = Number(d.chargePercentage || 0) + Number(d.bankServiceCharge || 0) + Number(d.customerConvFee || 0);
      return rate > 5;
    }).length;
    return { total, active, inactive: total - active, avgEffectiveRate, highRateCount };
  }, [data]);

  const openCreate = () => {
    setEditingItem(null);
    setCardFeeError(null);
    setFormData({
      paymentOptionId: "", cardTypeId: "",
      chargePercentage: 0, bankServiceCharge: 0, customerConvFee: 0,
      isActive: true,
    });
    setDialogOpen(true);
  };

  const openEdit = (item: any) => {
    setEditingItem(item);
    setCardFeeError(null);
    const values: Record<string, any> = {};
    CARD_TYPE_SETUP_FIELDS.forEach(f => {
      const val = getNestedValue(item, f.key);
      if (val !== undefined && val !== null) values[f.key] = val;
      else if (f.defaultValue !== undefined) values[f.key] = f.defaultValue;
      else values[f.key] = f.type === "checkbox" ? true : "";
    });
    setFormData(values);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    for (const f of CARD_TYPE_SETUP_FIELDS) {
      if (f.required && !formData[f.key] && formData[f.key] !== 0) {
        toast({ title: "Validation Error", description: `${f.label} is required`, variant: "destructive" });
        return;
      }
    }

    // Card Fee Architecture: rate bounds validation (0 <= rate <= 10.00)
    const bsc = Number(formData.bankServiceCharge);
    const convFee = Number(formData.customerConvFee);
    const chargePct = Number(formData.chargePercentage);

    if (isNaN(bsc) || bsc < 0 || bsc > 10) {
      setCardFeeError("Bank Service Charge must be between 0% and 10%");
      toast({ title: "Card Fee Architecture", description: "Bank Service Charge (BSC %) must be between 0% and 10%", variant: "destructive" });
      return;
    }
    if (isNaN(convFee) || convFee < 0 || convFee > 10) {
      setCardFeeError("Customer Convenience Fee must be between 0% and 10%");
      toast({ title: "Card Fee Architecture", description: "Customer Conv. Fee (%) must be between 0% and 10%", variant: "destructive" });
      return;
    }
    if (isNaN(chargePct) || chargePct < 0 || chargePct > 10) {
      setCardFeeError("Charge Percentage must be between 0% and 10%");
      toast({ title: "Card Fee Architecture", description: "Charge Percentage must be between 0% and 10%", variant: "destructive" });
      return;
    }
    setCardFeeError(null);

    // Percentage field length validation
    for (const key of ['chargePercentage', 'bankServiceCharge', 'customerConvFee']) {
      const lenErr = validateFieldLength(String(formData[key] || ''), 'percentage');
      if (lenErr) {
        toast({ title: "Validation Error", description: lenErr, variant: "destructive" });
        return;
      }
    }

    const sanitizedData: Record<string, any> = {};
    for (const [key, value] of Object.entries(formData)) {
      if (typeof value === "string") sanitizedData[key] = sanitizeInput(value);
      else sanitizedData[key] = value;
    }

    setSaving(true);
    setSnapshot([...data]);

    try {
      if (editingItem) {
        const res = await apiFetch(`/api/card-type-setup/${editingItem.id}`, {
          method: "PUT", body: JSON.stringify(sanitizedData),
        });
        if (res?.error) throw new Error(res.error);
        toast({ title: "Updated", description: "Card Type Setup updated successfully" });
      } else {
        const res = await apiFetch("/api/card-type-setup", {
          method: "POST", body: JSON.stringify(sanitizedData),
        });
        if (res?.error) throw new Error(res.error);
        toast({ title: "Created", description: "Card Type Setup created successfully" });
      }
      setDialogOpen(false);
      if (editingItem) {
        setData(prev => prev.map(d => d.id === editingItem.id ? { ...d, ...sanitizedData } : d));
      }
      loadData();
    } catch (e: any) {
      const msg = e.message || "Failed to save";
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
        setData(snapshot || []);
        toast({ title: "Connection Lost — Rollback", description: "Rolled back to pre-save state.", variant: "destructive", duration: 8000 });
      } else {
        toast({ title: "Error", description: msg, variant: "destructive" });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/api/card-type-setup/${id}`, { method: "DELETE" });
      toast({ title: "Deactivated", description: "Card Type Setup deactivated successfully" });
      setDeleteConfirm(null);
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // Compute effective total rate
  const computeEffectiveRate = (item: any) => {
    return Number(item.chargePercentage || 0) + Number(item.bankServiceCharge || 0) + Number(item.customerConvFee || 0);
  };

  const handleExportPDF = () => {
    try {
      // Add effective total rate column
      const exportColumns: ExportColumnDef[] = [
        ...CARD_TYPE_SETUP_COLUMNS,
        { key: "effectiveTotalRate", label: "Effective Total Rate", type: "number" },
      ];
      const exportData = filteredData.map(item => {
        const row: Record<string, any> = {};
        CARD_TYPE_SETUP_COLUMNS.forEach(col => {
          let val = getNestedValue(item, col.key);
          if (isVatAuditor && maskedColumns.includes(col.key)) val = "N/A (Audit Mode)";
          row[col.key] = val;
        });
        row.effectiveTotalRate = computeEffectiveRate(item);
        return row;
      });
      const authUser = authState.user;
      exportToPDF({
        title: "Card Type Setup",
        subtitle: `Total Records: ${filteredData.length}`,
        orientation: "landscape",
        columns: exportColumns,
        data: exportData,
        isVatAuditor,
        vatMaskedColumns: maskedColumns,
        systemNotice: "Card Fee Architecture Report — Confidential",
        company: companyProfile ? {
          name: companyProfile.name, address: companyProfile.address,
          phone: companyProfile.phone, email: companyProfile.email,
          logo: companyProfile.logo || companyProfile.brandLogo,
          vatNumber: companyProfile.vatNumber,
        } : undefined,
        financialFooter: {
          preparedBy: authUser?.displayName || "System",
          checkedBy: "", authorizedBy: "", approvedBy: "",
          printedBy: authUser?.displayName || "System",
        },
      });
      toast({ title: "PDF Exported", description: "Card Type Setup report exported with compliance footer" });
    } catch (e: any) {
      toast({ title: "Export Error", description: e.message, variant: "destructive" });
    }
  };

  const handleExportCSV = () => {
    try {
      const exportData = filteredData.map(item => {
        const row: Record<string, any> = {};
        CARD_TYPE_SETUP_COLUMNS.forEach(col => {
          let val = getNestedValue(item, col.key);
          if (isVatAuditor && maskedColumns.includes(col.key)) val = "N/A (Audit Mode)";
          row[col.key] = val;
        });
        return row;
      });
      exportToCSV({ title: "Card Type Setup", columns: CARD_TYPE_SETUP_COLUMNS, data: exportData, isVatAuditor, vatMaskedColumns: maskedColumns });
      toast({ title: "CSV Exported", description: "Card Type Setup data exported" });
    } catch (e: any) {
      toast({ title: "Export Error", description: e.message, variant: "destructive" });
    }
  };

  const handleImportCSV = () => {
    importFromCSV({ apiPath: "/api/card-type-setup", formFields: CARD_TYPE_SETUP_FIELDS }).then((result) => {
      // Post-import rate bounds warnings
      const rateErrors = (result.fieldErrors || []).filter(
        fe => fe.message.includes("must be between") || fe.message.includes("rate bounds")
      );
      if (rateErrors.length > 0) {
        toast({
          title: "Import: Rate Bounds Validation",
          description: `${rateErrors.length} row(s) had rate values outside the allowed range (0-10%)`,
          variant: "destructive",
          duration: 8000,
        });
      }
      toast({
        title: "Import Complete",
        description: `${result.imported} imported, ${result.failed} failed${result.errors.length > 0 ? ` (${result.errors.slice(0, 3).join("; ")})` : ""}`,
        variant: result.failed > 0 ? "destructive" : "default",
      });
      loadData();
    });
  };

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="border-slate-200 dark:border-slate-700">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[#2563eb]/10 flex items-center justify-center">
              <Settings className="h-5 w-5 text-[#2563eb]" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Total Setups</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{stats.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 dark:border-slate-700">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Active</p>
              <p className="text-xl font-bold text-emerald-600">{stats.active}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 dark:border-slate-700">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-slate-500/10 flex items-center justify-center">
              <X className="h-5 w-5 text-slate-500" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Inactive</p>
              <p className="text-xl font-bold text-slate-500">{stats.inactive}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 dark:border-slate-700">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Percent className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Avg Effective Rate</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{isVatAuditor ? "N/A (Audit Mode)" : `${stats.avgEffectiveRate.toFixed(2)}%`}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 dark:border-slate-700">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">High Rate (&gt;5%)</p>
              <p className="text-xl font-bold text-red-500">{isVatAuditor ? "N/A (Audit Mode)" : stats.highRateCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search card type setups..." className="pl-8" />
        </div>
        {canMutate && <Button onClick={openCreate} className="bg-[#2563eb] hover:bg-[#1d4ed8]"><Plus className="h-4 w-4 mr-1" /> Add</Button>}
        <Button variant="outline" size="sm" onClick={handleExportCSV}><Download className="h-4 w-4 mr-1" /> CSV</Button>
        <Button variant="outline" size="sm" onClick={handleExportPDF}><FileDown className="h-4 w-4 mr-1" /> PDF</Button>
        {canMutate && <Button variant="outline" size="sm" onClick={handleImportCSV}><Upload className="h-4 w-4 mr-1" /> Import</Button>}
        <Button variant="ghost" size="sm" onClick={loadData}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button>
      </div>

      {/* VAT Audit Mode Banner */}
      {isVatAuditor && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center gap-2">
          <Shield className="h-4 w-4 text-amber-600" />
          <span className="text-sm text-amber-700 dark:text-amber-400 font-medium">VAT AUDIT MODE — Financial rate columns are masked</span>
        </div>
      )}

      {/* Data Table */}
      <Card className="border-slate-200 dark:border-slate-700">
        <CardContent className="p-0">
          <div className="overflow-x-auto -mx-2 sm:mx-0">
            <Table className="min-w-[600px]">
              <TableHeader>
                <TableRow className="bg-[#132240] dark:bg-[#0a1628]">
                  <TableHead className="text-white font-semibold w-12">#</TableHead>
                  <TableHead className="text-white font-semibold">Payment Option</TableHead>
                  <TableHead className="text-white font-semibold">Card Type</TableHead>
                  <TableHead className="text-white font-semibold text-right">Charge %</TableHead>
                  <TableHead className="text-white font-semibold text-right">BSC %</TableHead>
                  <TableHead className="text-white font-semibold text-right">Conv. Fee %</TableHead>
                  <TableHead className="text-white font-semibold text-right">Effective Total Rate</TableHead>
                  <TableHead className="text-white font-semibold">Status</TableHead>
                  {canMutate && <TableHead className="text-white font-semibold w-24">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={canMutate ? 9 : 8} className="text-center py-8 text-slate-400">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                      Synchronizing Field Targets & Financial Processing Fees...
                    </TableCell>
                  </TableRow>
                ) : filteredData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canMutate ? 9 : 8} className="text-center py-8 text-slate-400">No card type setups found</TableCell>
                  </TableRow>
                ) : (
                  filteredData.map((item, idx) => {
                    const effectiveRate = computeEffectiveRate(item);
                    return (
                      <TableRow key={item.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <TableCell className="text-slate-500 text-xs">{idx + 1}</TableCell>
                        <TableCell className="font-medium text-slate-900 dark:text-white">{item.paymentOption?.name || item.paymentOptionId}</TableCell>
                        <TableCell>{item.cardType?.name || item.cardTypeId}</TableCell>
                        <TableCell className="text-right font-mono">
                          {isVatAuditor && maskedColumns.includes("chargePercentage") ? "N/A (Audit Mode)" : fmtPercent(item.chargePercentage)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {isVatAuditor && maskedColumns.includes("bankServiceCharge") ? "N/A (Audit Mode)" : fmtPercent(item.bankServiceCharge)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {isVatAuditor && maskedColumns.includes("customerConvFee") ? "N/A (Audit Mode)" : fmtPercent(item.customerConvFee)}
                        </TableCell>
                        <TableCell className="text-right">
                          {isVatAuditor ? (
                            <Badge className="bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">N/A (Audit Mode)</Badge>
                          ) : (
                            <Badge className={effectiveRate > 5
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            }>
                              {effectiveRate.toFixed(2)}%
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={item.isActive !== false
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                          }>
                            {item.isActive !== false ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        {canMutate && (
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openEdit(item)}><Edit className="h-3.5 w-3.5" /></Button>
                              <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={() => setDeleteConfirm(item.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Card Type Setup" : "Add Card Type Setup"}</DialogTitle>
            <DialogDescription>{editingItem ? "Update fee matrix configuration" : "Create a new card type fee setup"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {cardFeeError && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                <span className="text-sm text-red-700 dark:text-red-400">{cardFeeError}</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Payment Option *</Label>
                <Select value={String(formData.paymentOptionId || "")} onValueChange={(v) => setFormData(prev => ({ ...prev, paymentOptionId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select Payment Option" /></SelectTrigger>
                  <SelectContent>
                    {paymentOptions.map((po: any) => (
                      <SelectItem key={po.id} value={po.id}>{po.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Card Type *</Label>
                <Select value={String(formData.cardTypeId || "")} onValueChange={(v) => setFormData(prev => ({ ...prev, cardTypeId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select Card Type" /></SelectTrigger>
                  <SelectContent>
                    {cardTypes.map((ct: any) => (
                      <SelectItem key={ct.id} value={ct.id}>{ct.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Charge %</Label>
                <Input
                  type="number" step="0.01"
                  value={String(formData.chargePercentage ?? 0)}
                  onChange={(e) => setFormData(prev => ({ ...prev, chargePercentage: Number(e.target.value) }))}
                  className={cardFeeError && cardFeeError.includes("Charge") ? "border-red-500" : ""}
                />
              </div>
              <div className="space-y-2">
                <Label>BSC %</Label>
                <Input
                  type="number" step="0.01"
                  value={String(formData.bankServiceCharge ?? 0)}
                  onChange={(e) => setFormData(prev => ({ ...prev, bankServiceCharge: Number(e.target.value) }))}
                  className={cardFeeError && cardFeeError.includes("Bank") ? "border-red-500" : ""}
                />
              </div>
              <div className="space-y-2">
                <Label>Conv. Fee %</Label>
                <Input
                  type="number" step="0.01"
                  value={String(formData.customerConvFee ?? 0)}
                  onChange={(e) => setFormData(prev => ({ ...prev, customerConvFee: Number(e.target.value) }))}
                  className={cardFeeError && cardFeeError.includes("Conv") ? "border-red-500" : ""}
                />
              </div>
            </div>
            {/* Effective Rate Preview */}
            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 flex items-center justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-400">Effective Total Rate:</span>
              <Badge className={
                (Number(formData.chargePercentage || 0) + Number(formData.bankServiceCharge || 0) + Number(formData.customerConvFee || 0)) > 5
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
              }>
                {(Number(formData.chargePercentage || 0) + Number(formData.bankServiceCharge || 0) + Number(formData.customerConvFee || 0)).toFixed(2)}%
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={!!formData.isActive} onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))} className="h-4 w-4 rounded border-slate-300" />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {editingItem ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Confirm Deactivate</DialogTitle>
            <DialogDescription>Are you sure you want to deactivate this card type setup? It will be marked as inactive but can be restored by an admin.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>Deactivate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// MAIN OPERATIONS MODULE PAGE COMPONENT
// ============================================================

interface OperationsModulePageProps {
  activeModule: string;
}

export default function OperationsModulePage({ activeModule }: OperationsModulePageProps) {
  const auth = useAuth();
  const userRole = auth.user?.role || "sr";
  const isVatAuditor = userRole === "vat_auditor";

  // Map activeModule to the correct tab component
  const renderTab = () => {
    switch (activeModule) {
      case "sr-targets":
        return <SRTargetSetupTab userRole={userRole} isVatAuditor={isVatAuditor} />;
      case "payment-options":
        return <PaymentOptionsTab userRole={userRole} isVatAuditor={isVatAuditor} />;
      case "card-types":
        return <CardTypesTab userRole={userRole} isVatAuditor={isVatAuditor} />;
      case "card-type-setup":
        return <CardTypeSetupTab userRole={userRole} isVatAuditor={isVatAuditor} />;
      default:
        return (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Info className="h-6 w-6 mr-2" />
            <span>Unknown operations module: {activeModule}</span>
          </div>
        );
    }
  };

  // Module title mapping
  const moduleTitles: Record<string, { title: string; subtitle: string; icon: React.ElementType }> = {
    "sr-targets": { title: "SR Target Setup", subtitle: "Live Target Tracking & Performance Dashboard", icon: Target },
    "payment-options": { title: "Payment Options", subtitle: "Channel Configuration with Status Management", icon: CreditCard },
    "card-types": { title: "Card Types", subtitle: "Card Classification Management", icon: CreditCard },
    "card-type-setup": { title: "Card Type Setup", subtitle: "Fee Matrix & Effective Rate Configuration", icon: Settings },
  };

  const currentModule = moduleTitles[activeModule] || { title: "Operations", subtitle: "", icon: Settings };
  const ModuleIcon = currentModule.icon;

  return (
    <div className="space-y-6">
      {/* Module Header */}
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-xl bg-[#2563eb]/10 flex items-center justify-center">
          <ModuleIcon className="h-6 w-6 text-[#2563eb]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{currentModule.title}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{currentModule.subtitle}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline" className="text-xs text-slate-500">
            Operations Module
          </Badge>
          {isVatAuditor && (
            <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-xs">
              <Shield className="h-3 w-3 mr-1" /> VAT Audit Mode
            </Badge>
          )}
        </div>
      </div>

      <Separator />

      {/* Render the active tab */}
      {renderTab()}
    </div>
  );
}
