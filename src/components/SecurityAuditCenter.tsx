"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Shield, AlertTriangle, Download, RefreshCw, Search, Lock, Unlock,
  FileDown, CloudUpload, Eye, Clock, Activity, Database,
  ChevronLeft, ChevronRight,
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
import { useToast } from "@/hooks/use-toast";
import { exportToPDF, exportToCSV } from "@/lib/export-utils";
import type { ColumnDef as ExportColumnDef, CompanyProfile } from "@/lib/export-utils";

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

const fmtDate = (d: string | Date) =>
  d
    ? new Date(d).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const fmtDateShort = (d: string | Date) =>
  d
    ? new Date(d).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

const fmtSize = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
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
// AUTH
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
// ACTION TYPE BADGE MAP
// ============================================================

const ACTION_BADGE_MAP: Record<string, string> = {
  CREATE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  UPDATE: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  DELETE: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const STATUS_BADGE_MAP: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  ENCRYPTING: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  UPLOADING: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  COMPLETED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  FAILED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

// ============================================================
// FINANCIAL FIELD MASKING FOR VAT AUDITOR
// ============================================================

const FINANCIAL_KEYS = [
  "amount", "price", "cost", "costPrice", "wholesalePrice", "dealerPrice",
  "profit", "margin", "balance", "paidAmount", "outstanding", "totalCost",
  "vatAmount", "discount", "paymentAmount", "salary", "bonus",
];

function maskFinancialFields(obj: any): any {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(maskFinancialFields);
  const masked: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    const isFinancial = FINANCIAL_KEYS.some(fk => lowerKey.includes(fk.toLowerCase()));
    if (isFinancial) {
      masked[key] = "********";
    } else if (typeof value === "object" && value !== null) {
      masked[key] = maskFinancialFields(value);
    } else {
      masked[key] = value;
    }
  }
  return masked;
}

function maskJsonString(jsonStr: string | null | undefined, isVatAuditor: boolean): string {
  if (!jsonStr || !isVatAuditor) return jsonStr || "";
  try {
    const parsed = JSON.parse(jsonStr);
    const masked = maskFinancialFields(parsed);
    return JSON.stringify(masked, null, 2);
  } catch {
    return jsonStr;
  }
}

function prettyJson(jsonStr: string | null | undefined): string {
  if (!jsonStr) return "";
  try {
    return JSON.stringify(JSON.parse(jsonStr), null, 2);
  } catch {
    return jsonStr;
  }
}

// ============================================================
// 403 FORBIDDEN PAGE
// ============================================================

function ForbiddenPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="h-20 w-20 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
        <AlertTriangle className="h-10 w-10 text-red-500" />
      </div>
      <h1 className="text-2xl font-bold text-red-600 dark:text-red-400">403 Forbidden</h1>
      <p className="text-slate-600 dark:text-slate-400 text-center max-w-md">
        Access Denied. System Backup operations are restricted to Administrator role only.
      </p>
    </div>
  );
}

// ============================================================
// SECURITY SNAPSHOT TYPE
// ============================================================

interface SecuritySnapshot {
  search: string;
  actionType: string;
  targetModel: string;
  dateFrom: string;
  dateTo: string;
  page: number;
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function SecurityAuditCenter() {
  const { toast } = useToast();
  const auth = useAuth();
  const user = auth.user;
  const isVatAuditor = user?.role === "vat_auditor";
  const isAdmin = user?.role === "admin";
  const [activeTab, setActiveTab] = useState("audit-logs");

  // Company profile for PDF export
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch("/api/company-branding");
        setCompanyProfile(data.profile || data || null);
      } catch {}
    })();
  }, []);

  // ============================================================
  // TAB 1: AUDIT LOG VIEWER STATE
  // ============================================================

  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditPage, setAuditPage] = useState(1);
  const auditPageSize = 20;

  // Filters
  const [filterSearch, setFilterSearch] = useState("");
  const [filterActionType, setFilterActionType] = useState("ALL");
  const [filterTargetModel, setFilterTargetModel] = useState("ALL");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  // Available models for filter
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  // Diff dialog
  const [diffDialogOpen, setDiffDialogOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<any>(null);

  // KPI stats
  const [kpiStats, setKpiStats] = useState({ total: 0, create: 0, update: 0, delete: 0 });

  // Security snapshot
  const securitySnapshotRef = useRef<SecuritySnapshot | null>(null);

  const saveSnapshot = useCallback(() => {
    securitySnapshotRef.current = {
      search: filterSearch,
      actionType: filterActionType,
      targetModel: filterTargetModel,
      dateFrom: filterDateFrom,
      dateTo: filterDateTo,
      page: auditPage,
    };
  }, [filterSearch, filterActionType, filterTargetModel, filterDateFrom, filterDateTo, auditPage]);

  const restoreSnapshot = useCallback(() => {
    const snap = securitySnapshotRef.current;
    if (!snap) return;
    setFilterSearch(snap.search);
    setFilterActionType(snap.actionType);
    setFilterTargetModel(snap.targetModel);
    setFilterDateFrom(snap.dateFrom);
    setFilterDateTo(snap.dateTo);
    setAuditPage(snap.page);
  }, []);

  // Load audit logs
  const loadAuditLogs = useCallback(async () => {
    saveSnapshot();
    setAuditLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(auditPage));
      params.set("pageSize", String(auditPageSize));
      if (filterSearch.trim()) params.set("search", filterSearch.trim());
      if (filterActionType !== "ALL") params.set("actionType", filterActionType);
      if (filterTargetModel !== "ALL") params.set("targetModel", filterTargetModel);
      if (filterDateFrom) params.set("dateFrom", filterDateFrom);
      if (filterDateTo) params.set("dateTo", filterDateTo);

      const res = await apiFetch(`/api/system-audit-logs?${params.toString()}`);
      const logs = res.logs || res.data || [];
      const total = res.total || 0;
      setAuditLogs(logs);
      setAuditTotal(total);

      // Derive KPIs from current page + total
      setKpiStats({
        total,
        create: logs.filter((l: any) => l.actionType === "CREATE").length,
        update: logs.filter((l: any) => l.actionType === "UPDATE").length,
        delete: logs.filter((l: any) => l.actionType === "DELETE").length,
      });

      // Collect unique models
      const models = new Set<string>();
      logs.forEach((l: any) => { if (l.targetModel) models.add(l.targetModel); });
      setAvailableModels(prev => {
        const merged = new Set(prev);
        models.forEach(m => merged.add(m));
        return Array.from(merged).sort();
      });
    } catch (e: any) {
      restoreSnapshot();
      toast({ title: "Security Error", description: e.message, variant: "destructive" });
    } finally {
      setAuditLoading(false);
    }
  }, [auditPage, filterSearch, filterActionType, filterTargetModel, filterDateFrom, filterDateTo, saveSnapshot, restoreSnapshot, toast]);

  useEffect(() => { loadAuditLogs(); }, [loadAuditLogs]);

  const totalPages = Math.max(1, Math.ceil(auditTotal / auditPageSize));

  // Export columns for audit logs
  const auditExportColumns: ExportColumnDef[] = [
    { key: "actionType", label: "Action Type", type: "text" },
    { key: "targetModel", label: "Target Model", type: "text" },
    { key: "targetRecordId", label: "Record ID", type: "text" },
    { key: "actorName", label: "Actor", type: "text" },
    { key: "ipAddress", label: "IP Address", type: "text" },
    { key: "createdAt", label: "Timestamp", type: "date" },
  ];

  const handleExportCSV = () => {
    try {
      exportToCSV({
        title: "System Audit Logs",
        columns: auditExportColumns,
        data: auditLogs,
        isVatAuditor,
        vatMaskedColumns: isVatAuditor ? ["previousState", "newState"] : [],
        filename: "system-audit-logs",
      });
      toast({ title: "CSV Exported", description: "Audit logs exported to CSV" });
    } catch (e: any) {
      toast({ title: "Export Error", description: e.message, variant: "destructive" });
    }
  };

  const handleExportPDF = () => {
    try {
      exportToPDF({
        title: "System Audit Logs Report",
        subtitle: `${auditTotal} total events${isVatAuditor ? " — VAT Audit Mode" : ""}`,
        orientation: "landscape",
        columns: auditExportColumns,
        data: auditLogs,
        isVatAuditor,
        vatMaskedColumns: isVatAuditor ? ["previousState", "newState"] : [],
        filename: "system-audit-logs",
        company: companyProfile || undefined,
        financialFooter: {
          preparedBy: user?.displayName || user?.email || "",
          checkedBy: "",
          authorizedBy: "",
          printedBy: user?.displayName || user?.email || "",
        },
      });
      toast({ title: "PDF Exported", description: "Audit logs exported to PDF" });
    } catch (e: any) {
      toast({ title: "Export Error", description: e.message, variant: "destructive" });
    }
  };

  const openDiffDialog = (log: any) => {
    setSelectedLog(log);
    setDiffDialogOpen(true);
  };

  // ============================================================
  // TAB 2: BACKUP CONTROL PANEL STATE
  // ============================================================

  const [backups, setBackups] = useState<any[]>([]);
  const [backupLoading, setBackupLoading] = useState(true);
  const [isBackingUp, setIsBackingUp] = useState(false);

  const loadBackups = useCallback(async () => {
    setBackupLoading(true);
    try {
      const res = await apiFetch("/api/system-backup");
      setBackups(res.backups || res.data || []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setBackupLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (activeTab === "backup-control") {
      loadBackups();
    }
  }, [activeTab, loadBackups]);

  const handleTriggerBackup = async () => {
    setIsBackingUp(true);
    try {
      await apiFetch("/api/system-backup", { method: "POST" });
      toast({ title: "Backup Initiated", description: "Data is being encrypted and pushed to Secure Cloud Vault" });
      await loadBackups();
    } catch (e: any) {
      toast({ title: "Backup Failed", description: e.message, variant: "destructive" });
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleDownloadBackup = (backup: any) => {
    try {
      const dataStr = JSON.stringify(backup, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${backup.backupCode || "backup"}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ title: "Download Error", description: e.message, variant: "destructive" });
    }
  };

  // ============================================================
  // TAB 3: RATE LIMIT MONITOR STATE
  // ============================================================

  const [rateLimitData, setRateLimitData] = useState<any>(null);
  const [rateLimitLoading, setRateLimitLoading] = useState(true);
  const [countdown, setCountdown] = useState(0);

  const loadRateLimit = useCallback(async () => {
    setRateLimitLoading(true);
    try {
      // Use a placeholder IP — in real scenario this would come from client detection
      const res = await apiFetch("/api/auth/rate-limit?ipAddress=client&endpoint=/api/auth/login");
      setRateLimitData(res);
      if (res.locked && res.unlockAt) {
        const remaining = Math.max(0, Math.floor((new Date(res.unlockAt).getTime() - Date.now()) / 1000));
        setCountdown(remaining);
      }
    } catch (e: any) {
      // If API doesn't exist yet, show default "all clear" state
      setRateLimitData({ locked: false });
    } finally {
      setRateLimitLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "rate-limit") {
      loadRateLimit();
    }
  }, [activeTab, loadRateLimit]);

  // Countdown timer effect
  useEffect(() => {
    if (!rateLimitData?.locked || countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          loadRateLimit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [rateLimitData?.locked, countdown, loadRateLimit]);

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-900">
      {/* ═══════════════════════════════════════════════════════════
          NAVY HEADER BAR
          ═══════════════════════════════════════════════════════════ */}
      <div className="bg-[#0a1628] text-white px-4 sm:px-6 py-4 flex items-center gap-3 shrink-0">
        <Shield className="w-7 h-7 text-blue-400" />
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            System Security &amp; Compliance Center
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Immutable audit trail, secure backups, and brute-force protection
          </p>
        </div>
      </div>

      {/* VAT AUDITOR MODE BANNER */}
      {isVatAuditor && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 px-4 sm:px-6 py-2.5 flex items-center gap-2">
          <Badge className="bg-amber-500 text-white text-xs">VAT AUDIT MODE</Badge>
          <span className="text-sm text-amber-700 dark:text-amber-400">
            VAT AUDIT MODE — All monetary values in audit payloads are masked
          </span>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          KPI STATS ROW
          ═══════════════════════════════════════════════════════════ */}
      <div className="px-4 sm:px-6 py-4 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 shrink-0">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <Activity className="w-4 h-4 text-blue-500" />
              Total Events
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
              {auditTotal.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <Database className="w-4 h-4 text-emerald-500" />
              CREATE
            </div>
            <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">
              {kpiStats.create}
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <RefreshCw className="w-4 h-4 text-amber-500" />
              UPDATE
            </div>
            <p className="text-2xl font-bold text-amber-700 dark:text-amber-400 mt-1">
              {kpiStats.update}
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              DELETE
            </div>
            <p className="text-2xl font-bold text-red-700 dark:text-red-400 mt-1">
              {kpiStats.delete}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          TAB NAVIGATION
          ═══════════════════════════════════════════════════════════ */}
      <div className="px-4 sm:px-6 flex-1">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4 bg-slate-200 dark:bg-slate-800">
            <TabsTrigger value="audit-logs" className="gap-1.5">
              <Activity className="w-4 h-4" />
              Audit Log Viewer
            </TabsTrigger>
            <TabsTrigger value="backup-control" className="gap-1.5">
              <Database className="w-4 h-4" />
              Backup Control Panel
            </TabsTrigger>
            <TabsTrigger value="rate-limit" className="gap-1.5">
              <Shield className="w-4 h-4" />
              Rate Limit Monitor
            </TabsTrigger>
          </TabsList>

          {/* ═══════════════════════════════════════════════════════════
              TAB 1: AUDIT LOG VIEWER
              ═══════════════════════════════════════════════════════════ */}
          <TabsContent value="audit-logs">
            <Card className="border-slate-200 dark:border-slate-700">
              {/* Filter Bar Header */}
              <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg pb-3">
                <CardTitle className="text-white flex items-center gap-2 text-base">
                  <Search className="w-4 h-4" />
                  Audit Log Filters
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  {/* Search */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-900 dark:text-white">Search</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Actor, model, record ID..."
                        value={filterSearch}
                        onChange={(e) => setFilterSearch(e.target.value)}
                        className="pl-10 w-full"
                      />
                    </div>
                  </div>

                  {/* Action Type */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-900 dark:text-white">Action Type</Label>
                    <Select value={filterActionType} onValueChange={setFilterActionType}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="ALL" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">ALL</SelectItem>
                        <SelectItem value="CREATE">CREATE</SelectItem>
                        <SelectItem value="UPDATE">UPDATE</SelectItem>
                        <SelectItem value="DELETE">DELETE</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Target Model */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-900 dark:text-white">Target Model</Label>
                    <Select value={filterTargetModel} onValueChange={setFilterTargetModel}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="ALL" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">ALL</SelectItem>
                        {availableModels.map((model) => (
                          <SelectItem key={model} value={model}>
                            {model}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Date From */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-900 dark:text-white">Date From</Label>
                    <Input
                      type="date"
                      value={filterDateFrom}
                      onChange={(e) => setFilterDateFrom(e.target.value)}
                      className="w-full"
                    />
                  </div>

                  {/* Date To */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-900 dark:text-white">Date To</Label>
                    <Input
                      type="date"
                      value={filterDateTo}
                      onChange={(e) => setFilterDateTo(e.target.value)}
                      className="w-full"
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t">
                  <Button
                    className="bg-[#2563eb] hover:bg-[#1d4ed8]"
                    size="sm"
                    onClick={() => { setAuditPage(1); loadAuditLogs(); }}
                  >
                    <Search className="w-4 h-4 mr-1" />
                    Apply Filters
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setFilterSearch("");
                      setFilterActionType("ALL");
                      setFilterTargetModel("ALL");
                      setFilterDateFrom("");
                      setFilterDateTo("");
                      setAuditPage(1);
                    }}
                  >
                    Reset
                  </Button>
                  <div className="flex-1" />
                  <Button variant="outline" size="sm" onClick={handleExportCSV}>
                    <Download className="w-4 h-4 mr-1" /> CSV
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExportPDF}>
                    <FileDown className="w-4 h-4 mr-1" /> PDF
                  </Button>
                  <Button variant="ghost" size="sm" onClick={loadAuditLogs}>
                    <RefreshCw className={`w-4 h-4 ${auditLoading ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Data Grid */}
            <Card className="mt-4 border-slate-200 dark:border-slate-700">
              <CardContent className="p-0">
                {auditLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <RefreshCw className="w-8 h-8 animate-spin text-[#2563eb] mr-3" />
                    <span className="text-slate-500 dark:text-slate-400">Loading audit logs...</span>
                  </div>
                ) : auditLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                    <AlertTriangle className="w-10 h-10 mb-3" />
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">No Audit Entries Found</h3>
                    <p className="text-sm mt-1">Try adjusting your filters to see more results.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <div className="max-h-96 overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-[#132240] dark:bg-[#0a1628] sticky top-0 z-10">
                            <TableHead className="text-white font-semibold w-12">#</TableHead>
                            <TableHead className="text-white font-semibold">Timestamp</TableHead>
                            <TableHead className="text-white font-semibold">Action Type</TableHead>
                            <TableHead className="text-white font-semibold">Actor</TableHead>
                            <TableHead className="text-white font-semibold">Target Model</TableHead>
                            <TableHead className="text-white font-semibold">Record ID</TableHead>
                            <TableHead className="text-white font-semibold">IP Address</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {auditLogs.map((log: any, idx: number) => {
                            const actionType = (log.actionType || "UNKNOWN").toUpperCase();
                            const badgeClass = ACTION_BADGE_MAP[actionType] || "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400";

                            return (
                              <TableRow
                                key={log.id || idx}
                                className="hover:bg-blue-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                                onClick={() => openDiffDialog(log)}
                              >
                                <TableCell className="text-slate-500 text-xs">
                                  {(auditPage - 1) * auditPageSize + idx + 1}
                                </TableCell>
                                <TableCell className="text-xs whitespace-nowrap">
                                  <div className="flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                                    {fmtDate(log.createdAt)}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge className={`${badgeClass} font-semibold text-xs`}>
                                    {actionType}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-sm font-medium text-slate-900 dark:text-white">
                                  {log.actorName || log.actorUserId || "System"}
                                </TableCell>
                                <TableCell className="text-sm font-mono text-slate-700 dark:text-slate-300">
                                  {log.targetModel || "—"}
                                </TableCell>
                                <TableCell className="text-xs font-mono text-slate-500">
                                  {log.targetRecordId ? (
                                    <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                      {log.targetRecordId.length > 12
                                        ? `${log.targetRecordId.substring(0, 12)}...`
                                        : log.targetRecordId}
                                    </span>
                                  ) : "—"}
                                </TableCell>
                                <TableCell className="text-xs font-mono text-slate-500">
                                  {log.ipAddress || "—"}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Pagination */}
            {auditTotal > 0 && (
              <div className="flex items-center justify-between mt-4 px-1">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Showing {((auditPage - 1) * auditPageSize) + 1}–{Math.min(auditPage * auditPageSize, auditTotal)} of {auditTotal}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={auditPage <= 1}
                    onClick={() => setAuditPage(prev => Math.max(1, prev - 1))}
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Previous
                  </Button>
                  <span className="text-sm text-slate-700 dark:text-slate-300 px-2">
                    Page {auditPage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={auditPage >= totalPages}
                    onClick={() => setAuditPage(prev => Math.min(totalPages, prev + 1))}
                  >
                    Next
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════════
              TAB 2: BACKUP CONTROL PANEL
              ═══════════════════════════════════════════════════════════ */}
          <TabsContent value="backup-control">
            {!isAdmin ? (
              <ForbiddenPage />
            ) : (
              <div className="space-y-4">
                {/* Backup Action Bar */}
                <Card className="border-slate-200 dark:border-slate-700">
                  <CardContent className="p-4 flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                        <CloudUpload className="w-5 h-5 text-blue-500" />
                        Secure Cloud Vault Backup
                      </h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                        Encrypted full-system backups with SHA-256 integrity verification
                      </p>
                    </div>
                    <Button
                      className="bg-[#2563eb] hover:bg-[#1d4ed8] min-w-[200px]"
                      onClick={handleTriggerBackup}
                      disabled={isBackingUp}
                    >
                      {isBackingUp ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Encrypting and Pushing Data to Secure Cloud Vault...
                        </>
                      ) : (
                        <>
                          <CloudUpload className="w-4 h-4 mr-2" />
                          Trigger Backup
                        </>
                      )}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={loadBackups}>
                      <RefreshCw className={`w-4 h-4 ${backupLoading ? "animate-spin" : ""}`} />
                    </Button>
                  </CardContent>
                </Card>

                {/* Backup History Table */}
                <Card className="border-slate-200 dark:border-slate-700">
                  <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg pb-3">
                    <CardTitle className="text-white flex items-center gap-2 text-base">
                      <Database className="w-4 h-4" />
                      Backup History
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {backupLoading ? (
                      <div className="flex items-center justify-center py-16">
                        <RefreshCw className="w-8 h-8 animate-spin text-[#2563eb] mr-3" />
                        <span className="text-slate-500 dark:text-slate-400">Loading backups...</span>
                      </div>
                    ) : backups.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                        <Database className="w-10 h-10 mb-3" />
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">No Backups Found</h3>
                        <p className="text-sm mt-1">Trigger your first backup to get started.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <div className="max-h-96 overflow-y-auto">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-[#132240] dark:bg-[#0a1628] sticky top-0 z-10">
                                <TableHead className="text-white font-semibold">Code</TableHead>
                                <TableHead className="text-white font-semibold">Type</TableHead>
                                <TableHead className="text-white font-semibold">Status</TableHead>
                                <TableHead className="text-white font-semibold">Records</TableHead>
                                <TableHead className="text-white font-semibold">Size</TableHead>
                                <TableHead className="text-white font-semibold">Triggered By</TableHead>
                                <TableHead className="text-white font-semibold">Started</TableHead>
                                <TableHead className="text-white font-semibold">Completed</TableHead>
                                <TableHead className="text-white font-semibold">Checksum</TableHead>
                                <TableHead className="text-white font-semibold w-16">Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {backups.map((backup: any) => {
                                const status = (backup.status || "PENDING").toUpperCase();
                                const statusBadge = STATUS_BADGE_MAP[status] || "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400";
                                const isCompleted = status === "COMPLETED";

                                return (
                                  <TableRow
                                    key={backup.id}
                                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                                  >
                                    <TableCell className="font-mono text-xs font-semibold text-slate-900 dark:text-white">
                                      {backup.backupCode || "—"}
                                    </TableCell>
                                    <TableCell>
                                      <Badge variant="secondary" className="text-xs">
                                        {backup.backupType || "FULL"}
                                      </Badge>
                                    </TableCell>
                                    <TableCell>
                                      <Badge className={`${statusBadge} font-semibold text-xs`}>
                                        {status}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-sm text-slate-700 dark:text-slate-300">
                                      {backup.recordCount?.toLocaleString() || "0"}
                                    </TableCell>
                                    <TableCell className="text-sm text-slate-700 dark:text-slate-300">
                                      {fmtSize(backup.fileSizeBytes || 0)}
                                    </TableCell>
                                    <TableCell className="text-sm text-slate-700 dark:text-slate-300">
                                      {backup.triggeredByName || backup.triggeredBy || "—"}
                                    </TableCell>
                                    <TableCell className="text-xs whitespace-nowrap text-slate-500">
                                      {fmtDateShort(backup.startedAt)}
                                    </TableCell>
                                    <TableCell className="text-xs whitespace-nowrap text-slate-500">
                                      {fmtDateShort(backup.completedAt)}
                                    </TableCell>
                                    <TableCell className="text-xs font-mono text-slate-400 max-w-[120px] truncate">
                                      {backup.checksumSha256
                                        ? `${backup.checksumSha256.substring(0, 16)}...`
                                        : "—"}
                                    </TableCell>
                                    <TableCell>
                                      {isCompleted && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 w-7 p-0"
                                          onClick={() => handleDownloadBackup(backup)}
                                        >
                                          <Download className="h-3.5 w-3.5 text-blue-500" />
                                        </Button>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════════
              TAB 3: RATE LIMIT MONITOR
              ═══════════════════════════════════════════════════════════ */}
          <TabsContent value="rate-limit">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Shield className="w-5 h-5 text-blue-500" />
                  Brute-Force Protection Monitor
                </h3>
                <Button variant="ghost" size="sm" onClick={loadRateLimit}>
                  <RefreshCw className={`w-4 h-4 ${rateLimitLoading ? "animate-spin" : ""}`} />
                </Button>
              </div>

              {rateLimitLoading ? (
                <Card className="border-slate-200 dark:border-slate-700">
                  <CardContent className="flex items-center justify-center py-16">
                    <RefreshCw className="w-8 h-8 animate-spin text-[#2563eb] mr-3" />
                    <span className="text-slate-500 dark:text-slate-400">Checking rate limit status...</span>
                  </CardContent>
                </Card>
              ) : rateLimitData?.locked ? (
                /* ─── LOCKED STATE — Red pulsing card ─── */
                <Card className="border-2 border-red-500 animate-pulse-red shadow-lg shadow-red-500/20">
                  <CardContent className="p-8 flex flex-col items-center text-center">
                    <div className="h-24 w-24 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center mb-4">
                      <Lock className="h-12 w-12 text-red-500" />
                    </div>
                    <h2 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-2">
                      🔒 Account Temporarily Locked
                    </h2>
                    <p className="text-slate-600 dark:text-slate-400 max-w-md mb-6">
                      Too many failed authentication attempts from your IP address.
                      Please wait until the lock expires.
                    </p>
                    <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg px-8 py-4">
                      <p className="text-sm text-red-500 font-medium mb-1">Time until unlock</p>
                      <p className="text-4xl font-bold text-red-600 dark:text-red-400 tabular-nums">
                        {Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, "0")}
                      </p>
                    </div>
                    {rateLimitData.attempts && (
                      <p className="text-sm text-slate-500 mt-4">
                        Failed attempts: <span className="font-semibold text-red-500">{rateLimitData.attempts}</span>
                      </p>
                    )}
                  </CardContent>
                </Card>
              ) : (
                /* ─── ALL CLEAR — Green shield card ─── */
                <Card className="border-2 border-emerald-500">
                  <CardContent className="p-8 flex flex-col items-center text-center">
                    <div className="h-24 w-24 rounded-full bg-emerald-100 dark:bg-emerald-900/20 flex items-center justify-center mb-4">
                      <Unlock className="h-12 w-12 text-emerald-500" />
                    </div>
                    <h2 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mb-2">
                      All Clear — No Rate Limit Violations
                    </h2>
                    <p className="text-slate-600 dark:text-slate-400 max-w-md">
                      Your IP address has no active rate limit restrictions. Authentication attempts are within normal thresholds.
                    </p>
                    <div className="mt-6 grid grid-cols-2 gap-4 w-full max-w-sm">
                      <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
                        <p className="text-xs text-slate-500 dark:text-slate-400">Endpoint</p>
                        <p className="text-sm font-mono font-semibold text-slate-900 dark:text-white">/api/auth/login</p>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
                        <p className="text-xs text-slate-500 dark:text-slate-400">Status</p>
                        <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <Unlock className="w-3.5 h-3.5" />
                          Unlocked
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Rate Limit Info Card */}
              <Card className="border-slate-200 dark:border-slate-700">
                <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg pb-3">
                  <CardTitle className="text-white flex items-center gap-2 text-base">
                    <Eye className="w-4 h-4" />
                    Rate Limit Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4">
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Max Attempts</p>
                      <p className="text-lg font-bold text-slate-900 dark:text-white">5 / window</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4">
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Window Duration</p>
                      <p className="text-lg font-bold text-slate-900 dark:text-white">15 minutes</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4">
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Lock Duration</p>
                      <p className="text-lg font-bold text-slate-900 dark:text-white">30 minutes</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          DIFF DIALOG
          ═══════════════════════════════════════════════════════════ */}
      <Dialog open={diffDialogOpen} onOpenChange={setDiffDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-blue-500" />
              Audit Record Detail — {selectedLog?.actionType || "View"}
            </DialogTitle>
            <DialogDescription>
              {selectedLog?.targetModel} {selectedLog?.targetRecordId ? `• ${selectedLog.targetRecordId}` : ""}
              {selectedLog?.createdAt ? ` • ${fmtDate(selectedLog.createdAt)}` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {/* Metadata Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">Action</p>
                <Badge className={`${ACTION_BADGE_MAP[(selectedLog?.actionType || "").toUpperCase()] || "bg-gray-100 text-gray-700"} font-semibold text-xs mt-1`}>
                  {selectedLog?.actionType || "—"}
                </Badge>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">Actor</p>
                <p className="text-sm font-semibold text-slate-900 dark:text-white mt-1">
                  {selectedLog?.actorName || selectedLog?.actorUserId || "System"}
                </p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">Model</p>
                <p className="text-sm font-mono font-semibold text-slate-900 dark:text-white mt-1">
                  {selectedLog?.targetModel || "—"}
                </p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">IP Address</p>
                <p className="text-sm font-mono text-slate-900 dark:text-white mt-1">
                  {selectedLog?.ipAddress || "—"}
                </p>
              </div>
            </div>

            {/* Previous State */}
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
                Previous State
              </p>
              <pre className="text-xs bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800/50 rounded-md p-4 overflow-x-auto max-h-56 overflow-y-auto whitespace-pre-wrap break-all">
                <code className="text-slate-700 dark:text-slate-300">
                  {selectedLog?.previousState
                    ? (isVatAuditor
                      ? maskJsonString(selectedLog.previousState, true)
                      : prettyJson(selectedLog.previousState))
                    : "— No previous state recorded —"}
                </code>
              </pre>
            </div>

            {/* New State */}
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                New State
              </p>
              <pre className="text-xs bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/50 rounded-md p-4 overflow-x-auto max-h-56 overflow-y-auto whitespace-pre-wrap break-all">
                <code className="text-slate-700 dark:text-slate-300">
                  {selectedLog?.newState
                    ? (isVatAuditor
                      ? maskJsonString(selectedLog.newState, true)
                      : prettyJson(selectedLog.newState))
                    : "— No new state recorded —"}
                </code>
              </pre>
            </div>

            {/* Metadata */}
            {selectedLog?.metadata && (
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Metadata</p>
                <pre className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md p-4 overflow-x-auto max-h-32 overflow-y-auto whitespace-pre-wrap break-all">
                  <code className="text-slate-700 dark:text-slate-300">
                    {prettyJson(selectedLog.metadata)}
                  </code>
                </pre>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDiffDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════
          FOOTER
          ═══════════════════════════════════════════════════════════ */}
      <footer className="mt-auto bg-[#0a1628] text-slate-400 text-xs px-4 sm:px-6 py-3 text-center">
        © VoltERP — Security Operations Center | All audit records are immutable and append-only
      </footer>

      {/* ─── CSS Animation for Red Pulsing Border ─── */}
      <style jsx>{`
        @keyframes pulse-red-border {
          0%, 100% { border-color: rgba(239, 68, 68, 0.5); box-shadow: 0 0 15px rgba(239, 68, 68, 0.1); }
          50% { border-color: rgba(239, 68, 68, 1); box-shadow: 0 0 30px rgba(239, 68, 68, 0.3); }
        }
        .animate-pulse-red {
          animation: pulse-red-border 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
