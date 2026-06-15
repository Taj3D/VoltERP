"use client";

// ============================================================
// VoltERP — Forensic System Audit Trail Viewer
// Comprehensive log viewer: timeline, user activities, IP
// history, before/after transaction state diffs, statistics,
// and export (PDF Audit Report + CSV)
// ============================================================

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Shield, ShieldCheck, Clock, Search, RefreshCw, Download,
  FileDown, Filter, ChevronDown, ChevronUp, ChevronRight,
  RotateCcw, Activity, Eye, EyeOff, AlertTriangle, Users,
  Globe, BarChart3, TrendingUp, MapPin, Hash, Monitor,
  LogIn, LogOut, Plus, Trash2, ArrowRightLeft, FileUp, Upload,
  FileDown as ImportIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "next-themes";
import {
  exportToCSV, exportAuditReportPDF, importFromCSV, getVatMaskedKeys,
} from "@/lib/export-utils";
import type { ColumnDef as ExportColumnDef, CompanyProfile } from "@/lib/export-utils";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/hooks/useAuth";

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

const fmtDate = (d: string | Date) => {
  if (!d) return "\u2014";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "\u2014" : dt.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
};

const fmtDateShort = (d: string | Date) => {
  if (!d) return "\u2014";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "\u2014" : dt.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
};

const fmtTime = (d: string | Date) => {
  if (!d) return "\u2014";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "\u2014" : dt.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
};


// ============================================================
// AUTH TYPES

// ============================================================
// ACTION COLOR / BADGE HELPERS
// ============================================================

const ACTION_DOT_COLOR: Record<string, string> = {
  CREATE: "bg-green-500",
  UPDATE: "bg-blue-500",
  DELETE: "bg-red-500",
  LOGIN: "bg-yellow-500",
  LOGOUT: "bg-yellow-500",
  EXPORT: "bg-purple-500",
  IMPORT: "bg-purple-500",
};

const ACTION_DOT_RING: Record<string, string> = {
  CREATE: "ring-green-500/30",
  UPDATE: "ring-blue-500/30",
  DELETE: "ring-red-500/30",
  LOGIN: "ring-yellow-500/30",
  LOGOUT: "ring-yellow-500/30",
  EXPORT: "ring-purple-500/30",
  IMPORT: "ring-purple-500/30",
};

const ACTION_BADGE: Record<string, string> = {
  CREATE: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  UPDATE: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  DELETE: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  LOGIN: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  LOGOUT: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  EXPORT: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  IMPORT: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

const ACTION_ICON: Record<string, React.ElementType> = {
  CREATE: Plus,
  UPDATE: ArrowRightLeft,
  DELETE: Trash2,
  LOGIN: LogIn,
  LOGOUT: LogOut,
  EXPORT: FileDown,
  IMPORT: ImportIcon,
};

const ACTION_BAR_COLOR: Record<string, string> = {
  CREATE: "bg-green-500",
  UPDATE: "bg-blue-500",
  DELETE: "bg-red-500",
  LOGIN: "bg-yellow-500",
  LOGOUT: "bg-yellow-500",
  EXPORT: "bg-purple-500",
  IMPORT: "bg-purple-500",
};

function getDotColor(action: string): string {
  return ACTION_DOT_COLOR[action?.toUpperCase()] || "bg-slate-500";
}

function getDotRing(action: string): string {
  return ACTION_DOT_RING[action?.toUpperCase()] || "ring-slate-500/30";
}

function getBadgeClass(action: string): string {
  return ACTION_BADGE[action?.toUpperCase()] || "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400";
}

// ============================================================
// DETAILS PARSING — Before/After Diff
// ============================================================

interface ParsedDetails {
  before: Record<string, any> | null;
  after: Record<string, any> | null;
  rawText: string | null;
}

function parseDetails(detailsStr: string | null | undefined): ParsedDetails {
  if (!detailsStr) return { before: null, after: null, rawText: null };
  try {
    const parsed = JSON.parse(detailsStr);
    if (typeof parsed === "object" && parsed !== null) {
      return {
        before: parsed.before || null,
        after: parsed.after || null,
        rawText: parsed.description || parsed.message || null,
      };
    }
    return { before: null, after: null, rawText: String(parsed) };
  } catch {
    return { before: null, after: null, rawText: detailsStr };
  }
}

function containsProfitData(data: any): boolean {
  if (!data) return false;
  const str = typeof data === "string" ? data : JSON.stringify(data);
  const lower = str.toLowerCase();
  return (
    lower.includes("profit") ||
    lower.includes("margin") ||
    lower.includes("costprice") ||
    lower.includes("wholesaleprice") ||
    lower.includes("dealerprice") ||
    lower.includes("writeoff")
  );
}

function maskProfitFields(obj: Record<string, any>): Record<string, any> {
  const masked = { ...obj };
  const profitKeys = [
    "profit", "margin", "costPrice", "wholesalePrice", "dealerPrice",
    "writeoff", "costprice", "wholesaleprice", "dealerprice",
    "profitMargin", "grossProfit", "netProfit",
  ];
  for (const key of Object.keys(masked)) {
    const kl = key.toLowerCase();
    if (profitKeys.some((pk) => kl.includes(pk.toLowerCase()))) {
      masked[key] = "N/A (Audit Mode)";
    }
  }
  return masked;
}

// ============================================================
// AUDIT TRAIL VIEWER COMPONENT
// ============================================================

export default function AuditTrailViewer() {
  const { toast } = useToast();
  const { resolvedTheme } = useTheme();

  // ─── Auth State (shared hook) ───
  const { user: authUser, isVatAuditor, isSR, isDealer, isAdmin, isManager } = useAuth();

  // ─── Company Profile (for PDF export) ───
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);

  useEffect(() => {
    if (!isSR && !isDealer) {
      apiFetch("/api/company-branding")
        .then((res) => {
          if (res.company) setCompanyProfile(res.company);
        })
        .catch((e) => { console.warn("Failed to load company branding for PDF:", e); });
    }
  }, [isSR, isDealer]);

  // ─── Data State ───
  const [entries, setEntries] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  // ─── Expanded Details State ───
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // ─── Active Tab ───
  const [activeTab, setActiveTab] = useState("timeline");

  // ─── Filter State ───
  const [filterModule, setFilterModule] = useState<string>("all");
  const [filterAction, setFilterAction] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterUserSearch, setFilterUserSearch] = useState("");
  const [filterRecordSearch, setFilterRecordSearch] = useState("");

  // Applied filters (only update on Apply click)
  const [appliedFilters, setAppliedFilters] = useState({
    module: "",
    action: "",
    dateFrom: "",
    dateTo: "",
    userSearch: "",
    recordSearch: "",
  });

  // ─── Available modules & actions from audit-logs API ───
  const [availableModules, setAvailableModules] = useState<string[]>([]);
  const [availableActions, setAvailableActions] = useState<string[]>([]);

  // ─── Scroll sentinel ref ───
  const sentinelRef = useRef<HTMLDivElement>(null);

  // ─── Offset ref to avoid dependency loops ───
  const offsetRef = useRef(0);

  // ============================================================
  // DATA LOADING
  // ============================================================

  const buildUrl = useCallback(
    (currentOffset: number, limit: number = 100) => {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(currentOffset));

      if (appliedFilters.module) params.set("module", appliedFilters.module);
      if (appliedFilters.action) params.set("action", appliedFilters.action);
      if (appliedFilters.dateFrom) params.set("dateFrom", appliedFilters.dateFrom);
      if (appliedFilters.dateTo) params.set("dateTo", appliedFilters.dateTo);

      // Combine user and record search into a single search parameter
      const searchParts: string[] = [];
      if (appliedFilters.userSearch.trim()) searchParts.push(appliedFilters.userSearch.trim());
      if (appliedFilters.recordSearch.trim()) searchParts.push(appliedFilters.recordSearch.trim());
      if (searchParts.length > 0) {
        params.set("search", searchParts.join(" "));
      }

      return `/api/audit-trail?${params.toString()}`;
    },
    [appliedFilters]
  );

  const loadEntries = useCallback(
    async (reset: boolean = true) => {
      if (reset) {
        setLoading(true);
        offsetRef.current = 0;
        setOffset(0);
      } else {
        setLoadingMore(true);
      }

      try {
        const currentOffset = reset ? 0 : offsetRef.current;
        const url = buildUrl(currentOffset, 100);
        const res = await apiFetch(url);

        const newEntries = res.entries || [];
        const total = res.total || 0;

        if (reset) {
          setEntries(newEntries);
        } else {
          setEntries((prev) => [...prev, ...newEntries]);
        }

        setTotalCount(total);
        setHasMore(reset ? newEntries.length < total : currentOffset + newEntries.length < total);

        const newOffset = reset ? newEntries.length : offsetRef.current + newEntries.length;
        offsetRef.current = newOffset;
        setOffset(newOffset);
      } catch (e: any) {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [buildUrl, toast]
  );

  // Load available modules and actions from audit-logs API
  const loadFilterOptions = useCallback(async () => {
    try {
      const res = await apiFetch("/api/audit-logs?limit=1&offset=0");
      if (res.modules) setAvailableModules(res.modules);
      if (res.actions) setAvailableActions(res.actions);
    } catch (e) { console.error("Failed to load audit log filter options:", e); }
  }, []);

  // reload on filter change
  useEffect(() => {
    loadEntries(true);
  }, [appliedFilters]);

  useEffect(() => {
    loadFilterOptions();
  }, [loadFilterOptions]);

  // ─── Infinite scroll via IntersectionObserver ───
  useEffect(() => {
    if (!sentinelRef.current) return;

    const observer = new IntersectionObserver(
      (observerEntries) => {
        if (observerEntries[0]?.isIntersecting && hasMore && !loading && !loadingMore) {
          loadEntries(false);
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, loadEntries]);

  // ============================================================
  // COMPUTED STATISTICS
  // ============================================================

  const stats = useMemo(() => {
    const actionCounts: Record<string, number> = {};
    const userActivity: Record<string, number> = {};
    const moduleActivity: Record<string, number> = {};
    const ipMap: Record<string, { firstSeen: Date; lastSeen: Date; users: Set<string> }> = {};
    const loginHistory: any[] = [];

    for (const entry of entries) {
      const action = (entry.action || "UNKNOWN").toUpperCase();
      actionCounts[action] = (actionCounts[action] || 0) + 1;

      const userName = entry.userName || "System";
      userActivity[userName] = (userActivity[userName] || 0) + 1;

      const mod = entry.module || "Unknown";
      moduleActivity[mod] = (moduleActivity[mod] || 0) + 1;

      if (entry.ip) {
        const ip = entry.ip;
        const entryDate = new Date(entry.createdAt);
        if (!ipMap[ip]) {
          ipMap[ip] = { firstSeen: entryDate, lastSeen: entryDate, users: new Set() };
        } else {
          if (entryDate < ipMap[ip].firstSeen) ipMap[ip].firstSeen = entryDate;
          if (entryDate > ipMap[ip].lastSeen) ipMap[ip].lastSeen = entryDate;
        }
        ipMap[ip].users.add(userName);
      }

      if (action === "LOGIN") {
        loginHistory.push(entry);
      }
    }

    const sortedUsers = Object.entries(userActivity)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);

    const sortedModules = Object.entries(moduleActivity)
      .sort(([, a], [, b]) => b - a);

    const maxModuleCount = sortedModules.length > 0 ? sortedModules[0][1] : 1;

    const ipHistory = Object.entries(ipMap)
      .map(([ip, data]) => ({
        ip,
        firstSeen: data.firstSeen,
        lastSeen: data.lastSeen,
        users: Array.from(data.users),
        userCount: data.users.size,
      }))
      .sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime())
      .slice(0, 20);

    const maxActionCount = Math.max(...Object.values(actionCounts), 1);

    // Integrity score: ratio of CREATE vs DELETE actions
    const createCount = actionCounts["CREATE"] || 0;
    const deleteCount = actionCounts["DELETE"] || 0;
    const totalActions = Object.values(actionCounts).reduce((a, b) => a + b, 0);
    let integrityScore = 100;
    if (totalActions > 0) {
      const deleteRatio = deleteCount / totalActions;
      integrityScore = Math.max(0, Math.min(100, Math.round(100 - deleteRatio * 200)));
    }

    return {
      totalEntries: entries.length,
      totalInDB: totalCount,
      actionCounts,
      sortedUsers,
      sortedModules,
      maxModuleCount,
      maxActionCount,
      ipHistory,
      loginHistory: loginHistory.slice(0, 20),
      integrityScore,
      createCount,
      deleteCount,
    };
  }, [entries, totalCount]);

  // ============================================================
  // FILTER HANDLERS
  // ============================================================

  const handleApplyFilters = () => {
    setAppliedFilters({
      module: filterModule === "all" ? "" : filterModule,
      action: filterAction === "all" ? "" : filterAction,
      dateFrom: filterDateFrom,
      dateTo: filterDateTo,
      userSearch: filterUserSearch.trim(),
      recordSearch: filterRecordSearch.trim(),
    });
  };

  const handleResetFilters = () => {
    setFilterModule("all");
    setFilterAction("all");
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterUserSearch("");
    setFilterRecordSearch("");
    setAppliedFilters({
      module: "",
      action: "",
      dateFrom: "",
      dateTo: "",
      userSearch: "",
      recordSearch: "",
    });
  };

  // ============================================================
  // EXPAND/COLLAPSE DETAILS
  // ============================================================

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // ============================================================
  // EXPORT HANDLERS
  // ============================================================

  const exportColumns: ExportColumnDef[] = [
    { key: "action", label: "Action", type: "text" },
    { key: "module", label: "Module", type: "text" },
    { key: "recordLabel", label: "Record", type: "text" },
    { key: "userName", label: "User", type: "text" },
    { key: "ip", label: "IP Address", type: "text" },
    { key: "details", label: "Details", type: "text" },
    { key: "createdAt", label: "Timestamp", type: "date" },
  ];

  const handleExportCSV = () => {
    try {
      const maskedKeys = isVatAuditor
        ? getVatMaskedKeys(exportColumns, ["details"])
        : [];
      exportToCSV({
        title: "Audit Trail",
        columns: exportColumns,
        data: entries,
        isVatAuditor,
        vatMaskedColumns: maskedKeys,
        filename: "audit-trail",
      });
      toast({ title: "Exported", description: "Audit Trail exported to CSV" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleExportPDF = () => {
    try {
      const maskedKeys = isVatAuditor
        ? getVatMaskedKeys(exportColumns, ["details"])
        : [];
      const userName = authUser?.displayName || authUser?.name || "";
      exportAuditReportPDF({
        title: "Forensic Audit Trail Report",
        subtitle: `${totalCount} entries${isVatAuditor ? " \u2014 VAT Audit Mode" : ""}`,
        columns: exportColumns,
        data: entries,
        isVatAuditor,
        vatMaskedColumns: maskedKeys,
        integrityScore: stats.integrityScore,
        company: companyProfile || undefined,
        financialFooter: {
          preparedBy: userName,
          checkedBy: "",
          authorizedBy: "",
          printedBy: userName || "System",
        },
        classification: "CONFIDENTIAL",
      });
      toast({ title: "Exported", description: "Audit Trail exported to PDF" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleImportCSV = async () => {
    try {
      const result = await importFromCSV({
        apiPath: "/api/audit-logs?import=true",
        formFields: [
          { key: "action", label: "Action", type: "text", required: true },
          { key: "module", label: "Module", type: "text", required: true },
          { key: "details", label: "Details", type: "text" },
        ],
      });
      if (result.imported > 0) {
        toast({ title: "Import Complete", description: `${result.imported} reference entries imported, ${result.failed} failed` });
        loadEntries(true);
      } else if (result.errors.length > 0) {
        toast({ title: "Import Failed", description: result.errors[0], variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Import Error", description: e.message, variant: "destructive" });
    }
  };

  // ============================================================
  // VAT AUDITOR DETAILS MASKING
  // ============================================================

  const maskDetailsIfVat = (details: string | null | undefined): string => {
    if (!details) return "\u2014";
    return details;
  };

  // ============================================================
  // 403 FORBIDDEN PAGE
  // ============================================================

  if (isSR || isDealer) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Card className="max-w-md w-full border-red-300 dark:border-red-800">
          <CardContent className="p-8 text-center">
            <Shield className="w-12 h-12 mx-auto mb-4 text-red-500" />
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              403 - Access Denied
            </h3>
            <p className="text-muted-foreground">
              You do not have permission to access Audit Trail Viewer. Contact your
              administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ============================================================
  // RENDER: DIFF DISPLAY
  // ============================================================

  const renderDiff = (before: Record<string, any> | null, after: Record<string, any> | null) => {
    const allKeys = new Set<string>();
    if (before) Object.keys(before).forEach((k) => allKeys.add(k));
    if (after) Object.keys(after).forEach((k) => allKeys.add(k));

    if (allKeys.size === 0) return null;

    return (
      <div className="mt-2 space-y-1">
        {Array.from(allKeys).sort().map((key) => {
          const oldVal = before?.[key];
          const newVal = after?.[key];
          const isChanged = JSON.stringify(oldVal) !== JSON.stringify(newVal);
          const isAdded = before && !Object.prototype.hasOwnProperty.call(before, key);
          const isRemoved = after && !Object.prototype.hasOwnProperty.call(after, key);

          // VAT auditor masking
          const lowerKey = key.toLowerCase();
          const isProfitField = [
            "profit", "margin", "costprice", "wholesaleprice", "dealerprice",
            "writeoff", "profitmargin", "grossprofit", "netprofit",
          ].some((pk) => lowerKey.includes(pk));

          const displayOld = isVatAuditor && isProfitField ? "N/A (Audit Mode)" : String(oldVal ?? "\u2014");
          const displayNew = isVatAuditor && isProfitField ? "N/A (Audit Mode)" : String(newVal ?? "\u2014");

          return (
            <div
              key={key}
              className={`flex items-start gap-2 text-xs py-1 px-2 rounded ${
                isRemoved
                  ? "bg-red-50 dark:bg-red-900/10"
                  : isAdded
                  ? "bg-green-50 dark:bg-green-900/10"
                  : isChanged
                  ? "bg-amber-50 dark:bg-amber-900/10"
                  : "bg-transparent"
              }`}
            >
              <span className="font-mono font-semibold text-slate-600 dark:text-slate-400 min-w-[120px] shrink-0">
                {key}:
              </span>
              {isChanged && !isAdded && !isRemoved ? (
                <>
                  <span className="text-red-600 dark:text-red-400 line-through">
                    {displayOld}
                  </span>
                  <ChevronRight className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                  <span className="text-green-600 dark:text-green-400 font-medium">
                    {displayNew}
                  </span>
                </>
              ) : isAdded ? (
                <span className="text-green-600 dark:text-green-400 font-medium">
                  + {displayNew}
                </span>
              ) : isRemoved ? (
                <span className="text-red-600 dark:text-red-400 line-through">
                  - {displayOld}
                </span>
              ) : (
                <span className="text-slate-600 dark:text-slate-400">{displayNew}</span>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // ============================================================
  // RENDER: TIMELINE ENTRY
  // ============================================================

  const renderTimelineEntry = (entry: any, idx: number) => {
    const entryId = entry.id || `entry-${idx}`;
    const isExpanded = expandedIds.has(entryId);
    const action = (entry.action || "UNKNOWN").toUpperCase();
    const dotColor = getDotColor(action);
    const dotRing = getDotRing(action);
    const badgeClass = getBadgeClass(action);
    const ActionIcon = ACTION_ICON[action] || Activity;

    // Parse the details JSON to extract before/after
    const parsed = parseDetails(entry.details);
    const maskedDetails = maskDetailsIfVat(entry.details);
    const hasBeforeAfter = parsed.before || parsed.after;

    return (
      <div key={entryId} className="relative pl-14 pb-6 group">
        {/* Timeline Dot */}
        <div
          className={`absolute left-3.5 top-1.5 w-4 h-4 rounded-full ring-4 ${dotColor} ${dotRing} ring-opacity-30 transition-transform group-hover:scale-125`}
        />

        {/* Entry Card */}
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            {/* Entry Header */}
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Action Badge */}
                <Badge className={`${badgeClass} font-semibold flex items-center gap-1`}>
                  <ActionIcon className="w-3 h-3" />
                  {action}
                </Badge>

                {/* Module */}
                <span className="text-sm font-medium text-slate-900 dark:text-white">
                  {entry.module || "\u2014"}
                </span>

                {/* Record Label */}
                {entry.recordLabel && (
                  <>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm text-[#2563eb] dark:text-blue-400 font-medium cursor-pointer hover:underline">
                      {entry.recordLabel}
                    </span>
                  </>
                )}
              </div>

              {/* Timestamp */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                <Clock className="w-3.5 h-3.5" />
                <span title={fmtDate(entry.createdAt)}>
                  {entry.timeAgo || fmtDate(entry.createdAt)}
                </span>
              </div>
            </div>

            {/* User Row & IP */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <div className="w-6 h-6 rounded-full bg-[#132240] dark:bg-[#0a1628] flex items-center justify-center">
                <span className="text-[10px] font-bold text-white">
                  {(entry.userName || "?").charAt(0).toUpperCase()}
                </span>
              </div>
              <span className="text-sm text-slate-900 dark:text-white">
                {entry.userName || "System"}
              </span>
              {entry.ip && (
                <>
                  <span className="text-slate-300 dark:text-slate-600">|</span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Globe className="w-3 h-3" />
                    {entry.ip}
                  </span>
                </>
              )}
              <span className="text-xs text-muted-foreground">
                {fmtDate(entry.createdAt)}
              </span>
            </div>

            {/* Details Preview (truncated) */}
            {parsed.rawText && !hasBeforeAfter && (
              <div className="mt-2">
                <p
                  className={`text-xs text-muted-foreground ${
                    !isExpanded ? "line-clamp-2" : ""
                  }`}
                >
                  {isExpanded ? parsed.rawText : parsed.rawText.slice(0, 150)}
                  {!isExpanded && parsed.rawText.length > 150 ? "..." : ""}
                </p>
              </div>
            )}

            {/* Before/After summary for unexpanded state */}
            {hasBeforeAfter && !isExpanded && (
              <div className="mt-2 text-xs text-muted-foreground">
                {parsed.before && parsed.after
                  ? "Transaction state change detected \u2014 expand to view diff"
                  : parsed.before
                  ? "Previous state recorded \u2014 expand to view"
                  : "New state recorded \u2014 expand to view"}
              </div>
            )}

            {/* Expandable Details */}
            {(hasBeforeAfter || (maskedDetails && maskedDetails.length > 150)) && (
              <div className="mt-2">
                <button
                  onClick={() => toggleExpand(entryId)}
                  className="flex items-center gap-1 text-xs text-[#2563eb] hover:text-[#1d4ed8] dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                >
                  {isExpanded ? (
                    <>
                      <ChevronUp className="w-3.5 h-3.5" /> Hide Details
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-3.5 h-3.5" /> Show Details
                    </>
                  )}
                </button>

                {isExpanded && (
                  <div className="mt-3 space-y-3">
                    {/* Full raw text if available */}
                    {parsed.rawText && hasBeforeAfter && (
                      <p className="text-xs text-muted-foreground italic">
                        {parsed.rawText}
                      </p>
                    )}

                    {/* Diff Display */}
                    {hasBeforeAfter && (
                      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                        <div className="bg-slate-50 dark:bg-slate-800/50 px-3 py-1.5 border-b border-slate-200 dark:border-slate-700">
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            State Diff
                          </span>
                        </div>
                        <div className="p-3 max-h-96 overflow-y-auto">
                          {renderDiff(
                            isVatAuditor && parsed.before && containsProfitData(parsed.before)
                              ? maskProfitFields(parsed.before)
                              : parsed.before,
                            isVatAuditor && parsed.after && containsProfitData(parsed.after)
                              ? maskProfitFields(parsed.after)
                              : parsed.after
                          )}
                        </div>
                      </div>
                    )}

                    {/* Raw Before/After blocks if no structured diff */}
                    {!hasBeforeAfter && maskedDetails && maskedDetails.length > 150 && (
                      <pre className="text-xs bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-md p-3 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap">
                        <code className="text-slate-700 dark:text-slate-300">
                          {maskedDetails}
                        </code>
                      </pre>
                    )}

                    {/* Full Before/After JSON for expanded structured data */}
                    {hasBeforeAfter && parsed.before && (
                      <div>
                        <p className="text-xs font-semibold text-slate-900 dark:text-white mb-1 flex items-center gap-1">
                          <EyeOff className="w-3 h-3 text-red-500" />
                          Before State:
                        </p>
                        <pre className="text-xs bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/50 rounded-md p-3 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap">
                          <code className="text-slate-700 dark:text-slate-300">
                            {JSON.stringify(
                              isVatAuditor && containsProfitData(parsed.before)
                                ? maskProfitFields(parsed.before)
                                : parsed.before,
                              null,
                              2
                            )}
                          </code>
                        </pre>
                      </div>
                    )}
                    {hasBeforeAfter && parsed.after && (
                      <div>
                        <p className="text-xs font-semibold text-slate-900 dark:text-white mb-1 flex items-center gap-1">
                          <Eye className="w-3 h-3 text-green-500" />
                          After State:
                        </p>
                        <pre className="text-xs bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/50 rounded-md p-3 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap">
                          <code className="text-slate-700 dark:text-slate-300">
                            {JSON.stringify(
                              isVatAuditor && containsProfitData(parsed.after)
                                ? maskProfitFields(parsed.after)
                                : parsed.after,
                              null,
                              2
                            )}
                          </code>
                        </pre>
                      </div>
                    )}

                    {/* IP & Record ID */}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t border-slate-100 dark:border-slate-800">
                      {entry.recordId && (
                        <span className="flex items-center gap-1">
                          <Hash className="w-3 h-3" />
                          Record: {entry.recordId}
                        </span>
                      )}
                      {entry.ip && (
                        <span className="flex items-center gap-1">
                          <Monitor className="w-3 h-3" />
                          IP: {entry.ip}
                        </span>
                      )}
                      {entry.userId && (
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          UserID: {entry.userId}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  // ============================================================
  // RENDER: ACTIVITY STATISTICS PANEL
  // ============================================================

  const renderStatisticsPanel = () => {
    if (loading && entries.length === 0) {
      return (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-[#2563eb] mb-3" />
          <p className="text-muted-foreground">Loading statistics...</p>
        </div>
      );
    }

    const actionTypes = ["CREATE", "UPDATE", "DELETE", "LOGIN", "LOGOUT", "EXPORT", "IMPORT"] as const;

    return (
      <div className="space-y-4">
        {/* Summary KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Entries</p>
                <p className="text-xl font-bold text-slate-900 dark:text-white">{stats.totalInDB}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
                <Plus className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Creates</p>
                <p className="text-xl font-bold text-slate-900 dark:text-white">{stats.createCount}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Deletes</p>
                <p className="text-xl font-bold text-slate-900 dark:text-white">{stats.deleteCount}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${
                stats.integrityScore >= 80
                  ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                  : stats.integrityScore >= 50
                  ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
                  : "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
              }`}>
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Integrity Score</p>
                <p className="text-xl font-bold text-slate-900 dark:text-white">{stats.integrityScore}/100</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Action Type Breakdown */}
        <Card>
          <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white rounded-t-lg">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Entries by Action Type
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-3">
              {actionTypes.map((action) => {
                const count = stats.actionCounts[action] || 0;
                const pct = stats.maxActionCount > 0 ? (count / stats.maxActionCount) * 100 : 0;
                const Icon = ACTION_ICON[action] || Activity;
                return (
                  <div key={action} className="flex items-center gap-3">
                    <div className="w-20 flex items-center gap-1.5 shrink-0">
                      <Icon className="w-3.5 h-3.5 text-slate-500" />
                      <span className="text-xs font-medium text-slate-900 dark:text-white">
                        {action}
                      </span>
                    </div>
                    <div className="flex-1 h-6 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden relative">
                      <div
                        className={`h-full rounded-full ${ACTION_BAR_COLOR[action] || "bg-slate-500"} transition-all duration-500`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-slate-900 dark:text-white min-w-[40px] text-right">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Most Active Users */}
          <Card>
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white rounded-t-lg">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="w-4 h-4" />
                Most Active Users
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {stats.sortedUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No user activity data</p>
              ) : (
                <div className="space-y-2">
                  {stats.sortedUsers.map(([userName, count], idx) => {
                    const maxUserCount = stats.sortedUsers[0][1];
                    const pct = maxUserCount > 0 ? (count / maxUserCount) * 100 : 0;
                    return (
                      <div key={userName} className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-[#132240] dark:bg-[#0a1628] flex items-center justify-center shrink-0">
                          <span className="text-[10px] font-bold text-white">
                            {idx + 1}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-sm text-slate-900 dark:text-white truncate">
                              {userName}
                            </span>
                            <span className="text-xs font-semibold text-slate-500 shrink-0 ml-2">
                              {count}
                            </span>
                          </div>
                          <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#2563eb] rounded-full transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Module Activity Heatmap */}
          <Card>
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white rounded-t-lg">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Module Activity Heatmap
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {stats.sortedModules.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No module activity data</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {stats.sortedModules.map(([moduleName, count]) => {
                    const pct = stats.maxModuleCount > 0 ? (count / stats.maxModuleCount) * 100 : 0;
                    // Heatmap color: green=low, yellow=mid, red=high
                    const heatColor =
                      pct > 75
                        ? "bg-red-500"
                        : pct > 50
                        ? "bg-amber-500"
                        : pct > 25
                        ? "bg-yellow-500"
                        : "bg-green-500";
                    return (
                      <div key={moduleName} className="flex items-center gap-3">
                        <span className="text-xs font-medium text-slate-900 dark:text-white min-w-[100px] truncate">
                          {moduleName}
                        </span>
                        <div className="flex-1 h-5 bg-slate-100 dark:bg-slate-800 rounded overflow-hidden relative">
                          <div
                            className={`h-full ${heatColor} rounded transition-all duration-500`}
                            style={{ width: `${pct}%` }}
                          />
                          <span className="absolute inset-0 flex items-center justify-end pr-2 text-[10px] font-bold text-white mix-blend-difference">
                            {count}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Login History */}
        <Card>
          <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white rounded-t-lg">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <LogIn className="w-4 h-4" />
              Recent Login History
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {stats.loginHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No login events recorded</p>
            ) : (
              <div className="max-h-64 overflow-x-auto overflow-y-auto -mx-2 sm:mx-0">
                <Table className="min-w-[600px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">User</TableHead>
                      <TableHead className="text-xs">IP Address</TableHead>
                      <TableHead className="text-xs">Timestamp</TableHead>
                      <TableHead className="text-xs">Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.loginHistory.map((entry: any, idx: number) => (
                      <TableRow key={entry.id || idx}>
                        <TableCell className="text-xs font-medium text-slate-900 dark:text-white">
                          {entry.userName || "System"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {entry.ip || "\u2014"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {fmtDate(entry.createdAt)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                          {maskDetailsIfVat(entry.details)}
                        </TableCell>
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
  // RENDER: IP HISTORY PANEL
  // ============================================================

  const renderIPHistoryPanel = () => {
    if (loading && entries.length === 0) {
      return (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-[#2563eb] mb-3" />
          <p className="text-muted-foreground">Loading IP history...</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* IP Summary KPI */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Unique IPs</p>
                <p className="text-xl font-bold text-slate-900 dark:text-white">
                  {stats.ipHistory.length}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">IPs Active (24h)</p>
                <p className="text-xl font-bold text-slate-900 dark:text-white">
                  {stats.ipHistory.filter((ip) => {
                    const diff = Date.now() - ip.lastSeen.getTime();
                    return diff < 24 * 60 * 60 * 1000; // within 24h
                  }).length}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Multi-User IPs</p>
                <p className="text-xl font-bold text-slate-900 dark:text-white">
                  {stats.ipHistory.filter((ip) => ip.userCount > 1).length}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* IP History Table */}
        <Card>
          <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white rounded-t-lg">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Monitor className="w-4 h-4" />
              IP Address History
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {stats.ipHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No IP address data available in the current entries
              </p>
            ) : (
              <div className="max-h-[500px] overflow-x-auto overflow-y-auto">
                <Table className="min-w-[600px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">IP Address</TableHead>
                      <TableHead className="text-xs">First Seen</TableHead>
                      <TableHead className="text-xs">Last Seen</TableHead>
                      <TableHead className="text-xs">Associated Users</TableHead>
                      <TableHead className="text-xs text-right">User Count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.ipHistory.map((ipData) => (
                      <TableRow key={ipData.ip}>
                        <TableCell className="text-xs font-mono font-medium text-slate-900 dark:text-white">
                          <div className="flex items-center gap-1.5">
                            <Globe className="w-3 h-3 text-muted-foreground" />
                            {ipData.ip}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {fmtDateShort(ipData.firstSeen)}
                          <br />
                          <span className="text-[10px]">{fmtTime(ipData.firstSeen)}</span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {fmtDateShort(ipData.lastSeen)}
                          <br />
                          <span className="text-[10px]">{fmtTime(ipData.lastSeen)}</span>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {ipData.users.slice(0, 3).map((user) => (
                              <Badge key={user} variant="secondary" className="text-[10px] px-1 py-0">
                                {user}
                              </Badge>
                            ))}
                            {ipData.users.length > 3 && (
                              <Badge variant="secondary" className="text-[10px] px-1 py-0">
                                +{ipData.users.length - 3}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-right font-semibold text-slate-900 dark:text-white">
                          {ipData.userCount}
                        </TableCell>
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
    <div className="page-enter space-y-4">
      {/* VAT Auditor Mode Badge */}
      {isVatAuditor && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg mb-4">
          <Badge className="bg-amber-500 text-white">VAT AUDIT MODE</Badge>
          <span className="text-sm text-amber-700 dark:text-amber-400">
            Profit/margin/cost details masked for audit compliance.
          </span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Activity className="w-6 h-6 text-[#2563eb]" />
            Forensic Audit Trail Viewer
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Chronological timeline of all system activities and changes
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => loadEntries(true)}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="w-4 h-4 mr-1" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF}>
            <FileDown className="w-4 h-4 mr-1" />
            Export PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handleImportCSV}>
            <Upload className="w-4 h-4 mr-1" />
            Import CSV
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <Card className="mb-4">
        <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white rounded-t-lg">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            {/* Module Select */}
            <div className="space-y-1.5">
              <Label className="text-slate-900 dark:text-white text-xs">Module</Label>
              <Select value={filterModule} onValueChange={setFilterModule}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All Modules" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Modules</SelectItem>
                  {availableModules.map((mod) => (
                    <SelectItem key={mod} value={mod}>
                      {mod}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Action Select */}
            <div className="space-y-1.5">
              <Label className="text-slate-900 dark:text-white text-xs">Action</Label>
              <Select value={filterAction} onValueChange={setFilterAction}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All Actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  {availableActions.length > 0
                    ? availableActions.map((act) => (
                        <SelectItem key={act} value={act}>
                          {act}
                        </SelectItem>
                      ))
                    : ["CREATE", "UPDATE", "DELETE", "LOGIN", "LOGOUT", "EXPORT", "IMPORT"].map(
                        (act) => (
                          <SelectItem key={act} value={act}>
                            {act}
                          </SelectItem>
                        )
                      )}
                </SelectContent>
              </Select>
            </div>

            {/* Date From */}
            <div className="space-y-1.5">
              <Label className="text-slate-900 dark:text-white text-xs">Date From</Label>
              <Input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="w-full"
              />
            </div>

            {/* Date To */}
            <div className="space-y-1.5">
              <Label className="text-slate-900 dark:text-white text-xs">Date To</Label>
              <Input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="w-full"
              />
            </div>

            {/* User Search */}
            <div className="space-y-1.5">
              <Label className="text-slate-900 dark:text-white text-xs">User Search</Label>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search users..."
                  value={filterUserSearch}
                  onChange={(e) => setFilterUserSearch(e.target.value)}
                  className="pl-10 w-full"
                />
              </div>
            </div>

            {/* Record Search */}
            <div className="space-y-1.5">
              <Label className="text-slate-900 dark:text-white text-xs">Record Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search records..."
                  value={filterRecordSearch}
                  onChange={(e) => setFilterRecordSearch(e.target.value)}
                  className="pl-10 w-full"
                />
              </div>
            </div>

            {/* Buttons */}
            <div className="space-y-1.5">
              <Label className="text-transparent text-xs select-none">Actions</Label>
              <div className="flex gap-2">
                <Button
                  className="bg-[#2563eb] hover:bg-[#1d4ed8] flex-1"
                  size="sm"
                  onClick={handleApplyFilters}
                >
                  Apply
                </Button>
                <Button variant="outline" size="sm" onClick={handleResetFilters}>
                  <RotateCcw className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Active Filters Summary */}
          {(appliedFilters.module ||
            appliedFilters.action ||
            appliedFilters.dateFrom ||
            appliedFilters.dateTo ||
            appliedFilters.userSearch ||
            appliedFilters.recordSearch) && (
            <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t">
              <span className="text-xs text-muted-foreground">Active:</span>
              {appliedFilters.module && (
                <Badge variant="secondary" className="text-xs">
                  Module: {appliedFilters.module}
                </Badge>
              )}
              {appliedFilters.action && (
                <Badge variant="secondary" className="text-xs">
                  Action: {appliedFilters.action}
                </Badge>
              )}
              {appliedFilters.dateFrom && (
                <Badge variant="secondary" className="text-xs">
                  From: {appliedFilters.dateFrom}
                </Badge>
              )}
              {appliedFilters.dateTo && (
                <Badge variant="secondary" className="text-xs">
                  To: {appliedFilters.dateTo}
                </Badge>
              )}
              {appliedFilters.userSearch && (
                <Badge variant="secondary" className="text-xs">
                  User: &quot;{appliedFilters.userSearch}&quot;
                </Badge>
              )}
              {appliedFilters.recordSearch && (
                <Badge variant="secondary" className="text-xs">
                  Record: &quot;{appliedFilters.recordSearch}&quot;
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results Summary */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-muted-foreground">
          Showing{" "}
          <span className="font-semibold text-slate-900 dark:text-white">
            {entries.length}
          </span>{" "}
          of{" "}
          <span className="font-semibold text-slate-900 dark:text-white">
            {totalCount}
          </span>{" "}
          entries
        </p>
        {isVatAuditor && (
          <Badge className="bg-amber-500 text-white flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            VAT AUDIT MODE
          </Badge>
        )}
      </div>

      {/* Tabbed Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="timeline" className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Timeline
          </TabsTrigger>
          <TabsTrigger value="statistics" className="flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" />
            Statistics
          </TabsTrigger>
          <TabsTrigger value="ip-history" className="flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5" />
            IP History
          </TabsTrigger>
        </TabsList>

        {/* ─── Timeline Tab ─── */}
        <TabsContent value="timeline">
          {loading && entries.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto text-[#2563eb] mb-3" />
                <p className="text-muted-foreground">Loading audit trail...</p>
              </div>
            </div>
          ) : entries.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
                  No Audit Entries Found
                </h3>
                <p className="text-muted-foreground text-sm">
                  {appliedFilters.module ||
                  appliedFilters.action ||
                  appliedFilters.dateFrom ||
                  appliedFilters.dateTo ||
                  appliedFilters.userSearch ||
                  appliedFilters.recordSearch
                    ? "Try adjusting your filters to see more results."
                    : "No audit trail entries exist in the system yet."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="relative">
              {/* Vertical Timeline Line */}
              <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-700" />

              <div className="space-y-0">
                {entries.map((entry: any, idx: number) => renderTimelineEntry(entry, idx))}
              </div>

              {/* Load More / Infinite Scroll Sentinel */}
              <div ref={sentinelRef} className="py-4" />

              {/* Load More Button (fallback) */}
              {hasMore && !loading && (
                <div className="flex justify-center py-4">
                  <Button
                    variant="outline"
                    onClick={() => loadEntries(false)}
                    disabled={loadingMore}
                    className="min-w-[200px]"
                  >
                    {loadingMore ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Loading More...
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4 mr-2" />
                        Load More ({totalCount - entries.length} remaining)
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* End of Results */}
              {!hasMore && entries.length > 0 && (
                <div className="text-center py-4 text-sm text-muted-foreground">
                  \u2014 End of audit trail \u2014
                </div>
              )}

              {/* Loading more indicator */}
              {loadingMore && (
                <div className="flex items-center justify-center py-4">
                  <RefreshCw className="w-5 h-5 animate-spin text-[#2563eb] mr-2" />
                  <span className="text-sm text-muted-foreground">
                    Loading more entries...
                  </span>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* ─── Statistics Tab ─── */}
        <TabsContent value="statistics">
          {renderStatisticsPanel()}
        </TabsContent>

        {/* ─── IP History Tab ─── */}
        <TabsContent value="ip-history">
          {renderIPHistoryPanel()}
        </TabsContent>
      </Tabs>
    </div>
  );
}
