"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Shield, ShieldCheck, Clock, Search, RefreshCw, Download,
  FileDown, Filter, ChevronDown, ChevronUp, RotateCcw,
  Activity, Eye, EyeOff, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "next-themes";
import { exportToCSV, exportToPDF, isVatMasked } from "@/lib/export-utils";
import type { ColumnDef as ExportColumnDef } from "@/lib/export-utils";

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
// AUTH TYPES
// ============================================================

type UserRole = "admin" | "manager" | "sr" | "dealer" | "vat_auditor";

interface AuthUser {
  name: string;
  email: string;
  role: UserRole;
  displayName: string;
}

// ============================================================
// ACTION COLOR HELPERS
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
// AUDIT TRAIL VIEWER COMPONENT
// ============================================================

export default function AuditTrailViewer() {
  const { toast } = useToast();
  const { resolvedTheme } = useTheme();

  // ─── Auth State ───
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const isVatAuditor = authUser?.role === "vat_auditor";
  const isSR = authUser?.role === "sr";
  const isDealer = authUser?.role === "dealer";

  useEffect(() => {
    try {
      const stored = localStorage.getItem("ems_auth");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.user) setAuthUser(parsed.user);
      }
    } catch {}
  }, []);

  // ─── Data State ───
  const [entries, setEntries] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  // ─── Expanded Details State ───
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // ─── Filter State ───
  const [filterModule, setFilterModule] = useState<string>("all");
  const [filterAction, setFilterAction] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterSearch, setFilterSearch] = useState("");

  // Applied filters (only update on Apply click)
  const [appliedFilters, setAppliedFilters] = useState({
    module: "",
    action: "",
    dateFrom: "",
    dateTo: "",
    search: "",
  });

  // ─── Available modules (derived from data) ───
  const [availableModules, setAvailableModules] = useState<string[]>([]);

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
      if (appliedFilters.search) params.set("search", appliedFilters.search);

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

        // Collect unique modules
        const modules = new Set<string>();
        newEntries.forEach((e: any) => {
          if (e.module) modules.add(e.module);
        });
        if (reset) {
          setAvailableModules(Array.from(modules).sort());
        } else {
          setAvailableModules((prev) => {
            const merged = new Set(prev);
            modules.forEach((m) => merged.add(m));
            return Array.from(merged).sort();
          });
        }
      } catch (e: any) {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [buildUrl, toast]
  );

  // Initial load + reload on filter change
  useEffect(() => {
    loadEntries(true);
  }, [appliedFilters]);

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
  // FILTER HANDLERS
  // ============================================================

  const handleApplyFilters = () => {
    setAppliedFilters({
      module: filterModule === "all" ? "" : filterModule,
      action: filterAction === "all" ? "" : filterAction,
      dateFrom: filterDateFrom,
      dateTo: filterDateTo,
      search: filterSearch.trim(),
    });
  };

  const handleResetFilters = () => {
    setFilterModule("all");
    setFilterAction("all");
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterSearch("");
    setAppliedFilters({
      module: "",
      action: "",
      dateFrom: "",
      dateTo: "",
      search: "",
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
    { key: "details", label: "Details", type: "text" },
    { key: "createdAt", label: "Timestamp", type: "date" },
    { key: "timeAgo", label: "Relative Time", type: "text" },
  ];

  const handleExportCSV = () => {
    try {
      const maskedKeys = isVatAuditor
        ? exportColumns.filter((c) => isVatMasked(c.key, ["details"])).map((c) => c.key)
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
        ? exportColumns.filter((c) => isVatMasked(c.key, ["details"])).map((c) => c.key)
        : [];
      exportToPDF({
        title: "Audit Trail Report",
        subtitle: `${entries.length} entries${isVatAuditor ? " — VAT Audit Mode" : ""}`,
        orientation: "landscape",
        columns: exportColumns,
        data: entries,
        isVatAuditor,
        vatMaskedColumns: maskedKeys,
        filename: "audit-trail",
      });
      toast({ title: "Exported", description: "Audit Trail exported to PDF" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // ============================================================
  // VAT AUDITOR DETAILS MASKING
  // ============================================================

  const maskDetailsIfVat = (details: string | null | undefined): string => {
    if (!details) return "—";
    if (isVatAuditor) {
      const lower = details.toLowerCase();
      if (
        lower.includes("profit") ||
        lower.includes("margin") ||
        lower.includes("cost") ||
        lower.includes("writeoff") ||
        lower.includes("costprice") ||
        lower.includes("wholesaleprice") ||
        lower.includes("dealerprice")
      ) {
        return "N/A (Audit Mode)";
      }
    }
    return details;
  };

  // ============================================================
  // 403 FORBIDDEN PAGE
  // ============================================================

  if (isSR || isDealer) {
    return (
      <div className="flex items-center justify-center min-h-screen">
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
  // RENDER
  // ============================================================

  return (
    <div className="min-h-screen overflow-y-auto">
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
            Audit Trail Viewer
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
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
                  <SelectItem value="CREATE">CREATE</SelectItem>
                  <SelectItem value="UPDATE">UPDATE</SelectItem>
                  <SelectItem value="DELETE">DELETE</SelectItem>
                  <SelectItem value="LOGIN">LOGIN</SelectItem>
                  <SelectItem value="LOGOUT">LOGOUT</SelectItem>
                  <SelectItem value="EXPORT">EXPORT</SelectItem>
                  <SelectItem value="IMPORT">IMPORT</SelectItem>
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

            {/* Search */}
            <div className="space-y-1.5">
              <Label className="text-slate-900 dark:text-white text-xs">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Fuzzy search..."
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
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
                  Apply Filters
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
            appliedFilters.search) && (
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
              {appliedFilters.search && (
                <Badge variant="secondary" className="text-xs">
                  Search: &quot;{appliedFilters.search}&quot;
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

      {/* Loading State (initial) */}
      {loading && entries.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-[#2563eb] mb-3" />
            <p className="text-muted-foreground">Loading audit trail...</p>
          </div>
        </div>
      ) : entries.length === 0 ? (
        /* Empty State */
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
              appliedFilters.search
                ? "Try adjusting your filters to see more results."
                : "No audit trail entries exist in the system yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        /* Timeline View */
        <div className="relative">
          {/* Vertical Timeline Line */}
          <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-700" />

          <div className="space-y-0">
            {entries.map((entry: any, idx: number) => {
              const entryId = entry.id || `entry-${idx}`;
              const isExpanded = expandedIds.has(entryId);
              const action = (entry.action || "UNKNOWN").toUpperCase();
              const dotColor = getDotColor(action);
              const dotRing = getDotRing(action);
              const badgeClass = getBadgeClass(action);
              const maskedDetails = maskDetailsIfVat(entry.details);
              const hasBeforeAfter =
                entry.beforeData || entry.afterData;

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
                          <Badge className={`${badgeClass} font-semibold`}>
                            {action}
                          </Badge>

                          {/* Module */}
                          <span className="text-sm font-medium text-slate-900 dark:text-white">
                            {entry.module || "—"}
                          </span>

                          {/* Record Label */}
                          {entry.recordLabel && (
                            <>
                              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-sm text-muted-foreground">
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

                      {/* User Row */}
                      <div className="flex items-center gap-2 mt-2">
                        <div className="w-6 h-6 rounded-full bg-[#132240] dark:bg-[#0a1628] flex items-center justify-center">
                          <span className="text-[10px] font-bold text-white">
                            {(entry.userName || "?").charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <span className="text-sm text-slate-900 dark:text-white">
                          {entry.userName || "System"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {fmtDate(entry.createdAt)}
                        </span>
                      </div>

                      {/* Details Preview (truncated) */}
                      {maskedDetails && maskedDetails !== "—" && (
                        <div className="mt-2">
                          <p
                            className={`text-xs text-muted-foreground ${
                              !isExpanded ? "line-clamp-2" : ""
                            }`}
                          >
                            {isExpanded ? maskedDetails : maskedDetails.slice(0, 150)}
                            {!isExpanded && maskedDetails.length > 150 ? "..." : ""}
                          </p>
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
                              {/* Before Data */}
                              {entry.beforeData && (
                                <div>
                                  <p className="text-xs font-semibold text-slate-900 dark:text-white mb-1 flex items-center gap-1">
                                    <EyeOff className="w-3 h-3 text-red-500" />
                                    Before:
                                  </p>
                                  <pre className="text-xs bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/50 rounded-md p-3 overflow-x-auto max-h-48 overflow-y-auto">
                                    <code className="text-slate-700 dark:text-slate-300">
                                      {typeof entry.beforeData === "string"
                                        ? entry.beforeData
                                        : JSON.stringify(entry.beforeData, null, 2)}
                                    </code>
                                  </pre>
                                </div>
                              )}

                              {/* After Data */}
                              {entry.afterData && (
                                <div>
                                  <p className="text-xs font-semibold text-slate-900 dark:text-white mb-1 flex items-center gap-1">
                                    <Eye className="w-3 h-3 text-green-500" />
                                    After:
                                  </p>
                                  <pre className="text-xs bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/50 rounded-md p-3 overflow-x-auto max-h-48 overflow-y-auto">
                                    <code className="text-slate-700 dark:text-slate-300">
                                      {isVatAuditor && containsProfitData(entry.afterData)
                                        ? "N/A (Audit Mode)"
                                        : typeof entry.afterData === "string"
                                        ? entry.afterData
                                        : JSON.stringify(entry.afterData, null, 2)}
                                    </code>
                                  </pre>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              );
            })}
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
              — End of audit trail —
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
    </div>
  );
}

// ============================================================
// HELPER: Check if data contains profit-related info
// ============================================================

function containsProfitData(data: any): boolean {
  if (!data) return false;
  const str = typeof data === "string" ? data : JSON.stringify(data);
  const lower = str.toLowerCase();
  return (
    lower.includes("profit") ||
    lower.includes("margin") ||
    lower.includes("cost") ||
    lower.includes("costprice") ||
    lower.includes("wholesaleprice") ||
    lower.includes("dealerprice")
  );
}

// ============================================================
// HELPER: ChevronRight icon (inline to avoid extra import issue)
// ============================================================

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className || "w-4 h-4"}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
