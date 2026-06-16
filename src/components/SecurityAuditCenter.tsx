"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Shield, AlertTriangle, Download, RefreshCw, Search, Lock, Unlock,
  FileDown, CloudUpload, Upload, Eye, Clock, Activity, Database,
  ChevronLeft, ChevronRight, ShieldAlert, ShieldCheck, Fingerprint,
  Zap, Bug, KeyRound, FileText, CheckCircle2, XCircle, Info,
  AlertOctagon
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
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { exportToPDF, exportToCSV, importFromCSV } from "@/lib/export-utils";
import type { ColumnDef as ExportColumnDef, CompanyProfile } from "@/lib/export-utils";

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

const fmtDate = (d: string | Date) => {
    if (!d) return "—";
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
  };

const fmtDateShort = (d: string | Date) => {
    if (!d) return "—";
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
  };

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
      if (parsed.accessToken) authHeaders["Authorization"] = `Bearer ${parsed.accessToken}`;
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
// BADGE MAPS
// ============================================================

const ACTION_BADGE_MAP: Record<string, string> = {
  CREATE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  UPDATE: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  DELETE: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  LOGIN: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  LOGOUT: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
  EXPORT: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  SECURITY_OVERRIDE: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  LEDGER_VERIFY: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  RATE_LIMIT_TRIGGERED: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
};

const SEVERITY_BADGE_MAP: Record<string, string> = {
  INFO: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  WARNING: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  CRITICAL: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const THREAT_TYPE_MAP: Record<string, { label: string; color: string; icon: string }> = {
  XSS_SCRIPT_TAG: { label: "XSS Attack", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400", icon: "bug" },
  SQL_INJECTION: { label: "SQL Injection", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: "database" },
  PAYLOAD_TAMPERING: { label: "Payload Tampering", color: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400", icon: "shield-alert" },
  RATE_LIMIT_BREACH: { label: "Rate Limit Breach", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", icon: "zap" },
  UNAUTHORIZED_ACCESS: { label: "Unauthorized Access", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400", icon: "lock" },
};

const STATUS_BADGE_MAP: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  ENCRYPTING: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  UPLOADING: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  COMPLETED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  FAILED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

// ============================================================
// SECURITY SNAPSHOT TYPE — for DB fetch timeout recovery
// ============================================================

interface SecuritySnapshot {
  activeTab: string;
  search: string;
  actionType: string;
  targetModel: string;
  severity: string;
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
  const [activeTab, setActiveTab] = useState("forensic-audit");

  // Company profile for PDF export
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch("/api/company-branding");
        setCompanyProfile(data.company || data.profile || null);
      } catch {}
    })();
  }, []);

  // Security snapshot ref for rollback
  const securitySnapshotRef = useRef<SecuritySnapshot | null>(null);

  // ============================================================
  // TAB 1: FORENSIC AUDIT TRAIL STATE
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
  const [filterSeverity, setFilterSeverity] = useState("ALL");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  // Available models for filter
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  // Diff dialog
  const [diffDialogOpen, setDiffDialogOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<any>(null);

  // KPI stats
  const [kpiStats, setKpiStats] = useState({ total: 0, critical: 0, warnings: 0, info: 0 });

  const saveSnapshot = useCallback(() => {
    securitySnapshotRef.current = {
      activeTab,
      search: filterSearch,
      actionType: filterActionType,
      targetModel: filterTargetModel,
      severity: filterSeverity,
      dateFrom: filterDateFrom,
      dateTo: filterDateTo,
      page: auditPage,
    };
  }, [activeTab, filterSearch, filterActionType, filterTargetModel, filterSeverity, filterDateFrom, filterDateTo, auditPage]);

  const restoreSnapshot = useCallback(() => {
    const snap = securitySnapshotRef.current;
    if (!snap) return;
    setFilterSearch(snap.search);
    setFilterActionType(snap.actionType);
    setFilterTargetModel(snap.targetModel);
    setFilterSeverity(snap.severity);
    setFilterDateFrom(snap.dateFrom);
    setFilterDateTo(snap.dateTo);
    setAuditPage(snap.page);
  }, []);

  // Load forensic audit logs
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
      if (filterSeverity !== "ALL") params.set("severity", filterSeverity);
      if (filterDateFrom) params.set("dateFrom", filterDateFrom);
      if (filterDateTo) params.set("dateTo", filterDateTo);

      const res = await apiFetch(`/api/security/audit-trail?${params.toString()}`);
      const logs = res.logs || [];
      const total = res.total || 0;
      setAuditLogs(logs);
      setAuditTotal(total);

      // Derive KPIs
      const critical = logs.filter((l: any) => l.severity === "CRITICAL").length;
      const warnings = logs.filter((l: any) => l.severity === "WARNING").length;
      const info = logs.filter((l: any) => l.severity === "INFO").length;
      setKpiStats({ total, critical, warnings, info });

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
  }, [auditPage, filterSearch, filterActionType, filterTargetModel, filterSeverity, filterDateFrom, filterDateTo, saveSnapshot, restoreSnapshot, toast]);

  useEffect(() => { loadAuditLogs(); }, [loadAuditLogs]);

  const totalPages = Math.max(1, Math.ceil(auditTotal / auditPageSize));

  // ============================================================
  // TAB 2: LEDGER VERIFICATION STATE
  // ============================================================

  const [ledgerStatus, setLedgerStatus] = useState<any>(null);
  const [ledgerStatusLoading, setLedgerStatusLoading] = useState(true);
  const [isVerifyingLedger, setIsVerifyingLedger] = useState(false);
  const [verificationResult, setVerificationResult] = useState<any>(null);

  const loadLedgerStatus = useCallback(async () => {
    setLedgerStatusLoading(true);
    try {
      const res = await apiFetch("/api/security/ledger-verify");
      setLedgerStatus(res);
    } catch (e: any) {
      setLedgerStatus({ chainIntact: false, totalChainEntries: 0, tamperedEntries: 0 });
    } finally {
      setLedgerStatusLoading(false);
    }
  }, []);

  useEffect(() => { loadLedgerStatus(); }, [loadLedgerStatus]);

  const handleRunLedgerVerification = async () => {
    setIsVerifyingLedger(true);
    setVerificationResult(null);
    try {
      const res = await apiFetch("/api/security/ledger-verify", {
        method: "POST",
        body: JSON.stringify({ limit: 1000 }),
      });
      setVerificationResult(res);
      await loadLedgerStatus();
      toast({
        title: res.chainIntact ? "Chain Intact" : "Tampering Detected",
        description: res.message,
        variant: res.chainIntact ? "default" : "destructive",
      });
    } catch (e: any) {
      toast({ title: "Verification Failed", description: e.message, variant: "destructive" });
    } finally {
      setIsVerifyingLedger(false);
    }
  };

  // ============================================================
  // TAB 3: THREAT LOG STATE
  // ============================================================

  const [threats, setThreats] = useState<any[]>([]);
  const [threatTotal, setThreatTotal] = useState(0);
  const [threatLoading, setThreatLoading] = useState(true);
  const [threatPage, setThreatPage] = useState(1);
  const threatPageSize = 20;
  const [threatStats, setThreatStats] = useState<any>(null);
  const [threatFilter, setThreatFilter] = useState("ALL");

  const loadThreats = useCallback(async () => {
    setThreatLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(threatPage));
      params.set("pageSize", String(threatPageSize));
      if (threatFilter !== "ALL") params.set("threatType", threatFilter);
      const res = await apiFetch(`/api/security/threats?${params.toString()}`);
      setThreats(res.threats || []);
      setThreatTotal(res.total || 0);
      setThreatStats(res.stats || null);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setThreatLoading(false);
    }
  }, [threatPage, threatFilter, toast]);

  useEffect(() => { loadThreats(); }, [loadThreats]);

  const threatTotalPages = Math.max(1, Math.ceil(threatTotal / threatPageSize));

  // ============================================================
  // TAB 4: RATE LIMIT THROTTLE STATE
  // ============================================================

  const [rateLimitData, setRateLimitData] = useState<any>(null);
  const [rateLimitLoading, setRateLimitLoading] = useState(true);
  const [countdown, setCountdown] = useState(0);

  const loadRateLimit = useCallback(async () => {
    setRateLimitLoading(true);
    try {
      const res = await apiFetch("/api/security/throttle");
      setRateLimitData(res);
    } catch (e: any) {
      setRateLimitData({ stats: { totalIdentities: 0, blockedIdentities: 0, topConsumers: [] } });
    } finally {
      setRateLimitLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "rate-throttle") {
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
  // TAB 5: BACKUP CONTROL STATE
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
    if (activeTab === "backup-vault") {
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
  // TAB 6: COMPLIANCE PDF REPORT
  // ============================================================

  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  const handleGenerateSecurityPDF = async () => {
    setIsGeneratingReport(true);
    try {
      const reportData = await apiFetch("/api/security/audit-report");

      // Build PDF using exportToPDF
      const columns: ExportColumnDef[] = [
        { key: "actionType", label: "Action", type: "text" },
        { key: "targetModel", label: "Target Model", type: "text" },
        { key: "userName", label: "Actor", type: "text" },
        { key: "ipAddress", label: "IP Address", type: "text" },
        { key: "httpMethod", label: "Method", type: "text" },
        { key: "endpoint", label: "Endpoint", type: "text" },
        { key: "severity", label: "Severity", type: "text" },
        { key: "createdAt", label: "Timestamp", type: "date" },
      ];

      exportToPDF({
        title: "Enterprise Security Compliance Audited Statement",
        subtitle: `Generated: ${new Date().toLocaleDateString("en-GB")} | Total Events: ${reportData.summary.totalAuditEntries} | Critical: ${reportData.summary.criticalEvents} | Threats: ${reportData.summary.totalThreats}${reportData.summary.chainIntact ? " | Ledger Chain: INTACT" : " | ⚠ LEDGER TAMPERING DETECTED"}`,
        orientation: "landscape",
        columns,
        data: reportData.recentAudits || [],
        filename: "enterprise-security-compliance-audit",
        company: companyProfile || undefined,
        financialFooter: {
          preparedBy: user?.displayName || "System",
          checkedBy: "",
          authorizedBy: "",
          printedBy: user?.displayName || "System",
        },
      });

      toast({ title: "PDF Generated", description: "Enterprise Security Compliance Audited Statement exported" });
    } catch (e: any) {
      toast({ title: "PDF Error", description: e.message, variant: "destructive" });
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleExportCSV = () => {
    try {
      const columns: ExportColumnDef[] = [
        { key: "actionType", label: "Action Type", type: "text" },
        { key: "targetModel", label: "Target Model", type: "text" },
        { key: "targetRecordId", label: "Record ID", type: "text" },
        { key: "userName", label: "Actor", type: "text" },
        { key: "ipAddress", label: "IP Address", type: "text" },
        { key: "httpMethod", label: "Method", type: "text" },
        { key: "endpoint", label: "Endpoint", type: "text" },
        { key: "severity", label: "Severity", type: "text" },
        { key: "createdAt", label: "Timestamp", type: "date" },
      ];
      exportToCSV({
        title: "Forensic Security Audit Trail",
        columns,
        data: auditLogs,
        isVatAuditor,
        vatMaskedColumns: isVatAuditor ? ["previousState", "newState"] : [],
        filename: "forensic-security-audit-trail",
      });
      toast({ title: "CSV Exported", description: "Forensic audit trail exported to CSV" });
    } catch (e: any) {
      toast({ title: "Export Error", description: e.message, variant: "destructive" });
    }
  };

  const handleExportPDF = () => {
    try {
      const columns: ExportColumnDef[] = [
        { key: "actionType", label: "Action", type: "text" },
        { key: "targetModel", label: "Target Model", type: "text" },
        { key: "targetRecordId", label: "Record ID", type: "text" },
        { key: "userName", label: "Actor", type: "text" },
        { key: "ipAddress", label: "IP Address", type: "text" },
        { key: "severity", label: "Severity", type: "text" },
        { key: "createdAt", label: "Timestamp", type: "date" },
      ];
      exportToPDF({
        title: "Forensic Security Audit Trail",
        subtitle: `${auditTotal} total forensic events${isVatAuditor ? " — VAT Audit Mode" : ""}`,
        orientation: "landscape",
        columns,
        data: auditLogs,
        isVatAuditor,
        vatMaskedColumns: isVatAuditor ? ["previousState", "newState"] : [],
        filename: "forensic-security-audit-trail",
        company: companyProfile || undefined,
        financialFooter: {
          preparedBy: user?.displayName || "System",
          checkedBy: "",
          authorizedBy: "",
          printedBy: user?.displayName || "System",
        },
      });
      toast({ title: "PDF Exported", description: "Forensic audit trail exported to PDF" });
    } catch (e: any) {
      toast({ title: "Export Error", description: e.message, variant: "destructive" });
    }
  };

  const handleImportCSV = async () => {
    try {
      const result = await importFromCSV({
        apiPath: "/api/audit-logs?import=true",
        formFields: [
          { key: "action", label: "Action", type: "text", required: true },
          { key: "targetModel", label: "Target Model", type: "text", required: true },
          { key: "details", label: "Details", type: "text" },
          { key: "severity", label: "Severity", type: "text" },
        ],
      });
      if (result.imported > 0) {
        toast({ title: "Import Complete", description: `${result.imported} reference entries imported, ${result.failed} failed` });
        loadAuditLogs();
      } else if (result.errors.length > 0) {
        toast({ title: "Import Failed", description: result.errors[0], variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Import Error", description: e.message, variant: "destructive" });
    }
  };

  const openDiffDialog = (log: any) => {
    setSelectedLog(log);
    setDiffDialogOpen(true);
  };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="flex flex-col bg-slate-50 dark:bg-slate-900">
      {/* NAVY HEADER BAR */}
      <div className="bg-[#0a1628] text-white px-4 sm:px-6 py-4 flex items-center gap-3 shrink-0">
        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-red-500 to-amber-500 flex items-center justify-center">
          <ShieldAlert className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            Penetration Defense Vault &amp; Forensic Audit
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Immutable audit trail, cryptographic ledger verification, XSS/SQL injection shields, enterprise rate limiting
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge className="bg-green-500/20 text-green-300 border-green-500/30 text-xs">
            <ShieldCheck className="w-3 h-3 mr-1" />
            Sys-Ops-Security-Vault
          </Badge>
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

      {/* KPI STATS ROW */}
      <div className="px-4 sm:px-6 py-4 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 shrink-0">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <Activity className="w-4 h-4 text-blue-500" />
              Total Forensic Events
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
              {new Intl.NumberFormat('en-US').format(auditTotal)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <AlertOctagon className="w-4 h-4 text-red-500" />
              CRITICAL Events
            </div>
            <p className="text-2xl font-bold text-red-700 dark:text-red-400 mt-1">
              {kpiStats.critical}
            </p>
          </CardContent>
        </Card>
        <Card className={`border-l-4 ${ledgerStatus?.chainIntact !== false ? 'border-l-emerald-500' : 'border-l-red-500'}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <Fingerprint className="w-4 h-4 text-emerald-500" />
              Ledger Chain Status
            </div>
            <p className={`text-2xl font-bold mt-1 ${ledgerStatus?.chainIntact !== false ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
              {ledgerStatusLoading ? "..." : (ledgerStatus?.chainIntact !== false ? "INTACT" : "TAMPERED")}
            </p>
            {ledgerStatus?.tamperedEntries > 0 && (
              <p className="text-xs text-red-500 mt-1">{ledgerStatus.tamperedEntries} tampered entries</p>
            )}
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <Zap className="w-4 h-4 text-amber-500" />
              Security Threats
            </div>
            <p className="text-2xl font-bold text-amber-700 dark:text-amber-400 mt-1">
              {threatStats?.total || 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* TAB NAVIGATION */}
      <div className="px-4 sm:px-6 flex-1">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4 bg-slate-200 dark:bg-slate-800 flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="forensic-audit" className="gap-1.5 text-xs">
              <Fingerprint className="w-3.5 h-3.5" />
              Forensic Audit Trail
            </TabsTrigger>
            <TabsTrigger value="ledger-verify" className="gap-1.5 text-xs">
              <ShieldCheck className="w-3.5 h-3.5" />
              Ledger Verification
            </TabsTrigger>
            <TabsTrigger value="threat-log" className="gap-1.5 text-xs">
              <Bug className="w-3.5 h-3.5" />
              Threat Log
            </TabsTrigger>
            <TabsTrigger value="rate-throttle" className="gap-1.5 text-xs">
              <Zap className="w-3.5 h-3.5" />
              Rate Throttle
            </TabsTrigger>
            <TabsTrigger value="backup-vault" className="gap-1.5 text-xs">
              <Database className="w-3.5 h-3.5" />
              Backup Vault
            </TabsTrigger>
            <TabsTrigger value="compliance-report" className="gap-1.5 text-xs">
              <FileText className="w-3.5 h-3.5" />
              Compliance Report
            </TabsTrigger>
          </TabsList>

          {/* ═══════════════════════════════════════════════════════════
              TAB 1: FORENSIC AUDIT TRAIL
              ═══════════════════════════════════════════════════════════ */}
          <TabsContent value="forensic-audit">
            <Card className="border-slate-200 dark:border-slate-700">
              <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg pb-3">
                <CardTitle className="text-white flex items-center gap-2 text-base">
                  <Search className="w-4 h-4" />
                  Forensic Audit Trail Filters
                  <Badge className="bg-red-500/30 text-red-200 text-xs ml-2">IMMUTABLE</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-900 dark:text-white">Search</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input placeholder="Actor, model, IP..." value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} className="pl-10 w-full" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-900 dark:text-white">Action Type</Label>
                    <Select value={filterActionType} onValueChange={setFilterActionType}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="ALL" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">ALL</SelectItem>
                        <SelectItem value="CREATE">CREATE</SelectItem>
                        <SelectItem value="UPDATE">UPDATE</SelectItem>
                        <SelectItem value="DELETE">DELETE</SelectItem>
                        <SelectItem value="SECURITY_OVERRIDE">SECURITY_OVERRIDE</SelectItem>
                        <SelectItem value="LEDGER_VERIFY">LEDGER_VERIFY</SelectItem>
                        <SelectItem value="RATE_LIMIT_TRIGGERED">RATE_LIMIT_TRIGGERED</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-900 dark:text-white">Target Model</Label>
                    <Select value={filterTargetModel} onValueChange={setFilterTargetModel}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="ALL" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">ALL</SelectItem>
                        {availableModels.map((model) => (<SelectItem key={model} value={model}>{model}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-900 dark:text-white">Severity</Label>
                    <Select value={filterSeverity} onValueChange={setFilterSeverity}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="ALL" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">ALL</SelectItem>
                        <SelectItem value="INFO">INFO</SelectItem>
                        <SelectItem value="WARNING">WARNING</SelectItem>
                        <SelectItem value="CRITICAL">CRITICAL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-900 dark:text-white">Date From</Label>
                    <Input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className="w-full" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-900 dark:text-white">Date To</Label>
                    <Input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className="w-full" />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t">
                  <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" size="sm" onClick={() => { setAuditPage(1); loadAuditLogs(); }}>
                    <Search className="w-4 h-4 mr-1" /> Apply Filters
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => {
                    setFilterSearch(""); setFilterActionType("ALL"); setFilterTargetModel("ALL");
                    setFilterSeverity("ALL"); setFilterDateFrom(""); setFilterDateTo(""); setAuditPage(1);
                  }}>Reset</Button>
                  <div className="flex-1" />
                  <Button variant="outline" size="sm" onClick={handleExportCSV}>
                    <Download className="w-4 h-4 mr-1" /> CSV
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExportPDF}>
                    <FileDown className="w-4 h-4 mr-1" /> PDF
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleImportCSV}>
                    <Upload className="w-4 h-4 mr-1" /> Import CSV
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
                    <span className="text-slate-500 dark:text-slate-400">Loading forensic audit trail...</span>
                  </div>
                ) : auditLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                    <Fingerprint className="w-10 h-10 mb-3" />
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">No Forensic Entries Found</h3>
                    <p className="text-sm mt-1">Try adjusting your filters to see more results.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <div className="max-h-[500px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-[#132240] dark:bg-[#0a1628] sticky top-0 z-10">
                            <TableHead className="text-white font-semibold w-12">#</TableHead>
                            <TableHead className="text-white font-semibold">Timestamp</TableHead>
                            <TableHead className="text-white font-semibold">Action</TableHead>
                            <TableHead className="text-white font-semibold">Severity</TableHead>
                            <TableHead className="text-white font-semibold">Actor</TableHead>
                            <TableHead className="text-white font-semibold">Target</TableHead>
                            <TableHead className="text-white font-semibold">Endpoint</TableHead>
                            <TableHead className="text-white font-semibold">IP Address</TableHead>
                            <TableHead className="text-white font-semibold">Token</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {auditLogs.map((log: any, idx: number) => {
                            const actionType = (log.actionType || "UNKNOWN").toUpperCase();
                            const actionBadge = ACTION_BADGE_MAP[actionType] || "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400";
                            const severity = (log.severity || "INFO").toUpperCase();
                            const severityBadge = SEVERITY_BADGE_MAP[severity] || SEVERITY_BADGE_MAP.INFO;

                            return (
                              <TableRow key={log.id || idx} className="hover:bg-blue-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors" onClick={() => openDiffDialog(log)}>
                                <TableCell className="text-slate-500 text-xs">{(auditPage - 1) * auditPageSize + idx + 1}</TableCell>
                                <TableCell className="text-xs whitespace-nowrap">
                                  <div className="flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                                    {fmtDate(log.createdAt)}
                                  </div>
                                </TableCell>
                                <TableCell><Badge className={`${actionBadge} font-semibold text-xs`}>{actionType}</Badge></TableCell>
                                <TableCell><Badge className={`${severityBadge} font-semibold text-xs`}>{severity}</Badge></TableCell>
                                <TableCell className="text-sm font-medium text-slate-900 dark:text-white">{log.userName || "System"}</TableCell>
                                <TableCell className="text-sm font-mono text-slate-700 dark:text-slate-300">{log.targetModel || "—"}</TableCell>
                                <TableCell className="text-xs font-mono text-slate-500 max-w-[150px] truncate">{log.endpoint || "—"}</TableCell>
                                <TableCell className="text-xs font-mono text-slate-500">{log.ipAddress || "—"}</TableCell>
                                <TableCell className="text-xs"><Badge variant="outline" className="text-xs">{log.moduleToken || "—"}</Badge></TableCell>
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
                <p className="text-sm text-slate-500">Showing {((auditPage - 1) * auditPageSize) + 1}–{Math.min(auditPage * auditPageSize, auditTotal)} of {auditTotal}</p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={auditPage <= 1} onClick={() => setAuditPage(p => Math.max(1, p - 1))}>
                    <ChevronLeft className="w-4 h-4 mr-1" /> Previous
                  </Button>
                  <span className="text-sm text-slate-700 dark:text-slate-300 px-2">Page {auditPage} of {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={auditPage >= totalPages} onClick={() => setAuditPage(p => Math.min(totalPages, p + 1))}>
                    Next <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════════
              TAB 2: CRYPTOGRAPHIC LEDGER VERIFICATION
              ═══════════════════════════════════════════════════════════ */}
          <TabsContent value="ledger-verify">
            <div className="space-y-4">
              {/* Chain Status Card */}
              <Card className="border-slate-200 dark:border-slate-700">
                <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg pb-3">
                  <CardTitle className="text-white flex items-center gap-2 text-base">
                    <Fingerprint className="w-4 h-4" />
                    SHA-256 Cryptographic Ledger Hash Chain
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  {ledgerStatusLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="w-8 h-8 animate-spin text-[#2563eb] mr-3" />
                      <span className="text-slate-500">Loading chain status...</span>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Status Indicator */}
                      <div className={`p-6 rounded-lg border-2 ${ledgerStatus?.chainIntact !== false ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-300 dark:border-emerald-700' : 'bg-red-50 dark:bg-red-900/10 border-red-300 dark:border-red-700'}`}>
                        <div className="flex items-center gap-4">
                          {ledgerStatus?.chainIntact !== false ? (
                            <div className="h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                              <ShieldCheck className="h-8 w-8 text-emerald-600" />
                            </div>
                          ) : (
                            <div className="h-16 w-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                              <AlertTriangle className="h-8 w-8 text-red-600" />
                            </div>
                          )}
                          <div>
                            <h3 className={`text-xl font-bold ${ledgerStatus?.chainIntact !== false ? 'text-emerald-800 dark:text-emerald-300' : 'text-red-800 dark:text-red-300'}`}>
                              {ledgerStatus?.chainIntact !== false ? "Ledger Chain Integrity: VERIFIED" : "⚠ LEDGER TAMPERING DETECTED"}
                            </h3>
                            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                              {ledgerStatus?.chainIntact !== false
                                ? `All ${ledgerStatus?.totalChainEntries || 0} hash chain entries are mathematically intact. No rogue database manipulation detected.`
                                : `${ledgerStatus?.tamperedEntries || 0} entries show hash mismatches — possible direct database row manipulation detected!`
                              }
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Chain Stats */}
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-lg">
                          <p className="text-sm text-slate-500">Total Chain Entries</p>
                          <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">{ledgerStatus?.totalChainEntries || 0}</p>
                        </div>
                        <div className={`p-4 rounded-lg ${ledgerStatus?.tamperedEntries > 0 ? 'bg-red-50 dark:bg-red-900/10' : 'bg-emerald-50 dark:bg-emerald-900/10'}`}>
                          <p className="text-sm text-slate-500">Tampered Entries</p>
                          <p className={`text-2xl font-bold ${ledgerStatus?.tamperedEntries > 0 ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}>{ledgerStatus?.tamperedEntries || 0}</p>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg">
                          <p className="text-sm text-slate-500">Algorithm</p>
                          <p className="text-2xl font-bold text-slate-700 dark:text-slate-300">{ledgerStatus?.algorithm || "SHA-256"}</p>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg">
                          <p className="text-sm text-slate-500">Last Verification</p>
                          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{ledgerStatus?.lastVerification?.verifiedAt ? fmtDate(ledgerStatus.lastVerification.verifiedAt) : "Never"}</p>
                        </div>
                      </div>

                      {/* Verification Button with Spin-Lock */}
                      <div className="flex items-center gap-4 pt-2">
                        <Button
                          className={`min-w-0 sm:min-w-[400px] h-12 text-sm font-semibold ${ledgerStatus?.chainIntact !== false ? 'bg-[#2563eb] hover:bg-[#1d4ed8]' : 'bg-red-600 hover:bg-red-700'}`}
                          onClick={handleRunLedgerVerification}
                          disabled={isVerifyingLedger}
                        >
                          {isVerifyingLedger ? (
                            <>
                              <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                              Running SHA-256 Cryptographic Chain Verification &amp; Auditing Tamper-Shields...
                            </>
                          ) : (
                            <>
                              <Fingerprint className="w-5 h-5 mr-2" />
                              Run Global Ledger Verification Search
                            </>
                          )}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={loadLedgerStatus}>
                          <RefreshCw className={`w-4 h-4 ${ledgerStatusLoading ? "animate-spin" : ""}`} />
                        </Button>
                      </div>

                      {/* Verification Results */}
                      {verificationResult && (
                        <Card className={`border-2 ${verificationResult.chainIntact ? 'border-emerald-300 dark:border-emerald-700' : 'border-red-300 dark:border-red-700'}`}>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-base flex items-center gap-2">
                              {verificationResult.chainIntact ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <XCircle className="w-5 h-5 text-red-600" />}
                              Verification Result
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <p className="text-sm text-slate-700 dark:text-slate-300">{verificationResult.message}</p>
                            <div className="grid grid-cols-3 gap-4 mt-4">
                              <div><p className="text-xs text-slate-500">Total Checked</p><p className="text-lg font-bold">{verificationResult.totalChecked}</p></div>
                              <div><p className="text-xs text-slate-500">Tampered</p><p className="text-lg font-bold text-red-600">{verificationResult.tamperedCount}</p></div>
                              <div><p className="text-xs text-slate-500">New Hashes</p><p className="text-lg font-bold text-blue-600">{verificationResult.newHashesCreated}</p></div>
                            </div>
                            {verificationResult.verificationResults && verificationResult.verificationResults.filter((r: any) => r.isTampered).length > 0 && (
                              <div className="mt-4 max-h-48 overflow-y-auto">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Entry Code</TableHead>
                                      <TableHead>Details</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {verificationResult.verificationResults.filter((r: any) => r.isTampered).map((r: any, i: number) => (
                                      <TableRow key={i}>
                                        <TableCell className="font-mono text-xs">{r.entryCode}</TableCell>
                                        <TableCell className="text-xs text-red-600">{r.mismatchDetails}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════════
              TAB 3: SECURITY THREAT LOG
              ═══════════════════════════════════════════════════════════ */}
          <TabsContent value="threat-log">
            <div className="space-y-4">
              {/* Threat Stats */}
              {threatStats && (
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                  <Card className="border-l-4 border-l-orange-500">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2 text-xs text-slate-500"><Bug className="w-3 h-3" />XSS Attacks</div>
                      <p className="text-xl font-bold text-orange-600">{threatStats.xssCount || 0}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 border-l-red-500">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2 text-xs text-slate-500"><Database className="w-3 h-3" />SQL Injection</div>
                      <p className="text-xl font-bold text-red-600">{threatStats.sqlInjectionCount || 0}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 border-l-amber-500">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2 text-xs text-slate-500"><Zap className="w-3 h-3" />Rate Limit</div>
                      <p className="text-xl font-bold text-amber-600">{threatStats.rateLimitCount || 0}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 border-l-purple-500">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2 text-xs text-slate-500"><Lock className="w-3 h-3" />Unauthorized</div>
                      <p className="text-xl font-bold text-purple-600">{threatStats.unauthorizedCount || 0}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 border-l-rose-500">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2 text-xs text-slate-500"><ShieldAlert className="w-3 h-3" />Unresolved</div>
                      <p className="text-xl font-bold text-rose-600">{threatStats.unresolvedCount || 0}</p>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Filter */}
              <Card className="border-slate-200 dark:border-slate-700">
                <CardContent className="p-4 flex flex-wrap items-center gap-3">
                  <Select value={threatFilter} onValueChange={(v) => { setThreatFilter(v); setThreatPage(1); }}>
                    <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Threat Types</SelectItem>
                      <SelectItem value="XSS_SCRIPT_TAG">XSS Attacks</SelectItem>
                      <SelectItem value="SQL_INJECTION">SQL Injection</SelectItem>
                      <SelectItem value="PAYLOAD_TAMPERING">Payload Tampering</SelectItem>
                      <SelectItem value="RATE_LIMIT_BREACH">Rate Limit Breach</SelectItem>
                      <SelectItem value="UNAUTHORIZED_ACCESS">Unauthorized Access</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex-1" />
                  <Button variant="ghost" size="sm" onClick={loadThreats}>
                    <RefreshCw className={`w-4 h-4 ${threatLoading ? "animate-spin" : ""}`} />
                  </Button>
                </CardContent>
              </Card>

              {/* Threat Table */}
              <Card className="border-slate-200 dark:border-slate-700">
                <CardContent className="p-0">
                  {threatLoading ? (
                    <div className="flex items-center justify-center py-16">
                      <RefreshCw className="w-8 h-8 animate-spin text-[#2563eb] mr-3" />
                      <span className="text-slate-500">Loading threat logs...</span>
                    </div>
                  ) : threats.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                      <ShieldCheck className="w-10 h-10 mb-3 text-emerald-400" />
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">No Threats Detected</h3>
                      <p className="text-sm mt-1">All clear — no security threats have been logged.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <div className="max-h-[500px] overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-[#132240] dark:bg-[#0a1628] sticky top-0 z-10">
                              <TableHead className="text-white font-semibold">Type</TableHead>
                              <TableHead className="text-white font-semibold">Severity</TableHead>
                              <TableHead className="text-white font-semibold">IP Address</TableHead>
                              <TableHead className="text-white font-semibold">Endpoint</TableHead>
                              <TableHead className="text-white font-semibold">Blocked Action</TableHead>
                              <TableHead className="text-white font-semibold">Timestamp</TableHead>
                              <TableHead className="text-white font-semibold">Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {threats.map((threat: any, idx: number) => {
                              const threatInfo = THREAT_TYPE_MAP[threat.threatType] || { label: threat.threatType, color: "bg-gray-100 text-gray-700", icon: "shield" };
                              const severityBadge = SEVERITY_BADGE_MAP[threat.severity] || SEVERITY_BADGE_MAP.INFO;

                              return (
                                <TableRow key={threat.id || idx} className="hover:bg-red-50/50 dark:hover:bg-red-900/10 transition-colors">
                                  <TableCell>
                                    <Badge className={`${threatInfo.color} font-semibold text-xs`}>{threatInfo.label}</Badge>
                                  </TableCell>
                                  <TableCell><Badge className={`${severityBadge} font-semibold text-xs`}>{threat.severity}</Badge></TableCell>
                                  <TableCell className="text-xs font-mono">{threat.ipAddress || "—"}</TableCell>
                                  <TableCell className="text-xs font-mono max-w-[150px] truncate">{threat.endpoint || "—"}</TableCell>
                                  <TableCell className="text-xs max-w-[250px] truncate">{threat.blockedAction || "—"}</TableCell>
                                  <TableCell className="text-xs whitespace-nowrap">{fmtDate(threat.createdAt)}</TableCell>
                                  <TableCell>
                                    {threat.resolved ? (
                                      <Badge className="bg-emerald-100 text-emerald-700 text-xs">Resolved</Badge>
                                    ) : (
                                      <Badge className="bg-red-100 text-red-700 text-xs">Open</Badge>
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

              {threatTotal > 0 && (
                <div className="flex items-center justify-between px-1">
                  <p className="text-sm text-slate-500">Showing {((threatPage - 1) * threatPageSize) + 1}–{Math.min(threatPage * threatPageSize, threatTotal)} of {threatTotal}</p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={threatPage <= 1} onClick={() => setThreatPage(p => Math.max(1, p - 1))}><ChevronLeft className="w-4 h-4 mr-1" />Prev</Button>
                    <span className="text-sm px-2">Page {threatPage} of {threatTotalPages}</span>
                    <Button variant="outline" size="sm" disabled={threatPage >= threatTotalPages} onClick={() => setThreatPage(p => Math.min(threatTotalPages, p + 1))}>Next<ChevronRight className="w-4 h-4 ml-1" /></Button>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════════
              TAB 4: RATE THROTTLE
              ═══════════════════════════════════════════════════════════ */}
          <TabsContent value="rate-throttle">
            <Card className="border-slate-200 dark:border-slate-700">
              <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg pb-3">
                <CardTitle className="text-white flex items-center gap-2 text-base">
                  <Zap className="w-4 h-4" />
                  Enterprise API Rate Limiting Engine
                  <Badge className="bg-amber-500/30 text-amber-200 text-xs ml-2">60 req/min</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                {rateLimitLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <RefreshCw className="w-8 h-8 animate-spin text-[#2563eb] mr-3" />
                    <span className="text-slate-500">Loading rate limit data...</span>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Config Display */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-lg">
                        <p className="text-sm text-slate-500">Tracked Identities</p>
                        <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">{rateLimitData?.stats?.totalIdentities || 0}</p>
                      </div>
                      <div className={`p-4 rounded-lg ${(rateLimitData?.stats?.blockedIdentities || 0) > 0 ? 'bg-red-50 dark:bg-red-900/10' : 'bg-emerald-50 dark:bg-emerald-900/10'}`}>
                        <p className="text-sm text-slate-500">Blocked Identities</p>
                        <p className={`text-2xl font-bold ${(rateLimitData?.stats?.blockedIdentities || 0) > 0 ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}>{rateLimitData?.stats?.blockedIdentities || 0}</p>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg">
                        <p className="text-sm text-slate-500">Max Requests/Min</p>
                        <p className="text-2xl font-bold text-slate-700 dark:text-slate-300">{rateLimitData?.config?.maxRequestsPerMinute || 60}</p>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg">
                        <p className="text-sm text-slate-500">Algorithm</p>
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{rateLimitData?.config?.algorithm || "Token Bucket"}</p>
                      </div>
                    </div>

                    {/* Top Consumers Table */}
                    {rateLimitData?.stats?.topConsumers && rateLimitData.stats.topConsumers.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Top API Consumers</h4>
                        <div className="max-h-64 overflow-y-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Identity</TableHead>
                                <TableHead>Total Requests</TableHead>
                                <TableHead>Times Blocked</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {rateLimitData.stats.topConsumers.map((c: any, i: number) => (
                                <TableRow key={i}>
                                  <TableCell className="font-mono text-xs">{c.identifier}</TableCell>
                                  <TableCell>{c.requests}</TableCell>
                                  <TableCell><Badge className={c.blocked > 0 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}>{c.blocked}</Badge></TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}

                    <Button variant="ghost" size="sm" onClick={loadRateLimit}>
                      <RefreshCw className={`w-4 h-4 ${rateLimitLoading ? "animate-spin" : ""} mr-1`} /> Refresh Stats
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════════
              TAB 5: BACKUP VAULT (Admin Only)
              ═══════════════════════════════════════════════════════════ */}
          <TabsContent value="backup-vault">
            {!isAdmin ? (
              <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <div className="h-20 w-20 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center"><AlertTriangle className="h-10 w-10 text-red-500" /></div>
                <h1 className="text-2xl font-bold text-red-600 dark:text-red-400">403 Forbidden</h1>
                <p className="text-slate-600 dark:text-slate-400 text-center max-w-md">Access Denied. Backup Vault operations are restricted to Administrator role only.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <Card className="border-slate-200 dark:border-slate-700">
                  <CardContent className="p-4 flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                        <CloudUpload className="w-5 h-5 text-blue-500" /> Secure Cloud Vault Backup
                      </h3>
                      <p className="text-sm text-slate-500">Encrypted full-system backups with SHA-256 integrity verification</p>
                    </div>
                    <Button className="bg-[#2563eb] hover:bg-[#1d4ed8] min-w-0 sm:min-w-[200px]" onClick={handleTriggerBackup} disabled={isBackingUp}>
                      {isBackingUp ? (<><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Encrypting and Pushing Data to Secure Cloud Vault...</>) : (<><CloudUpload className="w-4 h-4 mr-2" />Trigger Backup</>)}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={loadBackups}><RefreshCw className={`w-4 h-4 ${backupLoading ? "animate-spin" : ""}`} /></Button>
                  </CardContent>
                </Card>

                <Card className="border-slate-200 dark:border-slate-700">
                  <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg pb-3">
                    <CardTitle className="text-white flex items-center gap-2 text-base"><Database className="w-4 h-4" />Backup History</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {backupLoading ? (
                      <div className="flex items-center justify-center py-16"><RefreshCw className="w-8 h-8 animate-spin text-[#2563eb] mr-3" /><span className="text-slate-500">Loading backups...</span></div>
                    ) : backups.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-slate-400"><Database className="w-10 h-10 mb-3" /><h3 className="text-lg font-semibold text-slate-900 dark:text-white">No Backups Found</h3><p className="text-sm mt-1">Trigger your first backup to get started.</p></div>
                    ) : (
                      <div className="overflow-x-auto"><div className="max-h-96 overflow-y-auto">
                        <Table>
                          <TableHeader><TableRow className="bg-[#132240] dark:bg-[#0a1628] sticky top-0 z-10">
                            <TableHead className="text-white">Code</TableHead><TableHead className="text-white">Type</TableHead><TableHead className="text-white">Status</TableHead><TableHead className="text-white">Records</TableHead><TableHead className="text-white">Size</TableHead><TableHead className="text-white">Triggered By</TableHead><TableHead className="text-white">Started</TableHead><TableHead className="text-white">Checksum</TableHead><TableHead className="text-white w-16">Actions</TableHead>
                          </TableRow></TableHeader>
                          <TableBody>
                            {backups.map((backup: any) => {
                              const status = (backup.status || "PENDING").toUpperCase();
                              const statusBadge = STATUS_BADGE_MAP[status] || "bg-gray-100 text-gray-700";
                              return (
                                <TableRow key={backup.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                  <TableCell className="font-mono text-xs font-semibold">{backup.backupCode || "—"}</TableCell>
                                  <TableCell><Badge className={statusBadge}>{status}</Badge></TableCell>
                                  <TableCell><Badge className={statusBadge}>{backup.backupType || "FULL"}</Badge></TableCell>
                                  <TableCell>{backup.recordCount || 0}</TableCell>
                                  <TableCell className="text-xs">{fmtSize(backup.fileSizeBytes || 0)}</TableCell>
                                  <TableCell>{backup.triggeredByName || "—"}</TableCell>
                                  <TableCell className="text-xs">{backup.startedAt ? fmtDate(backup.startedAt) : "—"}</TableCell>
                                  <TableCell className="text-xs font-mono">{(backup.checksumSha256 || "").substring(0, 16)}...</TableCell>
                                  <TableCell><Button variant="ghost" size="sm" onClick={() => handleDownloadBackup(backup)}><Download className="w-4 h-4" /></Button></TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div></div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════════
              TAB 6: COMPLIANCE REPORT
              ═══════════════════════════════════════════════════════════ */}
          <TabsContent value="compliance-report">
            <Card className="border-slate-200 dark:border-slate-700">
              <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg pb-3">
                <CardTitle className="text-white flex items-center gap-2 text-base">
                  <FileText className="w-4 h-4" />
                  Enterprise Security Compliance Audited Statement
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-6">
                  <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <Info className="w-5 h-5 text-amber-500 mt-0.5" />
                      <div>
                        <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300">White-Label PDF Report</h4>
                        <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                          This generates a comprehensive Enterprise Security Compliance Audited Statement PDF featuring the
                          Phase 2 dynamic Company Base64 Logo, multi-column audit timeline log metadata matrix, VAT Auditor masking,
                          and the Enterprise Corporate Triple-Signature Layout at the base of the final canvas.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Report Contents</h4>
                      <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-2">
                        <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" />Forensic audit timeline with actor identification</li>
                        <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" />SHA-256 ledger chain integrity status</li>
                        <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" />Security threat breakdown (XSS, SQLi, Rate Limit)</li>
                        <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" />Compliance module status matrix</li>
                        <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" />VAT Auditor masking for financial fields</li>
                        <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" />Corporate Base64 Logo header</li>
                        <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" />Triple-Signature Layout (Prepared/Checked/Authorized)</li>
                      </ul>
                    </div>
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Compliance Token</h4>
                      <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-4">
                        <code className="text-sm text-[#2563eb]">Sys-Ops-Security-Vault</code>
                        <p className="text-xs text-slate-500 mt-2">All report generation events are logged with this compliance tracking token for forensic traceability.</p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="flex items-center gap-4">
                    <Button
                      className="bg-[#2563eb] hover:bg-[#1d4ed8] min-w-0 sm:min-w-[350px] h-12"
                      onClick={handleGenerateSecurityPDF}
                      disabled={isGeneratingReport}
                    >
                      {isGeneratingReport ? (
                        <>
                          <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                          Running SHA-256 Cryptographic Chain Verification &amp; Auditing Tamper-Shields...
                        </>
                      ) : (
                        <>
                          <FileDown className="w-5 h-5 mr-2" />
                          Generate Enterprise Security Compliance Statement
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Diff Dialog */}
      <Dialog open={diffDialogOpen} onOpenChange={setDiffDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Forensic Audit Entry — Before/After Diff Matrix
            </DialogTitle>
            <DialogDescription>
              Detailed before/after payload snapshot for this audit event
            </DialogDescription>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg">
                  <p className="text-xs text-slate-500 mb-1">Action Type</p>
                  <Badge className={ACTION_BADGE_MAP[selectedLog.actionType] || "bg-gray-100 text-gray-700"}>{selectedLog.actionType}</Badge>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg">
                  <p className="text-xs text-slate-500 mb-1">Severity</p>
                  <Badge className={SEVERITY_BADGE_MAP[selectedLog.severity] || SEVERITY_BADGE_MAP.INFO}>{selectedLog.severity}</Badge>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg">
                  <p className="text-xs text-slate-500 mb-1">Actor</p>
                  <p className="text-sm font-medium">{selectedLog.userName || "System"}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg">
                  <p className="text-xs text-slate-500 mb-1">IP Address</p>
                  <p className="text-sm font-mono">{selectedLog.ipAddress || "—"}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg">
                  <p className="text-xs text-slate-500 mb-1">Endpoint</p>
                  <p className="text-sm font-mono">{selectedLog.endpoint || "—"}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg">
                  <p className="text-xs text-slate-500 mb-1">HTTP Method</p>
                  <p className="text-sm font-mono">{selectedLog.httpMethod || "—"}</p>
                </div>
              </div>

              {selectedLog.diffSummary && typeof selectedLog.diffSummary === 'object' && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Diff Summary (Changed Fields)</h4>
                  <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                    <pre className="text-xs overflow-x-auto max-h-40 overflow-y-auto">
                      {JSON.stringify(selectedLog.diffSummary, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {selectedLog.previousState && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 text-red-600">Before State</h4>
                  <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg p-3">
                    <pre className="text-xs overflow-x-auto max-h-40 overflow-y-auto">
                      {typeof selectedLog.previousState === 'string' ? selectedLog.previousState : JSON.stringify(selectedLog.previousState, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {selectedLog.newState && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 text-emerald-600">After State</h4>
                  <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3">
                    <pre className="text-xs overflow-x-auto max-h-40 overflow-y-auto">
                      {typeof selectedLog.newState === 'string' ? selectedLog.newState : JSON.stringify(selectedLog.newState, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {selectedLog.moduleToken && (
                <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg">
                  <p className="text-xs text-slate-500 mb-1">Compliance Token</p>
                  <code className="text-sm text-[#2563eb]">{selectedLog.moduleToken}</code>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiffDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
